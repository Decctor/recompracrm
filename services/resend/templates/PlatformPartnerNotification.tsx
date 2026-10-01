import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

export type PlatformPartnerNotificationTemplateProps = {
	/** Assunto do email; também vira o preview. */
	subject: string;
	heading: string;
	partnerFirstName: string;
	paragraphs: string[];
	/** Destaque opcional (ex.: valor do PIX), no cartão azul do programa. */
	highlight?: { label: string; value: string; note?: string | null } | null;
	/** Bloco de alerta opcional (ex.: motivo da rejeição). */
	callout?: { label: string; text: string } | null;
	cta: { label: string; href: string };
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "";

/** Email do programa de parcerias: aprovação, rejeição, nova comissão, PIX pago, alteração de dados. */
export default function PlatformPartnerNotificationTemplate({
	subject,
	heading,
	partnerFirstName,
	paragraphs,
	highlight,
	callout,
	cta,
}: PlatformPartnerNotificationTemplateProps) {
	return (
		<Html>
			<Head />
			<Preview>{subject}</Preview>
			<Body style={main}>
				<Container style={container}>
					<Section style={header}>
						<Img src={`${baseUrl}/logo.png`} width="150" height="auto" alt="RecompraCRM" style={logo} />
						<Text style={eyebrow}>PROGRAMA DE PARCERIAS</Text>
					</Section>

					<Section style={content}>
						<Heading style={h1}>{heading}</Heading>
						<Text style={text}>Olá, {partnerFirstName}!</Text>
						{paragraphs.map((paragraph) => (
							<Text key={paragraph} style={text}>
								{paragraph}
							</Text>
						))}

						{highlight ? (
							<Section style={card}>
								<Text style={cardLabel}>{highlight.label}</Text>
								<Text style={cardValue}>{highlight.value}</Text>
								{highlight.note ? <Text style={cardNote}>{highlight.note}</Text> : null}
							</Section>
						) : null}

						{callout ? (
							<Section style={calloutBox}>
								<Text style={calloutLabel}>{callout.label}</Text>
								<Text style={calloutText}>{callout.text}</Text>
							</Section>
						) : null}

						<Section style={buttonContainer}>
							<Button style={button} href={cta.href}>
								{cta.label}
							</Button>
						</Section>
					</Section>

					<Hr style={hr} />

					<Section style={footer}>
						<Text style={footerCopyright}>
							Você recebe este email por participar do programa de parcerias do RecompraCRM.
							<br />
							<Link href={baseUrl} style={link}>
								{baseUrl.replace(/^https?:\/\//, "")}
							</Link>
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

const main = { backgroundColor: "#f5f5f5", fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif' };
const container = { backgroundColor: "#ffffff", margin: "0 auto", padding: "40px 20px", marginBottom: "64px", borderRadius: "22px" };
const header = { padding: "12px 0 0", textAlign: "center" as const };
const logo = { margin: "0 auto", display: "block" };
const eyebrow = { color: "#24549c", fontSize: "11px", fontWeight: "800", letterSpacing: "0.12em", margin: "16px 0 0" };
const content = { padding: "0 20px" };
const h1 = { color: "#171717", fontSize: "24px", fontWeight: "800", lineHeight: "30px", margin: "24px 0", textAlign: "center" as const };
const text = { color: "#4a4a4a", fontSize: "16px", lineHeight: "26px", textAlign: "center" as const, margin: "12px 0" };
const card = { backgroundColor: "#1a3d7a", borderRadius: "18px", padding: "20px", margin: "24px 0", textAlign: "center" as const };
const cardLabel = { color: "rgba(255,255,255,0.72)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", margin: "0" };
const cardValue = { color: "#ffffff", fontSize: "32px", fontWeight: "800", lineHeight: "40px", margin: "6px 0 0" };
const cardNote = { color: "#ffb900", fontSize: "13px", fontWeight: "700", margin: "8px 0 0" };
const calloutBox = { backgroundColor: "#fdecec", borderRadius: "14px", padding: "14px 16px", margin: "20px 0" };
const calloutLabel = { color: "#b42318", fontSize: "11px", fontWeight: "800", letterSpacing: "0.08em", margin: "0" };
const calloutText = { color: "#b42318", fontSize: "14px", lineHeight: "22px", margin: "4px 0 0" };
const buttonContainer = { textAlign: "center" as const, margin: "28px 0 8px" };
const button = {
	backgroundColor: "#24549c",
	borderRadius: "18px",
	color: "#fff",
	fontSize: "15px",
	fontWeight: "700",
	textDecoration: "none",
	textAlign: "center" as const,
	display: "inline-block",
	padding: "13px 28px",
};
const hr = { borderColor: "#e5e5e5", margin: "24px 0" };
const footer = { textAlign: "center" as const };
const footerCopyright = { color: "#8898aa", fontSize: "12px", lineHeight: "20px" };
const link = { color: "#24549c", textDecoration: "underline" };
