# Painel dos Colaboradores e Atividades — Proposta de UI/UX e Modelo

> Status: **v1 — proposta para planejamento**. Nada implementado.
> Complementa `docs/seller-routine-hub-design.md` (rotina do vendedor, interações, carteiras) e não
> altera nenhuma decisão fechada lá. O primitivo de atividades foi estudado no repositório
> `syncroniza-control` (`activities`, `activity_responsibles`, `activity_recurring_rules`) e
> portado aqui **sem tipos de atividade** — ver §7.7 para o que ficou de fora e por quê.

---

## 1. Conceito em uma frase

Hoje a plataforma sabe **atribuir resultado** a pessoas (venda, meta, carteira, atendimento) mas não
sabe **atribuir trabalho** a elas. O Painel dos Colaboradores junta, numa página só, as duas
identidades que hoje um colaborador tem no sistema — o **vendedor** (`sellers`) e o **usuário
membro** (`organization_members` + `users`) — e ganha um primitivo novo, a **atividade**: algo a
fazer, com responsáveis, com ou sem data, com ou sem recorrência, criado por gente ou por agente.

Corolários:

- **Uma pessoa, uma linha.** O painel nunca lista "vendedores" e "usuários" em tabelas separadas.
  O vínculo `usuarioVendedorId` é o que une as duas facetas; a ausência dele é um item de atenção,
  não um estado normal.
- **Interação ≠ atividade.** A fronteira é uma pergunta: *houve contato com cliente?* Interação.
  *É trabalho que alguém precisa fazer?* Atividade. Follow-ups continuam sendo interações
  `PLANEJADA` (já implementadas, cientes de cadência); atividades cobrem o que o ledger de
  relacionamento não cobre.
- **Sem tipos de atividade.** Tarefa, compromisso e rotina são **formas derivadas** dos campos
  (§7.3), nunca uma coluna `tipo`. Menos configuração = menos estado = menos gambiarra.

---

## 2. Diagnóstico: duas meias-identidades

| Faceta | Tabela | O que aponta para ela |
|---|---|---|
| Identidade operacional | `sellers` | `sales.vendedorId`, `goals_sellers`, `client_seller_references`, `interactions.vendedorId`, `tabs.responsavelVendedorId`, `sales_sessions.vendedorPadraoId` |
| Identidade de acesso | `organization_members` + `users` | `chat_assignments.responsavelUsuarioId`, `chat_messages.autorUsuarioId`, `sales_sessions.abertaPor/fechadaPor/conferidaPorUsuarioId`, `action_approval_requests.solicitanteId`, `purchases.autorId`, `productions.autorId`, `interactions.autorId` |
| Vínculo | `organization_members.usuarioVendedorId` | Coluna opcional; nunca exibida em lugar nenhum |

Onde o gestor vai hoje para ver uma pessoa:

- **Gestão > Vendedores** (`/dashboard/management/sellers`): estatísticas de venda e cadastro.
- **Gestão > Metas**: meta ativa e por vendedor.
- **Clientes > Carteiras** com "ver como": rotina de relacionamento.
- **Atendimentos > Estatísticas**: ranking de atendentes por usuário.
- **Configurações > Usuários**: permissões e convites.
- **Dashboard > Equipe**: leitura do dia.

Nenhuma dessas telas responde "quem é essa pessoa e o que ela tem para fazer".

---

## 3. Personas e princípios

**Gestor(a)**: dono ou gerente da loja. Quer saber quem está vendendo, quem está atrasado, quem
está sobrecarregado e o que falta arrumar no cadastro. Usa desktop e celular.

**Colaborador(a)**: vendedor de balcão, atendente, estoquista. Autenticado como membro, com ou sem
vínculo a um vendedor. Quer saber *o que fazer agora*, no celular, em um toque.

1. **O gestor analisa; o colaborador executa.** O painel é do gestor. A visão própria do
   colaborador é a agenda (§8.3) e o hub de Carteiras já existente.
2. **Atividade agregada, nunca cronômetro.** Mesma regra do hub do vendedor: o gestor vê carga e
   atraso da equipe, não tempo por pessoa. Não existe ledger de execução (§7.7).
