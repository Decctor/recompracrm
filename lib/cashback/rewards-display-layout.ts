import { formatDecimalPlaces, getCashbackUnitLabel } from "@/lib/formatting";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";

/**
 * Arranjo do pôster de recompensas do programa de cashback.
 *
 * O pôster é impresso em A4/A5/A6, retrato ou paisagem, e pregado em balcão ou parede. A pergunta
 * que este módulo responde é: **dada a folha e a quantidade de recompensas, qual grade cabe o
 * máximo de itens sem cair abaixo do piso de legibilidade?**
 *
 * A versão anterior respondia isso com uma tabela decorada à mão (`A4-portrait: 9 itens em 3
 * colunas`), o que produzia dois defeitos previsíveis: 10 recompensas viravam duas folhas com meia
 * folha em branco, e o A6 herdava proporções pensadas para o A4. Aqui o arranjo é **procurado**.
 *
 * A busca é lexicográfica:
 *
 * 1. Menos folhas primeiro. Só quando NENHUM arranjo de N folhas passa no piso de legibilidade é
 *    que se pagina para N+1 — é o "encolhe até o piso, depois pagina".
 * 2. Dentro de um número de folhas, primeiro a tarja inteira; a tarja comprimida (`compact`, sem a
 *    faixa de regras) é a última carta antes de gastar outra folha, não uma concorrente.
 * 3. Dentro disso, legibilidade antes de pontuação, e a pontuação — tipografia grande + imagem
 *    grande, menos uma penalidade por célula ociosa — só desempata.
 *
 * Duas composições de célula, que competem pela mesma célula quando ambas são viáveis:
 *
 * - `showcase` — foto sobre o texto. Vence em células quadradas ou altas (grade 2x2, 3x3, 3x4).
 * - `menu` — miniatura, título, condutor pontilhado, valor à direita. Vence em células largas e
 *   baixas (listagem de 1 ou 2 colunas). É a voz de cardápio de balcão que o pôster persegue.
 *
 * Tudo aqui é geometria pura em milímetros, sem React e sem DOM: a página apenas despeja o
 * resultado em custom properties CSS.
 */

const PAPER_MM = {
	A4: { width: 210, height: 297 },
	A5: { width: 148, height: 210 },
	A6: { width: 105, height: 148 },
} as const;

export type TRewardsPaperSize = keyof typeof PAPER_MM;
export type TRewardsPaperOrientation = "portrait" | "landscape";
export type TRewardsComposition = "showcase" | "menu";
export type TRewardsChromeDensity = "full" | "compact";
export type TRewardsLegibility = "comfortable" | "tight";

export const REWARDS_PAPER_SIZES = Object.keys(PAPER_MM) as TRewardsPaperSize[];
export const REWARDS_PAPER_ORIENTATIONS: TRewardsPaperOrientation[] = ["portrait", "landscape"];

/** Piso de legibilidade a distância de balcão: ~6,5pt de altura de corpo. Abaixo disso, pagina. */
const MIN_TITLE_MM = 2.3;
/** Abaixo disso ainda imprime, mas a régua avisa que o papel está apertado. */
const COMFORTABLE_TITLE_MM = 3;
/**
 * Guarda grosseira contra células degeneradas. O corte de verdade é feito pelos planejadores de
 * célula, que reprovam por piso tipográfico e por coluna de título — subir este número aqui
 * eliminava arranjos válidos antes de alguém olhar para eles.
 */
const MIN_CELL_MM = 6;
const MAX_COLUMNS = 6;
const MAX_ROWS = 30;

/** Acima dessa razão largura/altura a célula é larga demais para empilhar foto sobre texto. */
const SHOWCASE_MAX_ASPECT = 3;
const SHOWCASE_MIN_WIDTH_MM = 26;
const SHOWCASE_MIN_HEIGHT_MM = 26;
/** A foto nunca cede mais que isso da altura da célula para o texto. */
const SHOWCASE_MIN_MEDIA_SHARE = 0.5;
/** Trava a caixa da foto em algo próximo do quadrado: célula muito alta não vira foto esticada. */
const SHOWCASE_MEDIA_MAX_ASPECT = 1.5;

