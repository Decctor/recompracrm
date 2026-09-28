import "@/utils/scripts/load-next-env";

import { resolveEmissionDocumentType } from "@/lib/fiscal/document-type";
import { checkSaleFiscalReadiness, emitFiscalDocument } from "@/lib/fiscal/documents";
import { EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH, EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH } from "@/lib/fiscal/exceptional-presence";
import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import type { TEmitirDocumentoInput } from "@/lib/fiscal/types";
import { isValidCpfCnpj } from "@/lib/validation";
import { connection, db } from "@/services/drizzle";
import { fiscalOutboundDocuments, sales } from "@/services/drizzle/schema";
import { and, asc, eq, gte, ilike, inArray } from "drizzle-orm";

/**
 * Emite em lote documentos fiscais, em dois modos:
 *
 *   --mode=perfil      Vendas nao-ENTREGA, pelo fluxo normal (ex.: travadas por perfil fiscal de
 *                      produto ausente e cujo perfil ja foi cadastrado).
 *   --mode=presencial  Vendas ENTREGA sem CPF/CNPJ valido do destinatario. Emite com a
 *                      classificacao presencial excepcional (indPres=1), exige --autor-id e
 *                      --justificativa; a declaracao fica gravada no documento.
 *
 * Origem: por padrao, documentos em ERRO/REJEITADO. Com --sem-documento, vendas CONFIRMADAS que
 * nunca tiveram documento (filtros --canal=<padrao ilike> e --desde=AAAA-MM-DD); o tipo e resolvido
 * como na emissao manual da tela (NF-e so com operacao NF-e configurada, senao NFC-e).
 *
 * Toda emissao passa antes pela pre-verificacao (checkSaleFiscalReadiness); so os aprovados sao
 * enviados. O envio e sequencial, num unico processo: o limitador da Spedy (1 req/1,1s por chave,
 * com retentativa em 429) vale para o processo inteiro, e --delay-ms soma folga entre documentos.
 * O lote para no primeiro ERRO/REJEITADO, salvo --continue-on-failure.
 *
 * DRY-RUN por padrao. Uso:
 *   npx tsx --conditions=react-server ./scripts/reemit-fiscal-errors-batch.ts --org=<id> --mode=perfil [--limit=1] [--apply]
 *   npx tsx --conditions=react-server ./scripts/reemit-fiscal-errors-batch.ts --org=<id> --mode=presencial \
 *     --autor-id=<usuarioId> --justificativa="..." [--document-ids=a,b] [--limit=1] [--apply]
 *   npx tsx --conditions=react-server ./scripts/reemit-fiscal-errors-batch.ts --org=<id> --mode=perfil \
 *     --sem-documento --canal=%ifood% --desde=2026-09-01 [--apply]
 */

