"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import { Button } from "@/components/ui/button";
import { DropdownMenuGroup, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TChatBoardFilters } from "@/lib/queries/chats-board";
import { ChatAssignmentPriorityEnum, type TChatInboxView } from "@/schemas/enums";
import { ChevronDown, Inbox, Search, Sparkles, User, Users, X } from "lucide-react";
import { useMemo } from "react";
import { CHAT_PRIORITY_LABEL } from "./config";

const BOARD_VIEWS: { id: TChatInboxView; label: string; icon: typeof Inbox }[] = [
	{ id: "TODAS", label: "Todas", icon: Users },
	{ id: "MINHAS", label: "Minhas", icon: User },
	{ id: "NAO_ATRIBUIDAS", label: "Livres", icon: Inbox },
	{ id: "COM_AGENTE", label: "IA", icon: Sparkles },
];

const CLOSED_WINDOW_OPTIONS = [1, 3, 7] as const;

type ChatsBoardFiltersProps = {
	filters: TChatBoardFilters;
	onChange: (patch: Partial<TChatBoardFilters>) => void;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
};

export function ChatsBoardFilters({ filters, onChange, whatsappConnections }: ChatsBoardFiltersProps) {
	const phones = useMemo(
		() =>
			whatsappConnections.flatMap((connection) => [
				...(connection.telefones ?? []),
				// Desativados seguem no filtro: as conversas antigas continuam ligadas a eles.
				...(connection.telefonesDesativados ?? []).map((phone) => ({ ...phone, nome: `${phone.nome} (desativado)` })),
			]),
		[whatsappConnections],
	);
	const selectedPhone = phones.find((phone) => phone.id === filters.whatsappConexaoTelefoneId) ?? null;
	const selectedView = BOARD_VIEWS.find((item) => item.id === filters.view) ?? BOARD_VIEWS[0];
	const SelectedViewIcon = selectedView.icon;

	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="outline" size="sm" className="h-8 gap-1.5">
							<SelectedViewIcon className="h-3.5 w-3.5" />
							{selectedView.label}
							<ChevronDown className="h-3 w-3 opacity-60" />
						</Button>
					}
				/>
				<DropdownMenuContent align="start">
					<DropdownMenuGroup>
						{BOARD_VIEWS.map((item) => (
							<DropdownMenuItem key={item.id} onClick={() => onChange({ view: item.id })} className="gap-2">
								<item.icon className="h-3.5 w-3.5" />
								{item.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{filters.prioridade ? (
				<button
					type="button"
					onClick={() => onChange({ prioridade: null })}
					aria-label={`Remover filtro de prioridade: ${CHAT_PRIORITY_LABEL[filters.prioridade]}`}
					className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<span>{CHAT_PRIORITY_LABEL[filters.prioridade]}</span>
					<X className="h-3 w-3 shrink-0 opacity-60" />
				</button>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
								Prioridade
								<ChevronDown className="h-3 w-3 opacity-60" />
							</Button>
						}
					/>
					<DropdownMenuContent align="start">
						<DropdownMenuGroup>
							{ChatAssignmentPriorityEnum.options.map((prioridade) => (
								<DropdownMenuItem key={prioridade} onClick={() => onChange({ prioridade })}>
									{CHAT_PRIORITY_LABEL[prioridade]}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{selectedPhone ? (
				<button
					type="button"
					onClick={() => onChange({ whatsappConexaoTelefoneId: null })}
					aria-label={`Remover filtro de número: ${selectedPhone.numero || selectedPhone.nome}`}
					className="flex h-8 min-w-0 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<span className="truncate">{selectedPhone.numero || selectedPhone.nome}</span>
					<X className="h-3 w-3 shrink-0 opacity-60" />
				</button>
			) : (
				phones.length > 1 && (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
									Número
									<ChevronDown className="h-3 w-3 opacity-60" />
								</Button>
							}
						/>
						<DropdownMenuContent align="start">
							<DropdownMenuGroup>
								{phones.map((phone) => (
									<DropdownMenuItem key={phone.id} onClick={() => onChange({ whatsappConexaoTelefoneId: phone.id })}>
										{phone.numero || phone.nome}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)
			)}

			{/* A janela dos encerrados é filtro de uma coluna só, mas mora aqui: é a resposta
			    para "por que sumiu o que eu encerrei ontem?". */}
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
							Encerrados: {filters.encerradosDias}d
							<ChevronDown className="h-3 w-3 opacity-60" />
						</Button>
					}
				/>
				<DropdownMenuContent align="start">
					<DropdownMenuGroup>
						{CLOSED_WINDOW_OPTIONS.map((dias) => (
							<DropdownMenuItem key={dias} onClick={() => onChange({ encerradosDias: dias })}>
								Últimos {dias} {dias === 1 ? "dia" : "dias"}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="relative ml-auto w-full min-w-[180px] sm:w-auto sm:max-w-xs">
				<Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={filters.search}
					onChange={(event) => onChange({ search: event.target.value })}
					aria-label="Buscar atendimentos por cliente"
					placeholder="Buscar por nome ou telefone"
					className="h-8 pl-7 text-xs"
				/>
			</div>
		</div>
	);
}
