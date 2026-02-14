import { formatPhoneAsBase } from "@/lib/formatting";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import axios from "axios";
import { eq } from "drizzle-orm";
import z from "zod";

const TARGET_ORGANIZATION_ID = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
const TARGET_COMPANY_ID = "11697";
const TARGET_AUTHORIZATION_TOKEN =
	"eyJ0eXAiOiJKV1QiLCJraWQiOiI0YmczNmZvVyIsImFsZyI6IlJTMjU2In0.eyJpc3MiOiJDYXJkw6FwaW8gV2ViIiwiYXVkIjpbImNvcmUiLCJpZm9vZCIsInphcHphcCIsImN3YWkiXSwiYXV0aGVudGljYXRpb25faGFzaCI6IjRhMjkxZjMwNDI4NzZlMjllY2NjIiwiY29tcGFueV9pZHMiOlsxMTY5N10sInR5cGUiOiJhY2Nlc3MiLCJlbWFpbCI6ImNvbmdlbGF0dGUuZmluYW5jZWlyb0BnbWFpbC5jb20iLCJqdGkiOiJmOGMzYjg0Zi1hNTA3LTRiZjQtYmEwZS0wYzlmNjYxZTgwOTciLCJpYXQiOjE3NzEwMTU0ODEsImV4cCI6MTc3MTA0NDI4MX0.RGYTNdBRrQ7vCNYRYJSVCEuUjoiABVN4ecAx9DhY0NX8v1-P0XDkfz9_9oi5ofolpb0LmIMU2pGjKucRohe5AA8SF1oNYI4ZRcPqLO86NMbJ2cXEvOQ-JX6ns3uI4ZCRYp4TWsf80Y-A2QDK6Q70TCihpSqkNoW1geelr6C1r5vs79MFukFKX50aO8xYypQKVKITYKjigmpl0HEK9Jgm5h4csGIRfnx8k3SxBT8NLt7HnJrJLAZZ03eOs3160AXu4k_aH-VPjTox9HvNa3mBQwCLDd04lkYgYVEJggCB-W95IzSaI40F4RYrZmniHEe76vKlRh2OPaYjgcdIf0-cmQ";
const PER_PAGE = 50;

const CardapioWebPortalClientSchema = z.object({
	id: z.number(),
	name: z.string(),
	telephone: z.string().nullable().optional(),
});

type TCardapioWebPortalClient = z.infer<typeof CardapioWebPortalClientSchema>;

async function fetchCardapioWebPortalClientsPage(page: number): Promise<TCardapioWebPortalClient[]> {
	const { data } = await axios.get("https://api.cardapioweb.com/api/v2/company/clients", {
		params: {
			page,
			per_page: PER_PAGE,
			order: "desc",
			order_by: "orders_count",
		},
		headers: {
			authorization: TARGET_AUTHORIZATION_TOKEN,
			companyid: TARGET_COMPANY_ID,
		},
	});

	return z.array(CardapioWebPortalClientSchema).parse(data);
}

export async function syncCardapioWebClientIds() {
	const org = await db.query.organizations.findFirst({
		where: (fields, { eq: equals }) => equals(fields.id, TARGET_ORGANIZATION_ID),
	});

	if (!org) {
		throw new Error(`Organization not found: ${TARGET_ORGANIZATION_ID}`);
	}

	const allOrgClients = await db.query.clients.findMany({
		where: (fields, { eq: equals }) => equals(fields.organizacaoId, org.id),
		columns: {
			id: true,
			nome: true,
			telefone: true,
			telefoneBase: true,
			idExterno: true,
		},
	});

	const orgClientsByPhone = new Map(allOrgClients.filter((c) => !!c.telefoneBase).map((c) => [c.telefoneBase, c]));

	let page = 1;
	const allPortalClients: TCardapioWebPortalClient[] = [];

	while (true) {
		const pageClients = await fetchCardapioWebPortalClientsPage(page);
		console.log(`[SYNC-CARDAPIO-WEB-CLIENT-IDS] Loaded page ${page} with ${pageClients.length} clients`);

		if (pageClients.length === 0) break;

		allPortalClients.push(...pageClients);
		if (pageClients.length < PER_PAGE) break;
		page++;
	}

	let matchedByPhone = 0;
	let updatedCount = 0;
	let skippedNoPhone = 0;
	let skippedNoMatch = 0;
	let skippedAlreadySynced = 0;

	for (const portalClient of allPortalClients) {
		if (!portalClient.telephone) {
			skippedNoPhone++;
			continue;
		}

		const basePhone = formatPhoneAsBase(portalClient.telephone);
		if (!basePhone) {
			skippedNoPhone++;
			continue;
		}

		const dbClient = orgClientsByPhone.get(basePhone);
		if (!dbClient) {
			skippedNoMatch++;
			continue;
		}

		matchedByPhone++;
		const externalId = portalClient.id.toString();

		if (dbClient.idExterno === externalId) {
			skippedAlreadySynced++;
			continue;
		}

		console.log("[SYNC-CARDAPIO-WEB-CLIENT-IDS] Updating client:", {
			dbClientName: dbClient.nome,
			dbClientPhone: dbClient.telefone,
			portalClientName: portalClient.name,
			portalClientPhone: portalClient.telephone,
			portalClientExternalId: portalClient.id,
		});

		await db
			.update(clients)
			.set({
				idExterno: externalId,
			})
			.where(eq(clients.id, dbClient.id));

		updatedCount++;
	}

	const result = {
		message: "Clients sync completed successfully",
		organizationId: org.id,
		companyId: TARGET_COMPANY_ID,
		stats: {
			portalClientsLoaded: allPortalClients.length,
			dbClientsLoaded: allOrgClients.length,
			matchedByPhone,
			updatedCount,
			skippedNoPhone,
			skippedNoMatch,
			skippedAlreadySynced,
		},
	};

	console.log("[SYNC-CARDAPIO-WEB-CLIENT-IDS] Done:", result);
	return result;
}

void syncCardapioWebClientIds()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error("[SYNC-CARDAPIO-WEB-CLIENT-IDS] Error:", error);
		process.exit(1);
	});
