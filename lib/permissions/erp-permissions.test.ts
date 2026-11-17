import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ORGANIZATION_OWNER_PERMISSIONS } from "@/config";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import { OrganizationMemberPermissionsSchema } from "@/schemas/organizations";
import { materializeERPPermissions } from "./erp-backfill";
import { campaignWriteRequiresActivation, resolveCampaignPermissions } from "./campaigns";
import { resolveCashbackPermissions } from "./cashback";
import { resolveInventoryPermissions } from "./inventory";
import { applyMembershipPermissionChanges, getAllMembershipPermissionPaths, readMembershipPermissionValue } from "./membership-matrix";
import { resolveProductionPermissions } from "./productions";
import { resolveProductPermissions } from "./products";
import { resolveSalesOperationPermissions } from "./sales";
import { acceptIncomingCost, canExportClients, canViewCosts, maskCost } from "./sensitive-data";

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

	const viewer = legacyMember({
		empresa: { visualizar: false, editar: false },
		vendas: { visualizar: true, criar: false, editar: false, excluir: false },
	});
	assert.deepEqual(resolveSalesOperationPermissions(viewer), { operarCaixa: false, movimentarCaixa: false, conferirCaixa: false, configurar: false });
	assert.deepEqual(resolveInventoryPermissions(viewer), { visualizar: false, movimentar: false, ajustar: false });
	assert.equal(resolveProductionPermissions(viewer).visualizar, false);

	const manager = legacyMember({
		empresa: { visualizar: true, editar: true },
		vendas: { visualizar: true, criar: true, editar: true, excluir: true },
	});
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
	assert.deepEqual(next.dadosSensiveis, { visualizarCustos: false, exportarClientes: false });
	assert.deepEqual(next.campanhas, { visualizar: true, editar: true, ativar: false });
	assert.deepEqual(next.cashback, { visualizar: true, configurar: false });
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

test("cost visibility inherits resultados.visualizarSensiveis until the new key is set", () => {
	const hidden = legacyMember();
	assert.equal(canViewCosts(hidden), false);

	const sensitive = legacyMember();
	sensitive.resultados.visualizarSensiveis = true;
	assert.equal(canViewCosts(sensitive), true);
	assert.deepEqual(materializeERPPermissions(sensitive)?.dadosSensiveis, { visualizarCustos: true, exportarClientes: false });

	// A chave nova manda, nos dois sentidos — e a antiga deixa de importar.
	const granted = applyMembershipPermissionChanges(hidden, [{ path: "dadosSensiveis.visualizarCustos", value: true }]);
	assert.equal(canViewCosts(granted), true);
	assert.equal(granted.resultados.visualizarSensiveis, false);
	const revoked = applyMembershipPermissionChanges(sensitive, [{ path: "dadosSensiveis.visualizarCustos", value: false }]);
	assert.equal(canViewCosts(revoked), false);
	assert.equal(readMembershipPermissionValue(revoked, "dadosSensiveis.visualizarCustos"), false);

	// O caminho existe também para organizações sem ERP: margem aparece nos resultados de qualquer uma.
	assert.ok(getAllMembershipPermissionPaths({ organizationHasERPAccess: false }).includes("dadosSensiveis.visualizarCustos"));
	assert.ok(!getAllMembershipPermissionPaths({ organizationHasERPAccess: true }).includes("resultados.visualizarSensiveis"));
});

test("cost masking: null on read, untouched on write", () => {
	assert.equal(maskCost(12.5, true), 12.5);
	assert.equal(maskCost(12.5, false), null);
	assert.equal(acceptIncomingCost(null, true), null);
	assert.equal(acceptIncomingCost(null, false), undefined);
});

test("CRM: viewing and drafting stay open, putting live and configuring fall back to empresa.editar", () => {
	const operator = legacyMember();
	assert.deepEqual(resolveCampaignPermissions(operator), { visualizar: true, editar: true, ativar: false });
	assert.deepEqual(resolveCashbackPermissions(operator), { visualizar: true, configurar: false });
	assert.equal(canExportClients(operator), false);

	const manager = legacyMember({ empresa: { visualizar: true, editar: true } });
	assert.deepEqual(resolveCampaignPermissions(manager), { visualizar: true, editar: true, ativar: true });
	assert.deepEqual(resolveCashbackPermissions(manager), { visualizar: true, configurar: true });
	assert.equal(canExportClients(manager), true);

	// Chave explícita vence o fallback, nos dois sentidos.
	const granted = applyMembershipPermissionChanges(operator, [
		{ path: "campanhas.ativar", value: true },
		{ path: "cashback.configurar", value: true },
		{ path: "dadosSensiveis.exportarClientes", value: true },
	]);
	assert.equal(resolveCampaignPermissions(granted).ativar, true);
	assert.equal(resolveCashbackPermissions(granted).configurar, true);
	assert.equal(canExportClients(granted), true);
	assert.equal(granted.empresa.editar, false);

	const revoked = applyMembershipPermissionChanges(manager, [{ path: "campanhas.ativar", value: false }]);
	assert.deepEqual(revoked.campanhas, { visualizar: true, editar: true, ativar: false });
	assert.equal(readMembershipPermissionValue(revoked, "campanhas.ativar"), false);

	for (const path of [
		"campanhas.visualizar",
		"campanhas.editar",
		"campanhas.ativar",
		"cashback.visualizar",
		"cashback.configurar",
		"dadosSensiveis.exportarClientes",
	]) {
		assert.ok(getAllMembershipPermissionPaths({ organizationHasERPAccess: false }).includes(path), path);
	}
});

test("backfill completes dadosSensiveis written before exportarClientes existed", () => {
	const member = legacyMember({ empresa: { visualizar: true, editar: true } });
	member.dadosSensiveis = { visualizarCustos: false };

	const next = materializeERPPermissions(member);
	assert.ok(next);
	assert.deepEqual(next.dadosSensiveis, { visualizarCustos: false, exportarClientes: true });
	for (const path of getAllMembershipPermissionPaths({ organizationHasERPAccess: true })) {
		assert.equal(readMembershipPermissionValue(next, path), readMembershipPermissionValue(member, path), path);
	}
	assert.equal(materializeERPPermissions(next), null, "second run is a no-op");
});

test("touching a live campaign requires activation", () => {
	assert.equal(campaignWriteRequiresActivation({ wasActive: false, willBeActive: false }), false);
	assert.equal(campaignWriteRequiresActivation({ wasActive: false, willBeActive: true }), true);
	assert.equal(campaignWriteRequiresActivation({ wasActive: true, willBeActive: false }), true);
	assert.equal(campaignWriteRequiresActivation({ wasActive: true, willBeActive: true }), true);
});
