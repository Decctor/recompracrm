import { AUTO_EMISSION_MAX_DELAY_MINUTES } from "./constants";

export type TAutoEmissionScheduleDecision =
	| { acao: "EMITIR" }
	| { acao: "AGENDAR"; agendadaPara: Date }
	| { acao: "JA_AGENDADA"; agendadaPara: Date };

/**
 * Decide se a emissão automática acontece agora, entra em espera ou já está em espera.
 * Pura (sem banco, sem fila), no molde de `resolveAutoEmissionException`, para o gatilho e o
 * diagnóstico lerem a mesma regra.
 *
 * - `atrasoMinutos` ≤ 0 (ou ausente) → EMITIR: comportamento original, sem agendamento.
 * - Agendamento vigente (`agendadaPara` não nulo) → JA_AGENDADA, com o horário existente. O
 *   gatilho dispara várias vezes por venda (confirmação, entrega, pagamento, edição); só o primeiro
 *   agenda. Vale mesmo que o horário já tenha passado: a coluna só é limpa por quem executa, então
 *   um horário vencido significa "consumer ainda não rodou", nunca "agendar de novo".
 * - Caso contrário → AGENDAR para `now + atraso`, com o atraso capado no teto do schema (defesa
 *   contra um valor gravado por fora da validação; a fila recusaria acima de 7 dias).
 */
export function resolveAutoEmissionSchedule({
	atrasoMinutos,
	agendadaPara,
	now = new Date(),
}: {
	atrasoMinutos: number | null | undefined;
	agendadaPara: Date | null | undefined;
	now?: Date;
}): TAutoEmissionScheduleDecision {
	const atraso = Math.min(Math.max(Math.floor(atrasoMinutos ?? 0), 0), AUTO_EMISSION_MAX_DELAY_MINUTES);
	if (atraso <= 0) return { acao: "EMITIR" };
	if (agendadaPara) return { acao: "JA_AGENDADA", agendadaPara };
	return { acao: "AGENDAR", agendadaPara: new Date(now.getTime() + atraso * 60_000) };
}
