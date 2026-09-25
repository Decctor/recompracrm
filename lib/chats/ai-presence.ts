import type { TAiAssignmentBlockReason } from "@/lib/chats/ai-assignment";
import type { TAiAgentAttendanceModeEnum, TAiAgentRunStatusEnum } from "@/schemas/enums";

/**
 * O que a IA está fazendo nesta conversa, derivado de fatos que o hub já carrega.
 *
 * Nenhum estado novo no banco: "vai responder" sai da posse do atendimento + pendência do
 * cliente; "respondendo" sai de uma run `PENDENTE|RODANDO` no chat; "falhou" da última run
 * `FALHA` posterior à última mensagem do cliente. A thread assina `ai_agent_runs` por `chat_id`
 * para as transições chegarem sem refetch.
 *
 * Puro de propósito: recebe `now` e é testável sem banco nem relógio.
 */

/** Sem run há mais de um minuto do previsto: algo abortou antes de abrir a run (escopo, claim, equipe). */
const WAITING_GRACE_MS = 60_000;

export type TChatAiRun = {
	id: string;
	status: TAiAgentRunStatusEnum;
	erro: string | null;
	dataInicio: Date | string | null;
	dataFim: Date | string | null;
	dataInsercao: Date | string;
};

export type TChatAiCapabilities = {
	modo: TAiAgentAttendanceModeEnum;
	atrasoRespostaMs: number;
	esperaHumanoMs: number;
};

export type TAiPresence =
	| { estado: "ausente" }
	| { estado: "aguardando"; motivo: "debounce" | "reserva"; previstoEm: Date }
	| { estado: "respondendo"; runId: string; desde: Date }
	| { estado: "falhou"; runId: string; erro: string | null; em: Date }
	| { estado: "limite"; motivo: TAiAssignmentBlockReason };

export type TResolveAiPresenceInput = {
	atendimento: { responsavelTipo: string } | null;
	atendimentoIa: { disponivel: boolean; motivo: TAiAssignmentBlockReason | null };
	ultimaEntradaEm: Date | string | null;
	ultimaSaidaEm: Date | string | null;
	capacidades: TChatAiCapabilities | null;
	run: TChatAiRun | null;
	now: Date;
};

function toDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	return value instanceof Date ? value : new Date(value);
}

export function isActiveAiRunStatus(status: TAiAgentRunStatusEnum): boolean {
	return status === "PENDENTE" || status === "RODANDO";
}

export function resolveAiPresence(input: TResolveAiPresenceInput): TAiPresence {
	const { atendimento, atendimentoIa, run, now } = input;
	const ultimaEntradaEm = toDate(input.ultimaEntradaEm);
	const ultimaSaidaEm = toDate(input.ultimaSaidaEm);
	const pendente = !!ultimaEntradaEm && (!ultimaSaidaEm || ultimaEntradaEm > ultimaSaidaEm);

	// 1. Run em curso: o fato mais forte, vale mesmo que a posse tenha mudado (a run vai
	//    perceber e abortar sozinha, mas até lá ela está de fato gerando).
	if (run && isActiveAiRunStatus(run.status)) {
		return { estado: "respondendo", runId: run.id, desde: toDate(run.dataInicio) ?? toDate(run.dataInsercao) ?? now };
	}

	// 2. Humano ou telefone no comando: a IA não fala.
	const responsavel = atendimento?.responsavelTipo ?? "NAO_ATRIBUIDO";
	if (responsavel === "USUARIO" || responsavel === "EXTERNO") return { estado: "ausente" };

	// 3. A última run falhou depois da última mensagem do cliente e ninguém respondeu: o
	//    atendimento parece atendido e não está. É o estado que mais precisa aparecer.
	if (run?.status === "FALHA" && pendente) {
		const em = toDate(run.dataFim) ?? toDate(run.dataInsercao) ?? now;
		if (!ultimaEntradaEm || em >= ultimaEntradaEm) return { estado: "falhou", runId: run.id, erro: run.erro, em };
	}

	// 4. Bloqueio explícito: sem agente disponível não há o que esperar.
	if (!atendimentoIa.disponivel) {
		if (atendimentoIa.motivo === "LIMITE_CREDITOS") return { estado: "limite", motivo: atendimentoIa.motivo };
		return { estado: "ausente" };
	}

	// 5. Pendência com a IA como candidata: ela responde depois do debounce (ou da espera pela
	//    equipe, no modo RESERVA).
	if (pendente && ultimaEntradaEm && (responsavel === "AGENTE" || responsavel === "NAO_ATRIBUIDO")) {
		const capacidades = input.capacidades;
		const debounce = capacidades?.atrasoRespostaMs ?? 5000;
		const reserva = capacidades?.modo === "RESERVA";
		const delay = reserva ? Math.max(debounce, capacidades?.esperaHumanoMs ?? 0) : debounce;
		const previstoEm = new Date(ultimaEntradaEm.getTime() + delay);
		// Passou do previsto e nenhuma run apareceu: algo recusou antes de abrir a run. Prometer
		// resposta aqui seria mentir para quem está olhando a conversa.
		if (now.getTime() > previstoEm.getTime() + WAITING_GRACE_MS) return { estado: "ausente" };
		return { estado: "aguardando", motivo: reserva ? "reserva" : "debounce", previstoEm };
	}

	return { estado: "ausente" };
}
