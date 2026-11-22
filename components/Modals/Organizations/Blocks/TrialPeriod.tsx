"use client";

import DateInput from "@/components/Inputs/DateInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import { hasChargeableStripeSubscription } from "@/lib/subscriptions/stripe-status";
import type { TOrganizationBaseState, TUseOrganizationBaseState } from "@/state-hooks/use-organization-state";
import dayjs from "dayjs";
import { CalendarClock } from "lucide-react";

type AdminOrganizationTrialPeriodBlockProps = {
	organization: TOrganizationBaseState["organization"];
	updateOrganization: TUseOrganizationBaseState["updateOrganization"];
	/** Status da assinatura no Stripe, do registro salvo: não faz parte do formulário. */
	stripeSubscriptionStatus: string | null | undefined;
};

function getTrialStatusLabel(organization: TOrganizationBaseState["organization"], stripeSubscriptionStatus: string | null | undefined) {
	const now = dayjs();
	const start = organization.periodoTesteInicio ? dayjs(organization.periodoTesteInicio) : null;
	const end = organization.periodoTesteFim ? dayjs(organization.periodoTesteFim) : null;

	// Quem testa também tem `assinaturaPlano` (o plano do teste): quem paga é quem tem assinatura no Stripe.
	if (hasChargeableStripeSubscription(stripeSubscriptionStatus)) {
		return "Organização com plano pago — período de teste não se aplica.";
	}
	if (!start && !end) {
		return "Sem período de teste configurado.";
	}
	if (end && end.endOf("day").isBefore(now)) {
		return `Teste encerrado em ${formatDateAsLocale(end.toDate())}.`;
	}
	if (start && end && !now.isBefore(start, "day") && !now.isAfter(end, "day")) {
		const daysLeft = end.endOf("day").diff(now.startOf("day"), "day") + 1;
		return `Teste ativo — ${daysLeft} dia${daysLeft !== 1 ? "s" : ""} restante${daysLeft !== 1 ? "s" : ""}.`;
	}
	if (start && now.isBefore(start, "day")) {
		return `Teste agendado — inicia em ${formatDateAsLocale(start.toDate())}.`;
	}
	return "Período de teste configurado.";
}

function getExtendedTrialEndDate(organization: TOrganizationBaseState["organization"], extraDays: number) {
	const now = dayjs();
	const currentEnd = organization.periodoTesteFim ? dayjs(organization.periodoTesteFim) : null;
	const base = currentEnd && currentEnd.endOf("day").isAfter(now) ? currentEnd : now;
	return base.add(extraDays, "day").endOf("day").toDate();
}

export default function AdminOrganizationTrialPeriodBlock({
	organization,
	updateOrganization,
	stripeSubscriptionStatus,
}: AdminOrganizationTrialPeriodBlockProps) {
	function handleExtendTrial(extraDays: number) {
		const periodoTesteFim = getExtendedTrialEndDate(organization, extraDays);
		const updates: Partial<TOrganizationBaseState["organization"]> = { periodoTesteFim };

		if (!organization.periodoTesteInicio) {
			updates.periodoTesteInicio = dayjs().startOf("day").toDate();
		}

		updateOrganization(updates);
	}

	return (
		<ResponsiveMenuSection title="PERÍODO DE TESTE" icon={<CalendarClock className="h-4 w-4 min-h-4 min-w-4" />}>
			<p className="text-xs text-muted-foreground">
				Ajuste manualmente as datas do período de teste quando precisar estender o acesso de uma organização.
			</p>
			<p className="text-xs font-medium text-foreground/80">{getTrialStatusLabel(organization, stripeSubscriptionStatus)}</p>

			<div className="flex w-full flex-col gap-3 lg:flex-row">
				<DateInput
					label="DATA DE INÍCIO"
					value={formatDateForInputValue(organization.periodoTesteInicio)}
					handleChange={(value) => updateOrganization({ periodoTesteInicio: formatDateOnInputChange(value, "date", "start") })}
				/>
				<DateInput
					label="DATA DE FIM"
					value={formatDateForInputValue(organization.periodoTesteFim)}
					handleChange={(value) => updateOrganization({ periodoTesteFim: formatDateOnInputChange(value, "date", "end") })}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<span className="text-xs font-medium tracking-tight text-muted-foreground">ATALHOS DE EXTENSÃO (DATA DE FIM)</span>
				<div className="flex flex-wrap gap-2">
					<Button type="button" variant="outline" size="sm" onClick={() => handleExtendTrial(7)}>
						+7 dias
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => handleExtendTrial(14)}>
						+14 dias
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => handleExtendTrial(30)}>
						+30 dias
					</Button>
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}
