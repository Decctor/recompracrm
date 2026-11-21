/**
 * Cliente da API v1 do Syncroniza Control (`/api/v1`), usado para levar o ciclo de vida das
 * organizações ao CRM da própria Syncroniza. Referência da API: `public/docs/api/opportunities.md` e
 * `public/docs/api/events.md` no repositório do Control.
 *
 * Desligado por padrão: sem `CONTROL_API_KEY`, `isControlLifecycleSyncEnabled()` é falso e nada é
 * chamado. É o que mantém Preview e desenvolvimento fora do CRM de produção.
 */

const DEFAULT_CONTROL_API_URL = "https://control.syncroniza.com.br";
const REQUEST_TIMEOUT_MS = 15_000;

export function isControlLifecycleSyncEnabled() {
	return Boolean(process.env.CONTROL_API_KEY?.trim());
}

export class ControlApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly issues: { campo: string; mensagem: string }[] = [],
	) {
		super(message);
		this.name = "ControlApiError";
	}
}

type TControlRequest = {
	method: "GET" | "POST" | "PATCH";
	path: string;
	body?: unknown;
	/** Repetir a mesma operação com a mesma chave devolve o resultado original em vez de executar de novo. */
	idempotencyKey?: string;
};

/**
 * Teto local de chamadas por minuto, abaixo do limite da chave no Control (120/min). Por instância:
 * suficiente para o cron, que roda sozinho, e folgado para as chamadas pontuais do onboarding.
 */
const MAX_CALLS_PER_MINUTE = 90;
const callTimestamps: number[] = [];

async function throttle() {
	for (;;) {
		const now = Date.now();
		while (callTimestamps.length > 0 && now - callTimestamps[0]! >= 60_000) callTimestamps.shift();
		if (callTimestamps.length < MAX_CALLS_PER_MINUTE) {
			callTimestamps.push(now);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 60_000 - (now - callTimestamps[0]!) + 50));
	}
}

async function controlRequest<T>({ method, path, body, idempotencyKey }: TControlRequest): Promise<T> {
	await throttle();
	const apiKey = process.env.CONTROL_API_KEY?.trim();
	if (!apiKey) throw new ControlApiError("CONTROL_API_KEY não configurada.", 0);
	const baseUrl = (process.env.CONTROL_API_URL?.trim() || DEFAULT_CONTROL_API_URL).replace(/\/+$/, "");

	const response = await fetch(`${baseUrl}/api/v1${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		cache: "no-store",
	});

	const json = (await response.json().catch(() => null)) as { error?: { message?: string; issues?: { campo: string; mensagem: string }[] } } | null;
	if (!response.ok) {
		throw new ControlApiError(json?.error?.message ?? `Control respondeu ${response.status}.`, response.status, json?.error?.issues ?? []);
	}
	return json as T;
}

/** Id do Control ou `ref:<referência>` — ver "Encontrar a oportunidade pela sua referência" na doc do Control. */
function opportunityPath(idOrRef: string) {
	return `/opportunities/${encodeURIComponent(idOrRef)}`;
}

// ------------------------------------------------------------------ listas de apoio

export type TControlBoard = {
	id: string;
	nome: string;
	padraoOportunidades: boolean;
	estagios: { id: string; nome: string; inicial: boolean; final: boolean }[];
};

export async function listControlBoards() {
	const result = await controlRequest<{ valores: TControlBoard[] }>({ method: "GET", path: "/facets?tipo=quadros_kanban" });
	return result.valores;
}

export async function listControlOpportunityCustomFieldKeys() {
	const result = await controlRequest<{ campos: { chave: string }[] }>({ method: "GET", path: "/custom-fields?entidade=OPORTUNIDADE" });
	return result.campos.map((field) => field.chave);
}

// ------------------------------------------------------------------ oportunidades

export type TControlCreateOpportunityInput = {
	referenciaExterna: string;
	cliente: { nome: string; email?: string; telefone?: string; cpfCnpj?: string };
	oportunidade: {
		nome: string;
		observacoes?: string;
		quadroKanbanId?: string;
		estagioKanbanId?: string;
		camposPersonalizados?: Record<string, string | number | boolean | null>;
	};
};

export async function createControlOpportunity(input: TControlCreateOpportunityInput) {
	return controlRequest<{ oportunidadeId: string; clienteId: string; reaproveitada: boolean }>({
		method: "POST",
		path: "/opportunities",
		body: input,
		// Sem cabeçalho, a `referenciaExterna` já é a chave de idempotência do lado do Control.
	});
}

export type TControlOpportunity = {
	id: string;
	situacao: "EM_ANDAMENTO" | "GANHA" | "PERDIDA";
	estagiosKanban: { quadroKanbanId: string; estagioKanbanId: string; estagio: string | null }[];
	camposPersonalizados: Record<string, unknown>;
};

export async function getControlOpportunity(idOrRef: string) {
	return controlRequest<TControlOpportunity>({ method: "GET", path: opportunityPath(idOrRef) });
}

export async function updateControlOpportunity(
	idOrRef: string,
	body: { nome?: string; camposPersonalizados?: Record<string, string | number | boolean | null> },
	idempotencyKey?: string,
) {
	return controlRequest<{ oportunidadeId: string }>({ method: "PATCH", path: opportunityPath(idOrRef), body, idempotencyKey });
}

export async function moveControlOpportunityStage(idOrRef: string, body: { quadroKanbanId: string; estagio: string }, idempotencyKey?: string) {
	return controlRequest<{ alterado: boolean; adicionadaAoQuadro: boolean; estagio: string }>({
		method: "POST",
		path: `${opportunityPath(idOrRef)}/stage`,
		body: { ...body, adicionarAoQuadro: true },
		idempotencyKey,
	});
}

// ------------------------------------------------------------------ eventos e interações

export async function sendControlEvent(body: {
	evento: string;
	eventId: string;
	oportunidadeId: string;
	propriedades?: Record<string, unknown>;
	dataOcorrencia?: string;
}) {
	return controlRequest<{ duplicado: boolean }>({ method: "POST", path: "/events", body });
}

export async function logControlInteraction(
	body: { oportunidadeId: string; titulo: string; descricao?: string; canal: "SITE"; dataInteracao?: string },
	idempotencyKey: string,
) {
	return controlRequest<{ interacaoId: string }>({ method: "POST", path: "/interactions", body, idempotencyKey });
}
