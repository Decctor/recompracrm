import {
	buildMessageTemplateLibraryContent,
	ONBOARDING_MESSAGE_TEMPLATES,
	ONBOARDING_MESSAGE_TEMPLATES_BY_KEY,
	type TOnboardingMessageTemplateDefinition,
	type TOnboardingMessageTemplateKey,
	type TOnboardingTemplateVariant,
} from "@/config/message-template-library";
import type { DBTransaction } from "@/services/drizzle";
import { messageTemplates } from "@/services/drizzle/schema";
import { sql } from "drizzle-orm";

/**
 * Onboarding message-template seeding.
 *
 * Historically the default campaigns referenced hardcoded template UUIDs that were never actually
 * seeded as per-org rows. The catalog in `config/message-template-library.ts` fixes that gap; this
 * module is the SERVER half that materializes it as real `messageTemplates` rows. The catalog lives
 * apart because the campaign builder's template library renders it in the browser, and importing
 * this file there would drag the drizzle schema into the client bundle.
 */
export type { TOnboardingMessageTemplateKey, TOnboardingTemplateVariant };
export { getOnboardingMessageTemplateName, getOnboardingTemplatePreview } from "@/config/message-template-library";

/**
 * Upserts the requested onboarding templates as per-org `messageTemplates` rows (idempotent on the
 * unique (organizacaoId, nome) index) and returns a `key -> templateId` map for the campaigns to
 * reference. Re-running with a different variant refreshes the body content.
 */
export async function seedOnboardingMessageTemplates({
	tx,
	organizationId,
	autorId,
	variant,
	keys,
}: {
	tx: DBTransaction;
	organizationId: string;
	autorId: string;
	variant: TOnboardingTemplateVariant;
	keys: TOnboardingMessageTemplateKey[];
}): Promise<Map<TOnboardingMessageTemplateKey, string>> {
	const definitions = keys
		.map((key) => ONBOARDING_MESSAGE_TEMPLATES_BY_KEY.get(key))
		.filter((definition): definition is TOnboardingMessageTemplateDefinition => {
			if (!definition) return false;
			// cashbackOnly templates have no SEM_CASHBACK body — skip them in that variant.
			return definition.bodies[variant] !== null;
		});

	const map = new Map<TOnboardingMessageTemplateKey, string>();
	if (definitions.length === 0) return map;

	const rows = definitions.map((definition) => {
		const body = definition.bodies[variant];
		if (!body) throw new Error(`Template ${definition.key} sem corpo para a variante ${variant}.`);
		return {
			organizacaoId: organizationId,
			autorId,
			nome: definition.nome,
			status: "RASCUNHO" as const,
			categoria: "MARKETING" as const,
			linguagem: "pt_BR",
			metadados: { porNumeroTelefone: {} },
			conteudo: buildMessageTemplateLibraryContent(body),
		};
	});

	const upserted = await tx
		.insert(messageTemplates)
		.values(rows)
		.onConflictDoUpdate({
			target: [messageTemplates.organizacaoId, messageTemplates.nome],
			set: { conteudo: sql.raw("excluded.conteudo"), dataAtualizacao: new Date() },
		})
		.returning({ id: messageTemplates.id, nome: messageTemplates.nome });

	const idByNome = new Map(upserted.map((row) => [row.nome, row.id]));
	for (const definition of definitions) {
		const id = idByNome.get(definition.nome);
		if (id) map.set(definition.key, id);
	}
	return map;
}

/** Re-exportado para consumidores server-side que já importavam o catálogo daqui. */
export { ONBOARDING_MESSAGE_TEMPLATES };
