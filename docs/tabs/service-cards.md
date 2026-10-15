# Comandas Fixas (Service Cards) — Design

Extensao do modulo de mesas e comandas (`implementation-plan.md`). Introduz a **comanda fixa**: cartao fisico reutilizavel, cadastrado, com numero padronizado e QR proprio impresso por grafica.

## 1. Contexto e decisao

Hoje a comanda fisica e apenas `tabs.codigo` — texto livre, unico entre tabs `ABERTAS` (`idx_tabs_org_codigo_aberta`). O plano consolidado a descreve como "ponte pragmatica: cartao plastico reutilizavel nao carrega token efemero". Faltam:

- **padronizacao**: qualquer texto vira comanda; "7", "07" e "007" sao contas diferentes; um erro de digitacao abre uma comanda que nao existe fisicamente;
- **QR proprio do cartao**: o QR da tab e efemero (hash-only, exibido uma unica vez na abertura) e nao pode ser impresso num cartao de PVC que dura anos.

A comanda fixa tem o mesmo ciclo de vida do ponto — **ancora duravel que sobrevive as contas** — mas hospeda **no maximo uma tab aberta por vez** e, ao contrario do ponto, o seu QR **mostra o consumo** da conta em andamento.

### Por que uma entidade propria, e nao `servicePoints.tipo = "COMANDA"`

- no preset "Mesas + comandas" a tab tem ponto **e** cartao ao mesmo tempo — seriam duas FKs para a mesma tabela com semanticas diferentes;
- o QR do ponto NUNCA expoe consumo (secao 8 do plano); o QR do cartao expoe. Regras de privacidade opostas na mesma tabela;
- ponto hospeda N tabs abertas; cartao hospeda no maximo 1.

### Nome

`serviceCards` — familia de `servicePoints` (ancoras duraveis do atendimento: o ponto e o lugar, o cartao e o que o cliente carrega). `tabCards` foi descartado: colide com o componente `TabCard` do board (`service-accounts/_components/BoardCards.tsx`). UI: "Comanda" / "Comandas fixas".

### Decisoes tomadas

1. **Privacidade**: o QR do cartao mostra o extrato da tab aberta a quem o escanear. Risco aceito — equivale ao numero impresso no cartao; uma foto antiga so ve o consumo enquanto aquele cartao estiver em uso. Cartao comprometido → regenerar o QR (rotacao do token);
2. **Pedido pelo QR do cartao com tab aberta**: segue `pedidosCliente`; no modo `DIRETO` entra direto na conta, sob os mesmos controles do QR da tab (limite por dispositivo de `autoApproveTabOrderRequest`, degradando para o inbox);
3. **Codigos avulsos sao recusados** quando a organizacao opera com comandas cadastradas — e o proposito da padronizacao;
4. **Formato fisico principal: arquivo para grafica.** A folha A4 para impressao local fica fora da v1.

### Vocabulario (complementa a tabela do plano)

| Termo              | O que e                                                    | Ciclo de vida                                                          | Observacoes                                                                    |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `serviceCard`      | Comanda fixa: cartao fisico reutilizavel ("Comanda 007")   | Duravel — sobrevive as contas; desativavel                             | QR proprio duravel (bruto persistido, reimprimivel); no maximo 1 tab aberta    |
| QR do cartao       | Token duravel impresso no cartao                           | Rotacionavel por operacao explicita                                    | Com tab aberta: extrato + pedido. Livre: cardapio + "apresente ao atendente"   |
| "em uso"           | Cartao com tab `ABERTA` apontando para ele                 | Derivado — nunca persistido                                            | Sem coluna de status para dessincronizar                                       |

## 2. Schema

### 2.1 `services/drizzle/schema/service-cards.ts`

