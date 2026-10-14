"use client";

import MultipleSelectInput from "@/components/Inputs/MultipleSelectInput";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { useProductGroups } from "@/lib/queries/products";
import type { TPreparationStationListItem } from "@/lib/queries/preparation-stations";
import type { TUseInternalPreparationStationState } from "@/state-hooks/use-internal-preparation-station-state";
import { ListFilter, Package, X } from "lucide-react";
import { useMemo } from "react";

function normalizeGroup(grupo: string) {
	return grupo.trim().toLocaleLowerCase("pt-BR");
}

type PreparationStationRulesBlockProps = {
	rules: TUseInternalPreparationStationState["state"]["rules"];
	addRule: TUseInternalPreparationStationState["addRule"];
	removeRule: TUseInternalPreparationStationState["removeRule"];
	replaceGroupRules: TUseInternalPreparationStationState["replaceGroupRules"];
	/** Todas as estações da organização: mostra quem já tem cada grupo (o servidor recusa o conflito). */
	stations: TPreparationStationListItem[];
	currentStationId: string | null;
};

export default function PreparationStationRulesBlock({
	rules,
	addRule,
	removeRule,
	replaceGroupRules,
	stations,
	currentStationId,
}: PreparationStationRulesBlockProps) {
	const { data: productGroups } = useProductGroups();

	const groupOwners = useMemo(() => {
		const owners = new Map<string, string>();
		for (const station of stations) {
			if (station.id === currentStationId) continue;
			for (const regra of station.regras) if (regra.valor.criterio === "GRUPO") owners.set(normalizeGroup(regra.valor.grupo), station.nome);
		}
		return owners;
	}, [stations, currentStationId]);

	const selectedGroups = rules.flatMap((rule) => (rule.valor.criterio === "GRUPO" ? [rule.valor.grupo] : []));
	const productRules = rules.flatMap((rule) => (rule.valor.criterio === "PRODUTO" ? [{ ...rule, valor: rule.valor }] : []));

	// Opções = DISTINCT de grupos do cadastro + grupos já gravados em regras que não aparecem mais
	// lá (renomeados, sem produto): nada configurado fica invisível.
	const groupOptions = useMemo(() => {
		const options = (productGroups ?? []).flatMap((grupo) => (grupo ? [grupo] : []));
		const known = new Set(options.map(normalizeGroup));
		for (const grupo of selectedGroups) if (!known.has(normalizeGroup(grupo))) options.push(grupo);
		return options.map((grupo, index) => {
			const owner = groupOwners.get(normalizeGroup(grupo));
			return { id: index + 1, value: grupo, label: owner ? `${grupo} (em ${owner})` : grupo };
		});
	}, [productGroups, selectedGroups, groupOwners]);

	// A regra guarda o texto como foi escolhido; a opção pode diferir em caixa/espaços.
	const selectedOptionValues = selectedGroups.map(
		(grupo) => groupOptions.find((option) => normalizeGroup(option.value) === normalizeGroup(grupo))?.value ?? grupo,
	);

	return (
		<ResponsiveMenuSection title="O QUE ESTA ESTAÇÃO PREPARA" icon={<ListFilter className="h-4 w-4" />}>
			<p className="text-xs text-muted-foreground">
				Um produto escolhido aqui vale mais que o grupo dele. Adicionais seguem o item a que pertencem. O que nenhuma regra capturar vai para a estação
				padrão.
			</p>
			<MultipleSelectInput
				label="GRUPOS DE PRODUTOS"
				selected={selectedOptionValues}
				options={groupOptions}
				resetOptionLabel="NENHUM GRUPO"
				handleChange={(values) => replaceGroupRules(values)}
				onReset={() => replaceGroupRules([])}
			/>
			<div className="flex w-full flex-col gap-1.5">
				<SelectProductWithVariants
					label="PRODUTOS ESPECÍFICOS"
					value={null}
					resetOptionLabel="ADICIONAR PRODUTO"
					// Produto com variantes só expõe as variantes para clique: a regra é sempre do produto.
					handleChange={(selection) => {
						if (!selection) return;
						addRule({
							criterio: "PRODUTO",
							valor: { criterio: "PRODUTO", produtoId: selection.product.id },
							produto: { id: selection.product.id, nome: selection.product.nome },
						});
					}}
					onReset={() => {}}
				/>
				{productRules.length > 0 ? (
					<div className="flex w-full flex-wrap gap-1.5">
						{productRules.map((rule) => (
							<span
								key={rule.valor.produtoId}
								className="flex items-center gap-1.5 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-0.5 text-xs font-medium"
							>
								<Package className="h-3 w-3 text-muted-foreground" />
								<span className="max-w-[220px] truncate">{rule.produto?.nome ?? "Produto"}</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Remover ${rule.produto?.nome ?? "produto"}`}
									onClick={() => removeRule(rule.valor)}
								>
									<X className="h-3 w-3" />
								</Button>
							</span>
						))}
					</div>
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}
