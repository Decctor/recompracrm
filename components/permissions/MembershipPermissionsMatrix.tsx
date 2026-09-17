"use client";

import {
	applyMembershipPermissionChanges,
	countGrantedMembershipPermissions,
	filterMembershipPermissionMatrix,
	getAllMembershipPermissionPaths,
	PERMISSION_ACTION_COLUMNS,
	readMembershipPermissionValue,
	resolveMembershipColumnToggle,
	resolveMembershipPermissionToggle,
	resolveMembershipRowToggle,
	type TMembershipPermissionChange,
	type TMembershipPermissionMatrixRow,
	type TMembershipPermissionPath,
} from "@/lib/permissions/membership-matrix";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import { cn } from "@/lib/utils";
import { CheckIcon, MinusIcon, SearchIcon } from "lucide-react";
import React from "react";

const MATRIX_GRID = "grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_repeat(4,2.5rem)] items-center gap-x-1";

type TSelectionState = "none" | "partial" | "all";

function getSelectionState(total: number, active: number): TSelectionState {
	if (active === 0) return "none";
	return active === total ? "all" : "partial";
}

type ToggleBoxProps = {
	state: TSelectionState;
	label: string;
	onToggle: (value: boolean) => void;
	className?: string;
};
function ToggleBox({ state, label, onToggle, className }: ToggleBoxProps) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={state === "all" ? true : state === "partial" ? "mixed" : false}
			aria-label={label}
			title={label}
			onClick={() => onToggle(state !== "all")}
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
				state === "none" ? "border-border bg-input/60 text-transparent hover:border-foreground/30" : "border-primary bg-primary text-primary-foreground",
				className,
			)}
		>
			{state === "partial" ? <MinusIcon className="size-3" /> : <CheckIcon className="size-3" />}
		</button>
	);
}

type PermissionCellProps = {
	checked: boolean;
	label: string;
	onToggle: () => void;
};
function PermissionCell({ checked, label, onToggle }: PermissionCellProps) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			aria-label={label}
			title={label}
			onClick={onToggle}
			className={cn(
				"flex h-7 w-full items-center justify-center rounded-md border transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
				checked
					? "border-primary bg-primary text-primary-foreground"
					: "border-border bg-input/40 text-transparent hover:border-foreground/25 hover:bg-accent",
			)}
		>
			<CheckIcon className="size-3.5" />
		</button>
	);
}

