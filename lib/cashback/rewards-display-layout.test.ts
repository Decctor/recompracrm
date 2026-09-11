import assert from "node:assert/strict";
import test from "node:test";
import {
	REWARDS_PAPER_ORIENTATIONS,
	REWARDS_PAPER_SIZES,
	describeRewardsDisplayLayout,
	measureCashbackValueAdvance,
	measureWidestCashbackValue,
	paginateRewards,
	resolveRewardsDisplayLayout,
	splitCashbackValue,
} from "./rewards-display-layout";

const MONEY_ADVANCE = measureWidestCashbackValue([30, 250, 1250], "DINHEIRO");

function resolve(size: (typeof REWARDS_PAPER_SIZES)[number], orientation: (typeof REWARDS_PAPER_ORIENTATIONS)[number], prizeCount: number) {
	return resolveRewardsDisplayLayout({ size, orientation, prizeCount, valueAdvanceEm: MONEY_ADVANCE });
}

test("splits money into the parts the price tag composes at different sizes", () => {
	assert.deepEqual(splitCashbackValue(1250, "DINHEIRO"), { prefix: "R$", amount: "1.250", cents: "00", suffix: null });
	assert.deepEqual(splitCashbackValue(30.5, "DINHEIRO"), { prefix: "R$", amount: "30", cents: "50", suffix: null });
});

test("points carry a suffix instead of a prefix, and singular when the value is one", () => {
	assert.deepEqual(splitCashbackValue(1200, "PONTOS"), { prefix: null, amount: "1.200", cents: null, suffix: "pontos" });
	assert.equal(splitCashbackValue(1, "PONTOS").suffix, "ponto");
});

test("a points program needs a wider value column than a money program", () => {
	assert.ok(measureWidestCashbackValue([12500], "PONTOS") > measureWidestCashbackValue([1250], "DINHEIRO"));
});

test("the value column grows with the number of digits", () => {
	const small = measureCashbackValueAdvance(splitCashbackValue(30, "DINHEIRO"));
	const large = measureCashbackValueAdvance(splitCashbackValue(12500, "DINHEIRO"));
	assert.ok(large > small);
});

test("a single reward takes the whole sheet as a showcase", () => {
	const layout = resolve("A4", "portrait", 1);
	assert.equal(layout.grid.pages, 1);
	assert.equal(layout.grid.columns, 1);
	assert.equal(layout.grid.rows, 1);
	assert.equal(layout.composition, "showcase");
	assert.equal(describeRewardsDisplayLayout(layout), "peça única · vitrine · 1 folha");
});

test("the typical range (9 to 20 rewards) fits one comfortable sheet on every A4 and A5 setup", () => {
	for (const size of ["A4", "A5"] as const) {
		for (const orientation of REWARDS_PAPER_ORIENTATIONS) {
			for (const count of [9, 12, 16, 20]) {
				const layout = resolve(size, orientation, count);
				assert.equal(layout.grid.pages, 1, `${size} ${orientation} ${count} deveria caber em uma folha`);
				assert.equal(layout.legibility, "comfortable", `${size} ${orientation} ${count} deveria ficar confortável`);
			}
		}
	}
});

test("shrinking comes before paginating: an A6 only splits once the floor is reached", () => {
	assert.equal(resolve("A6", "portrait", 16).grid.pages, 1);
	assert.ok(resolve("A6", "portrait", 60).grid.pages > 1);
});

test("more rewards never means fewer sheets", () => {
	let previousPages = 0;
	for (let count = 1; count <= 60; count++) {
		const pages = resolve("A6", "portrait", count).grid.pages;
		assert.ok(pages >= previousPages, `${count} recompensas deveria precisar de pelo menos ${previousPages} folhas`);
		previousPages = pages;
	}
});

test("no arrangement ever breaks the legibility floor", () => {
	for (const size of REWARDS_PAPER_SIZES) {
		for (const orientation of REWARDS_PAPER_ORIENTATIONS) {
			for (let count = 1; count <= 60; count++) {
				const layout = resolve(size, orientation, count);
				assert.ok(layout.type.title >= 2.3, `${size} ${orientation} ${count}: título de ${layout.type.title.toFixed(2)}mm`);
				assert.ok(layout.type.value > layout.type.title, "o valor é o herói do cardápio e nunca fica menor que o título");
			}
		}
	}
});

