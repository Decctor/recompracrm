import { Package } from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { TVisualKitFormatEnum } from "@/schemas/enums";
import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { VISUAL_KIT_FORMATS } from "../formats";
import type { TVisualKitBrand, TVisualKitPage, TVisualKitPieceItem, TVisualKitPieceProps } from "../types";

export type TVisualKitPageSize = { largura: number; altura: number };

export type TVisualKitPieceRenderer = {
	/** Pura. Nunca devolve lista vazia: sem itens, devolve uma página vazia para o estado vazio. */
	paginate: (props: TVisualKitPieceProps) => TVisualKitPage[];
	/** Tamanho real da página em px CSS. */
	pageSize: (props: TVisualKitPieceProps, page: TVisualKitPage) => TVisualKitPageSize;
	/** Renderiza a página no tamanho real, sem depender do contexto (para exportar como imagem). */
	Page: (args: { props: TVisualKitPieceProps; page: TVisualKitPage }) => ReactElement;
};

export type TVisualKitPageArgs = { props: TVisualKitPieceProps; page: TVisualKitPage };

// ---------------------------------------------------------------------------------------------------
// Constantes visuais
// ---------------------------------------------------------------------------------------------------

export const FONT_FAMILY = "var(--font-outfit), Outfit, system-ui, sans-serif";
export const INK = "#111111";
export const MUTED_INK = "#6b6b6b";
export const PAPER = "#ffffff";
export const CUT_LINE_COLOR = "#c4c4c4";
export const CUT_LINE = `1px dashed ${CUT_LINE_COLOR}`;
// Preços: Outfit pesada e apertada no lugar da Archivo condensada do protótipo.
export const PRICE_LETTER_SPACING = "-0.03em";

