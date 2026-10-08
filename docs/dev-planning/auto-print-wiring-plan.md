# Auto-impressão — wiring de vendas e configuração por organização (plano)

Continuação de `desktop-agent-printing-plan.md`, que entregou a fila (`print_jobs`) e o
`enqueuePrintJob()` e deixou explicitamente fora de escopo "wiring automático de vendas,
configuração de auto-impressão por organização". Este plano cobre exatamente isso.

## Escopo

1. **Configuração por organização**: para cada finalidade auto-imprimível, a org decide se a
   impressão é automática e **para quais canais de venda** (POS interno, Shop, comanda, iFood e
   futuras integrações).
2. **Wiring do cupom de venda** (`CUPOM_VENDA`) nos três fluxos de entrada: POS
   (`new-sale-page.tsx` → create-and-confirm), pedido recebido pelo Shop, pedido do iFood.
3. **Aceite automático de pedidos iFood** — pré-requisito do cupom automático nesse canal: o
   cupom sai **no aceite** do pedido, e sem aceite automático o pedido pode ficar parado em
   `PLACED` sem nunca disparar.
4. **Wiring da DANFE** (`DANFE_NFCE`/`DANFE_NFE`) na transição do documento fiscal para
   `AUTORIZADO` — a peça que faltava para a emissão automática existente terminar no papel.

Fora de escopo: `ETIQUETA_LOTE` automática (não tem "fonte de venda"; segue manual) e multi-vias
para impressoras diferentes (cozinha + balcão — ver "Evoluções").

## Decisões de arquitetura

### 1. Duas camadas: roteamento (impressora) ≠ política (organização)

A tentação era enriquecer `agent_printers.finalidades` (hoje `string[]`) com flags de
automático/fonte. **Não fazer isso.** São perguntas diferentes:

- **Roteamento** — "qual impressora atende esta finalidade?" — já resolvido pelo late binding no
  claim. `finalidades: string[]` na impressora continua como está.
- **Política** — "esta finalidade deve gerar job automaticamente, e para quais canais?" — é decisão
  da organização, independente de qual impressora existe. Vive em preferência da org.

Misturar as duas na impressora quebraria quando a org tem duas impressoras para a mesma finalidade
(qual flag vence?) e obrigaria a reconfigurar política ao trocar de impressora.

### 2. Configuração em `configuracao.preferencias.impressoes`

Sem coluna nova e sem DDL: a política entra como chave nova em
`OrganizationConfigurationSchema.preferencias` (`schemas/organizations.ts`), seguindo o padrão dos
blocos vizinhos (`sessoesVenda`, `carteirasClientes`, `integracaoERP`) — objeto aninhado com
`.default({...})` para que linhas antigas parseiem sem migração de dados.

```typescript
// schemas/organizations.ts — dentro de preferencias; campos em português: dado persistido
const AutoPrintRuleSchema = z.object({
	habilitada: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação da impressão automática." }).default(false),
	// Allowlist de canais de política (ver decisão 3). Vazia = nunca imprime.
	canais: z.array(z.string({ invalid_type_error: "Tipo não válido para o canal de impressão automática." })).default([]),
	copias: z.number({ invalid_type_error: "Tipo não válido para o número de cópias." }).int().min(1).max(5).default(1),
});

impressoes: z
	.object({
		automatica: z
			.object({
				CUPOM_VENDA: AutoPrintRuleSchema.default({}),
				DANFE_NFCE: AutoPrintRuleSchema.default({}),
				DANFE_NFE: AutoPrintRuleSchema.default({}),
			})
			.default({}),
	})
	.default({}),
```

Atenção no consumo: `organizations.configuracao` é tipada mas não é re-parseada em cada leitura —
linhas antigas não têm a chave até o próximo save de settings. O orquestrador lê defensivamente
(parse do bloco `impressoes ?? {}` pelo schema, que preenche os defaults), nunca acessa o caminho
cru confiando no tipo.

