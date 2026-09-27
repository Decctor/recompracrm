"use client";

import { Button } from "@/components/ui/button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { useCampaignUtilPreviewAudience } from "@/lib/queries/campaigns";
import { useProductById } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type {
	TCampaignFilterCondition,
	TCampaignFilterLogicOperatorEnum,
	TCampaignFilterTreeNode,
	TCampaignFiltersTree,
	TCampaignLocationFilterConfig,
	TCampaignTopBuyersProductFilterConfig,
	TCampaignCustomFieldFilterConfig,
} from "@/schemas/campaigns";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { Building2, Crown, Filter, FolderPlus, MapPin, MapPinned, Pencil, Plus, Trash2, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { normalizeFiltersForSubmit } from "../utils";
import LocationEditor from "./FilterEditors/LocationEditor";
import TopBuyersProductEditor from "./FilterEditors/TopBuyersProductEditor";
import CustomFieldEditor, { CUSTOM_FIELD_FILTER_OPERATOR_LABELS } from "./FilterEditors/CustomFieldEditor";
import { useCustomFieldById } from "@/lib/queries/custom-fields";
import { AnimatedSpinner } from "@/components/icons";

type CampaignsFiltersBlockProps = {
	filtros: TUseCampaignState["state"]["filtros"];
	campaignSegmentations: TUseCampaignState["state"]["segmentations"];
	addFilterCondition: TUseCampaignState["addFilterCondition"];
	updateFilterCondition: TUseCampaignState["updateFilterCondition"];
	addFilterGroup: TUseCampaignState["addFilterGroup"];
	updateFilterGroupOperator: TUseCampaignState["updateFilterGroupOperator"];
	removeFilterNode: TUseCampaignState["removeFilterNode"];
};

const OPERATOR_LABELS: Record<TCampaignFilterLogicOperatorEnum, { label: string; description: string }> = {
	AND: { label: "TODOS", description: "Cliente deve satisfazer todos os filtros do grupo" },
	OR: { label: "QUALQUER", description: "Cliente deve satisfazer ao menos um filtro do grupo" },
	NOT: { label: "NÃO", description: "Exclui clientes que satisfaçam o filtro (exatamente 1 item)" },
};

type LocationEditorState = {
	kind: "location";
	mode: "add" | "edit";
	targetPath: number[];
	focusLevel?: "estados" | "cidades" | "bairros";
	initialValue?: TCampaignLocationFilterConfig;
	conditionId?: string;
};
type TopBuyersEditorState = {
	kind: "topBuyers";
	mode: "add" | "edit";
	targetPath: number[];
	initialValue?: TCampaignTopBuyersProductFilterConfig;
	conditionId?: string;
};
type CustomFieldEditorState = {
	kind: "customField";
	mode: "add" | "edit";
	targetPath: number[];
	initialValue?: TCampaignCustomFieldFilterConfig;
	conditionId?: string;
};
type EditorState = LocationEditorState | TopBuyersEditorState | CustomFieldEditorState | null;

export default function CampaignsFiltersBlock({
	filtros,
	campaignSegmentations,
	addFilterCondition,
	updateFilterCondition,
	addFilterGroup,
	updateFilterGroupOperator,
	removeFilterNode,
}: CampaignsFiltersBlockProps) {
	const [editor, setEditor] = useState<EditorState>(null);
	const activeSegmentations = campaignSegmentations.filter((item) => !item.deletar).map((item) => item.segmentacao);
	const normalizedFilters = normalizeFiltersForSubmit(filtros);
	const {
		data: audiencePreview,
		isLoading: isAudiencePreviewLoading,
		isError: isAudiencePreviewError,
	} = useCampaignUtilPreviewAudience({
		segmentations: activeSegmentations,
		filters: normalizedFilters,
	});

	function openLocationAddAt(path: number[], focusLevel: "estados" | "cidades" | "bairros") {
		setEditor({ kind: "location", mode: "add", targetPath: path, focusLevel });
	}
	function openTopBuyersAddAt(path: number[]) {
		setEditor({ kind: "topBuyers", mode: "add", targetPath: path });
	}
	function openCustomFieldAddAt(path: number[]) {
		setEditor({ kind: "customField", mode: "add", targetPath: path });
	}
	function openEdit(path: number[], condicao: TCampaignFilterCondition) {
		if (condicao.tipo === "LOCALIZAÇÃO") {
			setEditor({
				kind: "location",
				mode: "edit",
				targetPath: path,
				initialValue: condicao.configuracao,
				conditionId: condicao.id,
			});
		} else if (condicao.tipo === "CAMPO_PERSONALIZADO") {
			setEditor({ kind: "customField", mode: "edit", targetPath: path, initialValue: condicao.configuracao, conditionId: condicao.id });
		} else {
			setEditor({
				kind: "topBuyers",
				mode: "edit",
				targetPath: path,
				initialValue: condicao.configuracao,
				conditionId: condicao.id,
			});
		}
	}

	function handleLocationConfirm(config: TCampaignLocationFilterConfig) {
		if (!editor || editor.kind !== "location") return;
		const condicao: TCampaignFilterCondition = {
			tipo: "LOCALIZAÇÃO",
			configuracao: config,
			...(editor.conditionId ? { id: editor.conditionId } : {}),
		};
		if (editor.mode === "add") addFilterCondition(editor.targetPath, condicao);
		else updateFilterCondition(editor.targetPath, condicao);
	}
	function handleTopBuyersConfirm(config: TCampaignTopBuyersProductFilterConfig) {
		if (!editor || editor.kind !== "topBuyers") return;
		const condicao: TCampaignFilterCondition = {
			tipo: "TOP_COMPRADORES_PRODUTO",
			configuracao: config,
			...(editor.conditionId ? { id: editor.conditionId } : {}),
		};
		if (editor.mode === "add") addFilterCondition(editor.targetPath, condicao);
		else updateFilterCondition(editor.targetPath, condicao);
	}

	function handleCustomFieldConfirm(config: TCampaignCustomFieldFilterConfig) {
		if (!editor || editor.kind !== "customField") return;
		const condicao: TCampaignFilterCondition = {
			tipo: "CAMPO_PERSONALIZADO",
			configuracao: config,
			...(editor.conditionId ? { id: editor.conditionId } : {}),
		};
		if (editor.mode === "add") addFilterCondition(editor.targetPath, condicao);
		else updateFilterCondition(editor.targetPath, condicao);
	}

	const rootIsFullNot = filtros.operador === "NOT" && filtros.itens.length >= 1;

	return (
		<ResponsiveMenuSection title="FILTROS" icon={<Filter className="h-4 min-h-4 w-4 min-w-4" />}>
			<p className="text-xs italic text-muted-foreground">Combine filtros para refinar a audiência além das segmentações.</p>

			<StructuralWarnings filtros={filtros} />

			<FilterGroupBody
				node={filtros}
				path={[]}
				isRoot
				updateFilterGroupOperator={updateFilterGroupOperator}
				removeFilterNode={removeFilterNode}
				addFilterGroup={addFilterGroup}
				onEditCondition={openEdit}
				onOpenLocationAdd={openLocationAddAt}
				onOpenTopBuyersAdd={openTopBuyersAddAt}
				onOpenCustomFieldAdd={openCustomFieldAddAt}
			/>

			<div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-3">
				<FastAddButton
					icon={<MapPinned className="h-3.5 w-3.5" />}
					label="ADICIONAR FILTRO DE ESTADO"
					disabled={rootIsFullNot}
					onClick={() => openLocationAddAt([], "estados")}
				/>
				<FastAddButton
					icon={<Building2 className="h-3.5 w-3.5" />}
					label="ADICIONAR FILTRO DE CIDADE"
					disabled={rootIsFullNot}
					onClick={() => openLocationAddAt([], "cidades")}
				/>
				<FastAddButton
					icon={<MapPin className="h-3.5 w-3.5" />}
					label="ADICIONAR FILTRO DE BAIRRO"
					disabled={rootIsFullNot}
					onClick={() => openLocationAddAt([], "bairros")}
				/>
				<FastAddButton
					icon={<Crown className="h-3.5 w-3.5" />}
					label="ADICIONAR TOP COMPRADORES DE PRODUTO"
					disabled={rootIsFullNot}
					onClick={() => openTopBuyersAddAt([])}
				/>
				<FastAddButton
					icon={<ListChecks className="h-3.5 w-3.5" />}
					label="ADICIONAR CAMPO PERSONALIZADO"
					disabled={rootIsFullNot}
					onClick={() => openCustomFieldAddAt([])}
				/>
				{/* <FastAddButton
					icon={<FolderPlus className="h-3.5 w-3.5" />}
					label="ADICIONAR GRUPO"
					disabled={rootIsFullNot}
					onClick={() => addFilterGroup([], "AND")}
				/> */}
			</div>

			<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-primary/5 px-3 py-2">
				<p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">PRÉVIA DA AUDIÊNCIA</p>
				{isAudiencePreviewLoading ? (
					<AnimatedSpinner className="h-4 min-h-4 w-4 min-w-4" />
				) : isAudiencePreviewError ? (
					<span className="text-sm text-destructive">Oops. Algo deu errado ao calcular a audiência.</span>
				) : (
					<div className="flex flex-col gap-1">
						<p className="text-sm">
							<strong>{audiencePreview?.totalClients ?? 0}</strong> CLIENTE(S)
						</p>
					</div>
				)}
			</div>

			{editor?.kind === "location" ? (
				<LocationEditor
					initialValue={editor.initialValue}
					focusLevel={editor.focusLevel}
					onConfirm={handleLocationConfirm}
					closeModal={() => setEditor(null)}
				/>
			) : null}
			{editor?.kind === "topBuyers" ? (
				<TopBuyersProductEditor initialValue={editor.initialValue} onConfirm={handleTopBuyersConfirm} closeModal={() => setEditor(null)} />
			) : null}
			{editor?.kind === "customField" ? (
				<CustomFieldEditor initialValue={editor.initialValue} onConfirm={handleCustomFieldConfirm} closeModal={() => setEditor(null)} />
			) : null}
		</ResponsiveMenuSection>
	);
}

function StructuralWarnings({ filtros }: { filtros: TCampaignFiltersTree }) {
	const issues: string[] = [];

	function walk(node: TCampaignFilterTreeNode | TCampaignFiltersTree, label: string, isRoot: boolean) {
		if (node.tipo !== "GRUPO") return;
		if (node.operador === "NOT" && node.itens.length !== 1) {
			issues.push(`${label}: grupo NÃO deve conter exatamente 1 item.`);
		}
		if ((node.operador === "AND" || node.operador === "OR") && node.itens.length === 0 && !isRoot) {
			issues.push(`${label}: grupo vazio - adicione ao menos um filtro ou remova o grupo.`);
		}
		node.itens.forEach((child, idx) => walk(child, `${label} > item ${idx + 1}`, false));
	}
	walk(filtros, "Raiz", true);

	if (issues.length === 0) return null;
	return (
		<div className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
			<ul className="list-disc pl-4">
				{issues.map((issue) => (
					<li key={issue}>{issue}</li>
				))}
			</ul>
		</div>
	);
}

function FastAddButton({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			className="flex items-center gap-1.5"
			disabled={disabled}
			title={disabled ? "Remova itens até restar um para usar NÃO" : undefined}
			onClick={onClick}
		>
			<Plus className="h-3.5 w-3.5" />
			{icon}
			<span>{label}</span>
		</Button>
	);
}

type FilterGroupBodyProps = {
	node: TCampaignFiltersTree | Extract<TCampaignFilterTreeNode, { tipo: "GRUPO" }>;
	path: number[];
	isRoot?: boolean;
	updateFilterGroupOperator: TUseCampaignState["updateFilterGroupOperator"];
	removeFilterNode: TUseCampaignState["removeFilterNode"];
	addFilterGroup: TUseCampaignState["addFilterGroup"];
	onEditCondition: (path: number[], condicao: TCampaignFilterCondition) => void;
	onOpenLocationAdd: (path: number[], focusLevel: "estados" | "cidades" | "bairros") => void;
	onOpenTopBuyersAdd: (path: number[]) => void;
	onOpenCustomFieldAdd: (path: number[]) => void;
};
function FilterGroupBody({
	node,
	path,
	isRoot,
	updateFilterGroupOperator,
	removeFilterNode,
	addFilterGroup,
	onEditCondition,
	onOpenLocationAdd,
	onOpenTopBuyersAdd,
	onOpenCustomFieldAdd,
}: FilterGroupBodyProps) {
	if (isRoot && node.itens.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border/30 p-3 text-center text-xs italic text-muted-foreground">
				Nenhum filtro adicionado. Use os botões abaixo para começar.
			</div>
		);
	}

	const groupIsFullNot = node.operador === "NOT" && node.itens.length >= 1;

	return (
		<div className={cn("flex w-full flex-col gap-2", !isRoot && "border-l-2 border-border pl-3")}>
			{!isRoot ? (
				<GroupHeader
					operador={node.operador}
					itemCount={node.itens.length}
					onChange={(op) => updateFilterGroupOperator(path, op)}
					onRemove={() => removeFilterNode(path)}
				/>
			) : null}

			{node.itens.map((child, idx) => {
				const childPath = [...path, idx];
				if (child.tipo === "GRUPO") {
					return (
						<FilterGroupBody
							key={childPath.join("-")}
							node={child}
							path={childPath}
							updateFilterGroupOperator={updateFilterGroupOperator}
							removeFilterNode={removeFilterNode}
							addFilterGroup={addFilterGroup}
							onEditCondition={onEditCondition}
							onOpenLocationAdd={onOpenLocationAdd}
							onOpenTopBuyersAdd={onOpenTopBuyersAdd}
							onOpenCustomFieldAdd={onOpenCustomFieldAdd}
						/>
					);
				}
				return (
					<FilterConditionCard
						key={childPath.join("-")}
						condicao={child.condicao}
						onEdit={() => onEditCondition(childPath, child.condicao)}
						onRemove={() => removeFilterNode(childPath)}
					/>
				);
			})}

			{!isRoot ? (
				<div className="flex flex-wrap items-center gap-2">
					<FastAddButton
						icon={<MapPin className="h-3.5 w-3.5" />}
						label="LOCALIZAÇÃO"
						disabled={groupIsFullNot}
						onClick={() => onOpenLocationAdd(path, "estados")}
					/>
					<FastAddButton
						icon={<Crown className="h-3.5 w-3.5" />}
						label="TOP COMPRADORES"
						disabled={groupIsFullNot}
						onClick={() => onOpenTopBuyersAdd(path)}
					/>
					<FastAddButton
						icon={<ListChecks className="h-3.5 w-3.5" />}
						label="CAMPO"
						disabled={groupIsFullNot}
						onClick={() => onOpenCustomFieldAdd(path)}
					/>
					<FastAddButton
						icon={<FolderPlus className="h-3.5 w-3.5" />}
						label="SUBGRUPO"
						disabled={groupIsFullNot}
						onClick={() => addFilterGroup(path, "AND")}
					/>
				</div>
			) : null}
		</div>
	);
}

