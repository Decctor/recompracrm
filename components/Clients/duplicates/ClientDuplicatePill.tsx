"use client";

import { Chip } from "@/components/ui/chip";
import { type TClientDuplicateEntityType, useClientDuplicatesForEntity } from "@/lib/queries/client-duplicates";
import { CopyXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ClientReconciliationDialog } from "./ClientReconciliationDialog";
import { DUPLICATE_SIGNAL_CLASS } from "./signals";

type ClientDuplicatePillProps = {
	entityType: TClientDuplicateEntityType;
	entityId: string;
	canReconcile: boolean;
};

/**
 * Pill de possível duplicidade nas páginas de detalhe (cliente, venda).
 * Só renderiza quando há pares pendentes; clicar abre o diálogo de
 * reconciliação. Ver e comparar é livre; descartar/mesclar exige a permissão
 * de gestão da base (clientes.gerenciarBase).
 */
export function ClientDuplicatePill({ entityType, entityId, canReconcile }: ClientDuplicatePillProps) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const router = useRouter();

	const duplicatesQuery = useClientDuplicatesForEntity({ entityType, entityId });
	const pairs = duplicatesQuery.data?.items ?? [];
	const clienteId = duplicatesQuery.data?.clienteId ?? null;

	if (!clienteId || pairs.length === 0) return null;

	return (
		<>
			<button
				type="button"
				onClick={() => setDialogOpen(true)}
				aria-label="Abrir reconciliação de clientes duplicados"
				className="cursor-pointer rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
			>
				<Chip.Root size="sm" shape="pill" className={DUPLICATE_SIGNAL_CLASS}>
					<Chip.Icon>
						<CopyXIcon />
					</Chip.Icon>
					<Chip.Label>{pairs.length > 1 ? `Possíveis duplicados (${pairs.length})` : "Possível duplicado"}</Chip.Label>
				</Chip.Root>
			</button>

			{dialogOpen ? (
				<ClientReconciliationDialog
					pairs={pairs}
					perspectiveClienteId={clienteId}
					canReconcile={canReconcile}
					onClose={() => setDialogOpen(false)}
					onResolved={() => void duplicatesQuery.refetch()}
					onMerged={({ keeperId, sourceId }) => {
						// A página atual era do cadastro excluído: leva o usuário ao mantido.
						if (entityType === "client" && entityId === sourceId) {
							router.push(`/dashboard/customers/${keeperId}`);
						}
					}}
				/>
			) : null}
		</>
	);
}
