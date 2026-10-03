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

const PAGE = VISUAL_KIT_FORMATS.SELO_PRODUTO.pagina;
const BAR_HEIGHT = 255;

/** Logo no canto (com contorno branco para destacar da foto) ou nome da organização num selo branco. */
function CornerBrand({ marca }: { marca: TVisualKitBrand }) {
	if (marca.logoUrl) {
		return (
			<LogoImage
				src={marca.logoUrl}
				alt={marca.nome}
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
				color: accentOnPaper(marca),
				borderRadius: 24,
				padding: "18px 28px",
				boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
			}}
		>
			<Wordmark marca={marca} size={40} />
		</div>
	);
}

function SeloPage({ props, page }: TVisualKitPageArgs) {
	const { marca } = props;
	const item = page.itens[0];
	if (!item) {
		return (
			<PageFrame size={PAGE} background={PAPER}>
				<EmptyNotice size={40} />
			</PageFrame>
		);
	}
	const display = resolveItemDisplay(item, props.opcoes);
	return (
		<PageFrame size={PAGE} background={PAPER}>
			<ProductImage item={item} marca={marca} padding={70} style={{ position: "absolute", inset: `0 0 ${BAR_HEIGHT}px 0` }} />
			{display.percentual != null ? (
				<div
					style={{
						position: "absolute",
						left: 0,
						top: 0,
						background: marca.corSecundaria,
						color: marca.corSecundariaForeground,
						padding: "30px 44px 26px 49px",
						borderBottomRightRadius: 49,
						fontSize: 88,
						fontWeight: 800,
						lineHeight: 0.9,
						letterSpacing: "-0.03em",
					}}
				>
					{discountLabel(display.percentual)}
				</div>
			) : null}
			<CornerBrand marca={marca} />
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					height: BAR_HEIGHT,
					background: marca.corPrimaria,
					color: marca.corPrimariaForeground,
					boxShadow: `inset 0 15px 0 ${marca.corSecundaria}`,
					display: "flex",
					alignItems: "center",
					gap: 49,
					padding: "15px 59px 0 59px",
					boxSizing: "border-box",
				}}
			>
				<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
					<span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em", ...clampLines(2) }}>{item.nome}</span>
					{display.precoDe != null ? <FromPrice value={display.precoDe} withPor={false} style={{ fontSize: 38, opacity: 0.75 }} /> : null}
				</div>
				<FlatPrice value={item.preco} size={118} />
			</div>
		</PageFrame>
	);
}

export const seloProdutoRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginatePerItem(props.itens),
	pageSize: () => PAGE,
	Page: SeloPage,
};
