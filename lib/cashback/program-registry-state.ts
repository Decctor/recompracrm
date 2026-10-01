import type { TGetCashbackProgramOutput, TUpdateCashbackProgramInput } from "@/app/api/cashback-programs/route";
import { NO_CASHBACK_REDEMPTION_SURFACE_MESSAGE, hasAnyCashbackRedemptionSurface } from "@/lib/cashback/redemption-policy";

export type TCashbackProgram = Exclude<TGetCashbackProgramOutput["data"], null>;
export type TCashbackProgramDraft = TUpdateCashbackProgramInput["cashbackProgram"];
export type TCashbackProgramSection = "general" | "accumulation" | "redemption" | "surfaces";

/**
 * Campos que cada seção da aba Meu Programa edita. Quem não está na lista da seção vai para a API
 * com o valor do servidor, então duas seções com rascunho aberto não se atropelam (mesmo desenho de
 * `lib/coupons/coupon-registry-state.ts`). `ativo` não é de seção nenhuma: é ação do cabeçalho.
 */
const SECTION_FIELDS: Record<TCashbackProgramSection, (keyof TCashbackProgramDraft)[]> = {
	general: ["titulo", "descricao", "terminologia"],
	accumulation: [
		"acumuloTipo",
		"acumuloValor",
		"acumuloValorParceiro",
		"acumuloRegraValorMinimo",
		"acumuloPermitirViaIntegracao",
		"acumuloPermitirViaPontoIntegracao",
		"expiracaoRegraValidadeValor",
	],
	redemption: ["modalidadeDescontosPermitida", "resgateLimiteTipo", "resgateLimiteValor", "modalidadeRecompensasPermitida"],
	surfaces: ["resgatePermitirViaPos", "resgatePermitirViaPontoIntegracao", "resgatePermitirViaLojaDigital"],
};

export function mapCashbackProgramToDraft(program: TCashbackProgram): TCashbackProgramDraft {
	return {
		ativo: program.ativo,
		titulo: program.titulo,
		descricao: program.descricao,
		terminologia: program.terminologia,
		modalidadeDescontosPermitida: program.modalidadeDescontosPermitida,
		modalidadeRecompensasPermitida: program.modalidadeRecompensasPermitida,
		acumuloTipo: program.acumuloTipo,
		acumuloValor: program.acumuloValor,
		acumuloValorParceiro: program.acumuloValorParceiro,
		acumuloRegraValorMinimo: program.acumuloRegraValorMinimo,
		acumuloPermitirViaIntegracao: program.acumuloPermitirViaIntegracao,
		acumuloPermitirViaPontoIntegracao: program.acumuloPermitirViaPontoIntegracao,
		resgatePermitirViaPos: program.resgatePermitirViaPos,
		resgatePermitirViaPontoIntegracao: program.resgatePermitirViaPontoIntegracao,
		resgatePermitirViaLojaDigital: program.resgatePermitirViaLojaDigital,
		expiracaoRegraValidadeValor: program.expiracaoRegraValidadeValor,
		resgateLimiteTipo: program.resgateLimiteTipo,
		resgateLimiteValor: program.resgateLimiteValor,
	};
}

export function buildCashbackProgramSectionUpdateInput({
	program,
	draft,
	section,
}: {
	program: TCashbackProgram;
	draft: TCashbackProgramDraft;
	section: TCashbackProgramSection;
}): TUpdateCashbackProgramInput {
	const persisted = mapCashbackProgramToDraft(program);
	const sectionValues = Object.fromEntries(SECTION_FIELDS[section].map((field) => [field, draft[field]]));
	const cashbackProgram: TCashbackProgramDraft = { ...persisted, ...sectionValues };
	// Sem a modalidade de desconto o teto por compra não significa nada: não deixar lixo gravado.
	if (!cashbackProgram.modalidadeDescontosPermitida) {
		cashbackProgram.resgateLimiteTipo = null;
		cashbackProgram.resgateLimiteValor = null;
	}
	return { cashbackProgramId: program.id, cashbackProgram };
}

/** Motivo que impede aplicar a seção, ou `null`. Mostrado no lugar do aviso da barra de aplicar. */
export function getCashbackProgramSectionBlockReason({ draft, section }: { draft: TCashbackProgramDraft; section: TCashbackProgramSection }) {
	if (section === "general" && !draft.titulo.trim()) return "Dê um título ao programa.";
	if (section === "accumulation") {
		if (draft.acumuloValor < 0 || draft.acumuloValorParceiro < 0) return "O valor de acúmulo não pode ser negativo.";
		if (draft.acumuloTipo === "PERCENTUAL" && (draft.acumuloValor > 100 || draft.acumuloValorParceiro > 100))
			return "Um acúmulo percentual não passa de 100%.";
		if (draft.expiracaoRegraValidadeValor < 0) return "A validade não pode ser negativa.";
	}
	if (section === "redemption" && draft.modalidadeDescontosPermitida && draft.resgateLimiteTipo) {
		const limit = draft.resgateLimiteValor ?? 0;
		if (!(limit > 0)) return "Defina o valor do limite por compra, ou escolha SEM LIMITE.";
		if (draft.resgateLimiteTipo === "PERCENTUAL" && limit > 100) return "O limite percentual não passa de 100%.";
	}
	if (section === "surfaces" && !hasAnyCashbackRedemptionSurface(draft)) return NO_CASHBACK_REDEMPTION_SURFACE_MESSAGE;
	return null;
}
