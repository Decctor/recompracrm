# Pontos de Atendimento e Contas (Tabs) — Plano Consolidado

Documento unico de design + implementacao do modulo de mesas e comandas. Consolida `interaction-points-and-tabs-design.md`, `tabs-implementation-plan.md` e os pontos aproveitados da auditoria externa (`food-service-command-module-design.md`), todos removidos apos esta consolidacao. Melhorias deliberadamente adiadas estao em `future-improvements.md`.

## 1. Contexto e decisao

Organizacoes de alimentacao precisam operar com mesas e comandas: abrir uma conta de consumo, acumular pedidos ao longo do atendimento, visualizar as contas abertas e fechar com pagamento no final. Tambem ha demanda por QR Codes que iniciem uma comanda ou deem acesso aos dados da conta em andamento.

Estado atual do modelo:

- `sales.comandaNumero` e um campo de texto livre na venda — suficiente apenas para etiquetar uma venda avulsa. Nao suporta conta que agrega pedidos, board de contas abertas, QR duravel ou fechamento consolidado;
- `deliveryModeEnum` ja possui o valor `COMANDA`;
- `poiTransactionRequests` ja implementa "point of interaction" para o playbook de fidelidade — outro significado, nao reutilizar o nome;
- `salesSessions` cobre turno de caixa e segue ortogonal (a comanda fecha _dentro_ de um turno).

A demanda "mesas e comandas" esconde **dois primitivos com ciclos de vida diferentes**:

- a **mesa** e uma ancora fisica/logica duravel. Um QR impresso e colado na mesa precisa apontar para algo estavel, que sobrevive a abertura e fechamento de contas → `servicePoints`;
- a **comanda** e uma conta de consumo efemera, com ciclo de vida (abre, acumula, fecha), que pode existir sem mesa → `tabs`.

O modelo deve ser excelente para food-service antes de tentar ser universal. Nao criar tabela especifica de `mesas`, mas tambem nao esconder regras essenciais do salao em `metadados` genericos. Outros segmentos (pousada: quarto/estadia; oficina: box/OS; salao de beleza: cadeira) reutilizam os primitivos quando os ciclos de vida forem equivalentes.

O modulo de codigo vive em **`lib/tabs/`** — o `lib/` e organizado por dominio (`lib/sales`, `lib/stock`, ...), nao por vertical de segmento. "Tab" e o primitivo; food-service e apenas o primeiro consumidor.

### Vocabulario do modulo

| Termo             | O que e                                                                | Ciclo de vida                                                        | Observacoes                                                                                                  |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `servicePoint`    | Ancora fisica/logica do atendimento ("Mesa 5", "Balcao", "Quiosque 2") | Duravel — sobrevive a todas as sessoes                               | QR proprio duravel; opcional (balcao puro nao cadastra pontos)                                               |
| `tab`             | Conta de consumo ("comanda") — o que o cliente deve                    | Efemera: abre → acumula → fecha (`ABERTA`/`FECHADA`/`CANCELADA`)     | Pode existir sem ponto; QR proprio efemero                                                                   |
| `codigo` (da tab) | Numero da comanda fisica (cartao/ficha reutilizavel)                   | Unico entre tabs `ABERTAS` (partial unique); liberado no fechamento  | Ponte pragmatica: cartao plastico reutilizavel nao carrega token efemero                                     |
| `tabOrder`        | Rodada/pedido — o ticket que a cozinha enxerga                         | Vive dentro da tab, `numero` sequencial                              | Sem identidade comercial/financeira/fiscal; status reusa `saleAttendanceStatusEnum`; baixa fisica na entrega |
| venda rascunho    | Identidade comercial da conta                                          | Uma venda `ORCAMENTO` por tab aberta, criada lazy no primeiro pedido | Pagamento/fiscal/contabil acontecem uma unica vez, no fechamento                                             |
| `tabOrderRequest` | Intencao publica de pedido via QR, aguardando aprovacao                | `PENDENTE → PROCESSANDO → CONCLUIDA/REJEITADA/ERRO`                  | Precificacao autoritativa na aprovacao; idempotente por chave + payload                                      |
| `serviceSettings` | Politicas de operacao da organizacao (1:1)                             | Configuracao, nao entidade                                           | Presets = combinacoes de politicas, nao um enum de modos                                                     |
| QR do ponto       | Token duravel impresso no ponto (bruto persistido, reimprimivel)       | Rotacionavel por operacao explicita                                  | Abre cardapio e solicita pedido; NUNCA expoe consumo de tabs abertas                                         |
| QR da tab         | Token efemero da conta (papel/pulseira/cartao impresso por sessao)     | Revogado naturalmente ao fechar a conta                              | Mostra extrato e permite pedir mais                                                                          |
| `deviceKey`       | Credencial do dispositivo do cliente no fluxo publico                  | Gerada no client (localStorage); apenas o hash e persistido          | Autorizacao derivada: aprovacao vincula dispositivo → tab (secao 8)                                          |

Relacoes centrais: um ponto hospeda **N tabs abertas simultaneamente** (deliberadamente sem unique — varias comandas na mesma mesa e caso real); tab 1—N `tabOrders`; tab 1—1 venda rascunho (estrutural 1:N para fechamento parcial futuro); `saleItems` apontam a venda rascunho **e** o `tabOrder` de origem.

### Decisoes ja tomadas

