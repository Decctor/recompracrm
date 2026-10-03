import { ArrowRight } from "lucide-react";
import { VISUAL_KIT_FORMATS, visualKitPieceItemCount } from "../formats";
import type { TVisualKitPage, TVisualKitPieceProps } from "../types";
import {
	BrandLogo,
	clampLines,
	discountLabel,
	EmptyNotice,
	formatValidity,
	FromPrice,
	fitTitleSize,
	hexToRgba,
	INK,
	LogoImage,
	MUTED_INK,
	offersDisclaimer,
	PageFrame,
	PAPER,
	PriceValue,
	ProductImage,
	resolveItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
	readableOn,
	accentOnPaper,
} from "./shared";

const PAGE = VISUAL_KIT_FORMATS.CARROSSEL.page;

function paginate(props: TVisualKitPieceProps): TVisualKitPage[] {
	const items = props.items.slice(0, visualKitPieceItemCount("CARROSSEL", props.items.length));
	if (!items.length) return [{ index: 0, kind: "PRODUCT", items: [], label: "Sem produtos" }];
	return [
		{ index: 0, kind: "COVER", items: [], label: "Capa" },
		...items.map((item, index): TVisualKitPage => ({ index: index + 1, kind: "PRODUCT", items: [item], label: item.nome })),
		{ index: items.length + 1, kind: "CLOSING", items: [], label: "Fechamento" },
	];
}

function pageNumber(props: TVisualKitPieceProps, page: TVisualKitPage) {
	const total = visualKitPieceItemCount("CARROSSEL", props.items.length) + 2;
	return `${page.index + 1}/${total}`;
}

const pageNumberStyle = { fontSize: 35, fontWeight: 700, letterSpacing: "0.02em" } as const;

function CoverPage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const validity = formatValidity(props.validadeFim);
	const count = visualKitPieceItemCount("CARROSSEL", props.items.length);
	const countLabel = count === 1 ? "1 oferta" : `${count} ofertas`;
	const ring = hexToRgba(brand.corPrimariaForeground, 0.35);
	return (
		<PageFrame
			size={PAGE}
			background={brand.corPrimaria}
			color={brand.corPrimariaForeground}
			style={{ padding: 90, display: "flex", flexDirection: "column" }}
		>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
				<BrandLogo brand={brand} size={150} radius={35} wordmarkSize={60} />
				<span style={{ ...pageNumberStyle, opacity: 0.7 }}>{pageNumber(props, page)}</span>
			</div>
			<div style={{ flex: 1 }} />
			<span
				style={{
					fontSize: 37.5,
					fontWeight: 700,
					letterSpacing: "0.22em",
					textTransform: "uppercase",
					color: readableOn(brand.corPrimaria, brand.corSecundaria, brand.corPrimariaForeground),
				}}
			>
				{brand.nome}
			</span>
			<span
				style={{
					fontSize: fitTitleSize(props.chamada, 150, 17),
					fontWeight: 800,
					lineHeight: 1,
					letterSpacing: "-0.04em",
					textTransform: "uppercase",
					marginTop: 30,
					...clampLines(4),
				}}
			>
				{props.chamada}
			</span>
			<span style={{ fontSize: 42.5, opacity: 0.8, marginTop: 40 }}>{validity ? `${countLabel} · válidas até ${validity}` : countLabel}</span>
			<div
				style={{
					marginTop: 80,
					paddingTop: 50,
					borderTop: `5px solid ${ring}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					fontSize: 37.5,
					fontWeight: 700,
					letterSpacing: "0.14em",
					textTransform: "uppercase",
				}}
			>
				<span>Arraste para o lado</span>
				<ArrowRight strokeWidth={2.5} style={{ width: 60, height: 60 }} />
			</div>
		</PageFrame>
	);
}

function ProductPage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const item = page.items[0];
	if (!item) {
		return (
			<PageFrame size={PAGE} background={PAPER}>
				<EmptyNotice size={44} />
			</PageFrame>
		);
	}
	const display = resolveItemDisplay(item, props.configuracao);
	return (
		<PageFrame size={PAGE} background={PAPER} color={INK} style={{ padding: 70, display: "flex", flexDirection: "column", gap: 40 }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
				<span
					style={{
						minWidth: 0,
						fontSize: 32.5,
						fontWeight: 700,
						letterSpacing: "0.16em",
						textTransform: "uppercase",
						color: accentOnPaper(brand),
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{item.grupo}
				</span>
				<span style={{ ...pageNumberStyle, color: "#8a8a8a" }}>{pageNumber(props, page)}</span>
			</div>
			<div style={{ position: "relative", flex: 1, minHeight: 0 }}>
				<ProductImage item={item} brand={brand} radius={40} padding={40} style={{ position: "absolute", inset: 0 }} />
				{display.percentualDesconto != null ? (
					<span
						style={{
							position: "absolute",
							left: 40,
							top: 40,
							background: brand.corSecundaria,
							color: brand.corSecundariaForeground,
							fontSize: 55,
							fontWeight: 800,
							letterSpacing: "-0.03em",
							padding: "15px 35px",
							borderRadius: 9999,
						}}
					>
						{discountLabel(display.percentualDesconto)}
					</span>
				) : null}
			</div>
			<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
				<div style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: 15 }}>
					<span style={{ fontSize: 62.5, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em", ...clampLines(2) }}>{item.nome}</span>
					{item.detalhe ? <span style={{ fontSize: 37.5, color: MUTED_INK }}>{item.detalhe}</span> : null}
				</div>
				<div
					style={{
						flexShrink: 0,
						background: brand.corPrimaria,
						color: brand.corPrimariaForeground,
						borderRadius: 40,
						padding: "25px 40px 30px 40px",
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 10,
					}}
				>
					{display.precoDe != null ? <FromPrice value={display.precoDe} withSuffix={false} style={{ fontSize: 32.5, opacity: 0.8 }} /> : null}
					<PriceValue value={item.preco} size={130} />
				</div>
			</div>
		</PageFrame>
	);
}

function ClosingPage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const validity = formatValidity(props.validadeFim);
	return (
		<PageFrame
			size={PAGE}
			background={brand.corSecundaria}
			color={brand.corSecundariaForeground}
			style={{ padding: 90, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 50, textAlign: "center" }}
		>
			{brand.logoUrl ? <LogoImage src={brand.logoUrl} alt={brand.nome} size={220} radius={50} /> : null}
			<span style={{ fontSize: 100, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", textTransform: "uppercase", ...clampLines(3) }}>
				{brand.nome}
			</span>
			<span style={{ fontSize: 40, lineHeight: 1.4, maxWidth: 750, opacity: 0.85 }}>{offersDisclaimer(validity)}</span>
			<span style={{ ...pageNumberStyle, opacity: 0.7 }}>{pageNumber(props, page)}</span>
		</PageFrame>
	);
}

function CarouselPage(args: TVisualKitPageArgs) {
	if (args.page.kind === "COVER") return <CoverPage {...args} />;
	if (args.page.kind === "CLOSING") return <ClosingPage {...args} />;
	return <ProductPage {...args} />;
}

export const carouselRenderer: TVisualKitPieceRenderer = {
	paginate,
	pageSize: () => PAGE,
	Page: CarouselPage,
};
