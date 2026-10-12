import assert from "node:assert/strict";
import test from "node:test";
import { layoutServiceCardFront, PT_PER_MM, qrModulesToSvgPath, SERVICE_CARD_SAFE_MM } from "./service-card-print-layout";

const safe = SERVICE_CARD_SAFE_MM * PT_PER_MM;

function insideSafeArea(layout: ReturnType<typeof layoutServiceCardFront>, rect: { x: number; y: number; width: number; height: number }) {
	const trim = layout.trimBox;
	const eps = 1e-6;
	return (
		rect.x >= trim.x + safe - eps &&
		rect.y >= trim.y + safe - eps &&
		rect.x + rect.width <= trim.x + trim.width - safe + eps &&
		rect.y + rect.height <= trim.y + trim.height - safe + eps
	);
}

test("page is the CR80 card plus 3mm bleed on each side", () => {
	const layout = layoutServiceCardFront({ qrModuleCount: 41, numberWidthAt1pt: 1.5 });
	assert.ok(Math.abs(layout.page.width - 91.6 * PT_PER_MM) < 1e-6);
	assert.ok(Math.abs(layout.page.height - 60 * PT_PER_MM) < 1e-6);
	assert.ok(Math.abs(layout.trimBox.x - 3 * PT_PER_MM) < 1e-6);
});

test("QR keeps a quiet zone inside the safe area and stays above 20mm", () => {
	for (const modules of [25, 41, 57]) {
		const layout = layoutServiceCardFront({ qrModuleCount: modules, numberWidthAt1pt: 1.5 });
		const quiet = layout.qr.moduleSize * 4;
		assert.ok(
			insideSafeArea(layout, {
				x: layout.qr.x - quiet,
				y: layout.qr.y - quiet,
				width: layout.qr.width + quiet * 2,
				height: layout.qr.height + quiet * 2,
			}),
		);
		assert.ok(layout.qr.width >= 20 * PT_PER_MM, `QR com ${modules} modulos ficou menor que 20mm`);
	}
});

test("long numbers shrink to fit the text column, short ones hit the cap", () => {
	const short = layoutServiceCardFront({ qrModuleCount: 41, numberWidthAt1pt: 1.5 });
	assert.equal(short.number.size, 40);
	const long = layoutServiceCardFront({ qrModuleCount: 41, numberWidthAt1pt: 12 });
	assert.ok(long.number.x + long.number.size * 12 <= long.qr.x);
});

test("logo keeps aspect ratio inside the safe area", () => {
	const layout = layoutServiceCardFront({ qrModuleCount: 41, numberWidthAt1pt: 1.5, logo: { width: 1000, height: 200 } });
	assert.ok(layout.logo);
	assert.ok(Math.abs(layout.logo.width / layout.logo.height - 5) < 1e-6);
	assert.ok(insideSafeArea(layout, layout.logo));
	assert.ok(layout.logo.x + layout.logo.width <= layout.qr.x);
});

test("qrModulesToSvgPath merges horizontal runs", () => {
	const grid = [
		[1, 1, 0],
		[0, 1, 1],
		[0, 0, 0],
	];
	assert.equal(
		qrModulesToSvgPath(3, (row, col) => grid[row][col] === 1),
		"M0 0h2v1h-2zM1 1h2v1h-2z",
	);
});