type PermissionRowProps = {
	row: TMembershipPermissionMatrixRow;
	rowState: string;
	permissions: TOrganizationMemberPermissions;
	onChange: (changes: TMembershipPermissionChange[]) => void;
};
const PermissionRow = React.memo(function PermissionRow({ row, rowState, permissions, onChange }: PermissionRowProps) {
	const activePaths = React.useMemo(
		() => new Set(row.paths.filter((_, index) => rowState[index] === "1")),
		[row, rowState],
	);
	const isActive = React.useCallback((path: TMembershipPermissionPath) => activePaths.has(path), [activePaths]);
	const rowSelection = getSelectionState(row.paths.length, activePaths.size);

	return (
		<div className="min-w-0 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/40">
			<div className={MATRIX_GRID}>
				<ToggleBox
					state={rowSelection}
					label={`${rowSelection === "all" ? "Revogar" : "Conceder"} todas as permissões de ${row.title}`}
					onToggle={(value) => onChange(resolveMembershipRowToggle({ row, value }))}
				/>
				<span className="min-w-0 text-xs leading-tight font-medium tracking-tight break-words hyphens-auto" lang="pt-BR">
					{row.title}
				</span>
				{row.cells.map((leaf, index) =>
					leaf ? (
						<PermissionCell
							key={leaf.path}
							checked={isActive(leaf.path)}
							label={leaf.description}
							onToggle={() =>
								onChange(
									resolveMembershipPermissionToggle({
										row,
										path: leaf.path,
										value: !isActive(leaf.path),
										permissions,
									}),
								)
							}
						/>
					) : (
						<div key={PERMISSION_ACTION_COLUMNS[index]?.key} className="flex h-7 items-center justify-center" aria-hidden>
							<span className="h-px w-2 rounded-full bg-border" />
						</div>
					),
				)}
			</div>
			{row.extras.length > 0 ? (
				<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 pl-6">
					{row.extras.map((leaf) => {
						const checked = isActive(leaf.path);
						return (
							<button
								key={leaf.path}
								type="button"
								role="checkbox"
								aria-checked={checked}
								aria-label={leaf.description}
								title={leaf.description}
								onClick={() =>
									onChange(
										resolveMembershipPermissionToggle({
											row,
											path: leaf.path,
											value: !checked,
											permissions,
										}),
									)
								}
								className={cn(
									"flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left text-[0.65rem] font-medium tracking-tight transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
									checked
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-input/40 text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
								)}
							>
								<CheckIcon className={cn("size-2.5 shrink-0", checked ? "opacity-100" : "opacity-0")} />
								<span className="min-w-0 break-words">{leaf.shortDescription}</span>
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
});

type MembershipPermissionsMatrixProps = {
	permissions: TOrganizationMemberPermissions;
	organizationHasERPAccess: boolean;
	onPermissionsChange: (permissions: TOrganizationMemberPermissions) => void;
	headerSlot?: React.ReactNode;
};
function MembershipPermissionsMatrix({ permissions, organizationHasERPAccess, onPermissionsChange, headerSlot }: MembershipPermissionsMatrixProps) {
	const [search, setSearch] = React.useState("");
	const visibleRows = React.useMemo(
		() => filterMembershipPermissionMatrix({ search, organizationHasERPAccess }),
		[search, organizationHasERPAccess],
	);
	const allPaths = React.useMemo(() => getAllMembershipPermissionPaths({ organizationHasERPAccess }), [organizationHasERPAccess]);

	const rowStates = React.useMemo(
		() => visibleRows.map((row) => row.paths.map((path) => (readMembershipPermissionValue(permissions, path) ? "1" : "0")).join("")),
		[visibleRows, permissions],
	);

	const visiblePaths = React.useMemo(() => visibleRows.flatMap((row) => row.paths), [visibleRows]);
	const grantedCount = countGrantedMembershipPermissions({ permissions, organizationHasERPAccess });
	const visibleGrantedCount = React.useMemo(
		() => visiblePaths.reduce((total, path) => (readMembershipPermissionValue(permissions, path) ? total + 1 : total), 0),
		[visiblePaths, permissions],
	);
	const isFiltered = visiblePaths.length > 0 && visiblePaths.length !== allPaths.length;

	function handleChanges(changes: TMembershipPermissionChange[]) {
		if (changes.length === 0) return;
		onPermissionsChange(applyMembershipPermissionChanges(permissions, changes));
	}

	function handleBulk(value: boolean) {
		handleChanges(visiblePaths.map((path) => ({ path, value })));
	}

	return (
		<div className="flex w-full min-w-0 flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<p className="text-[0.7rem] text-muted-foreground">
					<span className="font-semibold text-foreground tabular-nums">{grantedCount}</span> de {allPaths.length} permissões concedidas
				</p>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => handleBulk(true)}
						disabled={visiblePaths.length === 0 || visibleGrantedCount === visiblePaths.length}
						className="rounded-md px-2 py-1 text-[0.65rem] font-medium tracking-tight transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
					>
						{isFiltered ? "MARCAR FILTRADOS" : "MARCAR TUDO"}
					</button>
					<button
						type="button"
						onClick={() => handleBulk(false)}
						disabled={visibleGrantedCount === 0}
						className="rounded-md px-2 py-1 text-[0.65rem] font-medium tracking-tight transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
					>
						{isFiltered ? "LIMPAR FILTRADOS" : "LIMPAR TUDO"}
					</button>
				</div>
			</div>

			<div className="relative">
				<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Filtrar módulos e permissões..."
					aria-label="Filtrar módulos e permissões"
					className="h-8 w-full rounded-md border border-transparent bg-input/50 pr-2 pl-8 text-xs outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
				/>
			</div>

			{headerSlot}

			<div className={cn(MATRIX_GRID, "sticky top-0 z-10 border-b border-border bg-background px-1.5 pt-1 pb-1.5")}>
				<span aria-hidden />
				<span className="text-[0.6rem] font-medium tracking-wide text-muted-foreground uppercase">Módulo</span>
				{PERMISSION_ACTION_COLUMNS.map((column, index) => {
					const columnLeafs = visibleRows.map((row) => row.cells[index]).filter((leaf) => !!leaf);
					const columnActive = columnLeafs.reduce(
						(total, leaf) => (readMembershipPermissionValue(permissions, leaf.path) ? total + 1 : total),
						0,
					);
					const columnState = getSelectionState(columnLeafs.length, columnActive);
					return (
						<button
							key={column.key}
							type="button"
							role="checkbox"
							aria-checked={columnState === "all" ? true : columnState === "partial" ? "mixed" : false}
							aria-label={`${columnState === "all" ? "Revogar" : "Conceder"} ${column.label} em todos os módulos listados`}
							title={`${columnState === "all" ? "Revogar" : "Conceder"} ${column.label} em todos os módulos listados`}
							disabled={columnLeafs.length === 0}
							onClick={() =>
								handleChanges(
									resolveMembershipColumnToggle({
										rows: visibleRows,
										actionIndex: index,
										value: columnState !== "all",
										permissions,
									}),
								)
							}
							className={cn(
								"rounded-md py-1 text-[0.6rem] font-medium tracking-tight transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-3 focus-visible:ring-ring/30 outline-none",
								columnState === "none" ? "text-muted-foreground" : "text-foreground",
							)}
						>
							{column.label}
						</button>
					);
				})}
			</div>

			{visibleRows.length === 0 ? (
				<p className="py-6 text-center text-xs text-muted-foreground">Nenhum módulo corresponde a &quot;{search}&quot;.</p>
			) : (
				<div className="flex min-w-0 flex-col">
					{visibleRows.map((row, index) => (
						<PermissionRow
							key={row.key}
							row={row}
							rowState={rowStates[index] as string}
							permissions={permissions}
							onChange={handleChanges}
						/>
					))}
				</div>
			)}

			<p className="text-[0.65rem] text-muted-foreground">
				Conceder qualquer permissão de um módulo concede também a visualização. Revogar a visualização revoga o módulo inteiro.
			</p>
		</div>
	);
}

export default React.memo(MembershipPermissionsMatrix);
