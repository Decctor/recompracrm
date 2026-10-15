import { db } from "@/services/drizzle";
import { preparationStationRules, preparationStations } from "@/services/drizzle/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { TPreparationStationInput, TPreparationStationRuleInput } from "./preparation-stations";

// Leitura das estações de preparo + regras da organização, no formato que o resolver puro
// (lib/sales/preparation-stations.ts) consome. Compartilhada pelos builders do TICKET_PREPARO
// (auto-print e reimpressão manual) e por quem mais precisar do mesmo recorte.

export type TLoadedPreparationStation = TPreparationStationInput & { nome: string };

export async function loadPreparationStationsForOrganization({
	organizacaoId,
	activeOnly = true,
}: {
	organizacaoId: string;
	activeOnly?: boolean;
}): Promise<{ stations: TLoadedPreparationStation[]; rules: TPreparationStationRuleInput[] }> {
	const stations = await db.query.preparationStations.findMany({
		where: and(eq(preparationStations.organizacaoId, organizacaoId), activeOnly ? eq(preparationStations.ativa, true) : undefined),
		columns: { id: true, nome: true, ordem: true, ativa: true, padrao: true, escopoTicket: true },
		orderBy: [asc(preparationStations.ordem), asc(preparationStations.dataInsercao)],
	});
	// Org sem estação (a maioria): uma query só, nenhuma ida às regras.
	if (stations.length === 0) return { stations: [], rules: [] };

	const rules = await db.query.preparationStationRules.findMany({
		where: and(
			eq(preparationStationRules.organizacaoId, organizacaoId),
			inArray(
				preparationStationRules.estacaoId,
				stations.map((station) => station.id),
			),
		),
		columns: { estacaoId: true, valor: true },
	});

	return { stations, rules };
}
