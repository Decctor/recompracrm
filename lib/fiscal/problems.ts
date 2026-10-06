import type { TFiscalValidationError } from "./engine/types";
import { getFiscalRejectionInfo, type TFiscalRejectionCategory } from "./rejections";

/**
 * Problema fiscal como dado: o que travou, de onde veio, o que fazer e sobre qual alvo agir.
 * E o que a UI renderiza (chip + CTA); `mensagens` continua guardando o texto bruto do provedor.
 */

export type TFiscalProblemOrigin = "PRONTIDAO" | "VALIDACAO" | "PROVEDOR" | "SEFAZ";

export type TFiscalProblemTargetType =
	| "PRODUTO"
	| "GRUPO_TRIBUTARIO"
	| "SERIE"
	| "PERFIL_OPERACAO"
	| "CONFIGURACAO_FISCAL"
	| "CERTIFICADO"
	| "EMPRESA_PROVEDOR"
	| "CLIENTE"
	| "PAGAMENTOS"
	| "VENDA"
	| "NENHUM";

export type TFiscalProblemTarget = {
	tipo: TFiscalProblemTargetType;
	id: string | null;
	rotulo: string | null;
};

export type TFiscalProblem = {
	codigo: string;
	origem: TFiscalProblemOrigin;
	categoria: TFiscalRejectionCategory;
	mensagem: string;
	acaoSugerida: string;
	alvo: TFiscalProblemTarget;
	// Apos corrigir a causa, o mesmo documento pode ser reenviado?
	reenviavel: boolean;
	// O worker resolve sozinho (backoff) — o operador nao precisa agir.
	resolvidoAutomaticamente: boolean;
};

type ProblemSpec = Omit<TFiscalProblem, "alvo" | "mensagem"> & { alvo: TFiscalProblemTargetType };

const NO_TARGET: TFiscalProblemTarget = { tipo: "NENHUM", id: null, rotulo: null };

function target(tipo: TFiscalProblemTargetType, id: string | null = null, rotulo: string | null = null): TFiscalProblemTarget {
	return { tipo, id, rotulo };
}

/**
 * Catalogo dos problemas detectados antes do provedor (prontidao/validacao). Cada entrada e o
 * que a tela mostra quando aquela causa aparece — a mensagem original do erro e preservada.
 */
