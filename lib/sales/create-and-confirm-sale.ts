import { normalizeCouponGiftItem, roundCouponGiftCurrency } from "@/lib/coupons/gift-pricing";
import { resolveSaleFiscalDocumentPreference } from "@/lib/fiscal/emission-document-policy";
import { resolvePaymentFinancialAccounts } from "@/lib/payments";
import { hydratePOSProducts } from "@/lib/pos/hydrate-pos-products";
import { resolveCatalogOrderItem } from "@/lib/products/resolve-catalog-order-item";
import { authorizeSaleDiscount, computeSaleAggregatedDiscount, consumeSaleDiscountApproval } from "@/lib/sales/sale-discount-authorization";
import { type TSaleActor, getSaleActorOrganizationId, resolveActorFiscalEmission } from "@/lib/sales/sale-actor";
import { validateSaleItemsPricing } from "@/lib/sales/sale-pricing-validation";
import { processSaleConfirmationInTransaction, processSaleConfirmationPostCommit } from "@/lib/sales/sale-processing";
import {
	admitSaleRewardRedemptions,
	buildRewardSaleItemsValues,
	buildRewardSnapshotsMetadataKeys,
	buildSaleRewardDraftSnapshots,
	resolveRewardRedemptionLinesInput,
	sumAdmittedRewardsCost,
	sumAdmittedRewardsSaleValue,
	toSaleRewardRedemptionInputs,
} from "@/lib/sales/sale-reward-redemption";
import { resolveActiveSalesSession, validateSalesSessionSeller } from "@/lib/sales-sessions";
import { validateActiveSeller } from "@/lib/sellers/validate-active-seller";
import type { TCreateAndConfirmSaleInput } from "@/schemas/sale-checkout";
import { type DBTransaction, db } from "@/services/drizzle";
import { saleItemModifiers, saleItems, sales } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

export type { TSaleActor } from "@/lib/sales/sale-actor";

/**
 * Criação + confirmação de uma venda de balcão, em uma etapa. É o mesmo pipeline para os dois
 * atores que vendem no balcão:
 *
 * - `USER`: o operador logado no PDV web (`POST /api/pos/sales/create-and-confirm`);
 * - `DEVICE`: a maquininha (Fluxo A do RecompraCRM POS, `POST /api/payment-terminal/sales`), que
 *   vende com a credencial do dispositivo e sem sessão humana.
 *
 * O que muda com o ator é só o que depende de quem vende: a autoria (o dispositivo não é um
 * usuário), o teto de desconto quando o vendedor não tem membership (o dispositivo não tem
 * desconto próprio: acima de zero exige aprovação de um gestor), e o override fiscal (o dispositivo
 * não tem a permissão, então herda o padrão da organização). Preço, regras de adicionais, cupom,
 * cashback, recompensas, caixa, troco e efetivação são os mesmos.
 *
 * Três etapas, para que cada chamador escolha a transação: `prepareSaleCreation` valida e calcula
 * (nada é escrito), `persistSaleCreation` grava e confirma dentro de uma transação, e
 * `finishSaleCreation` roda o pós-commit (emissão fiscal, impressões). O PDV web abre a própria
 * transação; a maquininha roda as duas primeiras dentro da transação idempotente do dispositivo.
 */

/**
 * Regras de grupo de adicionais (mínimo, máximo, quantidade por opção, opção pertencente ao
 * produto) aplicadas no servidor sobre a projeção do canal PDV — a mesma conta da comanda e da
 * loja (`resolveCatalogOrderItem`). Preço e presença no catálogo são da validação de preços; um
 * produto que a projeção não devolve fica com ela.
 */
