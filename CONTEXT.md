# Domain Context

## Food-service

### Sessão de venda (`salesSession`)

Recorte operacional de caixa escolhido explicitamente pela venda. A sessão define `politica` como
`VENDEDOR_UNICO` ou `VENDEDORES_MULTIPLOS` e pode ter `vendedorPadraoId` para preencher vendas
novas. A atribuição comercial permanece exclusivamente em `sales.vendedorId`; o vendedor padrão
nunca substitui essa atribuição no servidor. Não existe política durável por organização nem uma
tabela de participantes da sessão.

### Ponto de atendimento (`servicePoint`)

Ancora operacional duravel em que um atendimento acontece, como mesa, balcao ou quiosque. Pode existir sem uma conta aberta e possui identidade/QR estavel. Nao e sinonimo de `poiTransactionRequest`: POI e um fluxo publico de solicitacoes de fidelidade/transacao.

### Conta de atendimento (`tab`)

Conta de consumo efemera que agrega pedidos ate o fechamento. Pode estar ligada a um ponto de atendimento ou existir de forma avulsa. Em operacoes "somente mesas", a tab existe internamente, mas pode ter identificacao automatica e ficar oculta na UI.

### Pedido da conta (`tabOrder`)

Rodada operacional enviada para preparo/entrega durante uma tab. Organiza itens e status de atendimento, mas nao possui identidade comercial, financeira ou fiscal. Os efeitos comerciais acontecem na venda vinculada a tab.

### Solicitacao de pedido (`tabOrderRequest`)

Intencao enviada por um cliente em contexto publico de ponto/tab. Nao altera a conta enquanto estiver pendente. A aprovacao do operador valida novamente itens e precos e cria um `tabOrder`.

### Venda da tab

Venda interna em `ORCAMENTO` que agrega os `saleItems` de todos os pedidos de uma tab. E confirmada uma unica vez no fechamento, quando pagamentos, sessao de caixa, contabilidade, fiscal e cashback possuem dados definitivos.

### Configuracao de atendimento (`serviceSettings`)

Politicas por organizacao que definem se pontos e contas estao habilitados, como a conta e identificada, se o ponto e obrigatorio, quantas contas podem ficar abertas por ponto e como solicitacoes publicas sao aceitas. Presets de UI como "Somente mesas" e "Somente comandas" sao traducoes dessas politicas, nao entidades do dominio.

## Fidelidade

### Clube de beneficios (`benefitClub`)

Identidade institucional duravel que governa organizacoes participantes, membros e programas de fidelidade. O caso mono-organizacao e um clube com uma unica participante.

### Programa de fidelidade (`loyaltyProgram`)

Contrato economico vigente do clube. Opera exclusivamente com cashback ou pontos e define politicas e recompensas uniformes para todas as organizacoes participantes.

### Membro do clube (`loyaltyMember`)

Identidade do consumidor no escopo do clube, reconhecida por telefone verificado. Pode se vincular a diferentes cadastros locais de cliente e possui uma unica conta por programa.

### Lote de credito (`loyaltyCreditLot`)

Credito consumivel com quantidade original, organizacao emissora e eventual expiracao. Debitos registram alocacoes imutaveis contra um ou mais lotes na ordem de expiracao e criacao.

### Compensacao de fidelidade (`loyaltySettlementEntry`)

Posicao economica imutavel que identifica quanto uma organizacao deve pagar ou receber por emissao, resgate, expiracao, ajuste ou reversao no programa.

## Compras e contabilidade

### Modificador de custo da compra (`purchaseCostModifier`)

Parcela monetária vinculada a um item de compra que explica um acréscimo ou uma redução em relação ao valor-base da mercadoria, como frete, seguro, desconto, imposto ou despesa acessória. O modificador registra sua origem e seu tratamento, mas não possui ciclo de vida independente do item.

### Tratamento do modificador de custo (`purchaseCostTreatment`)

Decisão contábil aplicada a um modificador: capitalizar no custo do estoque, reconhecer como crédito tributário ou reconhecer como despesa do período. A chave do modificador descreve o que o valor é; o tratamento descreve o efeito econômico e não pode ser inferido apenas pela chave.

### Custo de estoque da compra (`purchaseInventoryCost`)

Valor imutável atribuído ao item quando a compra é recebida. Inclui o valor líquido da mercadoria e os modificadores tratados como custo de estoque; alimenta o custo médio móvel do produto ou variante.

### Documento importado da compra (`purchaseImportedDocument`)

Snapshot da origem documental de uma compra, como NF-e XML, PDF ou imagem. Preserva identificação, totais declarados, hash e referência privada ao arquivo, sem adquirir ciclo de vida próprio fora da compra.

### Linha contábil (`accountingEntryLine`)

Débito ou crédito imutável em uma conta contábil que participa de um lançamento. As linhas representam a classificação contábil efetiva e devem se balancear; chaves de modificadores de compra não são uma taxonomia paralela de linhas.

## Pagamentos presenciais (terminal SmartPOS)

### Tentativa de pagamento (`paymentAttempt`)

Registro durável de uma única intenção de executar uma operação financeira externa (cobrança em
terminal SmartPOS) com valor, método, provedor, venda e dispositivo imutáveis. No Fluxo B nasce no
backend, dentro da própria transação que confirma a venda, vinculada à transação financeira
pendente e atribuída a um dispositivo. Preserva o resultado observado, inclusive quando incerto,
e só produz efeito financeiro ao ser consumida atomicamente. `payment_attempts` é a projeção
autoritativa; `payment_attempt_events` é append-only para auditoria.

### Evidência do terminal (`terminalEvidence`)

Fato sanitizado observado pelo aplicativo após a execução no terminal: aprovação, recusa,
cancelamento, ATK, ITK, código de autorização, PAN mascarado. Não é um comando nem um status
interno: o backend valida a correlação (valor, parcelas, `order_id`) e deriva o estado da
tentativa. Chaves fora da allowlist são descartadas antes de persistir.

### Consumo da tentativa (`paymentAttemptConsumption`)

Transição atômica que efetiva a transação financeira pendente vinculada a uma tentativa aprovada
(seta `dataEfetivacao`, `provedorReferencia` e `tentativaPagamentoId`) e marca a tentativa como
`CONSUMIDA` na mesma transação PostgreSQL. Uma tentativa consumida não pode ser reutilizada,
reatribuída ou ter valor, método e parcelamento alterados.

### Atribuição de dispositivo (`deviceAssignment`)

Escolha, feita pelo operador do PDV web no bloco de pagamento, do terminal (principal
`DISPOSITIVO` do cliente `RECOMPRA_PAYMENT_TERMINAL`) responsável por executar a cobrança de uma
venda confirmada. A venda fica confirmada com transação financeira pendente de efetivação, o
mesmo mecanismo de FIADO/BOLETO; a tentativa atribuída alimenta a listagem daquele dispositivo.
A plataforma só cancela a tentativa em `CRIADA`.

### Resultado incerto (`uncertainPaymentOutcome`)

Estado em que a adquirente pode ter recebido ou aprovado a operação, mas o RecompraCRM não possui
evidência conclusiva (callback perdido, valor divergente). Bloqueia nova cobrança automática e
exige recuperação no terminal ou conciliação.
