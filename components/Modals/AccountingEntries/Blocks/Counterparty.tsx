"use client";

import SelectClientInput from "@/components/Inputs/SelectClient";
import SelectSupplierInput from "@/components/Inputs/SelectSupplierInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseInternalAccountingEntryState } from "@/state-hooks/use-internal-accounting-entry-state";
import { Handshake } from "lucide-react";
import { useState } from "react";

type TCounterpartyKind = "NENHUMA" | "CLIENTE" | "FORNECEDOR";

const KIND_OPTIONS: { value: TCounterpartyKind; label: string }[] = [
	{ value: "NENHUMA", label: "SEM CONTRAPARTE" },
	{ value: "CLIENTE", label: "CLIENTE" },
	{ value: "FORNECEDOR", label: "FORNECEDOR" },
];

type AccountingEntryCounterpartyBlockProps = {
	entry: TUseInternalAccountingEntryState["state"]["entry"];
	updateEntry: TUseInternalAccountingEntryState["updateEntry"];
	/** Nomes já conhecidos (lançamento existente); a seleção nova guarda o nome localmente. */
	names?: { cliente?: string | null; fornecedor?: string | null };
	editable?: boolean;
};

/**
 * Contraparte do lançamento (ADR-0002, decisão 5): quem deve à organização (cliente) ou a quem ela
 * deve (fornecedor). Mora no lançamento pai, não nas linhas — é uma pergunta por título, não por
 * conta. Opcional: um lançamento manual de ajuste não tem contraparte.
 */
export default function AccountingEntryCounterpartyBlock({ entry, updateEntry, names, editable = true }: AccountingEntryCounterpartyBlockProps) {
	const [selectedNames, setSelectedNames] = useState<{ cliente: string | null; fornecedor: string | null }>({ cliente: null, fornecedor: null });
	const kind: TCounterpartyKind = entry.clienteId ? "CLIENTE" : entry.fornecedorId ? "FORNECEDOR" : "NENHUMA";
	const [pendingKind, setPendingKind] = useState<TCounterpartyKind | null>(null);
	const activeKind = kind === "NENHUMA" && pendingKind ? pendingKind : kind;
	const clienteNome = selectedNames.cliente ?? names?.cliente ?? null;
	const fornecedorNome = selectedNames.fornecedor ?? names?.fornecedor ?? null;

	function changeKind(next: TCounterpartyKind) {
		if (!editable) return;
		setPendingKind(next === "NENHUMA" ? null : next);
		updateEntry({ clienteId: null, fornecedorId: null });
	}

	return (
		<ResponsiveMenuSection title="CONTRAPARTE" icon={<Handshake className="h-4 w-4" />}>
			<div className="flex flex-wrap gap-1.5">
				{KIND_OPTIONS.map((option) => (
					<Button
						key={option.value}
						type="button"
						size="sm"
						variant={activeKind === option.value ? "default" : "outline"}
						className={cn("h-8 text-xs", !editable && "pointer-events-none opacity-70")}
						onClick={() => changeKind(option.value)}
					>
						{option.label}
					</Button>
				))}
			</div>
			{activeKind === "CLIENTE" ? (
				<SelectClientInput
					label="CLIENTE"
					editable={editable}
					value={entry.clienteId ? { id: entry.clienteId, nome: clienteNome ?? "Cliente", telefone: "" } : null}
					handleChange={(client) => {
						setSelectedNames((prev) => ({ ...prev, cliente: client.nome }));
						updateEntry({ clienteId: client.id, fornecedorId: null });
					}}
					onReset={() => updateEntry({ clienteId: null })}
				/>
			) : null}
			{activeKind === "FORNECEDOR" ? (
				<SelectSupplierInput
					label="FORNECEDOR"
					editable={editable}
					value={entry.fornecedorId ? { id: entry.fornecedorId, nome: fornecedorNome ?? "Fornecedor" } : null}
					onSelect={(supplier) => {
						setSelectedNames((prev) => ({ ...prev, fornecedor: supplier.nome }));
						updateEntry({ fornecedorId: supplier.id, clienteId: null });
					}}
					onClear={() => updateEntry({ fornecedorId: null })}
				/>
			) : null}
		</ResponsiveMenuSection>
	);
}
