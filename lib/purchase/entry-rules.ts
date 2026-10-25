import type { TAcquisitionNatureEnum } from "@/schemas/enums";

/**
 * Regras de entrada que não dependem de banco: o que o CFOP do emitente diz sobre cada linha e
 * qual destinação uma aquisição recebe por padrão. Puro e testado; o import e o builder consomem
 * daqui (ADR-0002, decisão 3). A natureza da operação NÃO é guardada — é decidida aqui, na hora.
 */

export type TEntryLineDisposition = { tipo: "COMPRA" } | { tipo: "BONIFICACAO" } | { tipo: "FORA"; motivo: string };

// Prefixo 5/6/7 = operação de saída do emitente (dentro/fora do estado/exterior). O sufixo diz a
// natureza. Lista enxuta: cobre o que chega como NF-e de fornecedor; o que não está aqui é compra.
const BONIFICATION_SUFFIXES = new Set(["910"]);
const OUTSIDE_SUFFIXES: Record<string, string> = {
	"917": "Remessa em consignação: a mercadoria ainda é do fornecedor até ser vendida ou devolvida.",
	"918": "Devolução de consignação.",
	"919": "Devolução simbólica de consignação.",
	"915": "Remessa para conserto ou reparo: não é aquisição.",
	"916": "Retorno de conserto ou reparo.",
	"908": "Remessa em comodato: o bem continua do fornecedor.",
	"909": "Retorno de comodato.",
	"912": "Remessa para demonstração.",
	"913": "Retorno de demonstração.",
	"914": "Remessa em consignação (outro tipo).",
	"920": "Remessa de vasilhame ou sacaria.",
	"921": "Retorno de vasilhame ou sacaria.",
	"923": "Remessa por conta e ordem de terceiros: a compra é outra nota.",
	"924": "Remessa para industrialização por conta e ordem.",
	"925": "Retorno de industrialização.",
	"949": "Outra saída não especificada: confira a natureza da operação na nota.",
	"152": "Transferência entre estabelecimentos da mesma empresa.",
	"153": "Transferência de energia.",
	"155": "Transferência de produção para outro estabelecimento.",
	"156": "Transferência de mercadoria para outro estabelecimento.",
	"201": "Devolução de compra: é o fornecedor devolvendo, não vendendo.",
	"202": "Devolução de venda do seu cliente: entra pelo fluxo de devolução, não como compra.",
	"411": "Devolução de compra com ST.",
	"412": "Devolução de venda com ST.",
};

export function getCfopSuffix(cfop: string | null | undefined) {
	const digits = (cfop ?? "").replace(/\D/g, "");
	return digits.length === 4 ? digits.slice(1) : null;
}

/**
 * O que a linha é para quem recebe. `finNFe = 4` (devolução) e `finNFe = 2` (complementar) são
 * decididos no cabeçalho antes de chegar aqui; por linha só o CFOP conta.
 */
export function resolveEntryLineDisposition({ cfop }: { cfop: string | null | undefined }): TEntryLineDisposition {
	const suffix = getCfopSuffix(cfop);
	if (!suffix) return { tipo: "COMPRA" };
	if (BONIFICATION_SUFFIXES.has(suffix)) return { tipo: "BONIFICACAO" };
	const motivo = OUTSIDE_SUFFIXES[suffix];
	if (motivo) return { tipo: "FORA", motivo: `CFOP ${cfop}: ${motivo}` };
	return { tipo: "COMPRA" };
}

/**
 * Destinação sugerida para uma linha: o que o de-para lembrou para este código do fornecedor
 * ganha do cadastro do produto, que ganha de "revenda".
 */
export function resolveDefaultDestination({
	mappingDestination,
	productNature,
}: {
	mappingDestination?: TAcquisitionNatureEnum | null;
	productNature?: TAcquisitionNatureEnum | null;
}): TAcquisitionNatureEnum {
	return mappingDestination ?? productNature ?? "REVENDA";
}

export const ACQUISITION_NATURE_LABELS: Record<TAcquisitionNatureEnum, string> = {
	REVENDA: "Revenda",
	INSUMO: "Insumo",
	USO_CONSUMO: "Uso e consumo",
	ATIVO_IMOBILIZADO: "Ativo imobilizado",
};

/** Destinações que o recebimento já sabe tratar. Ativo imobilizado chega com o patrimônio (Fase 7). */
export const SUPPORTED_PURCHASE_DESTINATIONS: TAcquisitionNatureEnum[] = ["REVENDA", "INSUMO", "USO_CONSUMO"];

/** Combinação de cadastro que merece aviso, não bloqueio. */
export function getProductNatureWarning({ natureza, vendavel }: { natureza: TAcquisitionNatureEnum; vendavel: boolean }): string | null {
	if (natureza === "ATIVO_IMOBILIZADO" && vendavel) return "Um bem do ativo imobilizado não costuma ser vendável.";
	if (natureza === "USO_CONSUMO" && vendavel) return "Material de uso e consumo não costuma ser vendável.";
	return null;
}
