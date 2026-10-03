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

const PAGE = VISUAL_KIT_FORMATS.CARROSSEL.pagina;

function paginate(props: TVisualKitPieceProps): TVisualKitPage[] {
	const items = props.itens.slice(0, visualKitPieceItemCount("CARROSSEL", props.itens.length));
	if (!items.length) return [{ indice: 0, tipo: "PRODUTO", itens: [], rotulo: "Sem produtos" }];
	return [
		{ indice: 0, tipo: "CAPA", itens: [], rotulo: "Capa" },
		...items.map((item, index): TVisualKitPage => ({ indice: index + 1, tipo: "PRODUTO", itens: [item], rotulo: item.nome })),
		{ indice: items.length + 1, tipo: "FECHAMENTO", itens: [], rotulo: "Fechamento" },
	];
}

function pageNumber(props: TVisualKitPieceProps, page: TVisualKitPage) {
	const total = visualKitPieceItemCount("CARROSSEL", props.itens.length) + 2;
	return `${page.indice + 1}/${total}`;
}

const pageNumberStyle = { fontSize: 35, fontWeight: 700, letterSpacing: "0.02em" } as const;

function CoverPage({ props, page }: TVisualKitPageArgs) {
	const { marca } = props;
	const validade = formatValidity(props.validadeFim);
	const count = visualKitPieceItemCount("CARROSSEL", props.itens.length);
	const countLabel = count === 1 ? "1 oferta" : `${count} ofertas`;
	const ring = hexToRgba(marca.corPrimariaForeground, 0.35);
	return (
		<PageFrame
			size={PAGE}
			background={marca.corPrimaria}
			color={marca.corPrimariaForeground}
			style={{ padding: 90, display: "flex", flexDirection: "column" }}
		>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
				<BrandLogo marca={marca} size={150} radius={35} wordmarkSize={60} />
				<span style={{ ...pageNumberStyle, opacity: 0.7 }}>{pageNumber(props, page)}</span>
			</div>
			<div style={{ flex: 1 }} />
			<span
				style={{
					fontSize: 37.5,
					fontWeight: 700,
					letterSpacing: "0.22em",
					textTransform: "uppercase",
					color: readableOn(marca.corPrimaria, marca.corSecundaria, marca.corPrimariaForeground),
				}}
			>
				{marca.nome}
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
			<span style={{ fontSize: 42.5, opacity: 0.8, marginTop: 40 }}>{validade ? `${countLabel} · válidas até ${validade}` : countLabel}</span>
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
	const { marca } = props;
	const item = page.itens[0];
	if (!item) {
		return (
			<PageFrame size={PAGE} background={PAPER}>
				<EmptyNotice size={44} />
			</PageFrame>
		);
	}
	const display = resolveItemDisplay(item, props.opcoes);
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
						color: accentOnPaper(marca),
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
				<ProductImage item={item} marca={marca} radius={40} padding={40} style={{ position: "absolute", inset: 0 }} />
				{display.percentual != null ? (
					<span
						style={{
							position: "absolute",
							left: 40,
							top: 40,
							background: marca.corSecundaria,
							color: marca.corSecundariaForeground,
							fontSize: 55,
							fontWeight: 800,
							letterSpacing: "-0.03em",
							padding: "15px 35px",
							borderRadius: 9999,
						}}
					>
						{discountLabel(display.percentual)}
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
						background: marca.corPrimaria,
						color: marca.corPrimariaForeground,
						borderRadius: 40,
						padding: "25px 40px 30px 40px",
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 10,
					}}
				>
					{display.precoDe != null ? <FromPrice value={display.precoDe} withPor={false} style={{ fontSize: 32.5, opacity: 0.8 }} /> : null}
					<PriceValue value={item.preco} size={130} />
				</div>
			</div>
		</PageFrame>
	);
}

function ClosingPage({ props, page }: TVisualKitPageArgs) {
	const { marca } = props;
	const validade = formatValidity(props.validadeFim);
	return (
		<PageFrame
			size={PAGE}
			background={marca.corSecundaria}
			color={marca.corSecundariaForeground}
			style={{ padding: 90, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 50, textAlign: "center" }}
		>
			{marca.logoUrl ? <LogoImage src={marca.logoUrl} alt={marca.nome} size={220} radius={50} /> : null}
			<span style={{ fontSize: 100, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", textTransform: "uppercase", ...clampLines(3) }}>
				{marca.nome}
			</span>
			<span style={{ fontSize: 40, lineHeight: 1.4, maxWidth: 750, opacity: 0.85 }}>{offersDisclaimer(validade)}</span>
			<span style={{ ...pageNumberStyle, opacity: 0.7 }}>{pageNumber(props, page)}</span>
		</PageFrame>
	);
}

function CarrosselPage(args: TVisualKitPageArgs) {
	if (args.page.tipo === "CAPA") return <CoverPage {...args} />;
	if (args.page.tipo === "FECHAMENTO") return <ClosingPage {...args} />;
	return <ProductPage {...args} />;
}

export const carrosselRenderer: TVisualKitPieceRenderer = {
	paginate,
	pageSize: () => PAGE,
	Page: CarrosselPage,
};
