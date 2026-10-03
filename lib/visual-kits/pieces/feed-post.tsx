import { VISUAL_KIT_FORMATS } from "../formats";
import {
	BrandLogo,
	clampLines,
	discountLabel,
	EmptyNotice,
	formatValidity,
	FromPrice,
	joinDefined,
	PageFrame,
	paginatePerItem,
	PriceValue,
	ProductImage,
	resolveItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
} from "./shared";

const PAGE = VISUAL_KIT_FORMATS.POST_FEED.page;

function PostPage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const item = page.items[0];
	const frame = { size: PAGE, background: brand.corPrimaria, color: brand.corPrimariaForeground };
	if (!item) {
		return (
			<PageFrame {...frame}>
				<EmptyNotice color={brand.corPrimariaForeground} size={40} />
			</PageFrame>
		);
	}
	const display = resolveItemDisplay(item, props.configuracao);
	const validity = formatValidity(props.validadeFim);
	const subtitle = joinDefined([item.detalhe, validity ? `válido até ${validity}` : null]);
	return (
		<PageFrame {...frame} style={{ padding: 54, display: "flex", flexDirection: "column", gap: 36 }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
				<BrandLogo brand={brand} size={102} radius={21} wordmarkSize={39} />
				<span
					style={{
						minWidth: 0,
						fontSize: 28.5,
						fontWeight: 800,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
						textAlign: "right",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{props.chamada}
				</span>
			</div>
			<div style={{ position: "relative", flex: 1, minHeight: 0 }}>
				<ProductImage item={item} brand={brand} radius={30} padding={40} style={{ position: "absolute", inset: 0 }} />
				{display.percentualDesconto != null ? (
					<span
						style={{
							position: "absolute",
							right: 30,
							top: 30,
							width: 144,
							height: 144,
							borderRadius: "50%",
							background: brand.corSecundaria,
							color: brand.corSecundariaForeground,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 45,
							fontWeight: 800,
							letterSpacing: "-0.03em",
						}}
					>
						{discountLabel(display.percentualDesconto)}
					</span>
				) : null}
			</div>
			<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 36 }}>
				<div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
					<span style={{ fontSize: 54, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em", ...clampLines(2) }}>{item.nome}</span>
					{subtitle ? <span style={{ fontSize: 27, opacity: 0.75, letterSpacing: "0.02em" }}>{subtitle}</span> : null}
				</div>
				<div
					style={{
						flexShrink: 0,
						background: brand.corSecundaria,
						color: brand.corSecundariaForeground,
						borderRadius: 30,
						padding: "21px 33px 24px 33px",
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 9,
					}}
				>
					{display.precoDe != null ? <FromPrice value={display.precoDe} style={{ fontSize: 25.5, fontWeight: 600, opacity: 0.85 }} /> : null}
					<PriceValue value={item.preco} size={120} />
				</div>
			</div>
		</PageFrame>
	);
}

export const feedPostRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginatePerItem(props.items),
	pageSize: () => PAGE,
	Page: PostPage,
};
