import type { TGetPreparationStationsOutput } from "@/app/api/preparation-stations/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export type TPreparationStationListItem = NonNullable<TGetPreparationStationsOutput["data"]["default"]>[number];
export type TPreparationStationById = NonNullable<TGetPreparationStationsOutput["data"]["byId"]>;

async function fetchPreparationStations() {
	const { data } = await axios.get<TGetPreparationStationsOutput>("/api/preparation-stations");
	const result = data.data.default;
	if (!result) throw new Error("Estações de preparo não encontradas.");
	return result;
}

// Constante de módulo: a lista alimenta a seção de configurações e os chips do card de impressora,
// e quem invalida precisa da mesma identidade.
export const PREPARATION_STATIONS_QUERY_KEY = ["preparation-stations"] as const;

export function usePreparationStations({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({ queryKey: PREPARATION_STATIONS_QUERY_KEY, queryFn: fetchPreparationStations, enabled }),
		queryKey: PREPARATION_STATIONS_QUERY_KEY,
	};
}

async function fetchPreparationStationById(id: string) {
	const { data } = await axios.get<TGetPreparationStationsOutput>(`/api/preparation-stations?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Estação de preparo não encontrada.");
	return result;
}

export function usePreparationStationById({ stationId }: { stationId: string }) {
	const queryKey = ["preparation-station-by-id", stationId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchPreparationStationById(stationId) }),
		queryKey,
	};
}
