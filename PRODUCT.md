# RecompraCRM - Product Documentation

## 1. Product Overview
**RecompraCRM** is a specialized Customer Relationship Management (CRM) and sales automation SaaS developed by Syncroniza. Built with a modern NextJS and TailwindCSS stack, it is designed specifically for local retail businesses (e.g., hardware stores, local commerce) operating via storefront counters and WhatsApp. 

The platform bridges the gap between BI/Analytics, automated lifecycle marketing, and physical point-of-sale operations, enabling small-to-medium teams to execute enterprise-level customer retention strategies.

## 2. Core Modules & Dashboards
The application features a consistent UI pattern across its core modules, typically split into "Estatísticas" (KPIs, graphs, rankings) and "Banco de Dados" (list views with quick-filter badges and detailed entity profiles).

### 2.1 Dashboard (Business Intelligence)
* **Purpose:** High-level overview of business performance.
* **Key Metrics:** Total sales, gross revenue, gross margin, average ticket, daily sales average, and average items per sale.
* **Visuals:** Comparative period filters and dynamic sales trend graphs.

### 2.2 Matriz RFM (Customer Segmentation)
* **Purpose:** Behavioral segmentation based on Recency, Frequency, and Monetary value.
* **Mechanism:** Analyzes the last 12 months of purchasing data to categorize customers into segments (e.g., *Campeões, Clientes Leais, Em Risco, Perdidos*).
* **Integration:** Acts as the brain for the automated campaign engine, triggering actions when customers enter or remain in specific segments.

### 2.3 Vendas (Sales Log)
* **Purpose:** Granular tracking of all transactions.
* **Features:** Links specific sales to sellers, tracks the exact cashback generated/redeemed in that transaction, and maps campaign attribution to prove marketing ROI.

### 2.4 Clientes, Vendedores, Parceiros & Produtos
* **Profiles & Databases:** Each entity has a dedicated database and profile page.
* **Customer Profiles:** Tracks LTV, lifetime duration, preferred buying days/months, and top purchased products.
* **Team Performance:** Sellers and Partners are ranked by revenue generated.
* **Inventory Metrics:** The Products module tracks stock turnover (giro de estoque), low stock warnings, and product-specific revenue generation.

### 2.5 Metas (Goal Management)
* **Purpose:** Financial target distribution.
* **Workflow:** Managers set a global financial goal for a specific period and distribute individual targets down to specific sellers, tracking realization percentages in real-time.

## 3. Marketing Automation & Loyalty
This is the active revenue-generating engine of the platform, turning data into automated customer touchpoints.

### 3.1 Campanhas de Vendas (Sales Campaigns)
* **Purpose:** Automated WhatsApp marketing and retention campaigns.
* **Triggers:** Event-driven activation based on events like `PRIMEIRA_COMPRA`, `NOVA_COMPRA`, `ENTRADA_SEGMENTACAO`, or `PERMANENCIA_SEGMENTACAO`.
* **Actions:** Automated WhatsApp message sending using dynamic templates with native variables (e.g., `{{purchaseValue}}`, `{{cashback_available_balance}}`).
* **Side Effects:** Ability to automatically generate a cashback "gift" upon campaign trigger to incentivize future purchases.
* **Analytics:** Visual conversion funnel (Enviados -> Entregues -> Lidos -> Convertidos) and customizable attribution models (e.g., Last Interaction, 14-day window).

### 3.2 Programa de Cashback (Loyalty Program)
* **Purpose:** Customer retention and financial reward management.
* **Ponto de Interação (Tablet POS UI):** A touch-optimized storefront interface designed to be used at the checkout counter.
    * *Frictionless Entry:* Starts with just the customer's phone number.
    * *Dual Mode:* Can compute a sale + generate cashback, or function purely for redemption (ideal for clients with existing robust ERPs to avoid double-entry).
    * *Flexible Rewards:* Customers can redeem direct discounts (capped at a max percentage) or exchange credits for physical prizes defined by the organization.
    * *Security:* Requires an Operator PIN (*Senha do Operador*) to finalize transactions, ensuring anti-fraud accountability and accurate seller tracking.

## 4. Settings & Architecture
### 4.1 Configurações (Settings)
* **Integrations:** Strategic focus on regional/local ERPs (e.g., Online Software, Cardápio Web) to eliminate friction for the target demographic.
* **WhatsApp Infrastructure:** Offers a dual-connection strategy:
    * *Official Cloud API:* For secure, high-availability template messaging required for automated campaigns.
    * *Unofficial API (Baileys):* A QR-code-based, low-barrier entry point for smaller shops not yet ready for Meta's business bureaucracies.

### 4.2 Atendimentos (Beta / Restricted)
* **Purpose:** 1-on-1 customer service inbox integrated via WhatsApp, currently in a feature-flagged state.
* **Future Scope:** AI Agentic support to automate customer interactions.