```ts
export const serviceCards = newTable(
	"service_cards",
	{
		id: varchar("id", { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
		organizacaoId: varchar("organizacao_id", { length: 255 })
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		codigo: text("codigo").notNull(), // como impresso: "007", "A12"
		codigoNormalizado: text("codigo_normalizado").notNull(), // chave de comparacao (2.3)
		// Mesmo modelo do QR do ponto: bruto legivel para reimpressao/reexportacao;
		// a busca publica e pelo hash.
		tokenPublico: varchar("token_publico", { length: 64 }).notNull(),
		tokenPublicoHash: varchar("token_publico_hash", { length: 64 }).notNull(),
		ativo: boolean("ativo").default(true).notNull(),
		metadados: jsonb("metadados"),
		dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	},
	(table) => ({
		orgCodigoIdx: uniqueIndex("idx_service_cards_org_codigo").on(table.organizacaoId, table.codigoNormalizado),
		tokenPublicoHashIdx: uniqueIndex("idx_service_cards_token_publico_hash").on(table.tokenPublicoHash),
		orgAtivoIdx: index("idx_service_cards_org_ativo").on(table.organizacaoId, table.ativo),
	}),
);
```

Relations `organizacao` e `tabs: many(tabs)`; tipos `TServiceCardEntity`/`TNewServiceCardEntity`; barrel-export em `schema/index.ts`.

### 2.2 Alteracoes em `tabs.ts`

```ts
serviceCardId: varchar("service_card_id", { length: 255 }).references(() => serviceCards.id, { onDelete: "set null" }),

// Um cartao hospeda no maximo uma tab aberta.
cartaoAbertaIdx: uniqueIndex("idx_tabs_org_service_card_aberta")
	.on(table.organizacaoId, table.serviceCardId)
	.where(sql`status = 'ABERTA' AND service_card_id IS NOT NULL`),
```

- `tabs.codigo` **continua** e recebe `serviceCard.codigo` na abertura (snapshot). Board, relatorios, `sales.comandaNumero` e o partial unique de codigo seguem funcionando sem mudanca;
- excluir um cartao nao apaga historico (`set null` + snapshot em `codigo`).

### 2.3 Normalizacao do codigo

`normalizeServiceCardCode` em `lib/tabs/service-cards.ts` (pura, testada): `trim` → maiusculas → se for apenas digitos, remove zeros a esquerda (`"0"` permanece `"0"`). "7", "07" e "007" resolvem o mesmo cartao; "A07" e "A7" sao distintos (prefixo alfanumerico nao e interpretado).

### 2.4 Configuracao

`TabIdentificationModeEnum` ganha `"COMANDA_CADASTRADA"`:

| Valor                | Comportamento de `openTab`                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| `AUTOMATICA`         | inalterado                                                                       |
| `CODIGO_MANUAL`      | inalterado — codigo livre, para quem nao cadastra cartoes                        |
| `COMANDA_CADASTRADA` | codigo (ou token lido) obrigatorio e resolvido para um `serviceCard` **ativo**; codigo nao cadastrado e recusado |

Nao renomear valores existentes (estao persistidos em `serviceSettings.configuracoes`). Presets nao mudam; no modal `ServiceSettings`, quando a forma de operar usa codigo, um controle "Usar comandas cadastradas" alterna entre `CODIGO_MANUAL` e `COMANDA_CADASTRADA`. Ligar o modo com zero cartoes ativos e permitido, com aviso. Tabs ja abertas com codigo avulso continuam operando ate o fechamento — sem backfill.

### 2.5 Migracao

`drizzle/0128_service_cards.sql`, aplicada com `npx tsx ./scripts/apply-sql-migration.ts` (idempotente, aditiva). **Aplicar antes do deploy**: o schema TS de `tabs` passa a selecionar `service_card_id`.

`lib/organizations/deletion.ts` ganhou a familia inteira de mesas e comandas (`tabOrderRequests`, `tabOrders`, `tabs`, `serviceCards`, `servicePoints`, `serviceSettings`), depois das vendas — antes ela dependia so do cascade, e apagar `serviceCards` antes de `tabs` dispararia o `set null` linha a linha.

## 3. Services (`lib/tabs/`)