Por que não um array genérico de "regras"? Três finalidades com a mesma forma de regra não
justificam um motor de regras; o objeto fixo dá exaustividade no TypeScript e UI trivial. Se um dia
a regra ganhar dimensões (turno, valor mínimo), promove-se `AutoPrintRuleSchema` — o jsonb absorve.

### 3. Canais de política: canal interno cru, integração com prefixo `INTEGRACAO-`

A allowlist usa **chaves de política**, derivadas da venda — não um conceito novo persistido:

```
processamentoOrigem === "EXTERNO"  →  `INTEGRACAO-${canal}`   // "INTEGRACAO-IFOOD", futuras: "INTEGRACAO-NUVEM-SHOP", ...
caso contrário                     →  canal                    // "POS", "SHOP", "COMANDA"
```

`sales.canal` continua guardando o valor cru do conector (`"IFOOD"` — dado histórico intocado); o
prefixo existe só na camada de política, para distinguir de relance canal interno de integração
externa na config e na UI, e cada conector futuro ganha sua chave de graça.

Canal ausente da lista (inclusive `canal` nulo e integrações novas) → **não imprime**. Opt-in
explícito é o default seguro: uma integração nova entrando em produção nunca começa a imprimir
sozinha.

### 4. Orquestradores no padrão de `processSaleAutomaticFiscalEmissionIfEligible`

Novo módulo `lib/desktop-agent/auto-print.ts` com duas funções, mesma filosofia da emissão fiscal
automática: **avaliam elegibilidade e nunca lançam** (try/catch integral + `console.error`) — falha
de impressão jamais quebra confirmação de venda ou autorização fiscal. Ambas rodam **pós-commit**.

```typescript
processSaleCupomAutoPrintIfEligible({ organizacaoId, saleId });
// 1. Parseia preferencias.impressoes; CUPOM_VENDA.habilitada? chave de política da venda na allowlist? senão, skip.
// 2. Org tem impressora ativa com a finalidade? (guarda anti-lixo, decisão 5) senão, skip.
// 3. Monta dados do cupom (builder compartilhado, decisão 6) e enfileira:
//    enqueuePrintJob({ finalidade: "CUPOM_VENDA", origemTipo: "VENDA", origemId: saleId,
//                      chaveIdempotencia: `CUPOM_VENDA:${saleId}`, copias: regra.copias, lojaId: null })

processFiscalDocumentAutoPrintIfEligible({ organizacaoId, documentoId });
// Igual, para DANFE_NFCE/DANFE_NFE: finalidade vem de documento.tipo, chave de política vem da
// venda ligada ao documento, chave `DANFE:${documentoId}`, dados = { pdfUrl: <URL assinada, decisão 7> }.
```

A **chave de idempotência é o que permite ligar os hooks com folga**: confirmação de POS, edição
de venda confirmada, re-sync do iFood, aceite manual + automático — todos podem chamar o
orquestrador; o `onConflictDoNothing` da fila garante um cupom só por venda. Reimpressão continua
sendo o fluxo manual existente (sem chave).

`lojaId` é sempre `null`: não existem organizações multi-loja e não há planos de existirem. O
campo em `print_jobs`/`access_principals` é peso morto de modelagem — candidato a remoção em
cleanup próprio (tocaria o claim do agent), fora deste plano.

### 5. Guarda anti-lixo: só enfileira se existe impressora ativa para a finalidade

Sem isso, org que habilitou auto-print e depois desativou a impressora acumula jobs
`EXPIRADO`/`ERRO` no dashboard a cada venda. A guarda consulta `agent_printers` por
`(organizacaoId, ativa = true, finalidade ∈ finalidades)` — **ignorando `disponivel`** de
propósito: agent temporariamente offline deve continuar recebendo jobs (imprime ao voltar, dentro
do TTL de 30min do cupom); `disponivel = false` com `ativa = true` é flutuação de sync, não decisão
do lojista. Helper novo `organizationHasActivePrinterForFinalidade()` em
`lib/desktop-agent/print-jobs.ts` (contraparte server-side do
`organizationHasPrinterForFinalidade` de `lib/queries/desktop-agent.ts`).

