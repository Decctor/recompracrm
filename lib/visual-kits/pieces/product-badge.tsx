import { VISUAL_KIT_FORMATS } from "../formats";
import type { TVisualKitBrand } from "../types";
import {
	clampLines,
	discountLabel,
	EmptyNotice,
	FlatPrice,
	FromPrice,
	LogoImage,
	PageFrame,
	PAPER,
	paginatePerItem,
	ProductImage,
	resolveItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
	Wordmark,
	accentOnPaper,
} from "./shared";

const PAGE = VISUAL_KIT_FORMATS.SELO_PRODUTO.page;
const BAR_HEIGHT = 255;

/** Logo no canto (com contorno branco para destacar da foto) ou nome da organização num selo branco. */
function CornerBrand({ brand }: { brand: TVisualKitBrand }) {
	if (brand.logoUrl) {
		return (
			<LogoImage
				src={brand.logoUrl}
				alt={brand.nome}
				size={147}
				radius={34}
				style={{ position: "absolute", right: 49, top: 49, boxShadow: "0 0 0 10px #ffffff, 0 10px 30px rgba(0,0,0,0.15)" }}
			/>
		);
	}
	return (
		<div
			style={{
				position: "absolute",
				right: 49,
				top: 49,
				background: PAPER,
				color: accentOnPaper(brand),
				borderRadius: 24,
				padding: "18px 28px",
				boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
			}}
		>
			<Wordmark brand={brand} size={40} />
		</div>
	);
}

function ProductBadgePage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const item = page.items[0];
	if (!item) {
		return (
			<PageFrame size={PAGE} background={PAPER}>
				<EmptyNotice size={40} />
			</PageFrame>
		);
	}
	const display = resolveItemDisplay(item, props.configuracao);
	return (
		<PageFrame size={PAGE} background={PAPER}>
			<ProductImage item={item} brand={brand} padding={70} style={{ position: "absolute", inset: `0 0 ${BAR_HEIGHT}px 0` }} />
			{display.percentualDesconto != null ? (
				<div
					style={{
						position: "absolute",
						left: 0,
						top: 0,
						background: brand.corSecundaria,
						color: brand.corSecundariaForeground,
						padding: "30px 44px 26px 49px",
						borderBottomRightRadius: 49,
						fontSize: 88,
						fontWeight: 800,
						lineHeight: 0.9,
						letterSpacing: "-0.03em",
					}}
				>
					{discountLabel(display.percentualDesconto)}
				</div>
			) : null}
			<CornerBrand brand={brand} />
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					height: BAR_HEIGHT,
					background: brand.corPrimaria,
					color: brand.corPrimariaForeground,
					boxShadow: `inset 0 15px 0 ${brand.corSecundaria}`,
					display: "flex",
					alignItems: "center",
					gap: 49,
					padding: "15px 59px 0 59px",
					boxSizing: "border-box",
				}}
			>
				<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
					<span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em", ...clampLines(2) }}>{item.nome}</span>
					{display.precoDe != null ? <FromPrice value={display.precoDe} withSuffix={false} style={{ fontSize: 38, opacity: 0.75 }} /> : null}
				</div>
				<FlatPrice value={item.preco} size={118} />
			</div>
		</PageFrame>
	);
}

export const productBadgeRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginatePerItem(props.items),
	pageSize: () => PAGE,
	Page: ProductBadgePage,
};
