import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { VISUAL_KIT_FORMATS, visualKitPieceItemCount } from "../formats";
import type { TVisualKitBrand, TVisualKitPage, TVisualKitPieceItem, TVisualKitPieceProps } from "../types";
import {
	clampLines,
	discountLabel,
	Eyebrow,
	fitTitleSize,
	EmptyNotice,
	FlatPrice,
	formatMoney,
	formatValidity,
	INK,
	LogoImage,
	MUTED_INK,
	offersDisclaimer,
	PageFrame,
	PAPER,
	ProductImage,
	resolveItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPageSize,
	type TVisualKitPieceRenderer,
	ValidityBadge,
} from "./shared";

const WIDTH = VISUAL_KIT_FORMATS.LISTA_WHATSAPP.page.width;
// Cabeçalho + rodapé somam 480 px (ver `VISUAL_KIT_FORMATS.LISTA_WHATSAPP.pagina`).
const HEADER_HEIGHT = 350;
const FOOTER_HEIGHT = 130;
const ROW_HEIGHT = 150;

function paginate(props: TVisualKitPieceProps): TVisualKitPage[] {
	const listItems = props.items.slice(0, visualKitPieceItemCount("LISTA_WHATSAPP", props.items.length));
	return [{ index: 0, kind: "LIST", items: listItems, label: "Lista" }];
}

// Sem itens, reserva uma linha para o aviso de lista vazia.
function pageSize(_props: TVisualKitPieceProps, page: TVisualKitPage): TVisualKitPageSize {
	return { width: WIDTH, height: HEADER_HEIGHT + FOOTER_HEIGHT + Math.max(1, page.items.length) * ROW_HEIGHT };
}

type TListRowProps = { item: TVisualKitPieceItem; position: number; brand: TVisualKitBrand; configuracao: TVisualKitConfig };

function ListRow({ item, position, brand, configuracao }: TListRowProps) {
	const display = resolveItemDisplay(item, configuracao);
	const hasPromo = display.precoDe != null || display.percentualDesconto != null;
	return (
		<div
			style={{
				height: ROW_HEIGHT,
				boxSizing: "border-box",
				display: "flex",
				alignItems: "center",
				gap: 36,
				padding: "0 50px",
				borderBottom: "2px solid #efefef",
			}}
		>
			<span style={{ width: 47, flexShrink: 0, fontSize: 27, fontWeight: 700, color: "#a3a3a3", fontVariantNumeric: "lining-nums tabular-nums" }}>
				{String(position).padStart(2, "0")}
			</span>
			<ProductImage item={item} brand={brand} radius={20} style={{ width: 110, height: 110, flexShrink: 0 }} />
			<div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 6 }}>
				<span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em", color: INK, ...clampLines(2) }}>{item.nome}</span>
				{item.detalhe ? <span style={{ fontSize: 27, color: MUTED_INK }}>{item.detalhe}</span> : null}
			</div>
			<div style={{ display: "flex", flexShrink: 0, flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
				{hasPromo ? (
					<span style={{ display: "flex", alignItems: "center", gap: 14 }}>
						{display.precoDe != null ? <s style={{ fontSize: 25, color: "#8a8a8a" }}>{formatMoney(display.precoDe)}</s> : null}
						{display.percentualDesconto != null ? (
							<span
								style={{
									background: brand.corSecundaria,
									color: brand.corSecundariaForeground,
									fontSize: 23,
									fontWeight: 800,
									padding: "4px 14px",
									borderRadius: 11,
								}}
							>
								{discountLabel(display.percentualDesconto)}
							</span>
						) : null}
					</span>
				) : null}
				<FlatPrice value={item.preco} size={54} style={{ color: INK }} />
			</div>
		</div>
	);
}

function WhatsappListPage({ props, page }: TVisualKitPageArgs) {
	const { brand } = props;
	const validity = formatValidity(props.validadeFim);
	return (
		<PageFrame size={pageSize(props, page)} background={PAPER} style={{ display: "flex", flexDirection: "column" }}>
			<div
				style={{
					height: HEADER_HEIGHT,
					flexShrink: 0,
					boxSizing: "border-box",
					background: brand.corPrimaria,
					color: brand.corPrimariaForeground,
					padding: "0 58px",
					display: "flex",
					alignItems: "center",
					gap: 36,
				}}
			>
				{/* Sem logo, o sobretítulo com o nome da organização faz o papel de marca. */}
				{brand.logoUrl ? <LogoImage src={brand.logoUrl} alt={brand.nome} size={130} radius={29} /> : null}
				<div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 11 }}>
					<Eyebrow brand={brand} size={25} />
					<span
						style={{
							fontSize: fitTitleSize(props.chamada, 79, 18),
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
				{validity ? <ValidityBadge brand={brand} validity={validity} scale={3.6} /> : null}
			</div>
			<div style={{ position: "relative", flex: 1 }}>
				{page.items.length ? (
					page.items.map((item, index) => <ListRow key={item.chave} item={item} position={index + 1} brand={brand} configuracao={props.configuracao} />)
				) : (
					<EmptyNotice size={28} />
				)}
			</div>
			<div
				style={{
					height: FOOTER_HEIGHT,
					flexShrink: 0,
					boxSizing: "border-box",
					background: brand.corSecundaria,
					color: brand.corSecundariaForeground,
					padding: "0 50px",
					display: "flex",
					alignItems: "center",
					fontSize: 25,
					fontWeight: 600,
					lineHeight: 1.4,
				}}
			>
				{offersDisclaimer(validity, "Imagens meramente ilustrativas.")}
			</div>
		</PageFrame>
	);
}

export const whatsappListRenderer: TVisualKitPieceRenderer = {
	paginate,
	pageSize,
	Page: WhatsappListPage,
};