### 6. Builder do cupom extraído da rota manual

O `dados` do `CUPOM_VENDA` hoje é montado inline em
`app/api/desktop-agent/print-jobs/management/route.ts` (~linhas 102–144). Extrair para
`lib/desktop-agent/cupom-venda-data.ts` → `buildCupomVendaDados({ organizacaoId, vendaId })`, e a
rota manual passa a consumi-lo. Um builder só = cupom manual e automático sempre idênticos.

### 7. DANFE precisa de URL de PDF acessível pelo agent

`DanfeDadosSchema` exige `pdfUrl` absoluta, mas hoje o PDF só sai pela rota autenticada por sessão
de usuário (`/api/fiscal/document-assets`) — o agent é principal `AGENTE_DESKTOP`, sem sessão.
Solução: helper `createSignedFiscalAssetUrl({ storagePath, expiresInSeconds })` em
`lib/fiscal/storage.ts` usando signed URL do Supabase Storage, com validade ≥ TTL do job de DANFE
(24h) + margem (assinar por 48h). Gerada no enqueue; o agent continua burro. Sem rota nova, sem
scope novo.

## iFood: cupom na confirmação + aceite automático

**O cupom do iFood sai na confirmação do pedido — quando ele vira venda de fato.** Como o ciclo
funciona hoje:

1. Pedido `PLACED` é ingerido como linha de venda com **`statusVenda = null`** (o mapper canônico
   só considera `isValidSale` de `CONFIRMED` em diante — `lib/data-connectors/ifood/mappers.ts`;
   comercial neutro = ainda não é venda) e `statusAtendimento = NAO_INICIADO`. É o que aparece na
   fila de pedidos a confirmar.
2. O aceite no iFood **é** a confirmação: o evento `CONFIRMED` vira `isValidSale = true` →
   `statusVenda: null → CONFIRMADA`. No sync essa transição é o **`becameValid`**
   (`lib/data-collecting-v2/sync-sales.ts:363`) — o sinal exactly-once que já dispara todos os
   efeitos de "nova compra" (cashback, atribuição, campanhas, métricas). No aceite pela
   plataforma, a rota `order-confirmation` faz a promoção local imediata (`null → CONFIRMADA` +
   `EM_PREPARO`) por UX.

A condição de disparo do cupom é portanto o **eixo comercial** — a transição
`statusVenda: null → CONFIRMADA` — e não o eixo de atendimento. No sync, é exatamente
`becameValid && !nowCanceled`; nos caminhos de aceite, é o momento da promoção local.

Sem aceite, nada imprime e o pedido expira no iFood — daí o **aceite automático**, que hoje não
existe em lugar nenhum:

- **Config**: flag nova `aceiteAutomaticoPedidos` (boolean, `.optional().default(false)` — linhas
  existentes parseiam) em `IfoodIntegrationConfigSchema` (`schemas/integrations.ts`), ou seja,
  **por conexão iFood**, não por organização — uma org pode ter mais de uma conexão
  (`pickIfoodIntegration` já trata isso) e a política pode diferir entre elas. Escrita da flag via
  patch cirúrgico `jsonb_set` (mesmo padrão do `merchantIds` em
  `lib/integrations/ifood/context.ts:97`) para nunca colidir com refresh de token concorrente.
- **Execução**: pós-commit do `runDataCollectingV2` (`lib/data-collecting-v2/index.ts`), para
  vendas iFood persistidas com `statusVenda` nulo cujo pedido está `PLACED` e cuja integração tem
  a flag: chama `confirmIfoodOrder` (`lib/integrations/ifood/orders.ts`) e **enfileira o cupom
  diretamente** (idempotente) — **sem replicar a promoção local da rota**. A consolidação de
  status fica com a ingestão: o próximo sync vê `CONFIRMED` → `becameValid = true` → efeitos de
  nova compra disparam pelo caminho canônico. Falha de aceite não derruba o sync (try/catch por
  pedido + log); o próximo polling reencontra o `PLACED` e tenta de novo.
