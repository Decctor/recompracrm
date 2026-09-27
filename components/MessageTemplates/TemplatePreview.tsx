import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { DynamicHeaderImagePreview, type OrganizationTemplateTheme } from "@/app/dashboard/communication/_components/dynamic-header-image-preview";
import { renderWhatsappTextWithFormatting } from "@/components/Whatsapp/WhatsappMessageText";
import {
	MESSAGE_TEMPLATE_BODY_MAX_LENGTH,
	MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT,
	MESSAGE_TEMPLATE_FOOTER_MAX_LENGTH,
	MESSAGE_TEMPLATE_HEADER_TEXT_MAX_LENGTH,
} from "@/lib/message-templates/constants";
import { convertHtmlToWhatsappText } from "@/lib/message-templates/formatting";
import { resolveMessageTemplateVariablePreviewValue } from "@/lib/message-templates/parsing";
import type { TMessageTemplateRuntimeValues } from "@/lib/message-templates/types";
import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { Eye, FileText as FileTextIcon, ImageIcon, MapPin, VideoIcon } from "lucide-react";

type TemplatePreviewProps = {
	content?: TMessageTemplateContent | null;
	organizationTheme?: OrganizationTemplateTheme;
	compact?: boolean;
	variables?: TMessageTemplateRuntimeValues;
};

// Mantém os tokens {{...}} no texto e resolve cada variável na hora do render,
// destacando o valor preenchido (exemplo ou valor de runtime) no balão do preview.
function renderPreviewText(text: string, parameters: TMessageTemplateContent["corpo"]["parametros"], variables?: TMessageTemplateRuntimeValues) {
	return renderWhatsappTextWithFormatting(convertHtmlToWhatsappText(text), {
		renderVariable: ({ identifier, raw }) => {
			const resolved = resolveMessageTemplateVariablePreviewValue({ token: identifier, parameters, values: variables });
			return <span className="rounded bg-[#dcf8c6] px-1 py-0.5 font-medium text-[#075e54]">{resolved ?? raw}</span>;
		},
	});
}

function getButtonIcon(tipo: TMessageTemplateContent["botoes"][number]["tipo"]) {
	if (tipo === "RESPOSTA RÁPIDA") return "↩️ ";
	if (tipo === "RESPOSTA_PESQUISA") return "☑️ ";
	if (tipo === "TELEFONE") return "📞 ";
	if (tipo === "URL" || tipo === "URL_PRESET") return "🔗 ";
	return "";
}

function MessageTemplateHeaderPreview({
	cabecalho,
	organizationTheme,
	parameters,
	variables,
}: {
	cabecalho: NonNullable<TMessageTemplateContent["cabecalho"]>;
	organizationTheme?: OrganizationTemplateTheme;
	parameters: TMessageTemplateContent["corpo"]["parametros"];
	variables?: TMessageTemplateRuntimeValues;
}) {
	if (cabecalho.tipo === "NENHUM") return null;

	if (cabecalho.tipo === "TEXTO") {
		return (
			<div className="px-3 pt-3">
				<p className="font-semibold text-sm text-gray-900">
					{cabecalho.conteudoTexto ? renderPreviewText(cabecalho.conteudoTexto, parameters, variables) : "Texto do cabeçalho"}
				</p>
			</div>
		);
	}

	if (cabecalho.tipo === "IMAGEM_DINAMICA") {
		if (!organizationTheme) {
			return (
				<div className="w-full aspect-video bg-gray-500 flex items-center justify-center">
					<ImageIcon className="w-16 h-16 text-white" strokeWidth={1.5} />
				</div>
			);
		}
		return (
			<DynamicHeaderImagePreview
				presetId={cabecalho.imagemDinamicaPreset ?? "CASHBACK_AVAILABLE_BALANCE"}
				organizationTheme={organizationTheme}
			/>
		);
	}

	if (cabecalho.tipo === "LOCALIZAÇÃO") {
		const location = cabecalho.conteudoLocalizacao;
		return (
			<div className="px-3 pt-3">
				<div className="flex items-start gap-2 rounded bg-gray-100 p-2">
					<MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#00a884]" />
					<div className="min-w-0">
						<p className="text-sm font-semibold text-gray-900">{location?.titulo || "Localização"}</p>
						<p className="text-xs text-gray-600">{location?.endereco || "Endereço"}</p>
					</div>
				</div>
			</div>
		);
	}

	const mediaUrl = cabecalho.conteudoMidiaUrl;

	if (cabecalho.tipo === "IMAGEM") {
		return mediaUrl ? (
			<img src={mediaUrl} alt="Header preview" className="w-full aspect-video object-cover" />
		) : (
			<div className="w-full aspect-video bg-gray-500 flex items-center justify-center">
				<ImageIcon className="w-16 h-16 text-white" strokeWidth={1.5} />
			</div>
		);
	}

	if (cabecalho.tipo === "VIDEO") {
		return mediaUrl ? (
			<video src={mediaUrl} className="w-full aspect-video object-cover" controls muted>
				<track kind="captions" />
			</video>
		) : (
			<div className="w-full aspect-video bg-gray-500 flex items-center justify-center">
				<VideoIcon className="w-16 h-16 text-white" strokeWidth={1.5} />
			</div>
		);
	}

	if (cabecalho.tipo === "DOCUMENTO") {
		return (
			<div className="px-3 pt-3">
				<div className="flex items-center gap-2 rounded bg-gray-500 p-2">
					<FileTextIcon className="h-8 w-8 text-white" />
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-white">Documento</p>
						<p className="text-xs text-white">{mediaUrl ? "Anexo" : "PDF"}</p>
					</div>
				</div>
			</div>
		);
	}

	return null;
}