1. **Baixa fisica de estoque no evento fisico** — a entrega de cada pedido (`tabOrder`) baixa os itens daquele pedido, nao o fechamento da conta. Alinha com o comportamento existente: `processSaleAttendanceStatusChange` ja baixa estoque na transicao que exige saida fisica, e a confirmacao so baixa quando a venda nasce `ENTREGUE` (balcao);
2. **Itens com producao (pratos)** baixam estoque **por composicao** (explosao da ficha tecnica), sem criar ordem de producao por prato (secao 6);
3. **Ponto de atendimento e opcional** — `servicePoints` nao e pre-requisito para comanda ou balcao;
4. **`shop` nao e o checkout do salao** — reutilizar catalogo, product builder e validacao de precos; adapters de submissao separados (secao 8);
5. **Venda rascunho lazy** — criada no primeiro pedido, nao na abertura da tab (abrir conta nao cria venda vazia);
6. **Abertura/pedido via QR** — default `SOLICITACAO` com aprovacao do operador; `AUTOMATICA`/`DIRETO` somente apos controles de abuso validados;
7. **Nomes**: `tabs` (termo consagrado de POS; `accounts` colide com `financialAccounts`) e `servicePoints` (evita colisao com o POI de fidelidade). Rotulo de UI configuravel por segmento fica para o futuro.

### Modos de operacao nao sao entidades

Uma organizacao pode operar mais de um fluxo ao mesmo tempo (balcao rapido + salao com mesas). A existencia de um ponto ou de uma tab nao habilita implicitamente um comportamento. Persistir uma configuracao tipada, 1:1 por organizacao:

```ts
serviceSettings {
  pontos: {
    habilitados: boolean
  }
  contas: {
    habilitadas: boolean
    identificacao: "AUTOMATICA" | "CODIGO_MANUAL"
    pontoObrigatorio: boolean
    maxAbertasPorPonto: number | null
  }
  aberturaPublica: "DESABILITADA" | "SOLICITACAO" | "AUTOMATICA"
  pedidosCliente: "DESABILITADO" | "SOLICITACAO" | "DIRETO"
}
```

A UI oferece presets, mas persiste as politicas:

| Preset           | Politicas principais                                                  | Experiencia                                                         |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Balcao           | pontos e contas desabilitados                                         | venda/pedido avulso pelo fluxo normal                               |
| Somente mesas    | ponto obrigatorio, identificacao automatica, maximo 1 conta por ponto | operador escolhe a mesa; a tab e aberta/reusada sem expor "comanda" |
| Somente comandas | pontos desabilitados, codigo manual                                   | operador informa ou le o codigo da comanda                          |
| Mesas + comandas | ponto obrigatorio, codigo manual, varias contas por ponto             | varias comandas vinculadas a mesma mesa                             |

Persistir politicas, em vez de um mega-enum `MESA | COMANDA | HIBRIDO`, evita combinacoes artificiais. As regras nao sao inferidas pela nulabilidade das FKs: a exclusividade por ponto e garantida pelo service de abertura com guarda transacional (secao 4.1), nao por indice global — um unique por ponto impediria o fluxo legitimo de varias comandas na mesma mesa.

No preset "Somente mesas", a tab continua existindo no banco (e a conta que agrega pedidos e viabiliza o fechamento); ela e apenas oculta na UI — selecionar "Mesa 12" resolve ou abre automaticamente sua tab.

## 2. Relacao com vendas

O grao comercial da comanda e a **conta**, nao o pedido. Pagamento, fiscal e contabilidade acontecem uma unica vez, no fechamento: um acerto (frequentemente dividido entre pessoas/metodos), uma NFC-e cobrindo todo o consumo, um lancamento contabil. Somente a cozinha opera no grao do pedido (rodada).

```txt
abrir conta (tab ABERTA, com ou sem ponto)
  -> lancar pedido 1 (cria venda rascunho + tabOrder 1 + itens)
       -> cozinha: tabOrder EM_PREPARO -> PRONTO -> ENTREGUE  [baixa fisica dos itens do pedido]
  -> lancar pedido 2 (apenda itens na mesma venda rascunho + tabOrder 2)
       -> ...
  -> fechar conta (checkout):
       - baixa o que ainda nao foi entregue (delta por item)
       - metodos de pagamento reais (1..N transacoes)
       - confirma a venda rascunho: contabil + financeiro efetivado + fiscal, vinculado ao turno de caixa
       - tab FECHADA com snapshot de valorTotal
```

- **Venda rascunho por conta**: ao lancar o primeiro pedido, criar uma venda `statusVenda = "ORCAMENTO"` ligada a tab (`sales.tabId`). Pedidos seguintes apendam itens nessa mesma venda, reusando `saleItems`/`saleItemModifiers`/precificacao. Apoia-se em `sales-status-and-fulfillment-design.md`: venda em `ORCAMENTO` nao dispara efeito de ERP;
- **`tabOrders`**: as rodadas sao entidade operacional leve, sem identidade comercial/financeira/fiscal — o ticket que a cozinha enxerga, espelhando a comanda de papel;
- **Fechamento** = checkout da venda rascunho, uma unica vez, com pagamentos reais e sessao de caixa de quem fecha;
- A FK `sales.tabId` permanece 1:N estruturalmente para suportar fechamento parcial no futuro sem migracao;
- `dataVenda` e definida no fechamento — o momento comercial real;
- Nao existem recebiveis sinteticos durante o consumo: o "financeiro" da conta aberta e o total parcial derivado dos itens, exibido no board.

**Alternativa rejeitada** — cada rodada como venda confirmada com recebiveis: o metodo de pagamento nao e conhecido no pedido (placeholders inventados), o pagamento real nao mapeia para rodadas (pro-rata inventado), fiscal exigiria N documentos por conta, e lancamentos por rodada geram ruido/estornos. O unico ponto forte (pipeline de cozinha por rodada) e coberto por `tabOrders` com custo menor.

**Efeitos aceitos**: vendas rascunho de contas abertas nao aparecem em relatorios de venda ate o fechamento (comercialmente correto); o board expoe o consumo em aberto como metrica derivada. Contas abandonadas: o board mostra a idade; cancelar a tab cancela a venda rascunho e os pedidos.

## 3. Schema

### 3.1 Enums

`services/drizzle/schema/enums.ts`:

