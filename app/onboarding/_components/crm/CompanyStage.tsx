"use client";

import TextInput from "@/components/Inputs/TextInput";
import { OrganizationSlugFeedback } from "@/components/Organizations/OrganizationSlugFeedback";
import { Checkbox } from "@/components/ui/checkbox";
import { OrganizationNicheOptions } from "@/config/onboarding";
import { formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { slugifyOrganizationName } from "@/lib/organizations/slug";
import { useAvailableDealLicense } from "@/lib/queries/deals";
import type { TUseOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { BadgeCheck, ImagePlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChoiceList } from "../shared/ChoiceList";
import { ReferralCodeField } from "./ReferralCodeField";

type CompanyStageProps = {
	state: TUseOrganizationOnboardingState["state"];
	updateOrganization: TUseOrganizationOnboardingState["updateOrganization"];
	updateOrganizationLogoHolder: TUseOrganizationOnboardingState["updateOrganizationLogoHolder"];
	updateOnboarding: TUseOrganizationOnboardingState["updateOnboarding"];
	/** Organização já existe: a etapa vira edição e os termos já foram aceitos. */
	isEditing: boolean;
	/** Código do link de indicação (cookie), para mostrar quem indicou. */
	referralCookieCode?: string | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{children}</p>;
}

export function CompanyStage({ state, updateOrganization, updateOrganizationLogoHolder, updateOnboarding, isEditing, referralCookieCode = null }: CompanyStageProps) {
	// Licença de deal (venda B2B multi-licença): org ativada sem trial e sem checkout.
	const { data: dealLicense } = useAvailableDealLicense();
	// O endereço acompanha o nome até o usuário mexer nele.
	const [slugEdited, setSlugEdited] = useState(() => Boolean(state.organization.slug));

	const handleNomeChange = (value: string) => {
		updateOrganization(slugEdited ? { nome: value } : { nome: value, slug: slugifyOrganizationName(value) });
	};

	const handleSlugChange = (value: string) => {
		const typed = value
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");
		setSlugEdited(typed.length > 0);
		updateOrganization({ slug: typed || slugifyOrganizationName(state.organization.nome) });
	};

	const previewUrl = state.organizationLogoHolder.previewUrl ?? state.organization.logoUrl ?? null;

	return (
		<div className="flex w-full max-w-[640px] flex-col gap-8">
			{dealLicense?.available && !isEditing ? (
				<div className="flex items-start gap-3 rounded-xl border border-border p-4">
					<BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" />
					<div className="flex flex-col gap-0.5">
						<p className="text-sm font-bold">Você possui licenças disponíveis</p>
						<p className="text-sm text-muted-foreground">
							{dealLicense.licencasUtilizadas} de {dealLicense.deal.quantidadeLicencas} licenças do seu plano estão em uso. Esta organização será ativada no
							plano {dealLicense.deal.planoBase}, sem período de teste e sem checkout.
						</p>
					</div>
				</div>
			) : null}

			<section className="flex flex-col gap-4">
				<SectionLabel>Identificação</SectionLabel>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
					<label
						htmlFor="onboarding-logo"
						className="relative flex size-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/70"
					>
						{previewUrl ? (
							<Image alt="Logo da organização" fill className="object-cover" src={previewUrl} />
						) : (
							<span className="flex flex-col items-center gap-1 text-center">
								<ImagePlus className="size-5" />
								<span className="text-[11px] font-semibold">Logo</span>
							</span>
						)}
						<input
							id="onboarding-logo"
							type="file"
							accept=".png,.jpeg,.jpg"
							className="absolute inset-0 cursor-pointer opacity-0"
							onChange={(event) => {
								const file = event.target.files?.[0] ?? null;
								updateOrganizationLogoHolder({ file, previewUrl: file ? URL.createObjectURL(file) : null });
							}}
						/>
					</label>
					<div className="flex w-full flex-col gap-3">
						<TextInput
							value={state.organization.nome}
							label="Nome da empresa"
							placeholder="Como sua loja é conhecida"
							handleChange={handleNomeChange}
							required
						/>
						<div className="flex flex-col gap-1">
							<TextInput
								value={state.organization.slug}
								label="Endereço da loja online"
								placeholder="endereco-da-sua-loja"
								handleChange={handleSlugChange}
								handleOnBlur={() => updateOrganization({ slug: slugifyOrganizationName(state.organization.slug) })}
							/>
							<OrganizationSlugFeedback slug={state.organization.slug} onApplySuggestion={(suggestion) => updateOrganization({ slug: suggestion })} />
						</div>
						<TextInput
							value={state.organization.cnpj || ""}
							label="CNPJ"
							placeholder="00.000.000/0000-00"
							handleChange={(value) => updateOrganization({ cnpj: formatToCPForCNPJ(value) })}
							required
						/>
						<div className="grid gap-3 sm:grid-cols-2">
							<TextInput
								value={state.organization.email || ""}
								label="E-mail corporativo"
								placeholder="contato@sualoja.com.br"
								handleChange={(value) => updateOrganization({ email: value })}
							/>
							<TextInput
								value={state.organization.telefone || ""}
								label="Telefone ou WhatsApp"
								placeholder="(00) 00000-0000"
								inputType="tel"
								handleChange={(value) => updateOrganization({ telefone: formatToPhone(value) })}
							/>
						</div>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<SectionLabel>Segmento</SectionLabel>
					<p className="text-sm text-muted-foreground">Escolha o mais próximo do seu negócio. Ele define a sugestão de cashback e de campanhas.</p>
				</div>
				<ChoiceList
					label="Segmento de atuação"
					columns={3}
					dense
					value={state.organization.atuacaoNicho || null}
					onChange={(value) => updateOrganization({ atuacaoNicho: value })}
					options={OrganizationNicheOptions.map((niche) => ({ value: niche.value, titulo: niche.label, icon: niche.renderIcon("size-4") }))}
				/>
			</section>

			{!isEditing && !dealLicense?.available ? (
				<ReferralCodeField
					cookieCode={referralCookieCode}
					value={state.indicadorCodigo ?? ""}
					onChange={(value) => {
						updateOnboarding({ indicadorCodigo: value || null });
						if (value) updateOrganization({ origemLead: "INDICAÇÃO" });
					}}
				/>
			) : null}

			{!isEditing ? (
				<div className="flex items-start gap-2">
					<Checkbox
						id="terms-consent"
						checked={state.termsAccepted}
						onCheckedChange={(checked) => updateOnboarding({ termsAccepted: checked === true })}
						className="mt-0.5"
					/>
					<label htmlFor="terms-consent" className="cursor-pointer text-sm leading-relaxed text-muted-foreground">
						Li e concordo com os{" "}
						<Link href="/legal" target="_blank" className="font-semibold text-foreground underline-offset-4 hover:underline">
							Termos de Uso e Política de Privacidade
						</Link>{" "}
						da plataforma RecompraCRM.
					</label>
				</div>
			) : null}
		</div>
	);
}
