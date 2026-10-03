import { VISUAL_KIT_FORMATS } from "../formats";
import {
	BrandLogo,
	clampLines,
	discountLabel,
	EmptyNotice,
	formatValidity,
	FromPrice,
	PageFrame,
	paginatePerItem,
	PriceValue,
	ProductImage,
	resolveItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
} from "./shared";

const PAGE = VISUAL_KIT_FORMATS.STORY.page;

function StoryPage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const item = page.items[0];
	const frame = { size: PAGE, background: brand.corPrimaria, color: brand.corPrimariaForeground };
	if (!item) {
		return (
			<PageFrame {...frame}>
				<EmptyNotice color={brand.corPrimariaForeground} size={48} />
			</PageFrame>
		);
	}
	const display = resolveItemDisplay(item, props.configuracao);
	const validity = formatValidity(props.validadeFim);
	return (
		<PageFrame {...frame} style={{ padding: "112px 75px 98px 75px", display: "flex", flexDirection: "column", alignItems: "center", gap: 45 }}>
			<BrandLogo brand={brand} size={158} radius={34} wordmarkSize={56} />
			<span
				style={{
					maxWidth: "100%",
					fontSize: 36,
					fontWeight: 800,
					letterSpacing: "0.22em",
					paddingLeft: "0.22em",
					textTransform: "uppercase",
					textAlign: "center",
					...clampLines(2),
				}}
			>
				{props.chamada}
			</span>
			<div style={{ position: "relative", width: "100%", flex: 1, minHeight: 0 }}>
				<ProductImage item={item} brand={brand} radius={52} padding={60} style={{ position: "absolute", inset: 0 }} />
				{display.percentualDesconto != null ? (
					<span
						style={{
							position: "absolute",
							right: 37,
							top: 37,
							width: 195,
							height: 195,
							borderRadius: "50%",
							background: brand.corSecundaria,
							color: brand.corSecundariaForeground,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 60,
							fontWeight: 800,
							letterSpacing: "-0.03em",
						}}
					>
						{discountLabel(display.percentualDesconto)}
					</span>
				) : null}
			</div>
			<span style={{ fontSize: 75, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em", textAlign: "center", marginTop: 15, ...clampLines(2) }}>
				{item.nome}
			</span>
			<div
				style={{
					background: brand.corSecundaria,
					color: brand.corSecundariaForeground,
					borderRadius: 45,
					padding: "30px 68px 38px 68px",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 15,
				}}
			>
				{display.precoDe != null ? <FromPrice value={display.precoDe} style={{ fontSize: 36, fontWeight: 600, opacity: 0.85 }} /> : null}
				<PriceValue value={item.preco} size={202} />
			</div>
			{validity ? <span style={{ fontSize: 32, opacity: 0.75, letterSpacing: "0.08em", textTransform: "uppercase" }}>Válido até {validity}</span> : null}
		</PageFrame>
	);
}

export const storyRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginatePerItem(props.items),
	pageSize: () => PAGE,
	Page: StoryPage,
};