export const FISCAL_PROBLEM_SPECS = {
	CONFIGURACAO_FISCAL_INCOMPLETA: {
		codigo: "CONFIGURACAO_FISCAL_INCOMPLETA",
		origem: "PRONTIDAO",
		categoria: "CADASTRO",
		acaoSugerida: "Complete os dados da empresa fiscal (CNPJ, razão social e endereço).",
		alvo: "CONFIGURACAO_FISCAL",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	NFCE_CREDENCIAIS_AUSENTES: {
		codigo: "NFCE_CREDENCIAIS_AUSENTES",
		origem: "PRONTIDAO",
		categoria: "CADASTRO",
		acaoSugerida: "Informe o CSC e o token da NFC-e na configuração fiscal.",
		alvo: "CONFIGURACAO_FISCAL",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	SERIE_AUSENTE: {
		codigo: "SERIE_AUSENTE",
		origem: "PRONTIDAO",
		categoria: "NUMERACAO",
		acaoSugerida: "Cadastre uma série fiscal ativa para este tipo de documento e ambiente.",
		alvo: "SERIE",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PERFIL_OPERACAO_AUSENTE: {
		codigo: "PERFIL_OPERACAO_AUSENTE",
		origem: "PRONTIDAO",
		categoria: "CADASTRO",
		acaoSugerida: "Crie um perfil de operação fiscal compatível com a modalidade e a presença desta venda.",
		alvo: "PERFIL_OPERACAO",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PERFIL_OPERACAO_DEVOLUCAO_AUSENTE: {
		codigo: "PERFIL_OPERACAO_DEVOLUCAO_AUSENTE",
		origem: "PRONTIDAO",
		categoria: "CADASTRO",
		acaoSugerida: "Crie um perfil de operação NF-e com finalidade DEVOLUÇÃO.",
		alvo: "PERFIL_OPERACAO",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	CLIENTE_SEM_DOCUMENTO: {
		codigo: "CLIENTE_SEM_DOCUMENTO",
		origem: "PRONTIDAO",
		categoria: "CADASTRO",
		acaoSugerida: "Informe um CPF ou CNPJ válido no cadastro do cliente.",
		alvo: "CLIENTE",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	EMPRESA_PROVEDOR_NAO_SINCRONIZADA: {
		codigo: "EMPRESA_PROVEDOR_NAO_SINCRONIZADA",
		origem: "PRONTIDAO",
		categoria: "CADASTRO",
		acaoSugerida: "Sincronize a empresa com o provedor fiscal.",
		alvo: "EMPRESA_PROVEDOR",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	CERTIFICADO_INVALIDO: {
		codigo: "CERTIFICADO_INVALIDO",
		origem: "PRONTIDAO",
		categoria: "CERTIFICADO",
		acaoSugerida: "Envie um certificado digital válido na configuração fiscal.",
		alvo: "CERTIFICADO",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PAGAMENTOS_INSUFICIENTES: {
		codigo: "PAGAMENTOS_INSUFICIENTES",
		origem: "PRONTIDAO",
		categoria: "TRIBUTARIO",
		acaoSugerida: "Revise os pagamentos da venda: a soma precisa cobrir o total.",
		alvo: "PAGAMENTOS",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PAGAMENTOS_EXCEDENTES: {
		codigo: "PAGAMENTOS_EXCEDENTES",
		origem: "PRONTIDAO",
		categoria: "TRIBUTARIO",
		acaoSugerida: "Revise acréscimos e pagamentos da venda: a soma dos pagamentos não pode passar do total da nota.",
		alvo: "PAGAMENTOS",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	VENDA_SEM_LANCAMENTO: {
		codigo: "VENDA_SEM_LANCAMENTO",
		origem: "PRONTIDAO",
		categoria: "OUTRO",
		acaoSugerida: "A venda não possui lançamento contábil. Confirme a venda novamente ou fale com o suporte.",
		alvo: "VENDA",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PERFIL_FISCAL_AUSENTE: {
		codigo: "PERFIL_FISCAL_AUSENTE",
		origem: "VALIDACAO",
		categoria: "CADASTRO",
		acaoSugerida: "Cadastre o perfil fiscal do produto (NCM, origem e grupo tributário).",
		alvo: "PRODUTO",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	GRUPO_TRIBUTARIO_AUSENTE: {
		codigo: "GRUPO_TRIBUTARIO_AUSENTE",
		origem: "VALIDACAO",
		categoria: "TRIBUTARIO",
		acaoSugerida: "Vincule um grupo tributário ao perfil fiscal do produto.",
		alvo: "GRUPO_TRIBUTARIO",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	VALIDACAO_TRIBUTARIA: {
		codigo: "VALIDACAO_TRIBUTARIA",
		origem: "VALIDACAO",
		categoria: "TRIBUTARIO",
		acaoSugerida: "Revise o grupo tributário e o perfil fiscal do produto.",
		alvo: "PRODUTO",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PROVEDOR_INDISPONIVEL: {
		codigo: "PROVEDOR_INDISPONIVEL",
		origem: "PROVEDOR",
		categoria: "INFRAESTRUTURA",
		acaoSugerida: "Instabilidade no provedor fiscal. O envio será retentado automaticamente.",
		alvo: "NENHUM",
		reenviavel: true,
		resolvidoAutomaticamente: true,
	},
	PROVEDOR_CREDENCIAIS_RECUSADAS: {
		codigo: "PROVEDOR_CREDENCIAIS_RECUSADAS",
		origem: "PROVEDOR",
		categoria: "CADASTRO",
		acaoSugerida: "As credenciais do provedor foram recusadas. Sincronize a empresa novamente.",
		alvo: "EMPRESA_PROVEDOR",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	PROVEDOR_REJEITOU_PAYLOAD: {
		codigo: "PROVEDOR_REJEITOU_PAYLOAD",
		origem: "PROVEDOR",
		categoria: "SCHEMA",
		acaoSugerida: "O provedor recusou os dados do documento. Veja o retorno completo e fale com o suporte.",
		alvo: "NENHUM",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
	ENVIO_CONCORRENTE: {
		codigo: "ENVIO_CONCORRENTE",
		origem: "PROVEDOR",
		categoria: "INFRAESTRUTURA",
		acaoSugerida: "Outro envio está em andamento. Atualize o status em instantes.",
		alvo: "NENHUM",
		reenviavel: true,
		resolvidoAutomaticamente: true,
	},
	ERRO_DESCONHECIDO: {
		codigo: "ERRO_DESCONHECIDO",
		origem: "PROVEDOR",
		categoria: "OUTRO",
		acaoSugerida: "Veja o retorno completo do documento e tente reenviar.",
		alvo: "NENHUM",
		reenviavel: true,
		resolvidoAutomaticamente: false,
	},
} as const satisfies Record<string, ProblemSpec>;

export type TFiscalProblemCode = keyof typeof FISCAL_PROBLEM_SPECS;

export function buildFiscalProblem(
	code: TFiscalProblemCode,
	options: { mensagem?: string; alvo?: Partial<TFiscalProblemTarget> } = {},
): TFiscalProblem {
	const spec = FISCAL_PROBLEM_SPECS[code];
	return {
		codigo: spec.codigo,
		origem: spec.origem,
		categoria: spec.categoria,
		mensagem: options.mensagem ?? spec.acaoSugerida,
		acaoSugerida: spec.acaoSugerida,
		alvo: { tipo: options.alvo?.tipo ?? spec.alvo, id: options.alvo?.id ?? null, rotulo: options.alvo?.rotulo ?? null },
		reenviavel: spec.reenviavel,
		resolvidoAutomaticamente: spec.resolvidoAutomaticamente,
	};
}

// Rejeicao SEFAZ (cStat) -> problema, via catalogo de rejeicoes.
export function buildSefazProblem(codigoRejeicao: string, mensagem?: string | null): TFiscalProblem {
	const info = getFiscalRejectionInfo(codigoRejeicao);
	const alvoTipo = info?.alvo ?? "NENHUM";
	return {
		codigo: `SEFAZ_${codigoRejeicao.trim()}`,
		origem: "SEFAZ",
		categoria: info?.categoria ?? "OUTRO",
		mensagem: mensagem?.trim() || info?.descricao || `Rejeição ${codigoRejeicao}`,
		acaoSugerida: info?.acaoSugerida ?? "Consulte a mensagem retornada pela SEFAZ para o motivo detalhado.",
		alvo: target(alvoTipo),
		reenviavel: info?.reenviavel ?? true,
		resolvidoAutomaticamente: false,
	};
}

// Erros do motor tributario ja nascem estruturados (codigo + produtoId); so falta o rotulo.
export function buildValidationProblems(
	errors: TFiscalValidationError[],
	resolveProductLabel: (produtoId: string) => string | null = () => null,
): TFiscalProblem[] {
	return errors
		.filter((error) => error.severidade === "ERRO")
		.map((error) => {
			const code: TFiscalProblemCode =
				error.codigo === "PERFIL_FISCAL_AUSENTE"
					? "PERFIL_FISCAL_AUSENTE"
					: error.codigo === "GRUPO_TRIBUTARIO_AUSENTE"
						? "GRUPO_TRIBUTARIO_AUSENTE"
						: "VALIDACAO_TRIBUTARIA";
			const rotulo = error.produtoId ? resolveProductLabel(error.produtoId) : null;
			return buildFiscalProblem(code, {
				mensagem: rotulo ? `${rotulo}: ${error.mensagem}` : error.mensagem,
				alvo: {
					tipo: error.produtoId ? (code === "GRUPO_TRIBUTARIO_AUSENTE" ? "GRUPO_TRIBUTARIO" : "PRODUTO") : "NENHUM",
					id: error.produtoId ?? null,
					rotulo,
				},
			});
		});
}

type MessagePattern = { pattern: RegExp; code: TFiscalProblemCode };

// Mensagens de prontidao/provedor que nao chegam com problema estruturado (throws antigos,
// erros Axios, texto legado persistido em `mensagens`). Ordem importa: primeira que casar vence.
const MESSAGE_PATTERNS: MessagePattern[] = [
	{ pattern: /Validacao fiscal falhou/i, code: "VALIDACAO_TRIBUTARIA" },
	{ pattern: /Nenhum perfil fiscal de produto/i, code: "PERFIL_FISCAL_AUSENTE" },
	{ pattern: /sem perfil fiscal/i, code: "PERFIL_FISCAL_AUSENTE" },
	{ pattern: /grupo tribut/i, code: "GRUPO_TRIBUTARIO_AUSENTE" },
	{ pattern: /perfil de operacao fiscal de devolucao|finalidade DEVOLUCAO/i, code: "PERFIL_OPERACAO_DEVOLUCAO_AUSENTE" },
	{ pattern: /Perfil de operacao fiscal|Perfil fiscal .* n[aã]o configurado|perfil de opera[cç][aã]o/i, code: "PERFIL_OPERACAO_AUSENTE" },
	{ pattern: /Serie fiscal|s[eé]rie fiscal/i, code: "SERIE_AUSENTE" },
	{ pattern: /CSC da NFC-e|Token da NFC-e/i, code: "NFCE_CREDENCIAIS_AUSENTES" },
	{ pattern: /nao sincronizada com a Spedy|n[aã]o sincronizada/i, code: "EMPRESA_PROVEDOR_NAO_SINCRONIZADA" },
	{ pattern: /Credenciais da Spedy recusadas/i, code: "PROVEDOR_CREDENCIAIS_RECUSADAS" },
	{
		pattern: /Configuracao fiscal da organizacao|CPF\/CNPJ fiscal|Razao social fiscal|Configura[cç][aã]o fiscal/i,
		code: "CONFIGURACAO_FISCAL_INCOMPLETA",
	},
	{ pattern: /CPF ou CNPJ v[aá]lido para o destinat[aá]rio/i, code: "CLIENTE_SEM_DOCUMENTO" },
	{ pattern: /certificado/i, code: "CERTIFICADO_INVALIDO" },
	{ pattern: /soma dos pagamentos e maior/i, code: "PAGAMENTOS_EXCEDENTES" },
	{ pattern: /soma dos pagamentos/i, code: "PAGAMENTOS_INSUFICIENTES" },
	{ pattern: /Lan[cç]amento cont[aá]bil da venda/i, code: "VENDA_SEM_LANCAMENTO" },
	{ pattern: /ja esta sendo processado por outro envio/i, code: "ENVIO_CONCORRENTE" },
	{ pattern: /Limite de requisicoes|indisponivel no momento|ECONNRESET|ETIMEDOUT|timeout|502|503|504/i, code: "PROVEDOR_INDISPONIVEL" },
	{ pattern: /Spedy|provedor/i, code: "PROVEDOR_REJEITOU_PAYLOAD" },
];

// "[ERRO] PERFIL_FISCAL_AUSENTE: Produto sem perfil fiscal cadastrado. (produto abc-123)"
const VALIDATION_SEGMENT = /\[(ERRO|AVISO)\]\s*([A-Z_]+):\s*(.*?)(?:\s*\(produto\s+([^)]+)\))?$/i;

function parseValidationFailureMessage(message: string, resolveProductLabel: (produtoId: string) => string | null): TFiscalProblem[] {
	const body = message.replace(/^Validacao fiscal falhou:\s*/i, "");
	const problems: TFiscalProblem[] = [];
	for (const segment of body.split(";")) {
		const match = segment.trim().match(VALIDATION_SEGMENT);
		if (!match) continue;
		const [, severidade, codigo, mensagem, produtoId] = match;
		if (severidade.toUpperCase() !== "ERRO") continue;
		problems.push(...buildValidationProblems([{ codigo, severidade: "ERRO", mensagem, produtoId: produtoId ?? undefined }], resolveProductLabel));
	}
	return problems;
}

export function classifyFiscalErrorMessage(
	message: string,
	resolveProductLabel: (produtoId: string) => string | null = () => null,
): TFiscalProblem[] {
	const normalized = message.trim();
	if (!normalized) return [];
	if (/Validacao fiscal falhou/i.test(normalized)) {
		const parsed = parseValidationFailureMessage(normalized, resolveProductLabel);
		if (parsed.length > 0) return parsed;
	}
	const matched = MESSAGE_PATTERNS.find(({ pattern }) => pattern.test(normalized));
	return [buildFiscalProblem(matched?.code ?? "ERRO_DESCONHECIDO", { mensagem: normalized })];
}

/**
 * Converte qualquer erro lancado durante a emissao em problemas. Erros de prontidao ja trazem a
 * lista; o resto e classificado pela mensagem.
 */
export function toFiscalProblemsFromError(
	error: unknown,
	message: string,
	resolveProductLabel?: (produtoId: string) => string | null,
): TFiscalProblem[] {
	const structured = (error as { problemas?: unknown } | null)?.problemas;
	if (Array.isArray(structured) && structured.length > 0) return structured as TFiscalProblem[];
	return classifyFiscalErrorMessage(message, resolveProductLabel);
}

export function serializeFiscalProblems(problems: TFiscalProblem[] | null | undefined): string | null {
	if (!problems || problems.length === 0) return null;
	return JSON.stringify(problems);
}

export function parseFiscalProblems(value: string | null | undefined): TFiscalProblem[] | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? (parsed as TFiscalProblem[]) : null;
	} catch {
		return null;
	}
}

/**
 * Leitura unica para a API: usa `problemas` persistido quando existe; senao deriva do legado
 * (`codigoRejeicao` + `mensagens`). Documentos sem falha devolvem lista vazia.
 */
export function resolveFiscalDocumentProblems(document: {
	statusInterno: string;
	problemas?: string | null;
	codigoRejeicao?: string | null;
	mensagens?: unknown[] | null;
}): TFiscalProblem[] {
	if (document.statusInterno !== "ERRO" && document.statusInterno !== "REJEITADO") return [];
	const stored = parseFiscalProblems(document.problemas);
	if (stored && stored.length > 0) return stored;

	const messages = (document.mensagens ?? [])
		.map((message) => (typeof message === "string" ? message : JSON.stringify(message)))
		.filter((m) => m?.trim());
	if (document.codigoRejeicao) return [buildSefazProblem(document.codigoRejeicao, messages[0] ?? null)];
	if (messages.length === 0) return [buildFiscalProblem("ERRO_DESCONHECIDO", { mensagem: "Falha sem detalhe registrado pelo provedor." })];

	const problems = messages.flatMap((message) => classifyFiscalErrorMessage(message));
	// Deduplica por codigo+alvo: a mesma causa em mensagens repetidas nao vira dois chips.
	const seen = new Set<string>();
	return problems.filter((problem) => {
		const key = `${problem.codigo}:${problem.alvo.tipo}:${problem.alvo.id ?? ""}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function fiscalProblemsNeedOperator(problems: TFiscalProblem[]) {
	return problems.some((problem) => !problem.resolvidoAutomaticamente);
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

export { NO_TARGET as FISCAL_PROBLEM_NO_TARGET };