```ts
export const tabStatusEnum = pgEnum("tab_status", ["ABERTA", "FECHADA", "CANCELADA"]);
export const servicePointTypeEnum = pgEnum("service_point_type", ["MESA", "BALCAO", "QUIOSQUE", "OUTRO"]);

// Como a venda de um produto baixa estoque:
// ESTOQUE_PROPRIO — baixa o saldo do proprio produto/variante (comportamento atual);
// COMPOSICAO — explode a ficha tecnica e baixa os insumos (pratos, drinks, lanches).
export const productStockDeductionModeEnum = pgEnum("product_stock_deduction_mode", ["ESTOQUE_PROPRIO", "COMPOSICAO"]);
```

Espelhos Zod em `schemas/enums.ts` (`TabStatusEnum`/`TTabStatusEnum` etc.), com `required_error`/`invalid_type_error`.

Pedidos (`tabOrders`) **reusam** `saleAttendanceStatusEnum` e os helpers de `lib/sales/sale-processing/attendance.ts` (`isValidAttendanceTransition`, `attendanceStatusRequiresPhysicalOut`) — mesmas transicoes ja validadas.

### 3.2 `services/drizzle/schema/service-points.ts`

```ts
export const servicePoints = newTable(
	"service_points",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		rotulo: text("rotulo").notNull(), // "Mesa 12"
		grupo: text("grupo"), // "Salao", "Varanda"
		tipo: servicePointTypeEnum("tipo").notNull(), // MESA, BALCAO, QUIOSQUE, OUTRO
		capacidade: doublePrecision("capacidade"),
		tokenPublicoHash: varchar("token_publico_hash", { length: 255 }).notNull(),
		ativo: boolean("ativo").default(true).notNull(),
		metadados: jsonb("metadados"), // extensoes; nao guarda regras centrais
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		organizacaoAtivoIdx: index("idx_service_points_org_ativo").on(table.organizacaoId, table.ativo),
		tokenPublicoHashIdx: uniqueIndex("idx_service_points_token_publico_hash").on(table.tokenPublicoHash),
	}),
);
```

Relations: `organizacao`, `tabs: many(tabs)`. Exportar `TServicePointEntity`/`TNewServicePointEntity` e barrel-export em `schema/index.ts`. Organizacoes de balcao ou somente comandas nao precisam cadastrar pontos. `poiTransactionRequests` pode ganhar `servicePointId` nullable apenas para solicitacoes do playbook que precisem registrar origem fisica.

### 3.3 `services/drizzle/schema/tabs.ts`

```ts
export const tabs = newTable(
	"tabs",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		servicePointId: varchar("service_point_id", { length: 255 }).references(() => servicePoints.id, { onDelete: "set null" }),
		codigo: text("codigo"), // nullable em mesa; obrigatorio quando houver comanda fisica
		clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }),
		status: tabStatusEnum("status").notNull().default("ABERTA"),
		tokenPublicoHash: varchar("token_publico_hash", { length: 255 }).notNull(),
		responsavelVendedorId: varchar("responsavel_vendedor_id", { length: 255 }).references(() => sellers.id, { onDelete: "set null" }),
		abertaPorUsuarioId: varchar("aberta_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		fechadaPorUsuarioId: varchar("fechada_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		valorTotal: doublePrecision("valor_total"), // snapshot congelado no fechamento
		observacoes: text("observacoes"),
		metadados: jsonb("metadados"),
		dataAbertura: timestamp("data_abertura").defaultNow().notNull(),
		dataFechamento: timestamp("data_fechamento"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		orgStatusIdx: index("idx_tabs_org_status").on(table.organizacaoId, table.status),
		pontoIdx: index("idx_tabs_service_point").on(table.servicePointId),
		tokenPublicoHashIdx: uniqueIndex("idx_tabs_token_publico_hash").on(table.tokenPublicoHash),
		// Impede duas comandas fisicas com o mesmo codigo abertas ao mesmo tempo; libera reuso apos fechar.
		codigoAbertaIdx: uniqueIndex("idx_tabs_org_codigo_aberta")
			.on(table.organizacaoId, table.codigo)
			.where(sql`status = 'ABERTA' AND codigo IS NOT NULL`),
	}),
);

export const tabOrders = newTable(
	"tab_orders",
	{
		id: varchar("id", { length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		tabId: varchar("tab_id", { length: 255 })
			.references(() => tabs.id, { onDelete: "cascade" })
			.notNull(),
		numero: doublePrecision("numero").notNull(), // sequencial dentro da conta
		status: saleAttendanceStatusEnum("status").notNull().default("EM_PREPARO"),
		observacoes: text("observacoes"), // "sem cebola", nome da pessoa da rodada
		lancadoPorUsuarioId: varchar("lancado_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
		dataEnvio: timestamp("data_envio").defaultNow().notNull(),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		tabIdx: index("idx_tab_orders_tab").on(table.tabId),
		orgStatusIdx: index("idx_tab_orders_org_status").on(table.organizacaoId, table.status),
		tabNumeroIdx: uniqueIndex("idx_tab_orders_tab_numero").on(table.tabId, table.numero),
	}),
);
```

Relations: `tabs` -> `servicePoint`, `cliente`, `responsavelVendedor`, `abertaPorUsuario`/`fechadaPorUsuario` (com `relationName`, padrao `salesSessions`), `vendas: many(sales)`, `pedidos: many(tabOrders)`. `tabOrders` -> `tab`, `itens: many(saleItems)`.

**Nao** forcar unicidade de tab aberta por ponto no schema: varias comandas na mesma mesa (uma por pessoa) e caso real. A exclusividade do preset "Somente mesas" e validacao de servico sob advisory lock (secao 4.1).

### 3.4 Alteracoes em `sales.ts`

```ts
// sales
tabId: varchar("tab_id", { length: 255 }).references(() => tabs.id, { onDelete: "set null" }),

// index: uma unica venda em rascunho por conta; 1:N estrutural para fechamento parcial futuro
tabRascunhoIdx: uniqueIndex("idx_sales_tab_rascunho")
  .on(table.tabId)
  .where(sql`status_venda = 'ORCAMENTO' AND tab_id IS NOT NULL`),

// saleItems
tabOrderId: varchar("tab_order_id", { length: 255 }).references(() => tabOrders.id, { onDelete: "set null" }),
// index: idx_sale_items_tab_order (tabOrderId)
```

