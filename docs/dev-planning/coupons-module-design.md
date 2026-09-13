# Módulo de Cupons — design e modelagem

Data: 2026-07-02
Branch: `claude/coupon-module-design-yfzo8o` (design + implementação)
Status: **Fases 1 e 2 implementadas + cupons na loja digital** (schema, motor, CRUD admin, resgate com UI no POS, ponto de interação e loja digital, frontend admin, distribuição por campanha com variáveis de template — ver §6)

## O problema em uma frase

Um mesmo cupom precisa servir a dois consumidores com capacidades muito diferentes: o **ERP interno** (que conhece o carrinho item a item e pode validar/aplicar regras automaticamente) e o **ponto de interação do CRM** (que muitas vezes só conhece o cliente e um valor de venda informado, e depende do operador para validar condições).

## Decisões de escopo

| Dimensão | Decisão | Implicação |
|---|---|---|
| Definição vs. posse vs. uso | **3 camadas: `coupons` (definição) → `coupon_grants` (atribuição individual) → `coupon_redemptions` (ledger de uso)** | Cupom global não gera linhas de atribuição; cupom individual gera uma linha por cliente. Todo uso vira uma linha imutável no ledger. |
| Modelo de regras | **Colunas tipadas + tabelas-filhas de alvos de produto e de audiência** (estilo `campaigns`: colunas anuláveis por tipo), não árvore de regras em JSONB | Cobre os casos reais (base, grupo, produto, combinação, leve-X-pague-Y, tag de cliente, segmento RFM) sem motor genérico. JSONB só em `metadados` de snapshot. |
| Audiência de cupom global | **`coupon_audiences`: restrição por tag (`clientTags`) ou segmento RFM**, avaliada em query — sem materializar grants | Caso "desconto para policiais": cupom `GLOBAL` + audiência `{ clienteTagId: <POLICIAL> }` fica autoaplicável a qualquer cliente com a tag, inclusive quem receber a tag depois. |
| Empilhamento | **Fase 1: 1 cupom por venda** (validação no serviço, não no schema) | O ledger já suporta N resgates por venda; liberar empilhamento depois é remover a trava + definir ordem de aplicação, sem migração. |
| BRINDE | **Fora da fase 1** | `COMPRE_X_LEVE_Y` cobre item grátis do próprio carrinho; brinde como item injetado fica para fase posterior. |
| Snapshot de uso | **`beneficioSnapshot` (JSONB) é suficiente** | Sem tabela-filha de itens do resgate; auditoria via snapshot + `valorDesconto`. |
| Dois modos de validação | **`validacaoModo: AUTOMATICA \| MANUAL`** no cupom | `AUTOMATICA`: motor avalia o carrinho no POS/ERP. `MANUAL`: `condicoesTexto` é exibido a cliente e operador no ponto de interação; o operador valida as regras manuais. Modalidade e primeira compra continuam sendo condições estruturadas autoritativas nos dois modos. |
| Integração com venda | Desconto do cupom entra em `sales.descontosTotal` / `saleItems.valorTotalDesconto` (mesmo caminho do cashback) | Nenhuma mudança no cálculo de totais; o cupom é mais uma fonte de desconto, rastreada pelo ledger. |

---

## 1. O que já existe e é reaproveitado

