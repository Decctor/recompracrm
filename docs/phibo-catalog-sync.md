# Sincronização completa do catálogo Phibo

## Escopo e fonte

Organização: Use e abluse (`b75a88a2-ef7c-4ff5-a53c-4e227791cad3`). A extração de 27/10/2026 foi feita na sessão autenticada do preview do T3, sem limite por data ou quantidade em estoque. Foram lidas todas as 52 páginas de ativos e 3 páginas de excluídos da tela `/compras/gestao-estoque/listar-produtos`.

- Ativos: `GET https://www.phibo-api.com.br/estoque/listarProdutos?page=0&size=50&opcaoConsulta=6&status=1`.
- Excluídos: mesma rota, com `opcaoConsulta=12&status=0`.
- 2.702 EANs/IDs de estoque distintos, 757 modelos: 2.559 variações ativas e 143 excluídas.
- Arquivo privado: `../recompracrm-tmpworks/phibo/phibo-catalogo-completo-2026-10-27.json`. Inclui os campos originais, URLs de consulta, páginas, totais, status e data da extração. Não inclui cookies ou headers de autenticação.

As rotas são internas e podem mudar. `scripts/extract-phibo-catalog-browser.js` instala o extrator no contexto da aba autenticada. Depois de instalado, fazer uma consulta na interface para observar a sessão e executar `await phiboCatalog.extract()`. A ferramenta gera um download completo; copiar o arquivo para `../recompracrm-tmpworks/phibo/`. O parser do importador valida ambos os status, todas as páginas e os filtros, contagens, EANs/IDs, preços e valores obrigatórios.

## Regras de reconciliação

O planejamento fica em `lib/products/phibo-catalog.ts` e a aplicação em `scripts/sync-phibo-catalog.ts`.

1. EAN/código de barras ou ID de estoque explícito é uma identidade forte de variante.
2. Famílias existentes são reconhecidas por EANs das variantes, código `PHIBO-MODELO-{id}` ou nome exato quando o nome identifica um único modelo no Phibo.
3. Cadastros de cor/tamanho com outro código de barras, modelos que disputam o mesmo destino e produtos por cor da Nuvemshop exigem revisão. Não usar busca aproximada para mesclar silenciosamente.
4. Famílias já agrupadas são reutilizadas, mesmo quando ainda estão no grupo textual `PHIBO-HISTORICO`. A família existente não é recriada nem suas variantes são movidas.
5. Um produto histórico avulso e inativo permanece intacto. Se seu EAN pertence ao catálogo atual, o destino operacional é uma variante canônica, e o histórico avulso fica registrado como alias para a etapa posterior de unificação. Assim, pode haver EAN repetido entre o registro histórico inativo e a variante atual; nunca dois destinos operacionais ativos. Não alterar vendas para resolver esse alias nesta etapa.
6. Modelos distintos com o mesmo nome continuam distintos quando os IDs/EANs de origem os distinguem. Uma variação excluída com EAN diferente de uma ativa é outro SKU, mesmo quando cor e tamanho coincidem.

## Campos sincronizados e preservados

Sincronizar nome, categoria, unidade, NCM, ativação, preço e cor/tamanho das variantes. O código de produtos/variantes existentes é preservado; novos pais usam `PHIBO-MODELO-{id}`, e novas variantes usam EAN e `idExterno=phibo:estoque:{estoqueId}`. IDs novos são determinísticos por organização. Imagens só substituem as atuais quando a fonte fornece uma URL. Custo desconhecido fica nulo em novos registros e não apaga um custo conhecido existente.

Preços anteriores e datas de alteração passam por `buildSalePriceUpdate`; atualizações de produto usam `withProductUpdateStamp`. Variantes têm preços próprios; o pai recebe o menor preço de suas variantes ativas, ou das excluídas se não houver ativas. Um modelo com todas as variantes excluídas fica inativo e não vendável. Nenhum registro é excluído por ausência na fonte.

