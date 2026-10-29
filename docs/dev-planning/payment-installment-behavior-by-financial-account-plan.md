# Planejamento — Parcelamento por conta financeira

**Status:** Planejado; implementação não iniciada  
**Data:** 29/10/2026

## Objetivo e diagnóstico

Separar o parcelamento contratado pelo cliente do comportamento de geração das
transações financeiras. A regra pertence à combinação de conta financeira e
método de pagamento, sem exigir uma decisão do operador durante o checkout.

Hoje, `lib/payments/providers/local.ts` gera parcelas mensais pendentes para
cartão de crédito parcelado sem terminal integrado, mesmo quando o pagamento
foi informado como imediato. No terminal integrado, uma única transação fica
pendente até a aprovação, que efetiva o total. Essa diferença gera pendências
indevidas para pagamentos já aprovados em maquininhas externas.

## Decisões acordadas

- A conta financeira representa as condições de operação da provedora. A regra
  é específica da conta e do método, não apenas da categoria da conta.
- O operador escolhe método, conta, valor, parcelas e terminal quando aplicável.
  Não escolhe nem sobrescreve o comportamento das parcelas no checkout.
- O servidor resolve as condições a partir da configuração persistida.
- As transações guardam uma cópia das condições aplicadas. Alterar a conta não
  recalcula operações anteriores.
- Gerar uma transação única não significa aprovar automaticamente uma cobrança.
  A confirmação do pagamento continua sendo uma decisão separada.
- Quitação pelo cliente e disponibilidade do dinheiro após repasse são conceitos
  separados. Repasses futuros não devem virar cobranças contra o cliente.

## Alterações propostas nos esquemas

### 1. Enum de comportamento

Adicionar em `schemas/enums.ts` o `PaymentInstallmentBehaviorEnum`:

```ts
z.enum(["TRANSACAO_UNICA", "TRANSACOES_PARCELADAS"])
```

Os valores descrevem a geração de transações, independentemente do estado de
aprovação. Como ficam em JSONB nesta proposta, não exigem um pgEnum novo.

### 2. Configuração por método na conta financeira

Em `schemas/financial.ts`, criar
`FinancialAccountPaymentMethodConfigurationSchema` e acrescentar um bloco
comum `recebimentos` às variantes de `FinancialAccountConfigurationSchema`.
Exemplo ilustrativo do contrato, não código completo de validação:

```ts
configuracao: {
  categoria: "BANCO",
  // Dados existentes da categoria...
  recebimentos: {
    metodos: [
      {
        metodo: "CARTAO_CREDITO",
        comportamentoParcelas: "TRANSACAO_UNICA",
      },
      {
        metodo: "CARTAO_DEBITO",
        comportamentoParcelas: "TRANSACAO_UNICA",
      },
    ],
  },
}
```

Validar a unicidade do método dentro de cada conta. Definir explicitamente na
migração a configuração dos métodos utilizados; ausência não pode resultar em
uma escolha silenciosa de comportamento pelo cliente. Métodos elegíveis e a
política para contas legadas devem ser fechados antes da ativação da regra.

`financialAccounts.configuracao` já é JSONB tipado com
`TFinancialAccountConfiguration`: não é necessária uma nova coluna na conta.
Será necessário atualizar seus schemas, defaults, leitura e gravação.
Defaults Zod não preenchem automaticamente JSONB lido diretamente pelo Drizzle.

A categoria existente `CARTAO_CREDITO` representa o cartão da própria empresa,
com limite e ciclo de fatura. Não reutilizá-la como categoria de adquirente.

### 3. Condições e agrupamento nas transações

Em `services/drizzle/schema/financial.ts`, acrescentar a
`financialTransactions`:

```ts
grupoPagamentoId: varchar("grupo_pagamento_id", { length: 255 }),
condicoesRecebimento: jsonb("condicoes_recebimento")
  .$type<TPaymentReceiptConditions | null>(),
```

Adicionar os campos correspondentes ao `FinancialTransactionSchema` e definir
`PaymentReceiptConditionsSchema` em `schemas/financial.ts`, exportando o tipo
`TPaymentReceiptConditions`. Contrato inicial:

```ts
{
  versao: 1,
  comportamentoParcelas: "TRANSACOES_PARCELADAS",
  intervaloMeses: 1,
}
```

Para transação única, `intervaloMeses` pode ser nulo; para transações parceladas,
deve ser inteiro positivo. Os campos existentes `metodo`, `contaFinanceiraId`,
`parcela` e `totalParcelas` continuam sendo utilizados, sem duplicação no JSON.

`grupoPagamentoId` é gerado no servidor por pagamento de origem; todas as suas
parcelas compartilham o identificador. Criar índice composto por organização e
grupo. O grupo não é único por linha e não substitui uma chave de idempotência
da operação. Duas divisões de pagamento na mesma venda recebem grupos distintos.

As novas colunas começam anuláveis para preservar registros históricos e
transações de outros fluxos. Novos pagamentos processados pelo fluxo resolvido
devem gravar grupo e condições obrigatoriamente.

### 4. Separar entrada do checkout e pagamento resolvido

`TCheckoutPaymentSplit` e `CheckoutPaymentSplitSchema` continuam representando
a intenção enviada pela interface. Não adicionar `condicoesRecebimento` ao
estado editável ou ao contrato de entrada do checkout.

Criar `TResolvedPaymentSplit` para o processamento interno, com conta financeira
resolvida e `condicoesRecebimento` obrigatória. Adaptar `TProcessPaymentsInput`
e o provider para consumir esse tipo após a resolução no servidor.