Ao vincular uma venda a uma tab, denormalizar `tab.codigo ?? servicePoint.rotulo` em `sales.comandaNumero` (snapshot legado — relatorios existentes continuam funcionando; deprecar o campo somente quando o fluxo novo consolidar). Vendas antigas com `comandaNumero` nao precisam de backfill.

### 3.5 Alteracoes em `products.ts`

```ts
// products (e espelho em productVariants para override por variante — fase 2)
baixaEstoqueModo: productStockDeductionModeEnum("baixa_estoque_modo").default("ESTOQUE_PROPRIO").notNull(),
fichaTecnicaReceitaId: varchar("ficha_tecnica_receita_id", { length: 255 }), // FK para productionRecipes
```

Atencao a ciclo de import: `productions.ts` ja importa `products.ts`. Declarar a coluna sem `.references()` no Drizzle e criar a FK na migracao SQL (ou mover a relation para `productionsRelations`).

### 3.6 `tab-order-requests.ts` (fase de QR)

```ts
tabOrderRequests {
  id
  organizacaoId
  servicePointId           // nullable
  tabId                    // nullable ate a aprovacao
  tabOrderId               // preenchido na conclusao
  idempotencyKey
  payloadHash
  payloadSolicitacao
  status                   // PENDENTE | APROVADA | REJEITADA | PROCESSANDO | CONCLUIDA | ERRO
  operadorAprovadorId
  motivoRejeicao
  erroProcessamento
  dataInsercao
  dataAtualizacao
}
```

Segue o padrao de idempotencia ja existente em `shopOrderRequests` (idempotencyKey + payloadHash). Nao adicionar tipos de pedido ao `poiTransactionRequestTypeEnum` — o workflow POI permanece focado em fidelidade/transacao.

### 3.7 Migracao

Fase 1: enums novos; tabelas `service_settings`, `service_points`, `tabs`, `tab_orders`; colunas novas em `sales`, `sale_items` e `products`; indices (incluindo os parciais via SQL). Sem backfill. `tab_order_requests` entra na migracao da fase de QR.

## 4. Services (`lib/tabs/`)

Padrao existente: funcao pura recebendo `input` tipado (+ `organization`/`session` quando preciso), sem `NextRequest`/`NextResponse`, trabalho em `db.transaction` quando ha multiplas escritas. Nenhum I/O externo dentro de transacao (fiscal e pos-commit, padrao ja seguido por `processSaleConfirmationPostCommit`).

### 4.1 `open-tab.ts`

- resolve `serviceSettings` e valida as politicas: ponto obrigatorio, codigo manual e limite de tabs abertas por ponto;
- **guarda de concorrencia da abertura**: o partial unique de `codigo` so protege comandas fisicas (`codigo IS NOT NULL`). No preset "Somente mesas" (`codigo` nulo), dois operadores abrindo a mesma mesa simultaneamente criariam duas tabs. Antes de procurar/criar a tab, adquirir advisory lock transacional:

  ```sql
  SELECT pg_advisory_xact_lock(hashtext('tab-open:' || :organizacaoId || ':' || :servicePointId));
  ```

  (mesmo padrao ja usado em `lib/whatsapp/smb-contacts-sync.ts`). Apos o lock, reconsultar as tabs abertas do ponto e aplicar `maxAbertasPorPonto`. Para comandas com codigo, o partial unique continua defendendo no banco e a violacao vira erro amigavel;

- no preset "Somente mesas", abre ou retorna a tab implicita do ponto sem exigir codigo do operador;
- gera o token publico, persiste apenas seu hash e retorna o valor bruto somente para montar/regenerar o QR;
- nao cria venda — a venda rascunho e lazy no primeiro pedido.

### 4.2 `launch-tab-order.ts`

Em transacao:

1. carrega a tab com lock logico (`status = "ABERTA"`, senao 400 "Conta nao esta aberta.");
2. **idempotencia leve**: o client (celular do garcom, aprovacao de QR) gera o UUID do `tabOrder` e envia no payload. Duplo toque/retry reenvia o mesmo id; o conflito de PK dedupa, e o service trata o conflito retornando o pedido ja criado. Sem tabela de execucoes — o id do proprio registro e a chave;
3. resolve a venda rascunho da tab (`sales WHERE tabId = X AND statusVenda = 'ORCAMENTO'`); se nao existe, cria com `statusVenda = "ORCAMENTO"`, `entregaModalidade = "COMANDA"`, `comandaNumero` denormalizado, `clienteId = tab.clienteId`, vendedor = responsavel da tab;
4. aloca o numero do `tabOrder` sob lock da tab (ou contador atomico) e protege com unique `(tabId, numero)`; nao usar `max(numero) + 1` sem lock;
5. insere os `saleItems` (com `adicionais`) apontando `vendaId` (rascunho) e `tabOrderId`, aprofundando `lib/sales/sale-pricing-validation.ts` como Interface autoritativa compartilhada com POS e shop;
6. recalcula `valorTotal`/`custoTotal`/`descontosTotal` da venda rascunho.

### 4.3 `process-tab-order-status-change.ts`

Espelho de `processSaleAttendanceStatusChange`, no grao do pedido. Diferencas deliberadas:

- **sem gate de pagamento**: pedido de comanda e entregue sem estar pago — o pagamento e no fechamento da conta;
- **sem efeitos pos-entrega**: nao dispara fiscal nem cashback por pedido — ambos no fechamento;
- **baixa fisica por pedido**: na transicao para status com `attendanceStatusRequiresPhysicalOut` (ENTREGUE/PARCIALMENTE_ENTREGUE), baixa apenas os itens do pedido (`saleItems WHERE tabOrderId = X`), respeitando `rastreamentoEstoque` da org e `rastreamentoEstoqueAtivo` do produto/variante;
- atualiza `quantidadeEntregue` dos itens do pedido na mesma transacao (base da deduplicacao — 4.4);
- valida transicao com o mesmo `isValidAttendanceTransition`.

