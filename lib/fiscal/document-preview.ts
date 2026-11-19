import type { TFiscalCreditCart } from "@/schemas/fiscal";
import { computeSaleTaxation, type TSaleTaxation } from "./taxation-context";
import { inArray, and, eq } from "drizzle-orm";
import { productFiscalProfiles, fiscalTaxGroups } from "@/services/drizzle/schema";
import type { TFiscalSaleChoices } from "@/schemas/fiscal";
import { getFiscalCreditChoiceProblems, getFiscalCreditCompetence } from "./simples-credit";
import { loadCurrentFiscalCreditRates } from "./credit-rates";
import { db } from "@/services/drizzle";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import { isValidCpfCnpj } from "@/lib/validation";
import createHttpError from "http-errors";
import { isOrganizationFiscalDocumentCapable } from "./auto-emission-capability";
import { getFiscalRecipientIssues, selectFiscalDocumentType, type TSaleFiscalDocument } from "./emission-document-policy";
import { resolveOperationProfileForSale } from "./operation-profile";
import { resolveAutoDocumentType } from "./sale-fiscal-signals";
import { findActiveFiscalSeries, loadFiscalOrganization, type TFiscalReadDatabase } from "./settings";
import { resolveAutoEmissionException } from "./auto-emission-policy";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import type { TPaymentMethodEnum } from "@/schemas/enums";

export type TFiscalPreviewInput = TFiscalSaleChoices & {
	cart?: TFiscalCreditCart;
	organizationId: string;
	clienteId?: string | null;
	entregaLocalizacaoId?: string | null;
	entregaModalidade: TDeliveryModeEnum;
	canal?: string | null;
	emissaoFiscalDocumento?: TSaleFiscalDocument | null;
	saleId?: string | null;
};

// Apenas metadados públicos de configuração. Nunca retorna a configuração fiscal ou chaves.
export async function getFiscalDocumentConfiguration({
	organization,
	tipo,
	signals,
	database = db,
}: {
	organization: NonNullable<Awaited<ReturnType<typeof loadFiscalOrganization>>>;
	tipo: TSaleFiscalDocument;
	signals: { canal?: string | null; entregaModalidade?: string | null };
	database?: TFiscalReadDatabase;
}) {
	const config = organization.fiscalConfiguracao;
	const problemas: string[] = [];
	let serie: string | null = null;
	let perfil: string | null = null;
	let consumidorFinal: boolean | null = null;
	if (!isOrganizationFiscalDocumentCapable(organization, tipo))
		problemas.push(`Credenciais ou certificado de ${tipo === "NFE" ? "NF-e" : "NFC-e"} não configurados.`);
	if (config?.spedy?.certificado?.validTo && new Date(config.spedy.certificado.validTo) <= new Date())
		problemas.push("O certificado fiscal está vencido.");
	try {
		const operation = await resolveOperationProfileForSale({
			database,
			organizacaoId: organization.id,
			tipoDocumento: tipo,
			signals,
			operacaoPadraoPorTipoId: config?.operacaoPadraoPorTipo?.[tipo],
		});
		perfil = operation.nome;
		consumidorFinal = operation.consumidorFinal;
		const series =
			operation.seriePadrao ??
			(await findActiveFiscalSeries({ organizacaoId: organization.id, tipoDocumento: tipo, ambiente: config?.ambiente ?? "HOMOLOGACAO", database }));
		if (!series?.ativo || series.ambiente !== config?.ambiente || series.tipoDocumento !== tipo || series.organizacaoId !== organization.id) {
			problemas.push("Configure uma série ativa do modelo no ambiente fiscal atual.");
		} else serie = series.serie;
	} catch (error) {
		if (!createHttpError.isHttpError(error) || error.statusCode >= 500) throw error;
		problemas.push(error.message);
	}
	return { tipo, configurado: problemas.length === 0, serie, perfil, problemas, consumidorFinal };
}

