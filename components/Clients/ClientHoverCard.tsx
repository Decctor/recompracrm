"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { formatLocation } from "@/lib/formatting";
import { useClientById } from "@/lib/queries/clients";
import { CodeIcon, IdCardIcon, InfoIcon, Mail, MapPinIcon, Phone, PhoneIcon, TagIcon, UserRound } from "lucide-react";
import { MailIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
type ClientHoverCardProps = {
	clientId: string;
	children: ReactNode;
};

export default function ClientHoverCard({ clientId, children }: ClientHoverCardProps) {
	const { data: client, isLoading, isError } = useClientById({ id: clientId });

	return (
		<HoverCard>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent className="w-80 p-0 overflow-hidden" align="start">
				<div className="w-full flex flex-col gap-3 p-4">
					{isLoading ? <p className="text-xs text-muted-foreground animate-pulse">Carregando cliente...</p> : null}
					{isError ? <p className="text-xs text-red-500">Não foi possível carregar os dados do cliente.</p> : null}
					{client ? (
						<>
							<div className="w-full flex items-center gap-1.5">
								<UserRound className="w-4 h-4 min-w-4 min-h-4" />
								<h2 className="text-sm font-semibold tracking-tight">{client.nome}</h2>
							</div>
							<div className="w-full flex flex-col gap-1.5">
								<div className="w-full flex items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-1.5">
										<CodeIcon className="w-4 h-4 min-w-4 min-h-4" />
										<span className="text-muted-foreground">ID</span>
									</div>
									<span className="font-medium">{client.id}</span>
								</div>
								<div className="w-full flex items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-1.5">
										<TagIcon className="w-4 h-4 min-w-4 min-h-4" />
										<span className="text-muted-foreground">SEGMENTAÇÃO</span>
									</div>
									<span className="font-medium">{client.analiseRFMTitulo || "Não informada"}</span>
								</div>
								<div className="w-full flex items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-1.5">
										<PhoneIcon className="w-4 h-4 min-w-4 min-h-4" />
										<span className="text-muted-foreground">TELEFONE</span>
									</div>
									<span className="font-medium">{client.telefone || "Não informado"}</span>
								</div>
								<div className="w-full flex items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-1.5">
										<MailIcon className="w-4 h-4 min-w-4 min-h-4" />
										<span className="text-muted-foreground">EMAIL</span>
									</div>
									<span className="font-medium">{client.email || "Não informado"}</span>
								</div>
								<div className="w-full flex items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-1.5">
										<MapPinIcon className="w-4 h-4 min-w-4 min-h-4" />
										<span className="text-muted-foreground">LOCALIZAÇÃO</span>
									</div>
									<span className="font-medium">
										{formatLocation({
											location: {
												cep: client.localizacaoCep,
												uf: client.localizacaoEstado || "",
												cidade: client.localizacaoCidade || "",
												bairro: client.localizacaoBairro,
												endereco: client.localizacaoLogradouro,
												numeroOuIdentificador: client.localizacaoNumero,
												complemento: client.localizacaoComplemento,
											},
											includeUf: true,
											includeCity: true,
											includeCEP: true,
										}) || "Não informado"}
									</span>
								</div>
							</div>
							<div className="h-px w-full bg-border" />
							<div className="w-full flex items-center justify-center">
								<Button variant="ghost" size="xs" className="flex items-center gap-1.5 w-fit" asChild>
									<Link href={`/dashboard/commercial/clients/id/${client.id}`}>
										<InfoIcon className="w-3 h-3 min-w-3 min-h-3" />
										VER PERFIL
									</Link>
								</Button>
							</div>
						</>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
