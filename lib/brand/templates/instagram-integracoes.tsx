import React from "react";
import { type TIntegrationLogoKey, loadBrandLogo, loadIntegrationLogo } from "../assets";
import { BRAND_COLORS } from "../tokens";
import type { TBrandTemplate } from "./types";

const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 88;

// Posts individuais (não carrossel), um por integração divulgada.
const VARIANTS = ["bling", "cardapio-web", "nuvem-shop", "online-software"] as const;
type TVariant = (typeof VARIANTS)[number];

// Mesmo drench de azul profundo do instagram-carteiras / meeting-background dark.
const BACKGROUND = "linear-gradient(160deg, #1c3f73 0%, #102849 55%, #081328 100%)";
const GLOW = "radial-gradient(circle at 80% 12%, rgba(36, 84, 156, 0.5) 0%, rgba(36, 84, 156, 0) 55%)";

const WHITE_SOFT = "rgba(255, 255, 255, 0.82)";
const WHITE_FAINT = "rgba(255, 255, 255, 0.55)";

type TVariantConfig = {
	logoKey: TIntegrationLogoKey;
	category: string;
	headline: string;
	subline: string;
	// Altura alvo do logo do parceiro dentro do tile branco — ajustada por logo
	// para equalizar o peso visual entre marcas com proporções muito diferentes.
	logoHeight: number;
};

const VARIANT_CONFIG: Record<TVariant, TVariantConfig> = {
	bling: {
		logoKey: "bling",
		category: "INTEGRAÇÃO · ERP",
		headline: "Cada venda no Bling agora trabalha pela próxima.",
		subline: "Pedidos, clientes e produtos sincronizados sozinhos — cashback, segmentação e WhatsApp no automático.",
		logoHeight: 108,
	},
	"cardapio-web": {
		logoKey: "cardapio-web",
		category: "INTEGRAÇÃO · DELIVERY E PDV",
		headline: "Quem pediu hoje volta a pedir amanhã.",
		subline: "Cada pedido do Cardápio Web vira cliente na sua base — com cashback e WhatsApp puxando o próximo pedido.",
		logoHeight: 168,
	},
	"nuvem-shop": {
		logoKey: "nuvem-shop",
		category: "INTEGRAÇÃO · E-COMMERCE",
		headline: "Venda de novo pra quem já comprou.",
		subline: "Pedidos da Nuvem Shop viram cashback, segmentação RFM e campanhas de WhatsApp — recompra no piloto automático.",
		logoHeight: 168,
	},
	"online-software": {
		logoKey: "online-software",
		category: "INTEGRAÇÃO · ERP",
		headline: "A venda do balcão não termina no balcão.",
		subline: "As vendas do seu Online Software viram base de clientes — com cashback e campanhas que trazem cada um de volta.",
		logoHeight: 168,
	},
};

// Geometria das 5 barras do ícone (mesma extração do meeting-background),
// usada como marca d'água no canto direito.
const ICON_BAR_HEIGHTS = [0.4286, 1, 0.5714, 1, 0.4286] as const;
const ICON_BAR_WIDTH_RATIO = 0.2857;
const ICON_BAR_GAP_RATIO = 0.0571;

function IconBarsWatermark({ height, color, opacity }: { height: number; color: string; opacity: number }) {
	const barWidth = height * ICON_BAR_WIDTH_RATIO;
	const gap = height * ICON_BAR_GAP_RATIO;

	return (
		<div style={{ display: "flex", alignItems: "center", gap, opacity }}>
			{ICON_BAR_HEIGHTS.map((ratio, index) => (
				<div
					key={index}
					style={{
						width: barWidth,
						height: height * ratio,
						borderRadius: barWidth / 2,
						backgroundColor: color,
					}}
				/>
			))}
		</div>
	);
}

// Os dois tiles do lockup (parceiro e Recompra) têm exatamente o mesmo
// tamanho; os logos são escalados para caber na área útil interna.
const TILE_WIDTH = 380;
const TILE_HEIGHT = 264;
const TILE_RADIUS = 40;
const TILE_PADDING = 48;
const TILE_CONTENT_WIDTH = TILE_WIDTH - TILE_PADDING * 2;

function LogoTile({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: TILE_WIDTH,
				height: TILE_HEIGHT,
				borderRadius: TILE_RADIUS,
				backgroundColor: "#ffffff",
			}}
		>
			{children}
		</div>
	);
}

