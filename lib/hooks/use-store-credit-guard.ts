import { STORE_CREDIT_METHOD } from "@/lib/finances/store-credit/constants";
import {
	type TStoreCreditEvaluation,
	describeStoreCreditDenial,
	evaluateStoreCredit,
	getStoreCreditApprovalReason,
	getStoreCreditAvailable,
	sumStoreCreditPayments,
} from "@/lib/finances/store-credit/policy";
import { useClientStoreCredit } from "@/lib/queries/store-credit";
import type { TVendaFiadoApprovalPayload } from "@/schemas/action-approvals";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { useMemo } from "react";

export type TStoreCreditGuardStatus =
	/** Sem fiado nos pagamentos, sem cliente ou organização sem exigência: nada a dizer. */
	| "INATIVO"
	| "VERIFICANDO"
	/** A consulta falhou: a tela não bloqueia (o servidor decide), mas também não afirma que pode. */
	| "FALHOU"
	| "AVALIADO";

/**
 * Espelho no balcão da regra de liberação de fiado (lib/finances/store-credit/policy.ts).
 *
 * Só consulta a posição do cliente quando há fiado nos pagamentos. A decisão de verdade é da
 * confirmação (lib/finances/store-credit/authorization.ts): se a consulta falhar, a tela segue sem
 * pedir aprovação e o servidor recusa com o motivo se for o caso.
 *
 * `ownOpenBalance` é o fiado pendente que a própria venda já tem (edição de venda confirmada): o
 * servidor apaga essa agenda antes de avaliar, então o saldo em aberto aqui também o desconta.
 */
export function useStoreCreditGuard({
	clientId,
	payments,
	ownOpenBalance = 0,
}: {
	clientId: string | null | undefined;
	payments: { metodo: TPaymentMethodEnum; valor: number }[];
	ownOpenBalance?: number;
}) {
	const hasStoreCredit = payments.some((payment) => payment.metodo === STORE_CREDIT_METHOD);
	const valorFiado = sumStoreCreditPayments(payments);
	const query = useClientStoreCredit({ clientId, enabled: hasStoreCredit });

	const data = query.data;
	const result = useMemo(() => {
		if (!hasStoreCredit || !clientId) return null;
		if (!data) return null;
		const { position, exigeLiberacao } = data;
		const saldoEmAberto = Math.max(0, Math.round((position.saldoEmAberto - ownOpenBalance) * 100) / 100);
		const terms = { fiadoLiberado: position.fiadoLiberado, fiadoLimite: position.fiadoLimite };
		const disponivel = getStoreCreditAvailable({ terms, saldoEmAberto });
		const evaluation: TStoreCreditEvaluation = evaluateStoreCredit({ exigeLiberacao, terms, saldoEmAberto, valorSolicitado: valorFiado });
		const denied = evaluation.status === "PERMITIDO" ? null : evaluation;
		const approvalPayload: TVendaFiadoApprovalPayload | null = denied
			? {
					tipo: "VENDA_FIADO",
					clienteId: position.clienteId,
					clienteNome: position.clienteNome,
					valorSolicitado: valorFiado,
					motivo: getStoreCreditApprovalReason(denied),
					saldoEmAberto,
					limite: position.fiadoLimite,
				}
			: null;
		return {
			exigeLiberacao,
			position,
			saldoEmAberto,
			disponivel,
			evaluation,
			denialText: denied ? describeStoreCreditDenial(denied) : null,
			approvalPayload,
		};
	}, [hasStoreCredit, clientId, data, ownOpenBalance, valorFiado]);

	const status: TStoreCreditGuardStatus =
		!hasStoreCredit || !clientId ? "INATIVO" : query.isError ? "FALHOU" : !result ? "VERIFICANDO" : result.exigeLiberacao ? "AVALIADO" : "INATIVO";

	return {
		status,
		valorFiado,
		exigeLiberacao: result?.exigeLiberacao ?? false,
		position: result?.position ?? null,
		/** Saldo em aberto considerado (já sem o fiado pendente da própria venda, na edição). */
		saldoEmAberto: result?.saldoEmAberto ?? null,
		/** `null` = sem limite. Só tem sentido com `status === "AVALIADO"`. */
		disponivel: result?.disponivel ?? null,
		evaluation: result?.evaluation ?? null,
		// Falha na consulta = não pede aprovação (fail open): o servidor é a autoridade.
		requiresApproval: !!result?.approvalPayload,
		denialText: result?.denialText ?? null,
		approvalPayload: result?.approvalPayload ?? null,
		queryKey: query.queryKey,
	};
}
export type TStoreCreditGuard = ReturnType<typeof useStoreCreditGuard>;