function TemplatePreview({ content, organizationTheme, compact = false, variables }: TemplatePreviewProps) {
	if (!content) return null;

	const { cabecalho, corpo, rodape, botoes } = content;
	const bodyText = convertHtmlToWhatsappText(corpo.conteudo);
	const footerText = rodape ? convertHtmlToWhatsappText(rodape) : null;
	const currentTime = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
	const headerTextLength = cabecalho?.tipo === "TEXTO" ? (cabecalho.conteudoTexto?.length ?? 0) : 0;

	const previewContent = (
		<div className={compact ? "w-full flex flex-col items-center justify-center" : "w-full h-full flex flex-col items-center justify-center gap-4 pb-4"}>
			<div
				className={
					compact
						? "relative w-full rounded-lg overflow-hidden bg-[#e5ddd5]"
						: "relative w-full max-w-md min-w-[300px] rounded-lg overflow-hidden bg-[#e5ddd5]"
				}
			>
					<div
						className="absolute inset-0 opacity-10"
						style={{
							backgroundImage:
								"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
						}}
					/>

					<div className={compact ? "relative p-3 min-h-[200px] flex items-center justify-center" : "relative p-4 min-h-[300px] flex items-center justify-center"}>
						<div className="bg-white rounded-lg shadow-md overflow-hidden max-w-[85%] relative">
							{cabecalho && cabecalho.tipo !== "NENHUM" ? (
								<div className="w-full">
									<MessageTemplateHeaderPreview
										cabecalho={cabecalho}
										organizationTheme={organizationTheme}
										parameters={corpo.parametros}
										variables={variables}
									/>
								</div>
							) : null}

							<div className="px-3 py-2 pt-3">
								<div className="whitespace-pre-wrap text-sm text-gray-900 break-words">
									{bodyText ? renderPreviewText(corpo.conteudo, corpo.parametros, variables) : "Digite o conteúdo da mensagem..."}
								</div>

								{footerText && rodape ? (
									<div className="mt-2">
										<p className="text-xs text-[#00a884]">{renderPreviewText(rodape, corpo.parametros, variables)}</p>
									</div>
								) : null}

								<div className="flex items-center justify-end gap-1 mt-1">
									<span className="text-[10px] text-gray-500">{currentTime}</span>
								</div>
							</div>

							{botoes.length > 0 ? (
								<div className="border-t border-gray-200">
									{botoes.map((botao, index) => (
										<div key={index.toString()} className="border-b border-gray-200 last:border-b-0 py-2.5 px-4 text-center">
											<button type="button" className="text-sm font-medium text-[#00a884] disabled:cursor-default w-full" disabled>
												{getButtonIcon(botao.tipo)}
												{botao.texto || "Texto do botão"}
											</button>
										</div>
									))}
								</div>
							) : null}
						</div>
					</div>
				</div>

				{!compact ? (
					<div className="w-full max-w-md space-y-2 mt-2">
						<div className="flex items-center justify-between text-xs">
							<span className="text-foreground/60">Caracteres no corpo:</span>
							<span className={bodyText.length > MESSAGE_TEMPLATE_BODY_MAX_LENGTH ? "text-red-500 font-semibold" : "text-foreground/80"}>
								{bodyText.length} / {MESSAGE_TEMPLATE_BODY_MAX_LENGTH}
							</span>
						</div>

						{cabecalho?.tipo === "TEXTO" && cabecalho.conteudoTexto ? (
							<div className="flex items-center justify-between text-xs">
								<span className="text-foreground/60">Caracteres no cabeçalho:</span>
								<span
									className={
										headerTextLength > MESSAGE_TEMPLATE_HEADER_TEXT_MAX_LENGTH ? "text-red-500 font-semibold" : "text-foreground/80"
									}
								>
									{headerTextLength} / {MESSAGE_TEMPLATE_HEADER_TEXT_MAX_LENGTH}
								</span>
							</div>
						) : null}

						{footerText ? (
							<div className="flex items-center justify-between text-xs">
								<span className="text-foreground/60">Caracteres no rodapé:</span>
								<span className={footerText.length > MESSAGE_TEMPLATE_FOOTER_MAX_LENGTH ? "text-red-500 font-semibold" : "text-foreground/80"}>
									{footerText.length} / {MESSAGE_TEMPLATE_FOOTER_MAX_LENGTH}
								</span>
							</div>
						) : null}

						{botoes.length > 0 ? (
							<div className="flex items-center justify-between text-xs">
								<span className="text-foreground/60">Número de botões:</span>
								<span className={botoes.length > MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT ? "text-red-500 font-semibold" : "text-foreground/80"}>
									{botoes.length} / {MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT}
								</span>
							</div>
						) : null}
					</div>
				) : null}
			</div>
	);

	if (compact) return previewContent;

	return (
		<ResponsiveMenuSection title="PREVIEW" icon={<Eye size={15} />}>
			{previewContent}
		</ResponsiveMenuSection>
	);
}

export default TemplatePreview;