3. **Contar não é meta.** Atividades são exibidas, nunca viram objetivo numérico. A rotina do
   vendedor adia metas de atividade para depois de existir cultura de registro honesto; vale aqui.
4. **Compromisso não é sugestão.** Atividades com data aparecem acima da fila algorítmica de
   Carteiras e nunca são reordenadas pela inteligência.
5. **Tudo que o módulo não tem, não aparece.** Blocos governados por `canAccessDashboardCapability`;
   "—" para dado ausente, nunca 0.
6. **Âmbar só em celebração** (DESIGN.md): ouro no primeiro lugar do ranking e na meta batida.

---

## 4. Painel dos Colaboradores (gestor)

### 4.1 Posicionamento

- Sidebar, grupo **Gestão**: item `Colaboradores`, gated pela capability `sellers` já existente,
  **substituindo** `Vendedores`. Rotas antigas viram redirect.
- Rotas: `/dashboard/management/collaborators` e
  `/dashboard/management/collaborators/[collaboratorId]`. O `collaboratorId` é o `id` de
  `organization_members` quando existe membro, ou o `id` de `sellers` prefixado (`seller:`) para
  vendedores sem usuário — a página resolve os dois.

### 4.2 Estrutura da página

Mesmo esqueleto da página de Vendedores atual (tabs `page`, `StatUnitCard`, `DateIntervalInput`),
para parecer nativo:

1. **Cabeçalho**: seletor de período + controle segmentado de **lente**: `Vendas`,
   `Relacionamento`, `Atendimento`, `Atividades`. A lente troca as colunas do ranking, não as
   pessoas.
2. **Faixa de KPIs** (com comparação de período): colaboradores ativos, faturamento, ticket médio,
   meta atingida, abordagens realizadas, atividades concluídas. Tile de módulo que a organização
   não tem não é renderizado.
3. **Ranking**: uma linha por colaborador — avatar, nome, badge de vínculo, colunas da lente.
   Usa o padrão `hub-table` (vira pares rotulados abaixo de `sm`). Ouro só no primeiro.
4. **Painel de atenção** (coluna direita no desktop, abaixo no celular). Itens de qualidade de
   cadastro e de operação, cada um com ação inline:
   - vendedor sem usuário vinculado → *Convidar* / *Vincular*;
   - usuário com permissão de venda e sem vendedor → *Vincular*;
   - convite pendente / expirado → *Reenviar*;
   - vendedor inativo com venda no período → *Reativar*;
   - vendedor sem meta na meta ativa → *Definir meta*;
   - atividades atrasadas por colaborador → abre a lista filtrada;
   - regra de recorrência pausada → abre a regra;
   - colaborador sem nenhuma atividade atribuída → *Atribuir*.
5. **Tabs** abaixo: `Metas` (reusa `goals/stats` com ritmo por vendedor), `Atividade` (rotina das
   carteiras agregada + ranking de atendentes + distribuição de atividades abertas por pessoa),
   `Cadastro` (o "Banco de Dados" atual + membros + convites, com as ações de vínculo).

### 4.3 Colunas por lente

| Lente | Colunas |
|---|---|
| Vendas | vendas, faturamento, ticket médio, % da meta |
| Relacionamento | clientes na carteira, em débito de comunicação, abordagens no período, vendas influenciadas |
| Atendimento | chats atendidos, resolvidos, tempo de primeira resposta, mensagens enviadas |
| Atividades | pendentes, atrasadas, concluídas no período, próximas 7 dias |

---

## 5. Página do colaborador (360)

A página de detalhe do vendedor atual, alargada. Blocos, cada um presente só quando o módulo existe:

1. **Cartão de identidade** com as duas facetas: dados do vendedor, usuário vinculado, resumo de
   permissões, estado ativo/inativo. Ações: `Editar`, `Vincular usuário`, `Ver carteira`
   (deep-link em Carteiras com o vendedor pré-selecionado), `Definir meta`, `Atribuir atividade`
   (abre `NewActivity` com o responsável preenchido).
2. **Meta ativa** como anel com ritmo (`resolveActiveGoalPacing`), depois os tiles de venda e os
   resultados agrupados que a página já tem.
