"use client";

import { MISSING_ESSENTIAL_FIELD_CLASS, MissingEssentialsChip } from "./registry-shared";
import SocialProfileInput from "@/components/Inputs/SocialProfileInput";
import TextInput from "@/components/Inputs/TextInput";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import type { TClientEssentialField } from "@/lib/clients/client-registry-state";
import { formatToPhone } from "@/lib/formatting";
import { normalizeWebsiteUrl } from "@/lib/socials";
import type { TUseClientSectionEditor } from "@/state-hooks/use-client-section-editor";
import { Instagram, Linkedin, Phone, Twitter } from "lucide-react";

type ClientContactSectionProps = {
	editor: TUseClientSectionEditor;
	missingFields: Set<TClientEssentialField>;
};

/** Por onde se fala com o cliente — o que as campanhas e o WhatsApp Hub consomem. */
export default function ClientContactSection({ editor, missingFields }: ClientContactSectionProps) {
	const { state, updateClient } = editor;
	const sectionMissingCount = (["telefone", "email"] as const).filter((field) => missingFields.has(field)).length;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Phone />
				</Section.Icon>
				<Section.Title>Contato</Section.Title>
				<MissingEssentialsChip count={sectionMissingCount} />
			</Section.Header>
			<Section.Body>
				<div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
					<TextInput
						label="TELEFONE"
						required
						inputType="tel"
						placeholder="(00) 00000-0000"
						value={formatToPhone(state.client.telefone ?? "")}
						className={missingFields.has("telefone") ? MISSING_ESSENTIAL_FIELD_CLASS : undefined}
						handleChange={(value) => updateClient({ telefone: formatToPhone(value) })}
					/>
					<TextInput
						label="EMAIL"
						placeholder="nome@email.com"
						value={state.client.email ?? ""}
						className={missingFields.has("email") ? MISSING_ESSENTIAL_FIELD_CLASS : undefined}
						handleChange={(value) => updateClient({ email: value })}
					/>
				</div>

				<div className="flex w-full flex-col gap-3">
					<h3 className="text-muted-foreground text-xs leading-none tracking-tight">REDES E SITE</h3>
					<div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
						<TextInput
							label="WEBSITE"
							placeholder="dominio.com.br"
							value={state.client.websiteUrl ?? ""}
							handleChange={(value) => updateClient({ websiteUrl: value || null })}
							handleOnBlur={() => updateClient({ websiteUrl: normalizeWebsiteUrl(state.client.websiteUrl) })}
						/>
						<SocialProfileInput
							label="INSTAGRAM"
							value={state.client.instagram ?? ""}
							platform="instagram"
							prefix="instagram.com/"
							prefixIcon={<Instagram className="size-3.5" />}
							placeholder="usuario"
							handleChange={(value) => updateClient({ instagram: value })}
						/>
						<SocialProfileInput
							label="LINKEDIN"
							value={state.client.linkedin ?? ""}
							platform="linkedin"
							prefix="linkedin.com/"
							prefixIcon={<Linkedin className="size-3.5" />}
							placeholder="in/usuario"
							handleChange={(value) => updateClient({ linkedin: value })}
						/>
						<SocialProfileInput
							label="X / TWITTER"
							value={state.client.twitter ?? ""}
							platform="twitter"
							prefix="x.com/"
							prefixIcon={<Twitter className="size-3.5" />}
							placeholder="usuario"
							handleChange={(value) => updateClient({ twitter: value })}
						/>
					</div>
				</div>

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
