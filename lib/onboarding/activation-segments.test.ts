import assert from "node:assert/strict";
import test from "node:test";

import { resolveActivation, resolveActivationSegment, resolveErpChannel, type TActivationFacts, type TActivationSalesOrigin } from "./activation";

const NOW = new Date("2026-11-22T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const none: TActivationSalesOrigin = { primeiraEm: null, ultimaEm: null, semanas: 0, total: 0, diasUltimos7: 0 };
const sold = (overrides: Partial<TActivationSalesOrigin>): TActivationSalesOrigin => ({
	primeiraEm: daysAgo(5),
	ultimaEm: daysAgo(1),
	semanas: 1,
	total: 4,
	diasUltimos7: 3,
	...overrides,
});

function facts(overrides: Partial<TActivationFacts> = {}): TActivationFacts {
	return {
		now: NOW,
		organizacao: { id: "org", criadaEm: daysAgo(10), slug: "loja", erpAcesso: false },
		jornadas: { crm: true, erp: false, erpCanal: null },
		fonte: { modo: "INTEGRACAO", integracaoComErro: null, integracoes: ["BLING"], importacao: { emAndamento: false, vendasImportadas: 0 } },
		base: { clientes: 1284, clientesSegmentados: 1200 },
		vendas: { balcao: none, integracao: sold({}), erp: { BALCAO: none, CATALOGO: none, MESAS: none } },
		canal: { numero: "NENHUM", pagamento: "DESCONHECIDO" },
		campanhas: { preparadas: [], manuaisAtivas: 0, templates: [] },
		envios: { primeiraEntregaEm: null, ultimaEntregaEm: null, entregas14Dias: 0 },
		erp: { produtosUtilizaveis: 0, pendenciasLancamento: [] },
		resultados: { primeiraConversao: null, primeiroCashback: null, conversoes: 0 },
		teste: { emTeste: true, fim: null, metaAceita: false },
		...overrides,
	};
}

const erpFacts = (erp: Partial<TActivationFacts["vendas"]["erp"]>, overrides: Partial<TActivationFacts> = {}) =>
	facts({
		organizacao: { id: "org", criadaEm: daysAgo(20), slug: "loja", erpAcesso: true },
		jornadas: { crm: false, erp: true, erpCanal: "BALCAO" },
		fonte: { modo: "NENHUMA", integracaoComErro: null, integracoes: ["BLING"], importacao: { emAndamento: false, vendasImportadas: 0 } },
		base: { clientes: 3, clientesSegmentados: 0 },
		vendas: { balcao: none, integracao: none, erp: { BALCAO: none, CATALOGO: none, MESAS: none, ...erp } },
		erp: { produtosUtilizaveis: 12, pendenciasLancamento: [] },
		...overrides,
	});

// ------------------------------------------------------------------ segmento

test("segmento pela origem real das vendas", () => {
	assert.equal(resolveActivationSegment(facts()), "CRM_INTEGRACAO");
	assert.equal(resolveActivationSegment(facts({ fonte: { ...facts().fonte, modo: "AMBOS" } })), "CRM_INTEGRACAO");
	assert.equal(resolveActivationSegment(facts({ fonte: { ...facts().fonte, modo: "POI" } })), "CRM_BALCAO");
	assert.equal(resolveActivationSegment(facts({ fonte: { ...facts().fonte, modo: "NENHUMA" } })), "SEM_FONTE");
	assert.equal(resolveActivationSegment(erpFacts({})), "ERP");
});

test("ERP no plano, mas sem jornada nem venda pelo ERP: segue no segmento do CRM", () => {
	assert.equal(resolveActivationSegment(facts({ organizacao: { ...facts().organizacao, erpAcesso: true } })), "CRM_INTEGRACAO");
});

test("ERP em uso com jornada ou fonte do CRM: CRM + ERP", () => {
	assert.equal(resolveActivationSegment(erpFacts({ BALCAO: sold({}) }, { jornadas: { crm: true, erp: false, erpCanal: null } })), "CRM_ERP");
	assert.equal(resolveActivationSegment(erpFacts({}, { fonte: { ...facts().fonte, modo: "INTEGRACAO" } })), "CRM_ERP");
});

test("canal do ERP: o escolhido, senão o que mais vendeu, senão o balcão", () => {
	assert.equal(resolveErpChannel(erpFacts({}, { jornadas: { crm: false, erp: true, erpCanal: "MESAS" } })), "MESAS");
	assert.equal(
		resolveErpChannel(erpFacts({ CATALOGO: sold({ total: 9 }), BALCAO: sold({ total: 2 }) }, { jornadas: { crm: false, erp: false, erpCanal: null } })),
		"CATALOGO",
	);
	assert.equal(resolveErpChannel(erpFacts({}, { jornadas: { crm: false, erp: true, erpCanal: null } })), "BALCAO");
});

// ------------------------------------------------------------------ CRM por integração

test("integração com a carga andando: a base fica em andamento e a ação pula para o WhatsApp", () => {
	const activation = resolveActivation(
		facts({ base: { clientes: 88, clientesSegmentados: 0 }, fonte: { ...facts().fonte, importacao: { emAndamento: true, vendasImportadas: 126 } } }),
	);
	assert.equal(activation.marcos.find((milestone) => milestone.chave === "base")?.estado, "EM_ANDAMENTO");
	assert.match(activation.marcos.find((milestone) => milestone.chave === "base")?.detalhe ?? "", /126 vendas importadas/);
	assert.equal(activation.proximaAcao?.chave, "conectar-whatsapp");
	assert.equal(activation.visivel, true);
	// Progresso iniciado: conta e sistema já contam como feitos.
	assert.deepEqual(activation.progresso, { feitos: 2, total: 5 });
});

test("integração com erro: reconectar vem antes de tudo", () => {
	const activation = resolveActivation(facts({ fonte: { ...facts().fonte, integracaoComErro: { nome: "Bling" } } }));
	assert.equal(activation.proximaAcao?.chave, "reconectar-integracao");
	assert.match(activation.proximaAcao?.descricao ?? "", /Bling/);
});

test("WhatsApp conectado: a ação segue o que bloqueia a primeira entrega", () => {
	const connected = { numero: "CONECTADO" as const, pagamento: "DESCONHECIDO" as const };
	assert.equal(resolveActivation(facts({ canal: connected })).proximaAcao?.chave, "preparar-campanha");
	const ready = facts({
		canal: connected,
		campanhas: { preparadas: [{ chave: "primeira-compra", titulo: "Boas-vindas", estado: "PRONTA", pronta: true }], manuaisAtivas: 0, templates: [] },
	});
	assert.equal(resolveActivation(ready).proximaAcao?.chave, "liberar-campanha");
	const review = facts({
		canal: connected,
		campanhas: {
			preparadas: [{ chave: "primeira-compra", titulo: "Boas-vindas", estado: "HABILITADA", pronta: false }],
			manuaisAtivas: 0,
			templates: [{ nome: "Boas-vindas", status: "EM_ANALISE" }],
		},
	});
	const waiting = resolveActivation(review);
	assert.equal(waiting.proximaAcao?.chave, "aguardando-meta");
	assert.equal(waiting.proximaAcao?.href, null);
	assert.equal(resolveActivation(facts({ canal: { numero: "CONECTADO", pagamento: "PENDENTE" } })).proximaAcao?.chave, "pagamento-whatsapp");
});

test("campanha manual ligada conta como preparada", () => {
	const activation = resolveActivation(
		facts({ canal: { numero: "CONECTADO", pagamento: "VERIFICADO" }, campanhas: { preparadas: [], manuaisAtivas: 2, templates: [] } }),
	);
	assert.equal(activation.proximaAcao?.chave, "aguardando-publico");
});

test("primeira entrega: ativada e fora da superfície", () => {
	const activation = resolveActivation(
		facts({
			canal: { numero: "CONECTADO", pagamento: "VERIFICADO" },
			envios: { primeiraEntregaEm: daysAgo(3), ultimaEntregaEm: daysAgo(1), entregas14Dias: 0 },
		}),
	);
	assert.equal(activation.ativado, true);
	assert.equal(activation.regressao, null);
	assert.equal(activation.proximaAcao, null);
	assert.equal(activation.visivel, false);
});

test("regressão: sem entrega há mais de 14 dias, ou canal perdido", () => {
	const quiet = resolveActivation(
		facts({
			canal: { numero: "CONECTADO", pagamento: "VERIFICADO" },
			envios: { primeiraEntregaEm: daysAgo(90), ultimaEntregaEm: daysAgo(20), entregas14Dias: 0 },
		}),
	);
	assert.equal(quiet.regressao?.motivo, "SEM_ENVIO");
	assert.equal(quiet.proximaAcao?.chave, "revisar-campanhas");
	assert.equal(quiet.visivel, true);
	const lost = resolveActivation(
		facts({
			canal: { numero: "NENHUM", pagamento: "DESCONHECIDO" },
			envios: { primeiraEntregaEm: daysAgo(90), ultimaEntregaEm: daysAgo(100), entregas14Dias: 0 },
		}),
	);
	assert.equal(lost.regressao?.motivo, "CANAL_PERDIDO");
	assert.equal(lost.proximaAcao?.chave, "reconectar-whatsapp");
});

// ------------------------------------------------------------------ CRM pelo balcão

test("balcão sem venda: a primeira venda é a próxima ação, com o Ponto de Interação", () => {
	const activation = resolveActivation(
		facts({ fonte: { ...facts().fonte, modo: "POI" }, base: { clientes: 0, clientesSegmentados: 0 }, vendas: { ...facts().vendas, integracao: none } }),
	);
	assert.equal(activation.segmento, "CRM_BALCAO");
	assert.equal(activation.proximaAcao?.chave, "primeira-venda-balcao");
	assert.equal(activation.proximaAcao?.href, "/point-of-interaction/org");
	assert.deepEqual(activation.progresso, { feitos: 2, total: 6 });
});

test("balcão em uma semana só: pede a segunda semana antes do WhatsApp", () => {
	const activation = resolveActivation(
		facts({ fonte: { ...facts().fonte, modo: "POI" }, vendas: { ...facts().vendas, balcao: sold({ total: 12 }) } }),
	);
	assert.equal(activation.proximaAcao?.chave, "registrar-balcao");
	assert.match(activation.proximaAcao?.descricao ?? "", /12 vendas registradas/);
	const twoWeeks = resolveActivation(facts({ fonte: { ...facts().fonte, modo: "POI" }, vendas: { ...facts().vendas, balcao: sold({ semanas: 2 }) } }));
	assert.equal(twoWeeks.proximaAcao?.chave, "conectar-whatsapp");
});

// ------------------------------------------------------------------ ERP

test("ERP no balcão: primeira venda feita, ativação só na segunda semana", () => {
	const firstWeek = resolveActivation(erpFacts({ BALCAO: sold({ semanas: 1 }) }));
	assert.equal(firstWeek.segmento, "ERP");
	assert.equal(firstWeek.ativado, false);
	assert.equal(firstWeek.proximaAcao?.chave, "abrir-pdv");
	assert.equal(firstWeek.marcos.find((milestone) => milestone.chave === "primeira-venda-erp")?.estado, "FEITO");
	const secondWeek = resolveActivation(erpFacts({ BALCAO: sold({ semanas: 2 }) }));
	assert.equal(secondWeek.ativado, true);
	assert.equal(secondWeek.visivel, false);
});

test("ERP sem produtos: cadastrar vem antes da venda; pendência de lançamento antes de abrir o canal", () => {
	assert.equal(
		resolveActivation(erpFacts({}, { erp: { produtosUtilizaveis: 0, pendenciasLancamento: [] } })).proximaAcao?.chave,
		"cadastrar-produtos",
	);
	const catalog = resolveActivation(
		erpFacts(
			{},
			{
				jornadas: { crm: false, erp: true, erpCanal: "CATALOGO" },
				erp: {
					produtosUtilizaveis: 5,
					pendenciasLancamento: [{ chave: "loja", rotulo: "Loja com atendimento e pagamento configurados", href: "/dashboard/catalog/store" }],
				},
			},
		),
	);
	assert.equal(catalog.proximaAcao?.chave, "lancamento-loja");
	assert.equal(catalog.marcos.find((milestone) => milestone.chave === "primeira-venda-erp")?.rotulo, "Primeiro pedido pela loja");
});

test("ERP ativado sem venda há mais de 7 dias: regressão com a ação do canal", () => {
	const activation = resolveActivation(
		erpFacts({ MESAS: sold({ semanas: 3, ultimaEm: daysAgo(10) }) }, { jornadas: { crm: false, erp: true, erpCanal: "MESAS" } }),
	);
	assert.equal(activation.regressao?.motivo, "SEM_VENDA");
	assert.equal(activation.proximaAcao?.chave, "abrir-comandas");
	assert.match(activation.proximaAcao?.descricao ?? "", /comandas desde/);
});

// ------------------------------------------------------------------ CRM + ERP e sem fonte

test("CRM + ERP: escada do ERP até firmar, depois a do CRM com o PDV como fonte", () => {
	const both = (semanas: number) =>
		erpFacts({ BALCAO: sold({ semanas }) }, { jornadas: { crm: true, erp: true, erpCanal: "BALCAO" }, base: { clientes: 40, clientesSegmentados: 0 } });
	const early = resolveActivation(both(1));
	assert.equal(early.segmento, "CRM_ERP");
	assert.ok(early.marcos.some((milestone) => milestone.chave === "erp-segunda-semana"));
	const later = resolveActivation(both(2));
	assert.equal(later.ativado, false);
	assert.equal(later.marcos[1]?.rotulo, "Vendas pelo PDV");
	assert.equal(later.proximaAcao?.chave, "conectar-whatsapp");
});

test("sem fonte: definir de onde vêm as vendas, retomando a etapa do onboarding", () => {
	const activation = resolveActivation(facts({ fonte: { ...facts().fonte, modo: "NENHUMA" }, base: { clientes: 0, clientesSegmentados: 0 } }));
	assert.equal(activation.segmento, "SEM_FONTE");
	assert.equal(activation.proximaAcao?.chave, "definir-fonte");
	assert.equal(activation.proximaAcao?.href, "/onboarding?produto=CRM&retomar=true&etapa=fonte-dados");
	assert.equal(activation.ativado, false);
});

// ------------------------------------------------------------------ celebrações

test("celebração: a primeira compra de quem recebeu campanha vence as outras", () => {
	const activation = resolveActivation(
		facts({
			canal: { numero: "CONECTADO", pagamento: "VERIFICADO" },
			envios: { primeiraEntregaEm: daysAgo(5), ultimaEntregaEm: daysAgo(1), entregas14Dias: 48 },
			resultados: { primeiraConversao: { em: daysAgo(1), valor: 87, minutos: 6 * 24 * 60 }, primeiroCashback: null, conversoes: 1 },
		}),
	);
	assert.equal(activation.celebracao?.titulo, "Um cliente voltou depois da sua campanha");
	assert.match(activation.celebracao?.texto ?? "", /comprou R\$\s?87,00, 6 dias depois\./);
	// Ativada e sem regressão: a superfície some, a celebração continua.
	assert.equal(activation.visivel, false);
});

test("celebração: primeira campanha entregue, com o número real de mensagens", () => {
	const activation = resolveActivation(
		facts({
			canal: { numero: "CONECTADO", pagamento: "VERIFICADO" },
			envios: { primeiraEntregaEm: daysAgo(2), ultimaEntregaEm: daysAgo(1), entregas14Dias: 48 },
		}),
	);
	assert.equal(activation.celebracao?.titulo, "Sua primeira campanha saiu");
	assert.match(activation.celebracao?.texto ?? "", /^48 mensagens entregues desde/);
	assert.match(activation.celebracao?.chave ?? "", /^primeira-entrega:\d{4}-\d{2}-\d{2}$/);
});

test("celebração: passou a janela, nada a celebrar", () => {
	const activation = resolveActivation(
		facts({
			canal: { numero: "CONECTADO", pagamento: "VERIFICADO" },
			envios: { primeiraEntregaEm: daysAgo(30), ultimaEntregaEm: daysAgo(1), entregas14Dias: 48 },
		}),
	);
	assert.equal(activation.celebracao, null);
});

test("celebração: primeira venda no balcão cita o cashback ganho, só se houve", () => {
	const counter = (cashback: TActivationFacts["resultados"]["primeiroCashback"]) =>
		resolveActivation(
			facts({
				fonte: { ...facts().fonte, modo: "POI" },
				vendas: { ...facts().vendas, balcao: sold({ primeiraEm: daysAgo(1) }) },
				resultados: { primeiraConversao: null, primeiroCashback: cashback, conversoes: 0 },
			}),
		);
	assert.match(counter({ em: daysAgo(1), valor: 5 }).celebracao?.texto ?? "", /R\$\s?5,00 de cashback/);
	assert.match(counter(null).celebracao?.texto ?? "", /já está na sua base/);
});

test("celebração: primeira venda pelo canal do ERP", () => {
	const activation = resolveActivation(
		erpFacts({ MESAS: sold({ primeiraEm: daysAgo(2), total: 6 }) }, { jornadas: { crm: false, erp: true, erpCanal: "MESAS" } }),
	);
	assert.equal(activation.celebracao?.titulo, "Sua primeira comanda fechada");
});

// ------------------------------------------------------------------ meta do teste e ritmo do ERP

test("meta do teste: aceita, ativada e em teste; conta as compras atribuídas", () => {
	const activated = (teste: TActivationFacts["teste"]) =>
		resolveActivation(
			facts({
				canal: { numero: "CONECTADO", pagamento: "VERIFICADO" },
				envios: { primeiraEntregaEm: daysAgo(20), ultimaEntregaEm: daysAgo(1), entregas14Dias: 30 },
				resultados: { primeiraConversao: { em: daysAgo(15), valor: 50, minutos: 60 }, primeiroCashback: null, conversoes: 3 },
				teste,
			}),
		);
	const fim = new Date(NOW.getTime() + 4 * DAY);
	assert.deepEqual(activated({ emTeste: true, fim, metaAceita: true }).metaTeste, { atual: 3, alvo: 5, fim });
	assert.equal(activated({ emTeste: true, fim, metaAceita: false }).metaTeste, null);
	assert.equal(activated({ emTeste: false, fim, metaAceita: true }).metaTeste, null);
	// Antes da ativação, a escada é a meta.
	assert.equal(resolveActivation(facts({ teste: { emTeste: true, fim, metaAceita: true } })).metaTeste, null);
});

test("ERP na primeira semana: ritmo da semana com o número real de dias", () => {
	const activation = resolveActivation(erpFacts({ BALCAO: sold({ semanas: 1, diasUltimos7: 3 }) }));
	assert.equal(activation.proximaAcao?.descricao, "Vendas em 3 dias dos últimos 7. Meta da semana: vender pelo sistema em 5.");
});

// ------------------------------------------------------------------ marcas

test("marcas: o sistema conectado, a Meta e o canal do ERP", () => {
	const crm = resolveActivation(facts());
	assert.deepEqual(crm.marcos.find((milestone) => milestone.chave === "fonte")?.marca, { tipo: "INTEGRACAO", integracoes: ["BLING"] });
	assert.deepEqual(crm.marcos.find((milestone) => milestone.chave === "whatsapp")?.marca, { tipo: "META" });
	assert.equal(crm.marcos.find((milestone) => milestone.chave === "conta")?.marca ?? null, null);
	const erp = resolveActivation(erpFacts({}, { jornadas: { crm: false, erp: true, erpCanal: "MESAS" } }));
	const channel = erp.marcos.find((milestone) => milestone.chave === "canal-erp");
	assert.deepEqual(channel?.marca, { tipo: "CANAL", canal: "MESAS" });
	assert.equal(channel?.detalhe, "Mesas e comandas");
	const counter = resolveActivation(facts({ fonte: { ...facts().fonte, modo: "POI" } }));
	assert.deepEqual(counter.marcos.find((milestone) => milestone.chave === "fonte")?.marca, { tipo: "RECOMPRACRM" });
});