3. **Agenda** (novo): próximos dias mesclando atividades e interações `PLANEJADA` do colaborador
   (§8.3). Atrasados primeiro, em vermelho.
4. **Saúde da carteira**: clientes onde é dono do vínculo, quantos em débito, follow-ups
   planejados, vendas influenciadas (rota de stats de carteira, já existe).
5. **Atendimento**: linha do ranking de atendentes (rota `chats/stats/agents`, já existe).
6. **Operação** (só com ERP/PDV): sessões de venda abertas, fechadas e conferidas por este usuário;
   comandas sob sua responsabilidade.
7. **Timeline** unificada de interações e vendas — o componente que a rotina do vendedor já pede.

---

## 6. Dados: o que cada bloco lê

| Bloco | Fonte | Existe hoje |
|---|---|---|
| KPIs e ranking de venda | `sales.vendedorId`; `sellers/stats`, `sellers/stats/ranking`, `sellers/stats/overall` | Sim |
| Meta e ritmo | `goals`, `goals_sellers`; `goals/stats` | Sim |
| Carteira e débito de comunicação | `client_seller_references`; `client-portfolios/stats`, `client-portfolios/team-routine` | Sim, por vendedor |
| Interações e vendas influenciadas | `interactions.vendedorId`; `client-portfolios/stats` | Sim, por vendedor |
| Atendimento por usuário | `chats/stats/agents` | Sim |
| Sessões de venda por usuário | `sales_sessions.abertaPor/fechadaPor/conferidaPorUsuarioId` | Só colunas |
| Membros, permissões, convites | `organizations/memberships`, `.../invitations` | Sim |
| Estado do vínculo vendedor ↔ usuário | `organization_members.usuarioVendedorId` | Só coluna |
| Atividades | `activities`, `activity_responsibles` (novo, §7) | Não |

Rotas novas para o painel (todas respeitam `resultados.escopo`, o mesmo recorte que o dashboard
passa como `scopeSellersIds`):

- `GET /api/collaborators` — modo `default`: uma linha por pessoa (join membro × vendedor com
  estado do vínculo, flags de atenção e as colunas da lente pedida); modo `byId`: resumo 360
  que faz fan-out para as fontes acima.
- `GET /api/collaborators/attention` — os itens do painel de atenção (§4.2.4), já com o
  `collaboratorId` e a ação sugerida.
- `GET /api/sales-sessions/stats/by-user` — contagens de abertura/fechamento/conferência por
  usuário no período (bloco Operação).

---

## 7. Atividades: o primitivo

### 7.1 Definição

Uma atividade é **trabalho atribuído a pessoas**. Tem título, descrição, zero ou mais
responsáveis, uma forma temporal derivada (sem data, prazo, agenda), um status de execução, e
vínculos opcionais com as entidades que a motivaram. Pode nascer de uma pessoa, de uma regra de
recorrência ou de um agente de IA.

Exemplos que o ledger de interações não representa: abrir e conferir o caixa, contagem semanal de
estoque, receber fornecedor, montar vitrine da campanha, reunião de equipe, treinamento, "estoque
de X baixo — comprar" gerado pelo agente.

### 7.2 Fronteira com `interactions` (decisão fechada)

O `syncroniza-control` mantém `interactions` e `activities` como tabelas separadas, e a rotina do
vendedor daqui já emprestou dali o modelo de interação. A fronteira é a mesma:

> Houve contato com cliente → **interação**. É trabalho a fazer → **atividade**.

Consequências:

- Follow-ups **continuam** sendo interações `PLANEJADA`: cientes de cadência, suprimem o cliente da
  fila, já entregues. Não são duplicados como atividades.
- Uma atividade **pode** apontar para um cliente (`clienteId`) sem ser um contato — "separar pedido
  da Dona Maria" é atividade; "ligar para a Dona Maria" é interação planejada.
- A **agenda do colaborador** (§8.3) é a união das duas fontes por data e responsável. É a única
  camada que as mistura, e só para leitura.
- Fundir follow-up em atividade é decisão de v2, **com a sobreposição medida** — mesma postura que a
  rotina do vendedor tomou com atribuição de conversão.

### 7.3 Forma temporal derivada (sem coluna `tipo`)