Nao reutilizar `processSaleAttendanceStatusChange` diretamente: ele exige venda confirmada e pagamento antes da entrega, o que nao se aplica antes do fechamento comercial.

### 4.4 Refactor de `processStockDeduction`: baixa por delta e por composicao

Hoje a funcao baixa `item.quantidade` inteiro e deduplica por venda. Com baixa por pedido isso quebra: pedidos diferentes da mesma venda rascunho baixam em momentos diferentes, e o fechamento precisa baixar so o que falta.

1. **Delta por item**: a quantidade a baixar passa a ser `item.quantidade - item.quantidadeEntregue` (nunca negativo). A funcao atualiza `quantidadeEntregue` junto com a baixa, na mesma transacao. A deduplicacao por venda em `processSaleAttendanceStatusChange` pode ser substituida pelo delta — vendas ja entregues tem delta zero — mantendo o comportamento atual para vendas comuns;
2. **Modo de baixa por produto**:
   - `ESTOQUE_PROPRIO`: comportamento atual (FEFO via `consumeStockLotsByFefo` + `applyStockMovement` do restante);
   - `COMPOSICAO`: carrega a ficha tecnica (`productionRecipes` + `productionRecipeInputs` via `fichaTecnicaReceitaId`) e baixa cada insumo em `deltaQuantidade * insumo.quantidade`, com FEFO, mantendo `links: { vendaId, vendaItemId }`. O produto composto em si nao gera movimentacao;
   - produto `COMPOSICAO` sem ficha tecnica ativa: nao baixa nada e nao bloqueia a venda (log/telemetria; consistente com o progressive disclosure do restante do ERP);
3. **Adicionais**: inalterados — ja baixam o produto vinculado a opcao com `quantidadeConsumo`; aplicar o mesmo delta.

### 4.5 `close-tab.ts`

Em transacao (+ pos-commit):

1. tab `ABERTA` com venda rascunho (conta sem consumo: fechar vazia vira cancelamento — decisao de UX recomendada);
2. pedidos ainda ativos (`EM_PREPARO`/`PRONTO`): bloquear com 400 ("Existem pedidos em andamento.") — o operador resolve cada pedido antes de fechar;
3. baixa fisica do delta remanescente de todos os itens via `processStockDeduction` — idempotente pelo delta;
4. confirma a venda rascunho via `processSaleConfirmationInTransaction` com `initialAttendanceStatus: "ENTREGUE"`, `salePayments` = metodos reais (1..N pagamentos; divisao entre pessoas = multiplas transacoes, ja suportado), `sessaoVendaId` = turno de caixa aberto do operador (mesma resolucao do POS). A baixa embutida da confirmacao vira no-op pelo delta;
5. atualiza a tab: `status = "FECHADA"`, `valorTotal` congelado, `fechadaPorUsuarioId`, `dataFechamento` — via update condicional `WHERE status = 'ABERTA'`; zero linhas = conflito (outro fechamento/cancelamento concorrente), aborta a transacao;
6. pos-commit: `processSaleConfirmationPostCommit` (emissao fiscal automatica conforme configuracao). Cashback segue o fluxo existente de venda nascida `ENTREGUE`.

### 4.6 Pre-requisito: guarda compare-and-set em `processSaleConfirmationInTransaction`

`process-sale-confirmation.ts` hoje le a venda, checa `statusVenda !== "ORCAMENTO"` e faz update incondicional. Duas confirmacoes concorrentes podem ambas passar pela checagem e duplicar lancamento contabil e pagamentos (a dedup interna cobre cashback e cupom, mas nao `createAccountingEntry` nem `processPayments`). Corrigir **antes** de `close-tab`, beneficiando tambem o POS atual:

```sql
UPDATE sales
SET status_venda = 'CONFIRMADA', ...
WHERE id = :saleId AND status_venda = 'ORCAMENTO'
RETURNING id;
```

Zero linhas = conflito ou estado invalido → erro, transacao aborta antes de qualquer efeito financeiro. O update condicional passa a ser o primeiro efeito da confirmacao, funcionando como lock logico da venda pelo resto da transacao.

### 4.7 `cancel-tab-order.ts` / `cancel-tab.ts`

- **pedido nao entregue**: `tabOrder.status -> CANCELADO`; itens marcam `quantidadeCancelada = quantidade` e saem do recalculo de totais (marcar, nao deletar — preserva historico);
- **pedido ja entregue**: cancelamento vira estorno explicito — gerar movimentacao de `ENTRADA` (devolucao) ou registrar perda como ajuste, conforme escolha do operador. v1 aceita apenas "devolucao ao estoque"; perda fica para ajuste manual;
- **conta**: cancela pedidos ativos, venda rascunho -> `CANCELADA`, tab -> `CANCELADA` (update condicional `WHERE status = 'ABERTA'`, mesma guarda do fechamento). Se houve itens entregues, exigir confirmacao explicita do operador.

### 4.8 `transfer-tab.ts`

Transferir tab entre pontos preserva pedidos, venda, itens e cliente. Operacao explicita e auditada (registrar ponto anterior/novo e ator em `metadados` ou colunas). Valida `serviceSettings` e o limite de contas abertas no destino sob o mesmo advisory lock de abertura. Mesclar tabs fica fora de escopo.

## 5. Producao: itens que exigem preparo (pratos)

O codebase ja tem modulo de producao completo: `productionRecipes`, `productions` com `origem: MANUAL | PEDIDO | AGENDADA`, e links `vendaId`/`vendaItemId`. Tres mecanismos, cada um com seu caso:

