/**
 * Canonical dashboard route builders.
 *
 * Keep dashboard URLs in one place so route moves do not turn into a repository-wide string
 * replacement exercise. These helpers deliberately return paths only, making them safe for both
 * server and client components.
 */
export const appRoutes = {
	dashboard: () => "/dashboard",
	sales: {
		root: () => "/dashboard/sales",
		results: () => "/dashboard/sales/results",
		orders: () => "/dashboard/sales/orders",
		new: () => "/dashboard/sales/new",
		import: () => "/dashboard/sales/import",
		details: (saleId: string) => `/dashboard/sales/${saleId}`,
		edit: (saleId: string) => `/dashboard/sales/edit/${saleId}`,
		checkout: (saleId: string) => `/dashboard/sales/checkout/${saleId}`,
		cashSessions: () => "/dashboard/sales/cash-sessions",
		serviceAccounts: () => "/dashboard/sales/service-accounts",
		serviceAccount: (accountId: string) => `/dashboard/sales/service-accounts/${accountId}`,
		pointOfInteraction: () => "/dashboard/sales/point-of-interaction",
	},
	operations: {
		preparation: () => "/dashboard/operations/preparation",
	},
	approvals: () => "/dashboard/approvals",
	purchases: () => "/dashboard/purchases",
	production: () => "/dashboard/production",
	inventory: {
		root: () => "/dashboard/inventory",
		movements: () => "/dashboard/inventory/movements",
		recount: () => "/dashboard/inventory/recount",
		lots: () => "/dashboard/inventory/lots",
		lot: (lotId: string) => `/dashboard/inventory/lots/${lotId}`,
		lotLabelsPreview: () => "/dashboard/inventory/lots/labels/preview",
	},
	finance: {
		root: () => "/dashboard/finance",
		entries: () => "/dashboard/finance/entries",
		/** Abre a listagem já com o menu de edição do lançamento aberto (query state via nuqs). */
		entry: (entryId: string) => `/dashboard/finance/entries?entryId=${encodeURIComponent(entryId)}`,
		transactions: () => "/dashboard/finance/transactions",
		/** Abre a listagem com a edição da movimentação financeira indicada. */
		transaction: (transactionId: string) => `/dashboard/finance/transactions?transactionId=${encodeURIComponent(transactionId)}`,
		accounts: () => "/dashboard/finance/accounts",
		creditCards: () => "/dashboard/finance/credit-cards",
		reconciliation: () => "/dashboard/finance/reconciliation",
		reports: {
			root: () => "/dashboard/finance/reports",
			incomeStatement: () => "/dashboard/finance/reports/income-statement",
			cashFlow: () => "/dashboard/finance/reports/cash-flow",
			receivablesPayables: () => "/dashboard/finance/reports/receivables-payables",
		},
	},
	fiscal: {
		root: () => "/dashboard/fiscal",
		/** Página do documento fiscal: identificação, venda vinculada, tributos, payload e histórico. */
		document: (documentId: string) => `/dashboard/fiscal/documents/${encodeURIComponent(documentId)}`,
		/** Aba de pendências: trabalho fiscal agrupado por causa, prazos expirando e produtos sem perfil. */
		pending: () => "/dashboard/fiscal?view=pending",
		/** Aba de configuração; `section` rola até o bloco (empresa, series, operation-profiles, tax-groups, certificate). */
		configuration: (section?: "company" | "series" | "operation-profiles" | "tax-groups" | "certificate") =>
			section ? `/dashboard/fiscal?view=configuration&section=${section}` : "/dashboard/fiscal?view=configuration",
	},
	catalog: {
		products: () => "/dashboard/catalog/products",
		product: (productId: string) => `/dashboard/catalog/products/${productId}`,
		store: () => "/dashboard/catalog/store",
	},
	customers: {
		root: () => "/dashboard/customers",
		details: (customerId: string) => `/dashboard/customers/${customerId}`,
		import: () => "/dashboard/customers/import",
		portfolios: () => "/dashboard/customers/portfolios",
		segments: () => "/dashboard/customers/segments",
	},
	growth: {
		campaigns: () => "/dashboard/growth/campaigns",
		newCampaign: () => "/dashboard/growth/campaigns/new",
		campaign: (campaignId: string) => `/dashboard/growth/campaigns/${campaignId}`,
		audiences: () => "/dashboard/growth/audiences",
		cashback: () => "/dashboard/growth/cashback",
		coupons: () => "/dashboard/growth/coupons",
		coupon: (couponId: string) => `/dashboard/growth/coupons/${couponId}`,
		newCoupon: () => "/dashboard/growth/coupons/new",
	},
	management: {
		goals: () => "/dashboard/management/goals",
		sellers: () => "/dashboard/management/sellers",
		seller: (sellerId: string) => `/dashboard/management/sellers/${sellerId}`,
		partners: () => "/dashboard/management/partners",
	},
	channels: {
		whatsapp: () => "/dashboard/channels/whatsapp",
		paidMedia: () => "/dashboard/channels/paid-media",
	},
	integrations: () => "/dashboard/integrations",
	settings: () => "/dashboard/settings",
} as const;