Portado do plano de agenda do Control, sem alteração:

```txt
Agenda   (compromisso): agendamentoInicio != null AND agendamentoFim != null
Prazo    (tarefa com limite): agendamento* == null AND dataVencimento != null
Sem data (tarefa livre): agendamento* == null AND dataVencimento == null
Rotina   : recorrenciaRegraId != null  (qualquer das formas acima, gerada por regra)
```

A UI expõe uma escolha simples ao criar — `Sem data`, `Prazo`, `Agenda` — e exibe um chip
derivado na listagem (`Tarefa`, `Compromisso`, `Rotina`). `dataInicio` e `dataConclusao` são
execução real, nunca planejamento. **Não criar coluna `tipoData`, nem `categoria`, nem `tipo`.**

### 7.4 Schema

Em `services/drizzle/schema/activities.ts`, enums em `schema/enums.ts`, Zod em
`schemas/activities.ts` com enums em `schemas/enums.ts`.

```ts
export const activityStatusEnum = pgEnum("activity_status", ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]);

export const activities = newTable("activities", {
	id: varchar("id", { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }).notNull(),
	titulo: text("titulo").notNull(),
	descricao: text("descricao"),
	status: activityStatusEnum("status").default("PENDENTE").notNull(),
	// Forma temporal derivada (§7.3)
	dataVencimento: timestamp("data_vencimento"),
	agendamentoInicio: timestamp("agendamento_inicio"),
	agendamentoFim: timestamp("agendamento_fim"),
	agendamentoDiaInteiro: boolean("agendamento_dia_inteiro").default(false).notNull(),
	// Execução real
	dataInicio: timestamp("data_inicio"),
	dataConclusao: timestamp("data_conclusao"),
	concluidaPorUsuarioId: varchar("concluida_por_usuario_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
	dataArquivamento: timestamp("data_arquivamento"),
	// Vínculos opcionais — lista curta, de varejo
	clienteId: varchar("cliente_id", { length: 255 }).references(() => clients.id, { onDelete: "set null" }),
	vendaId: varchar("venda_id", { length: 255 }).references(() => sales.id, { onDelete: "set null" }),
	compraId: varchar("compra_id", { length: 255 }).references(() => purchases.id, { onDelete: "set null" }),
	producaoId: varchar("producao_id", { length: 255 }).references(() => productions.id, { onDelete: "set null" }),
	sessaoVendaId: varchar("sessao_venda_id", { length: 255 }).references(() => salesSessions.id, { onDelete: "set null" }),
	produtoId: varchar("produto_id", { length: 255 }).references(() => products.id, { onDelete: "set null" }),
	pontoAtendimentoId: varchar("ponto_atendimento_id", { length: 255 }).references(() => servicePoints.id, { onDelete: "set null" }),
	// Autoria: pessoa ou agente
	autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
	autorAgenteId: varchar("autor_agente_id", { length: 255 }).references(() => aiAgents.id, { onDelete: "set null" }),
	// Instância de recorrência (mesmo padrão de financial_recurring_rules)
	recorrenciaRegraId: varchar("recorrencia_regra_id", { length: 255 }).references(() => activityRecurringRules.id, { onDelete: "set null" }),
	recorrenciaInstanciaData: timestamp("recorrencia_instancia_data"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
	dataAtualizacao: timestamp("data_atualizacao").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
	// Dedup de instâncias garantido pelo banco
	recorrenciaInstanciaUnique: uniqueIndex("activities_recorrencia_instancia_unique")
		.on(table.recorrenciaRegraId, table.recorrenciaInstanciaData)
		.where(sql`${table.recorrenciaRegraId} IS NOT NULL`),
	orgStatusVencimentoIdx: index("idx_activities_org_status_vencimento").on(table.organizacaoId, table.status, table.dataVencimento),
	orgAgendaIdx: index("idx_activities_org_agendamento").on(table.organizacaoId, table.agendamentoInicio),
}));

export const activityResponsibles = newTable("activity_responsibles", {
	id: varchar("id", { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }).notNull(),
	atividadeId: varchar("atividade_id", { length: 255 }).references(() => activities.id, { onDelete: "cascade" }).notNull(),
	usuarioId: varchar("usuario_id", { length: 255 }).references(() => users.id, { onDelete: "cascade" }).notNull(),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
}, (table) => ({
	atividadeUsuarioUnique: uniqueIndex("activity_responsibles_atividade_usuario_unique").on(table.atividadeId, table.usuarioId),
	orgUsuarioIdx: index("idx_activity_responsibles_org_usuario").on(table.organizacaoId, table.usuarioId),
}));

export const activityRecurringRules = newTable("activity_recurring_rules", {
	id: varchar("id", { length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
	organizacaoId: varchar("organizacao_id", { length: 255 }).references(() => organizations.id, { onDelete: "cascade" }).notNull(),
	autorId: varchar("autor_id", { length: 255 }).references(() => users.id, { onDelete: "set null" }),
	ativa: boolean("ativa").default(true).notNull(),
	pausaMotivo: text("pausa_motivo"),
	config: jsonb("config").$type<TActivityRecurringRuleConfig>().notNull(),      // frequencia, intervalo, diasSemana, diaMes, horario, dataInicio, dataFim
	template: jsonb("template").$type<TActivityRecurringRuleTemplate>().notNull(), // titulo, descricao, forma, duracaoMinutos, responsaveisIds, vínculos
	proximaGeracaoEm: timestamp("proxima_geracao_em"),
	ultimaGeracaoEm: timestamp("ultima_geracao_em"),
	dataInsercao: timestamp("data_insercao").defaultNow().notNull(),
}, (table) => ({
	proximaGeracaoIdx: index("idx_activity_recurring_rules_proxima_geracao").on(table.proximaGeracaoEm),
}));
```

