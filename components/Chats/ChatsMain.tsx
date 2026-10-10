"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import { getErrorMessage } from "@/lib/errors";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import type { ReactNode } from "react";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";

type ChatsMainProps = {
	children: (whatsappConnections: TGetWhatsappConnectionsOutput["data"]) => ReactNode;
};

/**
 * Portão comum das três páginas de Conversas (caixa de entrada, quadro, estatísticas): todas
 * dependem das conexões do canal, então o carregamento e o "sem conexão" ficam num lugar só.
 */
export default function ChatsMain({ children }: ChatsMainProps) {
	const { data: whatsappConnections, isPending, isError, error } = useWhatsappConnections();

	if (isPending) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (whatsappConnections.length === 0) return <ErrorComponent msg="Conexão do WhatsApp não encontrada." />;

	return children(whatsappConnections);
}