test("the grid always holds every reward, and never claims more sheets than it needs", () => {
	for (const size of REWARDS_PAPER_SIZES) {
		for (const orientation of REWARDS_PAPER_ORIENTATIONS) {
			for (let count = 1; count <= 60; count++) {
				const { grid } = resolve(size, orientation, count);
				assert.ok(grid.columns * grid.rows >= grid.perPage, "a grade da folha precisa comportar a cota da folha");
				assert.ok(grid.perPage * grid.pages >= count, "as folhas precisam comportar todas as recompensas");
				assert.ok(grid.perPage * (grid.pages - 1) < count, "a última folha nunca sai vazia");
			}
		}
	}
});

test("the arrangement never overflows the printable area", () => {
	for (const size of REWARDS_PAPER_SIZES) {
		for (const orientation of REWARDS_PAPER_ORIENTATIONS) {
			for (let count = 1; count <= 60; count++) {
				const layout = resolve(size, orientation, count);
				const { columns, rows, gap } = layout.grid;
				const usedWidth = layout.cell.width * columns + gap * (columns - 1);
				const usedHeight = layout.cell.height * rows + gap * (rows - 1);
				assert.ok(usedWidth <= layout.content.width + 0.001, `${size} ${orientation} ${count}: estoura a largura`);
				assert.ok(usedHeight <= layout.content.height + 0.001, `${size} ${orientation} ${count}: estoura a altura`);
				assert.ok(layout.media.height <= layout.cell.height, "a mídia não pode passar da célula");
			}
		}
	}
});

test("a wider value column can cost a column in the grid", () => {
	const money = resolveRewardsDisplayLayout({
		size: "A5",
		orientation: "landscape",
		prizeCount: 16,
		valueAdvanceEm: measureWidestCashbackValue([50], "DINHEIRO"),
	});
	const points = resolveRewardsDisplayLayout({
		size: "A5",
		orientation: "landscape",
		prizeCount: 16,
		valueAdvanceEm: measureWidestCashbackValue([125000], "PONTOS"),
	});
	assert.ok(points.grid.columns <= money.grid.columns);
});

test("pagination fills sheets in order and lets the last row run short", () => {
	const prizes = Array.from({ length: 10 }, (_, index) => index);
	const layout = resolve("A4", "portrait", prizes.length);
	const pages = paginateRewards(prizes, layout);
	assert.equal(pages.length, layout.grid.pages);
	assert.deepEqual(pages.flat().flat(), prizes, "as recompensas precisam sair na ordem em que chegaram — a consulta já as ordena por valor");
	for (const rows of pages) {
		for (const row of rows) assert.ok(row.length <= layout.grid.columns);
	}
});

/*
 * As constantes abaixo espelham `cashback-rewards-display.module.css`. A célula da vitrine é um
 * flex em coluna com `gap` uniforme e `overflow: hidden`, e a foto está ancorada no topo — então
 * qualquer milímetro que o modelo reserve a menos que o CSS desenha sai cortando a última linha.
 */
const CSS_TITLE_LINE_HEIGHT = 1.12;
const CSS_DESCRIPTION_LINE_HEIGHT = 1.25;
const CSS_DESCRIPTION_LINES = 2;
const CSS_META_LINE_HEIGHT = 1.2;
/** `.priceAmount` tem `line-height: 0.88` e é o filho mais alto de `.price`. */
const CSS_PRICE_LINE_HEIGHT = 0.88;

test("the showcase stack fits the cell exactly as the CSS renders it", () => {
	for (const size of REWARDS_PAPER_SIZES) {
		for (const orientation of REWARDS_PAPER_ORIENTATIONS) {
			for (let count = 1; count <= 60; count++) {
				const layout = resolve(size, orientation, count);
				if (layout.composition !== "showcase") continue;

				const children = 2 + (layout.show.description ? 1 : 0) + (layout.show.requirement ? 1 : 0);
				const stack =
					layout.media.height +
					layout.titleLines * layout.type.title * CSS_TITLE_LINE_HEIGHT +
					(layout.show.description ? layout.type.description * CSS_DESCRIPTION_LINE_HEIGHT * CSS_DESCRIPTION_LINES : 0) +
					layout.type.value * CSS_PRICE_LINE_HEIGHT +
					(layout.show.requirement ? layout.type.meta * CSS_META_LINE_HEIGHT : 0) +
					(children - 1) * layout.gap;
				const inner = layout.cell.height - layout.padding.y * 2;

				assert.ok(stack <= inner + 0.001, `${size} ${orientation} ${count}: pilha de ${stack.toFixed(2)}mm numa célula de ${inner.toFixed(2)}mm`);
			}
		}
	}
});
