"use client";

import type { TGetCustomFieldsOutputDefault } from "@/app/api/custom-fields/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlCustomField from "@/components/Modals/CustomFields/ControlCustomField";
import NewCustomField from "@/components/Modals/CustomFields/NewCustomField";
import SettingsPanelSection from "@/components/Settings/SettingsPanelSection";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { NATIVE_CUSTOM_FIELD_LIST } from "@/lib/custom-fields/native-catalog";
import { getErrorMessage } from "@/lib/errors";
import { createCustomField, updateCustomField } from "@/lib/mutations/custom-fields";
import { useCustomFields } from "@/lib/queries/custom-fields";
import { cn } from "@/lib/utils";
import { CUSTOM_FIELD_TYPE_LABELS } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleOff, ListChecks, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type TCustomField = TGetCustomFieldsOutputDefault["customFields"][number];

type SettingsCustomFieldsProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

/**
 * Seção "Campos personalizados": o que a organização coleta sobre o cliente além do cadastro
 * básico. Campos próprios nascem aqui (ou inline, no construtor de campanhas de pesquisa); campos
 * prontos do catálogo são ativados com um clique e ganham segmentação e write-through de graça.
 */
export default function SettingsCustomFields({ membership }: SettingsCustomFieldsProps) {
	const canEdit = membership.permissoes.empresa.editar;
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error } = useCustomFields({ entidade: "CLIENTE" });
	const [newFieldOpen, setNewFieldOpen] = useState(false);
	const [editFieldId, setEditFieldId] = useState<string | null>(null);

	const customFields = useMemo(() => data?.customFields ?? [], [data]);
	const activeFields = customFields.filter((field) => field.ativo);
	const inactiveFields = customFields.filter((field) => !field.ativo);
	const takenNativeKeys = new Set(customFields.map((field) => field.chaveNativa).filter(Boolean));
	const missingNativeFields = NATIVE_CUSTOM_FIELD_LIST.filter((nativeField) => !takenNativeKeys.has(nativeField.chave));

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["custom-fields"] });

	const enableNativeFieldMutation = useMutation({
		mutationFn: (chave: string) =>
			createCustomField({ customField: { entidade: "CLIENTE", chaveNativa: chave, titulo: null, tipo: null, descricao: null, opcoes: null, ativo: true } }),
		onSuccess: async (response) => {
			toast.success(response.message);
			await invalidate();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	// Desativar/reativar passa pela mesma rota de atualização: os demais campos vão como estão.
	const toggleActiveMutation = useMutation({
		mutationFn: (field: TCustomField) =>
			updateCustomField({
				customFieldId: field.id,
				customField: { titulo: field.titulo, descricao: field.descricao, opcoes: field.opcoes, ativo: !field.ativo },
			}),
		onSuccess: async (response) => {
			toast.success(response.message);
			await invalidate();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	return (
		<div className="flex w-full flex-col gap-6">
			{newFieldOpen ? <NewCustomField closeModal={() => setNewFieldOpen(false)} /> : null}
			{editFieldId ? <ControlCustomField customFieldId={editFieldId} closeModal={() => setEditFieldId(null)} /> : null}

			<SettingsPanelSection
				title="Campos ativos"
				icon={<ListChecks className="h-4 w-4" />}
				description="Perguntas que o cadastro do ponto de interação e as campanhas de pesquisa podem fazer. Campos de escolha também servem de filtro de público."
				action={
					<Button size="sm" className="flex items-center gap-2" disabled={!canEdit} onClick={() => setNewFieldOpen(true)}>
						<Plus className="h-4 w-4" />
						NOVO CAMPO
					</Button>
				}
			>
				{activeFields.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-muted/30 px-4 py-10 text-center">
						<ListChecks className="h-8 w-8 text-muted-foreground" />
						<p className="text-sm font-semibold">Nenhum campo ativo</p>
						<p className="max-w-md text-xs text-muted-foreground">
							Crie um campo próprio (ex.: "Sabor preferido") ou ative um campo pronto abaixo para começar a coletar dados dos clientes.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
						{activeFields.map((field) => (
							<CustomFieldCard
								key={field.id}
								field={field}
								canEdit={canEdit}
								isToggling={toggleActiveMutation.isPending}
								onEdit={() => setEditFieldId(field.id)}
								onToggleActive={() => toggleActiveMutation.mutate(field)}
							/>
						))}
					</div>
				)}
			</SettingsPanelSection>

			{missingNativeFields.length > 0 ? (
				<SettingsPanelSection
					title="Campos prontos"
					icon={<Sparkles className="h-4 w-4" />}
					description="A plataforma já entende estes campos: segmentação e aniversariantes funcionam sem configuração. Ative com um clique."
				>
					<div className="flex flex-wrap gap-2">
						{missingNativeFields.map((nativeField) => (
							<Button
								key={nativeField.chave}
								variant="outline"
								size="sm"
								className="gap-1.5"
								disabled={!canEdit || enableNativeFieldMutation.isPending}
								onClick={() => enableNativeFieldMutation.mutate(nativeField.chave)}
							>
								<Plus className="h-3.5 w-3.5" />
								{nativeField.titulo.toUpperCase()}
								<span className="text-[10px] font-normal text-muted-foreground">· {CUSTOM_FIELD_TYPE_LABELS[nativeField.tipo]}</span>
							</Button>
						))}
					</div>
				</SettingsPanelSection>
			) : null}

			{inactiveFields.length > 0 ? (
				<SettingsPanelSection
					title="Campos inativos"
					icon={<CircleOff className="h-4 w-4" />}
					description="Mantêm as respostas já gravadas, mas não aceitam novas nem entram em filtros. Reative quando precisar."
				>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
						{inactiveFields.map((field) => (
							<CustomFieldCard
								key={field.id}
								field={field}
								canEdit={canEdit}
								isToggling={toggleActiveMutation.isPending}
								onEdit={() => setEditFieldId(field.id)}
								onToggleActive={() => toggleActiveMutation.mutate(field)}
							/>
						))}
					</div>
				</SettingsPanelSection>
			) : null}
		</div>
	);
}

function CustomFieldCard({
	field,
	canEdit,
	isToggling,
	onEdit,
	onToggleActive,
}: {
	field: TCustomField;
	canEdit: boolean;
	isToggling: boolean;
	onEdit: () => void;
	onToggleActive: () => void;
}) {
	const options = field.opcoes ?? [];
	return (
		<div className={cn("flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-2xs", !field.ativo && "opacity-70")}>
			<div className="flex items-start justify-between gap-2">
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex flex-wrap items-center gap-1.5">
						<h3 className="truncate text-sm font-semibold tracking-tight">{field.titulo}</h3>
						{field.chaveNativa ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
								<Sparkles className="h-2.5 w-2.5" />
								pronto
							</span>
						) : null}
					</div>
					<span className="text-xs text-muted-foreground">{CUSTOM_FIELD_TYPE_LABELS[field.tipo]}</span>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button variant="ghost" size="icon-sm" disabled={!canEdit} onClick={onEdit} aria-label="Editar campo">
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant={field.ativo ? "ghost-destructive" : "ghost"}
						size="icon-sm"
						disabled={!canEdit || isToggling}
						onClick={onToggleActive}
						aria-label={field.ativo ? "Desativar campo" : "Reativar campo"}
						title={field.ativo ? "Desativar" : "Reativar"}
					>
						{field.ativo ? <CircleOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
					</Button>
				</div>
			</div>
			{field.descricao ? <p className="text-xs leading-snug text-muted-foreground">{field.descricao}</p> : null}
			{options.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{options.slice(0, 6).map((option) => (
						<span key={option.valor} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground/80">
							{option.titulo}
						</span>
					))}
					{options.length > 6 ? <span className="px-1 text-[11px] text-muted-foreground">+{options.length - 6}</span> : null}
				</div>
			) : null}
		</div>
	);
}