### 3.1 `service-card-codes.ts` (puro) e cadastro

- `normalizeServiceCardCode` (2.3);
- `generateServiceCardCodes({ inicio, fim, prefixo, digitos })` — pura: `{ inicio: 1, fim: 200, digitos: 3 }` → `"001".."200"`. O client gera a lista e o POST recebe `codes: string[]` (maximo 1000), o que cobre lote e comanda avulsa com o mesmo endpoint;
- criacao do lote (`POST /api/service-cards`) — insere o lote com `ON CONFLICT (organizacao_id, codigo_normalizado) DO NOTHING` e devolve criados **e** ignorados (gerar "1–200" quando "1–50" ja existem cria apenas os novos, sem erro);
- `extractServiceCardToken(raw)` — extrai o token de uma leitura de scanner pela regex `[0-9a-f]{64}`, sem parsear a URL. Leitores configurados em layout US digitando num SO ABNT2 trocam `:` e `/`; o token hexadecimal sobrevive intacto;
- `resolveServiceCard({ orgId, codigo | token })` (fase 2) — por `codigoNormalizado` ou por hash do token, sempre filtrando a organizacao.

### 3.2 `open-tab.ts`

`TOpenTabInput` ganha `serviceCardId?: string | null`. Com `identificacao === "COMANDA_CADASTRADA"`:

1. resolve o cartao (por `serviceCardId`, ou pelo `codigo` informado via `resolveServiceCard`); inexistente → `BadRequest("Comanda X nao cadastrada.")`; inativo → `BadRequest("Comanda X desativada.")`;
2. grava `serviceCardId` e `codigo = card.codigo`;
3. violacao de `idx_tabs_org_service_card_aberta` (23505) → `Conflict("A comanda X ja esta em uso.")`, mesma traducao amigavel ja usada para codigo.

Nos demais modos `serviceCardId` e ignorado/recusado — o cartao so participa quando a organizacao opera com cadastro.

### 3.3 `transfer-tab.ts`

Passa a aceitar trocar o cartao (`serviceCardDestinoId`, livre e ativo), sozinho ou junto com a troca de ponto; `codigo` da conta acompanha o novo cartao e a troca fica em `metadados.transferencias`. Caso de uso: cartao perdido com conta aberta → "Trocar comanda" no menu do painel da conta (`ChangeTabServiceCard`) e depois desativar o perdido.

### 3.4 Desativacao e regeneracao

- desativar e permitido a qualquer momento: o QR deixa de valer imediatamente; uma tab aberta nele continua operavel pelo board;
- regenerar token = rotacao (cartao comprometido ou reimpressao). O cartao antigo impresso deixa de funcionar — a UI avisa que exige reimpressao.

## 4. APIs (App Router)

| Rota                                | Metodo | Funcao                                                                                         |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `app/api/service-cards/route.ts`    | GET    | multi-mode: `byId`, `byLookup` (`?codigo=` ou `?token=`, para digitacao e scanner), `default` (lista com status "em uso" derivado por join com tabs abertas) |
|                                     | POST   | criacao em lote (3.1)                                                                          |
|                                     | PUT    | atualizar `codigo`/`ativo`; `regenerateToken: true` rotaciona                                  |
|                                     | DELETE | remove (UI prefere desativar)                                                                  |
| `app/api/tabs/route.ts`             | POST   | aceita `serviceCardId`                                                                         |
| `app/api/tabs/transfer/route.ts`    | POST   | aceita `serviceCardId` destino                                                                 |
| `app/api/public/tab-order-requests` | POST/GET | `context` ganha `"COMANDA"` (5.2)                                                            |

Gate: mesmo acesso do board de contas. `tokenPublico` so trafega em rotas autenticadas da organizacao (mesmo tratamento do ponto).

## 5. QR e pagina publica

### 5.1 `app/(external)/service-card/[token]/page.tsx`

