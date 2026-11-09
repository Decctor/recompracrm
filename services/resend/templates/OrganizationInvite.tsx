import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

type OrganizationInviteTemplateProps = {
	inviteLink: string;
	invitedName: string;
	inviterName?: string | null;
	inviterEmail?: string | null;
	organizationName?: string | null;
	organizationLogoUrl?: string | null;
	expiresInHours: number;
};

/**
 * Origem fixa de produção: imagens e links do rodapé precisam ser absolutos e
 * apontar para o mesmo domínio do remetente. Ler de env aqui já gerou URL
 * relativa (imagem quebrada) quando a variável não estava definida.
 */
const EMAIL_ASSETS_ORIGIN = "https://recompracrm.com.br";
// PNG porque cliente de e-mail não renderiza SVG de forma confiável. Lockup *-badge
// porque o fundo é claro: o `color-on-dark` some aqui (ver BrandLogo).
const BRAND_LOGO_URL = `${EMAIL_ASSETS_ORIGIN}/email/recompracrm-horizontal-badge.png`;
const BRAND_LOGO_WIDTH = 176;
const BRAND_LOGO_HEIGHT = 35;

function formatHours(hours: number) {
	return hours === 1 ? "1 hora" : `${hours} horas`;
}

function getFirstName(name: string) {
	return name.trim().split(/\s+/)[0] ?? name;
}

export function buildOrganizationInviteSubject({
	inviterName,
	organizationName,
}: Pick<OrganizationInviteTemplateProps, "inviterName" | "organizationName">) {
	const organizationLabel = organizationName?.trim() || "uma equipe";
	const inviter = inviterName?.trim();
	if (inviter) return `${inviter} convidou você para ${organizationLabel} no RecompraCRM`;
	return `Convite para ${organizationLabel} no RecompraCRM`;
}