Fluxo: entrada validada → conta resolvida → configuração consultada e validada
→ pagamento interno resolvido → geração das transações e cópia das condições.
O processamento não deve consultar novamente a configuração para cada parcela.

O terminal selecionado continua no estado do checkout. Evidência de aprovação
da integração determina a efetivação; restrições do terminal são validadas no
servidor e não criam um controle de comportamento para o operador.

### 5. Configuração da organização

Manter em `OrganizationPaymentMethodDefaultsSchema`, em
`schemas/organizations.ts`, conta padrão, possibilidade de trocar a conta,
disponibilidade do método e limites de parcelamento. Não duplicar ali a nova
regra de comportamento.

Nesta etapa, o intervalo já existente na configuração organizacional pode
fornecer o espaçamento, copiado para as condições aplicadas. Taxas e agendas
próprias da provedora ficam para uma evolução posterior.

## Comportamento esperado

Para R$ 600 em três parcelas:

- `TRANSACAO_UNICA`: uma transação de R$ 600, `parcela: null` e
  `totalParcelas: 3`. Se confirmada, fica efetivada; caso contrário, aguarda
  confirmação pelo total.
- `TRANSACOES_PARCELADAS`: três transações de R$ 200, `parcela` de 1 a 3,
  `totalParcelas: 3`, vencimentos individuais e o mesmo grupo. Cada parcela
  permanece pendente até sua baixa individual.

O backend deve definir combinações válidas com `efetivacaoTipo`; o valor enviado
pelo cliente não pode efetivar indevidamente parcelas futuras. Preservar a
distribuição exata dos centavos, com ajuste da diferença na última parcela.

## Validação e integridade no servidor

O cliente não é fonte de verdade para condições verificáveis no servidor.
Validações da interface servem à experiência do operador e são refeitas no
backend em todos os caminhos de criação, edição e recebimento.

- Validar organização, permissões, conta ativa e elegibilidade do método.
- Validar parcelamento permitido, quantidade inteira positiva e limites.
- Validar valores finitos e positivos; conferir a soma contra o total devido
  calculado pelo servidor, considerando valores já pagos e as regras da venda.
- Validar previsão e intervalo quando forem necessários à geração de parcelas.
- Validar pertencimento, disponibilidade e capacidades do terminal.
- Validar efetivação conforme o fluxo. Terminal integrado exige evidência válida
  de aprovação; confirmação manual segue as permissões aplicáveis.
- Resolver condições exclusivamente da configuração persistida e guardar a cópia
  utilizada com consistência transacional, sem aceitar sobrescrita do navegador.
- Preservar isolamento por organização, idempotência e proteção contra dupla
  efetivação sob concorrência e repetição de eventos.

## Migração e compatibilidade

Não efetivar, reagrupar ou recalcular transações antigas automaticamente.
Regularização histórica de operações já aprovadas será um trabalho separado,
com seleção explícita das operações confirmadas.

Inventariar contas, métodos e integrações antes do preenchimento das novas
configurações. Uma conta pode ser usada tanto por terminal integrado quanto
por maquininha externa; divergências entre comportamento configurado e
capacidades da integração devem ser tratadas explicitamente, sem alterar o
fluxo integrado que já confirma uma única transação.

Auditar consumidores que inferem parcelamento pelo número de linhas ou que
interpretam `totalParcelas > 1` como obrigatoriedade de parcelas pendentes:
hidratação de estado, agrupamento, edição, histórico, caixa, pendências,
conciliação, cancelamento, estorno, cashback e emissão fiscal automática.

## Evolução futura: taxas e repasses

A configuração por conta e método permitirá incorporar planos de recebimento,
taxas por quantidade de parcelas, antecipação e prazos específicos da provedora.
Não criar esses campos nem o cálculo de taxas nesta primeira implementação.

Repasses precisarão de estrutura própria ligada ao pagamento de origem,
permitindo um ou vários repasses, valores bruto e líquido, taxas e conciliação.
Não reutilizar parcelas de cobrança do cliente para representar esses repasses
nem reconhecer uma segunda venda na transferência ao banco. Não presumir que
pagamento aprovado significa dinheiro disponível na conta bancária.

## Sequência de implementação

- [ ] Fechar política de compatibilidade, métodos elegíveis e contas sem regra.
- [ ] Criar enums, schemas, tipos internos e migration das transações.
- [ ] Preparar configuração, defaults e preenchimento das contas existentes.
- [ ] Implementar resolução e validação centralizadas no servidor.
- [ ] Adaptar geração de transações e integração com terminais.
- [ ] Adaptar criação/controle de contas para configurar a regra por método.
- [ ] Ajustar textos e consumidores do checkout sem expor um novo controle ao operador.
- [ ] Revisar agrupamento e demais consumidores financeiros.
- [ ] Validar compatibilidade e ativar a regra após o preenchimento das contas.

## Critérios de aceite

- Cartão parcelado confirmado com transação única não gera cobranças mensais.
- Recebimento parcelado gera valores e vencimentos corretos com baixa individual.
- Aprovação de terminal efetiva exatamente uma vez o pagamento correspondente.
- Alterar configuração da conta não modifica condições históricas.
- Payload adulterado não sobrescreve regras, limites, conta ou confirmação.
- Dois pagamentos semelhantes na mesma venda não têm suas parcelas misturadas.
- Edição, cancelamento e estorno preservam integridade e não duplicam efeitos.
- Vendas e transações anteriores mantêm seu comportamento histórico.
- O operador não precisa compreender nem selecionar a regra no checkout.

Este documento registra o plano; não implementa mudanças de produto ou de banco.