O **responsável é sempre um usuário.** Vendedor sem usuário não recebe atividade — não teria como
vê-la — e aparece no painel de atenção. A atribuição ao "colaborador" do painel sai do join
`organization_members.usuarioId = activity_responsibles.usuarioId`. Sem `agenteId` em
responsáveis: agente cria (`autorAgenteId`), gente executa.

### 7.5 Invariantes

Validação central única em `lib/activities/create.ts` / `update.ts`, por onde toda escrita passa
(padrão de `createInteraction()`):

1. `agendamentoInicio` e `agendamentoFim` são ambos nulos ou ambos preenchidos; `fim >= inicio`.
2. `status = CONCLUIDA` ⇒ `dataConclusao` e `concluidaPorUsuarioId` preenchidos; voltar para
   `PENDENTE` limpa os dois.
3. `dataInicio <= now()` e `dataConclusao <= now()`: execução não acontece no futuro.
4. Instância de recorrência (`recorrenciaRegraId != null`) tem `recorrenciaInstanciaData` e
   respeita o índice único; a regra só gera N dias à frente (padrão 14).
5. Vínculos (`clienteId`, `vendaId`…) pertencem à mesma `organizacaoId`.
6. Atividade **não** escreve em `interactions`, não conta para cadência, fadiga ou influência.
   Concluir "separar pedido" não zera o relógio de comunicação do cliente.
7. Datas capturadas no fuso da organização (`America/Sao_Paulo`), como os time-blocks de campanha.

### 7.6 Recorrência

Mesmo padrão de `financial_recurring_rules` + cron `generate-recurring-entries`, reusando
`RecurrenceFrequencyEnum` (`DIARIO | SEMANAL | MENSAL`):

- Cron `app/api/cron/generate-recurring-activities` roda diariamente, materializa instâncias até
  `hoje + 14d` para regras ativas com `proximaGeracaoEm <= now()`, e avança `proximaGeracaoEm`.
- Regra pausa sozinha (`ativa=false`, `pausaMotivo`) quando todos os responsáveis do template
  deixaram a organização. Regra pausada é item de atenção (§4.2.4).
- Editar uma regra **não** reescreve instâncias já geradas; só as futuras. Instância pode ser
  editada, concluída ou cancelada isoladamente.
- O template guarda `responsaveisIds`; cada instância recebe suas linhas em
  `activity_responsibles` na geração.

É a funcionalidade de varejo que mais paga o primitivo: abertura e fechamento de caixa, contagem
semanal de estoque, conferência de validade, limpeza de vitrine.

