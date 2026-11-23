/**
 * Fixed identifiers of everything the seed packs create. Specs and agents import this file (or read
 * `.local-dev/seed-manifest.json`, which adds the urls) instead of querying for ids.
 *
 * Ids are stable across runs on purpose: a spec can deep-link to a product or a coupon, and two
 * machines seeded from the same commit hold the same rows.
 */
export const SEED_USERS = {
	admin: { id: "seed-user-admin", email: "admin@demo.local.test", nome: "Ana Admin" },
	operator: { id: "seed-user-operador", email: "operador@demo.local.test", nome: "Otávio Operador" },
	crmOwner: { id: "seed-user-crm", email: "dono@crm.local.test", nome: "Carla CRM" },
	trialOwner: { id: "seed-user-teste", email: "dono@teste.local.test", nome: "Tiago Teste" },
} as const;
export type TSeedUserKey = keyof typeof SEED_USERS;

export const SEED_STORES = {
	demo: { id: "seed-org-demo", slug: "loja-demo", nome: "Loja Demo" },
	crmOnly: { id: "seed-org-crm", slug: "loja-crm", nome: "Loja Só CRM" },
	trial: { id: "seed-org-teste", slug: "loja-teste", nome: "Loja em Teste" },
} as const;

export const SEED_SELLERS = {
	admin: { id: "seed-seller-ana", nome: "Ana Admin" },
	operator: { id: "seed-seller-otavio", nome: "Otávio Operador" },
	counter: { id: "seed-seller-bia", nome: "Bia Balcão" },
} as const;

export const SEED_PRODUCTS = {
	water: { id: "seed-product-agua", nome: "Água Mineral 500ml", codigo: "1001", precoVenda: 4 },
	soda: { id: "seed-product-refrigerante", nome: "Refrigerante Lata 350ml", codigo: "1002", precoVenda: 6.5 },
	coxinha: { id: "seed-product-coxinha", nome: "Coxinha de Frango", codigo: "2001", precoVenda: 8 },
	brigadeiro: { id: "seed-product-brigadeiro", nome: "Brigadeiro Gourmet", codigo: "3001", precoVenda: 4.5 },
	cake: { id: "seed-product-bolo", nome: "Bolo de Cenoura (fatia)", codigo: "3002", precoVenda: 12 },
	/** Sold by weight (`unidade` KG). */
	cheese: { id: "seed-product-queijo", nome: "Queijo Minas", codigo: "4001", precoVenda: 59.9 },
	/** Has variants (size). */
	shirt: { id: "seed-product-camiseta", nome: "Camiseta Demo", codigo: "5001", precoVenda: 59.9 },
	/** Optional add-on group ("Complementos"). */
	acai: { id: "seed-product-acai", nome: "Açaí 500ml", codigo: "6001", precoVenda: 18 },
	/** Required add-on group ("Ponto da carne", exactly one). */
	burger: { id: "seed-product-burger", nome: "X-Burger Artesanal", codigo: "6002", precoVenda: 28 },
} as const;

export const SEED_VARIANTS = {
	shirtSmall: { id: "seed-variant-camiseta-p", nome: "P", precoVenda: 59.9 },
	shirtMedium: { id: "seed-variant-camiseta-m", nome: "M", precoVenda: 59.9 },
	shirtLarge: { id: "seed-variant-camiseta-g", nome: "G", precoVenda: 64.9 },
} as const;

export const SEED_ADD_ONS = {
	toppings: {
		id: "seed-addon-complementos",
		nome: "Complementos",
		options: {
			granola: { id: "seed-addon-option-granola", nome: "Granola", precoDelta: 2 },
			powderedMilk: { id: "seed-addon-option-leite-po", nome: "Leite em pó", precoDelta: 3 },
			strawberry: { id: "seed-addon-option-morango", nome: "Morango", precoDelta: 4 },
		},
	},
	doneness: {
		id: "seed-addon-ponto",
		nome: "Ponto da carne",
		options: {
			medium: { id: "seed-addon-option-ao-ponto", nome: "Ao ponto", precoDelta: 0 },
			wellDone: { id: "seed-addon-option-bem-passado", nome: "Bem passado", precoDelta: 0 },
		},
	},
} as const;

export const SEED_CLIENT_TAGS = {
	vip: { id: "seed-tag-vip", titulo: "VIP" },
	wholesale: { id: "seed-tag-atacado", titulo: "Atacado" },
} as const;

/** One client per RFM segment worth testing; `location` is a saved delivery address. */
export const SEED_CLIENTS = {
	maria: { id: "seed-client-maria", nome: "Maria Campeã", telefone: "(34) 99111-0001", location: "seed-client-location-maria" },
	joao: { id: "seed-client-joao", nome: "João Leal", telefone: "(34) 99111-0002", location: "seed-client-location-joao" },
	paula: { id: "seed-client-paula", nome: "Paula Recente", telefone: "(34) 99111-0003", location: null },
	rafael: { id: "seed-client-rafael", nome: "Rafael Em Risco", telefone: "(34) 99111-0004", location: null },
	sofia: { id: "seed-client-sofia", nome: "Sofia Hibernando", telefone: "(34) 99111-0005", location: null },
	lucas: { id: "seed-client-lucas", nome: "Lucas Promissor", telefone: "(34) 99111-0006", location: null },
	helena: { id: "seed-client-helena", nome: "Helena Perdida", telefone: "(34) 99111-0007", location: null },
	/** Never bought: satisfies "first purchase" conditions. */
	novo: { id: "seed-client-novo", nome: "Nicolas Novo", telefone: "(34) 99111-0008", location: null },
} as const;

export const SEED_CASHBACK_PROGRAM = { id: "seed-cashback-program", titulo: "Cashback Demo" } as const;
export const SEED_SALES_SESSION = { id: "seed-sales-session-open" } as const;

/** Delivery rules of the demo store's online shop. */
export const SEED_SHOP_DELIVERY = { taxa: 8, gratisAcima: 80 } as const;

export const SEED_COUPONS = {
	fixed: { id: "seed-coupon-fixo", codigo: "DEZREAIS", titulo: "R$ 10 de desconto" },
	percentage: { id: "seed-coupon-percentual", codigo: "QUINZE", titulo: "15% de desconto" },
	fixedPrice: { id: "seed-coupon-preco-fixo", codigo: "ACAI15", titulo: "Açaí por R$ 15" },
	buyXTakeY: { id: "seed-coupon-leve-pague", codigo: "LEVE3PAGUE2", titulo: "Leve 3 brigadeiros, pague 2" },
	gift: { id: "seed-coupon-brinde", codigo: "BRINDEAGUA", titulo: "Água de brinde" },
	manual: { id: "seed-coupon-manual", codigo: "ANIVERSARIO", titulo: "Aniversariante do mês" },
} as const;