const SCORE_TYPE_WEIGHT = 1;
const SCORE_MEDIA_WEIGHT = 0.3;
const SCORE_WASTE_WEIGHT = 0.12;
/**
 * Retornos decrescentes acima do joelho. Sem isso a busca troca uma foto de 40mm por um título de
 * 11mm sem hesitar — mas título acima de ~6mm já é confortável a distância de balcão e o ganho
 * seguinte é decorativo, enquanto a foto continua carregando informação de verdade.
 */
const TITLE_KNEE_MM = 6;
const MEDIA_KNEE_MM = 40;
const KNEE_DECAY = 0.3;

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function withDiminishingReturns(value: number, knee: number) {
	return value <= knee ? value : knee + (value - knee) * KNEE_DECAY;
}

// ---------------------------------------------------------------------------
// Tipografia do valor
// ---------------------------------------------------------------------------

export type TCashbackValueParts = {
	prefix: string | null;
	amount: string;
	cents: string | null;
	suffix: string | null;
};

/**
 * Quebra o valor da recompensa nas partes que a placa de preço compõe em tamanhos diferentes:
 * `R$` e os centavos saem menores e alinhados ao topo, o número grande carrega o olho. É o mesmo
 * gesto de uma etiqueta de gôndola, e é o motivo de não dar para usar `formatCashbackValue` direto.
 */
