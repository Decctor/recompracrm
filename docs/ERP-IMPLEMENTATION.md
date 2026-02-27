# ERP Module — v1 Implementation

## Context

RecompraCRM operates as a retention CRM that receives sales data from external ERPs, POS integrations, or its own Point of Interaction (POI) terminal. The ERP module extends the platform so it can also **be** the ERP — generating accounting entries, financial transactions, fiscal documents, and stock movements for sales created internally.

The core principle is **"dumb receiver, smart creator"**: when receiving external data, the system stores it as-is for CRM purposes. When creating data internally (ERP mode), the system generates the full accounting/financial/fiscal chain automatically.

---

## Architecture Overview

```
                    ┌─────────────────────────┐
                    │     organizations        │
                    │  origemDadosPadrao:      │
                    │    RECEPTOR | ERP        │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
    ┌─────────▼──────┐  ┌───────▼────────┐  ┌──────▼───────────┐
    │ accountsCharts │  │    products     │  │     clients      │
    │ (copy per org) │  │  + variants    │  │                  │
    └─────────┬──────┘  └───────┬────────┘  └──────┬───────────┘
              │                 │                   │
              │          ┌──────▼────────┐          │
              │          │ productStock  │          │
              │          │ Transactions  │          │
              │          └──────┬────────┘          │
              │                 │                   │
              │         ┌───────▼───────────────────▼──┐
              │         │          sales               │
              │         │  processamentoOrigem:        │
              │         │    EXTERNO | INTERNO         │
              ├────────►└──────────┬───────────────────┘
              │                    │
              │         ┌──────────▼──────────┐
              │         │  accountingEntries   │
              │         │  (only if INTERNO)   │
              ├────────►└──────────┬───────────┘
              │                    │
              │         ┌──────────▼──────────┐
              │         │financialTransactions │
              │         │  (N per entry)       │
              │         └──────────┬───────────┘
              │                    │
              │         ┌──────────▼──────────┐
              │         │  fiscalDocuments     │
              │         │  (3rd-party refs)    │
              │         └─────────────────────┘
              │
    ┌─────────▼──────────┐
    │ financialAccounts   │
    │ (cash, bank, etc.)  │
    └────────────────────┘
```

---

## Switch Mechanism

### Organization Default

`organizations.origemDadosPadrao` (pgEnum: `RECEPTOR` | `ERP`, default `RECEPTOR`)

Sets the default processing mode. Organizations using external ERPs stay on `RECEPTOR`; those using the platform as their ERP switch to `ERP`.

### Per-Sale Override

`sales.processamentoOrigem` (pgEnum: `EXTERNO` | `INTERNO`, default `EXTERNO`)

Allows granular control per sale. A food-service business using `ERP` mode by default can still receive iFood sales as `EXTERNO` via integration — no accounting/fiscal chain is generated for those.

### Feature Gate

`OrganizationConfigurationSchema.recursos.erp.acesso` (boolean, default `false`)

Controls UI access to ERP features. The `erp` config block defaults to `{ acesso: false }` so existing organizations are unaffected.

---

## Data Flow: Internal Sale (ERP Mode)

```
[1] Sale created (POI / web interface)
     processamentoOrigem = "INTERNO"
     │
     ▼
[2] Accounting Entry auto-generated
     D: Payment method account (Cash, Bank, etc.)
     C: Sales Revenue (chart of accounts)
     valor = sale.valorTotal
     │
     ▼
[3] Financial Transactions generated
     One per payment method
     dataPrevisao = sale date (or future for installments)
     dataEfetivacao = null until confirmed
     │
     ▼
[4] Fiscal Document (NFCe/NFe)
     API call to 3rd-party emissor (Nuvem Fiscal, Focus NFe)
     Store reference (chaveAcesso, numero, serie, protocolo, XML/PDF URLs)
     │
     ▼
[5] Stock Movements
     One per sale item
     tipo = SAIDA, saldoAnterior/saldoPosterior snapshots
     products.quantidade or productVariants.quantidade decremented
```

For **external sales** (`processamentoOrigem = "EXTERNO"`), steps 2–5 are skipped. The sale is stored for CRM purposes only (cashback, campaigns, RFM, etc.).

---

## New Tables

All tables use the `ampmais_` prefix via `newTable()` from `common.ts`.

### `accountsCharts` (Chart of Accounts)