- **`cashbackPrograms` / `cashbackProgramTransactions`** — é o "irmão mais velho" do módulo: definição por organização + ledger de transações com snapshot (`saldoValorAnterior/Posterior`, `operadorId`, `operadorVendedorId`, `metadados`). O ledger de cupons segue o mesmo desenho.
- **`campaigns`** — padrão de modelagem por colunas anuláveis prefixadas por contexto (`gatilho*`, `cashbackGeracao*`). Os cupons seguem o mesmo gosto (`beneficio*`, `condicao*`, `vigencia*`, `limite*`). Campanhas já geram cashback como efeito colateral; gerar **atribuição de cupom individual** é a extensão natural (`cupomGeracao*`).
- **`poiTransactionRequests`** — fluxo de aprovação do ponto de interação (token público, payload, aprovação por operador). O resgate manual de cupom entra aqui como novo campo de vínculo, exatamente como `transacaoResgateId` faz para cashback.
- **POS interno (`/api/pos/sales`)** — já recebe `valorDesconto` por item e `descontosTotal` na venda. A aplicação automática do cupom só precisa preencher esses campos e registrar o uso no ledger, na mesma transação.
- **`products.grupo`** — campo texto indexado; é a chave para "desconto por grupo de produtos" sem criar taxonomia nova.
- **`clientTags` / `clientTagReferences`** — tags já são entidades por organização com junção cliente↔tag (única por par). A audiência de cupom referencia a tag por FK.
- **`clients.analiseRFMTitulo`** — o segmento RFM do cliente é um título texto indexado (`idx_clients_rfm_titulo`), mesmo formato que `campaignSegmentations.segmentacao` já consome. A audiência de cupom armazena o título do segmento como texto.

## 2. Modelagem proposta

Arquivo novo: `services/drizzle/schema/coupons.ts` (+ enums em `schema/enums.ts`).

### 2.1 `coupons` — a definição (o "molde" da promoção)

```ts
export const coupons = newTable("coupons", {
	id, organizacaoId, ativo,

	// Identidade e comunicação
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),               // texto de marketing (cliente final)
	imagemCapaUrl: text("imagem_capa_url"),
	codigo: text("codigo").notNull(),           // código público (ex: "PROMO10"); unique por organização

	// Escopo de audiência
	escopo: couponScopeEnum("escopo").notNull().default("GLOBAL"), // GLOBAL | INDIVIDUAL

	// Modo de validação no resgate
	validacaoModo: couponValidationModeEnum("validacao_modo").notNull().default("AUTOMATICA"), // AUTOMATICA | MANUAL
	condicoesTexto: text("condicoes_texto"),    // regras em linguagem natural — obrigatório quando MANUAL

	// Benefício
	beneficioTipo: couponBenefitTypeEnum("beneficio_tipo").notNull(),
	// DESCONTO_FIXO | DESCONTO_PERCENTUAL | PRECO_FIXO | COMPRE_X_LEVE_Y | BRINDE
	beneficioValor: doublePrecision("beneficio_valor"),            // R$ fixo, % ou preço-alvo
	beneficioDescontoMaximo: doublePrecision("beneficio_desconto_maximo"), // teto em R$ p/ percentual
	beneficioAplicacao: couponBenefitScopeEnum("beneficio_aplicacao").notNull().default("VENDA_TOTAL"),
	// VENDA_TOTAL | ITENS_ELEGIVEIS
	beneficioCompreQuantidade: integer("beneficio_compre_quantidade"), // COMPRE_X_LEVE_Y: X
	beneficioLeveQuantidade: integer("beneficio_leve_quantidade"),     // COMPRE_X_LEVE_Y: Y (Y - X sai grátis)

	// Condições estruturadas (modalidade e primeira compra também valem em MANUAL)
	condicaoValorMinimoVenda: doublePrecision("condicao_valor_minimo_venda"),
	condicaoQuantidadeMinimaItens: integer("condicao_quantidade_minima_itens"),
	condicaoAlvosOperador: couponTargetOperatorEnum("condicao_alvos_operador").default("QUALQUER"),
	// QUALQUER (OR: qualquer alvo presente) | TODOS (AND: combinação — todos os alvos presentes)

	// Vigência
	vigenciaInicio: timestamp("vigencia_inicio"),
	vigenciaFim: timestamp("vigencia_fim"),     // null = não expira

	// Limites de uso
	limiteResgatesTotal: integer("limite_resgates_total"),          // null = ilimitado
	limiteResgatesPorCliente: integer("limite_resgates_por_cliente").default(1),
	acumulavel: boolean("acumulavel").notNull().default(false),     // combina com outros cupons/cashback?

	// Superfícies de resgate (padrão cashbackPrograms.acumuloPermitirVia*)
	resgatePermitirViaPos: boolean("resgate_permitir_via_pos").notNull().default(true),
	resgatePermitirViaPontoInteracao: boolean("resgate_permitir_via_ponto_interacao").notNull().default(true),

	autorId, dataInsercao, dataAtualizacao,
});
// uniqueIndex (organizacaoId, codigo)
```