export function splitCashbackValue(value: number, terminology: TCashbackProgramTerminologyEnum): TCashbackValueParts {
	if (terminology === "PONTOS") {
		return {
			prefix: null,
			amount: formatDecimalPlaces(value),
			cents: null,
			suffix: getCashbackUnitLabel("PONTOS", { plural: Math.abs(Number(value)) !== 1 }),
		};
	}
	const [amount, cents] = Number(value).toLocaleString("pt-br", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(",");
	return { prefix: "R$", amount, cents: cents ?? "00", suffix: null };
}

/**
 * Avanço médio por classe de glifo na Outfit 800 com `tabular-nums`, em `em` — o peso e a feature
 * que `cashback-rewards-display.module.css` aplica na coluna de valor.
 *
 * Medido no arquivo da fonte, não estimado: com `tnum` todo dígito fica em 590/1000, ponto e
 * vírgula em ~0,295, o espaço em 0,185, e as letras que aparecem aqui ("pontos", "R$") dão ~0,563
 * de média. Os valores anteriores vinham da Raleway. Se a tipografia mudar de novo, remeça: é esta
 * conta que decide se cabem duas colunas ou uma na folha.
 */
const GLYPH_ADVANCE_EM = { digit: 0.59, separator: 0.295, space: 0.185, other: 0.563 };
/** Prefixo, centavos e sufixo são compostos nesta fração do corpo do número. */
const VALUE_SECONDARY_SCALE = 0.62;

function measureTextAdvance(text: string) {
	let advance = 0;
	for (const char of text) {
		if (char >= "0" && char <= "9") advance += GLYPH_ADVANCE_EM.digit;
		else if (char === "." || char === ",") advance += GLYPH_ADVANCE_EM.separator;
		else if (char === " ") advance += GLYPH_ADVANCE_EM.space;
		else advance += GLYPH_ADVANCE_EM.other;
	}
	return advance;
}

/**
 * Largura da coluna de valor em `em` do corpo do número. O ajuste na composição `menu` depende
 * disso: um programa em pontos com "12.500 pontos" precisa de coluna bem mais larga que "R$ 30,00",
 * e é essa diferença que decide se cabem 2 colunas ou 1 na folha.
 */
export function measureCashbackValueAdvance(parts: TCashbackValueParts) {
	let advance = measureTextAdvance(parts.amount);
	if (parts.prefix) advance += (measureTextAdvance(parts.prefix) + GLYPH_ADVANCE_EM.space) * VALUE_SECONDARY_SCALE;
	if (parts.cents) advance += (0.14 + measureTextAdvance(parts.cents)) * VALUE_SECONDARY_SCALE;
	if (parts.suffix) advance += (GLYPH_ADVANCE_EM.space + measureTextAdvance(parts.suffix)) * VALUE_SECONDARY_SCALE;
	return advance;
}

/** Maior coluna de valor entre as recompensas — é ela que dimensiona a grade inteira. */
export function measureWidestCashbackValue(values: number[], terminology: TCashbackProgramTerminologyEnum) {
	return values.reduce((widest, value) => Math.max(widest, measureCashbackValueAdvance(splitCashbackValue(value, terminology))), 0);
}

// ---------------------------------------------------------------------------
// Geometria da folha
// ---------------------------------------------------------------------------

type TChrome = {
	masthead: number;
	rule: number;
	footer: number;
	inset: number;
	gutter: number;
};

/**
 * As tarjas escalam com `sqrt(área)` da folha, não com a largura: assim o cabeçalho do A4 paisagem
 * tem a mesma presença do A4 retrato, e o A6 não herda um cabeçalho de A4 encolhido a fórceps.
 *
 * Em `compact` a faixa de regras desaparece — a regra de acúmulo passa a ser uma linha dentro da
 * própria tarja. Não é a tarja "espremida", é outra tarja.
 */
function getChrome(unit: number, density: TRewardsChromeDensity): TChrome {
	if (density === "full") {
		return {
			masthead: Math.max(unit * 0.105, 12),
			rule: Math.max(unit * 0.05, 6),
			footer: Math.max(unit * 0.038, 4.5),
			inset: Math.max(unit * 0.036, 4),
			gutter: Math.max(unit * 0.022, 2.4),
		};
	}
	return {
		masthead: Math.max(unit * 0.075, 10),
		rule: 0,
		footer: Math.max(unit * 0.027, 3.6),
		inset: Math.max(unit * 0.026, 3),
		gutter: Math.max(unit * 0.015, 1.6),
	};
}

export function getRewardsPaperMm(size: TRewardsPaperSize, orientation: TRewardsPaperOrientation) {
	const { width, height } = PAPER_MM[size];
	return orientation === "portrait" ? { width, height } : { width: height, height: width };
}

// ---------------------------------------------------------------------------
// Composição da célula
// ---------------------------------------------------------------------------

type TCellPlan = {
	composition: TRewardsComposition;
	type: { title: number; value: number; cents: number; meta: number; description: number };
	media: { width: number; height: number };
	show: { description: boolean; requirement: boolean };
	titleLines: number;
	padding: { x: number; y: number };
	gap: number;
	/** Largura mínima do condutor pontilhado; só existe na composição `menu`. */
	leader: number;
};

function planShowcaseCell({ cellWidth, cellHeight, maxTitle }: { cellWidth: number; cellHeight: number; maxTitle: number }): TCellPlan | null {
	const padding = clamp(cellHeight * 0.05, 1, 3);
	const innerWidth = cellWidth - padding * 2;
	const innerHeight = cellHeight - padding * 2;

	const title = Math.min(cellHeight * 0.085, cellWidth * 0.115, maxTitle);
	if (title < MIN_TITLE_MM) return null;

	const value = title * 1.22;
	const meta = clamp(title * 0.58, 1.5, 3);
	const description = title * 0.7;
	const gap = title * 0.34;

	// Duas linhas de título só onde há altura para elas competirem com a foto.
	const titleLines = innerHeight >= 40 ? 2 : 1;
	const floor = innerHeight * SHOWCASE_MIN_MEDIA_SHARE;

	// Uma calha inteira por bloco opcional, porque é isso que o CSS desenha: a célula é um flex em
	// coluna com `gap` uniforme, então cada filho a mais custa exatamente uma calha. Com coeficientes
	// menores aqui o modelo sobrava alguns décimos de milímetro, e com a foto ancorada no topo a
	// sobra saía pela última linha — que o `overflow: hidden` da célula cortava.
	let text = titleLines * title * 1.12 + gap + value * 1.15;
	const requirementBlock = gap + meta * 1.2;
	const descriptionBlock = gap + description * 1.25 * 2;

	const showRequirement = innerHeight - (text + requirementBlock) - gap >= floor;
	if (showRequirement) text += requirementBlock;
	const showDescription = showRequirement && innerHeight - (text + descriptionBlock) - gap >= floor;
	if (showDescription) text += descriptionBlock;

	const remaining = innerHeight - text - gap;
	if (remaining < 5) return null;

	// A caixa da foto fica próxima do quadrado mesmo em célula muito alta; a sobra vira respiro,
	// porque o conteúdo da célula é centrado verticalmente.
	const mediaHeight = Math.min(remaining, innerWidth * SHOWCASE_MEDIA_MAX_ASPECT);
	const mediaWidth = Math.min(innerWidth, mediaHeight * SHOWCASE_MEDIA_MAX_ASPECT);

	return {
		composition: "showcase",
		type: { title, value, cents: value * 0.6, meta, description },
		media: { width: mediaWidth, height: mediaHeight },
		show: { description: showDescription, requirement: showRequirement },
		titleLines,
		padding: { x: padding, y: padding },
		gap,
		leader: 0,
	};
}

function planMenuCell({
	cellWidth,
	cellHeight,
	unit,
	maxTitle,
	valueAdvanceEm,
}: {
	cellWidth: number;
	cellHeight: number;
	unit: number;
	maxTitle: number;
	valueAdvanceEm: number;
}): TCellPlan | null {
	const padY = clamp(cellHeight * 0.1, 0.6, 3);
	const padX = clamp(cellHeight * 0.14, 1.2, 4);
	const innerHeight = cellHeight - padY * 2;
	if (innerHeight < 4) return null;

	// A miniatura de cardápio nunca vira herói: teto proporcional à folha, não à célula.
	const thumb = Math.min(innerHeight, Math.max(unit * 0.1, 8));
	const leader = clamp(cellWidth * 0.05, 3, 10);
	const minTitleColumn = Math.max(unit * 0.09, 12);
	const fixedWidth = padX * 3 + thumb + leader;

	// O valor e o título disputam a mesma largura: desce o corpo até a coluna de título abrir.
	const steps = Math.ceil((Math.min(cellHeight * 0.3, maxTitle) - MIN_TITLE_MM) / 0.1);
	for (let step = 0; step <= Math.max(steps, 0); step++) {
		const title = Math.min(cellHeight * 0.3, maxTitle) - step * 0.1;
		if (title < MIN_TITLE_MM) break;
		const value = title * 1.26;
		const titleColumn = cellWidth - fixedWidth - value * valueAdvanceEm;
		if (titleColumn < minTitleColumn) continue;

		const meta = clamp(title * 0.55, 1.4, 3);
		return {
			composition: "menu",
			type: { title, value, cents: value * 0.6, meta, description: 0 },
			media: { width: thumb, height: thumb },
			show: { description: false, requirement: title * 1.15 + meta * 1.3 <= innerHeight },
			titleLines: 1,
			padding: { x: padX, y: padY },
			gap: padX,
			leader,
		};
	}
	return null;
}

/**
 * As duas composições competem pela mesma célula sempre que ambas são viáveis, e quem decide é a
 * pontuação. A alternativa — escolher pela proporção da célula — dava resultados absurdos nos
 * extremos: uma única recompensa num A4 paisagem tem célula de proporção 1,85 e virava um
 * "cardápio" de um item só, com miniatura de 25mm numa folha inteira.
 */
function planCell(args: { cellWidth: number; cellHeight: number; unit: number; maxTitle: number; valueAdvanceEm: number }): TCellPlan[] {
	const aspect = args.cellWidth / args.cellHeight;
	const showcaseViable = aspect <= SHOWCASE_MAX_ASPECT && args.cellWidth >= SHOWCASE_MIN_WIDTH_MM && args.cellHeight >= SHOWCASE_MIN_HEIGHT_MM;
	const plans = [showcaseViable ? planShowcaseCell(args) : null, planMenuCell(args)];
	return plans.filter((plan): plan is TCellPlan => plan !== null);
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

export type TRewardsDisplayLayout = {
	paper: { width: number; height: number };
	chrome: TRewardsChromeDensity;
	bands: TChrome;
	content: { width: number; height: number };
	grid: { columns: number; rows: number; perPage: number; pages: number; gap: number };
	cell: { width: number; height: number };
	composition: TRewardsComposition;
	type: TCellPlan["type"];
	media: TCellPlan["media"];
	show: TCellPlan["show"];
	titleLines: number;
	padding: TCellPlan["padding"];
	gap: number;
	leader: number;
	legibility: TRewardsLegibility;
	score: number;
};

type TArrangementInput = {
	paper: { width: number; height: number };
	unit: number;
	perPage: number;
	pages: number;
	density: TRewardsChromeDensity;
	valueAdvanceEm: number;
	prizeCount: number;
};

function findBestArrangement({ paper, unit, perPage, pages, density, valueAdvanceEm, prizeCount }: TArrangementInput): TRewardsDisplayLayout | null {
	const bands = getChrome(unit, density);
	const contentWidth = paper.width - bands.inset * 2;
	const contentHeight = paper.height - bands.masthead - bands.rule - bands.footer - bands.gutter * 2;
	if (contentWidth <= 0 || contentHeight <= 0) return null;

	// Teto do corpo do título proporcional à folha: um A4 com uma recompensa só vira cartaz, um A6
	// com doze não tenta virar cartaz.
	const maxTitle = Math.max(unit * 0.045, 5);
	let best: TRewardsDisplayLayout | null = null;

	for (let columns = 1; columns <= Math.min(MAX_COLUMNS, perPage); columns++) {
		const rows = Math.ceil(perPage / columns);
		if (rows > MAX_ROWS) continue;
		const cellWidth = (contentWidth - bands.gutter * (columns - 1)) / columns;
		const cellHeight = (contentHeight - bands.gutter * (rows - 1)) / rows;
		if (cellWidth < MIN_CELL_MM || cellHeight < MIN_CELL_MM) continue;

		const wasted = Math.max(columns * rows * pages - prizeCount, 0);
		for (const plan of planCell({ cellWidth, cellHeight, unit, maxTitle, valueAdvanceEm })) {
			// `min(largura, altura)` e não a área: a foto entra com `object-fit: contain`, então o
			// lado menor da caixa é o tamanho que a foto realmente alcança. Uma caixa 80×20 não
			// mostra mais produto que uma 20×20, e a pontuação precisa saber disso.
			const mediaReach = Math.min(plan.media.width, plan.media.height);
			const score =
				withDiminishingReturns(plan.type.title, TITLE_KNEE_MM) * SCORE_TYPE_WEIGHT +
				withDiminishingReturns(mediaReach, MEDIA_KNEE_MM) * SCORE_MEDIA_WEIGHT -
				wasted * SCORE_WASTE_WEIGHT;
			const legibility: TRewardsLegibility = plan.type.title >= COMFORTABLE_TITLE_MM ? "comfortable" : "tight";

			// Legibilidade antes de pontuação: um arranjo confortável ganha de um apertado com foto
			// maior, sempre. A pontuação só desempata dentro da mesma faixa.
			if (best) {
				if (best.legibility === "comfortable" && legibility === "tight") continue;
				if (best.legibility === legibility && score <= best.score) continue;
			}
			best = {
				paper,
				chrome: density,
				bands,
				content: { width: contentWidth, height: contentHeight },
				grid: { columns, rows, perPage, pages, gap: bands.gutter },
				cell: { width: cellWidth, height: cellHeight },
				composition: plan.composition,
				type: plan.type,
				media: plan.media,
				show: plan.show,
				titleLines: plan.titleLines,
				padding: plan.padding,
				gap: plan.gap,
				leader: plan.leader,
				legibility,
				score,
			};
		}
	}
	return best;
}

export type TResolveRewardsDisplayLayoutInput = {
	size: TRewardsPaperSize;
	orientation: TRewardsPaperOrientation;
	prizeCount: number;
	/** Largura da maior coluna de valor, em `em`. Ver `measureWidestCashbackValue`. */
	valueAdvanceEm: number;
};

export function resolveRewardsDisplayLayout({
	size,
	orientation,
	prizeCount,
	valueAdvanceEm,
}: TResolveRewardsDisplayLayoutInput): TRewardsDisplayLayout {
	const paper = getRewardsPaperMm(size, orientation);
	const unit = Math.sqrt(PAPER_MM[size].width * PAPER_MM[size].height);
	const count = Math.max(1, Math.floor(prizeCount));
	const advance = valueAdvanceEm > 0 ? valueAdvanceEm : 4.2;

	for (let pages = 1; pages <= count; pages++) {
		const perPage = Math.ceil(count / pages);
		// `full` primeiro, sempre: a faixa "como acumular" é a resposta à segunda pergunta do
		// cliente e não se abre mão dela para ganhar meio milímetro de título. `compact` é a última
		// carta antes de gastar outra folha, não uma alternativa que compete por pontuação.
		for (const density of ["full", "compact"] as const) {
			const candidate = findBestArrangement({ paper, unit, perPage, pages, density, valueAdvanceEm: advance, prizeCount: count });
			if (candidate) return candidate;
		}
	}

	// Inalcançável na prática — com uma recompensa por folha a célula é a folha inteira — mas o
	// caminho existe, e uma página pública não pode ficar 500 porque a busca não convergiu. Uma
	// recompensa por folha, no piso tipográfico: feio, e impresso.
	return buildFallbackArrangement({ paper, unit, count });
}

function buildFallbackArrangement({
	paper,
	unit,
	count,
}: {
	paper: { width: number; height: number };
	unit: number;
	count: number;
}): TRewardsDisplayLayout {
	const bands = getChrome(unit, "compact");
	const content = {
		width: Math.max(paper.width - bands.inset * 2, 1),
		height: Math.max(paper.height - bands.masthead - bands.rule - bands.footer - bands.gutter * 2, 1),
	};
	const padding = { x: Math.min(bands.inset, content.width / 4), y: Math.min(bands.gutter, content.height / 4) };
	const title = MIN_TITLE_MM;

	return {
		paper,
		chrome: "compact",
		bands,
		content,
		grid: { columns: 1, rows: 1, perPage: 1, pages: count, gap: bands.gutter },
		cell: { width: content.width, height: content.height },
		composition: "showcase",
		type: { title, value: title * 1.22, cents: title * 0.73, meta: title * 0.58, description: title * 0.7 },
		media: { width: content.width - padding.x * 2, height: (content.height - padding.y * 2) * 0.5 },
		show: { description: false, requirement: false },
		titleLines: 1,
		padding,
		gap: title * 0.34,
		leader: 0,
		legibility: "tight",
		score: 0,
	};
}

/** Régua legível do arranjo, para a barra de impressão. Ex.: "3 × 4 · vitrine · 1 folha". */
export function describeRewardsDisplayLayout(layout: TRewardsDisplayLayout) {
	const { columns, rows, pages } = layout.grid;
	const shape = columns === 1 && rows === 1 ? "peça única" : columns === 1 ? `lista de ${rows}` : `${columns} × ${rows}`;
	const composition = layout.composition === "showcase" ? "vitrine" : "cardápio";
	const sheets = pages === 1 ? "1 folha" : `${pages} folhas`;
	return `${shape} · ${composition} · ${sheets}`;
}

/** Divide as recompensas nas folhas e, dentro de cada folha, nas linhas da grade. */
export function paginateRewards<T>(prizes: T[], layout: TRewardsDisplayLayout): T[][][] {
	const pages: T[][][] = [];
	for (let start = 0; start < prizes.length; start += layout.grid.perPage) {
		const pagePrizes = prizes.slice(start, start + layout.grid.perPage);
		const rows: T[][] = [];
		for (let rowStart = 0; rowStart < pagePrizes.length; rowStart += layout.grid.columns) {
			rows.push(pagePrizes.slice(rowStart, rowStart + layout.grid.columns));
		}
		pages.push(rows);
	}
	return pages;
}