**File**: `services/drizzle/schema/financial.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) PK | UUID |
| `organizacaoId` | varchar(255) FK | organizations, cascade |
| `nome` | varchar(255) | Account name |
| `codigo` | varchar(50) | Hierarchical code (e.g., "1.1.2") |
| `idContaPai` | varchar(255) FK | Self-reference, nullable |
| `dataInsercao` | timestamp | defaultNow |

**Key decisions**:
- Copied per organization (Option B) — each org gets its own chart via seed template at ERP activation. No global/shared records.
- Self-referencing tree for parent/child hierarchy.

### `accountingEntries` (Accounting Entries)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) PK | UUID |
| `organizacaoId` | varchar(255) FK | organizations, cascade |
| `vendaId` | varchar(255) FK | sales, nullable (manual entries have no sale) |
| `origemTipo` | enum | `VENDA`, `MANUAL` |
| `titulo` | text | Entry title |
| `anotacoes` | text | Nullable notes |
| `idContaDebito` | varchar(255) FK | accountsCharts |
| `idContaCredito` | varchar(255) FK | accountsCharts |
| `valor` | doublePrecision | Actual amount |
| `valorPrevisto` | doublePrecision | Expected amount, nullable |
| `dataCompetencia` | timestamp | Accrual date |
| `autorId` | varchar(255) FK | users, nullable |
| `dataInsercao` | timestamp | defaultNow |

**Key decisions**:
- 1 entry per sale (not per item). If fiscal granularity is needed, it can be linked via `fiscalDocuments`.
- Manual entries (`origemTipo = "MANUAL"`) allow recording expenses without a linked sale.
- Double-entry: every entry has both a debit and credit account.

### `financialAccounts` (Financial Accounts)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) PK | UUID |
| `organizacaoId` | varchar(255) FK | organizations, cascade |
| `nome` | varchar(255) | Account name |
| `descricao` | varchar(500) | Nullable |
| `tipo` | enum | `CAIXA`, `BANCO`, `CARTEIRA_DIGITAL` |
| `moeda` | varchar(10) | Default "BRL" |
| `ativo` | boolean | Default true |
| `contaContabilId` | varchar(255) FK | accountsCharts, nullable |
| `saldoInicial` | doublePrecision | Default 0 |
| `dataSaldoInicial` | timestamp | Required |
| `codigoBanco` | varchar(10) | Optional bank code |
| `nomeBanco` | varchar(255) | Optional bank name |
| `agencia` | varchar(20) | Optional |
| `numeroConta` | varchar(30) | Optional |
| `digitoConta` | varchar(5) | Optional |
| `tipoConta` | enum | `CORRENTE`, `POUPANCA`, nullable |
| `dataInsercao` | timestamp | defaultNow |
| `atualizadoEm` | timestamp | $onUpdate |

### `financialTransactions` (Financial Transactions)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) PK | UUID |
| `organizacaoId` | varchar(255) FK | organizations, cascade |
| `lancamentoContabilId` | varchar(255) FK | accountingEntries, cascade |
| `contaFinanceiraId` | varchar(255) FK | financialAccounts, nullable |
| `titulo` | text | Transaction title |
| `tipo` | enum | `ENTRADA`, `SAIDA` |
| `valor` | doublePrecision | Amount |
| `metodo` | varchar(255) | Payment method (PIX, CARTAO_CREDITO, etc.) |
| `dataPrevisao` | timestamp | Expected date |
| `dataEfetivacao` | timestamp | Actual date, null until settled |
| `parcela` | integer | Installment number, nullable |
| `totalParcelas` | integer | Total installments, nullable |
| `autorId` | varchar(255) FK | users, nullable |
| `dataInsercao` | timestamp | defaultNow |

**Key decisions**:
- Multiple transactions per accounting entry (split payments: PIX + card on same sale).
- `dataEfetivacao = null` means pending settlement (credit card installments, future receivables).
- `parcela`/`totalParcelas` for installment tracking.

### `fiscalDocuments` (Fiscal Document References)

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar(255) PK | UUID |
| `organizacaoId` | varchar(255) FK | organizations, cascade |
| `vendaId` | varchar(255) FK | sales, set null |
| `lancamentoContabilId` | varchar(255) FK | accountingEntries, set null |
| `tipo` | enum | `NFCE`, `NFE`, `NFSE` |
| `status` | enum | `PENDENTE`, `AUTORIZADA`, `CANCELADA`, `INUTILIZADA` |
| `chaveAcesso` | varchar(44) | 44-digit NFe key, nullable |
| `numero` | varchar(50) | Document number, nullable |
| `serie` | varchar(10) | Nullable |
| `protocolo` | varchar(50) | Authorization protocol, nullable |
| `xmlUrl` | text | URL to XML file |
| `pdfUrl` | text | URL to DANFE PDF |
| `emissorReferencia` | text | ID in 3rd-party service |
| `emissorServico` | text | Service name (NUVEM_FISCAL, FOCUS_NFE) |
| `documentoOrigemId` | varchar(255) FK | Self-reference — original doc that was cancelled/returned |
| `chaveAcessoReferencia` | varchar(44) | Access key of the referenced document (for fiscal cross-reference) |
| `dataEmissao` | timestamp | Nullable |
| `dataInsercao` | timestamp | defaultNow |

**Key decisions**:
- Separate table (not fields on `sales`) because one sale can have multiple fiscal documents (cancellation + reissue, returns).
- No fiscal emission logic — only stores references to 3rd-party emissor.
- `documentoOrigemId` enables document chaining: a cancellation NF references the original NF, a return NF references the sale NF.

---

## Enhanced Table: `productStockTransactions`

**File**: `services/drizzle/schema/products.ts` (existing table, enhanced)

New columns added:

| Column | Type | Notes |
|--------|------|-------|
| `tipo` | enum | `ENTRADA`, `SAIDA`, `AJUSTE`, `DEVOLUCAO` (default `SAIDA`) |
| `motivo` | text | Nullable reason |
| `vendaId` | varchar(255) FK | sales, set null |
| `vendaItemId` | varchar(255) FK | saleItems, set null |
| `saldoAnterior` | doublePrecision | Balance before, nullable |
| `saldoPosterior` | doublePrecision | Balance after, nullable |
| `operadorId` | varchar(255) FK | users, set null |
| `dataInsercao` | timestamp | defaultNow |

Follows the same ledger pattern as `cashbackProgramTransactions` — `saldoAnterior`/`saldoPosterior` snapshots make each movement self-contained for auditing.

---

## New Enums

**Drizzle** (`services/drizzle/schema/enums.ts`):

| Enum | Values |
|------|--------|
| `financialAccountTypeEnum` | CAIXA, BANCO, CARTEIRA_DIGITAL |
| `bankAccountTypeEnum` | CORRENTE, POUPANCA |
| `financialTransactionTypeEnum` | ENTRADA, SAIDA |
| `accountingEntryOriginTypeEnum` | VENDA, MANUAL, ESTORNO |
| `fiscalDocumentTypeEnum` | NFCE, NFE, NFSE |
| `fiscalDocumentStatusEnum` | PENDENTE, AUTORIZADA, CANCELADA, INUTILIZADA |
| `stockMovementTypeEnum` | ENTRADA, SAIDA, AJUSTE, DEVOLUCAO |
| `saleProcessingSourceEnum` | EXTERNO, INTERNO |
| `saleStatusEnum` | ORCAMENTO, CONDICIONAL, CONFIRMADA, FATURADA, CANCELADA |
| `defaultDataSourceEnum` | RECEPTOR, ERP |

**Zod** (`schemas/enums.ts`): Matching Zod enums with `T*` type exports.

---

## Chart of Accounts — Seed Template

When an organization activates ERP mode, a default chart of accounts is copied to their records. Suggested template:

```
1   - ATIVO
1.1   - Caixa
1.2   - Bancos
1.3   - Contas a Receber
1.4   - Estoque
2   - PASSIVO
2.1   - Fornecedores
2.2   - Provisão Cashback
2.3   - Obrigações Fiscais
3   - RECEITAS
3.1   - Receita de Vendas
3.2   - Receita de Serviços
4   - DESPESAS
4.1   - Custo de Mercadorias
4.2   - Despesas Operacionais
4.3   - Despesas de Marketing
```

Implementation: JSON config file or seed function — not a database table.

---

## Files Changed

### Created
- `services/drizzle/schema/financial.ts` — 5 tables with relations and types
- `schemas/financial.ts` — Zod schemas for all financial entities + stock transactions

### Modified
- `services/drizzle/schema/enums.ts` — 10 new pgEnums
- `schemas/enums.ts` — 10 new Zod enums + types
- `services/drizzle/schema/products.ts` — Enhanced `productStockTransactions`
- `services/drizzle/schema/sales.ts` — `processamentoOrigem` + `status` fields + back-relations
- `services/drizzle/schema/organizations.ts` — `origemDadosPadrao` field
- `schemas/organizations.ts` — `origemDadosPadrao` + `recursos.erp` config block
- `services/drizzle/schema/index.ts` — Export for `financial`

---

## Migration

Run `drizzle-kit generate` to produce the migration SQL, then review and apply.

Expected migration output:
- `CREATE TYPE` for 10 new enums
- `CREATE TABLE` for 5 new tables (prefixed `ampmais_`)
- `ALTER TABLE ampmais_sales` — add `origem_processamento` + `status` columns
- `ALTER TABLE ampmais_organizations` — add `origem_dados_padrao` column
- `ALTER TABLE ampmais_product_stock_transactions` — add new columns
- `ALTER TABLE ampmais_fiscal_documents` — add `documento_origem_id` + `chave_acesso_referencia` columns

---

## Sale Lifecycle

### Status Enum

`sales.status` (pgEnum: `ORCAMENTO` | `CONDICIONAL` | `CONFIRMADA` | `FATURADA` | `CANCELADA`, nullable)

Nullable so existing external sales (CRM-only) are unaffected. ERP-mode sales use the full lifecycle:

```
ORCAMENTO ──► CONDICIONAL ──► CONFIRMADA ──► FATURADA
                                    │              │
                                    ▼              ▼
                                CANCELADA      CANCELADA