export async function getFiscalDocumentPreview(input: TFiscalPreviewInput, database: TFiscalReadDatabase = db) {
	const [organization, initialClient, sale] = await Promise.all([
		loadFiscalOrganization(input.organizationId, database),
		input.clienteId
			? database.query.clients.findFirst({ where: (f, o) => o.and(o.eq(f.id, input.clienteId!), o.eq(f.organizacaoId, input.organizationId)) })
			: null,
		input.saleId
			? database.query.sales.findFirst({
					where: (f, o) => o.and(o.eq(f.id, input.saleId!), o.eq(f.organizacaoId, input.organizationId)),
					with: { itens: true, documentosFiscais: { columns: { id: true, tipo: true, statusInterno: true } } },
				})
			: null,
	]);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	const client =
		initialClient ??
		(input.clienteId === undefined && sale?.clienteId
			? await database.query.clients.findFirst({ where: (f, o) => o.and(o.eq(f.id, sale.clienteId!), o.eq(f.organizacaoId, input.organizationId)) })
			: null);
	if (input.clienteId && !client) throw new createHttpError.NotFound("Cliente não encontrado nesta organização.");
	if (input.saleId && !sale) throw new createHttpError.NotFound("Venda não encontrada nesta organização.");
	const locationId = input.entregaLocalizacaoId === undefined ? sale?.entregaLocalizacaoId : input.entregaLocalizacaoId;
	const location =
		locationId && client
			? await database.query.clientLocations.findFirst({
					where: (f, o) => o.and(o.eq(f.id, locationId!), o.eq(f.clienteId, client.id), o.eq(f.organizacaoId, input.organizationId)),
				})
			: null;
	if (locationId && !location) throw new createHttpError.NotFound("Endereço não encontrado para este cliente.");
	const address = location ?? client;
	const cpfCnpjValid = isValidCpfCnpj(client?.cpfCnpj ?? "");
	const addressComplete =
		!!address &&
		[address.localizacaoCep, address.localizacaoEstado, address.localizacaoCidade, address.localizacaoBairro, address.localizacaoLogradouro].every(
			(value) => !!value?.trim(),
		);
	const signals = { canal: sale?.canal ?? input.canal ?? "POS", entregaModalidade: input.entregaModalidade, destinatarioCpfCnpj: client?.cpfCnpj };
	const configurations = await Promise.all(
		(["NFE", "NFCE"] as const).map((tipo) => getFiscalDocumentConfiguration({ organization, tipo, signals, database })),
	);
	const opcoes = configurations.map((option) => {
		const problemasCliente = getFiscalRecipientIssues({
			tipo: option.tipo,
			entregaModalidade: input.entregaModalidade,
			cpfCnpjValid,
			addressComplete,
			ufOrigem: organization.fiscalConfiguracao?.endereco?.uf,
			ufDestino: address?.localizacaoEstado,
		});
		const problemas = [...option.problemas, ...problemasCliente];
		return { ...option, disponivel: problemas.length === 0, problemas, problemasCliente };
	});
	const tipo = selectFiscalDocumentType({
		requested: input.emissaoFiscalDocumento === undefined ? sale?.emissaoFiscalDocumento : input.emissaoFiscalDocumento,
		signals,
		nfeConfigured: opcoes.find((option) => option.tipo === "NFE")!.configurado,
	});
	const selected = opcoes.find((option) => option.tipo === tipo)!;
	const preferred = resolveAutoDocumentType(signals);
	const documentoExistente = sale?.documentosFiscais.find((document) => !["CANCELADO", "INUTILIZADO"].includes(document.statusInterno ?? "")) ?? null;
	const creditoHabilitado = !!organization.fiscalConfiguracao?.operacoesRevenda?.habilitada && tipo === "NFE";
	const competencia = getFiscalCreditCompetence();
	const escolhas = {
		fiscalDestinacao: input.fiscalDestinacao !== undefined ? input.fiscalDestinacao : (sale?.fiscalDestinacao ?? null),
		fiscalCreditoIcms: input.fiscalCreditoIcms !== undefined ? input.fiscalCreditoIcms : (sale?.fiscalCreditoIcms ?? null),
	};
	const problemasCredito = getFiscalCreditChoiceProblems({
		enabled: creditoHabilitado,
		tipo,
		choices: escolhas,
		regimeTributario: organization.fiscalConfiguracao?.regimeTributario ?? 1,
		cpfCnpj: client?.cpfCnpj,
		indicador: client?.indicadorInscricaoEstadual,
	});
	const percentuais = creditoHabilitado ? await loadCurrentFiscalCreditRates(input.organizationId, competencia) : [];
	let calculo: TSaleTaxation["credito"] | null = null;
	let itensCredito: { produtoId: string; csosn: string; percentual: number | null; valor: number | null }[] = [];
	if (creditoHabilitado && (input.cart || sale)) {
		try {
			const operation = await resolveOperationProfileForSale({
				organizacaoId: organization.id,
				tipoDocumento: "NFE",
				signals,
				operacaoPadraoPorTipoId: organization.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE,
				database,
			});
			const cart = input.cart;
			const items = cart
				? cart.itens.map((item, index) => ({
						...item,
						id: String(index),
						produtoVarianteId: item.produtoVarianteId ?? null,
						valorVendaTotalLiquido: item.valorVendaTotalBruto - item.valorTotalDesconto,
						metadados: null,
					}))
				: sale!.itens;
			const ids = [...new Set(items.map((item) => item.produtoId))];
			const profiles = ids.length
				? await database.query.productFiscalProfiles.findMany({
						where: and(eq(productFiscalProfiles.organizacaoId, organization.id), inArray(productFiscalProfiles.produtoId, ids)),
					})
				: [];
			const groupIds = [...new Set(profiles.map((p) => p.grupoTributarioId).filter((id): id is string => !!id))];
			const groups = groupIds.length
				? await database.query.fiscalTaxGroups.findMany({
						where: and(eq(fiscalTaxGroups.organizacaoId, organization.id), inArray(fiscalTaxGroups.id, groupIds)),
						with: { regras: true },
					})
				: [];
			const taxation = computeSaleTaxation({
				organizacao: organization,
				operacao: operation,
				perfisProdutos: profiles,
				gruposTributarios: groups,
				ibptRates: [],
				percentuaisCredito: percentuais,
				destinatarioSnapshot: client
					? { cpfCnpj: client.cpfCnpj, indicadorInscricaoEstadual: client.indicadorInscricaoEstadual, endereco: { estado: address?.localizacaoEstado } }
					: null,
				venda: {
					itens: items,
					valorTotal: cart?.valorTotal ?? sale!.valorTotal,
					descontosTotal: cart?.descontosTotal ?? sale?.descontosTotal ?? null,
					acrescimosTotal: cart?.acrescimosTotal ?? sale?.acrescimosTotal ?? null,
					entregaModalidade: input.entregaModalidade,
					integracaoMetadados: cart ? null : (sale?.integracaoMetadados ?? null),
					rascunhoMetadados: cart ? { shop: { entrega: { taxa: cart.taxaEntrega } } } : (sale?.rascunhoMetadados ?? null),
					...escolhas,
				},
			});
			problemasCredito.splice(
				0,
				problemasCredito.length,
				...new Set([...problemasCredito, ...taxation.erros.filter((e) => e.severidade === "ERRO").map((e) => e.mensagem)]),
			);
			calculo = taxation.credito;
			itensCredito = taxation.itens.map(({ result }) => ({
				produtoId: result.produtoId,
				csosn: result.icms.csosn,
				percentual: result.icms.pCredSN,
				valor: result.icms.vCredICMSSN,
			}));
		} catch (error) {
			if (!createHttpError.isHttpError(error)) throw error;
			problemasCredito.push(error.message);
		}
	}

	return {
		creditoIcms: {
			habilitado: creditoHabilitado,
			destinacaoSugerida: selected.consumidorFinal === false ? ("REVENDA_INDUSTRIALIZACAO" as const) : ("CONSUMO_FINAL" as const),
			competencia,
			escolhas,
			calculo,
			itens: itensCredito,
			percentuais: percentuais.map((p) => ({ grupoTributarioId: p.grupoTributarioId, percentual: p.percentual })),
			problemas: problemasCredito,
		},
		tipo,
		serie: selected.serie,
		perfil: selected.perfil,
		disponivel: selected.disponivel && !documentoExistente,
		problemas: [...selected.problemas, ...(documentoExistente ? ["Esta venda já possui documento fiscal. Use o documento existente."] : [])],
		motivo: input.emissaoFiscalDocumento
			? "Modelo escolhido para esta venda."
			: preferred === "NFE" && tipo === "NFCE"
				? "NF-e não configurada para esta operação. O automático selecionou NFC-e."
				: tipo === "NFE"
					? client?.cpfCnpj?.replace(/\D/g, "").length === 14
						? "Cliente com CNPJ. O automático selecionou NF-e."
						: "Canal ou modalidade da venda indica NF-e."
					: "O automático selecionou NFC-e para esta venda.",
		opcoes,
		documentoExistente,
		atrasoMinutos: organization.fiscalConfiguracao?.emissaoAutomatica?.atrasoMinutos ?? 0,
	};
}

export async function assertSaleFiscalDocumentReady(input: TFiscalPreviewInput, database: TFiscalReadDatabase = db) {
	const preview = await getFiscalDocumentPreview(input, database);
	if (!preview.disponivel) throw new createHttpError.BadRequest(preview.problemas.join(" "));
	return preview;
}

export async function assertPOSFiscalEmissionReady(
	input: TFiscalPreviewInput & {
		organization: TOrganizationEntity;
		emissaoFiscalAutomatica: boolean | null;
		metodos: TPaymentMethodEnum[];
	},
	database: TFiscalReadDatabase = db,
) {
	const enabled = input.emissaoFiscalAutomatica ?? input.organization.fiscalEmissaoAutomatica;
	if (!enabled) return;
	if (
		input.emissaoFiscalAutomatica === null &&
		resolveAutoEmissionException({ metodos: input.metodos, excecoes: input.organization.fiscalConfiguracao?.emissaoAutomatica?.excecoes })
	)
		return;
	await assertSaleFiscalDocumentReady(input, database);
}
