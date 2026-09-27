"use client";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { isAxiosError } from "axios";
import { LinkIcon, Plug, RefreshCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { IfoodConnectMenu } from "../connect/IfoodConnectMenu";

type IfoodConnectionGateProps = {
	/** A organização tem ao menos uma conexão iFood ativa em `integrations`. */
	isConnected: boolean;
	/** Erro da query base (lojas). 401 → conexão expirada; 404 → não conectado. */
	error?: unknown;
	canManage: boolean;
	reconnectIntegrationId?: string | null;
	children: ReactNode;
};

/**
 * Gate de conexão do iFood: renderiza o conteúdo apenas quando a integração está conectada e
 * saudável. Caso contrário exibe o estado adequado (conectar / reconectar / erro) com o fluxo de
 * autorização embutido.
 */
export function IfoodConnectionGate({ isConnected, error, canManage, reconnectIntegrationId, children }: IfoodConnectionGateProps) {
	const [connectMenuIsOpen, setConnectMenuIsOpen] = useState(false);

	const errorStatus = isAxiosError(error) ? (error.response?.status ?? null) : null;
	const isExpired = errorStatus === 401;
	const isNotConnected = !isConnected || errorStatus === 404;

	if (isNotConnected || isExpired) {
		return (
			<>
				<div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EA1D2C]/10 text-[#EA1D2C]">
						{isExpired ? <RefreshCcw className="h-6 w-6" /> : <Plug className="h-6 w-6" />}
					</div>
					<div className="flex flex-col gap-1">
						<h2 className="text-base font-bold text-foreground">{isExpired ? "Conexão com o iFood expirada" : "Conecte sua loja iFood"}</h2>
						<p className="max-w-md text-sm text-muted-foreground">
							{isExpired
								? "As credenciais da integração expiraram ou foram revogadas. Reconecte para voltar a gerenciar sua loja."
								: "Conecte sua loja iFood para gerenciar status, horários de funcionamento e catálogo diretamente por aqui."}
						</p>
					</div>
					{canManage ? (
						<Button className="mt-2 bg-[#EA1D2C] text-white hover:bg-[#EA1D2C]/80" onClick={() => setConnectMenuIsOpen(true)}>
							<LinkIcon className="h-4 w-4" />
							{isExpired ? "RECONECTAR IFOOD" : "CONECTAR IFOOD"}
						</Button>
					) : (
						<p className="text-xs text-muted-foreground">Você não possui permissão para gerenciar integrações.</p>
					)}
				</div>
				{connectMenuIsOpen ? (
					<IfoodConnectMenu reconnectIntegrationId={reconnectIntegrationId} closeMenu={() => setConnectMenuIsOpen(false)} />
				) : null}
			</>
		);
	}

	if (error) {
		return (
			<div className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
				<h2 className="text-base font-bold text-foreground">Erro ao comunicar com o iFood</h2>
				<p className="max-w-md text-sm text-muted-foreground">{getErrorMessage(error)}</p>
			</div>
		);
	}

	return <>{children}</>;
}
