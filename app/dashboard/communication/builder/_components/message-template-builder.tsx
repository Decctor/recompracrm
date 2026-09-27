"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectGroup, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TemplateMediaUpload from "@/components/MessageTemplates/TemplateMediaUpload";
import { getDefaultAppOrigin, getMessageTemplateButtonPreset, MESSAGE_TEMPLATE_BUTTON_PRESET_OPTIONS } from "@/lib/message-templates/buttons/presets";
import { ArrowLeft, BadgeCheck, Braces, Eye, FileText, ImageIcon, LinkIcon, Mail, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import {
	MessageTemplateDynamicHeaderPresetOptions,
	type TMessageTemplateDraft,
	type TTemplateButtonDraft,
	type TTemplateCategory,
	type TTemplateDynamicHeaderPreset,
	type TTemplateStatus,
} from "../../_components/template-draft-store";
import { DynamicHeaderImagePreview, type OrganizationTemplateTheme } from "../../_components/dynamic-header-image-preview";
import { WhatsappIcon } from "@/components/icons";
import { TGetBuilderMessageTemplateById } from "../_lib";
import { TUseMessageTemplateState, useMessageTemplateState } from "@/state-hooks/use-message-template-state";
import { MessageTemplateBodyEditor } from "@/components/MessageTemplates/MessageTemplateBodyEditor";
import { EMPTY_SURVEY_BUTTON, MessageTemplateButtonEditor } from "@/components/MessageTemplates/MessageTemplateButtonsEditor";
import { renderResolvedTemplateWithHighlights } from "@/components/MessageTemplates/message-template-utils";
import { useMutation } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errors";
import { submitMessageTemplate } from "@/lib/mutations/message-templates";
import { LoadingButton } from "@/components/loading-button";
import { formatMessageTemplateName } from "@/lib/formatting";
type MessageTemplateBuilderProps = {
	template: TGetBuilderMessageTemplateById;
	organizationId: string;
	organizationName: string;
	organizationLogoUrl: string | null;
	organizationPrimaryColor: string | null;
	organizationPrimaryForeground: string | null;
	organizationSecondaryColor: string | null;
	organizationSecondaryForeground: string | null;
};
const categoryOptions: TTemplateCategory[] = ["MARKETING", "UTILIDADE", "AUTENTICAÇÃO"];
const statusOptions: TTemplateStatus[] = ["RASCUNHO", "ATIVO", "ARQUIVADO"];
const headerTypeOptions: Array<{
	id: TMessageTemplateDraft["cabecalho"]["tipo"];
	label: string;
}> = [
	{ id: "NENHUM", label: "Nenhum" },
	{ id: "TEXTO", label: "Texto" },
	{ id: "IMAGEM", label: "Imagem" },
	{ id: "VIDEO", label: "Vídeo" },
	{ id: "DOCUMENTO", label: "Documento" },
	// { id: "IMAGEM_DINAMICA", label: "Imagem dinâmica" }, // TODO: Re-enable this option when WhatsApp API supports it
];
export default function MessageTemplateBuilder({
	template,
	organizationId,
	organizationName,
	organizationLogoUrl,
	organizationPrimaryColor,
	organizationPrimaryForeground,
	organizationSecondaryColor,
	organizationSecondaryForeground,
}: MessageTemplateBuilderProps) {
	const router = useRouter();
	const {
		state,
		updateTemplate,
		updateTemplateContent,
		updateTemplateContentHeader,
		updateTemplateContentBody,
		updateTemplateContentBodyParameter,
		addContentButton,
		addContentPresetButton,
		appendContentButtons,
		updateContentButton,
		removeContentButton,
		unknownVariables,
		whatsappWarnings,
		emailWarnings,
	} = useMessageTemplateState({
		organizationName,
		initialState: template ? { messageTemplate: template } : undefined,
	});
	const organizationTheme = useMemo<OrganizationTemplateTheme>(
		() => ({
			name: organizationName,
			logoUrl: organizationLogoUrl,
			primaryColor: organizationPrimaryColor || "#24549c",
			primaryForeground: organizationPrimaryForeground || "#f8fafc",
			secondaryColor: organizationSecondaryColor || "#ffb900",
			secondaryForeground: organizationSecondaryForeground || "#171717",
		}),
		[
			organizationLogoUrl,
			organizationName,
			organizationPrimaryColor,
			organizationPrimaryForeground,
			organizationSecondaryColor,
			organizationSecondaryForeground,
		],
	);
	const { mutate: submitMessageMutation, isPending: isCreatingMessageTemplate } = useMutation({
		mutationKey: ["submit-message-template", template?.id],
		mutationFn: submitMessageTemplate,
		onSuccess: (data) => {
			toast.success(data.message);
			router.push("/dashboard/communication");
		},
		onError: (error) => {
			const msg = getErrorMessage(error);
			toast.error(msg);
		},
	});
	function handleSave() {
		if (!state.messageTemplate.nome.trim()) {
			toast.error("Informe o nome do template.");
			return;
		}
		if (!state.messageTemplate.conteudo.corpo.conteudo.trim()) {
			toast.error("Informe o conteúdo do corpo.");
			return;
		}
		if (unknownVariables.length > 0) {
			toast.error("Existem variáveis fora do catálogo nativo.", {
				description: unknownVariables.map((variable) => `{{${variable}}}`).join(", "),
			});
			return;
		}
		const invalidPresetButton = state.messageTemplate.conteudo.botoes.find((button) => button.tipo === "URL_PRESET" && !button.texto.trim());
		if (invalidPresetButton) {
			toast.error("Preencha o texto dos botões de preset.");
			return;
		}
		if (!state.messageTemplate.conteudo.assunto.trim()) {
			toast.error("Informe o assunto do e-mail.");
			return;
		}
		return submitMessageMutation({
			messageTemplateId: template?.id || null,
			messageTemplate: state.messageTemplate,
			submitWhatsapp: true,
		});
	}
	return (
		<div className="flex w-full flex-col gap-4">
			<div className="w-full flex flex-col gap-3  lg:flex-row lg:items-center lg:justify-between">
				<Button
					variant="ghost"
					size="fit"
					className="rounded-full flex items-center gap-1 px-2 py-1"
					onClick={() => router.push("/dashboard/communication")}
				>
					<ArrowLeft className="w-5 h-5 short:w-3.5 short:h-3.5" />
					<span className="short:text-xs">VOLTAR</span>
				</Button>
				<div className="flex flex-wrap items-center gap-2">
					<Button variant="outline" type="button" className="gap-2" onClick={() => router.push("/dashboard/communication")}>
						CANCELAR
					</Button>
					<LoadingButton type="button" className="gap-2" loading={isCreatingMessageTemplate} onClick={handleSave}>
						<Save className="h-4 w-4" /> SALVAR TEMPLATE
					</LoadingButton>
				</div>
			</div>
			<div className="grid min-h-[calc(100vh-12rem)] gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(520px,1.5fr)_minmax(340px,1fr)]">
				<BuilderPanel icon={<BadgeCheck className="h-4 w-4" />} title="CONFIGURAÇÃO" description="Identidade, canais e regras de envio.">
					<div className="flex flex-col gap-4">
						<Field label="Nome do Template">
							<Input
								value={state.messageTemplate.nome}
								onChange={(event) => updateTemplate({ nome: formatMessageTemplateName(event.target.value) })}
								placeholder="cashback_expirando_7_dias"
							/>
						</Field>
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
							<Field label="Status">
								<Select
									items={[...statusOptions.map((status) => ({ value: status, label: status }))]}
									value={state.messageTemplate.status}
									onValueChange={(value) => {
										if (value === null) return;
										updateTemplate({ status: value as TTemplateStatus });
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{statusOptions.map((status) => (
												<SelectItem key={status} value={status}>
													{status}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field label="Categoria">
								<Select
									items={[...categoryOptions.map((category) => ({ value: category, label: category }))]}
									value={state.messageTemplate.categoria}
									onValueChange={(value) => {
										if (value === null) return;
										updateTemplate({ categoria: value as TTemplateCategory });
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{categoryOptions.map((category) => (
												<SelectItem key={category} value={category}>
													{category}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						</div>
						<div className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
							<p className="flex items-center gap-1.5 text-xs font-bold uppercase">
								<Mail className="h-3.5 w-3.5" /> E-mail
							</p>
							<Field label="Assunto">
								<Input
									value={state.messageTemplate.conteudo.assunto}
									onChange={(event) => updateTemplateContent({ assunto: event.target.value })}
									placeholder="{{clientName}}, temos novidades"
								/>
							</Field>
							<Field label="Preheader">
								<Input
									value={state.messageTemplate.conteudo.preheader}
									onChange={(event) => updateTemplateContent({ preheader: event.target.value })}
									placeholder="Texto de apoio exibido na caixa de entrada."
								/>
							</Field>
							<p className="text-muted-foreground text-xs">
								Remetente previsto:
								<strong>{slugifySender(organizationName)}@recompracrm.com.br</strong>
							</p>
						</div>
					</div>
				</BuilderPanel>
				<BuilderPanel icon={<FileText className="h-4 w-4" />} title="CONTEÚDO UNIVERSAL" description="O mesmo texto alimenta WhatsApp e e-mail.">
					<div className="flex flex-col gap-4">
						<Field label="Cabeçalho">
							<Select
								items={[...headerTypeOptions.map((type) => ({ value: type.id, label: type.label }))]}
								value={state.messageTemplate.conteudo.cabecalho?.tipo || "NENHUM"}
								onValueChange={(value) => {
									if (value === null) return;
									updateTemplateContentHeader({
										tipo: value as Exclude<TUseMessageTemplateState["state"]["messageTemplate"]["conteudo"]["cabecalho"], null | undefined>["tipo"],
										conteudoMidiaUrl: value === "IMAGEM_DINAMICA" ? "" : state.messageTemplate.conteudo.cabecalho?.conteudoMidiaUrl || "",
										// O handle da Meta é vinculado ao formato do cabeçalho, então trocar de tipo invalida o handle existente.
										conteudoMidiaHandle: null,
										imagemDinamicaPreset: state.messageTemplate.conteudo.cabecalho?.imagemDinamicaPreset || "CASHBACK_AVAILABLE_BALANCE",
									});
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{headerTypeOptions.map((type) => (
											<SelectItem key={type.id} value={type.id}>
												{type.label}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<MessageTemplateBuilderHeader
							organizationId={organizationId}
							header={state.messageTemplate.conteudo.cabecalho}
							updateTemplateContentHeader={updateTemplateContentHeader}
						/>
						<Field label="Corpo da mensagem">
							<MessageTemplateBodyEditor
								content={state.messageTemplate.conteudo.corpo.conteudo}
								onContentChange={(conteudo) => updateTemplateContentBody({ conteudo })}
								parametros={state.messageTemplate.conteudo.corpo.parametros}
								onParametrosChange={(parametros) => updateTemplateContentBody({ parametros })}
							/>
						</Field>
						<Field label="Rodapé">
							<Input
								value={state.messageTemplate.conteudo.rodape || ""}
								onChange={(event) => updateTemplateContent({ rodape: event.target.value })}
								placeholder="Mensagem automática da sua loja."
							/>
						</Field>
						<div className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
							<div className="flex items-center justify-between gap-2">
								<p className="flex items-center gap-1.5 text-xs font-bold uppercase">
									<LinkIcon className="h-3.5 w-3.5" /> Botões
								</p>
								<Button type="button" variant="ghost" size="xs" className="gap-1" onClick={addContentButton}>
									<Plus className="h-3.5 w-3.5" /> MANUAL
								</Button>
							</div>
							<div className="flex flex-wrap gap-2">
								{MESSAGE_TEMPLATE_BUTTON_PRESET_OPTIONS.map((preset) => (
									<Button key={preset.id} type="button" variant="outline" size="xs" className="gap-1" onClick={() => addContentPresetButton(preset.id)}>
										<Plus className="h-3.5 w-3.5" /> {preset.label}
									</Button>
								))}
								<Button type="button" variant="outline" size="xs" className="gap-1" onClick={() => appendContentButtons([EMPTY_SURVEY_BUTTON])}>
									<Plus className="h-3.5 w-3.5" /> Pesquisa
								</Button>
							</div>
							{state.messageTemplate.conteudo.botoes.length > 0 ? (
								state.messageTemplate.conteudo.botoes.map((button, index) => (
									<MessageTemplateButtonEditor
										key={index}
										button={button}
										index={index}
										allButtons={state.messageTemplate.conteudo.botoes}
										updateButton={updateContentButton}
										removeButton={removeContentButton}
										appendButtons={appendContentButtons}
									/>
								))
							) : (
								<p className="text-muted-foreground text-xs">Nenhum botão configurado.</p>
							)}
						</div>
						<div className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
							<p className="flex items-center gap-1.5 text-xs font-bold uppercase">
								<Braces className="h-3.5 w-3.5" /> Variáveis detectadas
							</p>
							{state.messageTemplate.conteudo.corpo.parametros.length > 0 ? (
								<div className="flex flex-col gap-2">
									{state.messageTemplate.conteudo.corpo.parametros.map((parametro, index) => (
										<div key={parametro.identificadorInterno} className="grid gap-2 rounded-lg bg-background p-2 md:grid-cols-[1fr_1fr]">
											<div className="border-border bg-muted/30 flex min-h-9 items-center rounded-4xl border px-3 font-mono text-sm">
												{`{{${parametro.identificadorInterno}}}`}
											</div>
											<Input
												value={parametro.exemplo}
												onChange={(event) =>
													updateTemplateContentBodyParameter(index, {
														exemplo: event.target.value,
													})
												}
												placeholder="Exemplo"
											/>
										</div>
									))}
								</div>
							) : (
								<p className="text-muted-foreground text-xs">Use variáveis como {"{{clientName}}"} no conteúdo.</p>
							)}
							{unknownVariables.length > 0 ? (
								<div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-700">
									Variáveis não permitidas:
									{unknownVariables.map((variable) => `{{${variable}}}`).join(", ")}.
								</div>
							) : null}
						</div>
					</div>
				</BuilderPanel>
				<BuilderPanel icon={<Eye className="h-4 w-4" />} title="PREVIEW E VALIDAÇÃO" description="Confira a leitura em cada canal.">
					<div className="flex flex-col gap-4">
						<WhatsappPreview messageTemplate={state.messageTemplate} organizationTheme={organizationTheme} warnings={whatsappWarnings} />
						<EmailPreview
							messageTemplate={state.messageTemplate}
							organizationId={organizationId}
							organizationName={organizationName}
							organizationTheme={organizationTheme}
							warnings={emailWarnings}
						/>
					</div>
				</BuilderPanel>
			</div>
		</div>
	);
}
type MessageTemplateBuilderHeaderProps = {
	organizationId: string;
	header: TUseMessageTemplateState["state"]["messageTemplate"]["conteudo"]["cabecalho"];
	updateTemplateContentHeader: TUseMessageTemplateState["updateTemplateContentHeader"];
};
function MessageTemplateBuilderHeader({ organizationId, header, updateTemplateContentHeader }: MessageTemplateBuilderHeaderProps) {
	if (!header) return null;
	if (header.tipo === "NENHUM") return null;
	if (header.tipo === "TEXTO")
		return (
			<Field label="Texto do cabeçalho">
				<Input value={header.conteudoTexto || ""} onChange={(event) => updateTemplateContentHeader({ conteudoTexto: event.target.value })} />
			</Field>
		);
	if (header.tipo === "IMAGEM_DINAMICA")
		return (
			<DynamicHeaderPresetPicker
				presetId={header.imagemDinamicaPreset || "CASHBACK_AVAILABLE_BALANCE"}
				onChange={(presetId) => updateTemplateContentHeader({ imagemDinamicaPreset: presetId })}
			/>
		);
	if (header.tipo === "LOCALIZAÇÃO") return <div>LOCALIZAÇÃO</div>;
	return (
		<HeaderMediaUpload
			headerType={header.tipo}
			currentUrl={header.conteudoMidiaUrl || ""}
			organizationId={organizationId}
			onUploaded={(url) => updateTemplateContentHeader({ conteudoMidiaUrl: url, conteudoMidiaHandle: null })}
			onRemoved={() => updateTemplateContentHeader({ conteudoMidiaUrl: "", conteudoMidiaHandle: null })}
		/>
	);
}
function BuilderPanel({
	icon,
	title,
	description,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-border bg-card flex min-h-0 flex-col rounded-lg border shadow-xs">
			<div className="border-border border-b px-4 py-3">
				<div className="flex items-center gap-1.5">
					{icon} <h2 className="text-sm font-bold">{title}</h2>
				</div>
				<p className="text-muted-foreground mt-0.5 text-xs leading-5">{description}</p>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
		</section>
	);
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-xs font-bold uppercase">{label}</span>
			{children}
		</label>
	);
}
function HeaderMediaUpload({
	headerType,
	currentUrl,
	organizationId,
	onUploaded,
	onRemoved,
}: {
	headerType: "IMAGEM" | "VIDEO" | "DOCUMENTO";
	currentUrl: string;
	organizationId: string;
	onUploaded: (url: string) => void;
	onRemoved: () => void;
}) {
	const mappedType = headerType === "IMAGEM" ? "image" : headerType === "VIDEO" ? "video" : "document";
	return (
		<div className="sm:col-span-2">
			<TemplateMediaUpload
				headerType={mappedType}
				currentUrl={currentUrl || null}
				onMediaUploaded={onUploaded}
				onMediaRemoved={onRemoved}
				organizationId={organizationId}
			/>
		</div>
	);
}
function DynamicHeaderPresetPicker({
	presetId,
	onChange,
}: {
	presetId: TTemplateDynamicHeaderPreset;
	onChange: (presetId: TTemplateDynamicHeaderPreset) => void;
}) {
	const selectedPreset =
		MessageTemplateDynamicHeaderPresetOptions.find((preset) => preset.id === presetId) ?? MessageTemplateDynamicHeaderPresetOptions[0];
	return (
		<div className="sm:col-span-2">
			<div className="flex flex-col gap-3">
				<Field label="Preset da imagem">
					<Select
						items={[...MessageTemplateDynamicHeaderPresetOptions.map((preset) => ({ value: preset.id, label: preset.label }))]}
						value={presetId}
						onValueChange={(value) => {
							if (value === null) return;
							onChange(value as TTemplateDynamicHeaderPreset);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{MessageTemplateDynamicHeaderPresetOptions.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										{preset.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<div className="text-muted-foreground flex gap-2 rounded-lg bg-background p-3 text-xs leading-5">
					<ImageIcon className="mt-0.5 h-4 w-4 shrink-0" />
					<p>{selectedPreset?.description}</p>
				</div>
			</div>
		</div>
	);
}
function WhatsappPreview({
	messageTemplate,
	organizationTheme,
	warnings,
}: {
	messageTemplate: TUseMessageTemplateState["state"]["messageTemplate"];
	organizationTheme: OrganizationTemplateTheme;
	warnings: string[];
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2 text-sm font-bold">
				<WhatsappIcon className="h-4 w-4 text-emerald-600" /> WhatsApp
			</div>
			<div className="rounded-2xl bg-[#e8f5e9] p-3">
				<div className="ml-auto flex max-w-[92%] flex-col gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
					{messageTemplate.conteudo.cabecalho?.tipo === "TEXTO" && messageTemplate.conteudo.cabecalho.conteudoTexto ? (
						<p className="font-bold">
							{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.cabecalho.conteudoTexto, messageTemplate.conteudo.corpo.parametros)}
						</p>
					) : messageTemplate.conteudo.cabecalho?.tipo === "IMAGEM_DINAMICA" ? (
						<DynamicHeaderImagePreview
							presetId={messageTemplate.conteudo.cabecalho.imagemDinamicaPreset || "CASHBACK_AVAILABLE_BALANCE"}
							organizationTheme={organizationTheme}
						/>
					) : messageTemplate.conteudo.cabecalho?.tipo !== "NENHUM" ? (
						<HeaderPreview type={messageTemplate.conteudo.cabecalho?.tipo || "NENHUM"} url={messageTemplate.conteudo.cabecalho?.conteudoMidiaUrl || ""} />
					) : null}
					<p className="whitespace-pre-wrap leading-5">
						{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.corpo.conteudo, messageTemplate.conteudo.corpo.parametros)}
					</p>
					{messageTemplate.conteudo.rodape ? (
						<p className="text-muted-foreground border-t pt-2 text-xs">
							{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.rodape, messageTemplate.conteudo.corpo.parametros)}
						</p>
					) : null}
					{messageTemplate.conteudo.botoes.length > 0 ? (
						<div className="flex flex-col gap-1 border-t pt-2">
							{messageTemplate.conteudo.botoes.map((button, index) => (
								<button key={index} type="button" className="text-sky-600 text-xs font-bold">
									{button.texto}
									{button.tipo === "URL_PRESET" ? " ↗" : null}
								</button>
							))}
						</div>
					) : null}
				</div>
			</div>
			<Warnings warnings={warnings} />
		</div>
	);
}
function EmailPreview({
	messageTemplate,
	organizationId,
	organizationName,
	organizationTheme,
	warnings,
}: {
	messageTemplate: TUseMessageTemplateState["state"]["messageTemplate"];
	organizationId: string;
	organizationName: string;
	organizationTheme: OrganizationTemplateTheme;
	warnings: string[];
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2 text-sm font-bold">
				<Mail className="h-4 w-4 text-sky-600" /> E-mail
			</div>
			<div className="border-border overflow-hidden rounded-xl border bg-white text-zinc-950">
				<div className="border-b bg-zinc-50 p-3">
					<p className="text-xs text-zinc-500">
						De: {organizationName} &lt;{slugifySender(organizationName)}
						@recompracrm.com.br&gt;
					</p>
					<p className="mt-1 text-sm font-bold">
						{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.assunto || "Assunto do e-mail", messageTemplate.conteudo.corpo.parametros)}
					</p>
					{messageTemplate.conteudo.preheader ? (
						<p className="text-xs text-zinc-500">
							{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.preheader, messageTemplate.conteudo.corpo.parametros)}
						</p>
					) : null}
				</div>
				<div className="p-4">
					{messageTemplate.conteudo.cabecalho?.tipo === "TEXTO" && messageTemplate.conteudo.cabecalho.conteudoTexto ? (
						<h3 className="mb-3 text-lg font-bold">
							{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.cabecalho.conteudoTexto, messageTemplate.conteudo.corpo.parametros)}
						</h3>
					) : messageTemplate.conteudo.cabecalho?.tipo === "IMAGEM_DINAMICA" ? (
						<div className="mb-4">
							<DynamicHeaderImagePreview
								presetId={messageTemplate.conteudo.cabecalho.imagemDinamicaPreset || "CASHBACK_AVAILABLE_BALANCE"}
								organizationTheme={organizationTheme}
							/>
						</div>
					) : messageTemplate.conteudo.cabecalho?.tipo !== "NENHUM" ? (
						<div className="mb-4">
							<HeaderPreview type={messageTemplate.conteudo.cabecalho?.tipo || "NENHUM"} url={messageTemplate.conteudo.cabecalho?.conteudoMidiaUrl || ""} />
						</div>
					) : null}
					<p className="whitespace-pre-wrap text-sm leading-6">
						{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.corpo.conteudo, messageTemplate.conteudo.corpo.parametros)}
					</p>
					{messageTemplate.conteudo.botoes[0] ? <EmailPreviewButton button={messageTemplate.conteudo.botoes[0]} organizationId={organizationId} /> : null}
					{messageTemplate.conteudo.rodape ? (
						<p className="mt-5 border-t pt-3 text-xs text-zinc-500">
							{renderResolvedTemplateWithHighlights(messageTemplate.conteudo.rodape, messageTemplate.conteudo.corpo.parametros)}
						</p>
					) : null}
				</div>
			</div>
			<Warnings warnings={warnings} />
		</div>
	);
}
function EmailPreviewButton({ button, organizationId }: { button: TTemplateButtonDraft; organizationId: string }) {
	const href =
		button.tipo === "URL"
			? button.url
			: button.tipo === "URL_PRESET"
				? (getMessageTemplateButtonPreset(button.preset)?.buildRuntimeUrl({
						origin: getDefaultAppOrigin(),
						orgId: organizationId,
						clientId: button.exemplo || "CLIENT_ID",
					}) ?? "#")
				: "#";
	return (
		<a
			href={href}
			className="mt-4 inline-flex rounded-md bg-zinc-950 px-4 py-2 text-xs font-bold text-white"
			onClick={(event) => event.preventDefault()}
		>
			{button.texto}
		</a>
	);
}
function HeaderPreview({
	type,
	url,
}: {
	type: Exclude<TUseMessageTemplateState["state"]["messageTemplate"]["conteudo"]["cabecalho"], null | undefined>["tipo"];
	url: string;
}) {
	if (!url) {
		return <div className="bg-muted text-muted-foreground flex h-24 items-center justify-center rounded-lg text-xs font-semibold">{type}</div>;
	}
	if (type === "IMAGEM") {
		return <img src={url} alt="Cabeçalho do template" className="h-32 w-full rounded-lg object-cover" />;
	}
	if (type === "VIDEO") {
		return (
			<video src={url} className="h-32 w-full rounded-lg object-cover" controls>
				<track kind="captions" />
			</video>
		);
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className="bg-muted text-muted-foreground flex h-20 items-center justify-center rounded-lg text-xs font-semibold"
		>
			Documento anexado
		</a>
	);
}
function Warnings({ warnings }: { warnings: string[] }) {
	if (warnings.length === 0) {
		return (
			<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700">
				Pronto para revisão neste canal.
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-medium text-amber-800">
			{warnings.map((warning) => (
				<p key={warning}>- {warning}</p>
			))}
		</div>
	);
}
function slugifySender(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
		.slice(0, 32);
}