Não copiar saldos do Phibo: novos registros começam em zero, com rastreamento desativado; saldos/rastreamento existentes são preservados. Não criar movimentações de estoque, financeiro, fiscais, cashback ou campanhas. Não mover ou excluir vendas/referências históricas. Produtos de fora do mapeamento permanecem como estão.

Novos pais e famílias históricas reativadas não são publicados automaticamente no SHOP/COMANDA: são criados overrides de indisponibilidade nesses canais somente quando ainda não há uma configuração explícita do usuário. O PDV da organização usa catálogo TODOS e respeita ativação/venda. Os canais e configurações existentes de produtos já operacionais são preservados.

## Comandos e segurança de execução

```powershell
npm run test:phibo-catalog

# Somente leitura; gerar uma nova prévia antes de toda aplicação.
npm run sync:phibo-catalog -- --organization-id b75a88a2-ef7c-4ff5-a53c-4e227791cad3 --dry-run

# Aplicação do plano revisado; substituir pelo hash da prévia recém-gerada.
npm run sync:phibo-catalog -- --organization-id b75a88a2-ef7c-4ff5-a53c-4e227791cad3 --apply --expected-plan-hash HASH_DA_PREVIA
```

Para outra extração, passar `--input CAMINHO` e `--output CAMINHO`. Sem `--apply`, o script usa uma transação `REPEATABLE READ READ ONLY`. Na aplicação, obtém locks nas tabelas de catálogo, relê o destino e confere o hash do plano e da fonte. Salva backup local antes das inserções. Todas as alterações são atômicas; falha de verificação causa rollback. Locks têm timeout de aquisição de 5 segundos. As leituras da aplicação continuam permitidas; escritas no catálogo aguardam a transação.

A verificação antes do commit exige pais/variantes coerentes com a origem, dois vínculos Cor/Tamanho, EAN ativo único, todos os saldos e IDs existentes preservados e históricos avulsos integralmente intactos. Uma prévia posterior confirma a estabilidade das identidades e que não há criações/atualizações pendentes nos modelos sincronizados.

## Prévia de 27/10/2026

O app tinha 570 produtos e 1.144 variantes. A prévia identificou 738 modelos/2.605 variações seguros: criar 607 pais e 2.272 variantes; reutilizar 131 pais e 333 variantes. Entre os existentes, 120 pais e 290 variantes precisam de atualização cadastral; 110 pais precisam de reativação. Há 46 aliases de históricos avulsos e 19 modelos/97 variações com conflito de identidade, separados para revisão posterior.

O conjunto `Conjunto Calça + Blusa com amarração` usa o pai existente `717a1184-0e5b-4cd2-aaff-513836f173cd` e as seis combinações de origem: Marrom/P, Bege/P, Vermelho/M, Azul Celeste/M, Preto/G e Verde Escuro/G. O cadastro histórico avulso Vermelho/M permanece preservado até a etapa posterior.

Relatórios e backups ficam em `../recompracrm-tmpworks/phibo/`, ignorados pelo Git. O projeto contém 14 testes específicos desta reconciliação. A checagem geral de preços identifica duas infrações preexistentes nos scripts temporários `tmp-giardino-pizza-sizes.ts` e `tmp-giardino-pizza-tiers.ts`; os caminhos de escrita deste sincronizador usam os helpers exigidos.

## Resultado aplicado e conferido

A execução autorizada concluiu em 27/10/2026 com o hash `b539c61a338a3f9ee13be545d334b7c53ba1df757db73fa85c8fa9526cee5040`:

