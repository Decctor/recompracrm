import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ORGANIZATION_OWNER_PERMISSIONS } from "@/config";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import { OrganizationMemberPermissionsSchema } from "@/schemas/organizations";
import { materializeERPPermissions } from "./erp-backfill";
import { resolveInventoryPermissions } from "./inventory";
import {
	applyMembershipPermissionChanges,
	getAllMembershipPermissionPaths,
	readMembershipPermissionValue,
} from "./membership-matrix";
import { resolveProductionPermissions } from "./productions";
import { resolveProductPermissions } from "./products";
import { resolveSalesOperationPermissions } from "./sales";

/** Membro "antigo": JSONB sem nenhuma das chaves novas do ERP. */
function legacyMember({
	empresa = { visualizar: true, editar: false },
	vendas = { visualizar: true, criar: true, editar: false, excluir: false },
}: {
	empresa?: TOrganizationMemberPermissions["empresa"];
	vendas?: Pick<TOrganizationMemberPermissions["vendas"], "visualizar" | "criar" | "editar" | "excluir">;
} = {}): TOrganizationMemberPermissions {
	return {
		empresa,
		resultados: { visualizar: true, visualizarSensiveis: false, criarMetas: false, visualizarMetas: true, editarMetas: false, excluirMetas: false },
		usuarios: { visualizar: false, criar: false, editar: false, excluir: false },
		vendas,
		compras: { visualizar: true, criar: false, editar: false, excluir: false },
		fiscal: { visualizar: false, configurar: false, emitir: false, cancelar: false },
		atendimentos: { visualizar: true, iniciar: true, responder: true, finalizar: true },
	};
}

test("legacy members keep what they could already do through the fallback", () => {
	const cashier = legacyMember();
	assert.deepEqual(resolveSalesOperationPermissions(cashier), { operarCaixa: true, movimentarCaixa: true, conferirCaixa: false, configurar: false });
	assert.deepEqual(resolveProductPermissions(cashier), { visualizar: true, criar: true, editar: true, alterarPrecos: true });
	assert.deepEqual(resolveInventoryPermissions(cashier), { visualizar: true, movimentar: true, ajustar: true });
	assert.equal(resolveProductionPermissions(cashier).concluir, true);

	const viewer = legacyMember({ empresa: { visualizar: false, editar: false }, vendas: { visualizar: true, criar: false, editar: false, excluir: false } });
	assert.deepEqual(resolveSalesOperationPermissions(viewer), { operarCaixa: false, movimentarCaixa: false, conferirCaixa: false, configurar: false });
	assert.deepEqual(resolveInventoryPermissions(viewer), { visualizar: false, movimentar: false, ajustar: false });
	assert.equal(resolveProductionPermissions(viewer).visualizar, false);

	const manager = legacyMember({ empresa: { visualizar: true, editar: true }, vendas: { visualizar: true, criar: true, editar: true, excluir: true } });
	assert.deepEqual(resolveSalesOperationPermissions(manager), { operarCaixa: true, movimentarCaixa: true, conferirCaixa: true, configurar: true });
});

test("explicit keys win over the fallback, including false", () => {
	const member = legacyMember({ empresa: { visualizar: true, editar: true } });
	member.vendas.movimentarCaixa = false;
	member.vendas.configurar = false;
	member.estoque = { visualizar: true, movimentar: false, ajustar: false };
	member.produtos = { visualizar: true, criar: false, editar: true, alterarPrecos: false };

	assert.equal(resolveSalesOperationPermissions(member).movimentarCaixa, false);
	assert.equal(resolveSalesOperationPermissions(member).configurar, false);
	assert.equal(resolveSalesOperationPermissions(member).operarCaixa, true);
	assert.deepEqual(resolveInventoryPermissions(member), { visualizar: true, movimentar: false, ajustar: false });
	assert.equal(resolveProductPermissions(member).alterarPrecos, false);
});

test("backfill writes the fallback values and never overrides an explicit choice", () => {
	const member = legacyMember();
	member.vendas.operarCaixa = false;
	member.estoque = { visualizar: true, movimentar: false, ajustar: false };

	const next = materializeERPPermissions(member);
	assert.ok(next);
	assert.equal(next.vendas.operarCaixa, false);
	assert.equal(next.vendas.movimentarCaixa, true);
	assert.equal(next.vendas.conferirCaixa, false);
	assert.equal(next.vendas.configurar, false);
	assert.deepEqual(next.estoque, { visualizar: true, movimentar: false, ajustar: false });
	assert.deepEqual(next.produtos, { visualizar: true, criar: true, editar: true, alterarPrecos: true });
	assert.deepEqual(next.producao, { visualizar: true, criar: true, editar: true, excluir: true, concluir: true });
	assert.equal(member.vendas.movimentarCaixa, undefined, "input must not be mutated");

	// Nada muda de efeito: o que o membro resolve antes e depois do backfill é igual.
	for (const path of getAllMembershipPermissionPaths({ organizationHasERPAccess: true })) {
		assert.equal(readMembershipPermissionValue(next, path), readMembershipPermissionValue(member, path), path);
	}

	assert.equal(materializeERPPermissions(next), null, "second run is a no-op");
	assert.equal(OrganizationMemberPermissionsSchema.safeParse(next).success, true);
});

test("matrix toggles materialize the ERP keys", () => {
	const member = legacyMember({ empresa: { visualizar: true, editar: true } });

	const withoutMovements = applyMembershipPermissionChanges(member, [{ path: "vendas.movimentarCaixa", value: false }]);
	assert.equal(withoutMovements.vendas.movimentarCaixa, false);
	assert.equal(withoutMovements.vendas.operarCaixa, true);
	assert.equal(withoutMovements.vendas.configurar, true);
	assert.equal(readMembershipPermissionValue(withoutMovements, "vendas.movimentarCaixa"), false);

	const withoutPrices = applyMembershipPermissionChanges(member, [{ path: "produtos.alterarPrecos", value: false }]);
	assert.deepEqual(withoutPrices.produtos, { visualizar: true, criar: true, editar: true, alterarPrecos: false });

	const withoutAdjustments = applyMembershipPermissionChanges(member, [{ path: "estoque.ajustar", value: false }]);
	assert.deepEqual(withoutAdjustments.estoque, { visualizar: true, movimentar: true, ajustar: false });
	assert.equal(readMembershipPermissionValue(withoutAdjustments, "estoque.ajustar"), false);
});

test("organization owners get every ERP permission", () => {
	for (const path of getAllMembershipPermissionPaths({ organizationHasERPAccess: true })) {
		assert.equal(readMembershipPermissionValue(DEFAULT_ORGANIZATION_OWNER_PERMISSIONS, path), true, path);
	}
});
