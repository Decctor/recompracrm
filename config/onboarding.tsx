import type { TAuthUserSession } from "@/lib/authentication/types";
import type { TAccountChartNatureEnum, TFinancialAccountTypeEnum, TPaymentMethodEnum } from "@/schemas/enums";
import type { TOrganizationDefaults } from "@/schemas/organizations";
import { sendMessage } from "@/lib/whatsapp/internal-gateway";
import type { TNewCashbackProgramEntity } from "@/services/drizzle/schema";
import {
	Baby,
	Beef,
	CakeSlice,
	Dumbbell,
	Footprints,
	Gem,
	Glasses,
	Hammer,
	HelpCircle,
	PawPrint,
	PenTool,
	Pill,
	Shirt,
	ShoppingCart,
	Smartphone,
	Sofa,
	SprayCan,
	Store,
	Utensils,
	Wrench,
	Zap,
} from "lucide-react";
import { FaGoogle, FaInstagram, FaLinkedin, FaUserGroup, FaYoutube } from "react-icons/fa6";

export type TOnboardingAccountChartNode = {
	key: string;
	nome: string;
	codigo: string;
	natureza: TAccountChartNatureEnum;
	children?: TOnboardingAccountChartNode[];
};

export type TOnboardingFinancialAccountNode = {
	key: string;
	nome: string;
	descricao: string | null;
	tipo: TFinancialAccountTypeEnum;
	contaContabilKey: string | null;
	moeda: string;
	ativo: boolean;
	saldoInicial: number;
	dataSaldoInicialStrategy: "NOW";
};

export type TOnboardingPaymentMethodDefault = {
	suportado: boolean;
	contaFinanceiraPadraoKey: string | null;
	contaFinanceiraEditavel?: boolean;
	efetivacaoTipoPadrao: "IMEDIATA" | "PENDENTE";
	delayDiasPadrao: number | null;
	parcelamento: {
		permitido: boolean;
		minParcelas: number;
		maxParcelas: number | null;
		intervaloMeses: number | null;
	};
};

export const RecompraCRMDefaultAccountCharts: TOnboardingAccountChartNode[] = [
	{
		key: "ativo",
		nome: "Ativo",
		codigo: "1",
		natureza: "ATIVO",
		children: [
			{ key: "caixa_bancos", nome: "Caixa e Bancos", codigo: "1.1", natureza: "ATIVO" },
			{ key: "contas_receber", nome: "Contas a Receber", codigo: "1.2", natureza: "ATIVO" },
			{ key: "estoques", nome: "Estoques", codigo: "1.3", natureza: "ATIVO" },
			// Tributos destacados na compra que a organização tem direito a recuperar não são custo da
			// mercadoria: são um ativo contra o fisco. Ver docs/domain/purchase-costing.md.
			{ key: "tributos_recuperar", nome: "Tributos a Recuperar", codigo: "1.4", natureza: "ATIVO" },
			{ key: "outros_ativos", nome: "Outros Ativos", codigo: "1.5", natureza: "ATIVO" },
			// Patrimônio (ADR-0002, decisão 8): bens, sua depreciação acumulada (redutora) e o crédito de
			// ICMS do ativo ainda não apropriado (CIAP, 1/48 por mês).
			{ key: "imobilizado", nome: "Imobilizado", codigo: "1.6", natureza: "ATIVO" },
			{ key: "depreciacao_acumulada", nome: "Depreciação Acumulada", codigo: "1.7", natureza: "ATIVO" },
			{ key: "ciap_controle", nome: "ICMS a Recuperar — CIAP", codigo: "1.8", natureza: "ATIVO" },
		],
	},
	{
		key: "passivo",
		nome: "Passivo",
		codigo: "2",
		natureza: "PASSIVO",
		children: [
			{ key: "fornecedores", nome: "Fornecedores", codigo: "2.1", natureza: "PASSIVO" },
			{ key: "contas_pagar", nome: "Contas a Pagar", codigo: "2.2", natureza: "PASSIVO" },
			{ key: "obrigacoes_tributarias", nome: "Obrigações Tributárias", codigo: "2.3", natureza: "PASSIVO" },
			{ key: "obrigacoes_trabalhistas", nome: "Obrigações Trabalhistas", codigo: "2.4", natureza: "PASSIVO" },
			{ key: "emprestimos_financiamentos", nome: "Empréstimos e Financiamentos", codigo: "2.5", natureza: "PASSIVO" },
		],
	},
	{
		key: "patrimonio_liquido",
		nome: "Patrimônio Líquido",
		codigo: "3",
		natureza: "PATRIMONIO_LIQUIDO",
		children: [
			{ key: "capital_social", nome: "Capital Social", codigo: "3.1", natureza: "PATRIMONIO_LIQUIDO" },
			{
				key: "lucros_prejuizos_acumulados",
				nome: "Lucros ou Prejuízos Acumulados",
				codigo: "3.2",
				natureza: "PATRIMONIO_LIQUIDO",
			},
		],
	},
	{
		key: "receitas",
		nome: "Receitas",
		codigo: "4",
		natureza: "RECEITA",
		children: [
			{ key: "receitas_operacionais", nome: "Receitas Operacionais", codigo: "4.1", natureza: "RECEITA" },
			{ key: "outras_receitas", nome: "Outras Receitas", codigo: "4.2", natureza: "RECEITA" },
		],
	},
	{
		key: "custos",
		nome: "Custos",
		codigo: "5",
		natureza: "CUSTO",
		children: [{ key: "custo_mercadorias_vendidas", nome: "Custo das Mercadorias Vendidas", codigo: "5.1", natureza: "CUSTO" }],
	},
	{
		key: "despesas",
		nome: "Despesas",
		codigo: "6",
		natureza: "DESPESA",
		children: [
			{ key: "despesas_operacionais", nome: "Despesas Operacionais", codigo: "6.1", natureza: "DESPESA" },
			{ key: "despesas_administrativas", nome: "Despesas Administrativas", codigo: "6.2", natureza: "DESPESA" },
			{ key: "despesas_comerciais", nome: "Despesas Comerciais", codigo: "6.3", natureza: "DESPESA" },
			{ key: "despesas_financeiras", nome: "Despesas Financeiras", codigo: "6.4", natureza: "DESPESA" },
			{ key: "perdas_estoque", nome: "Perdas de Estoque", codigo: "6.5", natureza: "DESPESA" },
			{ key: "material_uso_consumo", nome: "Material de Uso e Consumo", codigo: "6.6", natureza: "DESPESA" },
			{ key: "despesas_depreciacao", nome: "Despesas com Depreciação", codigo: "6.7", natureza: "DESPESA" },
		],
	},
];

