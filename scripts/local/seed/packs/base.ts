import { formatPhoneAsBase } from "@/lib/formatting";
import { ShopWeekdayEnum } from "@/schemas/enums";
import { DEFAULT_SHOP_SETTINGS_CONFIGURATION } from "@/schemas/shop";
import { db } from "@/services/drizzle";
import {
	cashbackProgramBalances,
	cashbackProgramTransactions,
	cashbackPrograms,
	clientLocations,
	clientTagReferences,
	clientTags,
	clients,
	organizationMembers,
	productAddOnOptions,
	productAddOnReferences,
	productAddOns,
	productOptionValues,
	productOptions,
	productVariantOptionValues,
	productVariants,
	products,
	salesSessions,
	sellers,
	shopSettings,
} from "@/services/drizzle/schema";
import dayjs from "dayjs";
import {
	SEED_ADD_ONS,
	SEED_CASHBACK_PROGRAM,
	SEED_CLIENTS,
	SEED_CLIENT_TAGS,
	SEED_PRODUCTS,
	SEED_SALES_SESSION,
	SEED_SELLERS,
	SEED_SHOP_DELIVERY,
	SEED_STORES,
	SEED_USERS,
	SEED_VARIANTS,
} from "../ids";
import { buildRestrictedPermissions, createSeedStore, createSeedUser } from "../store";

const STORE_ID = SEED_STORES.demo.id;

/** Placeholder art: uploads do not work locally, so seeded images are inline SVGs served by the app. */
function placeholderImage(label: string, color: string) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/><text x="200" y="215" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle">${label}</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function seedCatalog() {
	const common = { organizacaoId: STORE_ID, ativo: true, vendavel: true, ncm: "21069090", tipo: "PRODUTO", rastreamentoEstoqueAtivo: true };
	const p = SEED_PRODUCTS;
	await db.insert(products).values([
		{
			...common,
			...p.water,
			grupo: "BEBIDAS",
			unidade: "UN",
			precoCusto: 1.5,
			quantidade: 3000,
			codigoBarras: "7891000100103",
			imagemCapaUrl: placeholderImage("Água", "#0ea5e9"),
		},
		{
			...common,
			...p.soda,
			grupo: "BEBIDAS",
			unidade: "UN",
			precoCusto: 3,
			quantidade: 3000,
			codigoBarras: "7894900011517",
			imagemCapaUrl: placeholderImage("Refri", "#dc2626"),
		},
		{
			...common,
			...p.coxinha,
			grupo: "SALGADOS",
			unidade: "UN",
			precoCusto: 2.8,
			quantidade: 3000,
			imagemCapaUrl: placeholderImage("Coxinha", "#d97706"),
		},
		{
			...common,
			...p.brigadeiro,
			grupo: "DOCES",
			unidade: "UN",
			precoCusto: 1.2,
			quantidade: 3000,
			imagemCapaUrl: placeholderImage("Brigadeiro", "#78350f"),
		},
		{ ...common, ...p.cake, grupo: "DOCES", unidade: "UN", precoCusto: 4, quantidade: 3000, imagemCapaUrl: placeholderImage("Bolo", "#ea580c") },
		// Sold by weight: `unidade` KG is what makes the POS ask for a weight.
		{ ...common, ...p.cheese, grupo: "FRIOS", unidade: "KG", precoCusto: 32, quantidade: 80, imagemCapaUrl: placeholderImage("Queijo", "#ca8a04") },
		{
			...common,
			...p.shirt,
			grupo: "VESTUÁRIO",
			unidade: "UN",
			ncm: "61091000",
			precoCusto: 25,
			quantidade: 0,
			imagemCapaUrl: placeholderImage("Camiseta", "#4f46e5"),
		},
		// Made to order: no stock to track.
		{
			...common,
			...p.acai,
			grupo: "AÇAÍ",
			unidade: "UN",
			precoCusto: 7,
			rastreamentoEstoqueAtivo: false,
			imagemCapaUrl: placeholderImage("Açaí", "#6d28d9"),
		},
		{
			...common,
			...p.burger,
			grupo: "LANCHES",
			unidade: "UN",
			precoCusto: 11,
			rastreamentoEstoqueAtivo: false,
			imagemCapaUrl: placeholderImage("X-Burger", "#b45309"),
		},
	]);

	// Variants: one option (Tamanho) with three values, one variant per value.
	const sizeOptionId = "seed-option-tamanho";
	await db
		.insert(productOptions)
		.values({ id: sizeOptionId, organizacaoId: STORE_ID, produtoId: p.shirt.id, nome: "Tamanho", tipo: "TEXTO", ordem: 0 });
	const variants = Object.values(SEED_VARIANTS);
	await db.insert(productOptionValues).values(
		variants.map((variant, index) => ({
			id: `seed-option-value-${variant.nome.toLowerCase()}`,
			organizacaoId: STORE_ID,
			opcaoId: sizeOptionId,
			nome: variant.nome,
			ordem: index,
		})),
	);
	await db.insert(productVariants).values(
		variants.map((variant) => ({
			id: variant.id,
			organizacaoId: STORE_ID,
			produtoId: p.shirt.id,
			nome: variant.nome,
			codigo: `${p.shirt.codigo}-${variant.nome}`,
			precoVenda: variant.precoVenda,
			precoCusto: 25,
			quantidade: 40,
			ativo: true,
			rastreamentoEstoqueAtivo: true,
		})),
	);
	await db.insert(productVariantOptionValues).values(
		variants.map((variant) => ({
			organizacaoId: STORE_ID,
			produtoVarianteId: variant.id,
			opcaoId: sizeOptionId,
			opcaoValorId: `seed-option-value-${variant.nome.toLowerCase()}`,
		})),
	);

	// Add-ons: an optional group (0 to 3) on the açaí and a required one (exactly 1) on the burger.
	const { toppings, doneness } = SEED_ADD_ONS;
	await db.insert(productAddOns).values([
		{ id: toppings.id, organizacaoId: STORE_ID, nome: toppings.nome, minOpcoes: 0, maxOpcoes: 3, regraPreco: "SOMA", ativo: true },
		{ id: doneness.id, organizacaoId: STORE_ID, nome: doneness.nome, minOpcoes: 1, maxOpcoes: 1, regraPreco: "SOMA", ativo: true },
	]);
	await db.insert(productAddOnOptions).values([
		...Object.values(toppings.options).map((option) => ({
			...option,
			organizacaoId: STORE_ID,
			produtoAddOnId: toppings.id,
			maxQtdePorItem: 1,
			ativo: true,
		})),
		...Object.values(doneness.options).map((option) => ({
			...option,
			organizacaoId: STORE_ID,
			produtoAddOnId: doneness.id,
			maxQtdePorItem: 1,
			ativo: true,
		})),
	]);
	await db.insert(productAddOnReferences).values([
		{ produtoId: p.acai.id, produtoAddOnId: toppings.id, ordem: 0 },
		{ produtoId: p.burger.id, produtoAddOnId: doneness.id, ordem: 0 },
	]);
}

