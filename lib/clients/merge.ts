import type { TClientMergeFieldChoices } from "@/schemas/clients";
import type { DB } from "@/services/drizzle";
import {
	aiAgentRuns,
	campaignConversions,
	campaignDispatchRecipients,
	campaignEvents,
	cashbackProgramBalances,
	cashbackProgramTransactions,
	chatAssignments,
	chatMessages,
	chatServices,
	chats,
	clientCustomFieldValues,
	clientDuplicateCandidates,
	clientLocations,
	clientMergeLogs,
	clientSellerReferences,
	clientTagReferences,
	clients,
	couponGrants,
	couponRedemptions,
	interactions,
	partners,
	poiTransactionRequests,
	productClientReferences,
	saleItems,
	sales,
	tabs,
} from "@/services/drizzle/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";

import { recomputeClientDerivedDataSafely } from "./recompute";

/**
 * Campos escalares elegíveis a reconciliação. Regra: o keeper vence; campos
 * vazios do keeper são preenchidos pela origem; `fieldChoices` força a origem
 * em conflitos escolhidos explicitamente na UI.
 *
 * Fora da regra base (ver o plano, §5.6):
 * - whatsappUserId — único parcial por organização; herdado só se o keeper está nulo.
 * - consentimentoMarketingData — NUNCA herda da origem (LGPD: nulo é ambíguo
 *   entre "nunca consentiu" e "revogou"; herdar ressuscitaria uma revogação).
 * - comunicacaoPausadaAte — greatest(keeper, origem): opt-out é restritivo.
 * - autorId/autorVendedorId — imutáveis por contrato; ficam no snapshot.
 */
const MERGEABLE_FIELDS = [
	"nome",
	"email",
	"telefone",
	"cpfCnpj",
	"inscricaoEstadual",
	"suframa",
	"anotacoes",
	"websiteUrl",
	"instagram",
	"linkedin",
	"twitter",
	"dataNascimento",
	"dataFundacao",
	"profissao",
	"ondeTrabalha",
	"estadoCivil",
	"deficiencia",
	"canalAquisicao",
	"idExterno",
	"localizacaoCep",
	"localizacaoEstado",
	"localizacaoCidade",
	"localizacaoBairro",
	"localizacaoLogradouro",
	"localizacaoNumero",
	"localizacaoComplemento",
	"localizacaoLatitude",
	"localizacaoLongitude",
] as const;

type TMergeableField = (typeof MERGEABLE_FIELDS)[number];