function GroupHeader({
	operador,
	itemCount,
	onChange,
	onRemove,
}: {
	operador: TCampaignFilterLogicOperatorEnum;
	itemCount: number;
	onChange: (operador: TCampaignFilterLogicOperatorEnum) => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md bg-primary/5 px-2 py-1">
			<div className="flex flex-wrap items-center gap-1">
				{(Object.keys(OPERATOR_LABELS) as TCampaignFilterLogicOperatorEnum[]).map((op) => {
					const disabled = op === "NOT" && itemCount > 1;
					const active = operador === op;
					return (
						<button
							key={op}
							type="button"
							disabled={disabled}
							onClick={() => !disabled && onChange(op)}
							title={disabled ? "Remova itens até restar um para usar NÃO" : OPERATOR_LABELS[op].description}
							className={cn(
								"rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors",
								active ? "border-border bg-primary text-foreground-foreground" : "border-border text-foreground/70 hover:bg-primary/10",
								disabled && "cursor-not-allowed opacity-50",
							)}
						>
							{OPERATOR_LABELS[op].label}
						</button>
					);
				})}
			</div>
			<button
				type="button"
				aria-label="Remover grupo"
				className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
				onClick={onRemove}
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

function FilterConditionCard({ condicao, onEdit, onRemove }: { condicao: TCampaignFilterCondition; onEdit: () => void; onRemove: () => void }) {
	return (
		<div className="flex w-full items-start justify-between gap-2 rounded-md border border-border/15 bg-background p-2">
			<div className="flex min-w-0 flex-1 items-start gap-2">
				{condicao.tipo === "LOCALIZAÇÃO" ? (
					<MapPin className="h-4 min-h-4 w-4 min-w-4 text-foreground/70" />
				) : condicao.tipo === "CAMPO_PERSONALIZADO" ? (
					<ListChecks className="h-4 min-h-4 w-4 min-w-4 text-foreground/70" />
				) : (
					<Crown className="h-4 min-h-4 w-4 min-w-4 text-foreground/70" />
				)}
				<ConditionSummary condicao={condicao} />
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<button
					type="button"
					aria-label="Editar filtro"
					onClick={onEdit}
					className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
				>
					<Pencil className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					aria-label="Remover filtro"
					onClick={onRemove}
					className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

function ConditionSummary({ condicao }: { condicao: TCampaignFilterCondition }) {
	if (condicao.tipo === "LOCALIZAÇÃO") {
		return (
			<div className="flex min-w-0 flex-col">
				<span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Localização</span>
				<LocationDetails condicao={condicao} />
			</div>
		);
	}
	if (condicao.tipo === "CAMPO_PERSONALIZADO") {
		return (
			<div className="flex min-w-0 flex-col">
				<span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Campo personalizado</span>
				<CustomFieldDetails condicao={condicao} />
			</div>
		);
	}
	return (
		<div className="flex min-w-0 flex-col">
			<span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Top compradores de produto</span>
			<TopBuyersDetails condicao={condicao} />
		</div>
	);
}

function CustomFieldDetails({ condicao }: { condicao: Extract<TCampaignFilterCondition, { tipo: "CAMPO_PERSONALIZADO" }> }) {
	const { campoId, operador, valores } = condicao.configuracao;
	const { data: field, isLoading } = useCustomFieldById({ fieldId: campoId });
	const titlesByValue = new Map((field?.opcoes ?? []).map((option) => [option.valor, option.titulo]));
	const usesValues = operador === "IGUAL" || operador === "DIFERENTE";
	return (
		<span className="truncate text-sm">
			<strong>{isLoading ? "carregando..." : (field?.titulo ?? "campo não encontrado")}</strong>{" "}
			<span className="text-muted-foreground">{CUSTOM_FIELD_FILTER_OPERATOR_LABELS[operador].toLowerCase()}</span>
			{usesValues ? <> {valores.map((valor) => titlesByValue.get(valor) ?? valor).join(", ")}</> : null}
		</span>
	);
}

function LocationDetails({ condicao }: { condicao: Extract<TCampaignFilterCondition, { tipo: "LOCALIZAÇÃO" }> }) {
	const rows: { label: string; values: string[] | undefined }[] = [
		{ label: "ESTADOS", values: condicao.configuracao.estados },
		{ label: "CIDADES", values: condicao.configuracao.cidades },
		{ label: "BAIRROS", values: condicao.configuracao.bairros },
	];
	const nonEmpty = rows.filter((row) => row.values && row.values.length > 0);
	if (nonEmpty.length === 0) return null;
	return (
		<div className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
			{nonEmpty.map((row) => (
				<div key={row.label} className="truncate">
					<span className="font-medium text-foreground/60">{row.label}:</span> <strong>{row.values?.join(", ")}</strong>
				</div>
			))}
		</div>
	);
}

function TopBuyersDetails({ condicao }: { condicao: Extract<TCampaignFilterCondition, { tipo: "TOP_COMPRADORES_PRODUTO" }> }) {
	const { produtoId, janela, top } = condicao.configuracao;
	const { data: product, isLoading } = useProductById({ id: produtoId });
	const janelaLabel = janela === "GERAL" ? "geral" : janela === "30_DIAS" ? "últimos 30 dias" : "últimos 90 dias";
	return (
		<span className="truncate text-sm">
			Top {top} compradores de <strong>{isLoading ? "carregando..." : (product?.descricao ?? "produto não encontrado")}</strong>{" "}
			<span className="text-muted-foreground">({janelaLabel})</span>
		</span>
	);
}
