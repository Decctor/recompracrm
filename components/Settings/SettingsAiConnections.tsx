import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { AGENT_PRINCIPAL_TYPES, type TAccessPrincipalListItem, useAccessPrincipals } from "@/lib/queries/access";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConnectorMark } from "../Brand/ConnectorMark";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";
import AccessStatusBadge from "../Modals/Internal/Access/AccessStatusBadge";
import ControlAccessPrincipal from "../Modals/Internal/Access/ControlAccessPrincipal";
import NewAgentConnection from "../Modals/Internal/Access/NewAgentConnection";
import { Button } from "../ui/button";
import SettingsPanelSection from "./SettingsPanelSection";

type SettingsAiConnectionsProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

/**
 * Conexões de IA — assistentes externos (Claude, ChatGPT) lendo os dados da organização via MCP.
 *
 * Separado de Dispositivos de propósito: um tablet no balcão e um assistente que lê o faturamento
 * são coisas que o lojista revoga por motivos diferentes, e misturá-los numa lista só esconderia
 * exatamente a conexão que ele iria querer encontrar rápido.
 */
export default function SettingsAiConnections({ membership }: SettingsAiConnectionsProps) {
	const queryClient = useQueryClient();
	const { data: connections, queryKey, isLoading, isError, isSuccess, error } = useAccessPrincipals({ types: AGENT_PRINCIPAL_TYPES });
	const [newConnectionModalIsOpen, setNewConnectionModalIsOpen] = useState(false);
	const [controlPrincipalId, setControlPrincipalId] = useState<string | null>(null);

	const canManage = membership.permissoes.empresa.editar;
	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	return (
		<div className="flex w-full flex-col gap-6">
			<SettingsPanelSection
				title="CONEXÕES DE IA"
				icon={<Bot className="h-4 w-4 min-h-4 min-w-4" />}
				description="Assistentes como Claude e ChatGPT acessando a sua operação. Cada conexão tem chave, responsável e permissões próprias."
				action={
					canManage ? (
						<Button size="sm" className="flex items-center gap-2 whitespace-nowrap" onClick={() => setNewConnectionModalIsOpen(true)}>
							<Plus className="h-4 w-4 min-h-4 min-w-4" />
							NOVA CONEXÃO
						</Button>
					) : null
				}
			>
				<Link
					href="/help/como-conectar-recompracrm-ao-claude"
					className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D97757]/25 bg-[#D97757]/10 px-3.5 py-2 text-xs font-bold text-[#9d4e36] transition-colors hover:border-[#D97757]/45 hover:bg-[#D97757]/15 dark:text-[#efaa91]"
				>
					<ConnectorMark connectorCode="AGENT_CLAUDE" className="size-4" />
					Saiba como conectar com o Claude
				</Link>
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess && connections.length === 0 ? (
					<div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Bot className="h-6 w-6" />
						</div>
						<div className="flex flex-col gap-1">
							<h3 className="text-base font-bold tracking-tight">Nenhuma conexão de IA</h3>
							<p className="max-w-md text-sm text-muted-foreground">
								Conecte um assistente para consultar dados e, quando autorizado, preparar campanhas e templates em linguagem natural.
							</p>
						</div>
						{canManage ? (
							<Button size="sm" className="flex items-center gap-2" onClick={() => setNewConnectionModalIsOpen(true)}>
								<Plus className="h-4 w-4 min-h-4 min-w-4" />
								CRIAR PRIMEIRA CONEXÃO
							</Button>
						) : null}
					</div>
				) : null}
				{isSuccess && connections.length > 0 ? (
					<div className="flex w-full flex-col gap-1.5">
						{connections.map((connection) => (
							<AgentConnectionCard key={connection.id} principal={connection} handleClick={setControlPrincipalId} />
						))}
					</div>
				) : null}
			</SettingsPanelSection>

			{newConnectionModalIsOpen ? (
				<NewAgentConnection closeModal={() => setNewConnectionModalIsOpen(false)} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
			) : null}
			{controlPrincipalId ? (
				<ControlAccessPrincipal
					principalId={controlPrincipalId}
					canManage={canManage}
					closeModal={() => setControlPrincipalId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
		</div>
	);
}

type AgentConnectionCardProps = {
	principal: TAccessPrincipalListItem;
	handleClick: (id: string) => void;
};
function AgentConnectionCard({ principal, handleClick }: AgentConnectionCardProps) {
	const activeGrants = principal.grants.filter((grant) => !grant.dataRevogacao);
	const isRevoked = principal.status === "REVOGADO";

	return (
		<button
			type="button"
			onClick={() => handleClick(principal.id)}
			className={cn(
				"flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-4 text-left shadow-2xs transition-colors hover:border-primary/40",
				isRevoked && "opacity-60",
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<div className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Sparkles className="h-5 w-5" />
				</div>
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex items-center gap-2">
						<span className="truncate text-sm font-semibold">{principal.nome}</span>
						<AccessStatusBadge status={principal.status} />
					</div>
					<span className="truncate text-xs text-muted-foreground">
						{principal.cliente.nome} · {activeGrants.length} {activeGrants.length === 1 ? "permissão" : "permissões"}
					</span>
					<span className="truncate text-[0.7rem] text-muted-foreground">
						{/* Último acesso é o sinal de que a conexão está viva. "Nunca usada" é informação
						    acionável: é a conexão que dá para revogar sem quebrar o trabalho de ninguém. */}
						{principal.ultimoAcesso ? `Último acesso em ${formatDateAsLocale(principal.ultimoAcesso, true)}` : "Nunca usada"}
					</span>
				</div>
			</div>
		</button>
	);
}
