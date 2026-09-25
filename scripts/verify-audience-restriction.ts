import "dotenv/config";
import { resolveCampaignAudienceClientIdsForCampaign } from "@/lib/campaigns/filters";
import { connection, db } from "@/services/drizzle";
import { campaigns, clients } from "@/services/drizzle/schema";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

/**
 * Prova, contra o banco real, que restringir a resolução de audiência a um conjunto de clientes
 * (`restrictToClientIds`) devolve exatamente `audiência completa ∩ restrição`.
 *
 * Para cada campanha ativa: resolve a audiência completa (caminho antigo), sorteia uma amostra de
 * clientes da organização — metade dentro, metade fora da audiência — e resolve de novo restrita à
 * amostra. Qualquer divergência de pertencimento é um erro. Somente leitura.
 *
 * Uso:
 *   npx tsx scripts/verify-audience-restriction.ts [--org <id>] [--sample 60]
 */

function readFlag(name: string): string | null {
	const index = process.argv.indexOf(`--${name}`);
	if (index === -1) return null;
	const value = process.argv[index + 1];
	return value && !value.startsWith("--") ? value : null;
}

function sample<T>(values: T[], size: number) {
	const copy = [...values];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap], copy[index]];
	}
	return copy.slice(0, size);
}

async function main() {
	const organizationId = readFlag("org");
	const sampleSize = Number(readFlag("sample") ?? 60);
	const half = Math.max(1, Math.floor(sampleSize / 2));

	const activeCampaigns = await db.query.campaigns.findMany({
		where: organizationId ? and(eq(campaigns.ativo, true), eq(campaigns.organizacaoId, organizationId)) : eq(campaigns.ativo, true),
		columns: { id: true, titulo: true, organizacaoId: true, filtros: true },
		with: { segmentacoes: true },
	});
	console.log(`[VERIFY] ${activeCampaigns.length} campanha(s) ativa(s).`);

	let checked = 0;
	let mismatches = 0;

	for (const campaign of activeCampaigns) {
		if (!campaign.organizacaoId) continue;
		const organizacaoId = campaign.organizacaoId;
		const fullAudience = new Set(await resolveCampaignAudienceClientIdsForCampaign({ organizationId: organizacaoId, campaign }));
		const insideIds = sample(Array.from(fullAudience), half);
		const outsideRows =
			fullAudience.size > 0
				? await db
						.select({ id: clients.id })
						.from(clients)
						.where(and(eq(clients.organizacaoId, organizacaoId), notInArray(clients.id, Array.from(fullAudience))))
						.orderBy(sql`random()`)
						.limit(half)
				: await db
						.select({ id: clients.id })
						.from(clients)
						.where(eq(clients.organizacaoId, organizacaoId))
						.orderBy(sql`random()`)
						.limit(half);
		const restriction = [...insideIds, ...outsideRows.map((row) => row.id)];
		if (restriction.length === 0) continue;

		const restricted = new Set(
			await resolveCampaignAudienceClientIdsForCampaign({ organizationId: organizacaoId, campaign, restrictToClientIds: restriction }),
		);

		// Sanidade: nada fora da restrição pode vazar para o resultado restrito.
		const leaked = Array.from(restricted).filter((id) => !restriction.includes(id));
		const diverged = restriction.filter((id) => fullAudience.has(id) !== restricted.has(id));
		checked += restriction.length;

		if (leaked.length > 0 || diverged.length > 0) {
			mismatches += leaked.length + diverged.length;
			console.error(`[MISMATCH] ${campaign.titulo} (${campaign.id}) org=${organizacaoId}`, {
				fullAudience: fullAudience.size,
				sampled: restriction.length,
				leaked,
				diverged: diverged.map((id) => ({ id, full: fullAudience.has(id), restricted: restricted.has(id) })),
			});
		} else {
			console.log(
				`[OK] ${campaign.titulo} — audiência ${fullAudience.size}, amostra ${restriction.length} (${insideIds.length} dentro / ${outsideRows.length} fora).`,
			);
		}

		// Garante que a amostra é realmente da organização (a restrição nunca deve cruzar tenants).
		const foreign = await db
			.select({ id: clients.id })
			.from(clients)
			.where(and(inArray(clients.id, restriction), sql`${clients.organizacaoId} <> ${organizacaoId}`));
		if (foreign.length > 0) throw new Error(`Amostra contém clientes de outra organização: ${foreign.map((row) => row.id).join(", ")}`);
	}

	console.log(`[VERIFY] ${checked} pertencimento(s) comparado(s), ${mismatches} divergência(s).`);
	await connection.end();
	if (mismatches > 0) process.exit(1);
}

main().catch(async (error) => {
	console.error(error);
	await connection.end();
	process.exit(1);
});