Como cada necessidade do ERP mapeia:

| Promoção | Configuração |
|---|---|
| Desconto base (venda toda) | `beneficioTipo: DESCONTO_PERCENTUAL/FIXO`, `beneficioAplicacao: VENDA_TOTAL`, sem alvos |
| Desconto por grupo | alvo `{ grupo: "calças" }`, `beneficioAplicacao: ITENS_ELEGIVEIS` |
| Desconto por produto/variante | alvo `{ produtoId }` ou `{ produtoVarianteId }` |
| Combinação de produtos | 2+ alvos `ELEGIVEL`, `condicaoAlvosOperador: TODOS` |
| Leve 2 pague 1 | `beneficioTipo: COMPRE_X_LEVE_Y`, `compreQuantidade: 1`, `leveQuantidade: 2`, alvo no produto/grupo |
| Compre X, ganhe desconto em Y | alvos `ELEGIVEL` (X) + alvos `BENEFICIADO` (Y), `beneficioAplicacao: ITENS_ELEGIVEIS` |
| Desconto para uma tag (ex: policiais) | `escopo: GLOBAL` + audiência `{ clienteTagId: <tag POLICIAL> }` — autoaplicável a quem tem a tag |
| Desconto para um segmento RFM | `escopo: GLOBAL` + audiência `{ segmentacaoRFM: "Em Risco" }` — acompanha a movimentação do cliente entre segmentos |
| Promoção "impossível de estruturar" | `validacaoModo: MANUAL` + `condicoesTexto` |

### 2.2 `coupon_targets` — escopo de produtos (filha, gerida via `handleSimpleChildRowsProcessing`)

```ts
export const couponTargets = newTable("coupon_targets", {
	id, organizacaoId,
	cupomId: ...references(() => coupons.id, { onDelete: "cascade" }).notNull(),
	papel: couponTargetRoleEnum("papel").notNull().default("ELEGIVEL"), // ELEGIVEL | BENEFICIADO
	// Exatamente um dos três preenchido (validação no Zod):
	produtoId: ...references(() => products.id, { onDelete: "cascade" }),
	produtoVarianteId: ...references(() => productVariants.id, { onDelete: "cascade" }),
	grupo: text("grupo"),                        // casa com products.grupo
	quantidadeMinima: integer("quantidade_minima").default(1), // p/ combinações e X-leve-Y
});
```

- `ELEGIVEL`: define **quando** o cupom vale (o que precisa estar no carrinho).
- `BENEFICIADO`: define **onde** o desconto incide quando `beneficioAplicacao = ITENS_ELEGIVEIS`. Se não houver linhas `BENEFICIADO`, o benefício incide sobre os próprios elegíveis.
- Sem linhas de alvo = cupom vale para qualquer carrinho (desconto base).

### 2.3 `coupon_audiences` — restrição de audiência (filha, gerida via `handleSimpleChildRowsProcessing`)

Restringe **quem** enxerga/resgata um cupom `GLOBAL` sem materializar atribuições por cliente. É condição derivada em query: se o cliente ganha a tag (ou entra no segmento) amanhã, o cupom passa a valer para ele automaticamente; se perde, deixa de valer.

```ts
export const couponAudiences = newTable("coupon_audiences", {
	id, organizacaoId,
	cupomId: ...references(() => coupons.id, { onDelete: "cascade" }).notNull(),
	// Exatamente um dos dois preenchido (validação no Zod):
	clienteTagId: ...references(() => clientTags.id, { onDelete: "cascade" }),
	segmentacaoRFM: text("segmentacao_rfm"),     // casa com clients.analiseRFMTitulo (mesmo formato de campaignSegmentations.segmentacao)
});
// index (cupomId), index (organizacaoId, clienteTagId)
```

