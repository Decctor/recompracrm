# Onboarding e ativação — análise com Revenue-Centric Design

Status: análise de 21/11/2026, a partir do código em `app/onboarding`, `lib/onboarding`, `components/Onboarding`, do hub em `app/dashboard/_hub` e de uma leitura agregada e anonimizada da base de produção (organizações criadas nos últimos 12 meses). Usa como referência o playbook [revenue-centric-design](https://github.com/heliocosta-dev/revenue-centric-design), em especial `references/onboarding-and-activation.md`. Complementa `onboarding-crm-erp-plan.md`, que continua sendo o plano de produto: esta análise não revoga suas regras de honestidade de estado (não dizer "tudo pronto", não prometer receita, não disparar envios sem liberação explícita).

## 1. Resumo

1. **O valor do CRM chega depois do fim do teste.** Entre as organizações que já enviaram uma campanha, a mediana até o primeiro envio é de **19,6 dias**. O teste grátis dura **15 dias** (`FREE_TRIAL_DURATION_DAYS`). Depois disso vêm mais 15 dias de carência (`TRIAL_GRACE`) até o bloqueio, mas a partir do D15 o selo do cabeçalho já diz "Teste encerrado. Regularize…". Metade das contas ouve "pague" antes de ver o produto funcionando.
2. **Quem envia campanha fica.** Das 26 organizações, 9 têm envios de campanha nos últimos 30 dias, e 8 delas também registraram vendas no período. Das 11 que nunca enviaram, só 3 registraram alguma venda nos últimos 30 dias, e 2 dessas 3 ainda estão dentro do teste. O comportamento que separa quem fica de quem some é **ter uma campanha enviando**, não concluir o onboarding.
3. **O vazamento está no meio, não no topo.** O onboarding em si é rápido (0–4 min nas jornadas recentes, com uma exceção de 85 min). O que demora é o trecho depois do botão "Entrar no RecompraCRM": conectar o WhatsApp oficial, aprovar templates, liberar a campanha. Esse trecho não tem nenhum acompanhamento.
4. **Depois do onboarding, o painel fica vazio.** `ActivationPanel` é importado em `app/dashboard/layout.tsx`, mas não é renderizado em lugar nenhum, e `OnboardingQualityBubble` também não. Quem entra cai no hub com "Nenhuma venda registrada ainda." e "Nenhum cliente segmentado ainda.", sem uma próxima ação.
5. **A plataforma fala com o lojista uma única vez.** Ela envia uma boas-vindas por WhatsApp, e só quando o onboarding é concluído (ver §6). Não há mensagem de retomada, de destravamento, de fim de teste nem de falha de pagamento: `invoice.payment_failed` só gera log. Quem fecha a aba no meio da configuração só volta se alguém do time lembrar dele.

Com ~2 cadastros por mês, a alavanca mais barata é juntar três coisas: um gatilho automático para cada ponto de travamento, uma mensagem curta ao lojista nesse momento e um alerta para o time agir pessoalmente. Automação pura ainda não se paga nesse volume; um *concierge* bem instrumentado se paga.

## 2. O que é "valor" e qual é a métrica norte

> Princípios: *Measure activation, not signups* · *Design onboarding as a behavioral trigger, not a feature tour* · *Map the whole journey to value*.

O playbook pede o comportamento que **estatisticamente separa** quem fica de quem some (o "7 amigos em 10 dias" do Facebook). Na nossa base esse comportamento é o envio de campanha:

| Grupo (26 orgs, últimos 12 meses) | Orgs | Com vendas nos últimos 30 dias |
| --- | --- | --- |
| Com envios de campanha nos últimos 30 dias | 9 | 8 |
| Já enviaram, mas pararam | 6 | 5 (vendas via integração; a parte de CRM parou) |
| Nunca enviaram campanha | 11 | 3 (2 ainda no período de teste) |

Proposta de definições, para instrumentar e mostrar no admin:

| Marco | Definição | Por quê |
| --- | --- | --- |
| **Primeiro valor** (micro-vitória) | Primeiro cashback creditado a um cliente real **ou** base importada com clientes segmentados. | Acontece em horas, e não em semanas. É o que dá para entregar dentro do primeiro dia. |
| **Ativação** (métrica norte) | Primeira mensagem de campanha **entregue** até o D14. | É o comportamento que separa retidos de perdidos na nossa base. |
| **Hábito** | Campanhas enviando em 3 das primeiras 4 semanas. | Distingue quem testou de quem incorporou o produto. |
| **Resultado** | Primeira recompra atribuída a uma campanha. | O "momento Stripe" do CRM. Deve ser celebrado (§5.6), não só registrado. |

Trocas de métrica (do playbook): "orgs criadas" → taxa de ativação; "onboarding concluído" → ativação no D14; "tempo médio de onboarding" (o que `getActivationMetrics` mede hoje) → **tempo até o primeiro envio**.

## 3. A jornada real, passo a passo

> Princípio: *Map the whole journey to value — then fix the biggest drop*. A versão "de cabeça" sempre parece mais curta.

| # | Passo | Onde | O que a base mostra |
| --- | --- | --- | --- |
| 1 | Cadastro (nome + e-mail, link mágico ou Google) | `app/auth/signup` | Curto, sem atrito desnecessário. |
| 2 | Escolha CRM ou ERP | `JourneyPicker` | Bom passo declarativo. |
| 3 | Empresa: logo, nome, endereço da loja online, CNPJ (obrigatório), e-mail, telefone, segmento, termos | `CompanyStage` | O passo mais pesado. Mistura dados administrativos com o único dado declarativo (segmento). |
| 4 | Fonte de vendas (Bling/Nuvemshop ou balcão) | `DataSourceStage` | A importação roda em segundo plano. |
| 5 | Cashback (preset por segmento) | `CashbackStage` | Bom: mostra uma prévia concreta ("Uma compra de R$ 100 gera…"). |
| 6 | Campanhas sugeridas | `CampaignsStage` | Bom: são poucas e já trazem a mensagem pronta. |
| 7 | WhatsApp oficial (Meta) + pagamento + templates | `WhatsappStage` | Pode ser adiado ("Continuar sem conectar"). É o caminho crítico do valor. |
| 8 | Entrada: estado real + próxima ação | `EntryStage` | Honesta, mas sem celebração e sem número de impacto. |
| 9 | Hub `/dashboard` | `app/dashboard/_hub` | Painel vazio; o painel de ativação não aparece. |
| 10 | Conectar a Meta (dias depois) | Configurações | Tempo do cadastro até a primeira conexão nas contas de ago–out: 8 a 69 dias. |
| 11 | Templates aprovados + campanha liberada | Configurações / Campanhas | Sem aviso proativo ao lojista. |
| 12 | **Primeira mensagem entregue** | — | **Mediana de 19,6 dias** (de 0 a 153). |
| — | Teste termina (D15) | `/subscription` | Paywall genérico, sem lembrar o que a loja construiu. |

Das jornadas novas (`organization_onboardings`), uma conta de mercado concluiu o CRM em 4 minutos adiando cashback, campanhas e WhatsApp. Hoje ela tem 2 vendas nos últimos 30 dias e nada configurado. É o caso do *silent non-activation*: a conta não cancela, simplesmente evapora.

**Maior queda:** entre os passos 8 e 12. É ali que precisam entrar os gatilhos, a interface e as mensagens desta análise.

## 4. Diagnóstico por princípio

Cada item segue a ordem: o que existe hoje → princípio do playbook → movimento proposto.

### 4.1. O painel pós-onboarding não aparece — *Never ship a blank dashboard*

- **Hoje:** `ActivationPanel` (com próxima ação, progresso de importação e dependências das campanhas) e `getOnboardingQuality` estão prontos, mas nenhum dos dois é renderizado. O hub mostra estados vazios passivos.
- **Movimento:** renderizar a ativação no hub para organizações **não ativadas** (definição do §2), como um bloco de atenção. Cabe na convenção do hub ("attention hub, not analytics"), sem filtros. Uma única ação principal, que é `readiness.proximaAcao`. Os vazios do hub passam a apontar para a ação que os preenche ("Nenhum cliente segmentado ainda" → "Conecte seu sistema ou registre a primeira venda no balcão").
- **Progresso iniciado (*Progress / started-progress effect*):** contar cadastro, segmento e jornada concluída como etapas feitas. O lojista entra no painel com ~30% já preenchido, em vez de começar do zero.

### 4.2. O tempo até o valor passa do teste — *Tie the trial's end to value consumed, not the calendar*

- **Hoje:** 15 dias corridos a partir do cadastro, mais 15 de carência até o bloqueio (`resolveSubscriptionAccess`). A mediana até o primeiro envio (19,6 dias) cai dentro da carência. Ou seja, o acesso dura o bastante, mas a comunicação do teste conta outra história: a partir do D8 o selo entra em modo de aviso, e a partir do D15 ele diz que o teste acabou. A espera, em boa parte, é externa (Meta) e não do lojista.
- **Movimento (decisão comercial, ver §8):** o mais barato é **mudar a narrativa, não o prazo**. Enquanto a conta não estiver ativada e a pendência for externa, o selo e as mensagens falam do próximo passo ("Falta a aprovação da Meta para sua primeira campanha sair"), e não do relógio. Alternativa mais forte: o teste passa a contar **do primeiro envio** (com teto, por exemplo 30 dias a partir do cadastro), ou é estendido automaticamente enquanto a pendência for da Meta (template em análise, pagamento verificado). O plano original já lista "tratamento comercial do período de teste quando dependências externas atrasarem a ativação" como definição pendente; os dados mostram que essa é a regra, não a exceção.
- **Tela de fim de teste (`/subscription`):** trocar o bloqueio genérico por um resumo do que a loja construiu, em enquadramento de perda (*Architect for what users fear losing*): "Você tem 1.284 clientes importados, 3 campanhas preparadas e R$ 412 em cashback ativo com 57 clientes. Assinando, nada disso para." Usar números exatos (*Use precise numbers*).

### 4.3. O WhatsApp é o caminho crítico, mas aparece como opcional — *Cut TTV by reorder, not features*

- **Hoje:** é a 5ª de 6 etapas, com "Continuar sem conectar" no botão principal. A aprovação dos templates só começa depois da conexão. É a etapa com mais espera externa, e fica para o fim.
- **Movimento:**
  1. **Inverter a ordem dos trabalhos lentos:** pedir a conexão Meta logo depois da fonte de dados, para que a revisão da Meta corra **em paralelo** ao cashback e às campanhas (o mesmo raciocínio que o plano já aplica à importação em segundo plano).
  2. Submeter os templates das campanhas sugeridas assim que o número conecta, sem esperar o lojista abrir Configurações.
  3. **Conexão assistida:** "Prefere que a gente conecte com você? 15 minutos por videochamada", com agendamento ou WhatsApp direto do time. Com 2 cadastros por mês, uma chamada por conta se paga. É o *friction in the right place* do playbook (Superhuman exige uma chamada antes do acesso).
  4. Rebaixar o texto do botão: "Continuar sem conectar" vira ação secundária. A principal continua sendo conectar.
- **Hipótese a decidir:** a única conta que começou pelo QR Code enviou no D5. A amostra é pequena demais para concluir algo, e o plano de produto tirou o QR do caminho principal de propósito. Se for usado, deve ser só como ponte temporária para a campanha de boas-vindas enquanto a Meta aprova.

### 4.4. A etapa "Empresa" pede dados administrativos cedo demais — *Add declarative friction, cut administrative friction*

- **Hoje:** logo, endereço da loja online (irrelevante na jornada CRM), CNPJ obrigatório, e-mail e telefone, tudo antes do primeiro valor. O único dado que muda o percurso é o segmento.
- **Movimento:**
  - **Cortar ou adiar:** logo (pedir quando o lojista for personalizar a mensagem ou o Ponto de Interação), slug (gerar automaticamente e esconder no CRM) e e-mail corporativo (usar o do usuário). O CNPJ fica para quando um contrato realmente precisar dele (Meta, fiscal, cobrança). Antes de mexer, revisar o que é obrigatório nos contratos atuais, como o próprio plano exige.
  - **Pedir com propósito:** o **WhatsApp do responsável** já existe em 24 das 26 contas (`users.telefone`, usado no código de login e nas boas-vindas). O que falta é o **consentimento explícito** para receber avisos da configuração, e uma forma de sair, já que é o canal das mensagens do §5. Na etapa "Empresa", o campo "Telefone ou WhatsApp" (`organizations.telefone`) é da loja e pode ficar para depois.
  - **Expandir o declarativo:** adicionar uma pergunta de intenção de ~30 segundos (o caso brasileiro do playbook: de 24,2 para 2,5 dias até a primeira venda **adicionando** uma etapa de intenção): "O que mais te incomoda hoje?" (clientes que compram uma vez e somem · clientes antigos que pararam de vir · quero que comprem com mais frequência). A resposta escolhe a campanha recomendada e o texto das mensagens.

### 4.5. O teste não tem objetivo — *Give the trial an active goal* · *Calibrate the first step*

- **Hoje:** o teste é acesso passivo.
- **Movimento:** ao terminar a etapa de campanhas, propor uma meta pequena e fechável (*small-steps effect*): "Meta do teste: trazer de volta 10 clientes em 14 dias." Um contador no hub mostra as recompras atribuídas, e essa meta orienta as mensagens de progresso (§5.8). Evitar metas do tamanho de uma operação ("configure 5 campanhas"), que paralisam.

### 4.6. A entrada confirma, mas não celebra — *Celebrate the activation moment* (peak-end rule)

- **Hoje:** `EntryStage` lista estados com selos. É correto, mas o momento de maior curiosidade passa sem um número que impressione.
- **Movimento:** quando a importação trouxer dados, a entrada passa a abrir com o número da própria loja, como o hub já faz: "**312 clientes** não compram há mais de 60 dias. Juntos, gastavam **R$ 18.430** por trimestre." A primeira mensagem entregue e a primeira recompra atribuída ganham um momento próprio, no painel e por mensagem (§5.6–5.7). Os números são sempre reais; sem dados suficientes, não se mostra estimativa (regra do plano).

### 4.7. Não sabemos onde o lojista trava dentro da etapa — *Map the journey from session replays*

- **Hoje:** os eventos `onboarding_stage_viewed` / `_completed` vão para o PostHog. Houve uma jornada de 85 minutos, e não sabemos em qual etapa.
- **Movimento:** ligar a gravação de sessão do PostHog em `/onboarding` e nas telas de conexão Meta. Assistir às 5 próximas sessões e comparar com a tabela do §3. Adicionar ao admin (`getActivationMetrics`) o tempo até o primeiro envio, a taxa de ativação no D14 e a etapa de parada por conta.

### 4.8. Contas pagantes sem uso — *Treat sub-30-day churn as an onboarding fix*

Há pelo menos uma conta com assinatura Stripe `active` e **nenhuma venda registrada desde o cadastro**, além de contas da carteira de consultoria sem venda nenhuma. São cancelamentos que ainda não chegaram ao Stripe. O alerta interno do §5.10 serve para pegá-los antes da próxima cobrança.

### 4.9. ERP

As duas jornadas ERP recentes de contas novas concluíram em 0–2 min (uma adiou a simulação), venderam na primeira semana e estão sem vendas nos últimos 30 dias. Vale a mesma lógica com outro marco norte: **uso recorrente do canal escolhido na semana 2**. O detalhamento fica fora do escopo desta análise.

## 5. Comunicação de ativação: e-mail e WhatsApp por gatilho

> Princípios: *Make onboarding active, not passive* · Zeigarnik (loop aberto) · *Trial conversion is a journey problem* ("lost to life" → mensagem de progresso, não "seu teste acaba") · *Reinforce the decision the user just made*.

Regras da sequência:

- **Cada mensagem nasce de um estado real** (`getOnboardingReadiness`), nunca de um calendário fixo, e é cancelada se o estado já mudou.
- **Uma ação por mensagem**, com link direto (`/onboarding?retomar=true&etapa=…` ou `proximaAcao.href`).
- **WhatsApp para o que é urgente ou celebrável; e-mail para resumo e registro.** O varejo local vive no WhatsApp; o e-mail é o canal de apoio.
- **Teto:** no máximo 1 mensagem por dia e 4 por semana ao lojista. Silêncio total depois que a conta ativa, exceto nas celebrações e nos alertas de falha.
- **Todo gatilho de travamento também avisa o time** (§5.10). A mensagem ao lojista abre a porta; a pessoa do time é quem fecha.

| # | Gatilho (estado) | Quando | Canal | Mensagem (rascunho) | Ação |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Organização criada (**hoje: só na conclusão**) | Imediato | E-mail + WhatsApp | "Bem-vindo ao RecompraCRM, {nome}! Sua loja já está criada. O próximo passo leva 3 minutos: {próxima etapa}." | Retomar onboarding |
| 5.2 | Jornada aberta e parada | +2 h, depois +24 h | WhatsApp, depois e-mail | "Você parou em *Cashback*. Faltam 3 etapas, uns 4 minutos. Suas respostas estão salvas." | Retomar na etapa |
| 5.3 | Importação concluída (ou primeira janela coberta) | Imediato | WhatsApp | "Sua base chegou: 1.284 clientes. 312 deles não compram há mais de 60 dias. Veja quem são." | Hub / audiência |
| 5.4 | Campanhas preparadas e WhatsApp não conectado | D1 e D3 | WhatsApp + e-mail | "Suas 3 campanhas estão prontas. Só falta conectar o número oficial. Quer que a gente faça com você em 15 min?" | Conectar Meta / agendar |
| 5.5 | Template aprovado, campanha `PRONTA` | Imediato | WhatsApp | "A Meta aprovou *Boas-vindas*. Libere com um toque e ela começa a enviar." | Liberar campanha |
| 5.5b | Template rejeitado, pagamento Meta pendente, integração expirada (**hoje: só "WhatsApp desconectado", por e-mail**) | Imediato | WhatsApp + e-mail | O texto de `resolveNextAction` ("A Meta recusou um envio por falta de forma de pagamento…"). | `proximaAcao.href` |
| 5.6 | Primeira mensagem de campanha entregue (**ativação**) | Imediato | WhatsApp | "🎉 Sua primeira campanha saiu: 48 clientes receberam *Boas-vindas* hoje." | Ver resultados |
| 5.7 | Primeira recompra atribuída | Imediato | WhatsApp | "Um cliente que recebeu sua mensagem voltou e comprou R$ 87, 6 dias depois. É o RecompraCRM trabalhando." | Resultados da campanha |
| 5.8 | Progresso no teste | Semanal (segunda de manhã) | E-mail | "Semana 1: 2 campanhas enviando, 131 mensagens entregues, 4 clientes voltaram (meta: 10)." | Hub |
| 5.9 | Teste terminando / pagamento falhou (`invoice.payment_failed`) | D-3 e D-1 / imediato | E-mail + WhatsApp | **Ativado:** resumo do que foi construído, em enquadramento de perda (§4.2). **Não ativado:** oferecer extensão ou ajuda, não o paywall. | Assinar / falar com o time |
| 5.10 | Sinais para o time (interno; **hoje: só "nova organização", na conclusão**) | Imediato | WhatsApp do time | Org criada sem concluir em 2 h · parado na etapa X há 24 h · WhatsApp não conectado no D3 · sem envio no D10 · conta pagante sem venda há 14 dias · integração com erro. | Contato humano |

Os textos são rascunhos com números ilustrativos. Na implementação, os números vêm da conta e, quando não houver dado, a frase não é enviada.

## 6. Infraestrutura de comunicação existente

A boa notícia é que todos os canais já existem. O que falta são os gatilhos.

| Canal | Onde | Usado hoje para falar com o lojista |
| --- | --- | --- |
| E-mail (Resend + React Email) | `lib/email/index.tsx` (`sendEmailWithResend`), templates em `services/resend/templates/` | Link de acesso (`MagicLink`), convite (`OrganizationInvite`). Avisos em texto/HTML avulso: WhatsApp desconectado (`lib/whatsapp/connection-health.ts`, cron a cada 6 h), 80% do limite do agente de IA, pendências fiscais diárias. |
| WhatsApp oficial da plataforma (Meta, templates) | `lib/whatsapp/platform-sender.ts` (`getPlatformWhatsappSender`) | Código de acesso (`recompracrm_verification_code`), convite, relatório de vendas recorrente (`recompracrm_relatorio_recorrente`), transferência de atendimento. |
| WhatsApp interno (gateway, texto livre) | `lib/whatsapp/internal-gateway`, sessão `INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS` | Boas-vindas ao dono (`welcomeOrganizationOwnerOnOnboarding`, `config/onboarding.tsx`) e alerta de nova organização aos fundadores (`notifyInternalsOnNewOrganization`, `config/internal-coms.ts`), ambos só na **conclusão** do onboarding (`app/api/organizations/onboarding/route.ts`). |
| Crons | `vercel.json` (34 crons) | Nenhum cron de ativação, retomada, fim de teste, inatividade ou saúde de conta. `subscription-reconciliation` só sincroniza com o Stripe. |
| Notificações no app | — | Não há tabela de notificações nem sino; os toasts são efêmeros. Teste e cobrança aparecem só no selo do cabeçalho (`SubscriptionStatusBanner`, texto em `/api/organizations/subscription-status`). |
| Eventos | PostHog (`lib/analytics/posthog-*.ts`, `lib/onboarding/analytics.ts`) | Etapas, adiamentos, conclusão, importação, campanha preparada/habilitada/ativada e pagamento Meta confirmado. Sem `identify`/grupos, e o `distinctId` alterna entre usuário e organização. O `campaign_ready` previsto no design não é emitido. |

O que isso muda na implementação:

- **Boas-vindas na hora errada.** O texto diz "Que legal ver que você **iniciou** o onboarding", mas a mensagem só sai na conclusão. Quem abandona no meio nunca a recebe, e o alerta aos fundadores tem o mesmo problema. Mover os dois para a criação da organização (`app/api/organizations/route.ts`) já cobre parte de 5.1 e 5.10 com mudanças de poucas linhas.
- **Mensagens fora da janela de 24 h** (retomada, destravamento, celebração) precisam de templates de *utilidade* no número oficial, como os `recompracrm_*` que já existem. O gateway interno serve às respostas dentro de uma conversa aberta e aos alertas internos.
- **Gatilhos por estado:** a recomendação é que a régua viva no Syncroniza Control (§9), e não num motor novo aqui. Se ficar no RecompraCRM, o desenho seria um cron diário (ou horário) que percorre as organizações não ativadas, calcula `getOnboardingReadiness` e decide a mensagem pela tabela do §5. Ele grava o que já enviou para não repetir, como `connection-health-policy.ts` já faz com seu intervalo de 7 dias. Os gatilhos imediatos (template aprovado, primeiro envio entregue, primeira recompra) entram nos pontos onde o estado muda (`lib/onboarding/reconcile.ts`, webhooks da Meta, atribuição).
- **Stripe:** `invoice.payment_failed` e `customer.subscription.deleted` hoje só atualizam campos ou geram log. São o lugar natural para o aviso de pagamento e para a mensagem de saída (*Design the cancel screen*).
- **Medição:** padronizar o `distinctId` (organização como grupo no PostHog) antes de construir o funil do §2. Sem isso, as etapas do cliente e os eventos do servidor não se juntam.

## 7. Roteiro priorizado

| Prioridade | Item | Esforço | Mexe em |
| --- | --- | --- | --- |
| P0 | Renderizar a ativação no hub para contas não ativadas; vazios do hub com ação (§4.1) | Baixo (componentes existem) | Primeiro dia |
| P0 | Mover boas-vindas e alerta aos fundadores para a criação da org; somar alertas de travamento (§5.10, §6) | Baixo | Todo o meio do funil |
| P0 | Definir e medir ativação (primeiro envio até o D14) e tempo até o primeiro envio no admin (§2, §4.7) | Baixo | Saber se o resto funciona |
| P0 | Quadro "Ativação RecompraCRM" no Control + sincronização de estágio a partir da prontidão (§9.3–9.4) | Médio | Medição do funil e base da régua |
| P1 | Mensagens 5.1, 5.2, 5.4, 5.5, 5.5b como workflows do Control (retomada e destravamento do WhatsApp) | Médio | Passos 8–11 |
| P1 | Conexão Meta mais cedo + submissão automática de templates + conexão assistida (§4.3) | Médio | Maior espera da jornada |
| P1 | Teste ligado ao valor e tela de fim de teste com resumo de perda (§4.2) | Médio (decisão comercial) | Conversão do teste |
| P2 | Celebrações 5.3, 5.6, 5.7 e número de impacto na entrada (§4.6) | Médio | Memória do produto |
| P2 | Pergunta de intenção, meta do teste e progresso semanal (§4.4, §4.5, §5.8) | Médio | Compromisso |
| P2 | Etapa "Empresa" enxuta + WhatsApp do responsável com consentimento (§4.4) | Médio (revisar contratos) | Atrito inicial |
| P2 | Gravação de sessão em `/onboarding` (§4.7) | Baixo | Diagnóstico |

## 8. Decisões que precisam de dono

0. **Onde vive a régua:** confirmar o Control como motor do ciclo de vida (§9) e qual parceiro/quadro recebe as contas.
1. **Regra do teste:** contar a partir do primeiro envio, estender durante pendência da Meta ou manter os 15 dias com extensão manual.
2. **Templates de utilidade** no número oficial da plataforma (o mesmo dos `recompracrm_*`) para retomada, destravamento e celebração: quais submeter à Meta primeiro.
3. **Consentimento:** onde coletar o opt-in do responsável e como sair (LGPD).
4. **Concierge:** quem do time recebe os alertas do §5.10 e qual é o tempo de resposta esperado.
5. **QR Code como ponte** enquanto a Meta aprova: sim ou não (§4.3).

## 9. Syncroniza Control como motor do ciclo de vida

O Syncroniza Control já é o CRM da própria Syncroniza e tem quase tudo o que a régua do §5 precisa. A divisão proposta é esta:

> **O RecompraCRM decide o estado; o Control decide a conversa.**
>
> A prontidão e a ativação continuam calculadas aqui (`getOnboardingReadiness`), a única fonte de verdade. Quem fala com o lojista, quando, por qual canal e qual pessoa do time assume é decidido nos workflows do Control. Não se constrói um segundo motor de régua no RecompraCRM.

### 9.1. O que o Control já oferece

| Recurso | Onde (syncroniza-control) | Uso na ativação |
| --- | --- | --- |
| Workflows com gatilho, espera, condição e ação | `src/lib/workflows/catalog.ts`, `src/server/workflows/` | A régua inteira do §5. |
| Gatilhos úteis | `oportunidade_entrou_estagio`, `oportunidade_parada` (dias no estágio), `data_entidade_relativa` (ex.: fim do teste), `cliente_sem_resposta`, `cliente_respondeu_whatsapp`, `lead_ficou_quente` | Travamento, prazo do teste, follow-up e celebração na entrada de estágio. |
| Esperas | `duracao_fixa`, `dias_uteis`, `ate_horario_comercial` | "+2 h, depois +24 h", sem mensagem de madrugada. |
| Ações | `enviar_template_mensagem` (**WhatsApp e e-mail**), `enviar_mensagem_ia`, `executar_agente`, `criar_atividade`, `enviar_notificacao_interna`, `atualizar_campo_entidade` | A mensagem ao lojista, a tarefa para o CS e o alerta ao time, no mesmo fluxo. |
| Antispam | Condições de saída (`cliente_respondeu_whatsapp`, mudança de estágio), chave de evento ancorada, teto de mensagens sem resposta e dedupe de template (`docs/chat-inactivity-trigger-plan.md`) | O teto de mensagens do §5 já vem pronto. |
| Hub de atendimento | `chats` + agente de IA | A resposta do lojista cai numa conversa atendida, não num número de disparo. |
| Funil e tempo por estágio | `get_commercial_analytics` (`funil_pipeline`, `tempo_medio_por_estagio`) | O mapa de quedas do §3, recalculado sem SQL avulso. |
| Tracking, atribuição e lead score | `packages/tracking-sdk`, `/api/track`, `src/lib/scoring/lead-score.ts` | Liga a origem do anúncio à ativação, não só ao cadastro. |
| API e MCP | `POST /api/v1/opportunities` (idempotente, `referenciaExterna`); MCP com Bearer: `update_opportunity`, `move_opportunity_stage`, `log_interaction`; categoria de acesso `SERVIDOR_EXTERNO` | Integração servidor a servidor. |

### 9.2. O que já está ligado hoje

- `MarketingTrackingScript` carrega o `control.js` em todo o site, exceto `/dashboard`, `/admin-dashboard`, `/shop` e o Ponto de Interação, e faz `identify` com usuário e organização. Isso inclui `/onboarding`.
- `captureClientEvent` repassa ao Control só os eventos com `controlEvent`: o `lead` no cadastro e os `lead`/`contact` dos CTAs.
- **Depois do cadastro, o Control fica cego.** Ele não recebe organização criada, etapa do onboarding, WhatsApp conectado, primeiro envio, fim do teste nem assinatura. O funil comercial termina onde a ativação começa.

### 9.3. Modelo: quadro "Ativação RecompraCRM"

Cada conta vira um cliente (o responsável) e uma oportunidade no parceiro Syncroniza, com `referenciaExterna = organizacaoId`. Os estágios são **derivados** da prontidão; ninguém os move à mão.

> **Atualização (21/11):** o parceiro **RecompraCRM** no Control já tem dois quadros desenhados pelo time e que devem ser reaproveitados. O **"Funil Comercial RecompraCRM"** (Novo Lead > Qualificação > Teste grátis > Negociação > Fechado > Nutrição) faz a visão comercial. O **"SUCESSO DO CLIENTE"**, vazio hoje, tem estágios que já são os marcos de ativação (Boas vindas … Primeira venda > Primeira Campanha realizada > Primeiro Cashback/giftback resgatado > Primeiro mês de Uso > NPS). O mapeamento estágio ↔ prontidão, as regras de sincronização (só avança, não toca estágios manuais) e a proposta de um estágio "WhatsApp oficial conectado" estão em `syncroniza-control/docs/public-api-v1-plan.md` §4. A tabela abaixo continua valendo como desenho dos workflows por momento.

| Estágio | Entra quando (estado no RecompraCRM) | Workflows do estágio | Sai quando |
| --- | --- | --- | --- |
| Cadastro | Usuário criado, sem organização | 5.1; aviso ao time se não criar a org em 2 h | Org criada |
| Onboarding em andamento | Org criada, jornada aberta | 5.2 (+2 h WhatsApp, +24 h e-mail); `criar_atividade` para o CS se parado há 24 h | Jornada concluída |
| Preparado, sem canal | Concluído, WhatsApp ≠ `CONECTADO` | 5.4 no D1 e D3; `oportunidade_parada` (3 dias) cria a atividade "conexão assistida" | Número conectado |
| Aguardando Meta | Conectado; template em análise ou pagamento pendente | 5.5 quando `PRONTA`, 5.5b quando rejeitado ou pendente | Primeira mensagem entregue |
| **Ativado** | Primeira mensagem de campanha entregue | 5.6 na entrada; 5.3 e 5.7 | Envios em 3 das primeiras 4 semanas |
| Hábito | Uso recorrente | 5.8 semanal; `data_entidade_relativa` sobre "fim do teste" dispara 5.9 | Assinou |
| Fechado | Ganho: assinatura `active` (Stripe). Perdido: bloqueado sem assinar, com motivo "não ativou" ou "ativou e não assinou" | Boas-vindas de cliente; pesquisa de perda | — |
| Nutrição | Ativou e parou de enviar por 14 dias | Reengajamento + atividade para o CS | Voltou a enviar |

Campos personalizados da oportunidade (variáveis das mensagens e das condições): fim do teste, plano, segmento, fonte de dados, etapa atual, campanhas ativas, envios em 7 dias, recompras atribuídas e consultoria ativa. Com eles, `tempo_medio_por_estagio` vira o painel semanal do §2 sem nenhum trabalho a mais.

### 9.4. Como os dois conversam

> **Implementado (21/11).** Do lado do Control, a onda 1 da API pública (PR #120 em `syncroniza-control`). Do lado do RecompraCRM:
>
> - `services/control` (cliente da API);
> - `lib/control/lifecycle.ts` (marcos e regras, com testes);
> - `lib/control/sync.ts`;
> - ganchos na criação da organização e no onboarding;
> - cron horário `/api/cron/control-lifecycle`, que também faz o backfill.
>
> A sincronização fica desligada até `CONTROL_API_KEY` ser configurada. Convenções em `CLAUDE.md` § *Syncroniza Control Lifecycle Sync Conventions*.

1. **Uma única função de sincronização no RecompraCRM**, por exemplo `syncControlLifecycle({ organizationId })`. Ela lê a prontidão, calcula estágio e campos e chama o Control de forma idempotente: cria a oportunidade pela API v1 com `referenciaExterna` e depois move o estágio ou atualiza os campos. Só envia quando algo mudou.
2. **Pontos de chamada (todos já existem):**
   - criação da organização (`app/api/organizations/route.ts`);
   - progresso e conclusão do onboarding;
   - `lib/onboarding/reconcile.ts` (campanha ativada);
   - callback da conexão Meta e webhooks de status de template;
   - `import_job_completed`;
   - webhook do Stripe;
   - um cron diário para corrigir desvios e atualizar os contadores.
3. **Uma chamada que falha não trava o produto.** O próximo gatilho ou o cron diário reconcilia, com o mesmo padrão "navegação não pode travar por falha de persistência" que `onboarding-page.tsx` já usa.
4. **Migrar o que hoje sai pelo gateway interno:** a boas-vindas ao dono e o alerta de nova organização, com os números dos fundadores fixos em `config/internal-coms.ts`, viram workflows do estágio "Onboarding em andamento". Assim, as respostas passam a cair no hub do Control.

### 9.5. Lacunas no Control

As lacunas 1–3 viraram a onda 1 do plano da API pública do Control (`syncroniza-control/docs/public-api-v1-plan.md`): referências externas, rotas de leitura e atualização, `POST /api/v1/events` e o gatilho `evento_recebido`.

1. **Mudar estágio e campos servidor a servidor.** A API v1 só cria oportunidades. O MCP cobre `move_opportunity_stage` e `update_opportunity`, mas é a superfície dos agentes. Recomendo `PATCH /api/v1/opportunities/{id}` (ou por `referenciaExterna`) com o mesmo modelo de escopo e idempotência do POST.
2. **Eventos de produto servidor a servidor.** `/api/track` é de navegador: com domínios autorizados configurados, uma requisição sem `Origin` é recusada (`isOriginAllowed`). Falta uma ingestão com chave secreta, para que `org_criada`, `primeiro_envio` e `primeira_recompra` entrem no perfil, no lead score e no funil.
3. **Gatilho por evento ou por campo.** Hoje um workflow nasce de estágio, data, chat ou proposta. Um gatilho genérico, "evento recebido" ou "campo alterado", deixa a celebração 5.7 (primeira recompra) e os alertas 5.5b fora do quadro de estágios. Também serve aos outros parceiros do Control.
4. **Consentimento e saída** do responsável para mensagens de ativação (LGPD): verificar como o Control registra opt-out por cliente antes de ligar a régua.

### 9.6. O que fica no RecompraCRM

- **Interface no app:** painel de ativação no hub, entrada do onboarding, selo do teste e tela `/subscription` (§4.1, §4.2, §4.6).
- **Mensagens transacionais e operacionais** que não são régua: código de acesso, convite, "WhatsApp desconectado", pendências fiscais e relatório recorrente.
- **O cálculo da ativação:** o Control recebe o resultado, nunca recalcula.

## 10. Limites desta análise

- **Amostra pequena:** são 26 organizações, e só 6 passaram pelo onboarding novo (`organization_onboardings`). As demais são anteriores a ele ou entraram por deal/consultoria. Os números do §2–3 apontam direção; não são estatística.
- **Correlação não é causa:** quem envia campanha pode ficar porque já era a conta mais engajada. O teste é ver se encurtar o tempo até o primeiro envio aumenta a retenção das próximas coortes.
- **Leitura feita no banco de produção, apenas agregada e anonimizada:** organizações aparecem por número de ordem, sem nomes. "Vendas" conta registros com `data_venda` posterior ao cadastro; "envio de campanha" conta `interactions` com `campanha_id`.
