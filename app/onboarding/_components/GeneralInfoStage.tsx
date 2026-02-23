import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPhoneAsBase, formatToCEP, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import type { TUseOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { LayoutGrid, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MdAttachFile } from "react-icons/md";

type GeneralInfoStageProps = {
	state: TUseOrganizationOnboardingState["state"];
	updateOrganization: TUseOrganizationOnboardingState["updateOrganization"];
	updateOrganizationLogoHolder: TUseOrganizationOnboardingState["updateOrganizationLogoHolder"];
	updateOrganizationOnboarding: TUseOrganizationOnboardingState["updateOrganizationOnboarding"];
};

export function GeneralInfoStage({ state, updateOrganization, updateOrganizationLogoHolder, updateOrganizationOnboarding }: GeneralInfoStageProps) {
	return (
		<>
			<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="w-full flex items-center lg:items-start flex-col lg:flex-row gap-x-6 gap-y-3">
					<ImageContent
						imageUrl={state.organization.logoUrl}
						imageHolder={state.organizationLogoHolder}
						updateImageHolder={updateOrganizationLogoHolder}
					/>
					<div className="h-full w-full lg:grow flex flex-col items-center gap-2">
						<TextInput
							value={state.organization.nome}
							label="NOME DA EMPRESA"
							placeholder="Preencha aqui o nome da sua empresa..."
							handleChange={(value) => updateOrganization({ nome: value })}
							width="100%"
							required
						/>
						<TextInput
							value={state.organization.cnpj || ""}
							label="CNPJ DA EMPRESA"
							placeholder="Preencha aqui o CNPJ da sua empresa..."
							handleChange={(value) => updateOrganization({ cnpj: formatToCPForCNPJ(value) })}
							width="100%"
							required
						/>
						<TextInput
							value={state.organization.email || ""}
							label="EMAIL CORPORATIVO"
							placeholder="Preencha aqui o email corporativo da sua empresa..."
							handleChange={(value) => updateOrganization({ email: value })}
							width="100%"
						/>
						<TextInput
							value={state.organization.telefone || ""}
							label="TELEFONE / WHATSAPP"
							placeholder="Preencha aqui o telefone/whatsapp da sua empresa..."
							handleChange={(value) => updateOrganization({ telefone: formatToPhone(value) })}
							width="100%"
						/>
						<div className="flex items-start gap-1.5">
							<Checkbox
								id="terms-consent"
								checked={state.termsAccepted}
								onCheckedChange={(checked) => updateOrganizationOnboarding({ termsAccepted: checked === true })}
								className="mt-0.5"
							/>
							<label htmlFor="terms-consent" className="text-sm text-gray-700 leading-relaxed cursor-pointer">
								Li e concordo com os{" "}
								<Link href="/legal" target="_blank" className="text-primary font-medium underline hover:text-primary/80 transition-colors">
									Termos de Uso e Política de Privacidade
								</Link>{" "}
								da plataforma RecompraCRM.
							</label>
						</div>
					</div>
				</div>
			</ResponsiveMenuSection>
		</>
	);
}

function ImageContent({
	imageUrl,
	imageHolder,
	updateImageHolder,
}: {
	imageUrl?: string | null;
	imageHolder: { file?: File | null; previewUrl?: string | null };
	updateImageHolder: (image: { file?: File | null; previewUrl?: string | null }) => void;
}) {
	return (
		<div className="flex items-center justify-center min-h-[350px] min-w-[350px]">
			<label className="relative aspect-square w-full max-w-[350px] cursor-pointer overflow-hidden rounded-lg" htmlFor="dropzone-file">
				<ImagePreview imageHolder={imageHolder} imageUrl={imageUrl} />
				<input
					accept=".png,.jpeg,.jpg"
					className="absolute h-full w-full cursor-pointer opacity-0"
					id="dropzone-file"
					multiple={false}
					onChange={(e) => {
						const file = e.target.files?.[0] ?? null;
						updateImageHolder({
							file,
							previewUrl: file ? URL.createObjectURL(file) : null,
						});
					}}
					tabIndex={-1}
					type="file"
				/>
			</label>
		</div>
	);
}

function ImagePreview({ imageUrl, imageHolder }: { imageUrl?: string | null; imageHolder: { file?: File | null; previewUrl?: string | null } }) {
	if (imageHolder.previewUrl) {
		return <Image alt="Logo da organização" fill={true} style={{ objectFit: "cover" }} src={imageHolder.previewUrl} />;
	}
	if (imageUrl) {
		return <Image alt="Logo da organização" fill={true} style={{ objectFit: "cover" }} src={imageUrl} />;
	}

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-200">
			<MdAttachFile className="h-6 w-6 text-primary/50" />
			<p className="text-center font-medium text-xs text-primary/50">DEFINIR LOGO</p>
		</div>
	);
}
