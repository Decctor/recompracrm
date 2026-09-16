import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSaleClientReassignmentPolicy, type TSaleClientReassignmentRow } from "./sale-client-reassignment-policy";

function row(overrides: Partial<TSaleClientReassignmentRow> = {}): TSaleClientReassignmentRow {
	return {
		statusVenda: "CONFIRMADA",
		processamentoOrigem: "INTERNO",
		tabId: null,
		clienteId: "cliente-a",
		documentosFiscais: [],
		transacoesCashback: [],
		cuponsResgatados: [],
		...overrides,
	};
}

describe("resolveSaleClientReassignmentPolicy", () => {
	it("venda interna confirmada sem efeitos bloqueantes é elegível sem confirmação", () => {
		const policy = resolveSaleClientReassignmentPolicy(row());
		assert.deepEqual(policy, { elegivel: true, motivos: [], confirmacaoFiscalExigida: false, documentoFiscal: null });
	});

	it("venda externa não é elegível", () => {
		const policy = resolveSaleClientReassignmentPolicy(row({ processamentoOrigem: "EXTERNO" }));
		assert.equal(policy.elegivel, false);
		assert.match(policy.motivos[0]!, /canais externos/);
	});

	it("rascunho e cancelada não são elegíveis", () => {
		assert.match(resolveSaleClientReassignmentPolicy(row({ statusVenda: "ORCAMENTO" })).motivos[0]!, /checkout/);
		assert.match(resolveSaleClientReassignmentPolicy(row({ statusVenda: "CANCELADA" })).motivos[0]!, /confirmadas/);
	});

	it("venda de conta de atendimento não é elegível", () => {
		const policy = resolveSaleClientReassignmentPolicy(row({ tabId: "tab-1" }));
		assert.equal(policy.elegivel, false);
		assert.match(policy.motivos[0]!, /conta/);
	});

	it("resgate de cashback vivo recusa; resgate expirado não", () => {
		const blocked = resolveSaleClientReassignmentPolicy(row({ transacoesCashback: [{ tipo: "RESGATE", status: "ATIVO" }] }));
		assert.equal(blocked.elegivel, false);
		assert.match(blocked.motivos[0]!, /saldo de cashback/);

		const allowed = resolveSaleClientReassignmentPolicy(
			row({
				transacoesCashback: [
					{ tipo: "RESGATE", status: "EXPIRADO" },
					{ tipo: "ACÚMULO", status: "ATIVO" },
				],
			}),
		);
		assert.equal(allowed.elegivel, true);
	});

	it("cupom utilizado recusa; cupom cancelado não", () => {
		assert.equal(resolveSaleClientReassignmentPolicy(row({ cuponsResgatados: [{ status: "UTILIZADO" }] })).elegivel, false);
		assert.equal(resolveSaleClientReassignmentPolicy(row({ cuponsResgatados: [{ status: "CANCELADO" }] })).elegivel, true);
	});

	it("NF-e viva recusa e aponta o documento", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({ documentosFiscais: [{ id: "doc-1", tipo: "NFE", numero: "12", statusInterno: "AUTORIZADO", destinatarioCpfCnpj: "12345678000199" }] }),
		);
		assert.equal(policy.elegivel, false);
		assert.match(policy.motivos[0]!, /NF-e nº 12/);
		assert.deepEqual(policy.documentoFiscal, { id: "doc-1", tipo: "NFE", numero: "12" });
	});

	it("NF-e em processamento também recusa", () => {
		const policy = resolveSaleClientReassignmentPolicy(row({ documentosFiscais: [{ id: "doc-1", tipo: "NFE", statusInterno: "EM_PROCESSAMENTO" }] }));
		assert.equal(policy.elegivel, false);
	});

	it("NF-e com devolução autorizada libera", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({
				documentosFiscais: [
					{ id: "doc-1", tipo: "NFE", statusInterno: "AUTORIZADO", documentoOrigemId: null },
					{ id: "dev-1", tipo: "NFE", statusInterno: "AUTORIZADO", documentoOrigemId: "doc-1" },
				],
			}),
		);
		assert.equal(policy.elegivel, true);
		assert.equal(policy.documentoFiscal, null);
	});

	it("NF-e cancelada ou inutilizada não bloqueia", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({
				documentosFiscais: [
					{ id: "doc-1", tipo: "NFE", statusInterno: "CANCELADO", destinatarioCpfCnpj: "12345678000199" },
					{ id: "doc-2", tipo: "NFE", statusInterno: "INUTILIZADO" },
				],
			}),
		);
		assert.equal(policy.elegivel, true);
		assert.equal(policy.confirmacaoFiscalExigida, false);
	});

	it("NFC-e viva com CPF exige confirmação, mas é elegível", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({ documentosFiscais: [{ id: "doc-1", tipo: "NFCE", numero: "7", statusInterno: "AUTORIZADO", destinatarioCpfCnpj: "123.456.789-09" }] }),
		);
		assert.equal(policy.elegivel, true);
		assert.equal(policy.confirmacaoFiscalExigida, true);
		assert.deepEqual(policy.documentoFiscal, { id: "doc-1", tipo: "NFCE", numero: "7" });
	});

	it("NFC-e viva sem CPF é um no-op fiscal", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({ documentosFiscais: [{ id: "doc-1", tipo: "NFCE", statusInterno: "AUTORIZADO", destinatarioCpfCnpj: null }] }),
		);
		assert.equal(policy.elegivel, true);
		assert.equal(policy.confirmacaoFiscalExigida, false);
		assert.equal(policy.documentoFiscal, null);
	});

	it("NFC-e cancelada com CPF não exige confirmação", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({ documentosFiscais: [{ id: "doc-1", tipo: "NFCE", statusInterno: "CANCELADO", destinatarioCpfCnpj: "12345678909" }] }),
		);
		assert.equal(policy.confirmacaoFiscalExigida, false);
	});

	it("confirmação fiscal nunca é exigida quando há recusa", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({
				tabId: "tab-1",
				documentosFiscais: [{ id: "doc-1", tipo: "NFCE", statusInterno: "AUTORIZADO", destinatarioCpfCnpj: "12345678909" }],
			}),
		);
		assert.equal(policy.elegivel, false);
		assert.equal(policy.confirmacaoFiscalExigida, false);
	});

	it("acumula todos os motivos", () => {
		const policy = resolveSaleClientReassignmentPolicy(
			row({ tabId: "tab-1", transacoesCashback: [{ tipo: "RESGATE", status: "ATIVO" }], cuponsResgatados: [{ status: "UTILIZADO" }] }),
		);
		assert.equal(policy.motivos.length, 3);
	});
});
