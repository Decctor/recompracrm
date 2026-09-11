"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tabela dos blocos do dashboard: colunas no desktop, linhas-cartão no celular.
 *
 * A grade de quatro colunas não cabe em 400px — cada coluna fica com 60 a 90px e os rótulos em
 * caixa alta do cabeçalho se sobrepõem ("ENVIADASCONVERSÃORECEITA"). Rolagem horizontal resolveria,
 * mas um painel que se olha de relance não deveria pedir gesto, e esconder colunas perderia dado.
 *
 * Então a tabela deixa de ser tabela abaixo de `sm`: some o cabeçalho, a primeira coluna vira o
 * título da linha e as demais viram pares rótulo/valor que quebram em várias linhas. O mesmo
 * conteúdo, sem coluna nenhuma. O truque é o `sm:contents` no invólucro dos valores: no desktop ele
 * desaparece da árvore de layout e as células voltam a ser filhas diretas da grade.
 */

export type THubTableColumn = {
	id: string;
	header: string;
	/** Alinhamento no modo tabela; no celular todo valor lê da esquerda. */
	align?: "left" | "right";
	/** Trilho da grade no modo tabela (ex.: `minmax(0,1.6fr)`). */
	track: string;
};

export type THubTableRow = {
	id: string;
	href?: string;
	/** Conteúdo por coluna. A primeira coluna é o título da linha no celular. */
	cells: Record<string, ReactNode>;
	/** Classe extra por célula — tom de atenção, ênfase. */
	cellClassName?: Record<string, string>;
};

type HubTableProps = {
	columns: THubTableColumn[];
	rows: THubTableRow[];
};

export function HubTable({ columns, rows }: HubTableProps) {
	const [titleColumn, ...valueColumns] = columns;
	// `gridTemplateColumns` inline: os trilhos vêm de dados, e classe dinâmica do Tailwind não é
	// gerada no build.
	const template = { gridTemplateColumns: columns.map((column) => column.track).join(" ") };

	return (
		<>
			<div
				className="text-micro hidden border-border/60 border-b px-3 py-2 text-muted-foreground uppercase tracking-[0.06em] sm:grid sm:gap-2"
				style={template}
			>
				{columns.map((column) => (
					<span key={column.id} className={cn(column.align === "right" && "text-right")}>
						{column.header}
					</span>
				))}
			</div>

			{rows.map((row) => {
				const body = (
					<>
						<span className={cn("truncate font-bold text-sm", row.cellClassName?.[titleColumn.id])}>{row.cells[titleColumn.id]}</span>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 sm:contents">
							{valueColumns.map((column) => (
								<span key={column.id} className={cn("text-sm", column.align === "right" && "sm:text-right", row.cellClassName?.[column.id])}>
									<span className="text-micro font-normal text-muted-foreground sm:hidden">{column.header} </span>
									{row.cells[column.id]}
								</span>
							))}
						</div>
					</>
				);
				const rowClassName = "flex w-full flex-col gap-1 border-border/60 border-b px-3 py-2.5 last:border-b-0 sm:grid sm:items-center sm:gap-2";
				if (row.href) {
					return (
						<Link
							key={row.id}
							href={row.href}
							style={template}
							className={cn(rowClassName, "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
						>
							{body}
						</Link>
					);
				}
				return (
					<div key={row.id} style={template} className={rowClassName}>
						{body}
					</div>
				);
			})}
		</>
	);
}
