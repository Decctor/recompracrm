import "dotenv/config";
import { listAllAgentTools } from "@/lib/agent-tools/registry";
import { readResourceForActor, CURRENT_ORGANIZATION_RESOURCE_URI } from "@/lib/agent-tools/resources";
import type { TAgentActorContext } from "@/lib/agent-tools/types";
import { connection, db } from "@/services/drizzle";
import { clients, campaigns, organizations } from "@/services/drizzle/schema";
import { eq, or } from "drizzle-orm";

/**
 * Executa cada ferramenta do agente contra o banco real.
 *
 * Os testes de `npm run test:agent-tools` cobrem tenancy, filtragem e protocolo sem tocar o banco;
 * o que eles não cobrem é se a consulta de cada ferramenta roda — coluna que não existe, join
 * errado, agregação que estoura. É essa lacuna que este script fecha, e é o passo obrigatório
 * antes de apontar um cliente MCP para um ambiente novo.
 *
 * Uso:
 *   npm run test:agent-tools:db -- --org minha-loja
 *   npm run test:agent-tools:db -- --org minha-loja --plataforma
 *
 * Somente leitura: nenhuma ferramenta desta fase escreve.
 */

function readFlag(name: string): string | null {
	const index = process.argv.indexOf(`--${name}`);
	if (index === -1) return null;
	const value = process.argv[index + 1];
	return value && !value.startsWith("--") ? value : null;
}

const ALL_SCOPES = new Set([
	"agent:results:read",
	"agent:sales:read",
	"agent:finances:read",
	"agent:clients:read",
	"agent:clients:pii",
	"agent:products:read",
	"agent:campaigns:read",
	"platform:organizations:read",
	"platform:metrics:read",
]);

function truncate(value: unknown, max = 220) {
	const text = JSON.stringify(value);
	if (!text) return "(vazio)";
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function main() {
	const orgReference = readFlag("org");
	const asPlatform = process.argv.includes("--plataforma");
	if (!orgReference) throw new Error("Informe --org <id|slug> da organização usada como amostra.");

	const organization = await db.query.organizations.findFirst({
		where: or(eq(organizations.id, orgReference), eq(organizations.slug, orgReference)),
		columns: { id: true, nome: true, slug: true },
	});
	if (!organization) throw new Error(`Organização não encontrada: ${orgReference}.`);

	const actor: TAgentActorContext = {
		mode: asPlatform ? "PLATAFORMA" : "ORG",
		principalId: "script-principal",
		credentialId: "script-credential",
		clientId: "script-client",
		clientCode: "SCRIPT",
		organizationId: asPlatform ? null : organization.id,
		responsibleUserId: null,
		scopes: ALL_SCOPES,
	};

	// Ids reais para as ferramentas que exigem um: sem eles metade da bateria não roda de verdade.
	const [sampleClient] = await db.query.clients.findMany({
		where: eq(clients.organizacaoId, organization.id),
		columns: { id: true },
		limit: 1,
	});
	const [sampleCampaign] = await db.query.campaigns.findMany({
		where: eq(campaigns.organizacaoId, organization.id),
		columns: { id: true },
		limit: 1,
	});

	const organizacaoId = asPlatform ? organization.slug : undefined;
	const argumentsByTool: Record<string, Record<string, unknown>> = {
		get_commercial_results: { organizacaoId },
		get_sales: { organizacaoId, limite: 3 },
		search_clients: { organizacaoId, limite: 3 },
		get_client_context: { organizacaoId, clienteId: sampleClient?.id },
		list_segments: { organizacaoId },
		search_products: { organizacaoId, limite: 3, canal: "POS" },
		get_product_performance: { organizacaoId, limite: 3 },
		list_campaigns: { organizacaoId, limite: 3 },
		get_campaign_results: { organizacaoId, campanhaId: sampleCampaign?.id },
		platform_search_organizations: { limite: 3 },
		platform_get_organization_health: { organizacaoId: organization.slug },
		platform_get_aggregate_metrics: {},
	};

	console.log(`\n[AGENTE] Organização: ${organization.nome} (${organization.slug}) — modo ${actor.mode}\n`);

	let executed = 0;
	let skipped = 0;
	let failed = 0;

	for (const tool of listAllAgentTools()) {
		if (!tool.modes.includes(actor.mode)) continue;
		if (tool.mutates) {
			console.log(`  ⊘ ${tool.name} — mutação omitida pelo smoke test de leitura`);
			skipped++;
			continue;
		}

		const rawArguments = argumentsByTool[tool.name] ?? {};
		// Falta de amostra não é falha da ferramenta — é falta de dado nesta organização.
		if (tool.name === "get_client_context" && !sampleClient) {
			console.log(`  ⊘ ${tool.name} — sem cliente nesta organização`);
			skipped++;
			continue;
		}
		if (tool.name === "get_campaign_results" && !sampleCampaign) {
			console.log(`  ⊘ ${tool.name} — sem campanha nesta organização`);
			skipped++;
			continue;
		}

		const startedAt = Date.now();
		try {
			const input = tool.inputSchema.parse(rawArguments);
			const result = await tool.execute(input as never, actor);
			console.log(`  ✓ ${tool.name} (${Date.now() - startedAt}ms) ${truncate(result)}`);
			executed++;
		} catch (error) {
			console.error(`  ✗ ${tool.name} — ${error instanceof Error ? error.message : String(error)}`);
			failed++;
		}
	}

	if (actor.mode === "ORG") {
		try {
			const resource = await readResourceForActor(actor, CURRENT_ORGANIZATION_RESOURCE_URI);
			console.log(`  ✓ resource ${CURRENT_ORGANIZATION_RESOURCE_URI} ${truncate(resource)}`);
			executed++;
		} catch (error) {
			console.error(`  ✗ resource ${CURRENT_ORGANIZATION_RESOURCE_URI} — ${error instanceof Error ? error.message : String(error)}`);
			failed++;
		}
	}

	console.log(`\n[AGENTE] ${executed} ok, ${skipped} pulados, ${failed} com falha.\n`);
	if (failed > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error("[AGENTE] Erro:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