URL impressa: `${NEXT_PUBLIC_APP_URL}/service-card/<token>` — sempre o dominio canonico (mesma regra de `ServicePointQrDisplay`), porque o cartao dura anos.

| Estado do cartao        | Pagina                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| ativo, com tab aberta   | extrato da tab (mesma composicao de `/tab/[token]`) + `PublicOrderMenu` se `pedidosCliente` ativo |
| ativo, livre            | cardapio + "Comanda disponivel — apresente ao atendente"; pedido conforme 5.2                |
| inativo / inexistente   | "QR Code invalido ou desativado"                                                             |

### 5.2 Pedido pelo QR do cartao (`context: "COMANDA"`)

- **com tab aberta**: `tabId` resolvido pelo cartao — destino deterministico. `DIRETO` → `autoApproveTabOrderRequest` (limite por dispositivo degrada para o inbox); `SOLICITACAO` → inbox. `servicePointId` da solicitacao = o da tab, se houver;
- **cartao livre**: so aceita pedido quando `aberturaPublica` nao e `DESABILITADA`; a solicitacao vai **sempre** para o inbox (o `DIRETO` e pulado) com `codigoTab = card.codigo`, reusando a acao **"Abrir comanda X e aprovar"** — a criacao de conta nunca e silenciosa. A solicitacao nao tem ponto: com pontos habilitados o inbox mostra o seletor de mesa (obrigatorio quando `pontoObrigatorio`), enviado em `destination: { type: "NEW", code, servicePointId }`. A aprovacao resolve o cartao pelo numero normalizado e abre a conta ja vinculada a ele.

O extrato publico virou componente compartilhado (`app/(external)/_components/PublicTabStatement.tsx`), usado por `/tab/[token]` e `/service-card/[token]`.

### 5.3 Leitura pelo operador

O board de contas monta `useBarcodeScanner`. Leitura que contenha um token de cartao (3.1) → `GET /api/service-cards?token=`:

- cartao com tab aberta → abre a conta;
- cartao livre → abre `NewTab` com o cartao pre-selecionado;
- desconhecido/inativo → toast de erro.

O leitor do board so reage a leituras com token de cartao (codigos de barras de produto sao do composer) e so fica ligado sem modal aberto; `NewTab` e `ChangeTabServiceCard` tem leitor proprio, com o dialog como dono. O detector do POS tem teto de 64 caracteres e ignora a URL do cartao; `useBarcodeScanner` ganhou `maxLength` para este caso (`SERVICE_CARD_SCAN_MAX_LENGTH`).

Digitar o numero no `NewTab` resolve pelo `codigoNormalizado` (`GET /api/service-cards?codigo=`, modo `byLookup`), com feedback de livre / em uso (com atalho "VER CONTA") / desativada / nao cadastrada; "ABRIR CONTA" so habilita com a comanda livre.

## 6. Arquivo para grafica (formato principal)

Geracao no client com `pdf-lib` + `qrcode` (ja dependencias; mesmo padrao de `lib/visual-kits/generation/pdf.ts`), em `lib/tabs/service-card-print.ts`. Exportacao a partir de uma selecao (todos, intervalo ou selecionados).

### 6.1 PDF de dados variaveis — uma pagina por cartao

- **tamanho**: CR80 (85,6 × 54 mm) + **3 mm de sangria** em cada lado → pagina de 91,6 × 60 mm; margem de seguranca de 3 mm para dentro do corte; marcas de corte opcionais;
- **QR vetorial**: modulos do `QRCode.create(url, { errorCorrectionLevel: "M" })` desenhados como retangulos no PDF (nunca bitmap — grafica imprime em alta resolucao), zona de silencio de 4 modulos, lado minimo de 20 mm, preto puro sobre branco;
- **conteudo**: logo da organizacao, numero grande (`codigo` como impresso), instrucao curta ("Escaneie para ver sua conta e pedir"). Fonte embutida (Helvetica Bold padrao do `pdf-lib`); logo raster embutido em PNG/JPEG no tamanho final;
- **ordem**: paginas na ordem do codigo; nome do arquivo `comandas-001-200.pdf`;
- **verso**: fora da v1 — arte fixa, igual para todos, a grafica resolve com o arquivo do proprio cliente.

