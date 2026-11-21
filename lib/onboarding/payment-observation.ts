export function resolvePaymentObservation({ status, errors }: { status: string; errors?: Array<{ code?: number }> }) {
	if (errors?.some((error) => error.code === 131042)) return "PENDENTE" as const;
	if (status === "delivered" || status === "read") return "VERIFICADO" as const;
	return null;
}

/**
 * Intervalo mínimo, por organização e por instância, entre reconciliações disparadas por status
 * de mensagem com o pagamento inalterado. Todo `delivered`/`read` de um número Meta passa por
 * aqui — num disparo de campanha são milhares por hora — e a reconciliação refaz a prontidão do
 * onboarding (~10 consultas, com contagens sobre vendas e clientes da organização).
 *
 * Mudança de status reconcilia sempre. Sem mudança, uma vez por janela basta: além do pagamento,
 * esse fluxo serve de reconciliação periódica para entradas que não disparam a própria (ex.:
 * primeiras vendas vindas da coleta), então ele é espaçado, não removido.
 *
 * Esta função é só o filtro em memória, por instância. No Fluid há várias instâncias, então ela
 * sozinha deixava a reconciliação rodar a cada poucos minutos; a janela entre instâncias vem da
 * trava em `metadados.reconciliacaoOnboardingEm` do telefone (lib/onboarding/whatsapp-payment.ts).
 */
export const UNCHANGED_PAYMENT_RECONCILE_INTERVAL_MS = 10 * 60 * 1000;

export function shouldReconcileAfterPaymentObservation({
	previousStatus,
	payment,
	lastReconcileAt,
	now,
}: {
	previousStatus: string | null | undefined;
	payment: string;
	lastReconcileAt: number | undefined;
	now: number;
}) {
	if (previousStatus !== payment) return true;
	if (lastReconcileAt === undefined) return true;
	return now - lastReconcileAt >= UNCHANGED_PAYMENT_RECONCILE_INTERVAL_MS;
}