- Semântica entre linhas: **OR** — o cliente precisa casar com *qualquer* linha (ter a tag POLICIAL **ou** estar em "Campeões"). É a mesma semântica das segmentações de campanha e evita precisar de operador configurável; um AND real ("policial E campeão") é raro o bastante para, se surgir, virar um `condicaoAudienciaOperador` aditivo no futuro.
- Sem linhas de audiência = cupom global vale para qualquer cliente identificado.
- Caso motivador: organização quer dar desconto a policiais → tag `POLICIAL` em `clientTags`, cupom `GLOBAL` com uma linha de audiência apontando para a tag. No POS, o cliente se identifica e o cupom aparece sozinho; no ponto de interação, idem.
- Vale também para cupons `INDIVIDUAL`? Não — atribuição individual (`coupon_grants`) já é a forma mais restrita de audiência; as duas coisas não se combinam. Validação no serviço: audiência só é aceita quando `escopo = GLOBAL`.

### 2.4 `coupon_grants` — atribuição individual (posse)

Só existe para `escopo: INDIVIDUAL`. Cupom `GLOBAL` não materializa linhas por cliente — a disponibilidade é derivada em query (evita explosão de linhas e sincronização com a base de clientes).

```ts
export const couponGrants = newTable("coupon_grants", {
	id, organizacaoId,
	cupomId: ...references(() => coupons.id, { onDelete: "cascade" }).notNull(),
	clienteId: ...references(() => clients.id, { onDelete: "cascade" }).notNull(),
	codigo: text("codigo"),                      // opcional: código único por atribuição (ex: gerado p/ campanha)
	origem: couponGrantOriginEnum("origem").notNull().default("MANUAL"), // MANUAL | CAMPANHA | SISTEMA
	campanhaId: ...references(() => campaigns.id),      // rastreio quando origem = CAMPANHA
	quantidadeDisponivel: integer("quantidade_disponivel").notNull().default(1),
	expiracaoData: timestamp("expiracao_data"),  // sobrepõe vigenciaFim do cupom (ex: "72h após o disparo")
	dataInsercao, dataAtualizacao,
});
// index (organizacaoId, clienteId), index (cupomId)
```

### 2.5 `coupon_redemptions` — ledger de uso (imutável, padrão `cashbackProgramTransactions`)

```ts
export const couponRedemptions = newTable("coupon_redemptions", {
	id, organizacaoId,
	cupomId: ...references(() => coupons.id).notNull(),
	atribuicaoId: ...references(() => couponGrants.id), // null quando cupom GLOBAL
	clienteId: ...references(() => clients.id, { onDelete: "set null" }),
	status: couponRedemptionStatusEnum("status").notNull().default("UTILIZADO"), // UTILIZADO | CANCELADO

	// Contexto do uso
	vendaId: ...references(() => sales.id),      // null em resgate manual sem venda espelhada
	vendaValor: doublePrecision("venda_valor"),  // valor de venda informado/apurado no momento
	valorDesconto: doublePrecision("valor_desconto").notNull(), // desconto efetivamente concedido

	// Snapshot (a definição do cupom pode mudar depois)
	cupomTitulo: text("cupom_titulo").notNull(),
	cupomCodigo: text("cupom_codigo").notNull(),
	beneficioSnapshot: jsonb("beneficio_snapshot"), // tipo/valor/alvos no momento do uso

	// Accountability (padrão do POI/cashback)
	origemResgate: couponRedemptionSourceEnum("origem_resgate").notNull(), // POS | PONTO_INTERACAO | LOJA_DIGITAL
	operadorId: ...references(() => users.id, { onDelete: "set null" }),
	operadorVendedorId: ...references(() => sellers.id, { onDelete: "set null" }),
	metadados: jsonb("metadados"),
	dataInsercao, dataAtualizacao,
});
```

