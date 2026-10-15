import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultSaleState } from "@/state-hooks/use-sale-state";
import { mapSaleDraftToSaleState } from "./map-sale-draft-to-sale-state";
import { mapSaleForEditToSaleState } from "./map-sale-to-sale-state";

test("reabrir orçamento ou edição preserva o modelo explícito e a emissão desligada", () => {
	for (const emissaoFiscalDocumento of [null, "NFE", "NFCE"] as const) {
		const sale = { itens: [], emissaoFiscalDocumento, emissaoFiscalAutomatica: false, rascunhoMetadados: null } as unknown as Parameters<
			typeof mapSaleDraftToSaleState
		>[0];
		const draftState = getDefaultSaleState(mapSaleDraftToSaleState(sale));
		assert.equal(draftState.emissaoFiscalDocumento, emissaoFiscalDocumento);
		assert.equal(draftState.emissaoFiscalAutomatica, false);
		const editData = {
			venda: sale,
			pagamentos: { todas: [] },
			editabilidade: { valorMinimoEdicao: 0 },
			recompensasResgatadas: [],
			cashbackResgate: 0,
			cupomResgatado: null,
		} as unknown as Parameters<typeof mapSaleForEditToSaleState>[0];
		const editState = getDefaultSaleState(
			mapSaleForEditToSaleState(editData, { methodsConfig: {} as Parameters<typeof mapSaleForEditToSaleState>[1]["methodsConfig"] }),
		);
		assert.equal(editState.emissaoFiscalDocumento, emissaoFiscalDocumento);
		assert.equal(editState.emissaoFiscalAutomatica, false);
	}
});

test("nova venda começa no automático e não herda a escolha da venda anterior", () => {
	assert.equal(getDefaultSaleState({ emissaoFiscalDocumento: "NFE" }).emissaoFiscalDocumento, "NFE");
	assert.equal(getDefaultSaleState().emissaoFiscalDocumento, null);
	assert.equal(getDefaultSaleState().emissaoFiscalAutomatica, null);
});