```

- **ORCAMENTO**: Quote/proposal — no accounting, no stock, no fiscal
- **CONDICIONAL**: Goods reserved for client trial (stock reserved but not decremented)
- **CONFIRMADA**: Sale confirmed — accounting entry + financial transactions generated
- **FATURADA**: Fiscal document emitted (NFCe/NFe) — full chain complete
- **CANCELADA**: Sale cancelled — reversal entries generated

### Returns & Cancellations

**Core principle**: `accountingEntries` are the **immutable source of truth**. The `sales` table is **mutable** (current state).

When a return or cancellation occurs:

```
[1] Return initiated (full or partial)
     │
     ▼
[2] Accounting Entry (ESTORNO)
     D: Sales Revenue (reversal of original credit)
     C: Payment method account (refund)
     valor = refund amount
     │
     ▼
[3] Financial Transaction (SAIDA)
     Refund to client via original payment method
     │
     ▼
[4] Stock Movement (DEVOLUCAO)
     One per returned item
     produto.quantidade re-incremented
     │
     ▼
[5] Direct mutation on sale
     sales.valorTotal -= refund amount
     saleItems.quantidade reduced
     saleItems value fields recalculated
     │
     ▼
[6] Fiscal Document (if applicable)
     Cancellation NF or return NF
     documentoOrigemId → original NF
     chaveAcessoReferencia → original NF access key