### 7.7 O que foi deliberadamente **não** portado do Control

| Peça do Control | Decisão | Motivo |
|---|---|---|
| `activity_types` (auxiliares, modo temporal padrão, templates, campos por tipo) | **Não** | Complexidade introduzida recentemente lá e ainda em validação. Aqui a forma temporal é derivada e o chip é calculado; se tipagem se provar necessária, o porte é aditivo (`tipoId` nullable) |
| `activity_executions` (ledger de tempo por executor) | Não | Conceito de campo/OS; e o princípio "nunca cronômetro por pessoa" (§3.2). O Control também declara timesheets como não-objetivo |
| `activity_access_links` (execução por link externo) | Não | Sem executor anônimo no varejo |
| Formulários, alocadores de recursos, `localizacaoId` genérico | Não | Substituído por `pontoAtendimentoId` → `service_points`, que já existe |
| Hierarquia `parentId` | Não em v1 | Nenhum caso de varejo pede container/folha. Coluna aditiva se surgir |
| Kanban de atividades | Não | Status de três estados basta; lista + agenda são as superfícies do celular |
| `urgencia` | Não em v1 | Ordenação por vencimento resolve; prioridade declarada à mão é dado caro |
| 13 FKs de vínculo (oportunidade, projeto, OS, homologação, assinatura…) | Lista curta | Só entidades que existem aqui (§7.4) |
| `activity_tags` | Adiar | Sem tipos, tags podem ser a única classificação livre necessária; decidir com uso |
| `activity_calendar_events` (Google Calendar) | Adiar (v2) | `users` já guarda `googleId`/tokens, então o caminho existe; sincronizar só a forma `Agenda`, como no Control |
| Inbox por usuário, quick update, reagendar, ações em massa | **Sim** | São a experiência do celular (§8) |
| Autor agente (`autorAgenteId`) | **Sim** | O agente já existe (`ai_agents`); "estoque baixo → criar atividade de compra" é o primeiro uso |

### 7.8 Permissões e capability

- `OrganizationMemberPermissionsSchema` ganha o bloco `atividades: { visualizar, criar, editar,
  excluir }`. Sem permissão por forma ou por vínculo.
- Quem é responsável **sempre** vê e conclui as próprias atividades, mesmo sem `atividades.visualizar`
  — a permissão governa a visão da equipe, não a própria agenda.
- Capability nova `activities` em `lib/access/capabilities.ts`, usada por sidebar, paleta de
  comandos e blocos do hub.

---

## 8. Superfícies de atividades

### 8.1 Página `/dashboard/activities`

Item de sidebar próprio (grupo de operação, gated por `activities`). Duas vistas, persistidas em
`nuqs` como a página de Vendedores:

- **Lista**: filtros `InteractiveFilter` por status, forma, responsável, vencimento, vínculo;
  atrasadas em destaque; ações rápidas por linha (concluir, reagendar, atribuir).
- **Agenda**: mês com contagem por dia, e dia com as atividades em ordem de horário. Reusa a
  estrutura do calendário de Carteiras (`client-portfolios/agenda`), que já faz isso para
  interações planejadas.

Botões: `Nova atividade` e `Nova rotina` (regra de recorrência). Modais `NewActivity` /
`ControlActivity` em `components/Modals/Activities/`, blocos `General`, `Schedule`,
`Responsibles`, `Links`, `Recurrence`; state hook `useInternalActivityState`.

### 8.2 Inbox do colaborador

`GET /api/activities/inbox` com filtro `PENDENTES | HOJE | ATRASADAS | CONCLUIDAS` e cursor,
escopado ao usuário da sessão. É a fonte da vista mobile: card com título, chip de forma, quando,
vínculo (nome do cliente/produto), botão `Concluir` de um toque e `Reagendar`.

### 8.3 Agenda mesclada

`GET /api/activities/agenda?usuarioId=&date=` devolve, para o dia, a união ordenada de:

- atividades com `agendamentoInicio` no dia ou `dataVencimento` no dia, e atrasadas;
- interações `PLANEJADA` do vendedor vinculado ao usuário (`usuarioVendedorId`) no dia.