Limites são **derivados do ledger** (count de `UTILIZADO` por cupom/cliente), não contadores mutáveis — cancelamento de venda vira `status: CANCELADO` e "devolve" o uso naturalmente. Em `coupon_grants`, `quantidadeDisponivel` é decrementada/incrementada na mesma transação do resgate/cancelamento (como o saldo de cashback).

### 2.6 Alterações em tabelas existentes

- **`poiTransactionRequests`**: novo campo `cupomResgateId` referenciando `couponRedemptions` (espelho de `transacaoResgateId`), e o `payloadSolicitacao` passa a aceitar `cupomId`/`atribuicaoId` na intenção de resgate.
- **`campaigns`** (fase 2): bloco `cupomGeracao*` (`cupomGeracaoAtivo`, `cupomGeracaoCupomId`, `cupomGeracaoExpiracaoValor/Medida`) — a campanha atribui um cupom individual ao disparar, como já faz com cashback.
- **`sales`**: nada. O vínculo venda↔cupom vive no ledger (`couponRedemptions.vendaId`), e o valor entra no `descontosTotal` existente.

## 3. Os dois fluxos de resgate

### 3.1 ERP / POS — automático ("o cliente se identifica e o sistema mostra os cupons")

1. `GET /api/pos/coupons/available?clienteId=...` retorna cupons **candidatos**: ativos, dentro da vigência, `resgatePermitirViaPos`, com limites não esgotados, e (`escopo = GLOBAL` **ou** grant vigente do cliente). Para globais com `coupon_audiences`, o cliente precisa casar com alguma linha (join em `clientTagReferences` / comparação com `clients.analiseRFMTitulo`).
2. Com o carrinho montado, o motor de elegibilidade (`lib/coupons/engine.ts`, função pura `evaluateCoupon({ coupon, targets, cartItems })`) filtra por `condicao*` + alvos e **computa o desconto** (incluindo COMPRE_X_LEVE_Y: ordena unidades elegíveis por preço e zera as Y−X mais baratas — regra determinística, sem decisão do operador).
3. Ao concluir a venda (`POST /api/pos/sales`), na mesma transação: revalida o cupom (incluindo audiência e a trava de **1 cupom por venda** da fase 1), grava `couponRedemptions`, decrementa `quantidadeDisponivel` do grant e injeta o desconto em `descontosTotal` / `valorTotalDesconto` dos itens beneficiados.
4. Cupons `validacaoModo: MANUAL` também aparecem no POS, mas exibem `condicoesTexto` e pedem que o operador informe o valor do desconto (mesma UX do ponto de interação).

### 3.2 CRM / Ponto de interação — assistido pelo operador

1. Cliente se identifica pelo telefone; a interface lista os cupons disponíveis (mesma query de candidatos — incluindo filtro de audiência por tag/RFM —, filtrando `resgatePermitirViaPontoInteracao`).
2. Para `AUTOMATICA` com `beneficioAplicacao: VENDA_TOTAL`: o valor da venda informado basta para calcular o desconto — sem intervenção.
3. Para `MANUAL`: a tela mostra `condicoesTexto` ao cliente e ao operador ("desconto em calças — confira se há calça na compra"); o operador valida, informa/confirma o valor e aprova com PIN, exatamente como no resgate de cashback.
4. A aprovação do `poiTransactionRequest` cria o `couponRedemption` (com `operadorId`/`operadorVendedorId`) e vincula via `cupomResgateId`.

## 4. Por que não um motor de regras genérico (JSONB)

