# Identidades externas e proteção do catálogo

O de-para usa **`catalog_links`**, a entidade existente do iFood. Não existe uma segunda tabela de mapeamento de produtos. A migração `0140_catalog_external_identities.sql` é aditiva e remove somente a tabela provisória vazia criada durante a preparação desta mudança.

## Identidade e destino

Os aliases de importação têm `integracaoId`, `identidadeTipo` (`PRODUTO`, `VARIANTE`, `CODIGO`, `EAN`, `ESTOQUE`) e `identidadeValor`. A combinação organização/conexão/tipo/valor é única. Cada alias referencia exclusivamente um produto ou uma variante; vários aliases podem compartilhar o destino. Para variantes, o pai é lido do cadastro atual, permitindo mover a variante sem perder sua identidade externa.

No iFood, `merchantId` continua sendo a loja e as regras existentes permanecem iguais. Nos aliases de importação, esse campo recebe um namespace determinístico por chave externa. O escopo da conta é `integracaoId`. Isso permite manter o índice original e a compatibilidade dos `ON CONFLICT` do iFood durante o deploy. O hash do namespace não é uma credencial; a chave externa original fica preservada nas colunas de identidade.

O banco valida a organização e o provedor da conexão, a existência do destino e a exclusividade da chave. A exclusão de um vínculo protegido é recusada para impedir que a remoção em cascata de um produto apague silenciosamente o de-para. Uma decisão explícita de desvinculação exige desproteger o vínculo antes de removê-lo.

## Sincronização

`lib/products/external-identities.ts` carrega e resolve os aliases. Identificadores contraditórios geram erro. A criação de entidades auxiliares e o vínculo dos itens de venda consultam esse de-para antes dos fallbacks por código. Pedidos Nuvemshop usam o ID da variante mesmo se o SKU mudar; o histórico Phibo também usa `metadata.phiboEan`.

Famílias protegidas pertencem ao app: a Nuvemshop não sobrescreve nomes, eixos, combinações, códigos, preços, disponibilidade ou saldos. Uma variante remota desconhecida nessa família interrompe a transação com uma pendência explícita; não é criada por aproximação de nome. Entidades novas fora dessas famílias seguem a criação normal e registram seus identificadores.

O importador pontual Phibo separa modelos inteiramente mapeados, mantendo-os intactos. Modelos com de-para parcial aguardam a unificação. Novos modelos sem vínculo seguem o planejador existente. Relatórios e hashes incluem a proteção; a aplicação exige o hash de uma nova prévia.

`mergeProducts` conserva os vínculos de identidades distintas. Os aliases de variante acompanham seus IDs preservados; os aliases de produto são transferidos na transação da fusão. A próxima etapa de unificação manual deve criar os destinos ausentes e registrar seus aliases **na mesma transação**, junto da migração das referências e das opções. Não cadastrar destinos futuros como se já existissem.

## Preparação e validação

```powershell
npm run protect:product-identities -- --organization-id <org> --migrate --apply
npm run protect:product-identities -- --organization-id <org>
npm run protect:product-identities -- --organization-id <org> --apply --expected-hash <hash-da-previa>
npm run test:product-identities
node --env-file=.env --conditions=react-server --import tsx scripts/verify-product-external-identities.ts --organization-id <org>
```

O backfill é específico aos arquivos privados da avaliação da Use e Abluse em `.local-analysis/phibo/`. Ele valida as organizações e as fontes, grava somente vínculos para destinos existentes e não move produtos, variantes, vendas ou saldos. A prévia é somente leitura; a aplicação bloqueia as tabelas relevantes e valida novamente o hash. O teste de integração cria fixtures, exercita fusão, repetição, conflitos, isolamento e o upsert legado do iFood, e reverte toda a transação.

Aplicar a estrutura e os aliases no banco não atualiza um servidor já publicado: os sincronizadores e a rotina de fusão precisam executar a versão nova do código antes da unificação real.