- Aceite feito **direto no dispositivo do iFood** também dispara: o próximo sync vê a transição →
  `becameValid` → cupom. A chave de idempotência absorve sobreposição entre os três caminhos
  (aceite automático, aceite na plataforma, aceite no dispositivo).

> **Resolvido após este plano**: o aceite manual agora executa a transição local e os efeitos de
> nova compra na mesma transação, antes de o sync reconciliar o evento `CONFIRMED`. Enquanto não
> houver um ledger próprio de efeitos, `statusVenda = CONFIRMADA` é o marcador temporário de
> idempotência; um comentário junto à transição documenta a evolução futura. O aceite automático
> continua sem promoção local e permanece no caminho canônico do `becameValid`.

## Pontos de wiring

### `CUPOM_VENDA`

| Fluxo                                                                          | Hook                                                                                               | Observação                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POS (create-and-confirm), POS confirm, fechamento de comanda, checkout do Shop | `processSaleConfirmationPostCommit` (`lib/sales/sale-processing/process-sale-confirmation.ts:431`) | Um único ponto cobre os quatro caminhos internos — mesmo lugar onde a emissão fiscal automática já é disparada. Chamar o orquestrador **antes** da emissão fiscal (cupom é latência-sensível; TTL 30min).     |
| iFood — aceite automático                                                      | Pós-commit do `runDataCollectingV2`, após o `confirmIfoodOrder`                                    | Enfileira direto, sem promoção local — ver seção iFood.                                                                                                                                                       |
| iFood — aceite na plataforma                                                   | `app/api/sales/fulfillment/order-confirmation/route.ts`, após a transação local de confirmação     | Os efeitos de nova compra e o cupom saem no aceite, sem esperar o sync.                                                                                                                                       |
| iFood — aceite no dispositivo iFood / consolidação                             | Pós-commit do `runDataCollectingV2` (junto ao loop de `fiscalEmissionCandidateSaleIds`)            | Disparar apenas para vendas com `becameValid && !nowCanceled` — exactly-once por construção; a chave dedupe a sobreposição com os caminhos de aceite, e não se paga insert-conflito por venda a cada polling. |

### `DANFE_NFCE` / `DANFE_NFE`

Hook único: dentro de `persistAuthorizedAssets` (`lib/fiscal/documents.ts`), após o
`pdfStoragePath` ser gravado — cobre os dois caminhos de autorização (`emitFiscalDocument` e
`syncFiscalDocument`) sem duplicar chamada, e garante que o PDF existe antes de assinar a URL.
Vale tanto para emissão automática quanto manual: se a org ligou auto-print de DANFE, qualquer
documento autorizado imprime (a política é sobre a impressão, não sobre quem emitiu).

## Configuração — API e UI

- **API**: a política de impressão viaja dentro de `configuracao` — o fluxo existente de update
  de settings da organização (que já parseia `OrganizationConfigurationSchema`) cobre a escrita;
  sem rota nova. O `aceiteAutomaticoPedidos` é por integração: endpoint de settings da conexão
  iFood escrevendo via patch `jsonb_set` na `configuracao` da integração.
- **UI**: nova seção "Impressão automática" em `components/Settings/SettingsDevices.tsx` — um card
  por finalidade (cupom, DANFE NFC-e, DANFE NF-e) com: toggle `habilitada`, checkboxes de canais
  (POS, Shop, Comanda + `INTEGRACAO-*` montados a partir das integrações ativas da org), stepper
  de `copias`. Reusar `organizationHasPrinterForFinalidade` para exibir aviso "nenhuma impressora
  ativa atende esta finalidade" quando o toggle está ligado sem impressora. O toggle de aceite
  automático do iFood entra na UI de configuração da integração/fulfillment, não na de impressão —
  são políticas independentes (dá para auto-aceitar sem imprimir).

## Limitações conhecidas (aceitas no v1)

