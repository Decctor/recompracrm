# Data-Collecting Cronjob System

> **The backbone of RecompraCRM's ERP integrations**

This document provides comprehensive documentation for the data-collecting cronjob system, which synchronizes data from external ERPs to RecompraCRM. It covers all aspects of the sync process, campaign triggering, cashback dynamics, and serves as a guide for adding new integrations.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Entity Synchronization](#entity-synchronization)
   - [Clients](#clients-sync)
   - [Products](#products-sync)
   - [Sellers](#sellers-sync)
   - [Partners](#partners-sync)
   - [Sales & Sale Items](#sales-sync)
4. [Cashback Programs](#cashback-programs)
5. [Campaigns Dynamics](#campaigns-dynamics)
6. [Current Integrations](#current-integrations)
7. [Adding New Integrations](#adding-new-integrations)
8. [Database Schemas](#database-schemas)
9. [Configuration Reference](#configuration-reference)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The data-collecting cronjob runs every 5 minutes and performs the following operations:

1. **Fetches sales data** from external ERPs (currently Online Software)
2. **Syncs entities**: clients, products, sellers, partners, and sales
3. **Processes campaigns**: triggers based on purchase events and cashback thresholds
4. **Manages cashback**: accumulation, generation, and reversal on cancellations
5. **Handles attribution**: links sales to campaign interactions for conversion tracking

### Key File

```
app/api/cron/data-collecting/route.ts
```

### Execution Flow Summary

```
Cron Trigger (every 5 min)
    │
    ├─► Fetch organizations with active integrations
    │
    ├─► For each organization:
    │       ├─► Fetch sales from ERP API
    │       ├─► Validate response schema
    │       ├─► Sync entities (clients, products, sellers, partners)
    │       ├─► Create/update sales and sale items
    │       ├─► Process cashback accumulation
    │       ├─► Trigger applicable campaigns
    │       └─► Execute immediate interactions (WhatsApp)
    │
    └─► Return success response
```

---

## Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL ERP                                   │
│                    (Online Software, CardapioWeb, etc.)                 │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ API Call
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DATA-COLLECTING CRONJOB                           │
│                 app/api/cron/data-collecting/route.ts                    │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Schema Validation (Zod)                                              │
│  2. Entity Sync (Clients, Products, Sellers, Partners)                  │
│  3. Sales Processing (Create/Update/Cancel)                              │
│  4. Cashback Processing (Accumulate/Reverse)                             │
│  5. Campaign Triggering (PRIMEIRA-COMPRA, NOVA-COMPRA, etc.)            │
│  6. Interaction Scheduling/Execution                                     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ Database │  │ WhatsApp │  │  Logs    │
              │ (Neon)   │  │   API    │  │ (utils)  │
              └──────────┘  └──────────┘  └──────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Main Handler | `app/api/cron/data-collecting/route.ts` | Orchestrates the entire sync process |
| Cashback Generator | `lib/cashback/generate-campaign-cashback.ts` | Creates cashback from campaigns |
| Cashback Reversal | `lib/cashback/reverse-sale-cashback.ts` | Reverses cashback on sale cancellation |
| Interaction Processor | `lib/interactions/process-single-interaction.ts` | Sends WhatsApp messages |
| Attribution | `lib/conversions/attribution.ts` | Links sales to campaign interactions |
| Data Connectors | `lib/data-connectors/` | ERP-specific API clients |

---

## Entity Synchronization

### Clients Sync

**Primary Key for Matching:** Client name (`nome`)

**Creation Logic:**
```typescript
IF client name NOT found in organization:
    CREATE new client with:
        - nome (name from ERP)
        - telefone (phone: clientefone OR clientecelular)
        - telefoneBase (normalized for search)
        - email
        - primeiraCompraData = sale date (if valid)
        - ultimaCompraData = sale date
        - analiseRFMTitulo = "CLIENTES RECENTES"

    IF cashback program exists:
        CREATE cashback balance entry for client
```

**Fields Synced:**

| ERP Field | CRM Field | Notes |
|-----------|-----------|-------|
| `clientenome` | `nome` | Primary identifier |
| `clientefone` / `clientecelular` | `telefone` | Phone number |
| `clienteemail` | `email` | Email address |
| - | `primeiraCompraData` | Set on first valid sale |
| - | `ultimaCompraData` | Updated on each sale |
| - | `analiseRFMTitulo` | "CLIENTES RECENTES" for new clients |

**Special Cases:**
- Clients named `"AO CONSUMIDOR"` are skipped (anonymous sales)
- Phone is normalized to `telefoneBase` for consistent searching

---

### Products Sync

**Primary Key for Matching:** Product code (`codigo`)

**Creation Logic:**
```typescript
IF product code NOT found in organization:
    CREATE new product with:
        - codigo (code from ERP)
        - descricao (description)
        - unidade (unit)
        - grupo (group/category)
        - ncm (Brazilian tax classification)
        - tipo (type)
```

**Fields Synced:**

| ERP Field | CRM Field | Notes |
|-----------|-----------|-------|
| `produtocodigo` | `codigo` | Primary identifier |
| `produtodescricao` | `descricao` | Product description |
| `produtounidade` | `unidade` | Unit of measure |
| `produtogrupo` | `grupo` | Product category |
| `produtoncm` | `ncm` | Brazilian NCM tax code |
| `produtotipo` | `tipo` | Product type |

---

### Sellers Sync

**Primary Key for Matching:** Seller name (`nome`)

**Creation Logic:**
```typescript
IF seller name is valid (not empty, "N/A", or "0"):
    IF seller NOT found:
        CREATE new seller with:
            - nome (name)
            - identificador = nome
```

**Fields Synced:**

| ERP Field | CRM Field | Notes |
|-----------|-----------|-------|
| `vendedor` | `nome` | Seller name |
| `vendedor` | `identificador` | Same as name |

---

### Partners Sync

**Primary Key for Matching:** Partner identifier (`identificador`)

**Creation Logic:**
```typescript
IF partner identifier is valid (not empty, "N/A", or "0"):
    IF partner NOT found:
        CREATE new partner with:
            - identificador (from ERP)
            - nome = "NÃO DEFINIDO"
            - cpfCnpj (formatted from identifier)
```

**Fields Synced:**

| ERP Field | CRM Field | Notes |
|-----------|-----------|-------|
| `parceiro` | `identificador` | Primary identifier |
| - | `nome` | Always "NÃO DEFINIDO" initially |
| `parceiro` | `cpfCnpj` | Formatted partner ID |

---

### Sales Sync

**Primary Key for Matching:** External ID (`idExterno`)

**Sale Validity Check:**
```typescript
isValidSale = sale.natureza === "SN01" AND sale.valorTotal > 0
```

**Creation Logic:**
```typescript
IF sale with idExterno NOT found:
    CREATE new sale with all fields
    CREATE sale items (products in the sale)
    PROCESS conversion attribution
    UPDATE client's ultimaCompraData
    TRIGGER applicable campaigns
ELSE:
    CHECK if sale was canceled
    IF was valid AND now canceled:
        REVERSE cashback transactions
        CANCEL unprocessed interactions
    UPDATE sale fields
    RECREATE sale items
```

**Sale Fields:**

| ERP Field | CRM Field | Notes |
|-----------|-----------|-------|
| `idsw` | `idExterno` | Primary external identifier |
| `valor` | `valorTotal` | Total sale value |
| `custo` | `custoTotal` | Total cost |
| `chave` | `chave` | NFe key |
| `documento` | `documento` | Invoice number |
| `modelo` | `modelo` | Invoice model |
| `movimento` | `movimento` | Movement type |
| `natureza` | `natureza` | "SN01" = valid sale |
| `serie` | `serie` | Invoice series |
| `situacao` | `situacao` | Status |
| `tipo` | `tipo` | Sale type |
| `data` | `dataVenda` | Sale date (timezone adjusted) |

**Sale Items Fields:**

| ERP Field | CRM Field | Notes |
|-----------|-----------|-------|
| `quantidade` | `quantidade` | Quantity |
| `valoru` | `valorVendaUnitario` | Unit price |
| `custou` | `valorCustoUnitario` | Unit cost |
| `valorb` | `valorVendaTotalBruto` | Gross total |
| `desconto` | `valorTotalDesconto` | Discount |
| `valor` | `valorVendaTotalLiquido` | Net total |
| `custo` | `valorCustoTotal` | Total cost |
| Multiple | `metadados` | ICMS, CST, CFOP, freight, etc. |

---

## Cashback Programs

### Program Configuration

Cashback programs define how cashback is accumulated and managed:

```typescript
interface CashbackProgram {
    acumuloTipo: "FIXO" | "PERCENTUAL"     // Fixed amount or percentage
    acumuloValor: number                    // Amount or percentage
    acumuloRegraValorMinimo: number         // Minimum sale value
    acumuloPermitirViaIntegracao: boolean   // Allow via ERP sync
    expiracaoRegraValidadeValor: number     // Days until expiration
}
```

### Accumulation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CASHBACK ACCUMULATION                         │
└─────────────────────────────────────────────────────────────────┘

1. CHECK prerequisites:
   - acumuloPermitirViaIntegracao = true
   - isValidSale = true
   - isNewSale = true
   - saleValue >= acumuloRegraValorMinimo

2. CALCULATE accumulated amount:
   IF acumuloTipo === "FIXO":
       accumulatedBalance = acumuloValor
   ELSE IF acumuloTipo === "PERCENTUAL":
       accumulatedBalance = (saleValue * acumuloValor) / 100

3. UPDATE client balance:
   - saldoValorDisponivel += accumulatedBalance
   - saldoValorAcumuladoTotal += accumulatedBalance

4. CREATE transaction record:
   {
       tipo: "ACÚMULO",
       status: "ATIVO",
       valor: accumulatedBalance,
       expiracaoData: now + expiracaoRegraValidadeValor days,
       vendaId: sale.id
   }
```

### Campaign-Generated Cashback

Campaigns can also generate cashback independently of the program:

```typescript
IF campaign.cashbackGeracaoAtivo:
    generateCashbackForCampaign({
        cashbackType: "FIXO" | "PERCENTUAL",
        cashbackValue: campaign.cashbackGeracaoValor,
        saleValue: sale.valor,
        expirationMeasure: "DIAS" | "SEMANAS" | "MESES" | "ANOS",
        expirationValue: campaign.cashbackGeracaoExpiracaoValor
    })
```

### Reversal on Sale Cancellation

When a sale is canceled (natureza changes from "SN01" or valorTotal becomes 0):

```
┌─────────────────────────────────────────────────────────────────┐
│                    CASHBACK REVERSAL                             │
└─────────────────────────────────────────────────────────────────┘

1. FIND all active/consumed transactions linked to the sale

2. FOR each transaction:
   CREATE reversal transaction:
       {
           tipo: "CANCELAMENTO",
           valor: -originalTransaction.valor,
           metadados: {
               transacaoOrigemId: originalTransaction.id,
               motivo: "VENDA_CANCELADA"
           }
       }

   UPDATE original transaction status to "EXPIRADO"

   UPDATE client balance:
       saldoValorDisponivel -= originalTransaction.valorRestante

3. CANCEL unprocessed interactions related to the sale
```

**Implementation:** `lib/cashback/reverse-sale-cashback.ts`

---

## Campaigns Dynamics

### Campaign Triggers

```typescript
enum CampaignTriggerTypes {
    "PRIMEIRA-COMPRA"          // First purchase ever
    "NOVA-COMPRA"              // New purchase by existing client
    "CASHBACK-ACUMULADO"       // Accumulated cashback threshold reached
    "PERMANÊNCIA-SEGMENTAÇÃO"  // Client remains in segment
    "ENTRADA-SEGMENTAÇÃO"      // Client enters segment
    "CASHBACK-EXPIRANDO"       // Cashback about to expire
    "ANIVERSARIO_CLIENTE"      // Client birthday
}
```

### Trigger Processing in Data-Collecting

#### PRIMEIRA-COMPRA (First Purchase)

```
Triggers when:
    - isNewSale = true
    - isNewClient = true
    - isValidSale = true
    - saleClientId exists

Process:
    1. Filter campaigns with PRIMEIRA-COMPRA trigger
    2. Check segmentation (usually "CLIENTES RECENTES")
    3. Validate frequency rules
    4. Schedule or execute interaction
    5. Generate cashback if campaign.cashbackGeracaoAtivo
```

#### NOVA-COMPRA (New Purchase)

```
Triggers when:
    - isNewSale = true
    - isNewClient = false (existing client)
    - isValidSale = true

Validations:
    - saleValue >= campaign.gatilhoNovaCompraValorMinimo
    - client.analiseRFMTitulo matches campaign segmentation

Process:
    1. Filter applicable campaigns
    2. Validate frequency rules per client-campaign pair
    3. Schedule or execute interaction
    4. Generate cashback if enabled
```

#### CASHBACK-ACUMULADO (Accumulated Cashback Threshold)

```
Triggers when:
    - Cashback program allows via integration
    - isNewSale = true
    - isValidSale = true
    - New accumulated balance >= gatilhoNovoCashbackAcumuladoValorMinimo
    - Total balance >= gatilhoTotalCashbackAcumuladoValorMinimo

Process:
    1. Find applicable campaigns
    2. Validate frequency rules
    3. Schedule or execute interaction
    4. Generate FIXO cashback only (not PERCENTUAL)
```

### Frequency Control

Two-level frequency control prevents over-messaging:

```typescript
// Level 1: One-time campaigns (permitirRecorrencia = false)
IF !permitirRecorrencia:
    IF client already has ANY interaction for this campaign:
        SKIP (campaign already ran for this client)

// Level 2: Frequency interval (when recurrence is allowed)
IF permitirRecorrencia AND frequenciaIntervaloValor > 0:
    cutoffDate = now - frequenciaIntervaloValor [frequenciaIntervaloMedida]
    IF client has interaction after cutoffDate:
        SKIP (too soon since last interaction)
```

### Execution Scheduling

```typescript
// Immediate execution: execucaoAgendadaValor = 0
// Scheduled execution: execucaoAgendadaValor > 0

interface SchedulingConfig {
    execucaoAgendadaMedida: "DIAS" | "SEMANAS" | "MESES" | "ANOS"
    execucaoAgendadaValor: number
    execucaoAgendadaBloco: "00:00" | "03:00" | "06:00" | "09:00" |
                           "12:00" | "15:00" | "18:00" | "21:00"
}
```

### Immediate Processing Pipeline

When `execucaoAgendadaValor === 0` and WhatsApp template exists:

```
1. CREATE interaction record in database

2. QUEUE for immediate processing:
   {
       interactionId,
       organizationId,
       client: { id, nome, telefone, email, analiseRFMTitulo },
       campaign: { autorId, whatsappTelefoneId, whatsappTemplate },
       whatsappToken
   }

3. AFTER transaction commits:
   FOR each queued interaction:
       - Build WhatsApp template payload with variables
       - Find or create chat record
       - Insert chat message record
       - Send via WhatsApp API
       - Update interaction.dataExecucao = now
       - Wait 100ms (rate limiting)
```

**Implementation:** `lib/interactions/process-single-interaction.ts`

### Segmentation Matching

Campaigns target specific RFM segments:

```typescript
campaign.segmentacoes = [
    { segmentacao: "CLIENTES RECENTES" },
    { segmentacao: "CLIENTES FREQUENTES" },
    // etc.
]

// At execution time
const meetsSegmentation = campaign.segmentacoes.some(
    s => s.segmentacao === client.analiseRFMTitulo
)
```

---

## Current Integrations

### Online Software

**Status:** Fully implemented

**Configuration:**
```typescript
organization.integracaoConfiguracao = {
    tipo: "ONLINE-SOFTWARE",
    token: string  // API authentication token
}
```

**API Endpoint:**
```
POST https://onlinesoftware.com.br/planodecontas/apirestweb/vends/listvends.php
Body: {
    token: string,
    rotina: "listarVendas001",
    dtinicio: "DDMMYYYY",
    dtfim: "DDMMYYYY"
}
```

**Schema:** `schemas/online-importation.schema.ts`

### CardapioWeb

**Status:** Partially implemented

**Location:** `lib/data-connectors/cardapio-web/`

**Available Functions:**
- `getCardapioWebOrderHistory()` - Fetch order history
- `getCardapioWebOrderDetails()` - Not yet implemented

---

## Adding New Integrations

> **Integrator has no API and will expose database views instead?** Hand them
> [`INTEGRATOR-DB-VIEWS.md`](./INTEGRATOR-DB-VIEWS.md) (full spec) or its short version
> [`INTEGRATOR-DB-VIEWS-COMPACT.md`](./INTEGRATOR-DB-VIEWS-COMPACT.md) — the vendor-agnostic view contract
> (required views, columns, status/cancellation rules, query patterns, access and homologation
> checklist). The connector built on top of it follows the same steps below.

### Step 1: Create Integration Schema

Create a Zod schema for validating the ERP API response:

```typescript
// schemas/[erp-name]-importation.schema.ts

import { z } from "zod"

export const [ERPName]SaleSchema = z.object({
    // External sale ID (required - used as primary key)
    externalId: z.string(),

    // Client information
    clientName: z.string(),
    clientPhone: z.string().optional(),
    clientEmail: z.string().optional(),

    // Sale information
    saleDate: z.string(),  // Define format
    totalValue: z.number(),
    totalCost: z.number().optional(),

    // Status information
    status: z.string(),    // Map to "SN01" equivalent

    // Seller/Partner (optional)
    sellerName: z.string().optional(),
    partnerId: z.string().optional(),

    // Sale items
    items: z.array(z.object({
        productCode: z.string(),
        productDescription: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
        totalPrice: z.number(),
        // Add ERP-specific fields
    })),

    // Add any ERP-specific fields
})

export const [ERPName]ImportationSchema = z.array([ERPName]SaleSchema)

export type T[ERPName]Sale = z.infer<typeof [ERPName]SaleSchema>
```

### Step 2: Add Integration Configuration Type

Data-source connections live in the `integrations` table (one row per connection, N active
connections of the same type per organization are supported). Add the new variant to the
discriminated union in `schemas/integrations.ts` and the new value to the Drizzle/Zod enums:

```typescript
// schemas/integrations.ts

export const [ErpName]IntegrationConfigSchema = z.object({
    tipo: z.literal("[ERP-NAME]"),
    apiKey: z.string(),
    apiSecret: z.string().optional(),
    baseUrl: z.string().optional(),
    // Add ERP-specific config fields
});

// Add it to DataSourceIntegrationConfigSchema and IntegrationConfigSchema unions.
```

Also register the type in:

- `services/drizzle/schema/enums.ts` → `integrationTypeEnum` (requires a manual
  `ALTER TYPE integration_type ADD VALUE` migration, applied via `scripts/apply-sql-migration.ts`);
- `schemas/enums.ts` → `IntegrationTipoEnum` and `DataSourceIntegrationTipoEnum`;
- `lib/integrations/data-sources.ts` → `DATA_SOURCE_INTEGRATION_TYPES` (this is what makes the
  cron pick the connection up) and `deriveDataSourceRefExterno` (return the provider's stable
  account id, when it has one);
- `lib/integrations/mask.ts` → `maskIntegrationConfig` (mask every secret of the new variant).

### Step 3: Create Data Connector

Create a module for the ERP API client:

```typescript
// lib/data-connectors/[erp-name]/index.ts

import axios from "axios"
import { T[ERPName]Sale, [ERPName]ImportationSchema } from "@/schemas/[erp-name]-importation.schema"

interface [ERPName]Config {
    apiKey: string
    apiSecret?: string
    baseUrl?: string
}

export async function fetch[ERPName]Sales(
    config: [ERPName]Config,
    startDate: Date,
    endDate: Date
): Promise<T[ERPName]Sale[]> {
    const response = await axios.get(`${config.baseUrl}/sales`, {
        headers: {
            "Authorization": `Bearer ${config.apiKey}`,
        },
        params: {
            start: formatDate(startDate),
            end: formatDate(endDate),
        }
    })

    // Validate response
    const validated = [ERPName]ImportationSchema.parse(response.data)
    return validated
}

// lib/data-connectors/[erp-name]/types.ts
// Additional type definitions if needed
```

### Step 4: Create Field Mapper

Map ERP-specific fields to CRM fields:

```typescript
// lib/data-connectors/[erp-name]/mapper.ts

import { T[ERPName]Sale } from "@/schemas/[erp-name]-importation.schema"

export function mapToInternalFormat(erpSale: T[ERPName]Sale) {
    return {
        // Sale fields
        idExterno: erpSale.externalId,
        valorTotal: erpSale.totalValue,
        custoTotal: erpSale.totalCost ?? 0,
        dataVenda: parseDate(erpSale.saleDate),

        // Validity check - map ERP status to valid/invalid
        isValidSale: mapStatusToValidity(erpSale.status),

        // Client fields
        clienteNome: erpSale.clientName,
        clienteTelefone: erpSale.clientPhone ?? "",
        clienteEmail: erpSale.clientEmail ?? "",

        // Seller/Partner
        vendedorNome: erpSale.sellerName ?? "",
        parceiroIdentificador: erpSale.partnerId ?? "",

        // Items
        items: erpSale.items.map(item => ({
            produtoCodigo: item.productCode,
            produtoDescricao: item.productDescription,
            quantidade: item.quantity,
            valorVendaUnitario: item.unitPrice,
            valorVendaTotalLiquido: item.totalPrice,
            // Map additional fields
        }))
    }
}

function mapStatusToValidity(status: string): boolean {
    // Map ERP-specific status to boolean
    // Example: "completed" = true, "canceled" = false
    return status === "completed"
}
```

### Step 5: Register the Connector in the Dispatcher

The cron (`app/api/cron/data-collecting/route.ts` → `runDataCollectingV2`) loads the **active
data-source rows from `integrations`** via `getActiveDataSourceIntegrations` and runs **one batch
per connection** (an organization with N connections runs N batches). You don't touch the cron —
you register the connector in the dispatcher:

```typescript
// lib/data-connectors/index.ts

async function fetchConnectorBatch(input: TDataConnectorFetchInput) {
    // ...existing branches...

    if (input.config.tipo === "[ERP-NAME]") {
        return fetch[ErpName]ImportBatch({
            organizationId: input.organizationId,
            // integrationId identifies the `integrations` row — token refreshes are row-scoped:
            // update THAT row's `configuracao`, never the organization.
            integrationId: input.integrationId,
            config: input.config,
            window: input.window,
        })
    }
}
```

Bookkeeping the pipeline does for you, per connection row:

- `integrations.dataUltimaSincronizacao`, `status` and `ultimoErro` are written at the end of each
  run (success → `CONECTADO`; failure → `ERRO`; failed token refresh → `EXPIRADO`);
- every imported sale is stamped with `sales.integracaoId` (provenance). A sale found by the same
  `idExterno` but owned by another connection is **not** touched (fail-closed collision, reported
  in the run summary).

### Step 6: Reuse Existing Sync Logic

The core sync logic can be reused across integrations:

```typescript
// lib/data-collecting/process-sale.ts

export async function processSale(organization: Organization, sale: MappedSale) {
    return await db.transaction(async (tx) => {
        // 1. Sync client
        const clientId = await syncClient(tx, organization, sale)

        // 2. Sync seller
        const sellerId = await syncSeller(tx, organization, sale)

        // 3. Sync partner
        const partnerId = await syncPartner(tx, organization, sale)

        // 4. Check if sale exists
        const existingSale = await findSaleByExternalId(tx, organization, sale.idExterno)

        if (existingSale) {
            // Update existing sale
            await updateSale(tx, existingSale, sale, clientId, sellerId, partnerId)
        } else {
            // Create new sale
            await createSale(tx, organization, sale, clientId, sellerId, partnerId)

            // Process campaigns for new sales
            await processCampaigns(tx, organization, sale, clientId)
        }
    })
}
```

### Step 7: Testing Checklist

Before deploying a new integration:

- [ ] Schema validation passes for all API response variations
- [ ] Client sync creates new clients correctly
- [ ] Client sync matches existing clients by name
- [ ] Product sync creates products with correct codes
- [ ] Seller sync handles empty/invalid names
- [ ] Partner sync handles empty/invalid identifiers
- [ ] Sale creation includes all required fields
- [ ] Sale items are created with correct product links
- [ ] Sale cancellation triggers cashback reversal
- [ ] PRIMEIRA-COMPRA campaign triggers for new clients
- [ ] NOVA-COMPRA campaign triggers for existing clients
- [ ] CASHBACK-ACUMULADO triggers at correct thresholds
- [ ] Immediate interactions send WhatsApp messages
- [ ] Scheduled interactions are created correctly
- [ ] Error handling logs issues without crashing

---

## Database Schemas

### Core Tables

#### `integrations` (data-source connections)

```typescript
{
    id: string (PK)                       // Provenance target of sales.integracaoId
    organizacaoId: string (FK)
    tipo: "ONLINE-SOFTWARE" | "CARDAPIO-WEB" | "NUVEM-SHOP" | "IFOOD" | "BLING" | "[NEW-TYPE]" | ...
    ativo: boolean                        // Soft delete: disconnect sets false + dataDesativacao
    apelido: string | null                // Disambiguates N connections of the same type
    refExterno: string | null             // Stable external account id (storeId, merchantId...)
    configuracao: {
        tipo: string
        token?: string
        apiKey?: string
        // Integration-specific fields (Zod discriminated union in schemas/integrations.ts)
    }
    status: "CONECTADO" | "EXPIRADO" | "ERRO"
    ultimoErro: string | null
    dataUltimaSincronizacao: timestamp    // Written by the pipeline after each run
    dataDesativacao: timestamp | null
}
```

> The legacy inline columns (`organizations.integracaoTipo`/`integracaoConfiguracao`/
> `integracaoDataUltimaSincronizacao`) are frozen and pending removal — see
> `docs/dev-planning/data-source-integrations-migration-plan.md`.

#### `clients`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    nome: string                          // Primary key for integration matching
    telefone: string
    telefoneBase: string                  // Normalized for search
    email: string
    primeiraCompraData: timestamp
    primeiraCompraId: string (FK)
    ultimaCompraData: timestamp
    ultimaCompraId: string (FK)
    analiseRFMTitulo: string             // RFM classification
}
```

#### `sales`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    clienteId: string (FK, nullable)
    idExterno: string                     // External ERP ID - PRIMARY KEY FOR MATCHING
    valorTotal: number
    custoTotal: number
    vendedorNome: string
    vendedorId: string (FK)
    parceiro: string
    parceiroId: string (FK)
    chave: string
    documento: string
    modelo: string
    movimento: string
    natureza: string                      // "SN01" = valid sale
    serie: string
    situacao: string
    tipo: string
    dataVenda: timestamp
    atribuicaoProcessada: boolean
    atribuicaoCampanhaPrincipalId: string (FK)
    atribuicaoInteracaoId: string (FK)
}
```

#### `saleItems`

```typescript
{
    id: string (PK)
    vendaId: string (FK)
    clienteId: string (FK)
    produtoId: string (FK)
    quantidade: number
    valorVendaUnitario: number
    valorCustoUnitario: number
    valorVendaTotalBruto: number
    valorTotalDesconto: number
    valorVendaTotalLiquido: number
    valorCustoTotal: number
    metadados: JSONB                      // Tax info (ICMS, CST, CFOP, etc.)
}
```

#### `products`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    codigo: string                        // Primary key for integration matching
    descricao: string
    unidade: string
    quantidade: number
    precoVenda: number
    precoCusto: number
    ncm: string
    tipo: string
    grupo: string
}
```

#### `sellers`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    ativo: boolean
    nome: string                          // Primary key for integration matching
    identificador: string
    telefone: string
    email: string
}
```

#### `partners`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    identificador: string                 // Primary key for integration matching
    nome: string
    cpfCnpj: string
}
```

### Cashback Tables

#### `cashbackPrograms`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    acumuloTipo: "FIXO" | "PERCENTUAL"
    acumuloValor: number
    acumuloRegraValorMinimo: number
    acumuloPermitirViaIntegracao: boolean
    expiracaoRegraValidadeValor: number
}
```

#### `cashbackProgramBalances`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    clienteId: string (FK)
    programaId: string (FK)
    saldoValorDisponivel: number
    saldoValorAcumuladoTotal: number
    saldoValorResgatadoTotal: number
}
```

#### `cashbackProgramTransactions`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    clienteId: string (FK)
    vendaId: string (FK)
    vendaValor: number
    programaId: string (FK)
    status: "ATIVO" | "CONSUMIDO" | "EXPIRADO"
    tipo: "ACÚMULO" | "RESGATE" | "CANCELAMENTO"
    valor: number
    valorRestante: number
    saldoValorAnterior: number
    saldoValorPosterior: number
    expiracaoData: timestamp
    campanhaId: string (FK)
    metadados: JSONB {
        transacaoOrigemId?: string
        motivo?: string
    }
}
```

### Campaign Tables

#### `campaigns`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    ativo: boolean
    titulo: string
    descricao: string
    gatilhoTipo: CampaignTriggerTypeEnum
    gatilhoNovaCompraValorMinimo: number
    gatilhoNovoCashbackAcumuladoValorMinimo: number
    gatilhoTotalCashbackAcumuladoValorMinimo: number
    execucaoAgendadaMedida: "DIAS" | "SEMANAS" | "MESES" | "ANOS"
    execucaoAgendadaValor: number
    execucaoAgendadaBloco: string
    permitirRecorrencia: boolean
    frequenciaIntervaloValor: number
    frequenciaIntervaloMedida: string
    whatsappTelefoneId: string
    whatsappTemplateId: string (FK)
    cashbackGeracaoAtivo: boolean
    cashbackGeracaoTipo: "FIXO" | "PERCENTUAL"
    cashbackGeracaoValor: number
    cashbackGeracaoExpiracaoMedida: string
    cashbackGeracaoExpiracaoValor: number
}
```

#### `interactions`

```typescript
{
    id: string (PK)
    organizacaoId: string (FK)
    clienteId: string (FK)
    campanhaId: string (FK)
    titulo: string
    descricao: string
    tipo: "ENVIO-MENSAGEM" | "ENVIO-EMAIL" | "LIGAÇÃO" | "ATENDIMENTO"
    agendamentoDataReferencia: string     // YYYY-MM-DD
    agendamentoBlocoReferencia: string    // "00:00", "03:00", etc.
    dataInsercao: timestamp
    dataExecucao: timestamp               // NULL until executed
    metadados: JSONB
}
```

---

## Configuration Reference

### Time Unit Mapping

```typescript
// lib/dates.ts
export const DASTJS_TIME_DURATION_UNITS_MAP = {
    "DIAS": "day",
    "SEMANAS": "week",
    "MESES": "month",
    "ANOS": "year"
}
```

### Scheduling Time Blocks

Available time blocks for scheduled interactions:

```typescript
"00:00" | "03:00" | "06:00" | "09:00" | "12:00" | "15:00" | "18:00" | "21:00"
```

### RFM Classifications

```typescript
"CLIENTES RECENTES"      // New clients
"CLIENTES FREQUENTES"    // Frequent buyers
"CLIENTES FIÉIS"         // Loyal customers
"CLIENTES EM RISCO"      // At-risk customers
"CLIENTES PERDIDOS"      // Lost customers
// Add organization-specific segments
```

---

## Troubleshooting

### Common Issues

#### 1. Sales not syncing

**Check:**
- Organization has an ACTIVE row in `integrations` (`ativo = true`, data-source `tipo`)
- The row's `configuracao` has valid credentials and `configuracao.tipo` matches the row's `tipo`
- The row's `status`/`ultimoErro` (EXPIRADO = token refresh failing; ERRO = last run failed)
- ERP API is accessible and returning data
- Schema validation is passing (check logs in `utils` table)

#### 2. Duplicate clients being created

**Cause:** Client name matching is case-sensitive and exact

**Solution:** Ensure ERP returns consistent client names. Consider normalizing names in the mapper.

#### 3. Campaigns not triggering

**Check:**
- Campaign is `ativo = true`
- Client's RFM segment matches campaign `segmentacoes`
- Frequency rules allow execution
- For NOVA-COMPRA: Sale value >= `gatilhoNovaCompraValorMinimo`
- For CASHBACK-ACUMULADO: Balance thresholds are met

#### 4. WhatsApp messages not sending

**Check:**
- `execucaoAgendadaValor = 0` (immediate execution)
- Campaign has `whatsappTemplateId` set
- WhatsApp connection is active
- Template variables match expected format

#### 5. Cashback not accumulating

**Check:**
- Cashback program has `acumuloPermitirViaIntegracao = true`
- Sale is valid (`natureza = "SN01"`, `valorTotal > 0`)
- Sale value >= `acumuloRegraValorMinimo`

### Logging

Raw API responses are logged to the `utils` table for debugging:

```typescript
await tx.insert(utils).values({
    id: createId(),
    tipo: "[ERP-NAME]-importation-log",
    dados: { sales: rawApiResponse }
})
```

### Error Handling

Errors are caught per-organization to prevent one failure from affecting others:

```typescript
for (const organization of organizations) {
    try {
        await processOrganization(organization)
    } catch (error) {
        console.error(`Error processing ${organization.id}:`, error)
        // Log to utils table
        // Continue to next organization
    }
}
```

---

## File Reference

| File | Purpose |
|------|---------|
| `app/api/cron/data-collecting/route.ts` | Main cronjob handler |
| `lib/cashback/generate-campaign-cashback.ts` | Campaign cashback generation |
| `lib/cashback/reverse-sale-cashback.ts` | Cashback reversal on cancellation |
| `lib/interactions/process-single-interaction.ts` | WhatsApp message sending |
| `lib/conversions/attribution.ts` | Campaign attribution logic |
| `schemas/online-importation.schema.ts` | Online Software API schema |
| `services/drizzle/schema/campaigns.ts` | Campaign entity definition |
| `services/drizzle/schema/cashback-programs.ts` | Cashback program definitions |
| `services/drizzle/schema/organizations.ts` | Organization & integration config |
| `lib/data-connectors/` | ERP-specific API clients |
| `lib/dates.ts` | Date utilities and time unit mapping |

---

## Appendix: Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA-COLLECTING COMPLETE FLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────┐
    │   CRON TRIGGER     │
    │   (every 5 min)    │
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  Fetch orgs with   │
    │  active integrations│
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │  For each org:     │
    │  ┌──────────────┐  │
    │  │ Fetch ERP    │  │
    │  │ sales data   │  │
    │  └──────┬───────┘  │
    │         │          │
    │         ▼          │
    │  ┌──────────────┐  │
    │  │ Validate     │  │
    │  │ schema       │  │
    │  └──────┬───────┘  │
    │         │          │
    │         ▼          │
    │  ┌──────────────┐  │
    │  │ For each     │◄─┼──────────────────────────────────┐
    │  │ sale:        │  │                                  │
    │  └──────┬───────┘  │                                  │
    │         │          │                                  │
    └─────────┼──────────┘                                  │
              │                                              │
              ▼                                              │
    ┌─────────────────────────────────────────────────────┐ │
    │              DATABASE TRANSACTION                    │ │
    │  ┌───────────────────────────────────────────────┐  │ │
    │  │                                               │  │ │
    │  │  ┌─────────────┐    ┌─────────────┐          │  │ │
    │  │  │ Sync Client │    │ Sync Seller │          │  │ │
    │  │  └──────┬──────┘    └──────┬──────┘          │  │ │
    │  │         │                  │                  │  │ │
    │  │  ┌──────┴──────┐    ┌──────┴──────┐          │  │ │
    │  │  │ Sync Partner│    │ Check Sale  │          │  │ │
    │  │  └──────┬──────┘    │ Exists?     │          │  │ │
    │  │         │           └──────┬──────┘          │  │ │
    │  │         │                  │                  │  │ │
    │  │         │           ┌──────┴──────┐          │  │ │
    │  │         │           │   YES  │ NO │          │  │ │
    │  │         │           │        │    │          │  │ │
    │  │         │           ▼        ▼    │          │  │ │
    │  │         │    ┌────────┐ ┌────────┐│          │  │ │
    │  │         │    │ Update │ │ Create ││          │  │ │
    │  │         │    │ Sale   │ │ Sale   ││          │  │ │
    │  │         │    └───┬────┘ └───┬────┘│          │  │ │
    │  │         │        │          │     │          │  │ │
    │  │         │        ▼          │     │          │  │ │
    │  │         │   ┌────────┐      │     │          │  │ │
    │  │         │   │Canceled│      │     │          │  │ │
    │  │         │   │  ?     │      │     │          │  │ │
    │  │         │   └───┬────┘      │     │          │  │ │
    │  │         │       │YES        │     │          │  │ │
    │  │         │       ▼           │     │          │  │ │
    │  │         │  ┌─────────┐      │     │          │  │ │
    │  │         │  │ Reverse │      │     │          │  │ │
    │  │         │  │Cashback │      │     │          │  │ │
    │  │         │  └─────────┘      │     │          │  │ │
    │  │         │                   │     │          │  │ │
    │  │         │                   ▼     │          │  │ │
    │  │         │            ┌───────────┐│          │  │ │
    │  │         │            │ Create    ││          │  │ │
    │  │         │            │Sale Items ││          │  │ │
    │  │         │            └─────┬─────┘│          │  │ │
    │  │         │                  │      │          │  │ │
    │  │         │                  ▼      │          │  │ │
    │  │         │            ┌───────────┐│          │  │ │
    │  │         │            │ Process   ││          │  │ │
    │  │         │            │Attribution││          │  │ │
    │  │         │            └─────┬─────┘│          │  │ │
    │  │         │                  │      │          │  │ │
    │  │         │                  ▼      │          │  │ │
    │  │         │            ┌───────────┐│          │  │ │
    │  │         │            │ Update    ││          │  │ │
    │  │         │            │ Client    ││          │  │ │
    │  │         │            │lastPurchase│          │  │ │
    │  │         │            └─────┬─────┘│          │  │ │
    │  │         │                  │      │          │  │ │
    │  │         │                  ▼      │          │  │ │
    │  │         │     ┌────────────────────────┐     │  │ │
    │  │         │     │   CAMPAIGN PROCESSING  │     │  │ │
    │  │         │     ├────────────────────────┤     │  │ │
    │  │         │     │ ┌──────────────────┐   │     │  │ │
    │  │         │     │ │ PRIMEIRA-COMPRA? │   │     │  │ │
    │  │         │     │ │ (new client)     │   │     │  │ │
    │  │         │     │ └────────┬─────────┘   │     │  │ │
    │  │         │     │          │             │     │  │ │
    │  │         │     │ ┌────────┴─────────┐   │     │  │ │
    │  │         │     │ │ NOVA-COMPRA?     │   │     │  │ │
    │  │         │     │ │ (existing client)│   │     │  │ │
    │  │         │     │ └────────┬─────────┘   │     │  │ │
    │  │         │     │          │             │     │  │ │
    │  │         │     │ ┌────────┴─────────┐   │     │  │ │
    │  │         │     │ │CASHBACK-ACUMULADO│   │     │  │ │
    │  │         │     │ │ (threshold met)  │   │     │  │ │
    │  │         │     │ └────────┬─────────┘   │     │  │ │
    │  │         │     │          │             │     │  │ │
    │  │         │     │          ▼             │     │  │ │
    │  │         │     │ ┌──────────────────┐   │     │  │ │
    │  │         │     │ │ Create           │   │     │  │ │
    │  │         │     │ │ Interactions     │   │     │  │ │
    │  │         │     │ └────────┬─────────┘   │     │  │ │
    │  │         │     │          │             │     │  │ │
    │  │         │     │          ▼             │     │  │ │
    │  │         │     │ ┌──────────────────┐   │     │  │ │
    │  │         │     │ │ Generate Campaign│   │     │  │ │
    │  │         │     │ │ Cashback (if on) │   │     │  │ │
    │  │         │     │ └──────────────────┘   │     │  │ │
    │  │         │     └────────────────────────┘     │  │ │
    │  │         │                                    │  │ │
    │  └─────────┼────────────────────────────────────┘  │ │
    │            │                                       │ │
    └────────────┼───────────────────────────────────────┘ │
                 │                                         │
                 ▼                                         │
    ┌────────────────────────────────────────────────┐    │
    │         AFTER TRANSACTION COMMITS              │    │
    │  ┌──────────────────────────────────────────┐  │    │
    │  │ For each immediate interaction:          │  │    │
    │  │  ├─ Build WhatsApp template payload      │  │    │
    │  │  ├─ Find/create chat record              │  │    │
    │  │  ├─ Insert chat message                  │  │    │
    │  │  ├─ Send WhatsApp message                │  │    │
    │  │  ├─ Update interaction.dataExecucao      │  │    │
    │  │  └─ Wait 100ms (rate limiting)           │  │    │
    │  └──────────────────────────────────────────┘  │    │
    └────────────────────────────────────────────────┘    │
                 │                                         │
                 │         Next sale                       │
                 └─────────────────────────────────────────┘
```

---

*Document version: 1.0*
*Last updated: January 2026*
