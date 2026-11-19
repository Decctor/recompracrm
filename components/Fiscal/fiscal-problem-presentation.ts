import type { TFiscalDocumentAction, TFiscalDocumentActionKey } from "@/lib/fiscal/document-actions";
import type { TFiscalProblem, TFiscalProblemOrigin, TFiscalProblemTargetType } from "@/lib/fiscal/problems";
import type { TFiscalRejectionCategory } from "@/lib/fiscal/rejections";
import { appRoutes } from "@/lib/navigation/routes";

/**
 * Apresentacao compartilhada de problemas e acoes fiscais: labels, cores e para onde cada CTA
 * leva. Usada pelo modulo fiscal e pelas superficies da venda, para que o mesmo problema tenha
 * o mesmo botao em qualquer tela.
 */

export const FISCAL_PROBLEM_CATEGORY_LABELS: Record<TFiscalRejectionCategory, string> = {
	CADASTRO: "Cadastro",
	TRIBUTARIO: "Tributário",
	CERTIFICADO: "Certificado",
	NUMERACAO: "Numeração",
	SCHEMA: "Integração",
	DUPLICIDADE: "Duplicidade",
	INFRAESTRUTURA: "Infraestrutura",
	OUTRO: "Outro",
};

export const FISCAL_PROBLEM_ORIGIN_LABELS: Record<TFiscalProblemOrigin, string> = {
	PRONTIDAO: "Configuração",
	VALIDACAO: "Validação",
	PROVEDOR: "Provedor",
	SEFAZ: "SEFAZ",
};

export const FISCAL_ACTION_LABELS: Record<TFiscalDocumentActionKey, string> = {
	CANCELAR: "Cancelar",
	CARTA_CORRECAO: "Carta de correção",
	INUTILIZAR: "Inutilizar numeração",
	DEVOLUCAO: "Gerar devolução",
	REENVIAR: "Reenviar",
	SINCRONIZAR: "Atualizar status",
	BAIXAR_XML: "Baixar XML",
	BAIXAR_PDF: "Baixar DANFE",
};

export type TFiscalProblemCta =
	| { kind: "product-profile"; label: string; produtoId: string }
	| { kind: "link"; label: string; href: string }
	| { kind: "sync-company"; label: string }
	| { kind: "none"; label: string };

/**
 * Traduz o alvo de um problema no botao que o resolve. `PRODUTO`/`GRUPO_TRIBUTARIO` abrem o
 * perfil fiscal inline; o resto navega para a tela certa. Sem alvo, nao ha botao — a mensagem
 * completa e o que resta.
 */
export function resolveFiscalProblemCta(problem: TFiscalProblem, context: { vendaId?: string | null } = {}): TFiscalProblemCta {
	if (problem.codigo === "CREDITO_SN_CONFIGURACAO")
		return { kind: "link", label: "Configurar crédito de ICMS", href: "/dashboard/fiscal?view=configuration&section=credit-rates" };
	const { alvo } = problem;
	switch (alvo.tipo) {
		case "PRODUTO":
			return alvo.id
				? { kind: "product-profile", label: "Cadastrar perfil fiscal", produtoId: alvo.id }
				: { kind: "link", label: "Ver produtos", href: appRoutes.catalog.products() };
		case "GRUPO_TRIBUTARIO":
			return alvo.id
				? { kind: "product-profile", label: "Vincular grupo tributário", produtoId: alvo.id }
				: { kind: "link", label: "Grupos tributários", href: appRoutes.fiscal.configuration("tax-groups") };
		case "SERIE":
			return { kind: "link", label: "Configurar série", href: appRoutes.fiscal.configuration("series") };
		case "PERFIL_OPERACAO":
			return { kind: "link", label: "Perfis de operação", href: appRoutes.fiscal.configuration("operation-profiles") };
		case "CONFIGURACAO_FISCAL":
			return { kind: "link", label: "Configuração fiscal", href: appRoutes.fiscal.configuration("company") };
		case "CERTIFICADO":
			return { kind: "link", label: "Renovar certificado", href: appRoutes.fiscal.configuration("certificate") };
		case "EMPRESA_PROVEDOR":
			return { kind: "sync-company", label: "Sincronizar empresa" };
		case "CLIENTE":
			return alvo.id
				? { kind: "link", label: "Abrir cliente", href: appRoutes.customers.details(alvo.id) }
				: { kind: "link", label: "Clientes", href: appRoutes.customers.root() };
		case "PAGAMENTOS":
		case "VENDA": {
			const vendaId = alvo.id ?? context.vendaId;
			return vendaId ? { kind: "link", label: "Abrir venda", href: appRoutes.sales.details(vendaId) } : { kind: "none", label: problem.acaoSugerida };
		}
		default:
			return { kind: "none", label: problem.acaoSugerida };
	}
}

export const FISCAL_PROBLEM_TARGET_LABELS: Record<TFiscalProblemTargetType, string> = {
	PRODUTO: "Produto",
	GRUPO_TRIBUTARIO: "Grupo tributário",
	SERIE: "Série fiscal",
	PERFIL_OPERACAO: "Perfil de operação",
	CONFIGURACAO_FISCAL: "Configuração fiscal",
	CERTIFICADO: "Certificado digital",
	EMPRESA_PROVEDOR: "Empresa no provedor",
	CLIENTE: "Cliente",
	PAGAMENTOS: "Pagamentos da venda",
	VENDA: "Venda",
	NENHUM: "Sem alvo",
};

// Primeiro problema que exige o operador — e o que vira a CTA primaria de um card.
export function pickPrimaryFiscalProblem(problems: TFiscalProblem[]): TFiscalProblem | null {
	return (
		problems.find((problem) => !problem.resolvidoAutomaticamente && problem.alvo.tipo !== "NENHUM") ??
		problems.find((problem) => !problem.resolvidoAutomaticamente) ??
		problems[0] ??
		null
	);
}

export function findFiscalAction(actions: TFiscalDocumentAction[] | undefined, key: TFiscalDocumentActionKey): TFiscalDocumentAction | null {
	return actions?.find((action) => action.acao === key) ?? null;
}

// "12 min restantes" / "3h 20min restantes" / null quando ja passou.
export function formatRemainingTime(deadline: Date | string, now: Date = new Date()): string | null {
	const remainingMs = new Date(deadline).getTime() - now.getTime();
	if (remainingMs <= 0) return null;
	const totalMinutes = Math.floor(remainingMs / 60_000);
	if (totalMinutes < 1) return "menos de 1 min restante";
	if (totalMinutes < 60) return `${totalMinutes} min restantes`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}min restantes` : `${hours}h restantes`;
	const days = Math.floor(hours / 24);
	return `${days} dia${days > 1 ? "s" : ""} restante${days > 1 ? "s" : ""}`;
}