async function seedClients() {
	const authorId = SEED_USERS.admin.id;
	const c = SEED_CLIENTS;
	const daysAgo = (days: number) => dayjs().subtract(days, "day").toDate();

	// The RFM labels are what the nightly cron would write; seeded directly because crons do not
	// run locally. The `sales-history` pack adds the purchases that justify them.
	const rows: {
		client: (typeof c)[keyof typeof c];
		rfm: string;
		notas: [number, number, number];
		ultimaCompra: number | null;
		totalCompras: number;
		valorTotal: number;
		email?: string;
	}[] = [
		{ client: c.maria, rfm: "CAMPEÕES", notas: [5, 5, 5], ultimaCompra: 3, totalCompras: 14, valorTotal: 2450, email: "maria@clientes.local.test" },
		{ client: c.joao, rfm: "CLIENTES LEAIS", notas: [4, 4, 4], ultimaCompra: 20, totalCompras: 8, valorTotal: 980 },
		{ client: c.paula, rfm: "CLIENTES RECENTES", notas: [5, 1, 1], ultimaCompra: 5, totalCompras: 1, valorTotal: 64 },
		{ client: c.rafael, rfm: "EM RISCO", notas: [2, 4, 4], ultimaCompra: 150, totalCompras: 7, valorTotal: 1120 },
		{ client: c.sofia, rfm: "HIBERNANDO", notas: [1, 2, 2], ultimaCompra: 300, totalCompras: 2, valorTotal: 140 },
		{ client: c.lucas, rfm: "PROMISSORES", notas: [4, 1, 2], ultimaCompra: 40, totalCompras: 1, valorTotal: 210 },
		{ client: c.helena, rfm: "PERDIDOS", notas: [1, 1, 1], ultimaCompra: 420, totalCompras: 1, valorTotal: 35 },
		{ client: c.novo, rfm: "NÃO DEFINIDO", notas: [1, 1, 1], ultimaCompra: null, totalCompras: 0, valorTotal: 0 },
	];
	await db.insert(clients).values(
		rows.map(({ client, rfm, notas, ultimaCompra, totalCompras, valorTotal, email }) => ({
			id: client.id,
			organizacaoId: STORE_ID,
			nome: client.nome,
			telefone: client.telefone,
			telefoneBase: formatPhoneAsBase(client.telefone),
			email: email ?? null,
			localizacaoCidade: "ITUIUTABA",
			localizacaoEstado: "MG",
			canalAquisicao: "LOJA FÍSICA",
			analiseRFMTitulo: rfm,
			analiseRFMNotasRecencia: String(notas[0]),
			analiseRFMNotasFrequencia: String(notas[1]),
			analiseRFMNotasMonetario: String(notas[2]),
			analiseRFMUltimaAtualizacao: new Date(),
			ultimaCompraData: ultimaCompra == null ? null : daysAgo(ultimaCompra),
			primeiraCompraData: ultimaCompra == null ? null : daysAgo(ultimaCompra + totalCompras * 20),
			metadataTotalCompras: totalCompras,
			metadataValorTotalCompras: valorTotal,
			consentimentoMarketingData: new Date(),
			autorId: authorId,
		})),
	);

	await db.insert(clientLocations).values([
		{
			id: c.maria.location,
			organizacaoId: STORE_ID,
			clienteId: c.maria.id,
			titulo: "Casa",
			localizacaoCep: "38300-100",
			localizacaoEstado: "MG",
			localizacaoCidade: "ITUIUTABA",
			localizacaoBairro: "CENTRO",
			localizacaoLogradouro: "RUA DEZESSEIS",
			localizacaoNumero: "450",
		},
		{
			id: c.joao.location,
			organizacaoId: STORE_ID,
			clienteId: c.joao.id,
			titulo: "Trabalho",
			localizacaoCep: "38300-200",
			localizacaoEstado: "MG",
			localizacaoCidade: "ITUIUTABA",
			localizacaoBairro: "PLATINA",
			localizacaoLogradouro: "AVENIDA NOVE",
			localizacaoNumero: "1200",
		},
	]);

	const { vip, wholesale } = SEED_CLIENT_TAGS;
	await db.insert(clientTags).values([
		{ id: vip.id, organizacaoId: STORE_ID, titulo: vip.titulo, tituloNormalizado: "vip", cor: "#f59e0b", corForeground: "#000000", autorId: authorId },
		{
			id: wholesale.id,
			organizacaoId: STORE_ID,
			titulo: wholesale.titulo,
			tituloNormalizado: "atacado",
			cor: "#0f766e",
			corForeground: "#ffffff",
			autorId: authorId,
		},
	]);
	await db.insert(clientTagReferences).values([
		{ organizacaoId: STORE_ID, clienteId: c.maria.id, clienteTagId: vip.id },
		{ organizacaoId: STORE_ID, clienteId: c.joao.id, clienteTagId: vip.id },
		{ organizacaoId: STORE_ID, clienteId: c.rafael.id, clienteTagId: wholesale.id },
	]);
}

