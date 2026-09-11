import { Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import {
	convertHtmlToEmailHtml,
	getDefaultAppOrigin,
	getMessageTemplateButtonPreset,
	replaceMessageTemplateVariables,
	type TMessageTemplateRuntimeValues,
} from "@/lib/message-templates";
import type { TMessageTemplateContent } from "@/schemas/message-templates";
import * as React from "react";

type MessageTemplateEmailProps = {
	content: TMessageTemplateContent;
	variables: TMessageTemplateRuntimeValues;
	organization: {
		id: string;
		name: string;
		logoUrl?: string | null;
		primaryColor?: string | null;
		primaryForeground?: string | null;
	};
	clientId?: string | null;
	origin?: string;
	headerMediaUrl?: string | null;
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";
const FALLBACK_PRIMARY = "#24549C";
const FALLBACK_ON_PRIMARY = "#ffffff";

function parseHex(input: string | null | undefined): { r: number; g: number; b: number } {
	const source = (input || FALLBACK_PRIMARY).trim().replace(/^#/, "");
	const full = source.length === 3 ? source.split("").map((c) => c + c).join("") : source.padEnd(6, "0").slice(0, 6);
	const num = Number.parseInt(full, 16);
	if (Number.isNaN(num)) return { r: 36, g: 84, b: 156 };
	return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }) {
	const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
	return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function darken(hex: string, amount: number) {
	const { r, g, b } = parseHex(hex);
	return toHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
}

function lighten(hex: string, amount: number) {
	const { r, g, b } = parseHex(hex);
	return toHex({ r: r + (255 - r) * amount, g: g + (255 - g) * amount, b: b + (255 - b) * amount });
}

function rgba(hex: string, alpha: number) {
	const { r, g, b } = parseHex(hex);
	return `rgba(${r},${g},${b},${alpha})`;
}

function buildPalette(primaryColor: string | null | undefined, primaryForeground: string | null | undefined) {
	const primary = primaryColor || FALLBACK_PRIMARY;
	const onPrimary = primaryForeground || FALLBACK_ON_PRIMARY;
	return {
		primary,
		onPrimary,
		primaryLight: lighten(primary, 0.12),
		primaryDarker: darken(primary, 0.18),
		primaryDeep: darken(primary, 0.42),
		primaryAbyss: darken(primary, 0.58),
		canvasTint: lighten(primary, 0.96),
		canvasWash: lighten(primary, 0.92),
		surfaceSoft: lighten(primary, 0.88),
		mediaWash: lighten(primary, 0.94),
		hairline: rgba(primary, 0.14),
		hairlineSoft: rgba(primary, 0.08),
		shadowSoft: rgba(primary, 0.18),
		shadowStrong: rgba(primary, 0.32),
		buttonShadow: rgba(darken(primary, 0.3), 0.45),
		onPrimaryMuted: "rgba(255,255,255,0.74)",
		onPrimaryStrong: "rgba(255,255,255,0.95)",
		onPrimaryHairline: "rgba(255,255,255,0.22)",
	};
}

type Palette = ReturnType<typeof buildPalette>;

function resolveText(text: string | null | undefined, variables: TMessageTemplateRuntimeValues) {
	return replaceMessageTemplateVariables(text ?? "", variables);
}

function resolveHtml(text: string | null | undefined, variables: TMessageTemplateRuntimeValues) {
	return convertHtmlToEmailHtml(resolveText(text, variables));
}

function RichTextBlock({ html, style }: { html: string; style: React.CSSProperties }) {
	return <div style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

function resolveButtonHref({
	button,
	organizationId,
	clientId,
	origin,
}: {
	button: TMessageTemplateContent["botoes"][number];
	organizationId: string;
	clientId?: string | null;
	origin: string;
}) {
	if (button.tipo === "URL") return button.url;
	if (button.tipo === "URL_PRESET") {
		const preset = getMessageTemplateButtonPreset(button.preset);
		return (
			preset?.buildRuntimeUrl({
				origin,
				orgId: organizationId,
				clientId: clientId ?? button.exemplo,
			}) ?? "#"
		);
	}
	if (button.tipo === "TELEFONE") return `tel:${button.telefone.replace(/[^0-9+]/g, "")}`;
	return "#";
}

function BrandHeader({
	content,
	variables,
	organization,
	palette,
}: {
	content: TMessageTemplateContent;
	variables: TMessageTemplateRuntimeValues;
	organization: MessageTemplateEmailProps["organization"];
	palette: Palette;
}) {
	const header = content.cabecalho;
	const hasTextoHeader = header?.tipo === "TEXTO" && header.conteudoTexto;
	const drenchedBackground = `linear-gradient(135deg, ${palette.primaryLight} 0%, ${palette.primary} 48%, ${palette.primaryDarker} 100%)`;

	return (
		<Section
			style={{
				background: drenchedBackground,
				backgroundColor: palette.primary,
				padding: hasTextoHeader ? "44px 32px 40px" : "48px 32px 44px",
				textAlign: "center" as const,
			}}
		>
			{organization.logoUrl ? (
				<Img
					src={organization.logoUrl}
					width={hasTextoHeader ? "52" : "68"}
					height={hasTextoHeader ? "52" : "68"}
					alt={organization.name}
					style={{
						borderRadius: "16px",
						display: "block",
						margin: hasTextoHeader ? "0 auto 14px" : "0 auto 18px",
						objectFit: "cover" as const,
						backgroundColor: palette.onPrimary,
						padding: "4px",
						boxShadow: `0 8px 20px -8px ${rgba(palette.primaryDeep, 0.5)}`,
					}}
				/>
			) : null}

			<Text
				style={{
					color: hasTextoHeader ? palette.onPrimaryMuted : palette.onPrimary,
					fontSize: hasTextoHeader ? "12px" : "16px",
					fontWeight: hasTextoHeader ? 700 : 800,
					letterSpacing: hasTextoHeader ? "0.18em" : "0.02em",
					lineHeight: 1.2,
					margin: "0",
					textTransform: hasTextoHeader ? ("uppercase" as const) : ("none" as const),
				}}
			>
				{organization.name}
			</Text>

			{hasTextoHeader ? (
				<>
					<div
						style={{
							width: "36px",
							height: "3px",
							margin: "20px auto 22px",
							borderRadius: "999px",
							backgroundColor: palette.onPrimaryHairline,
						}}
					/>
					<Heading
						as="h1"
						style={{
							color: palette.onPrimary,
							fontSize: "32px",
							fontWeight: 800,
							letterSpacing: "-0.02em",
							lineHeight: 1.15,
							margin: "0 auto",
							maxWidth: "460px",
						}}
					>
						{resolveText(header.conteudoTexto ?? "", variables)}
					</Heading>
				</>
			) : (
				<div
					style={{
						width: "32px",
						height: "3px",
						margin: "16px auto 0",
						borderRadius: "999px",
						backgroundColor: palette.onPrimaryHairline,
					}}
				/>
			)}
		</Section>
	);
}

function HeaderMedia({
	content,
	headerMediaUrl,
	palette,
}: {
	content: TMessageTemplateContent;
	headerMediaUrl?: string | null;
	palette: Palette;
}) {
	const header = content.cabecalho;
	if (!header || header.tipo === "NENHUM" || header.tipo === "TEXTO") return null;

	const mediaUrl = header.tipo === "IMAGEM_DINAMICA" ? headerMediaUrl : header.conteudoMidiaUrl;

	if ((header.tipo === "IMAGEM" || header.tipo === "IMAGEM_DINAMICA") && mediaUrl) {
		return (
			<Section style={{ padding: "0", lineHeight: "0", backgroundColor: palette.canvasTint }}>
				<Img src={mediaUrl} width="600" alt="Cabeçalho da mensagem" style={coverImage} />
			</Section>
		);
	}

	if (header.tipo === "VIDEO" && mediaUrl) {
		return <MediaFallback palette={palette} label="Conteúdo em vídeo" link={mediaUrl} linkText="Assistir ao vídeo" />;
	}

	if (header.tipo === "DOCUMENTO" && mediaUrl) {
		return <MediaFallback palette={palette} label="Documento anexado" link={mediaUrl} linkText="Abrir documento" />;
	}

	if (header.tipo === "LOCALIZAÇÃO" && header.conteudoLocalizacao) {
		return (
			<Section
				style={{
					backgroundColor: palette.mediaWash,
					borderBottom: `1px solid ${palette.hairlineSoft}`,
					padding: "28px 32px",
					textAlign: "left" as const,
				}}
			>
				<Text
					style={{
						color: palette.primaryDarker,
						fontSize: "11px",
						fontWeight: 800,
						letterSpacing: "0.18em",
						lineHeight: 1,
						margin: "0 0 10px",
						textTransform: "uppercase" as const,
					}}
				>
					Localização
				</Text>
				<Text
					style={{
						color: "#111827",
						fontSize: "20px",
						fontWeight: 800,
						letterSpacing: "-0.01em",
						lineHeight: 1.25,
						margin: "0 0 6px",
					}}
				>
					{header.conteudoLocalizacao.titulo}
				</Text>
				<Text style={{ color: "#4b5563", fontSize: "14px", lineHeight: 1.55, margin: "0" }}>{header.conteudoLocalizacao.endereco}</Text>
			</Section>
		);
	}

	return null;
}

function MediaFallback({ palette, label, link, linkText }: { palette: Palette; label: string; link: string; linkText: string }) {
	return (
		<Section
			style={{
				backgroundColor: palette.mediaWash,
				borderBottom: `1px solid ${palette.hairlineSoft}`,
				padding: "28px 32px",
				textAlign: "center" as const,
			}}
		>
			<Text
				style={{
					color: palette.primaryDarker,
					fontSize: "11px",
					fontWeight: 800,
					letterSpacing: "0.18em",
					lineHeight: 1,
					margin: "0 0 12px",
					textTransform: "uppercase" as const,
				}}
			>
				{label}
			</Text>
			<Link
				href={link}
				style={{
					color: palette.primary,
					fontSize: "15px",
					fontWeight: 700,
					textDecoration: "none",
				}}
			>
				{linkText} →
			</Link>
		</Section>
	);
}

function BodyButtons({
	content,
	variables,
	organizationId,
	clientId,
	origin,
	palette,
}: {
	content: TMessageTemplateContent;
	variables: TMessageTemplateRuntimeValues;
	organizationId: string;
	clientId?: string | null;
	origin: string;
	palette: Palette;
}) {
	if (content.botoes.length === 0) return null;

	return (
		<Section style={{ margin: "32px 0 8px", textAlign: "center" as const }}>
			{content.botoes.map((button, index) => {
				const isPrimary = index === 0;
				return (
					<div key={`${button.tipo}-${button.texto}-${index}`} style={{ margin: "0 0 12px" }}>
						<Button
							href={resolveButtonHref({ button, organizationId, clientId, origin })}
							style={
								isPrimary
									? {
											background: `linear-gradient(135deg, ${palette.primaryLight} 0%, ${palette.primary} 55%, ${palette.primaryDarker} 100%)`,
											backgroundColor: palette.primary,
											border: `1px solid ${palette.primaryDarker}`,
											borderRadius: "14px",
											color: palette.onPrimary,
											display: "inline-block",
											fontSize: "15px",
											fontWeight: 800,
											letterSpacing: "0.01em",
											padding: "15px 32px",
											textDecoration: "none",
											boxShadow: `0 12px 24px -10px ${palette.buttonShadow}`,
										}
									: {
											backgroundColor: "#ffffff",
											border: `1.5px solid ${palette.hairline}`,
											borderRadius: "14px",
											color: palette.primaryDarker,
											display: "inline-block",
											fontSize: "14px",
											fontWeight: 700,
											letterSpacing: "0.01em",
											padding: "13px 28px",
											textDecoration: "none",
										}
							}
						>
							{resolveText(button.texto, variables)}
						</Button>
					</div>
				);
			})}
		</Section>
	);
}

export default function MessageTemplateEmail({ content, variables, organization, clientId, origin, headerMediaUrl }: MessageTemplateEmailProps) {
	const effectiveOrigin = origin || getDefaultAppOrigin();
	const palette = buildPalette(organization.primaryColor, organization.primaryForeground);
	const bodyHtml = resolveHtml(content.corpo.conteudo, variables);
	const rodapeHtml = content.rodape ? resolveHtml(content.rodape, variables) : null;
	const linkUrl = baseUrl || effectiveOrigin;

	return (
		<Html>
			<Head />
			<Preview>{resolveText(content.preheader, variables)}</Preview>
			<Body
				style={{
					margin: "0",
					padding: "32px 12px",
					background: `linear-gradient(180deg, ${palette.canvasTint} 0%, ${palette.canvasWash} 100%)`,
					backgroundColor: palette.canvasTint,
					fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
				}}
			>
				<Container
					style={{
						backgroundColor: "#ffffff",
						borderRadius: "24px",
						margin: "0 auto",
						maxWidth: "600px",
						overflow: "hidden",
						boxShadow: `0 28px 64px -20px ${palette.shadowStrong}, 0 8px 20px -8px ${palette.shadowSoft}, 0 0 0 1px ${palette.hairlineSoft}`,
					}}
				>
					<div
						style={{
							height: "6px",
							background: `linear-gradient(90deg, ${palette.primaryLight} 0%, ${palette.primary} 50%, ${palette.primaryDarker} 100%)`,
							backgroundColor: palette.primary,
						}}
					/>

					<BrandHeader content={content} variables={variables} organization={organization} palette={palette} />

					<HeaderMedia content={content} headerMediaUrl={headerMediaUrl} palette={palette} />

					<Section style={{ padding: "40px 36px 12px" }}>
						<RichTextBlock
							html={bodyHtml}
							style={{
								color: "#1f2937",
								fontSize: "16px",
								lineHeight: "1.7",
								margin: "0",
							}}
						/>

						<BodyButtons
							content={content}
							variables={variables}
							organizationId={organization.id}
							clientId={clientId}
							origin={effectiveOrigin}
							palette={palette}
						/>

						{rodapeHtml ? (
							<>
								<div
									style={{
										height: "1px",
										background: `linear-gradient(90deg, transparent 0%, ${palette.hairline} 50%, transparent 100%)`,
										margin: "32px 0 20px",
									}}
								/>
								<RichTextBlock
									html={rodapeHtml}
									style={{
										color: "#6b7280",
										fontSize: "13px",
										fontStyle: "italic",
										lineHeight: "1.55",
										margin: "0",
										textAlign: "center",
									}}
								/>
							</>
						) : null}
					</Section>

					<Section
						style={{
							background: `linear-gradient(160deg, ${palette.primaryDeep} 0%, ${palette.primaryAbyss} 100%)`,
							backgroundColor: palette.primaryDeep,
							padding: "32px 32px 36px",
							textAlign: "center" as const,
							marginTop: "32px",
						}}
					>
						<Text
							style={{
								color: palette.onPrimaryMuted,
								fontSize: "11px",
								fontWeight: 800,
								letterSpacing: "0.22em",
								lineHeight: 1,
								margin: "0 0 12px",
								textTransform: "uppercase" as const,
							}}
						>
							Enviado por
						</Text>
						<Text
							style={{
								color: palette.onPrimary,
								fontSize: "16px",
								fontWeight: 800,
								letterSpacing: "-0.005em",
								lineHeight: 1.3,
								margin: "0 0 4px",
							}}
						>
							{organization.name}
						</Text>
						<Text
							style={{
								color: palette.onPrimaryMuted,
								fontSize: "12px",
								lineHeight: 1.5,
								margin: "0 0 20px",
							}}
						>
							via RecompraCRM
						</Text>
						<div
							style={{
								width: "28px",
								height: "2px",
								margin: "0 auto 18px",
								borderRadius: "999px",
								backgroundColor: palette.onPrimaryHairline,
							}}
						/>
						<Link
							href={linkUrl}
							style={{
								color: palette.onPrimaryStrong,
								fontSize: "12px",
								fontWeight: 700,
								letterSpacing: "0.04em",
								textDecoration: "none",
							}}
						>
							{linkUrl.replace(/^https?:\/\//, "")}
						</Link>
					</Section>
				</Container>

				<Text
					style={{
						color: rgba(palette.primaryDeep, 0.5),
						fontSize: "11px",
						lineHeight: 1.5,
						margin: "18px auto 0",
						maxWidth: "600px",
						textAlign: "center" as const,
					}}
				>
					Você está recebendo esta mensagem porque é cliente de {organization.name}.
				</Text>
			</Body>
		</Html>
	);
}

const coverImage = {
	width: "100%",
	maxWidth: "600px",
	height: "auto",
	display: "block",
};
