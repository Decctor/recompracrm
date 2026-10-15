# Modelo fiscal por venda no POS

O fechamento mantém a decisão de emitir (`emissaoFiscalAutomatica`) separada da escolha do
modelo (`emissaoFiscalDocumento`). O seletor fica no bloco fiscal compartilhado pela venda
nova, pelo checkout de orçamento e pela edição de venda confirmada.

## Persistência

`sales.emissaoFiscalDocumento` usa o enum fiscal existente, com restrição no banco a `NFE`,
`NFCE` ou `NULL`. `NULL` significa Automático. Uma escolha explícita é preservada mesmo
quando coincide com a sugestão atual ou quando a emissão automática é desligada.

Na criação, ausência do campo resulta em `NULL`. Na edição, ausência preserva o valor atual;
`NULL` explícito retorna ao Automático e exige permissão quando altera uma escolha anterior.
Vendas e integrações existentes continuam no Automático sem backfill.

## Previsão e validação

`GET /api/pos/fiscal-preview` recebe cliente, modalidade, endereço de entrega, modelo escolhido
e, quando existente, o identificador da venda. A organização vem exclusivamente da sessão.
O serviço lê o cadastro do cliente no banco e retorna apenas modelo, motivo, série, perfil,
opções disponíveis, impedimentos e permissão de alteração. Credenciais não são expostas.

A previsão não cria documentos, reserva números nem chama o provedor. Ela confere configuração
e destinatário, sem prometer autorização SEFAZ. As validações tributárias dos itens continuam
no motor fiscal; o aviso de produtos sem perfil permanece no POS.

Os perfis e as séries são resolvidos pelas mesmas funções usadas na emissão. No Automático,
CNPJ, SHOP e entrega preferem NF-e quando configurada para a operação; o fallback para NFC-e
fica explícito na previsão. Uma escolha explícita nunca sofre fallback.

O fechamento e a edição validam novamente no servidor, usando o leitor da própria transação.
A execução agendada lê a preferência persistida no momento da execução. A preparação do envio
revalida série, credenciais e destinatário.

## Permissões e concorrência

Alterar o modelo exige `fiscal.emitir`. A alteração do rascunho, a confirmação e a criação do
documento usam lock da linha da venda. A criação serializa os dois modelos, impedindo uma nota
de outro modelo para a mesma venda enquanto houver documento não encerrado.

Retentativas mantêm o modelo do documento com erro/rejeição. A emissão manual aplica o bloqueio
de documento ativo mesmo quando recebe `tipo` explícito. Devoluções continuam encadeadas ao
documento original e usam seu fluxo específico.

## Migração e verificação

Aplicar `drizzle/0133_sale_fiscal_document.sql` antes de publicar o código. A migração é aditiva
e idempotente; não altera séries, tributos, preferências existentes nem emite documentos.

```powershell
npx tsx scripts/apply-sql-migration.ts drizzle/0133_sale_fiscal_document.sql
npm run test:fiscal-document
npm run test:fiscal-auto-emission
```

Os testes cobrem migração/constraint, escolhas explícitas, permissões, estados dos documentos,
reidratação de orçamento/edição, capacidade por modelo e as regras da seleção automática.
O componente foi inspecionado em 360, 768 e 1280 pixels, nos temas claro e escuro, com seleção
por toque/clique e teclado e estados de consulta, erro, destinatário incompleto e nota existente.
O teste visual isolou o componente porque o navegador local não tinha sessão autenticada.