- O padrão da casa é **colunas explícitas + tabelas-filhas** (`campaigns`, `productAddOns`, `cashbackPrograms`) — queries indexáveis, migrações rastreáveis, UI de formulário direta (`state-hooks` + `Blocks`).
- Os casos pedidos (base, grupo, produto, combinação, quantidade, tag, segmento RFM) cabem todos em `beneficioTipo` + `couponTargets` + `couponAudiences` + `condicaoAlvosOperador`. O caso que **não** cabe já tem válvula de escape de produto: `validacaoModo: MANUAL` + `condicoesTexto`.
- Se um dia surgir regra composta real (tiers, "3 grupos diferentes", etc.), adiciona-se um novo `beneficioTipo` ou uma coluna `condicao*` — evolução aditiva, sem quebrar o motor.

## 5. Estrutura de arquivos (convenções do CLAUDE.md)

| Camada | Arquivo |
|---|---|
| Schema DB | `services/drizzle/schema/coupons.ts` + enums em `schema/enums.ts` |
| Zod | `schemas/coupons.ts` + enums em `schemas/enums.ts` |
| Motor de elegibilidade | `lib/coupons/engine.ts` (puro, testável, compartilhado por POS/POI/loja) |
| API admin | `app/api/coupons/route.ts` (GET multi-modo `byId`/`default`, POST aninhado cupom+alvos via `handleSimpleChildRowsProcessing`, PUT, DELETE) |
| API POS | `app/api/pos/coupons/available/route.ts` + aplicação dentro de `app/api/pos/sales` |
| API POI | extensão de `app/api/point-of-interaction/*` (listagem + resgate no fluxo de aprovação) |
| Queries/Mutations | `lib/queries/coupons.ts`, `lib/mutations/coupons.ts` |
| State hook | `state-hooks/use-internal-coupon-state.tsx` (alvos com soft-delete `deletar`) |
| Modais | `components/Modals/Coupons/NewCoupon.tsx`, `ControlCoupon.tsx` + `Blocks/` (Geral, Benefício, Condições/Alvos, Vigência & Limites, Resgate) |
| Página | `app/(admin)|dashboard` conforme módulo de cashback existente |

## 6. Fases sugeridas

1. **Fase 1 — núcleo**: schema (5 tabelas + enums), CRUD admin, motor de elegibilidade (incluindo audiência por tag/RFM), resgate no POS (automático) e no ponto de interação (manual + venda-total automático). Restrições da fase: **1 cupom por venda** (trava no serviço) e **sem `beneficioTipo: BRINDE`** (o enum já nasce com o valor, mas a UI/motor não o oferecem).
2. **Fase 2 — distribuição** *(implementada, exceto listagem no perfil do cliente)*: geração de grants por campanha (`cupomGeracao*`), variáveis de template WhatsApp (`{{coupon_code}}`, `{{coupon_title}}`, `{{coupon_expiration_date}}`), listagem de cupons no perfil do cliente (pendente).
3. **Fase 3 — superfícies**: cupons na loja digital (`/api/shop`) *(implementado: flag `resgatePermitirViaLojaDigital`, desconto recomputado no servidor, seleção no checkout, cupons MANUAL exibidos apenas como aviso — resgate no balcão — e rejeitados no pedido, exibição no pedido público e detalhes de resgate na visão da venda)*; pendentes: estatísticas (resgates, desconto concedido, conversão por cupom), empilhamento de cupons (remover a trava de 1 por venda + definir ordem de aplicação) e `beneficioTipo: BRINDE` no POS (injeção de `saleItem` com 100% de desconto, preservando baixa de estoque e relatórios). Cancelamento em cascata com cancelamento de venda já implementado na fase 1.

## 7. Pontos decididos (antes em aberto)

- **Empilhamento**: fase 1 opera com **1 cupom por venda**, imposto como validação de serviço no resgate — o schema não impõe unicidade de `vendaId` no ledger, então liberar múltiplos cupons depois não exige migração; o flag `acumulavel` já existe na definição para governar quais cupons poderão combinar.
- **BRINDE**: fora da fase 1. `COMPRE_X_LEVE_Y` cobre "item grátis do próprio carrinho"; brinde injetado fica para a fase 3.
- **Snapshot**: `beneficioSnapshot` (JSONB) atende a auditoria — sem tabela-filha de itens do resgate.