1. **Cópias vão para a mesma impressora**: `copias: 2` imprime duas vias no mesmo destino. Via de
   cozinha + via de balcão em impressoras distintas exige job por via — ver Evoluções.
2. **Venda sem `canal` não auto-imprime**: allowlist não casa com nulo. Os fluxos alvo sempre
   setam canal; vendas avulsas criadas por outros caminhos ficam no fluxo manual.

## Evoluções previstas (fora do v1)

- ~~Multi-vias: `vias: [{ finalidade: "CUPOM_COZINHA" }, ...]`~~ — **feito como `TICKET_PREPARO`**
  (2026-10-08). Não é "via" do cupom: é uma finalidade própria, sem preços, com builder e template
  próprios (`lib/desktop-agent/ticket-preparo-data.ts`, `templates/ticket-preparo.ts`). O gatilho é a
  **unidade de preparo entrar em `EM_PREPARO`** — nunca o canal ou a modalidade:
  - venda: `processSalePreparationTicketAutoPrintIfEligible` checa o estado ela mesma; chamada
    pós-commit em `processSaleConfirmationPostCommit`, na transição manual
    (`processSaleAttendanceStatusChange`), no `becameValid` do data-collecting-v2 e no aceite manual
    do iFood. Chave `TICKET_PREPARO:VENDA:<id>` (EM_PREPARO nunca é reentrado).
  - pedido de conta (rodada): `processTabOrderLaunchPostCommit` após todo `launchTabOrder`
    (composer, aprovação manual e automática). Chave `TICKET_PREPARO:PEDIDO_CONTA:<id>`.
  - O fechamento da conta não imprime preparo: a venda rascunho nasce ENTREGUE.
  - Mesmo mapeamento de itens do board (`lib/sales/preparation-tickets.ts`), reimpressão manual pelo
    botão do card e pela rota de gestão (`vendaId` ou `tabOrderId`).
  - **Limitação conhecida**: no aceite automático do iFood a venda ainda está `NAO_INICIADO` (a
    consolidação para EM_PREPARO fica para o próximo sync), então o ticket sai um ciclo de polling
    depois do cupom.
  - **Follow-up separado**: `RETIRADA` nasce `PRONTO` e `PRESENCIAL` nasce `ENTREGUE`
    (`resolveInitialAttendanceStatus`), logo nunca passam por EM_PREPARO e nunca imprimem ticket.
    Para food-service de balcão/retirada, a resposta é um ajuste nos defaults de status inicial
    (com atenção à baixa de estoque, que acompanha `attendanceStatusRequiresPhysicalOut`), não
    alargar o gatilho para `PRONTO`.
- `ETIQUETA_LOTE` automática em eventos de produção.
- Cleanup do `loja_id` em `print_jobs`/`access_principals` + claim do agent (modelagem morta).

## Fases de implementação

1. **Config**: chave `impressoes` em `preferencias` (`schemas/organizations.ts`) +
   `aceiteAutomaticoPedidos` em `IfoodIntegrationConfigSchema` (`schemas/integrations.ts`),
   leitura defensiva parseada.
2. **Builders**: extrair `buildCupomVendaDados`; `createSignedFiscalAssetUrl`;
   `organizationHasActivePrinterForFinalidade`.
3. **Orquestradores**: `lib/desktop-agent/auto-print.ts` com as duas funções `*IfEligible`.
4. **Wiring cupom interno**: `processSaleConfirmationPostCommit`.
5. **iFood**: aceite automático no pós-commit do data-collecting-v2 (confirm + enqueue direto) +
   cupom no `becameValid` do sync e na rota de aceite manual.
6. **Wiring DANFE**: `persistAuthorizedAssets`.
7. **UI**: seção em `SettingsDevices.tsx` + toggle de aceite automático nas settings da conexão
   iFood.

Rollout seguro por construção: preferências ausentes parseiam para tudo `habilitada: false` (e
aceite automático `false`) — zero mudança de comportamento até a org configurar.
