import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { A4_PAGE } from "../formats";
import type { TVisualKitBrand, TVisualKitPieceItem } from "../types";
import {
	clampLines,
	discountLabel,
	Eyebrow,
	fitTitleSize,
	EmptyNotice,
	formatValidity,
	FromPrice,
	INK,
	joinDefined,
	LogoImage,
	MUTED_INK,
	offersDisclaimer,
	PageFrame,
	PAPER,
	paginateSheets,
	PriceValue,
	ProductImage,
	resolveItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
	ValidityBadge,
	accentOnPaper,
} from "./shared";

const PER_PAGE = 9;
const GRID_LINE = "#ececec";

function OfferCell({ item, marca, opcoes }: { item: TVisualKitPieceItem; marca: TVisualKitBrand; opcoes: TVisualKitConfig }) {
	const display = resolveItemDisplay(item, opcoes);
	const detail = joinDefined([item.detalhe, display.precoUnidade ? `${display.precoUnidade.valor} ${display.precoUnidade.rotulo}` : null]);
	return (
		<div
			style={{
				position: "relative",
				background: PAPER,
				padding: 13,
				display: "flex",
				flexDirection: "column",
				gap: 6,
				minHeight: 0,
				overflow: "hidden",
			}}
		>
			<ProductImage item={item} marca={marca} radius={6} style={{ flex: 1, minHeight: 83 }} />
			{display.percentual != null ? (
				<span
					style={{
						position: "absolute",
						top: 13,
						left: 13,
						background: marca.corPrimaria,
						color: marca.corPrimariaForeground,
						fontSize: 13.5,
						fontWeight: 800,
						padding: "4px 9px",
						borderTopLeftRadius: 6,
						borderBottomRightRadius: 8,
					}}
				>
					{discountLabel(display.percentual)}
				</span>
			) : null}
			<span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.01em", color: INK, marginTop: 4, ...clampLines(2) }}>
				{item.nome}
			</span>
			{detail ? (
				<span style={{ fontSize: 11, color: MUTED_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</span>
			) : null}
			<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, color: accentOnPaper(marca) }}>
				{display.precoDe != null ? (
					<span style={{ fontSize: 11, color: MUTED_INK, lineHeight: 1.2 }}>
						<FromPrice value={display.precoDe} withPor={false} />
						<br />
						por
					</span>
				) : null}
				<PriceValue value={item.preco} size={44} style={{ marginLeft: "auto" }} />
			</div>
		</div>
	);
}

function EncartePage({ props, page }: TVisualKitPageArgs) {
	const { marca } = props;
	const validade = formatValidity(props.validadeFim);
	const pages = Math.ceil(Math.max(1, props.itens.length) / PER_PAGE);
	const blanks = page.itens.length ? PER_PAGE - page.itens.length : 0;
	return (
		<PageFrame size={A4_PAGE} background={PAPER} style={{ display: "flex", flexDirection: "column" }}>
			<div
				style={{
					background: marca.corPrimaria,
					color: marca.corPrimariaForeground,
					padding: "30px 34px",
					display: "flex",
					alignItems: "center",
					gap: 23,
				}}
			>
				{/* Sem logo, o sobretítulo com o nome da organização faz o papel de marca. */}
				{marca.logoUrl ? <LogoImage src={marca.logoUrl} alt={marca.nome} size={87} radius={11} /> : null}
				<div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 8 }}>
					<Eyebrow marca={marca} size={14} />
					<span
						style={{
							fontSize: fitTitleSize(props.chamada, 57, 18),
							fontWeight: 800,
							lineHeight: 1,
							letterSpacing: "-0.03em",
							textTransform: "uppercase",
							...clampLines(2),
						}}
					>
						{props.chamada}
					</span>
				</div>
				{validade ? <ValidityBadge marca={marca} validade={validade} scale={1.89} /> : null}
			</div>
			<div style={{ position: "relative", flex: 1, minHeight: 0, margin: 23 }}>
				{page.itens.length ? (
					<div
						style={{
							height: "100%",
							display: "grid",
							gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
							gridTemplateRows: "repeat(3, minmax(0, 1fr))",
							gap: 2,
							background: GRID_LINE,
							border: `2px solid ${GRID_LINE}`,
							boxSizing: "border-box",
						}}
					>
						{page.itens.map((item) => (
							<OfferCell key={item.chave} item={item} marca={marca} opcoes={props.opcoes} />
						))}
						{Array.from({ length: blanks }, (_, index) => (
							<div key={`blank-${index}`} style={{ background: PAPER }} />
						))}
					</div>
				) : (
					<EmptyNotice />
				)}
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					gap: 16,
					background: marca.corSecundaria,
					color: marca.corSecundariaForeground,
					padding: "13px 34px",
					fontSize: 12,
					fontWeight: 600,
					letterSpacing: "0.02em",
				}}
			>
				<span>{offersDisclaimer(validade, "Imagens meramente ilustrativas.")}</span>
				{pages > 1 ? <span style={{ flexShrink: 0 }}>{`${page.indice + 1}/${pages}`}</span> : null}
			</div>
		</PageFrame>
	);
}

export const encarteRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginateSheets(props.itens, PER_PAGE, "Página"),
	pageSize: () => A4_PAGE,
	Page: EncartePage,
};