function arg(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type TMode = "perfil" | "presencial";

function hasText(value: string | null | undefined) {
	return !!value?.trim();
}

const saleColumns = { id: true, canal: true, entregaModalidade: true, statusVenda: true, valorTotal: true, dataVenda: true } as const;
const saleWith = {
	cliente: { columns: { nome: true, cpfCnpj: true, localizacaoLogradouro: true, localizacaoCidade: true, localizacaoEstado: true } },
	entregaLocalizacao: { columns: { localizacaoLogradouro: true, localizacaoCidade: true, localizacaoEstado: true } },
	documentosFiscais: { columns: { id: true, statusInterno: true } },
} as const;

async function loadSalesWithoutDocument({ organizationId, channel, since }: { organizationId: string; channel: string | null; since: Date | null }) {
	const found = await db.query.sales.findMany({
		where: and(
			eq(sales.organizacaoId, organizationId),
			eq(sales.statusVenda, "CONFIRMADA"),
			...(channel ? [ilike(sales.canal, channel)] : []),
			...(since ? [gte(sales.dataVenda, since)] : []),
		),
		columns: saleColumns,
		with: saleWith,
		orderBy: [asc(sales.dataVenda)],
	});
	return found.filter((sale) => sale.documentosFiscais.length === 0);
}
type TSale = Awaited<ReturnType<typeof loadSalesWithoutDocument>>[number];

// Alvo = documento travado a reemitir, ou venda sem documento a emitir pela primeira vez.
type TTarget = {
	label: string;
	documentId: string | null;
	sale: TSale;
	tipo: "NFCE" | "NFE" | null;
	lancamentoContabilId: string | null;
	presencaDeclarada: string | null;
	status: string;
};

async function main() {
	const organizationId = arg("org");
	const mode = arg("mode") as TMode | null;
	const apply = hasFlag("apply");
	const continueOnFailure = hasFlag("continue-on-failure");
	const withoutDocument = hasFlag("sem-documento");
	const channel = arg("canal");
	const since = arg("desde") ? new Date(arg("desde")!) : null;
	const delayMs = Number(arg("delay-ms") ?? "1500");
	const limit = arg("limit") ? Number(arg("limit")) : null;
	const documentIds = (arg("document-ids") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (!organizationId) throw new Error("Informe --org=<organizacaoId>.");
	if (mode !== "perfil" && mode !== "presencial") throw new Error("Informe --mode=perfil ou --mode=presencial.");
	if (since && Number.isNaN(since.getTime())) throw new Error("--desde invalido (use AAAA-MM-DD).");
	if (withoutDocument && documentIds.length > 0) throw new Error("--document-ids nao se aplica a --sem-documento.");
	if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("--delay-ms invalido.");
	if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit deve ser um inteiro positivo.");

	const authorId = arg("autor-id");
	const justification = arg("justificativa")?.trim() ?? null;
	if (mode === "presencial") {
		if (!authorId || !justification) throw new Error("--mode=presencial exige --autor-id e --justificativa.");
		if (justification.length < EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH || justification.length > EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH) {
			throw new Error(
				`A justificativa deve ter entre ${EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH} e ${EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH} caracteres.`,
			);
		}
		const author = await db.query.users.findFirst({ where: (fields, { eq }) => eq(fields.id, authorId), columns: { id: true, nome: true } });
		if (!author) throw new Error("Usuario de --autor-id nao encontrado.");
		console.log(`Declaracao presencial: autor=${author.nome} | justificativa=${JSON.stringify(justification)}`);
	}

	const skipped: string[] = [];
	const skip = (label: string, reason: string) => {
		skipped.push(`${label}: ${reason}`);
		return false;
	};

	let targets: TTarget[] = [];
	if (withoutDocument) {
		const found = await loadSalesWithoutDocument({ organizationId, channel, since });
		targets = found.map((sale) => ({
			label: `venda:${sale.id}`,
			documentId: null,
			sale,
			tipo: null,
			lancamentoContabilId: null,
			presencaDeclarada: null,
			status: "SEM_DOCUMENTO",
		}));
		console.log(`Vendas confirmadas sem documento fiscal: ${targets.length}`);
	} else {
		const documents = await db.query.fiscalOutboundDocuments.findMany({
			where: and(
				eq(fiscalOutboundDocuments.organizacaoId, organizationId),
				inArray(fiscalOutboundDocuments.statusInterno, ["ERRO", "REJEITADO"]),
				inArray(fiscalOutboundDocuments.tipo, ["NFCE", "NFE"]),
				...(documentIds.length > 0 ? [inArray(fiscalOutboundDocuments.id, documentIds)] : []),
			),
			with: { venda: { columns: saleColumns, with: saleWith } },
			orderBy: [asc(fiscalOutboundDocuments.dataInsercao)],
		});
		console.log(`Documentos em ERRO/REJEITADO: ${documents.length}`);
		for (const document of documents) {
			const sale = document.venda;
			if (!sale || !document.vendaId) skip(document.id, "sem venda vinculada");
			else if (sale.statusVenda !== "CONFIRMADA") skip(document.id, `venda em ${sale.statusVenda}`);
			else if (document.protocolo || document.dataAutorizacao) skip(document.id, "possui evidencia de autorizacao");
			else if (document.documentoOrigemId || document.chaveAcessoReferencia) skip(document.id, "documento encadeado");
			else if (sale.documentosFiscais.some((other) => other.id !== document.id && !["ERRO", "REJEITADO"].includes(other.statusInterno))) {
				skip(document.id, "venda ja possui outro documento ativo");
			} else {
				targets.push({
					label: document.id,
					documentId: document.id,
					sale,
					// Mantem o tipo do documento travado: a referencia (venda+tipo) reaproveita o mesmo registro.
					tipo: document.tipo as "NFCE" | "NFE",
					lancamentoContabilId: document.lancamentoContabilId,
					presencaDeclarada: document.presencaConsumidorDeclarada,
					status: document.statusInterno,
				});
			}
		}
	}

	const excludedSaleIds = new Set((arg("excluir-vendas") ?? "").split(",").filter(Boolean));
	const explicit = documentIds.length > 0;
	const candidates = targets.filter((target) => {
		if (excludedSaleIds.has(target.sale.id)) return skip(target.label, "excluida via --excluir-vendas");
		const isDelivery = target.sale.entregaModalidade === "ENTREGA";
		const hasRecipientTaxId = isValidCpfCnpj(target.sale.cliente?.cpfCnpj ?? "");
		if (mode === "perfil") {
			if (isDelivery) return explicit ? skip(target.label, "venda com ENTREGA (use --mode=presencial)") : false;
			if (target.presencaDeclarada) return skip(target.label, "possui declaracao presencial");
		} else {
			if (!isDelivery) return explicit ? skip(target.label, "venda nao e ENTREGA") : false;
			if (hasRecipientTaxId) return skip(target.label, "destinatario possui CPF/CNPJ valido; nao se aplica a classificacao presencial");
		}
		return true;
	});

	console.log(
		`=== ${apply ? "APLICACAO" : "DRY-RUN"} | modo=${mode} | origem=${withoutDocument ? "sem-documento" : "erros"} | org=${organizationId} ===`,
	);
	console.log(`Candidatos do modo: ${candidates.length}`);
	for (const line of skipped) console.log(`  [PULADO] ${line}`);

	const organization = withoutDocument ? await loadFiscalOrganization(organizationId) : null;
	const ready: { target: TTarget; input: TEmitirDocumentoInput }[] = [];
	for (const target of candidates) {
		const sale = target.sale;
		const tipo =
			target.tipo ??
			(await resolveEmissionDocumentType({
				organizacaoId: organizationId,
				operacaoPadraoNfeId: organization?.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE ?? null,
				signals: { canal: sale.canal, entregaModalidade: sale.entregaModalidade, destinatarioCpfCnpj: sale.cliente?.cpfCnpj },
			}));
		let lancamentoContabilId = target.lancamentoContabilId;
		if (target.documentId === null) {
			const [entry] = await connection`select id from ampmais_accounting_entries where venda_id = ${sale.id} order by data_insercao limit 1`;
			lancamentoContabilId = (entry?.id as string | undefined) ?? null;
		}
		const input: TEmitirDocumentoInput = {
			vendaId: sale.id,
			tipo,
			organizacaoId: organizationId,
			lancamentoContabilId,
			autorId: mode === "presencial" ? authorId : null,
			origem: "MANUAL",
			classificacaoPresencaExcepcional:
				mode === "presencial"
					? { presencaConsumidor: "OPERACAO_PRESENCIAL", justificativa: justification!, autorId: authorId!, dataDeclaracao: new Date() }
					: null,
		};
		const readiness = await checkSaleFiscalReadiness(input);
		const address = sale.entregaLocalizacao ?? sale.cliente;
		const addressComplete = hasText(address?.localizacaoLogradouro) && hasText(address?.localizacaoCidade) && hasText(address?.localizacaoEstado);
		const header = `${target.label} | venda=${sale.id} ${sale.dataVenda?.toISOString().slice(0, 10) ?? "sem-data"} | ${sale.canal ?? "-"} | ${tipo} | R$ ${sale.valorTotal} | ${target.status}`;
		if (!readiness.pronto) {
			console.log(`  [REPROVADO] ${header}`);
			for (const problem of readiness.problemas) console.log(`      - ${problem.codigo}: ${problem.mensagem}`);
			continue;
		}
		console.log(
			`  [PRONTO] ${header} | presenca=${readiness.contexto?.presencaConsumidor} vNF=${readiness.contexto?.vNF}${mode === "presencial" ? ` | endereco=${addressComplete ? "COMPLETO" : "INCOMPLETO"}` : ""}`,
		);
		ready.push({ target, input });
	}

	const batch = limit ? ready.slice(0, limit) : ready;
	console.log(
		`\nResumo: prontos=${ready.length} | reprovados=${candidates.length - ready.length} | pulados=${skipped.length} | neste lote=${batch.length}`,
	);
	if (!apply) {
		console.log("DRY-RUN: nada foi emitido. Repita com --apply (comece com --limit=1).");
		return;
	}

	const tally: Record<string, number> = {};
	for (const [index, { target, input }] of batch.entries()) {
		if (index > 0 && delayMs > 0) await sleep(delayMs);
		let status: string;
		try {
			const result = await emitFiscalDocument(input);
			status = result.statusInterno;
			console.log(`[${index + 1}/${batch.length}] ${target.label} -> ${status} documento=${result.documentoId} numero=${result.numero ?? "-"}`);
		} catch (error) {
			status = "EXCECAO";
			console.log(`[${index + 1}/${batch.length}] ${target.label} -> EXCECAO: ${error instanceof Error ? error.message : String(error)}`);
		}
		tally[status] = (tally[status] ?? 0) + 1;
		if (["ERRO", "REJEITADO", "EXCECAO"].includes(status) && !continueOnFailure) {
			console.log("Lote interrompido na primeira falha. Revise o documento antes de continuar (ou use --continue-on-failure).");
			break;
		}
	}
	console.log(`\nResultado: ${JSON.stringify(tally)}`);
}

main()
	.catch((error) => {
		console.error("[FISCAL_REEMIT_BATCH] Falha:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