export const RecompraCRMDefaultAccountingDefaults: {
	lancamentosPadrao: {
		vendas: { debitoKey: string; creditoKey: string };
		compras: {
			debitoKey: string;
			creditoKey: string;
			debitoCreditoTributarioKey: string;
			debitoDespesaPeriodoKey: string;
			creditoTributoCompraKey: string;
			debitoPorDestinacaoKey: { INSUMO: string; USO_CONSUMO: string; ATIVO_IMOBILIZADO: string };
		};
		transferencias: { debitoKey: string; creditoKey: string };
		perdasEstoque: { debitoKey: string; creditoKey: string };
		taxasCanal: { debitoKey: string; creditoKey: string };
		patrimonio: { imobilizadoKey: string; depreciacaoAcumuladaKey: string; despesaDepreciacaoKey: string; ciapControleKey: string };
	};
} = {
	lancamentosPadrao: {
		vendas: { debitoKey: "contas_receber", creditoKey: "receitas_operacionais" },
		compras: {
			debitoKey: "estoques",
			creditoKey: "fornecedores",
			debitoCreditoTributarioKey: "tributos_recuperar",
			debitoDespesaPeriodoKey: "despesas_operacionais",
			creditoTributoCompraKey: "obrigacoes_tributarias",
			// Insumo é estoque como a mercadoria; uso e consumo vai a despesa; o imobilizado tem conta própria.
			debitoPorDestinacaoKey: { INSUMO: "estoques", USO_CONSUMO: "material_uso_consumo", ATIVO_IMOBILIZADO: "imobilizado" },
		},
		patrimonio: {
			imobilizadoKey: "imobilizado",
			depreciacaoAcumuladaKey: "depreciacao_acumulada",
			despesaDepreciacaoKey: "despesas_depreciacao",
			ciapControleKey: "ciap_controle",
		},
		transferencias: {
			debitoKey: "caixa_bancos",
			creditoKey: "caixa_bancos",
		},
		perdasEstoque: { debitoKey: "perdas_estoque", creditoKey: "estoques" },
		taxasCanal: { debitoKey: "despesas_comerciais", creditoKey: "contas_receber" },
	},
};

