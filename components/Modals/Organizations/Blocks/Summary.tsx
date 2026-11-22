"use client";

import DetailField from "@/components/Modals/Finances/Blocks/DetailField";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { CHIP_XS_ICON_CLASS, Chip } from "@/components/ui/chip";
import { formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TOrganizationBaseState } from "@/state-hooks/use-organization-state";
import { Building2, Mail, MapPin, Phone, Receipt } from "lucide-react";

type AdminOrganizationSummaryBlockProps = {
	organization: TOrganizationBaseState["organization"];
};

function formatLocation(organization: TOrganizationBaseState["organization"]) {
	const parts = [
		organization.localizacaoLogradouro,
		organization.localizacaoNumero,
		organization.localizacaoBairro,
		organization.localizacaoCidade,
		organization.localizacaoEstado,
	]
		.filter(Boolean)
		.join(", ");

	if (!parts && !organization.localizacaoCep) return null;
	return [parts, organization.localizacaoCep ? `CEP ${organization.localizacaoCep}` : null].filter(Boolean).join(" · ");
}

export default function AdminOrganizationSummaryBlock({ organization }: AdminOrganizationSummaryBlockProps) {
	const location = formatLocation(organization);

	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<Building2 className="h-4 w-4 min-h-4 min-w-4" />}>
			<div className="border-border bg-muted/30 flex w-full min-w-0 flex-col gap-3 rounded-xl border px-4 py-3">
				<div className="flex w-full min-w-0 flex-col gap-2">
					<h2 className="text-sm font-extrabold tracking-tight break-words">{organization.nome || "Nome não informado"}</h2>
					<p className="text-xs font-medium text-muted-foreground tabular-nums">{formatToCPForCNPJ(organization.cnpj)}</p>
					{organization.assinaturaPlano ? (
						<Chip.Root size="xs" shape="xl" className={cn("bg-primary/15 text-primary w-fit")}>
							<Chip.Icon>
								<Receipt className={CHIP_XS_ICON_CLASS} />
							</Chip.Icon>
							<Chip.Label weight="bold">
								PLANO {organization.assinaturaPlano}
								{/* Adicionais contratados sobre o plano-base (espelho da assinatura no Stripe). */}
								{(organization.assinaturaAdicionais ?? []).map((addon) => ` + ${addon}`).join("")}
							</Chip.Label>
						</Chip.Root>
					) : null}
				</div>
			</div>

			<div className="flex w-full min-w-0 flex-col">
				{organization.email ? (
					<DetailField label="E-mail">
						<span className="flex items-center gap-1.5 text-sm font-medium break-all">
							<Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							{organization.email}
						</span>
					</DetailField>
				) : null}
				{organization.telefone ? (
					<DetailField label="Telefone">
						<span className="flex items-center gap-1.5 text-sm font-medium">
							<Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							{formatToPhone(organization.telefone)}
						</span>
					</DetailField>
				) : null}
				{location ? (
					<DetailField label="Localização">
						<span className="flex items-start gap-1.5 text-sm font-medium break-words">
							<MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							{location}
						</span>
					</DetailField>
				) : null}
				{/* "Integração ativa" saiu daqui: a conexão vive em `integrations` (N por org) e a
				coluna congelada da organização mostraria dado desatualizado. */}
				{organization.fiscalProvedor ? <DetailField label="Provedor fiscal" value={organization.fiscalProvedor} /> : null}
			</div>
		</ResponsiveMenuSection>
	);
}