export async function validateSaleItemsAddOnRules({ orgId, itens }: { orgId: string; itens: TCreateAndConfirmSaleInput["itens"] }) {
	const productIds = [...new Set(itens.map((item) => item.produtoId))];
	if (productIds.length === 0) return;
	const catalog = new Map((await hydratePOSProducts({ orgId, productIds })).map((product) => [product.id, product]));
	for (const item of itens) {
		const product = catalog.get(item.produtoId);
		if (!product) continue;
		resolveCatalogOrderItem({
			product,
			variantId: item.produtoVarianteId ?? null,
			quantity: item.quantidade,
			modifiers: item.modificadores.map((modifier) => ({ opcaoId: modifier.opcaoId, quantidade: modifier.quantidade })),
		});
	}
}

export async function prepareSaleCreation({ actor, input }: { actor: TSaleActor; input: TCreateAndConfirmSaleInput }) {
	const orgId = getSaleActorOrganizationId(actor);
	const session = actor.kind === "USER" ? actor.session : null;
	await validateActiveSeller({ orgId, sellerId: input.vendedorId });

	const rewardLines = resolveRewardRedemptionLinesInput(input) ?? [];
	if (input.itens.length === 0 && rewardLines.length === 0) {
		throw new createHttpError.BadRequest("Pelo menos um item é obrigatório.");
	}

	// Nunca confie nos valores do cliente: recalcula os itens contra o catálogo antes de qualquer uso,
	// e confere as escolhas de adicionais contra as regras dos grupos.
	await validateSaleItemsPricing({ orgId, itens: input.itens, canal: "POS" });
	await validateSaleItemsAddOnRules({ orgId, itens: input.itens });
	input = { ...input, itens: input.itens.map((item) => normalizeCouponGiftItem(item, input.cupomResgate?.brinde)) };

	// Resgate de recompensas: admissão + resolução autoritativa de cada prêmio contra o catálogo,
	// com saldo pré-checado sobre a soma. Exclusivo com cupom (espelha o POI) e com
	// resgate-desconto. O desconto comercial dos prêmios fica fora do teto de desconto do
	// vendedor, como cashback e cupom AUTOMATICA — regras próprias validadas aqui.
	const validatedRewards = await admitSaleRewardRedemptions({
		tx: db,
		organizacaoId: orgId,
		clienteId: input.clienteId,
		recompensas: rewardLines,
		hasCoupon: !!input.cupomResgate,
		cashbackResgate: input.cashbackResgate ?? 0,
		surface: "POS",
	});

	const productIds = [...new Set(input.itens.map((item) => item.produtoId))];
	const variantIds = input.itens.map((item) => item.produtoVarianteId).filter((id): id is string => !!id);

	const [produtosResult, variantesResult, organization] = await Promise.all([
		productIds.length > 0
			? db.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, productIds),
					columns: { id: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
				})
			: [],
		variantIds.length > 0
			? db.query.productVariants.findMany({
					where: (fields, { inArray }) => inArray(fields.id, variantIds),
					columns: { id: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
				})
			: [],
		db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) }),
	]);

	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const emissaoFiscalDocumento = resolveSaleFiscalDocumentPreference({
		requested: input.emissaoFiscalDocumento,
		canEmit: !!session?.membership?.permissoes.fiscal.emitir,
	});

	// Override fiscal por venda: valida permissão simétrica e resolve o valor a persistir (null = herda org).
	const emissaoFiscalAutomatica = resolveActorFiscalEmission({
		actor,
		requested: input.emissaoFiscalAutomatica,
		organizationDefault: organization.fiscalEmissaoAutomatica,
	});

	// Sessões de venda (caixa): enforcement opcional/obrigatório + validação da sessão informada pelo cliente.
	const sessaoObrigatoria = organization.configuracao.preferencias.sessoesVenda?.obrigatorio ?? false;
	if (sessaoObrigatoria && !input.sessaoVendaId) {
		throw new createHttpError.BadRequest("Nenhum caixa aberto. Abra uma sessão de venda para continuar.");
	}
	let sessaoVendaId: string | null = null;
	if (input.sessaoVendaId) {
		const activeSession = await resolveActiveSalesSession({ orgId, sessaoVendaId: input.sessaoVendaId });
		if (!activeSession) throw new createHttpError.BadRequest("Sessão de venda inválida ou não está aberta.");
		validateSalesSessionSeller({ session: activeSession, vendedorId: input.vendedorId });
		sessaoVendaId = activeSession.id;
	}

	const organizationSaleDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.vendas;
	const accountingEntryDebitAccountId = organizationSaleDefaults.debitoContaId;
	const accountingEntryCreditAccountId = organizationSaleDefaults.creditoContaId;
	if (!accountingEntryDebitAccountId || !accountingEntryCreditAccountId) {
		throw new createHttpError.InternalServerError("A organizacao nao possui contas padrao de vendas configuradas.");
	}
	const productCostMap = new Map(produtosResult.map((p) => [p.id, p.precoCusto ?? 0]));
	const variantCostMap = new Map(variantesResult.map((v) => [v.id, v.precoCusto ?? 0]));

	const valorBaseItens = input.itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0);
	const descontosGerais = input.descontosTotal ?? 0;
	const cashbackResgate = input.cashbackResgate ?? 0;
	const cupomDesconto = input.cupomResgate?.valorDesconto ?? 0;
	const acrescimosGerais = input.acrescimosTotal ?? 0;
	const descontosVenda = descontosGerais + cupomDesconto + cashbackResgate;
	const valorAntesCupom = Math.max(0, valorBaseItens - descontosGerais);
	if (cupomDesconto > valorAntesCupom) {
		throw new createHttpError.BadRequest("O desconto do cupom não pode superar o valor da venda.");
	}
	const valorAntesCashback = Math.max(0, valorAntesCupom - cupomDesconto);
	if (cashbackResgate > valorAntesCashback) {
		throw new createHttpError.BadRequest("O resgate de cashback não pode superar o valor da venda.");
	}

	// Teto de desconto do vendedor: acima do limite exige aprovação válida, consumida na transação da venda.
	const descontoAgregado = computeSaleAggregatedDiscount({
		itens: input.itens,
		descontosGerais,
		cupomResgate: input.cupomResgate,
	});
	const descontoAprovacaoId = await authorizeSaleDiscount({
		orgId,
		session,
		deviceId: actor.kind === "DEVICE" ? actor.deviceId : null,
		vendedorId: input.vendedorId,
		valorBase: descontoAgregado.valorBase,
		descontoTotal: descontoAgregado.descontoTotal,
		aprovacaoId: input.descontoAprovacaoId,
	});

	const computedTotal = Math.max(0, valorBaseItens - descontosVenda) + acrescimosGerais;
	const valorTotal = input.cupomResgate?.brinde ? roundCouponGiftCurrency(computedTotal) : computedTotal;
	const descontosTotalItens = input.itens.reduce((sum, item) => sum + item.valorDesconto, 0);
	// Os itens das recompensas entram com líquido 0 (bruto = desconto = precoVenda × qtd), então
	// não afetam valorTotal — mas o desconto comercial compõe descontosTotal e o custo compõe custoTotal.
	const recompensaDesconto = sumAdmittedRewardsSaleValue(validatedRewards);
	const descontosTotalPersistido = (descontosVenda > 0 ? descontosVenda : descontosTotalItens) + recompensaDesconto;
	const custoTotal =
		input.itens.reduce((sum, item) => {
			const custo = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);
			return sum + custo * item.quantidade;
		}, 0) + sumAdmittedRewardsCost(validatedRewards);

	const salePayments = await resolvePaymentFinancialAccounts({ organization, payments: input.pagamentos });

	return {
		orgId,
		input,
		organization,
		validatedRewards,
		emissaoFiscalAutomatica,
		emissaoFiscalDocumento,
		sessaoVendaId,
		accountingEntryDebitAccountId,
		accountingEntryCreditAccountId,
		productCostMap,
		variantCostMap,
		valorTotal,
		descontosTotalPersistido,
		custoTotal,
		descontoAprovacaoId,
		salePayments,
	};
}
export type TPreparedSaleCreation = Awaited<ReturnType<typeof prepareSaleCreation>>;

