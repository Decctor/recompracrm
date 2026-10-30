# Auditoria histórica da Congelatte

```powershell
npx tsx scripts/audit-cardapio-web-sales.ts
```

Consulta a integração `50b56dfc-5807-441c-aa65-e882fa77b7d3`, validando a organização
`27817d9a-cb04-4704-a1f4-15b81a3610d3`. Não reativa a integração. Todas as consultas
ao banco rodam em transações PostgreSQL `READ ONLY`. Não há modo de escrita.

O período é `[01/01/2026 00:00, 01/09/2026 00:00)` em São Paulo. Busca pedidos
fechados e cancelados em janelas mensais, confere paginação/contagem/IDs e compara
os cabeçalhos com os mesmos mapeadores da integração. Valores são comparados em
centavos; instantes são comparados em UTC. A identificação usa integração + ID
externo, com candidatos legados sem integração apenas quando o modelo é Cardápio Web.
Vendas de outras integrações não entram na comparação. Vendas `DV` com ID `POI-*`
foram criadas pelo próprio app no ponto de interação: são reportadas separadamente,
mesmo que vinculadas à integração. O rótulo legado `FECHADO` equivale a `SN01`.

## Execução e resultados

- `--probe`: testa autenticação e a primeira página de janeiro.
- Sem opções: retoma páginas e detalhes salvos, consultando novamente apenas o que falta.
- `--refresh`: refaz toda a coleta da origem. Não executar dois processos simultâneos.
- `--detail-delay-ms=1000`: pausa mínima entre consultas de detalhes (padrão 1 segundo;
  aceita valores maiores). Após 429 esgotar as tentativas, interrompe com o cache preservado.
- A API limita histórico a cinco requisições/minuto. Dezenas de milhares de detalhes
  podem levar horas. Interromper e retomar preserva o cache já coletado.

Arquivos em `../recompracrm-tmpworks/congelatte-cardapio-web-2026-jan-aug/` (ignorados pelo Git):

- `history-<mês>-<página>.json` e `details/<id>.json`: evidência da origem.
- `history-complete.json`: confirmação de coleta completa do histórico.
- `app-snapshot.json`: vendas da organização e snapshot consistente de saldos e
  transações de cashback vinculadas à origem, capturados depois da coleta remota.
- `report.json`: totais, completude e contagem de ocorrências.
- `differences.json`: evidências por venda ausente, duplicada ou divergente.
- `failures.json`: detalhes que não puderam ser consultados. Código de saída 2
  sinaliza relatório incompleto; código 1 sinaliza interrupção fatal.

Os arquivos contêm dados de clientes e são destinados à análise local. O cache é
uma coleta ao longo do tempo, não um snapshot transacional do Cardápio Web.

O relatório distingue alinhamento dos **campos comparados** de uma auditoria integral:
itens, adicionais, pagamentos e identidade do cliente não são certificados por esta
primeira etapa. `AUSENTE_NA_ORIGEM` exige investigar retenção/filtros e data divergente;
nunca autoriza excluir automaticamente uma venda. `PROVENIENCIA_LEGADA` sinaliza uma
venda encontrada sem vínculo explícito à integração.

## Próxima etapa: correção sem alterar cashback

A sincronização normal não deve ser usada para reparar esse histórico: `effects.ts`
pode chamar `reverseSaleCashback` em cancelamentos, e `sync-sales.ts` tem efeitos
financeiros para canais gerenciados. Desativar só a acumulação não basta.

Antes de aplicar qualquer correção:

1. Revisar o relatório, resolver duplicidades/proveniência e completar a auditoria
   de itens/clientes caso façam parte do escopo de alinhamento desejado.
2. Produzir um plano por ID de venda, com valores anteriores/esperados e regras para
   vendas faltantes. Nenhum cancelamento deve excluir fisicamente a venda.
3. Criar uma rotina histórica específica e idempotente, sem chamar processamento
   comercial, financeiro, estoque, cashback, campanhas, fiscal ou notificações.
4. Investigar gatilhos do banco e consumidores assíncronos antes de escrever, incluindo
   a assinatura externa e a possibilidade de uma sincronização futura reprocessar efeitos.
5. Capturar cashback imediatamente antes da aplicação, bloquear as linhas necessárias,
   corrigir apenas o escopo aprovado e conferir saldos **e transações** na mesma
   transação; qualquer alteração de cashback deve causar rollback. O snapshot desta
   auditoria é evidência, não deve restaurar um saldo que mudou legitimamente depois.
6. Reexecutar a comparação e revisar métricas históricas de clientes/relatórios sem
   disparar eventos de nova compra.

Nenhuma correção é aplicada por este script.

## Validação local

```powershell
npx tsx --test scripts/lib/cardapio-web-sales-audit.test.ts
npx oxlint scripts/audit-cardapio-web-sales.ts scripts/lib/cardapio-web-sales-audit.ts scripts/lib/cardapio-web-sales-audit.test.ts
```