| Mecanismo                                  | Caso                                   | Estado                               |
| ------------------------------------------ | -------------------------------------- | ------------------------------------ |
| Baixa por composicao (ficha tecnica)       | Prato/drink feito na hora, alto volume | **Novo — e a resposta para o prato** |
| Producao em lote (`MANUAL`/`AGENDADA`)     | Pre-preparo: molhos, porcoes, massas   | Ja existe                            |
| Producao sob demanda (`origem = "PEDIDO"`) | Encomenda com lead time (bolo, evento) | Enum previsto, fiacao futura         |

### 5.1 Prato a la minute: composicao, nao ordem de producao

**Nao** criar uma `production` por prato vendido — dezenas/centenas de ordens por noite sem valor operacional: o ticket da cozinha ja existe (`tabOrder`), e a verdade de estoque e capturada pela explosao da ficha tecnica na baixa (4.4). O prato e um produto com `baixaEstoqueModo = "COMPOSICAO"` + `fichaTecnicaReceitaId`. Na entrega, os **insumos** baixam por FEFO — inclusive consumindo lotes com validade produzidos no pre-preparo. O prato em si nunca tem saldo.

### 5.2 Pre-preparo: o modulo existente resolve

De manha produz-se em lote (molho, feijoada) via `productions` `MANUAL`/`AGENDADA`: consome insumos crus e da entrada nos intermediarios como lotes com validade (`productionOutputs.dataValidade` + FEFO ja implementado). A ficha tecnica do prato referencia o **intermediario** ("300g de molho da casa"), nao os ingredientes crus. Os dois niveis se compoem sem tabela nova.

### 5.3 Producao sob demanda: reservar para encomendas

Item com lead time real (bolo sob encomenda): uma `production` por item de venda com `origem = "PEDIDO"` faz sentido, mas a fiacao fica **fora do escopo** desta implementacao (ver `future-improvements.md`).

## 6. APIs (App Router)

Padrao quatro partes (schema de input, service, handler, `appApiHandler`), mensagens em portugues, resposta `{ data, message }`:

| Rota                                  | Metodos                                                                                                                                            | Observacoes                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `app/api/service-points/route.ts`     | GET (multi-mode `byId`/`default`), POST, PUT                                                                                                       | CRUD de pontos; DELETE logico via `ativo`                                                                                     |
| `app/api/tabs/route.ts`               | GET (multi-mode: `byId` com pedidos+itens+totais derivados; `default` = board com filtros `status`, `servicePointId`), POST (abrir/resolver conta) | `TGetTabsInput`, `TCreateTabInput`...                                                                                         |
| `app/api/tabs/orders/route.ts`        | POST (lancar pedido: id gerado no client, itens, observacoes)                                                                                      | payload aninhado, padrao existente                                                                                            |
| `app/api/tabs/orders/status/route.ts` | POST (transicao de status do pedido)                                                                                                               | espelha `app/api/pos/sales/attendance-status`                                                                                 |
| `app/api/tabs/close/route.ts`         | POST (fechar conta: `salePayments`, `sessaoVendaId` resolvido como no POS)                                                                         |                                                                                                                               |
| `app/api/tabs/cancel/route.ts`        | POST (cancelar conta ou pedido, com flag de tratamento de estoque p/ entregues)                                                                    |                                                                                                                               |
| `app/api/sales/preparation/route.ts`  | GET (novo)                                                                                                                                         | tickets de preparo unificados: vendas confirmadas com preparo + `tabOrders` ativos (`map-tab-order-to-preparation-ticket.ts`) |
| `app/api/sales/fulfillment/route.ts`  | GET (existente)                                                                                                                                    | **intocado** — permanece no grao da venda, para o caixa                                                                       |

A rota comum de confirmacao de POS (`app/api/pos/sales/confirm`) **rejeita** venda com `tabId` — o fechamento da tab e a unica interface autorizada a confirma-la.

### Preparo: um grao de ticket, duas telas por persona

O board de **Preparo** (o "KDS" no jargao de food-service — nome de codigo `preparation`, neutro por segmento e derivado do trecho do eixo de status que ele governa) e uma **view**, nao uma entidade. A separacao e por segmento do eixo de status, nao por origem do ticket:

- **Preparo** (aba nova em `sales-page.tsx`, ao lado de Historico/Atendimento/Aprovacoes): dono do trecho `EM_PREPARO -> PRONTO`. Une as duas fontes com o mesmo enum e as mesmas transicoes:
  - vendas confirmadas com preparo (delivery, retirada, integracoes) — 1 venda = 1 ticket, nascendo `EM_PREPARO` via `resolveInitialAttendanceStatus`. Delivery nao passa por tab/ponto/tabOrder;
  - `tabOrders` ativos de contas abertas — o unico caso em que o grao diverge (1 venda rascunho : N rodadas).

  Card centrado no item (itens, modificadores, observacoes, tempo decorrido), origem como badge ("Mesa 12", "iFood", "Retirada"). **Zero pagamento, zero fiscal** — quem prepara sinaliza `PRONTO` e para ai;

- **Atendimento** (fulfillment board existente): permanece intocado, no grao da venda, para o caixa — despacho (`PRONTO -> ENTREGUE`), gate de pagamento e fiscal. `tabOrders` **nao aparecem** aqui: injetar rodadas sem significado financeiro/fiscal poluiria uma superficie comercial. A entrega da rodada e marcada pelo garcom (board de tabs/celular) e o fechamento comercial acontece no board de tabs. O gate de pagamento de `processSaleAttendanceStatusChange` segue intacto — ele guarda o `ENTREGUE`, que o Preparo nunca dispara.

Implementacao: `app/api/sales/preparation/route.ts` compoe as duas queries e mapeia para um `TPreparationTicket` homogeneo com discriminador `origem`, reusando os mappers/enum do fulfillment; a mutation de transicao escolhe o endpoint pelo `origem` do ticket (venda -> `attendance-status` existente; tabOrder -> service de tabs). Componente autocontido em `_components/preparation/` — o destino natural e uma rota fullscreen dedicada (tablet/TV da cozinha, auto-refresh, permissao propria), entao nada do board acopla na pagina; sincronizar a aba ativa via query param. Gate por acesso ao ERP apenas (delivery/retirada se beneficiam do Preparo mesmo sem comandas).