```

**Why direct mutation?** The accounting entries already preserve the full audit trail with immutable records. Maintaining denormalized tracking fields (`valorDevolvido`, `quantidadeDevolvida`) on the sale would add complexity to every aggregation query (`SUM(valorTotal - valorDevolvido)` vs simple `SUM(valorTotal)`). The original sale value is always recoverable from the `VENDA`-type accounting entry.

---

## Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| `balanceCheckpoints` | Pre-computed balance snapshots — add when reporting requires it |
| Cashback accounting entries | Cashback ledger is sufficient for v1; contábil integration later |
| Split de vendas (shared bills) | Complex (requires splitting sales, not just payments); v2 |
| Contas a pagar module | Manual entries via `accountingEntries` + `financialTransactions` cover basic expenses; dedicated purchases module later |
| Conciliação bancária | Bank reconciliation is a separate, complex module |
| Open Banking integration | `financialAccounts` fields for bank details are ready; integration logic TBD |

---

## Future Considerations

- **Purchases module**: `purchases` table linked to accounting entries + automatic stock entry (ENTRADA) movements
- **Cashback accounting**: ACUMULO = provision (D: Marketing Expense / C: Cashback Provision); RESGATE = realization
- **Sale splitting**: Shared bills split into N sales at checkout for separate fiscal documents
- **Balance checkpoints**: Pre-computed daily/weekly/monthly snapshots for financial reporting graphs
- **SPED export**: Derived from accounting entries + fiscal documents for regulatory compliance