### 6.2 Planilha de dados variaveis (CSV)

`codigo;url` — muitas graficas preferem montar a arte no proprio software (dados variaveis) e gerar o QR por la. Custo minimo e evita que o layout do PDF seja bloqueante.

### 6.3 Reaproveitamento

Gerador de QR vetorial e layout de pagina ficam independentes do tipo de ancora, para que a exportacao em lote dos QRs de mesa (hoje so ha download unitario em `ServicePointQrDisplay`) reuse o mesmo modulo depois.

## 7. Client

- `lib/queries/service-cards.ts` (`useServiceCards`, `useServiceCardById`) e `lib/mutations/service-cards.ts`;
- modais em `components/Modals/ServiceCards/` (convencao do CLAUDE.md para UI da organizacao): `NewServiceCards.tsx` (lote: inicio, fim, digitos, prefixo, preview; ao concluir oferece o arquivo do lote criado), `ControlServiceCard.tsx` (numero, ativo, regenerar QR, excluir, arquivo do cartao), `ExportServiceCards.tsx` (arquivo de um intervalo), `ChangeTabServiceCard.tsx` (troca de cartao da conta) e `ServiceCardFileActions.tsx` (botoes PDF/CSV);
- gestao pela aba **Por comanda** do board, ao lado de "Por conta" e "Por mesa", visivel sempre que contas estao habilitadas (os cartoes sao gerados e impressos antes de a operacao passar a usa-los): grade de tiles (livre / em uso com a conta / desativada), filtros, busca por numero ou cliente, "Arquivo para grafica" e "Nova comanda". "Abrir" num cartao livre so aparece com `COMANDA_CADASTRADA`; antes disso o tile leva a edicao e um aviso explica como ativar. "Por mesa" ganhou "Nova mesa" no mesmo lugar;
- numero nao editavel e exclusao bloqueada enquanto a comanda esta em uso (a conta guarda o numero como snapshot);
- geracao: `lib/tabs/service-card-print-layout.ts` (geometria pura, testada), `lib/tabs/service-card-print.ts` (pdf-lib + qrcode, roda no browser e no Node) e `lib/tabs/service-card-download.ts` (logo via proxy `/api/visual-kits/image`, download). Testes: `npm run test:service-cards`.

## 8. Invariantes e casos de borda

1. No maximo uma tab `ABERTA` por cartao — garantido no banco (`idx_tabs_org_service_card_aberta`);
2. `codigoNormalizado` unico por organizacao — "7" e "007" nunca coexistem;
3. Com `COMANDA_CADASTRADA`, nenhuma tab nova nasce sem `serviceCardId`;
4. Toda referencia recebida (cartao, ponto) e validada contra a organizacao da sessao antes de persistir;
5. Cartao desativado: QR invalido na hora; tab aberta nele segue operavel pelo board e pode ser transferida;
6. Fechar a tab libera o cartao implicitamente (derivado) — nenhuma escrita no cartao;
7. Regenerar token invalida o cartao impresso — exige reimpressao.

## 9. Fases de entrega

1. **Cadastro + arquivo para grafica**: schema, normalizacao, lote, CRUD, exportacao PDF/CSV, deletion module. Ja entrega valor (o cliente encomenda os cartoes);
2. **Operacao**: `COMANDA_CADASTRADA` em `openTab`, `NewTab` com validacao, leitura por scanner no board, transferencia de cartao;
3. **Pagina publica**: `/service-card/[token]`, `context: "COMANDA"` na solicitacao publica, `DIRETO` com tab aberta e inbox para cartao livre.

Fora de escopo (candidatos a `future-improvements.md`): folha A4 para impressao local, verso personalizado, exportacao em lote dos QRs de mesa (6.3), abertura automatica de conta pelo cliente em cartao livre.