**Nao** criar `tabOrder` por venda de delivery para unificar a fonte: duplicaria estado com onus de sincronizacao e ganho zero. UI e material comercial podem usar "KDS" como apelido; um rotulo configuravel por segmento entra junto com "Comanda"/"Conta"/"Ficha" (ver `future-improvements.md`).

## 7. Client (queries, mutations, state, UI)

- `lib/queries/tabs.ts` — `useTabs` (board, com `params`/`debouncedParams`), `useTabById`, `useServicePoints`;
- `lib/mutations/tabs.ts` — `createTab`, `createTabOrder`, `updateTabOrderStatus`, `closeTab`, `cancelTab`, wrappers Axios finos tipados pelos outputs das rotas;
- `state-hooks/use-internal-service-point-state.tsx` e `use-internal-tab-state.tsx` — padrao existente;
- Modais em `components/Modals/Internal/Tabs/` e `.../ServicePoints/` — `NewServicePoint`/`ControlServicePoint`, `NewTab` (campos variam conforme as politicas);
- Board operacional em `app/dashboard/commercial/tabs/` — dois eixos: contas abertas (cards com ponto, codigo, total parcial derivado, idade) e ocupacao de pontos (pontos ativos LEFT JOIN contas abertas → livre/ocupado, o "mapa de mesas" sem tabela de mesa). Acoes: abrir conta, lancar pedido, fechar (checkout com pagamentos), cancelar;
- Board de Preparo: aba "Preparo" em `sales-page.tsx`, componente autocontido em `_components/preparation/`; tickets das duas fontes com quick actions de transicao (`EM_PREPARO -> PRONTO`), etiquetados com `tab.codigo` + ponto ou modalidade. Fulfillment board (Atendimento) permanece intocado;
- Tela autenticada responsiva para garcom: resolve ponto/tab e usa o cardapio compartilhado com adapter direto para `launchTabOrder`;
- Tela publica: reutiliza a composicao visual do cardapio, mas possui estado e adapter de submissao proprios; nao usa o POST atual de shop.

## 8. QR Codes, shop e privacidade

Dois callers alem do operador de POS, ambos precisando de experiencia de cardapio:

1. **operador autenticado no celular**: escolhe ponto/tab, monta itens e chama `launchTabOrder` diretamente;
2. **cliente via QR**: monta itens em contexto publico e cria `tabOrderRequest`, aprovada conforme `serviceSettings.pedidosCliente`.

**Nao reutilizar o checkout de `app/shop/[orgId]`** como fluxo de salao: ele exige telefone, retirada/entrega, intencao de pagamento e horario da loja, e o POST cria e confirma uma venda propria — quebraria a decisao de uma venda rascunho por tab. O reaproveitamento correto e num seam anterior ao checkout:

```txt
catalogo + product builder + carrinho + validacao autoritativa de precos
  -> adapter SHOP: cria e confirma uma venda avulsa
  -> adapter OPERADOR: cria tabOrder diretamente
  -> adapter CLIENTE_QR: cria tabOrderRequest para aprovacao
```

Aprofundar `lib/sales/sale-pricing-validation.ts` como interface compartilhada (produto, variante, modificadores, precos); o calculo local da rota de shop converge gradualmente para ela.

Aprovacao de `tabOrderRequest` executa atomicamente a mesma validacao de precos e o mesmo `launchTabOrder` do operador (reusando o id/idempotencia derivados da solicitacao). No preset "Somente mesas", a aprovacao pode abrir a tab implicita; em "Mesas + comandas", o QR do ponto nao escolhe silenciosamente entre varias tabs — o cliente apresenta sua comanda ou a solicitacao fica para o operador resolver. Se o codigo informado corresponder a uma tab aberta no mesmo ponto, ela e pre-selecionada. Se ainda nao existir, o operador recebe a acao explicita **"Abrir comanda X e aprovar"**; a criacao nunca e silenciosa. Codigo aberto em outro ponto e limite de contas do ponto bloqueiam a criacao com mensagem explicativa.

O contrato de decisao usa nomes estruturais em ingles. Campos de operacao nunca sao traduzidos apenas porque carregam dados de uma entidade:

```ts
type ApprovalDestination = { type: "EXISTING"; tabId: string } | { type: "NEW"; code: string };

type DecideTabOrderRequestInput =
	| { requestId: string; action: "APPROVE"; destination?: ApprovalDestination | null }
	| { requestId: string; action: "REJECT"; rejectionReason?: string | null };
```

O POST publico tambem usa um envelope estrutural em ingles: `{ token, context, idempotencyKey, deviceKey, notes, tabCode, items }`. Os itens aninhados sao dados e conservam os campos do dominio (`produtoId`, `produtoVarianteId`, `nome`, `quantidade`). Antes de persistir, o service faz o mapeamento explicito para `payloadSolicitacao`: `context -> contexto`, `notes -> observacoes`, `tabCode -> codigoTab` e `items -> itens`. Portanto, `type`, `code`, `tabCode`, `tabId`, `action`, `rejectionReason`, `context`, `notes` e `items` sao contrato de codigo em ingles; `payloadSolicitacao.codigoTab`, `payloadSolicitacao.contexto`, `payloadSolicitacao.observacoes`, `payloadSolicitacao.itens`, `tabs.codigo` e demais campos persistidos continuam em portugues.

Contextos dos QRs:

- **QR do ponto** (duravel, impresso na mesa): identifica o `servicePoint`; abre cardapio e permite solicitar abertura/pedido conforme configuracao; **nao exibe automaticamente itens ou total de tabs abertas** — foto antiga do QR nao da acesso ao consumo atual;
- **QR da tab** (efemero, papel/pulseira/cartao): identifica uma conta especifica, pode mostrar extrato e iniciar solicitacao de rodada; revogavel/rotacionavel ao fechar ou reabrir.

