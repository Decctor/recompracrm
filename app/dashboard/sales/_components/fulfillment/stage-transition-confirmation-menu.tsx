"use client";

import type { TPatchSalesFulfillmentInput, TSalesFulfillmentCard } from "@/app/api/sales/fulfillment/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { STORE_CREDIT_METHOD } from "@/lib/finances/store-credit/constants";
import { formatToMoney } from "@/lib/formatting";
import { resolveDeliveryPaymentCoverage } from "@/lib/sales/delivery-payment-coverage";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import { QuickActionRow } from "./quick-actions/QuickActionRow";
import { getPaymentControlTone, QuickPaymentMethodControl } from "./quick-actions/CardQuickActions";

type StageTransitionConfirmationMenuProps = {
	card: TSalesFulfillmentCard;
	organizationConfig: TOrganizationConfiguration;
	isPending: boolean;
	onPatch: (input: TPatchSalesFulfillmentInput) => void;
	onConfirm: () => void;
	onConfirmWithoutPayment: () => void;
	onCancel: () => void;
};

function formatOrderIdentifier(identifier: string) {
	if (identifier.length <= 24) return identifier;
	return `${identifier.slice(0, 12)}…${identifier.slice(-6)}`;
}

/**
 * Confirmation surface for stage transitions that have business consequences.
 *
 * The board owns the optimistic move and rollback lifecycle. This component owns
 * only the requirements and actions for the current transition, so future stages
 * can reuse the same orchestration without adding forms back into kanban cards.
 */
export function StageTransitionConfirmationMenu({
	card,
	organizationConfig,
	isPending,
	onPatch,
	onConfirm,
	onConfirmWithoutPayment,
	onCancel,
}: StageTransitionConfirmationMenuProps) {
	// Fiado em aberto cobre a entrega e fica para o recebimento de fiado: não é perguntado aqui.
	const coverage = resolveDeliveryPaymentCoverage({ transactions: card.pagamentos, saleTotal: card.valorTotal });
	const editablePayments = card.pagamentos.filter((payment) => payment.editavel && payment.metodo !== STORE_CREDIT_METHOD);
	const isPaid = coverage.isCovered;
	const hasOpenStoreCredit = coverage.valorFiadoEmAberto > 0;
	const displayIdentifier = formatOrderIdentifier(card.idExterno);
	const pendingPaymentsLabel = `${editablePayments.length} recebimento${editablePayments.length === 1 ? "" : "s"} pendente${editablePayments.length === 1 ? "" : "s"}`;

	return (
		<ResponsiveMenu
			menuTitle="Confirmar entrega"
			menuDescription="Revise o pedido antes de concluir a entrega e registrar a baixa física de estoque."
			menuActionButtonText={isPaid ? "CONFIRMAR ENTREGA" : "RECEBER E ENTREGAR"}
			menuSecondaryActionButtonText={!isPaid ? "ENTREGAR SEM RECEBER" : undefined}
			menuSecondaryActionButtonVariant="outline"
			menuActionButtonClassName={!isPaid ? "col-span-2 w-full" : undefined}
			menuCancelButtonText="CANCELAR"
			actionFunction={onConfirm}
			secondaryActionFunction={!isPaid ? onConfirmWithoutPayment : undefined}
			actionIsLoading={isPending}
			menuActionButtonDisabled={isPending}
			menuSecondaryActionButtonDisabled={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={onCancel}
			lockClose={isPending}
			dialogVariant="sm"
			drawerVariant="fit"
			contentClassName="gap-4"
			footerClassName={!isPaid ? "sm:grid sm:grid-cols-2" : undefined}
		>
			<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
				<div className="min-w-0">
					<p className="truncate font-bold tracking-tight">{card.cliente?.nome ?? "Ao consumidor"}</p>
					<p className="truncate text-xs text-muted-foreground" title={`Pedido #${card.idExterno}`}>
						Pedido #{displayIdentifier}
					</p>
				</div>
				<p className="self-center font-bold tabular-nums">{formatToMoney(card.valorTotal)}</p>
			</div>

			<div
				className={
					isPaid
						? "flex items-start gap-2 rounded-2xl border border-success/25 bg-success/5 p-4 text-sm"
						: "flex items-start gap-2 rounded-2xl border border-brand/35 bg-brand/10 p-4 text-sm"
				}
			>
				{isPaid ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />}
				<div className="flex min-w-0 flex-col gap-0.5">
					<p className="font-bold">{isPaid ? (hasOpenStoreCredit ? "Venda no fiado" : "Pagamento recebido") : "Pagamento pendente"}</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{isPaid
							? hasOpenStoreCredit
								? `${formatToMoney(coverage.valorFiadoEmAberto)} ficam em aberto no fiado do cliente. A confirmação concluirá o pedido e registrará a saída dos itens do estoque.`
								: "A confirmação concluirá o pedido e registrará a saída dos itens do estoque."
							: editablePayments.length > 0
								? `${pendingPaymentsLabel}. Confirme como o valor foi recebido ou entregue sem receber.`
								: "O pedido ainda não está totalmente recebido. Você pode receber e entregar ou concluir a entrega sem receber."}
					</p>
				</div>
			</div>

			{!isPaid && editablePayments.length > 0 ? (
				<div className="flex flex-col gap-2" aria-label="Recebimentos pendentes">
					<div className="flex items-center gap-2">
						<Clock3 className="h-4 w-4 text-muted-foreground" />
						<h3 className="text-xs font-extrabold uppercase tracking-wide">Como o pagamento foi recebido?</h3>
					</div>
					{editablePayments.map((payment, index) => (
						<QuickActionRow key={payment.id} label={editablePayments.length > 1 ? `Recebimento ${index + 1}` : "Receber como"}>
							<QuickPaymentMethodControl
								payment={payment}
								saleId={card.id}
								organizationConfig={organizationConfig}
								tone={getPaymentControlTone(payment)}
								onPatch={onPatch}
							/>
						</QuickActionRow>
					))}
				</div>
			) : null}
		</ResponsiveMenu>
	);
}
