import type { TItemTaxResult } from "@/lib/fiscal/engine";

export function buildSpedyItemTaxes(result: TItemTaxResult) {
	return {
		totalTax: result.vTotTrib,
		icms: {
			origin: result.icms.origem,
			csosn: Number(result.icms.csosn),
			baseTaxModality: 3,
			baseTax: result.icms.vBC,
			baseTaxReduction: 0,
			rate: result.icms.pICMS,
			amount: result.icms.vICMS,
			snCreditRate: result.icms.pCredSN ?? undefined,
			snCreditAmount: result.icms.vCredICMSSN ?? undefined,
			baseTaxSt: result.icms.st?.vBCST,
			baseTaxStModality: result.icms.st ? 4 : undefined,
			stMarginAmount: result.icms.st?.pMVAST,
			stRate: result.icms.st?.pICMSST,
			stAmount: result.icms.st?.vICMSST,
			fcpAmount: result.icms.vFCP || undefined,
			fcpStAmount: result.icms.st?.vFCPST || undefined,
			// ST retido na entrada (CSOSN 500): vBCSTRet, pST e vICMSSTRet da NF-e. Nomes em camelCase
			// seguindo o padrao dos demais campos; o provedor ignora o que nao reconhece.
			baseTaxStRetained: result.icms.stRetido?.vBCSTRet,
			stRetainedRate: result.icms.stRetido?.pST,
			stRetainedAmount: result.icms.stRetido?.vICMSSTRet,
		},
		pis: {
			cst: Number(result.pis.cst),
			baseTax: result.pis.vBC,
			rate: result.pis.pPIS,
			amount: result.pis.vPIS,
		},
		cofins: {
			cst: Number(result.cofins.cst),
			baseTax: result.cofins.vBC,
			rate: result.cofins.pCOFINS,
			amount: result.cofins.vCOFINS,
		},
	};
}