Persistir hashes dos tokens (pratica de `shopOrderRequests`); token bruto so na criacao/regeneracao. Rate limit nas rotas publicas e operacao explicita de regeneracao do QR do ponto.

### Continuidade digital do cliente (`deviceKey`) — fase 4

O QR do ponto identifica a mesa, nao a pessoa — e o QR da tab e um artefato fisico que muitas operacoes nao imprimem por sessao. Sem uma ponte, o cliente que pediu pelo QR da mesa fica orfao: nao ve o status da solicitacao nem o extrato da propria conta. A ponte **nao** reutiliza o token da tab (hash-only — exigiria rotacao com entrega one-shot e gating por origem); usa uma credencial que o proprio dispositivo cria:

- o client gera um `deviceKey` (UUID em localStorage, mesma mecanica do `idempotencyKey`) e o envia em toda solicitacao publica; persistimos apenas o hash em `tabOrderRequests`;
- **autorizacao derivada, nunca emitida**: com token do ponto + `deviceKey`, um GET publico (rate-limited) retorna as solicitacoes do dispositivo com status; quando alguma foi aprovada numa tab, retorna tambem o extrato daquela tab enquanto `ABERTA`. Fechou a conta, o acesso morre sozinho — sem rotacao nem revogacao explicita;
- **varias comandas na mesma mesa**: a solicitacao via QR do ponto ganha campo opcional "numero da sua comanda" — prova de posse do cartao fisico, digitada pelo cliente; nada e listado publicamente (listar as tabs abertas do ponto vazaria o consumo da mesa). A aprovacao pre-seleciona a tab de mesmo `codigo` do ponto ou oferece a abertura explicita quando ela ainda nao existe; o operador, que enxerga a mesa, continua sendo a verificacao de identidade. Apos a primeira aprovacao, o vinculo dispositivo→tab dispensa a pergunta nos pedidos seguintes;
- a pagina publica do ponto torna-se stateful (secao "Sua conta" com status da solicitacao e extrato); a pagina da tab permanece para o QR fisico, compartilhando os mesmos componentes.

Paginas: `app/(external)/service-point/[token]/` e `app/(external)/tab/[token]/`.

## 9. Invariantes e casos de borda

1. Uma unica venda `ORCAMENTO` por tab (partial unique). Fechamento parcial futuro cria nova venda na mesma tab — 1:N ja permite;
2. `quantidadeEntregue` e a fonte da deduplicacao de baixa. Toda baixa fisica atualiza o campo na mesma transacao; todo calculo usa delta. Fechamento e re-tentativas sao idempotentes;
3. Pedido so em conta `ABERTA`; fechamento so sem pedidos ativos; a transicao de status da tab (fechar/cancelar) e um update condicional `WHERE status = 'ABERTA'` executado **antes** de qualquer efeito financeiro;
4. Confirmacao de venda usa compare-and-set (`WHERE status_venda = 'ORCAMENTO' RETURNING`) — zero linhas aborta (4.6);
5. Abertura de tab por ponto usa advisory lock `(organizacaoId, servicePointId)` + reconsulta para aplicar `maxAbertasPorPonto` (4.1); comanda fisica e defendida pelo partial unique de `codigo`;
6. `tabOrders.numero` tem unique `(tabId, numero)` e alocacao sob lock da tab; o id do `tabOrder` e gerado no client para dedupe de retry (4.2);
7. Rodadas nao passam por `processSaleAttendanceStatusChange` — usam o service proprio (4.3);
8. Fiscal e cashback disparam exatamente uma vez, no fechamento;
9. Conta atravessando turnos de caixa: valido — transacoes financeiras nascem efetivadas no fechamento, vinculadas a sessao de quem fecha;
10. Org sem `rastreamentoEstoque` (ou produto sem `rastreamentoEstoqueAtivo`): nenhuma baixa, fluxo identico no resto;
11. Telas de orcamento existentes: filtrar `tabId IS NULL` (a conta aberta tem board proprio);
12. Venda rascunho de tab nao e confirmada pelo fluxo comum de POS — `confirm` rejeita venda com `tabId`;
13. Nenhum I/O externo dentro de transacao — fiscal/efeitos externos sao pos-commit (fiscal ja tem fila propria com retry em `fiscalOutboundDocuments`).

## 10. Fases de entrega

**Fase 0 — hardening previo:**
guarda compare-and-set em `processSaleConfirmationInTransaction` (4.6) — corrige race existente no POS e e pre-requisito do fechamento.

**Fase 1 — fundacao (salao operavel pelo operador):**
`serviceSettings` + presets; enums + schema + migracao; services `open-tab` (com advisory lock), `transfer-tab`, `launch-tab-order` (com id client-side), `process-tab-order-status-change`, `close-tab`, `cancel-*`; refactor de `processStockDeduction` para delta por item; aprofundamento da validacao de precos; APIs; board e fluxo responsivo de lancamento pelo operador; board de Preparo (aba nova + `app/api/sales/preparation`) unificando `tabOrders` e vendas com preparo.

**Fase 2 — composicao (pratos):**
`baixaEstoqueModo` + `fichaTecnicaReceitaId` em produtos; explosao de ficha tecnica na baixa; UI de ficha tecnica no produto; custo derivado como evolucao.

**Fase 3 — pedido via QR com aprovacao:**
`tabOrderRequests`; paginas publicas de ponto e tab; cardapio reutilizado com adapter proprio; aprovacao no board do operador; tokens com hash, rotacao e rate limit; geracao/impressao dos QRs.

**Fase 4 — continuidade digital do cliente (`deviceKey`, secao 8):**
coluna `deviceKeyHash` em `tabOrderRequests` + campo opcional "numero da comanda" na solicitacao; GET publico de sessao do dispositivo (status das solicitacoes + extrato da tab vinculada, rate-limited); pre-selecao da tab na aprovacao; secao "Sua conta" na pagina publica do ponto.

Evolucoes posteriores: ver `future-improvements.md`.
