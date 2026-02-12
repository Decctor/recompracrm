# Partner Cashback Rollout

## Scope
- Client accumulation remains unchanged (`acumulo_valor`).
- Partner accumulation uses `acumulo_valor_parceiro`.
- Partner campaign cashback is intentionally out of scope.
- Legacy endpoint `/api/point-of-interaction/new-sale` is deprecated in favor of `/api/point-of-interaction/new-transaction`.

## Migration
1. Run database migration `drizzle/0006_partner_cashback_foundation.sql`.
2. Confirm new columns:
   - `ampmais_cashback_programs.acumulo_valor_parceiro`
   - `ampmais_partners.cliente_id`
   - `ampmais_partners.codigo_afiliacao`
   - `ampmais_clients.cpf_cnpj`
3. Confirm indexes:
   - `idx_partners_cliente_id`
   - `idx_partners_org_identificador`
   - `uniq_partners_org_codigo_afiliacao`

## Backfill Verification
```sql
-- linked partners
select count(*) as linked_partners
from ampmais_partners
where cliente_id is not null;

-- unresolved partners
select count(*) as unresolved_partners
from ampmais_partners
where cliente_id is null;

-- duplicate affiliate codes (must be zero)
select organizacao_id, codigo_afiliacao, count(*)
from ampmais_partners
where codigo_afiliacao is not null
group by organizacao_id, codigo_afiliacao
having count(*) > 1;
```

## Runtime Verification
1. Create/update partner with:
   - manual client link
   - no manual link (auto-link path)
2. Create POI sale without `partnerCode`:
   - client accumulation only.
3. Create POI sale with valid `partnerCode`:
   - one client `ACÚMULO` transaction
   - one partner `ACÚMULO` transaction (metadata `ator = PARCEIRO`)
4. Hit `/api/point-of-interaction/new-sale`:
   - expect HTTP `410`.

## Monitoring Queries
```sql
-- partner accumulation transactions by org/day
select
  organizacao_id,
  date_trunc('day', data_insercao) as dia,
  count(*) as transacoes,
  sum(valor) as valor_total
from ampmais_cashback_program_transactions
where tipo = 'ACÚMULO'
  and (metadados ->> 'ator') = 'PARCEIRO'
group by organizacao_id, date_trunc('day', data_insercao)
order by dia desc;

-- partner code usage in POI
select
  organizacao_id,
  count(*) as usos
from ampmais_cashback_program_transactions
where tipo = 'ACÚMULO'
  and metadados ? 'codigoParceiro'
group by organizacao_id
order by usos desc;
```
