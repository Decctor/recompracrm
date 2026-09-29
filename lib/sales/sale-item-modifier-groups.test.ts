import assert from "node:assert/strict";
import test from "node:test";
import { formatModifierGroupName, groupSaleItemModifiers } from "./sale-item-modifier-groups";

test("remove o ':' final e espaços do nome do grupo", () => {
	assert.equal(formatModifierGroupName("Escolha seu gelato:"), "Escolha seu gelato");
	assert.equal(formatModifierGroupName("  Borda :: "), "Borda");
	assert.equal(formatModifierGroupName("   "), null);
	assert.equal(formatModifierGroupName(null), null);
});

test("agrupa na ordem de aparição e deixa os adicionais sem grupo por último", () => {
	const modifiers = [
		{ nome: "Colher extra", grupo: null },
		{ nome: "Nutella", grupo: "Escolha até 3 adicionais:" },
		{ nome: "Pistache", grupo: "Escolha seu gelato:" },
		{ nome: "Morango", grupo: "Escolha até 3 adicionais" },
	];
	const groups = groupSaleItemModifiers(modifiers, (modifier) => modifier.grupo);
	assert.deepEqual(
		groups.map((group) => [group.grupo, group.adicionais.map((modifier) => modifier.nome)]),
		[
			["Escolha até 3 adicionais", ["Nutella", "Morango"]],
			["Escolha seu gelato", ["Pistache"]],
			[null, ["Colher extra"]],
		],
	);
});