- 607 produtos-pai e 2.272 variantes criados.
- 120 produtos e 290 variantes atualizados; IDs existentes preservados.
- 1.217 eixos, 2.642 valores e 4.544 vínculos novos de variante/eixo.
- 2.605 variações conferidas após o commit: 2.462 ativas disponíveis no PDV e 143 excluídas mantidas inativas.
- Os 19 modelos/97 variações ambíguos ficaram sem alteração. Nenhum dos 143 excluídos foi reativado.
- Nova prévia encontrou zero produtos/variantes a criar e zero atualizações nos 738 modelos conciliados.
- O conjunto com amarração tem as seis variantes ativas no pai existente, com preço de R$ 189,90 cada.

Relatórios locais: `sync-catalogo-resultado-2026-10-27.json`, seu arquivo `-backup.json`, `sync-catalogo-pos-verificacao-2026-10-27.json` e `sync-catalogo-verificacao-independente-2026-10-27.json`.

## Próxima etapa: unificação dos históricos

O levantamento posterior está em `pendencias-unificacao-historicos-2026-10-27.json`. Há 46 produtos históricos avulsos com destino canônico identificado, usados por 51 itens de venda e 153 referências de clientes (`product_client_references`). As referências permanecem nos produtos antigos; nenhuma venda foi movida nesta etapa. O arquivo contém origem, EAN, destino produto/variante e uso real por tabela, além dos 19 modelos ainda ambíguos.

Antes de unificar, revisar os conflitos com produtos da Nuvemshop por cor, famílias duplicadas e o caso de dois modelos remotos apontando para a mesma família. Depois, mover referências com organização e variante explícitas, preservando os snapshots monetários das vendas, auditar outras tabelas que referenciam produto/variante e somente então desativar aliases ou liberar sua remoção. Não excluir históricos diretamente: isso pode perder vínculos ou impedir a operação por chaves estrangeiras.

## Avaliação manual dos conflitos

Com a autorização do usuário para exercer julgamento editorial, os 19 modelos/97 EANs foram avaliados individualmente em `scripts/prepare-phibo-manual-mapping.ts`. As decisões ficam explícitas no script; a expansão por cor/tamanho não faz busca aproximada nem escolhe automaticamente os modelos.

O de-para propõe 18 famílias canônicas: 17 pais existentes e um novo. Preserva 64 IDs de variante (48 no pai atual e 16 com mudança de pai proposta) e identifica 33 combinações novas. Os dois vestidos tomara que caia ficam separados, com nomes que identificam coleção/fornecedor; o par Branco/Vermelho da Nuvemshop é associado ao modelo Carmen Rosa Patino porque Vermelho só existe nesse dos dois modelos remotos. As duas Jaqueta Jeans permanecem na família já existente, preservando EANs e preços próprios. Marrom da Camisa Xadrez é interpretado como Marrom escuro, mantendo Caramelo separado.

Há 13 decisões de confiança alta e 6 interpretativas de confiança média, todas justificadas, com observações sobre as evidências que faltam. Preço diferente sozinho não define identidade. A escolha do pai prioriza o cadastro operacional com uso; no empate sem vendas, usa o menor identificador remoto NS como desempate, sem afirmar uma data de criação remota não comprovada.

Arquivos locais: `avaliacao-manual-conflitos-2026-10-27.md`, `de-para-manual-conflitos-2026-10-27.json` e `de-para-manual-validacao-2026-10-27.json`. A validação independente em transação READ ONLY conferiu os 97 EANs, 97 combinações de destino sem colisão e IDs/SKUs/IDs externos no banco atual. A aplicação estrutural atingiria 12 itens de venda e 18 referências de clientes, que ainda não foram alterados.

O mapeamento não aplica unificações. Antes de executá-las, a sincronização de catálogo da Nuvemshop (`lib/data-connectors/nuvemshop/catalog-sync.ts`) precisa consumir os aliases de produto/variante: hoje ela procura os pais pelo código NS original e as variantes dentro de cada pai, podendo recriar a estrutura antiga depois de uma consolidação. O sincronizador Phibo também precisará consumir as decisões manuais, incluindo as equivalências de cor e o agrupamento explícito de dois modelos remotos da Jaqueta Jeans.
