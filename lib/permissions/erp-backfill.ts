import { resolveInventoryPermissions } from "@/lib/permissions/inventory";
import { resolveProductionPermissions } from "@/lib/permissions/productions";
import { resolveProductPermissions } from "@/lib/permissions/products";
import { resolveSalesOperationPermissions } from "@/lib/permissions/sales";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Grava no JSONB as permissões do ERP que hoje vêm do fallback (`vendas.operarCaixa`,
 * `vendas.movimentarCaixa`, `vendas.conferirCaixa`, `vendas.configurar`, `produtos`, `estoque`,
 * `producao`), com o valor que o fallback já resolve — ou seja, o que o membro já conseguia fazer.
 *
 * Só preenche o que falta: chave presente (mesmo `false`) é escolha de quem administra e nunca é
 * sobrescrita. Por isso rodar duas vezes é inofensivo. Devolve `null` quando não há nada a gravar.
 */
export function materializeERPPermissions(permissoes: TOrganizationMemberPermissions): TOrganizationMemberPermissions | null {
	const next: TOrganizationMemberPermissions = structuredClone(permissoes);
	let changed = false;

	const salesOperation = resolveSalesOperationPermissions(permissoes);
	for (const key of Object.keys(salesOperation) as (keyof typeof salesOperation)[]) {
		if (next.vendas[key] == null) {
			next.vendas[key] = salesOperation[key];
			changed = true;
		}
	}

	if (!next.produtos) {
		next.produtos = resolveProductPermissions(permissoes);
		changed = true;
	}
	if (!next.estoque) {
		next.estoque = resolveInventoryPermissions(permissoes);
		changed = true;
	}
	if (!next.producao) {
		next.producao = resolveProductionPermissions(permissoes);
		changed = true;
	}

	return changed ? next : null;
}