async function seedCashback() {
	await db.insert(cashbackPrograms).values({
		id: SEED_CASHBACK_PROGRAM.id,
		organizacaoId: STORE_ID,
		ativo: true,
		titulo: SEED_CASHBACK_PROGRAM.titulo,
		descricao: "5% de volta em toda compra.",
		terminologia: "DINHEIRO",
		modalidadeDescontosPermitida: true,
		modalidadeRecompensasPermitida: false,
		acumuloTipo: "PERCENTUAL",
		acumuloValor: 5,
		acumuloRegraValorMinimo: 0,
		acumuloPermitirViaIntegracao: true,
		acumuloPermitirViaPontoIntegracao: true,
		resgatePermitirViaPos: true,
		resgatePermitirViaPontoIntegracao: true,
		resgatePermitirViaLojaDigital: true,
		expiracaoRegraValidadeValor: 90,
		resgateLimiteTipo: null,
		resgateLimiteValor: null,
	});

	// Maria starts with R$ 30 to redeem: a balance row plus the accrual it came from (FIFO needs it).
	await db.insert(cashbackProgramBalances).values({
		organizacaoId: STORE_ID,
		clienteId: SEED_CLIENTS.maria.id,
		programaId: SEED_CASHBACK_PROGRAM.id,
		saldoValorDisponivel: 30,
		saldoValorAcumuladoTotal: 30,
		saldoValorResgatadoTotal: 0,
	});
	await db.insert(cashbackProgramTransactions).values({
		organizacaoId: STORE_ID,
		clienteId: SEED_CLIENTS.maria.id,
		programaId: SEED_CASHBACK_PROGRAM.id,
		status: "ATIVO",
		tipo: "ACÚMULO",
		valor: 30,
		valorRestante: 30,
		saldoValorAnterior: 0,
		saldoValorPosterior: 30,
		expiracaoData: dayjs().add(90, "day").toDate(),
		operadorId: SEED_USERS.admin.id,
	});
}

