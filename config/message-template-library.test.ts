import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	MESSAGE_TEMPLATE_LIBRARY,
	ONBOARDING_MESSAGE_TEMPLATE_KEYS,
	ONBOARDING_MESSAGE_TEMPLATES,
	getMessageTemplateLibraryEntries,
} from "@/config/message-template-library";
import { validateTemplateForTrigger } from "@/lib/message-templates/variables";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";

describe("MESSAGE_TEMPLATE_LIBRARY", () => {
	it("cobre todos os 13 gatilhos com pelo menos um modelo canônico", () => {
		const covered = new Set(MESSAGE_TEMPLATE_LIBRARY.flatMap((definition) => definition.intendedTriggers));
		const allTriggers: TCampaignTriggerTypeEnum[] = [
			"NOVA-COMPRA",
			"PRIMEIRA-COMPRA",
			"PERMANÊNCIA-SEGMENTAÇÃO",
			"ENTRADA-SEGMENTAÇÃO",
			"CASHBACK-ACUMULADO",
			"CASHBACK-EXPIRANDO",
			"ANIVERSARIO_CLIENTE",
			"QUANTIDADE-TOTAL-COMPRAS",
			"VALOR-TOTAL-COMPRAS",
			"RECORRENTE",
			"PIOR-DIA-VENDAS",
			"USO-UNICO",
			"PROMOCAO-PRODUTOS",
		];

		for (const trigger of allTriggers) {
			assert.ok(covered.has(trigger), `gatilho sem modelo na biblioteca: ${trigger}`);
		}
	});

	it("mantém o subset de onboarding com exatamente as 5 keys congeladas", () => {
		assert.deepEqual(
			ONBOARDING_MESSAGE_TEMPLATES.map((template) => template.key).toSorted(),
			[...ONBOARDING_MESSAGE_TEMPLATE_KEYS].toSorted(),
		);
		assert.equal(ONBOARDING_MESSAGE_TEMPLATES.length, 5);
	});

	it("garante que cada variável do corpo é permitida em todos os intendedTriggers", () => {
		for (const definition of MESSAGE_TEMPLATE_LIBRARY) {
			for (const variant of ["COM_CASHBACK", "SEM_CASHBACK"] as const) {
				const body = definition.bodies[variant];
				if (!body) continue;

				for (const trigger of definition.intendedTriggers) {
					const validation = validateTemplateForTrigger(
						body.variables.map((variable) => ({ identificador: variable })),
						trigger,
					);
					assert.equal(
						validation.valid,
						true,
						`${definition.key}/${variant} em ${trigger}: variáveis incompatíveis → ${validation.incompatibleVariables.join(", ")}`,
					);
				}
			}
		}
	});

	it("omite cashbackOnly na variante SEM_CASHBACK e devolve intendedTriggers nas entradas", () => {
		const withCashback = getMessageTemplateLibraryEntries("COM_CASHBACK");
		const withoutCashback = getMessageTemplateLibraryEntries("SEM_CASHBACK");

		assert.ok(withCashback.some((entry) => entry.key === "cashback_expirando"));
		assert.ok(withCashback.some((entry) => entry.key === "cashback_acumulado"));
		assert.ok(!withoutCashback.some((entry) => entry.key === "cashback_expirando"));
		assert.ok(!withoutCashback.some((entry) => entry.key === "cashback_acumulado"));

		for (const entry of withCashback) {
			assert.ok(Array.isArray(entry.intendedTriggers) && entry.intendedTriggers.length > 0);
			assert.ok(entry.grupo);
		}
	});

	it("não vaza modelos genéricos (só clientName) para gatilhos fora de intendedTriggers", () => {
		const entries = getMessageTemplateLibraryEntries("SEM_CASHBACK");
		const firstPurchaseCompatible = entries.filter(
			(entry) =>
				entry.intendedTriggers.includes("PRIMEIRA-COMPRA") &&
				validateTemplateForTrigger(
					entry.variables.map((variable) => ({ identificador: variable })),
					"PRIMEIRA-COMPRA",
				).valid,
		);

		assert.deepEqual(
			firstPurchaseCompatible.map((entry) => entry.key).toSorted(),
			["primeira_compra", "primeira_compra_sugerido"].toSorted(),
		);
	});

	it("expõe cadências recorrentes, winback urgente e pós-compra com produto", () => {
		const keys = new Set(MESSAGE_TEMPLATE_LIBRARY.map((definition) => definition.key));
		for (const key of [
			"recorrente_meio_semana",
			"recorrente_comeco_mes",
			"reativacao_hibernando",
			"pos_compra_favorito",
			"primeira_compra_sugerido",
		] as const) {
			assert.ok(keys.has(key), `modelo ausente: ${key}`);
		}

		const recorrente = MESSAGE_TEMPLATE_LIBRARY.filter((definition) => definition.intendedTriggers.includes("RECORRENTE"));
		assert.equal(recorrente.length, 3);

		const entrada = MESSAGE_TEMPLATE_LIBRARY.filter((definition) => definition.intendedTriggers.includes("ENTRADA-SEGMENTAÇÃO"));
		assert.ok(entrada.some((definition) => definition.key === "reativacao_hibernando"));
	});
});