// Escala um logo para a altura alvo, limitado à largura útil do tile.
function fitLogo(intrinsic: { width: number; height: number }, targetHeight: number) {
	const ratio = intrinsic.width / intrinsic.height;
	let height = targetHeight;
	let width = Math.round(height * ratio);
	if (width > TILE_CONTENT_WIDTH) {
		width = TILE_CONTENT_WIDTH;
		height = Math.round(width / ratio);
	}
	return { width, height };
}

async function renderIntegracao(variant: TVariant) {
	const config = VARIANT_CONFIG[variant];
	const [partnerLogo, brandBadgeLogo, brandLogo] = await Promise.all([
		loadIntegrationLogo(config.logoKey),
		loadBrandLogo("horizontalBadgeColorOnLight"),
		loadBrandLogo("horizontalColorOnDark"),
	]);

	const partnerLogoSize = fitLogo(partnerLogo, config.logoHeight);
	// O logo horizontal com badge é largo: o limitador efetivo é a largura do tile.
	const brandBadgeLogoSize = fitLogo(brandBadgeLogo, TILE_HEIGHT);
	const brandLogoWidth = 300;
	const brandLogoHeight = Math.round(brandLogoWidth * (brandLogo.height / brandLogo.width));

	return (
		<div
			style={{
				display: "flex",
				position: "relative",
				width: WIDTH,
				height: HEIGHT,
				backgroundImage: BACKGROUND,
				overflow: "hidden",
				fontFamily: "Outfit",
			}}
		>
			<div
				style={{
					display: "flex",
					position: "absolute",
					top: 0,
					left: 0,
					width: WIDTH,
					height: HEIGHT,
					backgroundImage: GLOW,
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					right: -140,
					top: 0,
					height: HEIGHT,
					alignItems: "center",
				}}
			>
				<IconBarsWatermark height={640} color={BRAND_COLORS.white} opacity={0.05} />
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					position: "absolute",
					left: MARGIN,
					right: MARGIN,
					top: 0,
					height: HEIGHT,
					alignItems: "center",
					justifyContent: "center",
					gap: 56,
					paddingBottom: 88,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						paddingLeft: 30,
						paddingRight: 30,
						paddingTop: 14,
						paddingBottom: 14,
						borderRadius: 999,
						backgroundColor: BRAND_COLORS.amber,
						color: BRAND_COLORS.black,
						fontSize: 25,
						fontWeight: 700,
						letterSpacing: 3,
					}}
				>
					{config.category}
				</div>

				<div style={{ display: "flex", alignItems: "center", gap: 36 }}>
					<LogoTile>
						<img src={partnerLogo.dataUrl} width={partnerLogoSize.width} height={partnerLogoSize.height} alt="" />
					</LogoTile>
					<div style={{ fontSize: 76, fontWeight: 400, color: WHITE_FAINT }}>+</div>
					<LogoTile>
						<img src={brandBadgeLogo.dataUrl} width={brandBadgeLogoSize.width} height={brandBadgeLogoSize.height} alt="" />
					</LogoTile>
				</div>

				<div
					style={{
						fontSize: 72,
						fontWeight: 700,
						lineHeight: 1.1,
						letterSpacing: -1.4,
						color: BRAND_COLORS.white,
						textAlign: "center",
						maxWidth: 880,
					}}
				>
					{config.headline}
				</div>

				<div
					style={{
						fontSize: 32,
						fontWeight: 400,
						lineHeight: 1.5,
						color: WHITE_SOFT,
						textAlign: "center",
						maxWidth: 800,
					}}
				>
					{config.subline}
				</div>

				<div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 2, color: WHITE_FAINT }}>AGENDE UMA DEMO · LINK NA BIO</div>
			</div>

			<div
				style={{
					display: "flex",
					position: "absolute",
					left: 0,
					right: 0,
					bottom: MARGIN - 16,
					justifyContent: "center",
				}}
			>
				<img src={brandLogo.dataUrl} width={brandLogoWidth} height={brandLogoHeight} alt="" />
			</div>
		</div>
	);
}

async function renderInstagramIntegracoes(variant: string) {
	if (!VARIANTS.includes(variant as TVariant)) {
		throw new Error(`Variante desconhecida para instagram-integracoes: ${variant}`);
	}
	return renderIntegracao(variant as TVariant);
}

export const instagramIntegracoesTemplate: TBrandTemplate = {
	description:
		"Posts individuais de Instagram (1080x1350) divulgando as integrações (Bling, Cardápio Web, Nuvem Shop, Online Software): lockup do parceiro + Recompra, headline curta e CTA. Um asset por variante, não é carrossel.",
	width: WIDTH,
	height: HEIGHT,
	variants: VARIANTS,
	render: renderInstagramIntegracoes,
};