export const RecompraCRMDefaultFinancialAccounts: TOnboardingFinancialAccountNode[] = [
	{
		key: "caixa_principal",
		nome: "Caixa Principal",
		descricao: "Conta financeira padrão para recebimentos em dinheiro.",
		tipo: "CAIXA",
		contaContabilKey: "caixa_bancos",
		moeda: "BRL",
		ativo: true,
		saldoInicial: 0,
		dataSaldoInicialStrategy: "NOW",
	},
	{
		key: "conta_bancaria_principal",
		nome: "Conta Bancária Principal",
		descricao: "Conta financeira padrão para movimentações bancárias.",
		tipo: "BANCO",
		contaContabilKey: "caixa_bancos",
		moeda: "BRL",
		ativo: true,
		saldoInicial: 0,
		dataSaldoInicialStrategy: "NOW",
	},
	{
		key: "carteira_digital_pix",
		nome: "Carteira Digital / Pix",
		descricao: "Conta financeira padrão para recebimentos via Pix e carteiras digitais.",
		tipo: "CARTEIRA_DIGITAL",
		contaContabilKey: "caixa_bancos",
		moeda: "BRL",
		ativo: true,
		saldoInicial: 0,
		dataSaldoInicialStrategy: "NOW",
	},
];

export const RecompraCRMDefaultPaymentMethodDefaults: Record<TPaymentMethodEnum, TOnboardingPaymentMethodDefault> = {
	DINHEIRO: {
		suportado: true,
		contaFinanceiraPadraoKey: "caixa_principal",
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	PIX: {
		suportado: true,
		contaFinanceiraPadraoKey: "carteira_digital_pix",
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	CARTAO_DEBITO: {
		suportado: true,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	CARTAO_CREDITO: {
		suportado: true,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: true, minParcelas: 1, maxParcelas: 12, intervaloMeses: 1 },
	},
	BOLETO: {
		suportado: false,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
		efetivacaoTipoPadrao: "PENDENTE",
		delayDiasPadrao: 3,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	TRANSFERENCIA: {
		suportado: false,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	CASHBACK: {
		suportado: false,
		contaFinanceiraPadraoKey: null,
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	VALE: {
		suportado: false,
		contaFinanceiraPadraoKey: null,
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	A_DEFINIR: {
		suportado: true,
		contaFinanceiraPadraoKey: null,
		efetivacaoTipoPadrao: "PENDENTE",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	FIADO_NOTA: {
		suportado: true,
		contaFinanceiraPadraoKey: null,
		efetivacaoTipoPadrao: "PENDENTE",
		delayDiasPadrao: 30,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
	OUTRO: {
		suportado: false,
		contaFinanceiraPadraoKey: null,
		efetivacaoTipoPadrao: "IMEDIATA",
		delayDiasPadrao: 0,
		parcelamento: { permitido: false, minParcelas: 0, maxParcelas: null, intervaloMeses: null },
	},
};

/**
 * `accountsCharts` não persiste a `key` do seed, só o `codigo`. Organizações onboardadas antes de um
 * default ser semeado não têm o ID gravado na configuração, então a resolução de fallback precisa
 * traduzir a chave para o código do plano de contas padrão.
 */
export function getDefaultAccountChartCodeByKey(key: string): string | null {
	function findInNodes(nodes: TOnboardingAccountChartNode[]): string | null {
		for (const node of nodes) {
			if (node.key === key) return node.codigo;
			const foundInChildren = node.children ? findInNodes(node.children) : null;
			if (foundInChildren) return foundInChildren;
		}
		return null;
	}

	return findInNodes(RecompraCRMDefaultAccountCharts);
}

export function buildOrganizationAccountingDefaults(accountIdsByKey: Map<string, string>): TOrganizationDefaults["contabilidade"] {
	return {
		lancamentosPadrao: {
			vendas: {
				debitoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.vendas.debitoKey) ?? null,
				debitoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.vendas.debitoKey,
				creditoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.vendas.creditoKey) ?? null,
				creditoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.vendas.creditoKey,
			},
			compras: {
				debitoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoKey) ?? null,
				debitoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoKey,
				creditoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.creditoKey) ?? null,
				creditoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.creditoKey,
				debitoCreditoTributarioContaId:
					accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoCreditoTributarioKey) ?? null,
				debitoCreditoTributarioContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoCreditoTributarioKey,
				debitoDespesaPeriodoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoDespesaPeriodoKey) ?? null,
				debitoDespesaPeriodoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoDespesaPeriodoKey,
				creditoTributoCompraContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.creditoTributoCompraKey) ?? null,
				creditoTributoCompraContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.creditoTributoCompraKey,
				contasDebitoPorDestinacao: Object.fromEntries(
					Object.entries(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoPorDestinacaoKey).map(([destinacao, key]) => [
						destinacao,
						{ contaId: accountIdsByKey.get(key) ?? null, contaKey: key },
					]),
				) as TOrganizationDefaults["contabilidade"]["lancamentosPadrao"]["compras"]["contasDebitoPorDestinacao"],
			},
			transferencias: {
				debitoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.transferencias.debitoKey) ?? null,
				debitoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.transferencias.debitoKey,
				creditoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.transferencias.creditoKey) ?? null,
				creditoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.transferencias.creditoKey,
			},
			taxasCanal: {
				debitoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.taxasCanal.debitoKey) ?? null,
				debitoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.taxasCanal.debitoKey,
				creditoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.taxasCanal.creditoKey) ?? null,
				creditoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.taxasCanal.creditoKey,
			},
			patrimonio: {
				imobilizadoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.imobilizadoKey) ?? null,
				imobilizadoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.imobilizadoKey,
				depreciacaoAcumuladaContaId:
					accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.depreciacaoAcumuladaKey) ?? null,
				depreciacaoAcumuladaContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.depreciacaoAcumuladaKey,
				despesaDepreciacaoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.despesaDepreciacaoKey) ?? null,
				despesaDepreciacaoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.despesaDepreciacaoKey,
				ciapControleContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.ciapControleKey) ?? null,
				ciapControleContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio.ciapControleKey,
			},
			perdasEstoque: {
				debitoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.perdasEstoque.debitoKey) ?? null,
				debitoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.perdasEstoque.debitoKey,
				creditoContaId: accountIdsByKey.get(RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.perdasEstoque.creditoKey) ?? null,
				creditoContaKey: RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.perdasEstoque.creditoKey,
			},
		},
	};
}

