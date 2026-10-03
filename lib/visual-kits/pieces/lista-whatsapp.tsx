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

const WIDTH = VISUAL_KIT_FORMATS.LISTA_WHATSAPP.pagina.largura;
// Cabeçalho + rodapé somam 480 px (ver `VISUAL_KIT_FORMATS.LISTA_WHATSAPP.pagina`).
const HEADER_HEIGHT = 350;
const FOOTER_HEIGHT = 130;
const ROW_HEIGHT = 150;

function paginate(props: TVisualKitPieceProps): TVisualKitPage[] {
	const itens = props.itens.slice(0, visualKitPieceItemCount("LISTA_WHATSAPP", props.itens.length));
	return [{ indice: 0, tipo: "LISTA", itens, rotulo: "Lista" }];
}

// Sem itens, reserva uma linha para o aviso de lista vazia.
function pageSize(_props: TVisualKitPieceProps, page: TVisualKitPage): TVisualKitPageSize {
	return { largura: WIDTH, altura: HEADER_HEIGHT + FOOTER_HEIGHT + Math.max(1, page.itens.length) * ROW_HEIGHT };
}

type TListRowProps = { item: TVisualKitPieceItem; position: number; marca: TVisualKitBrand; opcoes: TVisualKitConfig };

function ListRow({ item, position, marca, opcoes }: TListRowProps) {
	const display = resolveItemDisplay(item, opcoes);
	const hasPromo = display.precoDe != null || display.percentual != null;
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
			<ProductImage item={item} marca={marca} radius={20} style={{ width: 110, height: 110, flexShrink: 0 }} />
			<div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 6 }}>
				<span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em", color: INK, ...clampLines(2) }}>{item.nome}</span>
				{item.detalhe ? <span style={{ fontSize: 27, color: MUTED_INK }}>{item.detalhe}</span> : null}
			</div>
			<div style={{ display: "flex", flexShrink: 0, flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
				{hasPromo ? (
					<span style={{ display: "flex", alignItems: "center", gap: 14 }}>
						{display.precoDe != null ? <s style={{ fontSize: 25, color: "#8a8a8a" }}>{formatMoney(display.precoDe)}</s> : null}
						{display.percentual != null ? (
							<span
								style={{
									background: marca.corSecundaria,
									color: marca.corSecundariaForeground,
									fontSize: 23,
									fontWeight: 800,
									padding: "4px 14px",
									borderRadius: 11,
								}}
							>
								{discountLabel(display.percentual)}
							</span>
						) : null}
					</span>
				) : null}
				<FlatPrice value={item.preco} size={54} style={{ color: INK }} />
			</div>
		</div>
	);
}

function ListaPage({ props, page }: TVisualKitPageArgs) {
	const { marca } = props;
	const validade = formatValidity(props.validadeFim);
	return (
		<PageFrame size={pageSize(props, page)} background={PAPER} style={{ display: "flex", flexDirection: "column" }}>
			<div
				style={{
					height: HEADER_HEIGHT,
					flexShrink: 0,
					boxSizing: "border-box",
					background: marca.corPrimaria,
					color: marca.corPrimariaForeground,
					padding: "0 58px",
					display: "flex",
					alignItems: "center",
					gap: 36,
				}}
			>
				{/* Sem logo, o sobretítulo com o nome da organização faz o papel de marca. */}
				{marca.logoUrl ? <LogoImage src={marca.logoUrl} alt={marca.nome} size={130} radius={29} /> : null}
				<div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column", gap: 11 }}>
					<Eyebrow marca={marca} size={25} />
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
				{validade ? <ValidityBadge marca={marca} validade={validade} scale={3.6} /> : null}
			</div>
			<div style={{ position: "relative", flex: 1 }}>
				{page.itens.length ? (
					page.itens.map((item, index) => <ListRow key={item.chave} item={item} position={index + 1} marca={marca} opcoes={props.opcoes} />)
				) : (
					<EmptyNotice size={28} />
				)}
			</div>
			<div
				style={{
					height: FOOTER_HEIGHT,
					flexShrink: 0,
					boxSizing: "border-box",
					background: marca.corSecundaria,
					color: marca.corSecundariaForeground,
					padding: "0 50px",
					display: "flex",
					alignItems: "center",
					fontSize: 25,
					fontWeight: 600,
					lineHeight: 1.4,
				}}
			>
				{offersDisclaimer(validade, "Imagens meramente ilustrativas.")}
			</div>
		</PageFrame>
	);
}

export const listaWhatsappRenderer: TVisualKitPieceRenderer = {
	paginate,
	pageSize,
	Page: ListaPage,
};
