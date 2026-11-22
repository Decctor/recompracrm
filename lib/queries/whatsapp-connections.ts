import type { TGetWhatsappConnectionTestOutput } from "@/app/api/whatsapp-connections/connection-test/route";
import type { TGetWhatsappChannelStatusOutput } from "@/app/api/whatsapp-connections/channel-status/route";
import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchWhatsappConnection() {
	try {
		const { data } = await axios.get<TGetWhatsappConnectionsOutput>("/api/whatsapp-connections");
		return data.data;
	} catch (error) {
		console.error("Error fetching whatsapp connection", error);
		throw error;
	}
}

export function useWhatsappConnections() {
	return {
		...useQuery({
			queryKey: ["whatsapp-connection"],
			queryFn: fetchWhatsappConnection,
		}),
		queryKey: ["whatsapp-connection"],
	};
}

async function fetchWhatsappConnectionTest(telefoneId: string) {
	const params = new URLSearchParams({ telefoneId });
	const { data } = await axios.get<TGetWhatsappConnectionTestOutput>(`/api/whatsapp-connections/connection-test?${params.toString()}`);
	return data.data.teste;
}

/**
 * Estado da mensagem de teste de um número. Enquanto o modelo de teste está em revisão na Meta ou
 * a mensagem foi enviada e espera a entrega, consulta de novo a cada 20 s.
 */
export function useWhatsappConnectionTest({ telefoneId, enabled = true }: { telefoneId: string | null; enabled?: boolean }) {
	const queryKey = ["whatsapp-connection-test", telefoneId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchWhatsappConnectionTest(telefoneId as string),
			enabled: enabled && !!telefoneId,
			refetchInterval: (query) => {
				const status = query.state.data?.status;
				return status === "AGUARDANDO_MODELO" || status === "ENVIADO" ? 20_000 : false;
			},
		}),
		queryKey,
	};
}

async function fetchWhatsappChannelStatus() {
	const { data } = await axios.get<TGetWhatsappChannelStatusOutput>("/api/whatsapp-connections/channel-status");
	return data.data;
}

/** Os cinco passos do canal de cada número oficial, mais o destino sugerido para o teste. */
export function useWhatsappChannelStatus({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["whatsapp-channel-status"];
	return {
		...useQuery({ queryKey, queryFn: fetchWhatsappChannelStatus, enabled }),
		queryKey,
	};
}