export default function OrganizationInviteTemplate({
	inviteLink,
	invitedName,
	inviterName,
	inviterEmail,
	organizationName,
	organizationLogoUrl,
	expiresInHours,
}: OrganizationInviteTemplateProps) {
	const organization = organizationName?.trim() || "sua equipe";
	const inviter = inviterName?.trim() || null;
	const expiresLabel = formatHours(expiresInHours);
	const organizationInitial = organization.charAt(0).toUpperCase();

	return (
		<Html lang="pt-BR">
			<Head>
				<meta name="color-scheme" content="light" />
				<meta name="supported-color-schemes" content="light" />
			</Head>
			<Preview>
				{inviter ? `${inviter} convidou você para ${organization}.` : `Você recebeu um convite para ${organization}.`} O convite vale por {expiresLabel}.
			</Preview>
			<Body style={main}>
				<Container style={container}>
					<Section style={brandRow}>
						<Img src={BRAND_LOGO_URL} width={BRAND_LOGO_WIDTH} height={BRAND_LOGO_HEIGHT} alt="RecompraCRM" style={brandLogo} />
					</Section>

					<Section style={card}>
						<Section style={organizationRow}>
							{organizationLogoUrl ? (
								<Img src={organizationLogoUrl} width="56" height="56" alt={organization} style={organizationLogo} />
							) : (
								<div style={organizationFallback}>{organizationInitial}</div>
							)}
						</Section>

						<Text style={eyebrow}>Convite para a equipe</Text>
						<Heading as="h1" style={h1}>
							{organization}
						</Heading>

						<Text style={text}>Olá, {getFirstName(invitedName)}.</Text>
						<Text style={text}>
							{inviter ? (
								<>
									<strong style={strong}>{inviter}</strong> convidou você para acessar <strong style={strong}>{organization}</strong> no RecompraCRM.
								</>
							) : (
								<>
									Você recebeu um convite para acessar <strong style={strong}>{organization}</strong> no RecompraCRM.
								</>
							)}{" "}
							Aceite o convite para entrar no painel da equipe com este e-mail.
						</Text>

						<Section style={buttonRow}>
							<Button style={button} href={inviteLink}>
								Aceitar convite
							</Button>
						</Section>

						<Text style={expiry}>O convite vale por {expiresLabel}. Depois disso, peça um novo a quem convidou você.</Text>

						<Hr style={divider} />

						<Text style={fallbackLabel}>Se o botão não funcionar, copie e cole este endereço no navegador:</Text>
						<Link href={inviteLink} style={fallbackLink}>
							{inviteLink}
						</Link>
					</Section>

					<Section style={footer}>
						<Text style={footerText}>
							{inviter ? (
								<>
									Você recebeu este e-mail porque {inviter}
									{inviterEmail ? ` (${inviterEmail})` : ""} convidou este endereço para {organization}. Para tirar dúvidas, basta responder a este e-mail.
								</>
							) : (
								<>Você recebeu este e-mail porque este endereço foi convidado para {organization}.</>
							)}{" "}
							Se não reconhece o convite, ignore esta mensagem: nenhum acesso é criado sem o seu aceite.
						</Text>
						<Text style={footerBrand}>
							RecompraCRM ·{" "}
							<Link href={EMAIL_ASSETS_ORIGIN} style={footerLink}>
								recompracrm.com.br
							</Link>
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

const BRAND_BLUE = "#24549C";
const INK = "#111827";
const BODY_TEXT = "#374151";
const MUTED = "#6b7280";
const HAIRLINE = "#e5e7eb";

const main: React.CSSProperties = {
	backgroundColor: "#f3f5f9",
	fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
	margin: 0,
	padding: "32px 0",
};

const container: React.CSSProperties = {
	maxWidth: "520px",
	margin: "0 auto",
	padding: "0 16px",
};

const brandRow: React.CSSProperties = {
	padding: "0 4px 20px",
};

const brandLogo: React.CSSProperties = {
	display: "block",
};

const card: React.CSSProperties = {
	backgroundColor: "#ffffff",
	border: `1px solid ${HAIRLINE}`,
	borderRadius: "12px",
	padding: "32px",
};

const organizationRow: React.CSSProperties = {
	marginBottom: "20px",
};

const organizationLogo: React.CSSProperties = {
	display: "block",
	borderRadius: "12px",
	border: `1px solid ${HAIRLINE}`,
	objectFit: "cover",
};

const organizationFallback: React.CSSProperties = {
	width: "56px",
	height: "56px",
	lineHeight: "56px",
	borderRadius: "12px",
	backgroundColor: BRAND_BLUE,
	color: "#ffffff",
	fontSize: "24px",
	fontWeight: 700,
	textAlign: "center",
};

const eyebrow: React.CSSProperties = {
	color: MUTED,
	fontSize: "12px",
	fontWeight: 600,
	letterSpacing: "0.06em",
	textTransform: "uppercase",
	lineHeight: "16px",
	margin: "0 0 6px",
};

const h1: React.CSSProperties = {
	color: INK,
	fontSize: "24px",
	fontWeight: 700,
	lineHeight: "30px",
	margin: "0 0 24px",
};

const text: React.CSSProperties = {
	color: BODY_TEXT,
	fontSize: "15px",
	lineHeight: "24px",
	margin: "0 0 14px",
};

const strong: React.CSSProperties = {
	color: INK,
	fontWeight: 600,
};

const buttonRow: React.CSSProperties = {
	margin: "26px 0 18px",
};

const button: React.CSSProperties = {
	backgroundColor: BRAND_BLUE,
	borderRadius: "8px",
	color: "#ffffff",
	fontSize: "15px",
	fontWeight: 600,
	textDecoration: "none",
	display: "inline-block",
	padding: "13px 28px",
};

const expiry: React.CSSProperties = {
	color: MUTED,
	fontSize: "13px",
	lineHeight: "20px",
	margin: 0,
};

const divider: React.CSSProperties = {
	borderColor: HAIRLINE,
	margin: "24px 0 16px",
};

const fallbackLabel: React.CSSProperties = {
	color: MUTED,
	fontSize: "12px",
	lineHeight: "18px",
	margin: "0 0 4px",
};

const fallbackLink: React.CSSProperties = {
	color: BRAND_BLUE,
	fontSize: "12px",
	lineHeight: "18px",
	wordBreak: "break-all",
	textDecoration: "underline",
};

const footer: React.CSSProperties = {
	padding: "20px 4px 0",
};

const footerText: React.CSSProperties = {
	color: MUTED,
	fontSize: "12px",
	lineHeight: "18px",
	margin: "0 0 10px",
};

const footerBrand: React.CSSProperties = {
	color: MUTED,
	fontSize: "12px",
	lineHeight: "18px",
	margin: 0,
};

const footerLink: React.CSSProperties = {
	color: MUTED,
	textDecoration: "underline",
};