/**
 * The demo store: can sell from the first click.
 * Paying CRM + ERP subscription with the Hub add-on, an admin and a restricted operator, three
 * sellers, a catalog covering every product shape, clients across the RFM segments, a cashback
 * program, the online shop with delivery (fee + free-delivery threshold) and an open cash session.
 */
export async function seedBasePack() {
	await createSeedUser({ user: SEED_USERS.admin, telefone: "(34) 99000-0001" });
	await createSeedUser({ user: SEED_USERS.operator, telefone: "(34) 99000-0002" });

	const { financialAccountIdsByKey } = await createSeedStore({
		store: SEED_STORES.demo,
		owner: SEED_USERS.admin,
		ownerSellerId: SEED_SELLERS.admin.id,
		basePlan: "CRM_ERP",
		subscription: "PAGANTE",
		addons: ["HUB_ATENDIMENTOS"],
		cnpj: "11.222.333/0001-81",
		preferencias: {
			// Cash sessions on, but not mandatory: a spec that does not care about the register can still sell.
			sessoesVenda: {
				habilitado: true,
				obrigatorio: false,
				exigirFundoTroco: false,
				conferenciaCega: false,
				bloquearFechamentoComPendenciaFiscal: false,
			},
		},
	});

	await db.insert(sellers).values([
		{
			id: SEED_SELLERS.operator.id,
			organizacaoId: STORE_ID,
			ativo: true,
			nome: SEED_SELLERS.operator.nome,
			identificador: SEED_SELLERS.operator.nome,
			senhaOperador: "11111",
		},
		{
			id: SEED_SELLERS.counter.id,
			organizacaoId: STORE_ID,
			ativo: true,
			nome: SEED_SELLERS.counter.nome,
			identificador: SEED_SELLERS.counter.nome,
			senhaOperador: "22222",
		},
	]);

	// Restricted operator: sells and operates the register; no prices, costs, settings or campaigns.
	await db.insert(organizationMembers).values({
		id: `${STORE_ID}-member-${SEED_USERS.operator.id}`,
		usuarioId: SEED_USERS.operator.id,
		organizacaoId: STORE_ID,
		usuarioVendedorId: SEED_SELLERS.operator.id,
		permissoes: buildRestrictedPermissions({
			vendas: { visualizar: true, criar: true, operarCaixa: true },
			produtos: { visualizar: true },
			clientes: { visualizar: true, criar: true },
			cashback: { visualizar: true },
		}),
	});

	await seedCatalog();
	await seedClients();
	await seedCashback();

	await db.insert(shopSettings).values({
		organizacaoId: STORE_ID,
		ativo: true,
		modo: "CARDAPIO",
		configuracoes: {
			...DEFAULT_SHOP_SETTINGS_CONFIGURATION,
			atendimento: {
				retirada: { ativo: true },
				entrega: { ativo: true, pedidoMinimo: 0, prazoMinutos: 45, taxa: SEED_SHOP_DELIVERY.taxa, gratisAcima: SEED_SHOP_DELIVERY.gratisAcima },
			},
			pagamento: { metodosAceitos: ["DINHEIRO", "PIX", "CARTAO_CREDITO"] },
			// Open all day, every day: a spec must not depend on the hour it runs at.
			operacao: {
				...DEFAULT_SHOP_SETTINGS_CONFIGURATION.operacao,
				horarios: ShopWeekdayEnum.options.map((dia) => ({ dia, periodos: [{ inicio: "00:00", fim: "23:59" }] })),
			},
		},
	});

	// An open register, opened by the admin on the default cash account (same row the open route writes).
	await db.insert(salesSessions).values({
		id: SEED_SALES_SESSION.id,
		organizacaoId: STORE_ID,
		contaFinanceiraId: financialAccountIdsByKey.get("caixa_principal") ?? null,
		politica: "VENDEDORES_MULTIPLOS",
		vendedorPadraoId: SEED_SELLERS.admin.id,
		abertaPorUsuarioId: SEED_USERS.admin.id,
		status: "ABERTA",
		saldoInicial: 100,
		observacoesAbertura: "Caixa aberto pelo seed local.",
	});
}
