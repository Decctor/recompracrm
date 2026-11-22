/**
 * O número de impacto da entrada do onboarding: clientes que não compram há mais de N dias.
 *
 * É uma afirmação sobre ausência de compra, então só vale com o histórico coberto de ponta a ponta
 * (plano §4.5: nenhuma conclusão que depende de ausência com cobertura parcial). Sem cobertura
 * completa que alcance N dias para trás, não há número — e a tela fica com o texto de sempre.
 */

export const INACTIVITY_IMPACT_DAYS = 60;

/** Data de corte ("comprou pela última vez antes disto") ou null quando a cobertura não permite afirmar. */
export function resolveInactivityCutoff({
	coberturaInicio,
	coberturaParcial,
	now,
	dias = INACTIVITY_IMPACT_DAYS,
}: {
	coberturaInicio: Date | null;
	coberturaParcial: boolean;
	now: Date;
	dias?: number;
}): Date | null {
	if (coberturaParcial || !coberturaInicio) return null;
	const cutoff = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000);
	return coberturaInicio.getTime() <= cutoff.getTime() ? cutoff : null;
}