export function clampLines(lines: number): CSSProperties {
	return { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" };
}

export function hexToRgba(hex: string, alpha: number) {
	const value = Number.parseInt(hex.replace("#", ""), 16);
	return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function relativeLuminance(hex: string) {
	const value = Number.parseInt(hex.replace("#", ""), 16);
	const channel = (shift: number) => {
		const c = ((value >> shift) & 255) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

export function contrastRatio(a: string, b: string) {
	const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

// A marca garante contraste só entre cada cor e o próprio foreground. Cor da marca usada como texto
// sobre outro fundo precisa ser conferida, senão uma primária clara some no papel branco.
const MIN_ACCENT_CONTRAST = 3;

/** `preferred` sobre `background` quando lê; senão `fallback`. */
export function readableOn(background: string, preferred: string, fallback: string) {
	return contrastRatio(background, preferred) >= MIN_ACCENT_CONTRAST ? preferred : fallback;
}

/** Cor de destaque da marca para texto sobre papel branco (primária, secundária ou tinta). */
export function accentOnPaper(marca: TVisualKitBrand) {
	return readableOn(PAPER, marca.corPrimaria, readableOn(PAPER, marca.corSecundaria, INK));
}

// ---------------------------------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------------------------------

const MONEY_FORMAT = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Mesmo fuso da operação (lib/operation-timezone.ts), sem importar o módulo de SQL no cliente.
const VALIDITY_FORMAT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** "R$ 1.299,90" */
export function formatMoney(value: number) {
	return `R$ ${MONEY_FORMAT.format(value)}`;
}

/** Partes do preço para o centavo elevado: { inteiro: "1.299", centavos: ",90" }. */
export function splitMoney(value: number) {
	const formatted = MONEY_FORMAT.format(value);
	const comma = formatted.lastIndexOf(",");
	return { inteiro: formatted.slice(0, comma), centavos: formatted.slice(comma) };
}

/** "dd/mm" da validade, ou nulo quando o kit não tem validade. */
export function formatValidity(validadeFim: TVisualKitPieceProps["validadeFim"]) {
	if (!validadeFim) return null;
	const date = validadeFim instanceof Date ? validadeFim : new Date(validadeFim);
	if (Number.isNaN(date.getTime())) return null;
	return VALIDITY_FORMAT.format(date);
}

/** "Ofertas válidas até 12/10 ou enquanto durarem os estoques." */
export function offersDisclaimer(validade: string | null, suffix = "") {
	const base = validade ? `Ofertas válidas até ${validade} ou enquanto durarem os estoques.` : "Ofertas válidas enquanto durarem os estoques.";
	return suffix ? `${base} ${suffix}` : base;
}

export function joinDefined(parts: (string | null | undefined | false)[], separator = " · ") {
	return parts.filter(Boolean).join(separator);
}

// ---------------------------------------------------------------------------------------------------
// Regras de exibição
// ---------------------------------------------------------------------------------------------------

export type TItemDisplay = {
	precoDe: number | null; // "de R$ X por", só quando a opção está ligada
	percentual: number | null; // "-15%", só quando a opção está ligada e há desconto
	precoUnidade: { valor: string; rotulo: string } | null;
};

export function resolveItemDisplay(item: TVisualKitPieceItem, opcoes: TVisualKitConfig): TItemDisplay {
	const { emPromocao, precoDe, percentualDesconto } = item.promocao;
	return {
		precoDe: emPromocao && opcoes.mostrarPrecoDe && precoDe != null ? precoDe : null,
		percentual: emPromocao && opcoes.mostrarPercentual && percentualDesconto != null && percentualDesconto > 0 ? percentualDesconto : null,
		precoUnidade:
			opcoes.mostrarPrecoUnidade && item.precoUnidade ? { valor: formatMoney(item.precoUnidade.valor), rotulo: item.precoUnidade.rotulo } : null,
	};
}

export function barcodeFor(item: TVisualKitPieceItem, opcoes: TVisualKitConfig) {
	return opcoes.mostrarCodigoBarras ? item.codigoBarras : null;
}

/**
 * Fator de redução do preço pelo tamanho da parte inteira. O layout é desenhado para dois dígitos
 * ("19"); "129" e "1.299" encolhem para caber na mesma largura (Outfit não tem variante condensada).
 */
export function priceFitFactor(value: number) {
	const length = splitMoney(value).inteiro.length;
	return Math.min(1, 2.26 / (1.06 + 0.6 * length));
}

/** Reduz o título conforme o tamanho: até `comfortableChars` fica no tamanho base. */
export function fitTitleSize(text: string, base: number, comfortableChars: number) {
	const length = Math.max(1, text.trim().length);
	return base * Math.min(1, Math.max(0.4, (comfortableChars / length) ** 0.75));
}

// ---------------------------------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------------------------------

export function chunk<T>(list: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
	return chunks;
}

/** Folhas A4 com `perSheet` itens cada ("Folha 1 de 2"). */
export function paginateSheets(items: TVisualKitPieceItem[], perSheet: number, label = "Folha"): TVisualKitPage[] {
	const sheets = items.length ? chunk(items, perSheet) : [[]];
	return sheets.map((itens, indice) => ({ indice, tipo: "FOLHA", itens, rotulo: `${label} ${indice + 1} de ${sheets.length}` }));
}

/** Uma página por item (selo, post, story). */
export function paginatePerItem(items: TVisualKitPieceItem[]): TVisualKitPage[] {
	if (!items.length) return [{ indice: 0, tipo: "PRODUTO", itens: [], rotulo: "Sem produtos" }];
	return items.map((item, indice) => ({ indice, tipo: "PRODUTO", itens: [item], rotulo: item.nome }));
}

// ---------------------------------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------------------------------

type TPageFrameProps = {
	size: TVisualKitPageSize;
	background: string;
	color?: string;
	style?: CSSProperties;
	children: ReactNode;
};

/** Raiz de toda página: tamanho exato, fundo explícito, fonte e cor definidas (não herda do app). */
export function PageFrame({ size, background, color = INK, style, children }: TPageFrameProps) {
	return (
		<div
			data-visual-kit-page=""
			style={{
				position: "relative",
				width: size.largura,
				height: size.altura,
				overflow: "hidden",
				boxSizing: "border-box",
				background,
				color,
				fontFamily: FONT_FAMILY,
				fontSize: 16,
				lineHeight: 1.2,
				fontVariantNumeric: "lining-nums",
				WebkitFontSmoothing: "antialiased",
				textAlign: "left",
				...style,
			}}
		>
			{children}
		</div>
	);
}

type TPriceValueProps = {
	value: number;
	/** Tamanho da parte inteira em px (antes do ajuste pelo número de dígitos). */
	size: number;
	style?: CSSProperties;
};

/** Preço com "R$" e centavos elevados: R$ 19,90 → ʀ$ 19 ,90. */
export function PriceValue({ value, size, style }: TPriceValueProps) {
	const { inteiro, centavos } = splitMoney(value);
	const s = size * priceFitFactor(value);
	return (
		<div style={{ display: "flex", alignItems: "flex-start", lineHeight: 0.8, fontWeight: 800, whiteSpace: "nowrap", ...style }}>
			<span style={{ fontSize: s * 0.27, fontWeight: 700, marginTop: s * 0.07, marginRight: s * 0.06 }}>R$</span>
			<span style={{ fontSize: s, fontWeight: 900, letterSpacing: PRICE_LETTER_SPACING }}>{inteiro}</span>
			<span style={{ fontSize: s * 0.4, fontWeight: 800, letterSpacing: "-0.02em", marginTop: s * 0.06, marginLeft: s * 0.03 }}>{centavos}</span>
		</div>
	);
}

/** Preço numa linha só ("R$ 19,90"), para selos e listas. */
export function FlatPrice({ value, size, style }: TPriceValueProps) {
	const s = size * Math.max(0.7, priceFitFactor(value));
	return (
		<span style={{ fontSize: s, fontWeight: 800, letterSpacing: PRICE_LETTER_SPACING, lineHeight: 1, whiteSpace: "nowrap", ...style }}>
			{formatMoney(value)}
		</span>
	);
}

/** "de ~~R$ 24,90~~ por" */
export function FromPrice({ value, withPor = true, style }: { value: number; withPor?: boolean; style?: CSSProperties }) {
	return (
		<span style={{ whiteSpace: "nowrap", ...style }}>
			de <s>{formatMoney(value)}</s>
			{withPor ? " por" : null}
		</span>
	);
}

export function discountLabel(percentual: number) {
	return `-${percentual}%`;
}

type TProductImageProps = {
	item: TVisualKitPieceItem;
	marca: TVisualKitBrand;
	fit?: "contain" | "cover";
	radius?: number;
	/** Fundo atrás da foto (fotos com fundo transparente). */
	background?: string;
	padding?: number;
	style?: CSSProperties;
};

/** Foto do produto ou, sem foto, um bloco neutro com o tom da marca e um ícone de embalagem. */
export function ProductImage({ item, marca, fit = "contain", radius = 0, background = PAPER, padding = 0, style }: TProductImageProps) {
	const box: CSSProperties = { position: "relative", overflow: "hidden", borderRadius: radius, boxSizing: "border-box", ...style };
	if (!item.imagemUrl) {
		return (
			<div style={{ ...box, background: PAPER }}>
				<div
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: hexToRgba(accentOnPaper(marca), 0.08),
						color: hexToRgba(accentOnPaper(marca), 0.45),
					}}
				>
					<Package strokeWidth={1.25} style={{ width: "38%", height: "38%", maxWidth: 260, maxHeight: 260 }} />
				</div>
			</div>
		);
	}
	return (
		<div style={{ ...box, background, padding }}>
			<img
				src={item.imagemUrl}
				alt={item.nome}
				crossOrigin="anonymous"
				draggable={false}
				style={{ display: "block", width: "100%", height: "100%", objectFit: fit }}
			/>
		</div>
	);
}

/** Nome da organização como marca nominativa (quando não há logo). */
export function Wordmark({ marca, size, style }: { marca: TVisualKitBrand; size: number; style?: CSSProperties }) {
	return (
		<span
			style={{
				display: "block",
				fontSize: size,
				fontWeight: 900,
				lineHeight: 1,
				letterSpacing: "-0.02em",
				textTransform: "uppercase",
				whiteSpace: "nowrap",
				...style,
			}}
		>
			{marca.nome}
		</span>
	);
}

export function LogoImage({ src, alt, size, radius, style }: { src: string; alt: string; size: number; radius: number; style?: CSSProperties }) {
	return (
		<img
			src={src}
			alt={alt}
			crossOrigin="anonymous"
			draggable={false}
			style={{ display: "block", width: size, height: size, flexShrink: 0, borderRadius: radius, objectFit: "cover", ...style }}
		/>
	);
}

/** Nome da organização em caixa alta espaçada, acima da chamada (marca nominativa quando não há logo). */
export function Eyebrow({ marca, size }: { marca: TVisualKitBrand; size: number }) {
	const hasLogo = marca.logoUrl != null;
	return (
		<span
			style={{
				fontSize: hasLogo ? size : size * 1.3,
				fontWeight: hasLogo ? 700 : 900,
				letterSpacing: hasLogo ? "0.22em" : "0.08em",
				textTransform: "uppercase",
				opacity: hasLogo ? 0.8 : 1,
				whiteSpace: "nowrap",
				overflow: "hidden",
				textOverflow: "ellipsis",
			}}
		>
			{marca.nome}
		</span>
	);
}

type TBrandLogoProps = {
	marca: TVisualKitBrand;
	size: number;
	radius: number;
	/** Tamanho do nome da organização quando não há logo. */
	wordmarkSize: number;
};

/** Logo da organização ou, sem logo, o nome como marca nominativa. */
export function BrandLogo({ marca, size, radius, wordmarkSize }: TBrandLogoProps) {
	if (!marca.logoUrl) return <Wordmark marca={marca} size={wordmarkSize} />;
	return <LogoImage src={marca.logoUrl} alt={marca.nome} size={size} radius={radius} />;
}

/** Selo "Até 12/10" dos cabeçalhos (encarte, lista). */
export function ValidityBadge({ marca, validade, scale }: { marca: TVisualKitBrand; validade: string; scale: number }) {
	return (
		<div
			style={{
				flexShrink: 0,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 2 * scale,
				background: marca.corSecundaria,
				color: marca.corSecundariaForeground,
				borderRadius: 6 * scale,
				padding: `${5 * scale}px ${8 * scale}px`,
				lineHeight: 1,
			}}
		>
			<span style={{ fontSize: 6 * scale, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Até</span>
			<span style={{ fontSize: 15 * scale, fontWeight: 800, letterSpacing: "-0.02em" }}>{validade}</span>
		</div>
	);
}

/** Rodapé das folhas de impressão: "Org · Formato · tamanho · Folha x de y" + dica de corte. */
export function SheetFooter({
	marca,
	formato,
	page,
	hint,
}: {
	marca: TVisualKitBrand;
	formato: TVisualKitFormatEnum;
	page: TVisualKitPage;
	hint: string;
}) {
	const spec = VISUAL_KIT_FORMATS[formato];
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				display: "flex",
				justifyContent: "space-between",
				gap: 16,
				padding: "0 24px 14px 24px",
				fontSize: 10.5,
				letterSpacing: "0.04em",
				color: "#9a9a9a",
			}}
		>
			<span>{joinDefined([marca.nome, spec.nome, spec.tamanho, page.rotulo])}</span>
			<span>{hint}</span>
		</div>
	);
}

/** Aviso exibido quando a peça ainda não tem produtos. */
export function EmptyNotice({ color = "#9a9a9a", size = 16 }: { color?: string; size?: number }) {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: size * 0.6,
				color,
				fontSize: size,
				fontWeight: 500,
				textAlign: "center",
			}}
		>
			<Package strokeWidth={1.5} style={{ width: size * 2.5, height: size * 2.5 }} />
			<span>Nenhum produto selecionado</span>
		</div>
	);
}