function isEmptyValue(value: unknown): boolean {
	return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export type TMergeClientsInput = {
	db: DB;
	organizacaoId: string;
	keeperId: string;
	sourceId: string;
	fieldChoices?: TClientMergeFieldChoices | null;
	autorId?: string | null;
	candidateId?: string | null;
	/**
	 * Recalcula os derivados do keeper logo após o commit (padrão). Lotes passam `false` e
	 * recalculam cada keeper uma vez no fim — o ranking produto × cliente é por produto e custa
	 * segundos por merge num catálogo de farmácia.
	 */
	recomputeKeeper?: boolean;
};

export type TMergeClientsResult = {
	keeperId: string;
	sourceId: string;
	registrosMovidos: Record<string, number>;
	saldosCashback: Record<string, { keeperAntes: number; origemAntes: number; keeperDepois: number }>;
	mergeLogId: string;
};

/**
 * Mescla o cliente de origem no keeper em UMA transação:
 * campos → colisões (chats/tags/campos personalizados) → consolidação de saldos
 * de cashback → re-apontamento de FKs → candidatos → log de auditoria → hard
 * delete da origem. Depois da transação, recomputa os derivados do keeper
 * (metadados de compra, RFM, vínculos de vendedor e produto) best-effort.
 *
 * A ordem importa: quase todas as FKs de cliente têm onDelete: cascade, então o
 * re-apontamento precisa acontecer ANTES do delete da origem.
 * Plano: docs/dev-planning/client-duplicate-reconciliation-plan.md, §5.
 */
export async function mergeClients(input: TMergeClientsInput): Promise<TMergeClientsResult> {
	if (input.keeperId === input.sourceId) throw new Error("Keeper e origem precisam ser clientes diferentes.");

	const result = await input.db.transaction(async (tx) => {
		// Trava ambos contra merges concorrentes (e contra edições durante o merge);
		// a existência é validada pelos fetches logo abaixo.
		await tx.execute(
			sql`SELECT id FROM ampmais_clients WHERE organizacao_id = ${input.organizacaoId} AND id IN (${input.keeperId}, ${input.sourceId}) FOR UPDATE`,
		);

		const keeper = await tx.query.clients.findFirst({ where: and(eq(clients.id, input.keeperId), eq(clients.organizacaoId, input.organizacaoId)) });
		const source = await tx.query.clients.findFirst({ where: and(eq(clients.id, input.sourceId), eq(clients.organizacaoId, input.organizacaoId)) });
		if (!keeper || !source) throw new Error("Cliente keeper ou de origem não encontrado.");

		// ── Snapshot integral da origem (recuperação manual pós-merge) ──────────
		const sourceTags = await tx.query.clientTagReferences.findMany({ where: eq(clientTagReferences.clienteId, source.id) });
		const sourceLocations = await tx.query.clientLocations.findMany({ where: eq(clientLocations.clienteId, source.id) });
		const sourceCustomFieldValues = await tx.query.clientCustomFieldValues.findMany({ where: eq(clientCustomFieldValues.clienteId, source.id) });
		const sourceBalances = await tx.query.cashbackProgramBalances.findMany({ where: eq(cashbackProgramBalances.clienteId, source.id) });
		const origemSnapshot: Record<string, unknown> = {
			cliente: source,
			tags: sourceTags,
			localizacoes: sourceLocations,
			camposPersonalizados: sourceCustomFieldValues,
			saldosCashback: sourceBalances,
		};

		// ── Reconciliação de campos no keeper ───────────────────────────────────
		const fieldUpdates: Partial<typeof clients.$inferInsert> = {};
		for (const field of MERGEABLE_FIELDS) {
			const choice = input.fieldChoices?.[field];
			const keeperValue = keeper[field as TMergeableField & keyof typeof keeper];
			const sourceValue = source[field as TMergeableField & keyof typeof source];
			const takeSource = choice === "source" || (choice === undefined && isEmptyValue(keeperValue) && !isEmptyValue(sourceValue));
			if (takeSource && !isEmptyValue(sourceValue)) {
				(fieldUpdates as Record<string, unknown>)[field] = sourceValue;
			}
		}
		// telefoneBase acompanha o telefone escolhido.
		if (typeof fieldUpdates.telefone === "string") {
			fieldUpdates.telefoneBase = source.telefoneBase;
		}
		// indicadorInscricaoEstadual acompanha a inscrição estadual escolhida.
		if (typeof fieldUpdates.inscricaoEstadual === "string" && source.indicadorInscricaoEstadual) {
			fieldUpdates.indicadorInscricaoEstadual = source.indicadorInscricaoEstadual;
		}
		// BSUID do WhatsApp: único parcial por organização — herda só quando o keeper não tem.
		// O da origem precisa ser liberado ANTES do update do keeper para não violar o índice.
		if (!keeper.whatsappUserId && source.whatsappUserId) {
			await tx.update(clients).set({ whatsappUserId: null }).where(eq(clients.id, source.id));
			fieldUpdates.whatsappUserId = source.whatsappUserId;
		}
		// Opt-out de comunicação: vale a pausa mais longa.
		if (source.comunicacaoPausadaAte && (!keeper.comunicacaoPausadaAte || source.comunicacaoPausadaAte > keeper.comunicacaoPausadaAte)) {
			fieldUpdates.comunicacaoPausadaAte = source.comunicacaoPausadaAte;
		}
		if (Object.keys(fieldUpdates).length > 0) {
			await tx.update(clients).set(fieldUpdates).where(eq(clients.id, keeper.id));
		}

		const keeperClienteId = keeper.id;
		const sourceClienteId = source.id;

		const registrosMovidos: Record<string, number> = {};
		async function repoint(label: string, table: { clienteId: unknown }) {
			// Conta antes e re-aponta; contagem é informativa (uma query extra barata por tabela).
			const t = table as unknown as typeof sales;
			const [{ count } = { count: 0 }] = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(t)
				.where(eq(t.clienteId, sourceClienteId));
			if (count > 0) await tx.update(t).set({ clienteId: keeperClienteId }).where(eq(t.clienteId, sourceClienteId));
			registrosMovidos[label] = count;
		}

		// ── Chats: colisão na chave natural (org, cliente, whatsapp_telefone_id) ──
		const sourceChats = await tx.query.chats.findMany({ where: and(eq(chats.organizacaoId, input.organizacaoId), eq(chats.clienteId, source.id)) });
		const keeperChats = await tx.query.chats.findMany({ where: and(eq(chats.organizacaoId, input.organizacaoId), eq(chats.clienteId, keeper.id)) });
		const keeperChatByPhone = new Map(keeperChats.filter((chat) => chat.whatsappTelefoneId).map((chat) => [chat.whatsappTelefoneId as string, chat]));
		let movedChats = 0;
		let mergedChats = 0;

		for (const sourceChat of sourceChats) {
			const keeperChat = sourceChat.whatsappTelefoneId ? keeperChatByPhone.get(sourceChat.whatsappTelefoneId) : undefined;
			if (!keeperChat) {
				await tx.update(chats).set({ clienteId: keeper.id }).where(eq(chats.id, sourceChat.id));
				movedChats += 1;
				continue;
			}

			// Mesmo telefone nos dois lados: re-parenta mensagens, encerra o
			// atendimento aberto do duplicado (o único parcial permite um aberto por
			// chat), re-parenta o histórico de atendimentos e apaga o chat da origem.
			await tx.update(chatMessages).set({ chatId: keeperChat.id }).where(eq(chatMessages.chatId, sourceChat.id));
			await tx
				.update(chatAssignments)
				.set({ status: "ENCERRADO", dataEncerramento: new Date() })
				.where(and(eq(chatAssignments.chatId, sourceChat.id), notInArray(chatAssignments.status, ["ENCERRADO", "CANCELADO"])));
			await tx.update(chatAssignments).set({ chatId: keeperChat.id }).where(eq(chatAssignments.chatId, sourceChat.id));
			await tx.delete(chats).where(eq(chats.id, sourceChat.id));

			// Recalcula agregados do keeper a partir das mensagens combinadas.
			// Não-lidas: soma dos contadores (o contador é incremental, resetado na leitura).
			await tx.execute(sql`
				UPDATE ampmais_chats c SET
					mensagens_nao_lidas = c.mensagens_nao_lidas + ${sourceChat.mensagensNaoLidas},
					ultima_mensagem_id = (SELECT m.id FROM ampmais_chat_messages m WHERE m.chat_id = c.id ORDER BY m.data_envio DESC NULLS LAST, m.id DESC LIMIT 1),
					ultima_mensagem_data = coalesce((SELECT max(m.data_envio) FROM ampmais_chat_messages m WHERE m.chat_id = c.id), c.ultima_mensagem_data),
					ultima_mensagem_entrada_data = (SELECT max(m.data_envio) FROM ampmais_chat_messages m WHERE m.chat_id = c.id AND m.autor_tipo = 'CLIENTE'),
					ultima_mensagem_saida_data = (SELECT max(m.data_envio) FROM ampmais_chat_messages m WHERE m.chat_id = c.id AND m.autor_tipo <> 'CLIENTE'),
					whatsapp_janela_data_expiracao = greatest(c.whatsapp_janela_data_expiracao, ${sourceChat.whatsappJanelaDataExpiracao ?? null})
				WHERE c.id = ${keeperChat.id}
			`);
			mergedChats += 1;
		}
		registrosMovidos.chats = movedChats;
		registrosMovidos.chatsMesclados = mergedChats;

		// Mensagens denormalizam o cliente em duas colunas.
		await repoint("chatMessages", chatMessages);
		const [{ count: authorMessageCount } = { count: 0 }] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(chatMessages)
			.where(eq(chatMessages.autorClienteId, source.id));
		if (authorMessageCount > 0) {
			await tx.update(chatMessages).set({ autorClienteId: keeper.id }).where(eq(chatMessages.autorClienteId, source.id));
		}

		// ── Tags: único (clienteId, tagId) — move só as que o keeper não tem ─────
		const keeperTagIds = tx
			.select({ tagId: clientTagReferences.clienteTagId })
			.from(clientTagReferences)
			.where(eq(clientTagReferences.clienteId, keeper.id));
		await tx
			.update(clientTagReferences)
			.set({ clienteId: keeper.id })
			.where(and(eq(clientTagReferences.clienteId, source.id), notInArray(clientTagReferences.clienteTagId, keeperTagIds)));
		await tx.delete(clientTagReferences).where(eq(clientTagReferences.clienteId, source.id));

		// ── Campos personalizados: único (clienteId, campoId) — keeper vence ─────
		const keeperFieldIds = tx
			.select({ campoId: clientCustomFieldValues.campoId })
			.from(clientCustomFieldValues)
			.where(eq(clientCustomFieldValues.clienteId, keeper.id));
		await tx
			.update(clientCustomFieldValues)
			.set({ clienteId: keeper.id })
			.where(and(eq(clientCustomFieldValues.clienteId, source.id), notInArray(clientCustomFieldValues.campoId, keeperFieldIds)));
		await tx.delete(clientCustomFieldValues).where(eq(clientCustomFieldValues.clienteId, source.id));

		// ── Cashback: consolida o saldo por programa e re-aponta o ledger ────────
		// O ledger (transactions) não é reescrito — saldo_valor_anterior/posterior
		// são snapshots históricos, não uma cadeia verificável; a linha de saldo é
		// a fonte da verdade. Ver o plano, §5.3.
		const keeperBalances = await tx.query.cashbackProgramBalances.findMany({ where: eq(cashbackProgramBalances.clienteId, keeper.id) });
		const keeperBalanceByProgram = new Map(keeperBalances.map((balance) => [balance.programaId, balance]));
		const saldosCashback: TMergeClientsResult["saldosCashback"] = {};

		for (const sourceBalance of sourceBalances) {
			const keeperBalance = keeperBalanceByProgram.get(sourceBalance.programaId);
			if (!keeperBalance) {
				await tx
					.update(cashbackProgramBalances)
					.set({ clienteId: keeper.id, dataAtualizacao: new Date() })
					.where(eq(cashbackProgramBalances.id, sourceBalance.id));
				saldosCashback[sourceBalance.programaId] = {
					keeperAntes: 0,
					origemAntes: sourceBalance.saldoValorDisponivel,
					keeperDepois: sourceBalance.saldoValorDisponivel,
				};
				continue;
			}
			await tx
				.update(cashbackProgramBalances)
				.set({
					saldoValorDisponivel: keeperBalance.saldoValorDisponivel + sourceBalance.saldoValorDisponivel,
					saldoValorAcumuladoTotal: keeperBalance.saldoValorAcumuladoTotal + sourceBalance.saldoValorAcumuladoTotal,
					saldoValorResgatadoTotal: keeperBalance.saldoValorResgatadoTotal + sourceBalance.saldoValorResgatadoTotal,
					// "Membro desde" é o mais antigo dos dois.
					dataAdesao: sourceBalance.dataAdesao < keeperBalance.dataAdesao ? sourceBalance.dataAdesao : keeperBalance.dataAdesao,
					dataAtualizacao: new Date(),
				})
				.where(eq(cashbackProgramBalances.id, keeperBalance.id));
			await tx.delete(cashbackProgramBalances).where(eq(cashbackProgramBalances.id, sourceBalance.id));
			saldosCashback[sourceBalance.programaId] = {
				keeperAntes: keeperBalance.saldoValorDisponivel,
				origemAntes: sourceBalance.saldoValorDisponivel,
				keeperDepois: keeperBalance.saldoValorDisponivel + sourceBalance.saldoValorDisponivel,
			};
		}
		registrosMovidos.saldosCashbackConsolidados = sourceBalances.length;
		await repoint("transacoesCashback", cashbackProgramTransactions);

		// ── Re-apontamento de FKs simples ────────────────────────────────────────
		await repoint("vendas", sales);
		await repoint("itensVenda", saleItems);
		await repoint("interacoes", interactions);
		await repoint("atendimentosServico", chatServices);
		await repoint("cuponsAtribuidos", couponGrants);
		await repoint("cuponsResgatados", couponRedemptions);
		await repoint("conversoesCampanha", campaignConversions);
		await repoint("localizacoes", clientLocations);
		await repoint("parceiros", partners);
		await repoint("solicitacoesPoi", poiTransactionRequests);
		await repoint("comandas", tabs);
		// ai_agent_runs.cliente_id é denormalizado (sem FK) — o cascade do delete não cobre.
		await repoint("execucoesAgente", aiAgentRuns);
		// Eventos e destinatários de campanha: sem eles o cascade apagava o histórico de envios da
		// origem (e o limite de frequência deixava de vê-los). Destinatários são únicos por
		// (disparo, cliente): no mesmo disparo vale o do keeper, e o da origem sai com ela.
		await repoint("eventosCampanha", campaignEvents);
		const keeperDispatchIds = tx
			.select({ dispatchId: campaignDispatchRecipients.dispatchId })
			.from(campaignDispatchRecipients)
			.where(eq(campaignDispatchRecipients.clienteId, keeper.id));
		const movedRecipients = await tx
			.update(campaignDispatchRecipients)
			.set({ clienteId: keeper.id })
			.where(and(eq(campaignDispatchRecipients.clienteId, source.id), notInArray(campaignDispatchRecipients.dispatchId, keeperDispatchIds)))
			.returning({ id: campaignDispatchRecipients.id });
		registrosMovidos.destinatariosCampanha = movedRecipients.length;

		// audience_destination_members fica INTACTO de propósito: a linha da origem
		// carrega o hash necessário para o DELETE na Meta na próxima sincronização
		// (o cliente sumiu do segmento) e o keeper entra pelo delta normal.

		// ── Vínculos derivados: delete dos dois lados; recomputados pós-commit ───
		await tx
			.delete(clientSellerReferences)
			.where(
				and(eq(clientSellerReferences.organizacaoId, input.organizacaoId), sql`${clientSellerReferences.clienteId} IN (${keeper.id}, ${source.id})`),
			);
		await tx
			.delete(productClientReferences)
			.where(
				and(eq(productClientReferences.organizacaoId, input.organizacaoId), sql`${productClientReferences.clienteId} IN (${keeper.id}, ${source.id})`),
			);

		// ── Candidatos: este par vira MESCLADO; os demais migram para o keeper ───
		if (input.candidateId) {
			await tx
				.update(clientDuplicateCandidates)
				.set({ status: "MESCLADO", dataAtualizacao: new Date() })
				.where(eq(clientDuplicateCandidates.id, input.candidateId));
		}
		const otherCandidates = await tx.query.clientDuplicateCandidates.findMany({
			where: and(
				eq(clientDuplicateCandidates.organizacaoId, input.organizacaoId),
				eq(clientDuplicateCandidates.status, "PENDENTE"),
				sql`(${clientDuplicateCandidates.clienteAId} = ${source.id} OR ${clientDuplicateCandidates.clienteBId} = ${source.id})`,
			),
		});
		for (const candidate of otherCandidates) {
			const otherClientId = candidate.clienteAId === source.id ? candidate.clienteBId : candidate.clienteAId;
			await tx.delete(clientDuplicateCandidates).where(eq(clientDuplicateCandidates.id, candidate.id));
			if (otherClientId === keeper.id) continue; // par colapsou no próprio merge
			const [clienteAId, clienteBId] = keeper.id < otherClientId ? [keeper.id, otherClientId] : [otherClientId, keeper.id];
			await tx
				.insert(clientDuplicateCandidates)
				.values({ organizacaoId: input.organizacaoId, clienteAId, clienteBId, motivos: candidate.motivos })
				.onConflictDoNothing();
		}

		// ── Log de auditoria + hard delete ───────────────────────────────────────
		const [mergeLog] = await tx
			.insert(clientMergeLogs)
			.values({
				organizacaoId: input.organizacaoId,
				keeperClienteId: keeper.id,
				origemClienteId: source.id,
				candidatoId: input.candidateId ?? null,
				origemSnapshot,
				camposEscolhidos: input.fieldChoices ?? null,
				registrosMovidos,
				saldosCashback,
				autorId: input.autorId ?? null,
			})
			.returning({ id: clientMergeLogs.id });
		if (!mergeLog?.id) throw new Error("Falha ao registrar o log do merge.");

		await tx.delete(clients).where(eq(clients.id, source.id));

		return { keeperId: keeper.id, sourceId: source.id, registrosMovidos, saldosCashback, mergeLogId: mergeLog.id };
	});

	// Pós-commit, best-effort: metadados de compra, RFM, vínculos de vendedor e
	// produto do keeper. O cron noturno é a rede de segurança.
	if (input.recomputeKeeper !== false) {
		await recomputeClientDerivedDataSafely({ organizacaoId: input.organizacaoId, clienteId: result.keeperId });
	}

	return result;
}