export async function persistSaleCreation({
	tx,
	actor,
	prepared,
	terminalAttempt,
}: {
	tx: DBTransaction;
	actor: TSaleActor;
	prepared: TPreparedSaleCreation;
	// Venda nascida na maquininha com perna de cartão: a tentativa nasce atribuída ao próprio dispositivo.
	terminalAttempt?: { chaveIdempotencia: string; fingerprintEntrada: string; origem: "DISPOSITIVO" } | null;
}) {
	const { orgId, input, validatedRewards, productCostMap, variantCostMap } = prepared;
	const device = actor.kind === "DEVICE" ? actor : null;

	const insertedSale = await tx
		.insert(sales)
		.values({
			organizacaoId: orgId,
			clienteId: input.clienteId ?? null,
			idExterno: `${device ? "TERM" : "POS"}-${Date.now()}`,
			valorTotal: prepared.valorTotal,
			descontosTotal: prepared.descontosTotalPersistido > 0 ? prepared.descontosTotalPersistido : null,
			acrescimosTotal: input.acrescimosTotal ?? null,
			custoTotal: prepared.custoTotal,
			vendedorNome: input.vendedorNome ?? (device ? device.deviceName : actor.kind === "USER" ? actor.session.user.nome : ""),
			vendedorId: input.vendedorId ?? null,
			entregaModalidade: input.entregaModalidade ?? null,
			entregaLocalizacaoId: input.entregaLocalizacaoId ?? null,
			comandaNumero: input.comandaNumero ?? null,
			observacoes: input.observacoes ?? null,
			rascunhoMetadados: {
				...((input.rascunhoMetadados as Record<string, unknown> | null) ?? {}),
				...(device ? { origem: "TERMINAL", dispositivoId: device.deviceId } : {}),
				cupom: input.cupomResgate ?? null,
				...buildRewardSnapshotsMetadataKeys(buildSaleRewardDraftSnapshots(validatedRewards)),
			},
			parceiro: "",
			chave: "",
			documento: "",
			modelo: "",
			movimento: "RECEITAS",
			natureza: "",
			serie: "SN01",
			situacao: "",
			tipo: "Venda de produtos",
			canal: "POS",
			processamentoOrigem: "INTERNO",
			statusVenda: "ORCAMENTO",
			emissaoFiscalAutomatica: prepared.emissaoFiscalAutomatica,
			emissaoFiscalDocumento: prepared.emissaoFiscalDocumento,
		})
		.returning({ id: sales.id });

	const newSaleId = insertedSale[0]?.id;
	if (!newSaleId) throw new createHttpError.InternalServerError("Erro ao criar venda.");

	// One-shot: a aprovação de desconto é consumida na mesma transação da venda (impede reuso).
	if (prepared.descontoAprovacaoId) {
		await consumeSaleDiscountApproval({ tx, aprovacaoId: prepared.descontoAprovacaoId, vendaId: newSaleId });
	}

	for (const item of input.itens) {
		const valorCustoUnitario = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);

		const insertedItem = await tx
			.insert(saleItems)
			.values({
				organizacaoId: orgId,
				vendaId: newSaleId,
				clienteId: input.clienteId ?? null,
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				quantidade: item.quantidade,
				valorVendaUnitario: item.valorUnitarioFinal,
				valorCustoUnitario,
				valorVendaTotalBruto: item.valorTotalBruto,
				valorTotalDesconto: item.valorDesconto,
				valorVendaTotalLiquido: item.valorTotalLiquido,
				valorCustoTotal: valorCustoUnitario * item.quantidade,
				observacoes: item.observacoes ?? null,
				metadados: {
					itemChave: item.chave ?? null,
					nome: item.nome,
					codigo: item.codigo,
					imagemUrl: item.imagemUrl ?? null,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId ?? null,
					valorUnitarioBase: item.valorUnitarioBase,
					valorModificadores: item.valorModificadores,
					modificadores: item.modificadores.map((mod) => ({
						opcaoId: mod.opcaoId,
						nome: mod.nome,
						quantidade: mod.quantidade,
						valorUnitario: mod.valorUnitario,
						valorTotal: mod.valorTotal,
					})),
				},
			})
			.returning({ id: saleItems.id });

		const newItemId = insertedItem[0]?.id;
		if (!newItemId) throw new createHttpError.InternalServerError("Erro ao criar item da venda.");

		if (item.modificadores.length > 0) {
			await tx.insert(saleItemModifiers).values(
				item.modificadores.map((mod) => ({
					itemVendaId: newItemId,
					opcaoId: mod.opcaoId,
					nome: mod.nome,
					quantidade: mod.quantidade,
					valorUnitario: mod.valorUnitario,
					valorTotal: mod.valorTotal,
				})),
			);
		}
	}

	// Itens das recompensas: construídos pelo servidor (100% de desconto, custo real do catálogo).
	if (validatedRewards.length > 0) {
		await tx.insert(saleItems).values(
			buildRewardSaleItemsValues({
				organizacaoId: orgId,
				vendaId: newSaleId,
				clienteId: input.clienteId ?? null,
				rewards: validatedRewards,
			}),
		);
	}

	const confirmation = await processSaleConfirmationInTransaction({
		tx,
		input: {
			validatePOSFiscalEmission: true,
			organization: prepared.organization,
			saleId: newSaleId,
			salePayments: prepared.salePayments,
			saleAuthorId: actor.kind === "USER" ? actor.session.user.id : null,
			saleClientId: input.clienteId ?? null,
			saleCashbackProgramId: input.cashbackProgramaId,
			saleCashbackRedemptionValue: input.cashbackResgate,
			saleRewardRedemptions: toSaleRewardRedemptionInputs(validatedRewards),
			saleCouponGift: input.cupomResgate?.brinde ?? null,
			saleCouponId: input.cupomResgate?.cupomId ?? null,
			saleCouponDeclaredDiscountValue: input.cupomResgate?.valorDesconto ?? null,
			accountingEntryDebitAccountId: prepared.accountingEntryDebitAccountId,
			accountingEntryCreditAccountId: prepared.accountingEntryCreditAccountId,
			sessaoVendaId: prepared.sessaoVendaId,
			terminalAttempt: terminalAttempt ?? null,
		},
	});

	return { saleId: newSaleId, confirmation };
}

/** Pós-commit: emissão fiscal automática (pela política da organização) e impressões. */
export function finishSaleCreation({ actor, prepared, saleId }: { actor: TSaleActor; prepared: TPreparedSaleCreation; saleId: string }) {
	return processSaleConfirmationPostCommit({
		organization: prepared.organization,
		saleId,
		saleAuthorId: actor.kind === "USER" ? actor.session.user.id : null,
	});
}

/** As três etapas em sequência, com a transação aberta aqui — o caminho do PDV web. */
export async function createAndConfirmSale({ actor, input }: { actor: TSaleActor; input: TCreateAndConfirmSaleInput }) {
	const prepared = await prepareSaleCreation({ actor, input });
	const transactionResult = await db.transaction((tx) => persistSaleCreation({ tx, actor, prepared }));
	const fiscal = await finishSaleCreation({ actor, prepared, saleId: transactionResult.saleId });
	const confirmation = { ...transactionResult.confirmation, fiscal };

	return {
		data: {
			saleId: transactionResult.saleId,
			confirmation,
		},
		message: "Venda finalizada com sucesso.",
	};
}
