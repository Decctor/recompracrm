"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import MembershipPermissionsMatrix from "@/components/permissions/MembershipPermissionsMatrix";
import PermissionsScope from "@/components/Modals/Users/Blocks/Utils/PermissionsScope";
import { resolveDiscountAuthority } from "@/lib/permissions/discounts";
import { useUsers } from "@/lib/queries/users";
import type { TDiscountLimitTypeEnum } from "@/schemas/enums";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import { Shield } from "lucide-react";

type MembershipPermissionsEditorProps = {
	userId?: string;
	permissions: TOrganizationMemberPermissions;
	updatePermissions: (permissions: TOrganizationMemberPermissions) => void;
	organizationHasERPAccess: boolean;
	sectionTitle?: string;
};

export function MembershipPermissionsEditor({
	userId,
	permissions,
	updatePermissions,
	organizationHasERPAccess,
	sectionTitle = "PERMISSÕES",
}: MembershipPermissionsEditorProps) {
	const { data: users } = useUsers({ initialFilters: {} });
	const descontos = resolveDiscountAuthority(permissions);

	function patchPermissions(patch: Partial<TOrganizationMemberPermissions>) {
		updatePermissions({
			...permissions,
			...patch,
			empresa: patch.empresa ?? permissions.empresa,
			resultados: patch.resultados ?? permissions.resultados,
			usuarios: patch.usuarios ?? permissions.usuarios,
			vendas: patch.vendas ?? permissions.vendas,
			compras: patch.compras ?? permissions.compras,
			atendimentos: patch.atendimentos ?? permissions.atendimentos,
			fiscal: patch.fiscal ?? permissions.fiscal,
			financeiro: patch.financeiro ?? permissions.financeiro,
			integracoes: patch.integracoes ?? permissions.integracoes,
		});
	}

	return (
		<ResponsiveMenuSection title={sectionTitle} icon={<Shield className="h-4 min-h-4 w-4 min-w-4" />}>
			<MembershipPermissionsMatrix
				permissions={permissions}
				organizationHasERPAccess={organizationHasERPAccess}
				onPermissionsChange={updatePermissions}
				headerSlot={
					<div className="flex w-full flex-col gap-2 rounded-md border border-border px-2 py-2">
						<PermissionsScope
							referenceId={userId ?? null}
							options={users?.map((user) => ({ id: user.id, label: user.nome, value: user.id, image_url: user.avatarUrl })) ?? []}
							selected={permissions.resultados.escopo ?? null}
							handleScopeSelection={(value) =>
								updatePermissions({
									...permissions,
									resultados: { ...permissions.resultados, escopo: value },
								})
							}
						/>
						<p className="text-[0.65rem] text-muted-foreground">Define o escopo de visualização de resultados e metas.</p>
					</div>
				}
			/>
			{organizationHasERPAccess && descontos.aplicar ? (
				<div className="flex w-full flex-col gap-2 rounded-md border border-border px-2 py-2">
					<h3 className="text-xs font-medium tracking-tight">LIMITES DE DESCONTO (VENDAS)</h3>
					<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
						<SelectInput
							label="TIPO DO LIMITE DE DESCONTO"
							value={descontos.limiteTipo}
							options={[
								{ id: "FIXO", value: "FIXO", label: "VALOR FIXO (R$)" },
								{ id: "PERCENTUAL", value: "PERCENTUAL", label: "PERCENTUAL (%)" },
							]}
							resetOptionLabel="SEM LIMITE"
							handleChange={(value) =>
								patchPermissions({
									vendas: {
										...permissions.vendas,
										descontos: { ...descontos, limiteTipo: value as TDiscountLimitTypeEnum, limiteValor: descontos.limiteValor ?? 0 },
									},
								})
							}
							onReset={() =>
								patchPermissions({
									vendas: {
										...permissions.vendas,
										descontos: { ...descontos, limiteTipo: null, limiteValor: null },
									},
								})
							}
						/>
						{descontos.limiteTipo ? (
							<NumberInput
								label={descontos.limiteTipo === "PERCENTUAL" ? "LIMITE DE DESCONTO (%)" : "LIMITE DE DESCONTO (R$)"}
								placeholder={descontos.limiteTipo === "PERCENTUAL" ? "Ex: 5 (para 5%)" : "Ex: 20,00"}
								value={descontos.limiteValor}
								handleChange={(value) =>
									patchPermissions({
										vendas: {
											...permissions.vendas,
											descontos: { ...descontos, limiteValor: Math.max(0, value) },
										},
									})
								}
							/>
						) : null}
					</div>
				</div>
			) : null}
		</ResponsiveMenuSection>
	);
}

export default MembershipPermissionsEditor;
