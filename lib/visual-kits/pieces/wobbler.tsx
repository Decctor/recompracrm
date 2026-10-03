import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { A4_PAGE, mmToPx } from "../formats";
import type { TVisualKitBrand, TVisualKitPieceItem } from "../types";
import {
	clampLines,
	CUT_LINE_COLOR,
	discountLabel,
	EmptyNotice,
	formatValidity,
	FromPrice,
	hexToRgba,
	PageFrame,
	PAPER,
	paginateSheets,
	PriceValue,
	resolveItemDisplay,
	SheetFooter,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
	readableOn,
} from "./shared";

const PER_SHEET = 4;
const DISC = mmToPx(100);
const RADIUS = DISC / 2;
const STEM_WIDTH = mmToPx(18);
const STEM_LENGTH = mmToPx(40);
// A dobra fica a 13 mm do disco: a parte de cima vira a aba que cola na prateleira.
const FOLD_OFFSET = mmToPx(13);
const CELL_HEIGHT = DISC + STEM_LENGTH;
const COLUMN_GAP = mmToPx(4);
const ROW_GAP = mmToPx(3);
const SHEET_TOP = mmToPx(5);
const SHEET_LEFT = (A4_PAGE.largura - 2 * DISC - COLUMN_GAP) / 2;

/** Contorno de corte: disco + haste numa linha só. */
function cutPath() {
	const half = STEM_WIDTH / 2;
	const joinY = RADIUS + Math.sqrt(RADIUS * RADIUS - half * half);
	const left = RADIUS - half;
	const right = RADIUS + half;
	return `M${left} ${joinY}A${RADIUS} ${RADIUS} 0 1 1 ${right} ${joinY}L${right} ${CELL_HEIGHT}L${left} ${CELL_HEIGHT}Z`;
}
const CUT_PATH = cutPath();

type TWobblerProps = { item: TVisualKitPieceItem; marca: TVisualKitBrand; opcoes: TVisualKitConfig; validade: string | null };

function Wobbler({ item, marca, opcoes, validade }: TWobblerProps) {
	const display = resolveItemDisplay(item, opcoes);
	return (
		<div style={{ position: "relative", width: DISC, height: CELL_HEIGHT }}>
			<div
				style={{
					position: "absolute",
					left: RADIUS - STEM_WIDTH / 2,
					top: DISC - 8,
					width: STEM_WIDTH,
					height: STEM_LENGTH + 8,
					background: "#fafaf9",
				}}
			>
				<div style={{ position: "absolute", left: 0, right: 0, top: 8 + FOLD_OFFSET, borderTop: "1px dashed #9a9a9a" }} />
				<span
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						top: 8 + FOLD_OFFSET + 10,
						display: "flex",
						justifyContent: "center",
						writingMode: "vertical-rl",
						fontSize: 9.5,
						letterSpacing: "0.12em",
						textTransform: "uppercase",
						color: "#9a9a9a",
					}}
				>
					dobre e cole
				</span>
			</div>
			<div
				style={{
					position: "absolute",
					inset: "0 0 auto 0",
					width: DISC,
					height: DISC,
					boxSizing: "border-box",
					borderRadius: "50%",
					background: marca.corPrimaria,
					color: marca.corPrimariaForeground,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: 9,
					padding: 48,
					textAlign: "center",
				}}
			>
				<div style={{ position: "absolute", inset: 14, borderRadius: "50%", border: `2px solid ${hexToRgba(marca.corPrimariaForeground, 0.35)}` }} />
				<span
					style={{
						fontSize: 15,
						fontWeight: 800,
						letterSpacing: "0.28em",
						paddingLeft: "0.28em",
						textTransform: "uppercase",
						color: readableOn(marca.corPrimaria, marca.corSecundaria, marca.corPrimariaForeground),
					}}
				>
					Oferta
				</span>
				<span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em", maxWidth: 250, ...clampLines(2) }}>{item.nome}</span>
				{display.precoDe != null ? <FromPrice value={display.precoDe} style={{ fontSize: 14, opacity: 0.8 }} /> : null}
				<PriceValue value={item.preco} size={88} />
				{display.percentual != null ? (
					<span
						style={{
							background: marca.corSecundaria,
							color: marca.corSecundariaForeground,
							fontSize: 15,
							fontWeight: 800,
							padding: "3px 15px",
							borderRadius: 9999,
						}}
					>
						{discountLabel(display.percentual)}
					</span>
				) : null}
				{validade ? (
					<span style={{ fontSize: 10.5, opacity: 0.7, letterSpacing: "0.08em", textTransform: "uppercase" }}>Válido até {validade}</span>
				) : null}
			</div>
			<svg
				width={DISC}
				height={CELL_HEIGHT}
				viewBox={`0 0 ${DISC} ${CELL_HEIGHT}`}
				style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}
				aria-hidden
			>
				<path d={CUT_PATH} fill="none" stroke={CUT_LINE_COLOR} strokeWidth={1} strokeDasharray="4 3" />
			</svg>
		</div>
	);
}

function WobblerSheet({ props, page }: TVisualKitPageArgs) {
	const validade = formatValidity(props.validadeFim);
	return (
		<PageFrame size={A4_PAGE} background={PAPER}>
			{page.itens.length ? (
				page.itens.map((item, index) => (
					<div
						key={`${item.chave}-${index}`}
						style={{
							position: "absolute",
							left: SHEET_LEFT + (index % 2) * (DISC + COLUMN_GAP),
							top: SHEET_TOP + Math.floor(index / 2) * (CELL_HEIGHT + ROW_GAP),
						}}
					>
						<Wobbler item={item} marca={props.marca} opcoes={props.opcoes} validade={validade} />
					</div>
				))
			) : (
				<EmptyNotice />
			)}
			<SheetFooter marca={props.marca} formato="WOBBLER" page={page} hint="Ø 10 cm · recorte nas linhas tracejadas, dobre na linha da haste" />
		</PageFrame>
	);
}

export const wobblerRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginateSheets(props.itens, PER_SHEET),
	pageSize: () => A4_PAGE,
	Page: WobblerSheet,
};