export function buildOrganizationPaymentMethodDefaults(financialAccountIdsByKey: Map<string, string>): TOrganizationDefaults["pagamentos"] {
	return {
		metodos: Object.fromEntries(
			Object.entries(RecompraCRMDefaultPaymentMethodDefaults).map(([metodo, config]) => [
				metodo,
				{
					suportado: config.suportado,
					contaFinanceiraPadraoId: config.contaFinanceiraPadraoKey ? (financialAccountIdsByKey.get(config.contaFinanceiraPadraoKey) ?? null) : null,
					contaFinanceiraPadraoKey: config.contaFinanceiraPadraoKey,
					contaFinanceiraEditavel: config.contaFinanceiraEditavel ?? false,
					efetivacaoTipoPadrao: config.efetivacaoTipoPadrao,
					delayDiasPadrao: config.delayDiasPadrao,
					parcelamento: {
						permitido: config.parcelamento.permitido,
						minParcelas: config.parcelamento.minParcelas,
						maxParcelas: config.parcelamento.maxParcelas,
						intervaloMeses: config.parcelamento.intervaloMeses,
					},
				},
			]),
		) as TOrganizationDefaults["pagamentos"]["metodos"],
	};
}

type TOrganizationNicheOption = {
	id: string;
	label: string;
	value: string;
	renderIcon: (className?: string) => React.ReactNode;
	cashbackProgramDefault: Partial<TNewCashbackProgramEntity>;
};

/**
 * CASHBACK DEFAULTS — RATIONALE
 * ────────────────────────────────────────────────────────────────
 * For each niche we researched the typical GROSS MARGIN practiced
 * in Brazilian retail and then applied two rules of thumb:
 *
 *   acumuloValor  ≈ 15-25 % of gross margin (attractive yet safe)
 *   resgateLimiteValor ≈ ≤ gross margin (so the business never
 *                        "pays" more than its margin on a sale)
 *
 * expiracaoRegraValidadeValor is tuned to the purchase cycle:
 *   - high-frequency categories (food, pet, pharmacy) → 30-45 days
 *   - medium-frequency (fashion, beauty, home) → 60-90 days
 *   - low-frequency (construction, auto parts, electronics,
 *     jewelry, eyewear, furniture) → 90-120 days
 *
 * All values are conservative starting points the merchant can
 * adjust later. The goal is a "works out of the box" experience.
 * ────────────────────────────────────────────────────────────────
 */

