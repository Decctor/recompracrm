"use client";

import RenameProductGroup from "@/components/Modals/Products/RenameProductGroup";
import { Button } from "@/components/ui/button";
import type { TMatrixGroup } from "@/lib/products/sales-channels-matrix";
import type { TSalesChannelMatrixProduct } from "@/lib/queries/sales-channels";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { useState } from "react";
import ChannelMatrixTable, { type TMatrixCellAccessors, type TMatrixChannelColumn } from "./ChannelMatrixTable";

type ChannelMatrixGroupPanelProps = {
	group: TMatrixGroup<TSalesChannelMatrixProduct>;
	/** Posição na ordem do canal em foco. */
	position: number;
	focusedLabel: string;
	canMoveUp: boolean;
	canMoveDown: boolean;
	/** Demais grupos, para avisar quando o novo nome funde dois cadastros. */
	otherGroups: string[];
	columns: TMatrixChannelColumn[];
	focusedColumn: TMatrixChannelColumn | null;
	accessors: TMatrixCellAccessors;
	moveGroup: (grupo: string, direction: "up" | "down") => void;
	renameGroup: (grupoAtual: string, grupoNovo: string) => void;
};

/**
 * Um grupo do cadastro como painel da grade. As setas reordenam o grupo NO CANAL EM FOCO: a
 * ordem é por canal (só a loja a consome hoje), e a grade se organiza pela ordem do canal que o
 * usuário escolheu focar.
 */
export default function ChannelMatrixGroupPanel({
	group,
	position,
	focusedLabel,
	canMoveUp,
	canMoveDown,
	otherGroups,
	columns,
	focusedColumn,
	accessors,
	moveGroup,
	renameGroup,
}: ChannelMatrixGroupPanelProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const nodeCount = group.produtos.reduce((total, produto) => total + Math.max(1, produto.variantes.filter((variant) => variant.ativo).length), 0);

	return (
		<div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xs">
			<div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-3 py-2.5">
				<div className="flex min-w-0 flex-1 items-center gap-2.5">
					<span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background px-1.5 text-[0.65rem] font-semibold tabular-nums tracking-tight text-muted-foreground">
						{group.ungrouped ? "—" : String(position).padStart(2, "0")}
					</span>
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-semibold">{group.label}</span>
						<span className="text-[0.62rem] uppercase tracking-wide text-muted-foreground">
							{group.produtos.length === 1 ? "1 produto" : `${group.produtos.length} produtos`}
							{nodeCount !== group.produtos.length ? ` · ${nodeCount} itens com variantes` : null}
							{group.ungrouped ? " · sem grupo, exibidos no fim" : null}
						</span>
					</div>
				</div>

				{/* O balde dos sem grupo não se move nem se renomeia: é a ausência de um grupo. */}
				{group.ungrouped ? null : (
					<div className="flex shrink-0 items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							aria-label={`Renomear o grupo ${group.label}`}
							onClick={() => setIsRenaming(true)}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							disabled={!canMoveUp}
							aria-label={`Mover o grupo ${group.label} para cima em ${focusedLabel}`}
							title={`Ordem em ${focusedLabel}`}
							onClick={() => moveGroup(group.key, "up")}
						>
							<ChevronUp className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							disabled={!canMoveDown}
							aria-label={`Mover o grupo ${group.label} para baixo em ${focusedLabel}`}
							title={`Ordem em ${focusedLabel}`}
							onClick={() => moveGroup(group.key, "down")}
						>
							<ChevronDown className="h-4 w-4" />
						</Button>
					</div>
				)}
			</div>

			<ChannelMatrixTable produtos={group.produtos} columns={columns} focusedColumn={focusedColumn} accessors={accessors} />

			{isRenaming ? (
				<RenameProductGroup
					grupo={group.key}
					existingGroups={otherGroups}
					closeModal={() => setIsRenaming(false)}
					callbacks={{ onSuccess: (grupoNovo) => renameGroup(group.key, grupoNovo) }}
				/>
			) : null}
		</div>
	);
}
