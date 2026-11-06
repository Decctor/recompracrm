"use client";

import dayjs from "dayjs";
import { Pencil, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ControlClientStoreCredit } from "@/components/Modals/Clients/ControlClientStoreCredit";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Section } from "@/components/ui/section";
import { formatToMoney } from "@/lib/formatting";
import { useClientStoreCredit } from "@/lib/queries/store-credit";

type ClientStoreCreditReleaseProps = {
	clientId: string;
};

/**
 * Liberação de fiado do cliente: se ele compra fiado, até quanto, e quem decidiu.
 *
 * Só aparece quando importa — a organização exige liberação, ou o cliente já foi liberado (a
 * decisão continua guardada mesmo com a exigência desligada). A maioria das organizações nunca liga
 * a exigência, e um bloco "não liberado" permanente na página de todo cliente seria ruído puro.
 */
export default function ClientStoreCreditRelease({ clientId }: ClientStoreCreditReleaseProps) {
	const [isEditing, setIsEditing] = useState(false);
	const { data } = useClientStoreCredit({ clientId });

	if (!data) return null;
	const { position, exigeLiberacao, canGrant } = data;
	if (!exigeLiberacao && !position.fiadoLiberado) return null;

	const semLimite = position.fiadoLiberado && position.fiadoLimite === null;
	const status = !position.fiadoLiberado ? "Não liberado" : semLimite ? "Liberado sem limite" : "Liberado";
	const decididoEm = position.fiadoLiberadoEm ? dayjs(position.fiadoLiberadoEm).format("DD/MM/YYYY") : null;
	const decisao = decididoEm
		? `${position.fiadoLiberado ? "Liberado" : "Bloqueado"} por ${position.liberadoPor?.nome ?? "usuário removido"} em ${decididoEm}`
		: null;

	return (
		<>
			<Section.Root className="text-numeric gap-4">
				<Section.Header>
					<Section.Icon>
						<ShieldCheck />
					</Section.Icon>
					<Section.Title>Liberação de fiado</Section.Title>
					<Chip.Root variant={!position.fiadoLiberado ? "muted" : "success"} size="xs" shape="pill">
						<Chip.Label caps weight="bold">
							{status}
						</Chip.Label>
					</Chip.Root>
					{canGrant ? (
						<Section.Actions>
							<Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)} className="flex items-center gap-1.5">
								<Pencil className="h-3.5 w-3.5" />
								EDITAR
							</Button>
						</Section.Actions>
					) : null}
				</Section.Header>

				<Section.Body className="gap-3">
					{position.fiadoLiberado ? (
						<dl className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
							<ReleaseFigure label="LIMITE" value={semLimite ? "Sem limite" : formatToMoney(position.fiadoLimite ?? 0)} />
							<ReleaseFigure label="EM ABERTO" value={formatToMoney(position.saldoEmAberto)} />
							<ReleaseFigure
								label="DISPONÍVEL"
								value={position.disponivel === null ? "Sem limite" : formatToMoney(position.disponivel)}
								emphasis={position.disponivel === 0 ? "danger" : "default"}
							/>
						</dl>
					) : (
						<p className="text-xs text-muted-foreground">
							Fiado para este cliente só com a aprovação de um gestor no momento da venda.
							{position.saldoEmAberto > 0 ? ` Ele tem ${formatToMoney(position.saldoEmAberto)} em aberto.` : ""}
						</p>
					)}

					{position.fiadoLiberado && !exigeLiberacao ? (
						<p className="text-[0.65rem] text-muted-foreground">
							A organização não exige liberação de fiado hoje: o limite fica guardado e passa a valer quando a exigência for ligada.
						</p>
					) : null}
					{decisao ? <p className="text-[0.65rem] text-muted-foreground">{decisao}.</p> : null}
				</Section.Body>
			</Section.Root>

			{isEditing ? <ControlClientStoreCredit clientId={clientId} closeModal={() => setIsEditing(false)} /> : null}
		</>
	);
}

function ReleaseFigure({ label, value, emphasis = "default" }: { label: string; value: string; emphasis?: "default" | "danger" }) {
	return (
		<div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5">
			<dt className="text-[0.65rem] font-medium tracking-tight text-muted-foreground">{label}</dt>
			<dd className={emphasis === "danger" ? "text-sm font-bold text-red-700 dark:text-red-400" : "text-sm font-bold tracking-tight"}>{value}</dd>
		</div>
	);
}