Cada item carrega `origem: "ATIVIDADE" | "INTERACAO"` e o front renderiza o card certo. É a mesma
consulta que alimenta o bloco Agenda da página do colaborador (§5.3) e a seção do dia no tab
**Meu dia** de Carteiras, acima da fila algorítmica.

### 8.4 Dashboard hub

Tab **Equipe**, painel "Rotina das carteiras" ganha as mesmas três linhas para atividades —
previstas hoje, feitas, atrasadas — a partir de `GET /api/activities/stats/team-day`. Uma query,
um bloco, sem filtro, como manda a convenção do hub.

### 8.5 Agente de IA

O agente passa a poder **criar atividades** (ferramenta `create_activity`, autor `autorAgenteId`,
responsáveis sugeridos pelo contexto: dono da carteira do cliente, ou quem abriu a sessão de venda).
Primeiros gatilhos: estoque abaixo do mínimo, sessão de venda aberta há mais de X horas, compra com
entrega prevista para hoje. O agente nunca conclui atividade.

---

## 9. Roadmap

- **Fase 0 — Colaboradores sem atividades.** `GET /api/collaborators` (default/byId/attention),
  página de equipe com lentes Vendas/Relacionamento/Atendimento, página 360 sem o bloco Agenda,
  redirects de Vendedores, ações de vínculo e convite. Entrega valor sozinha e não toca schema.
- **Fase 1 — Primitivo de atividades.** Schema (§7.4), Zod, `lib/activities/*`, rota
  `app/api/activities` (GET multi-modo, POST, PATCH, DELETE), permissões e capability, inbox,
  página `/dashboard/activities` (lista), modais.
- **Fase 2 — Agenda e hub.** Vista Agenda, `activities/agenda` mesclada, bloco Agenda na página
  360, seção do dia em Carteiras, três linhas no hub, lente Atividades no ranking e itens de
  atenção de atividades.
- **Fase 3 — Recorrência.** `activity_recurring_rules`, cron, modal `Nova rotina`, pausa
  automática, item de atenção de regra pausada.
- **Fase 4 — Agente e integrações.** Ferramenta `create_activity` para o agente; Google Calendar
  para a forma `Agenda`; tags, se o uso pedir classificação livre.

Pós-deploy da fase 1: `db:push`; da fase 3: registrar o cron `generate-recurring-activities`.

---

## 10. Riscos a vigiar

- **Duas agendas que divergem.** Se follow-up (interação) e atividade forem exibidos em telas
  diferentes, o colaborador perde uma delas. A agenda mesclada (§8.3) é obrigatória desde a fase 2,
  não opcional.
- **Atividade virando log de contato.** "Liguei para o cliente" registrado como atividade concluída
  não alimenta cadência nem influência. O modal de atividade com `clienteId` mostra o atalho
  "Foi um contato? Registrar interação" e o invariante §7.5.6 fecha o resto.
- **Recorrência gerando ruído.** Rotina diária que ninguém conclui vira 30 atrasadas. Instâncias
  de rotina atrasadas há mais de 7 dias são arquivadas pelo cron e a regra aparece no painel de
  atenção com "ninguém está concluindo".
- **Vigilância.** Nenhuma tela mostra "tempo até concluir" por pessoa. Se pedirem, a resposta é o
  agregado da equipe.
- **Tentação de tipar cedo.** O chip derivado vai parecer insuficiente em algum momento. O critério
  para portar `activity_types` é: o Control ter validado o modelo **e** existir aqui um caso que
  tags não resolvem.

---

## 11. Decisões em aberto

1. **Nome do menu**: `Colaboradores` (proposto) vs. `Equipe`. O hub já usa "Equipe" como tab;
   "Colaboradores" evita a colisão.
2. **Vendedor sem usuário pode ser responsável?** Proposta: não (§7.4). Alternativa seria
   `vendedorId` em `activity_responsibles` para atividades "de balcão" concluídas pelo gestor em
   nome do vendedor. Adiado até haver pedido.
3. **Arquivamento automático** de rotinas atrasadas (§10): 7 dias é chute; ajustar com dados.
4. **Onde vive a lente Atividades antes da fase 2**: escondida, não desabilitada.
