import { db } from "@/services/drizzle";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Loja Digital";

const DEFAULT_PRIMARY = "#24549C";
const DEFAULT_PRIMARY_FOREGROUND = "#FFFFFF";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return { h: 0, s: 0, l: 0 };

	const r = Number.parseInt(result[1], 16) / 255;
	const g = Number.parseInt(result[2], 16) / 255;
	const b = Number.parseInt(result[3], 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}

	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

async function loadLogoDataUrl(logoUrl: string | null): Promise<string | null> {
	if (!logoUrl) return null;
	try {
		const response = await fetch(logoUrl);
		if (!response.ok) return null;
		const contentTypeHeader = response.headers.get("content-type") ?? "image/png";
		const buffer = Buffer.from(await response.arrayBuffer());
		return `data:${contentTypeHeader};base64,${buffer.toString("base64")}`;
	} catch {
		return null;
	}
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;

	const [organization, outfitRegular, outfitSemiBold, outfitBold] = await Promise.all([
		db.query.organizations.findFirst({
			where: (fields, { eq }) => eq(fields.slug, slug.trim().toLowerCase()),
			columns: { nome: true, logoUrl: true, corPrimaria: true, corPrimariaForeground: true },
		}),
		readFile(join(process.cwd(), "utils/fonts/Outfit-Regular.ttf")),
		readFile(join(process.cwd(), "utils/fonts/Outfit-SemiBold.ttf")),
		readFile(join(process.cwd(), "utils/fonts/Outfit-Bold.ttf")),
	]);

	const nome = organization?.nome ?? "Loja Digital";
	const primary = organization?.corPrimaria || DEFAULT_PRIMARY;
	const primaryForeground = organization?.corPrimariaForeground || DEFAULT_PRIMARY_FOREGROUND;
	const { h, s, l } = hexToHsl(primary);
	const lighter = `hsl(${h}, ${s}%, ${Math.min(l + 22, 88)}%)`;
	const darker = `hsl(${h}, ${s}%, ${Math.max(l - 12, 12)}%)`;

	// The logo URL is arbitrary remote input; never let a slow host hang the OG render.
	const logoDataUrl = await Promise.race([
		loadLogoDataUrl(organization?.logoUrl ?? null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
	]);
	const initial = nome.trim().charAt(0).toUpperCase() || "L";

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "88px",
				background: `linear-gradient(135deg, ${lighter} 0%, ${primary} 55%, ${darker} 100%)`,
				color: primaryForeground,
				fontFamily: "Outfit",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "36px" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: "176px",
						height: "176px",
						borderRadius: "44px",
						background: "rgba(255, 255, 255, 0.96)",
						overflow: "hidden",
						boxShadow: "0 24px 60px rgba(0, 0, 0, 0.22)",
					}}
				>
					{logoDataUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={logoDataUrl} alt={nome} width={176} height={176} style={{ objectFit: "cover", width: "176px", height: "176px" }} />
					) : (
						<span style={{ fontSize: "92px", fontWeight: 700, color: primary }}>{initial}</span>
					)}
				</div>
				<span
					style={{
						fontSize: "26px",
						fontWeight: 600,
						letterSpacing: "8px",
						textTransform: "uppercase",
						opacity: 0.85,
					}}
				>
					Loja Digital
				</span>
			</div>

			<div style={{ display: "flex", flexDirection: "column" }}>
				<span
					style={{
						fontSize: nome.length > 26 ? "76px" : "104px",
						fontWeight: 700,
						lineHeight: 1.04,
						letterSpacing: "-2px",
					}}
				>
					{nome}
				</span>
				<span style={{ fontSize: "38px", fontWeight: 400, opacity: 0.82, marginTop: "20px" }}>Faça seu pedido online</span>
			</div>
		</div>,
		{
			...size,
			fonts: [
				{ name: "Outfit", data: outfitRegular, weight: 400, style: "normal" },
				{ name: "Outfit", data: outfitSemiBold, weight: 600, style: "normal" },
				{ name: "Outfit", data: outfitBold, weight: 700, style: "normal" },
			],
		},
	);
}