export const OrganizationNicheOptions: TOrganizationNicheOption[] = [
	// ═══════════════════════════════════════════════════════════════
	// ALIMENTAÇÃO — Gross margin ~25-35 %
	// Food retail is high-volume, low-margin per unit.
	// Cashback needs to be modest but with short expiry to drive
	// frequent returns (weekly/bi-weekly purchase cycle).
	// ═══════════════════════════════════════════════════════════════
	{
		id: "alimentacao",
		label: "Alimentação",
		value: "Alimentação",
		renderIcon: (className?: string) => <Utensils className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5, // ~15-20% of ~30% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30, // short cycle — food is bought weekly
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30, // capped at gross margin
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// SUPERMERCADO / MERCEARIA — Gross margin ~25-30 %
	// Similar to food but even tighter margins on staples.
	// High transaction frequency compensates low cashback %.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "supermercado",
		label: "Supermercado / Mercearia",
		value: "Supermercado / Mercearia",
		renderIcon: (className?: string) => <ShoppingCart className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 3, // tight margins, volume game
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 25,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// MODA (Roupas & Calçados) — Gross margin ~40-60 %
	// Fashion enjoys high markups. Generous cashback is viable
	// and expected by consumers. Medium purchase cycle.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "moda",
		label: "Moda",
		value: "Moda",
		renderIcon: (className?: string) => <Shirt className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 10, // ~20% of ~50% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60, // seasonal purchase cycle
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CALÇADOS — Gross margin ~35-50 %
	// Slightly lower than apparel but still comfortable margins.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "calcados",
		label: "Calçados",
		value: "Calçados",
		renderIcon: (className?: string) => <Footprints className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PERFUMARIA & COSMÉTICOS — Gross margin ~50-70 %
	// Very high markups, especially on branded cosmetics.
	// Cashback can be generous to drive loyalty.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "perfumaria",
		label: "Perfumaria & Cosméticos",
		value: "Perfumaria & Cosméticos",
		renderIcon: (className?: string) => <SprayCan className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 12, // ~20% of ~60% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// FARMÁCIA — Gross margin ~30 %
	// Regulated pricing on many items. Margins on OTC and beauty
	// products are higher, but medicines are constrained.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "farmacia",
		label: "Farmácia",
		value: "Farmácia",
		renderIcon: (className?: string) => <Pill className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5, // ~17% of ~30% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 45, // monthly medicine cycle
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 25,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PET SHOP — Gross margin ~35-55 % (products), ~60-80 % (services)
	// Blended margin around 40-50%. High repeat purchase.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "petshop",
		label: "Pet Shop",
		value: "Pet Shop",
		renderIcon: (className?: string) => <PawPrint className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8, // ~20% of ~40% blended margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 45, // monthly grooming/food cycle
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CONSTRUÇÃO & MAT. DE CONSTRUÇÃO — Gross margin ~30-40 %
	// High ticket, low frequency. Longer expiry needed.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "construcao",
		label: "Construção",
		value: "Construção",
		renderIcon: (className?: string) => <Hammer className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5, // ~15% of ~35% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90, // projects take months
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// AUTOPEÇAS — Gross margin ~30-40 %
	// Need-based purchases, medium frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "autopecas",
		label: "Autopeças",
		value: "Autopeças",
		renderIcon: (className?: string) => <Wrench className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// ELETRÔNICOS & ELETRODOMÉSTICOS — Gross margin ~20-35 %
	// Competitive pricing squeezes margins. Low frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "eletronicos",
		label: "Eletrônicos & Eletrodomésticos",
		value: "Eletrônicos & Eletrodomésticos",
		renderIcon: (className?: string) => <Smartphone className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 3, // thin margins, high ticket
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 20,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// ÓTICA — Gross margin ~60-80 %
	// Lenses and frames have enormous markups. Very high margins.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "otica",
		label: "Ótica",
		value: "Ótica",
		renderIcon: (className?: string) => <Glasses className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 12, // ~17% of ~70% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 120, // annual/bi-annual purchase
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// JOALHERIA & ACESSÓRIOS — Gross margin ~50-70 %
	// Luxury/semi-luxury. High ticket, very low frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "joalheria",
		label: "Joalheria & Acessórios",
		value: "Joalheria & Acessórios",
		renderIcon: (className?: string) => <Gem className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 10,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 120, // gift/occasion-driven
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PAPELARIA & PRESENTES — Gross margin ~40-60 %
	// Good markups on stationery, gifts, craft supplies.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "papelaria",
		label: "Papelaria & Presentes",
		value: "Papelaria & Presentes",
		renderIcon: (className?: string) => <PenTool className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CASA & DECORAÇÃO (Móveis, Utilidades Domésticas) — Gross margin ~40-55 %
	// Medium-high markups, but low purchase frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "casa-decoracao",
		label: "Casa & Decoração",
		value: "Casa & Decoração",
		renderIcon: (className?: string) => <Sofa className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// ESPORTES & LAZER — Gross margin ~35-50 %
	// Good markups on sporting goods and apparel.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "esportes",
		label: "Esportes & Lazer",
		value: "Esportes & Lazer",
		renderIcon: (className?: string) => <Dumbbell className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 7,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// BRINQUEDOS & INFANTIL — Gross margin ~40-60 %
	// Seasonal peaks (children's day, Christmas). Good margins.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "brinquedos",
		label: "Brinquedos & Infantil",
		value: "Brinquedos & Infantil",
		renderIcon: (className?: string) => <Baby className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 45,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PADARIA & CONFEITARIA — Gross margin ~50-70 %
	// High margin on baked goods (low input cost), very high frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "padaria",
		label: "Padaria & Confeitaria",
		value: "Padaria & Confeitaria",
		renderIcon: (className?: string) => <CakeSlice className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30, // daily/weekly visits
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// AÇOUGUE & PEIXARIA — Gross margin ~30-45 %
	// Perishable goods, moderate margins, high frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "acougue",
		label: "Açougue & Peixaria",
		value: "Açougue & Peixaria",
		renderIcon: (className?: string) => <Beef className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// MATERIAIS ELÉTRICOS & HIDRÁULICOS — Gross margin ~30-45 %
	// B2B-leaning, project-based purchases.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "materiais-eletricos",
		label: "Materiais Elétricos & Hidráulicos",
		value: "Materiais Elétricos & Hidráulicos",
		renderIcon: (className?: string) => <Zap className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CATCH-ALL — Gross margin ~30 % (safe midpoint)
	// For niches not specifically listed.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "outros",
		label: "Outro",
		value: "Outro",
		renderIcon: (className?: string) => <Store className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},
];
export function getOrganizationNicheByValue(value: string): TOrganizationNicheOption | undefined {
	return OrganizationNicheOptions.find((niche) => niche.value === value);
}
export const OrganizationOriginOptions = [
	{
		id: "instagram",
		label: "Instagram",
		value: "Instagram",
		renderIcon: (className?: string) => <FaInstagram className={className} />,
	},
	{
		id: "linkedin",
		label: "Linkedin",
		value: "Linkedin",
		renderIcon: (className?: string) => <FaLinkedin className={className} />,
	},
	{
		id: "youtube",
		label: "YouTube",
		value: "YouTube",
		renderIcon: (className?: string) => <FaYoutube className={className} />,
	},
	{
		id: "google",
		label: "Google",
		value: "Google",
		renderIcon: (className?: string) => <FaGoogle className={className} />,
	},
	{
		id: "indicacao",
		label: "Indicação",
		value: "Indicação",
		renderIcon: (className?: string) => <FaUserGroup className={className} />,
	},
	{
		id: "outro",
		label: "Outro",
		value: "Outro",
		renderIcon: (className?: string) => <HelpCircle className={className} />,
	},
];

const APP_NAME = "RecompraCRM";

const WELCOME_ORGANIZATION_OWNER_MESSAGE_TEMPLATE = (ownerName: string) =>
	`Olá, ${ownerName}! Tudo bem? 👋

Que legal ver que você iniciou o onboarding aqui no ${APP_NAME}! 🎉

Estou passando só para dar as boas-vindas e dizer que este é nosso canal direto. 💬 Se você tiver qualquer dúvida nessa etapa inicial, ou precisar de uma mãozinha para configurar algo, é só me chamar por aqui, combinado? 🤝

Um abraço e ótima jornada com a gente! 🚀`;

type TWelcomeOrganizationOwnerOnOnboardingParams = {
	orgOwner: TAuthUserSession["user"];
};

export async function welcomeOrganizationOwnerOnOnboarding({ orgOwner }: TWelcomeOrganizationOwnerOnOnboardingParams) {
	if (!orgOwner.telefone) return;
	const sessionId = process.env.INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS as string;
	const text = WELCOME_ORGANIZATION_OWNER_MESSAGE_TEMPLATE(orgOwner.nome);
	await sendMessage(sessionId, orgOwner.telefone, { type: "text", text });
}
