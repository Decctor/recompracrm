# Dashboard Information Architecture and Route Migration

## Status

- [x] Plan approved
- [x] Implementation started
- [x] Canonical route migration completed
- [x] Access model aligned
- [x] Sidebar migration completed
- [ ] Verification completed

## Objective

Reorganize the authenticated dashboard around the jobs users perform instead of the current
technical divisions such as `commercial`, `operational`, and `team`.

This migration also replaces the current dashboard URLs. The old routes are internal, are not used
by public QR codes, and do not require a compatibility period. The implementation must therefore be
a clean cutover:

- Do not add redirects for old dashboard paths.
- Do not keep legacy route shims.
- Do not render the same workspace from old and new routes.
- Update every internal link as part of the same migration.
- Remove old route directories after their canonical replacements are working.
- Treat any remaining obsolete dashboard path as unfinished migration work.

## Product and UX principles

- [ ] Organize navigation around recognizable business tasks.
- [ ] Use routes for distinct jobs, permission boundaries, operational queues, or action sets.
- [ ] Use tabs only for alternate views within the same module and user context.
- [ ] Keep `Nova venda` as an action rather than a permanent navigation destination.
- [ ] Use Portuguese labels in the UI and English names in route/code structure.
- [ ] Keep the existing RecompraCRM visual system and restrained product-interface direction.
- [ ] Avoid redesigning individual module content during the route and navigation migration.
- [ ] Make every route-level workspace independently linkable and refresh-safe.
- [ ] Keep the API authoritative for authorization. Sidebar visibility is not a security boundary.

## Target navigation

```text
Início

Vendas
  Histórico
  Pedidos
  Caixa
  Mesas e comandas
  Aprovações

Operação
  Preparo
  Compras
  Produções
  Produtos
  Estoque

Relacionamento
  Clientes
  Carteiras
  Matriz RFM
  Campanhas
  Públicos
  Cashback
  Cupons

Gestão
  Financeiro
  Fiscal
  Metas
  Vendedores
  Parceiros

Canais
  Conversas (Caixa de entrada, Quadro, Estatísticas)
  Ponto de interação
  Loja digital
  Mídia paga

Integrações
Configurações
```

### Navigation decisions

- [ ] Use `Pedidos` instead of the current sales tab label `Atendimento`.
- [x] ~~Keep WhatsApp customer service labeled `WhatsApp Hub` under `Canais`.~~ Superseded: it is the channel-agnostic `Conversas` group under `Canais` (WhatsApp today, Instagram DM next), one page per former tab.
- [ ] Place `Preparo` under `Operação`, not under sales history.
- [ ] Place `Produtos` under `Operação`, while keeping its canonical URL under `catalog`.
- [ ] Place `Aprovações` under `Vendas` in the sidebar for the current scope.
- [ ] Keep the approvals URL generic so it can support other approval handlers later.
- [ ] Keep `Integrações` and `Configurações` as direct destinations near the sidebar footer.

## Canonical route map

### Sales lifecycle

- [x] Move `/dashboard/commercial/sales` to `/dashboard/sales`.
- [x] Move the sales history workspace to `/dashboard/sales`.
- [x] Move the current `atendimento` sales view to `/dashboard/sales/orders`.
- [x] Move the current `preparo` sales view to `/dashboard/operations/preparation`.
- [x] Move the current `aprovacoes` sales view to `/dashboard/approvals`.
- [x] Move `/dashboard/commercial/sales/new-sale` to `/dashboard/sales/new`.
- [x] Move `/dashboard/commercial/sales/bulk-insert` to `/dashboard/sales/import`.
- [x] Move `/dashboard/commercial/sales/[id]` to `/dashboard/sales/[saleId]`.
- [x] Move `/dashboard/commercial/sales/edit/[saleId]` to `/dashboard/sales/[saleId]/edit`.
- [x] Move `/dashboard/commercial/sales/checkout/[saleId]` to `/dashboard/sales/[saleId]/checkout`.
- [x] Move `/dashboard/commercial/cash-sessions` to `/dashboard/sales/cash-sessions`.
- [x] Move `/dashboard/commercial/tabs` to `/dashboard/sales/service-accounts`.
- [x] Move `/dashboard/commercial/tabs/[tabId]` to `/dashboard/sales/service-accounts/[accountId]`.
- [x] Move `/dashboard/commercial/point-of-interaction` to `/dashboard/sales/point-of-interaction`.

### Operations

- [x] Move `/dashboard/operational/purchases` to `/dashboard/purchases`.
- [x] Move `/dashboard/operational/productions` to `/dashboard/production`.
- [x] Move `/dashboard/operational/stocks` to `/dashboard/inventory`.
- [x] Move `/dashboard/operational/stocks/transactions` to `/dashboard/inventory/movements`.
- [x] Move `/dashboard/operational/stocks/lots` to `/dashboard/inventory/lots`.
- [x] Move stock-lot details to `/dashboard/inventory/lots/[lotId]`.
- [x] Move the lot-label preview to `/dashboard/inventory/lots/labels/preview`.
- [x] Move `/dashboard/operational/finances` to `/dashboard/finance`.
- [x] Move `/dashboard/operational/fiscal` to `/dashboard/fiscal`.

### Catalog

- [x] Move `/dashboard/commercial/products` to `/dashboard/catalog/products`.
- [x] Move product details to `/dashboard/catalog/products/[productId]`.
- [x] Move `/dashboard/commercial/shop` to `/dashboard/catalog/store`.

### Customers and relationship

- [x] Move `/dashboard/commercial/clients` to `/dashboard/customers`.
- [x] Move client details to `/dashboard/customers/[customerId]`.
- [x] Move client bulk import to `/dashboard/customers/import`.
- [x] Move `/dashboard/team/client-portfolios` to `/dashboard/customers/portfolios`.
- [x] Move `/dashboard/commercial/segments` to `/dashboard/customers/segments`.
- [x] Move `/dashboard/commercial/campaigns` to `/dashboard/growth/campaigns`.
- [x] Move campaign creation to `/dashboard/growth/campaigns/new`.
- [x] Move campaign details to `/dashboard/growth/campaigns/[campaignId]`.
- [x] Move `/dashboard/commercial/audiences` to `/dashboard/growth/audiences`.
- [x] Move `/dashboard/commercial/cashback-programs` to `/dashboard/growth/cashback`.
- [x] Move cashback program detail/control paths under `/dashboard/growth/cashback`.
- [x] Move `/dashboard/commercial/coupons` to `/dashboard/growth/coupons`.
- [x] Move coupon creation and detail paths under `/dashboard/growth/coupons`.

### Management and channels

- [x] Move `/dashboard/team/goals` to `/dashboard/management/goals`.
- [x] Move `/dashboard/team/sellers` to `/dashboard/management/sellers`.
- [x] Move `/dashboard/commercial/partners` to `/dashboard/management/partners`.
- [x] Move `/dashboard/chats` to `/dashboard/channels/whatsapp`.
- [x] Move `/dashboard/channels/whatsapp` to `/dashboard/conversations` (+ `/board`, `/stats`); both old routes redirect in `next.config.mjs`.
- [x] Move `/dashboard/commercial/marketing` to `/dashboard/channels/paid-media`.
- [ ] Treat Meta Ads as the first provider inside the provider-neutral paid-media workspace.
- [ ] Keep the paid-media route and navigation label independent from Meta, TikTok, Google, or any other provider.
- [ ] Keep `/dashboard/integrations` as the canonical integrations root.
- [ ] Update integration child routes only where necessary for consistency.
- [ ] Keep `/dashboard/settings` as the canonical settings root.

## Route constants and builders

- [x] Create a central route registry, for example `lib/navigation/routes.ts`.
- [x] Add static route constants for every canonical workspace.
- [x] Add typed builders for every entity-detail route.
- [x] Add typed builders for sale edit and checkout routes.
- [x] Add typed builders for nested campaign, coupon, customer, product, account, and lot routes.
- [x] Use route builders in the sidebar configuration.
- [ ] Replace literal route strings in buttons, cards, tables, menus, and empty states.
- [ ] Replace literal route strings in server redirects.
- [ ] Replace literal route strings in mutation-success navigation.
- [ ] Replace literal route strings in breadcrumbs and contextual links.
- [ ] Replace literal route strings in print, integration, and background-flow callbacks where applicable.
- [x] Add unit coverage for dynamic route builders.

## Sales workspace decomposition

- [x] Extract the sales history UI from `sales-page.tsx` into a reusable workspace component.
- [x] Extract the fulfillment board into a sales-orders workspace.
- [x] Extract the preparation board into a preparation workspace.
- [x] Extract the approvals queue into an approvals workspace.
- [x] Remove the four-view `Tabs` container from the sales page.
- [x] Remove `SALES_VIEWS` and the `view` query-state contract.
- [x] Keep `saleId` query state only where the orders workspace needs its details panel.
- [x] Give sales history its own page actions and filters.
- [ ] Give orders its own loading, error, and empty states.
- [ ] Give preparation its own loading, error, and empty states.
- [ ] Give approvals its own loading, error, and empty states.
- [x] Ensure the sales `hasSales` empty-state check only controls sales history.
- [x] Ensure an organization with no historical sales can still open the other permitted workspaces.
- [ ] Add route-specific page metadata.

## Capability and access model

### Foundations

- [x] Create `lib/access/capabilities.ts` for pure capability resolution.
- [x] Create `lib/access/navigation.ts` for permission-aware navigation filtering.
- [x] Create `lib/access/guards.ts` for server-page access enforcement.
- [x] Define stable capability identifiers instead of embedding permission logic in the sidebar.
- [ ] Distinguish organization entitlement from organization feature configuration.
- [ ] Distinguish view permission from mutation permission.
- [ ] Return a structured denial reason: plan restriction, feature disabled, or member permission denied.
- [x] Reuse existing permission resolvers for discounts, integrations, and finance.

### Organization requirements

- [x] Gate orders, preparation, purchases, production, inventory, finance, and fiscal by ERP access.
- [x] Gate cash sessions by `preferencias.sessoesVenda.habilitado`.
- [x] Gate service accounts by ERP access and `preferencias.contasAtendimento.habilitado`.
- [x] Gate campaigns by `recursos.campanhas.acesso`.
- [x] Gate cashback by `recursos.programasCashback.acesso`.
- [x] Gate WhatsApp Hub by `recursos.hubAtendimentos.acesso`.
- [x] Gate integrations by `recursos.integracoes.acesso`.
- [ ] Do not treat `integracaoERP.*` policy values as module entitlements.
- [ ] Do not treat stock-tracking behavior as a substitute for inventory entitlement.

### Member requirements

- [x] Require `vendas.visualizar` for sales history.
- [x] Require `vendas.visualizar` for orders and preparation visibility.
- [ ] Require `vendas.editar` for order and preparation mutations.
- [ ] Require `vendas.criar` for new-sale entry points.
- [ ] Resolve approval visibility through registered approval handlers.
- [x] Require `compras.visualizar` for purchases.
- [x] Use the finance permission resolver for finance visibility and mutations.
- [x] Require `fiscal.visualizar` for fiscal visibility.
- [x] Require `atendimentos.visualizar` for WhatsApp Hub.
- [x] Use integration permission helpers for integration visibility and management.

### Permission gaps

- [ ] Add an optional `producoes` membership-permission block.
- [ ] Add `visualizar`, `criar`, `editar`, and `excluir` production permissions.
- [ ] Add an optional `estoque` membership-permission block.
- [ ] Add `visualizar`, `movimentar`, and `ajustar` inventory permissions.
- [ ] Define legacy fallbacks for memberships whose JSONB predates these blocks.
- [ ] Use `empresa.visualizar` and `empresa.editar` as the temporary legacy fallback where appropriate.
- [ ] Update organization invitation permission forms.
- [ ] Update membership-control permission forms.
- [ ] Add tests for missing, null, partial, and complete permission blocks.

## Page and API authorization

- [x] Pass the complete membership context to the sidebar.
- [x] Apply the same capability identifiers to server pages and navigation.
- [ ] Redirect unauthenticated users to sign-in.
- [ ] Redirect users without a membership to onboarding.
- [ ] Render plan restriction guidance when an organization lacks an entitled resource.
- [ ] Render feature-configuration guidance when an owned optional workflow is disabled.
- [ ] Render unauthorized state when a member cannot view an available resource.
- [ ] Allow read-only rendering when the member may view but may not mutate.
- [ ] Hide or disable forbidden actions according to the existing component convention.
- [ ] Keep API authorization independent and authoritative.
- [x] Add missing `vendas.visualizar` enforcement to sales history.
- [x] Add missing `compras.visualizar` enforcement to purchases.
- [ ] Add production permission enforcement to pages and APIs.
- [ ] Add inventory permission enforcement to pages and APIs.
- [ ] Audit finance page/API alignment.
- [ ] Audit fiscal page/API alignment.
- [ ] Audit approvals query and decision authorization.

## Sidebar implementation

- [x] Replace the flat `SidebarConfig` with a typed nested navigation manifest.
- [ ] Represent icons as `LucideIcon` component types rather than instantiated nodes where practical.
- [x] Add stable IDs to groups and destinations.
- [x] Filter children with the resolved capability context.
- [x] Remove groups that have no visible children.
- [x] Make domain groups expandable.
- [x] Detect the active destination from `usePathname`.
- [x] Use boundary-aware matching so `/dashboard/sales` does not incorrectly win over a more specific child.
- [x] Treat entity detail, edit, checkout, and creation routes as descendants of their owning module.
- [x] Mark active destinations with the sidebar component's active-state API.
- [x] Mark the containing group as active when a descendant is selected.
- [x] Automatically open the group containing the active route.
- [x] Preserve manual open/closed state for inactive groups.
- [x] Rotate the disclosure chevron with a 150 to 250 ms state transition.
- [x] Do not animate layout properties.
- [x] In icon-only mode, make a grouped icon expand the sidebar and open its group.
- [ ] Close the mobile sidebar after destination selection.
- [x] Add `aria-current="page"` to the active destination.
- [x] Ensure disclosure controls expose their expanded state.
- [ ] Verify keyboard traversal through groups and children.
- [ ] Verify long Portuguese labels do not collide with disclosure controls.

## Locked, disabled, and hidden behavior

- [x] Hide destinations when the member lacks permission.
- [x] Hide unavailable plan destinations from ordinary members.
- [ ] Optionally expose unavailable plan destinations to organization administrators as locked discovery items.
- [ ] Show configuration guidance to administrators when the resource is owned but disabled.
- [x] Avoid disabled navigation rows that lead nowhere for ordinary members.
- [ ] Ensure action permissions do not unnecessarily hide viewable workspaces.
- [ ] Define one reusable locked-item treatment if administrator discovery is implemented.

## Module-local secondary navigation

- [ ] Keep inventory overview, movements, and lots in local secondary navigation.
- [x] Keep finance statistics, entries, transactions, accounts, and reconciliation in local secondary navigation for this migration. (Superseded afterwards: promoted to canonical routes by `finance-analytics-and-route-separation-plan.md`.)
- [ ] Keep fiscal documents and configuration in local secondary navigation.
- [ ] Keep production records and recipes in local secondary navigation.
- [ ] Keep purchases and received documents in local secondary navigation.
- [ ] Ensure each local tab preserves its current query-state behavior where useful.
- [x] Record follow-up candidates if a local tab later needs its own permission or deep-link boundary. (Finance recorded and executed in `finance-analytics-and-route-separation-plan.md`.)

## Clean cutover and old-route removal

- [x] Do not add redirects to `next.config.mjs` for the old dashboard paths.
- [x] Do not create compatibility pages at old route locations.
- [x] Do not preserve the old sales `view` query parameter.
- [x] Update all internal links before removing old route files.
- [x] Remove the old `app/dashboard/commercial/sales` route tree after the new sales tree is complete.
- [x] Remove migrated route directories under `app/dashboard/commercial`.
- [x] Remove migrated route directories under `app/dashboard/operational`.
- [x] Remove migrated route directories under `app/dashboard/team` when empty.
- [ ] Remove unused imports and route-specific utilities left behind by the moves.
- [ ] Remove obsolete comments that describe the old route hierarchy.
- [ ] Confirm no duplicate page implementation remains mounted at two URLs.

## Repository-wide link audit

- [x] Search for `/dashboard/commercial/sales` and resolve every result.
- [x] Search for `/dashboard/commercial/cash-sessions` and resolve every result.
- [x] Search for `/dashboard/commercial/tabs` and resolve every result.
- [x] Search for `/dashboard/commercial/products` and resolve every result.
- [x] Search for `/dashboard/commercial/clients` and resolve every result.
- [x] Search for `/dashboard/commercial/campaigns` and resolve every result.
- [x] Search for remaining `/dashboard/commercial/` literals and classify every result.
- [x] Search for `/dashboard/operational/` and resolve every result.
- [x] Search for migrated `/dashboard/team/` literals and resolve every result.
- [ ] Search for `view=atendimento`, `view=preparo`, and `view=aprovacoes`.
- [ ] Search for route construction through string concatenation and replace it with builders.
- [ ] Confirm obsolete path literals are absent from application code, documentation, and tests.

## Verification matrix

### Organization profiles

- [ ] Base CRM organization without ERP.
- [ ] ERP organization with optional workflows disabled.
- [ ] ERP organization with cash sessions enabled.
- [ ] ERP organization with service accounts enabled.
- [ ] ERP organization with cash sessions and service accounts enabled.
- [ ] Hub-only organization.
- [ ] Campaign-enabled organization without ERP.
- [ ] Full-access organization.

### Member profiles

- [ ] Organization owner or administrator.
- [ ] Manager with approval authority.
- [ ] Sales operator.
- [ ] Preparation operator.
- [ ] Purchasing user.
- [ ] Finance-only user.
- [ ] Read-only user.
- [ ] Member without permission for the current module.
- [ ] Legacy membership without the new production and inventory permission blocks.

### Expected behavior for every relevant combination

- [ ] Sidebar shows only appropriate destinations.
- [ ] Active destination and group are correct.
- [ ] Direct canonical URL access matches sidebar visibility.
- [ ] Read-only users can inspect data without forbidden controls.
- [ ] Mutation APIs reject forbidden actions.
- [ ] Plan restriction and feature-disabled states are distinct.
- [ ] Organization switching re-evaluates the current route.
- [ ] Switching into an organization without access does not leave restricted content visible.

## Automated validation

- [ ] Add unit tests for capability resolution.
- [ ] Add unit tests for legacy permission fallbacks.
- [ ] Add unit tests for filtered navigation trees.
- [ ] Add unit tests for active-route matching.
- [x] Add unit tests for dynamic route builders.
- [ ] Add tests proving static sidebar children win over broader parent matches.
- [x] Run `npm run lint`.
- [ ] Run `npm run format:check`.
- [ ] Run relevant focused tests.
- [ ] Run `npm run build`.
- [ ] Run the obsolete-path repository searches after the build.

## Manual validation

- [ ] Verify expanded desktop sidebar behavior.
- [ ] Verify icon-only desktop sidebar behavior.
- [ ] Verify mobile drawer behavior.
- [ ] Verify keyboard navigation and visible focus.
- [ ] Verify browser back and forward navigation.
- [ ] Refresh every canonical workspace route directly.
- [ ] Open sale, customer, product, campaign, account, and lot deep links directly.
- [ ] Verify new-sale, checkout, edit, and import flows.
- [ ] Verify the sales order details panel and its `saleId` query state.
- [ ] Verify local secondary tabs in inventory, finance, fiscal, production, and purchases.
- [ ] Verify long Portuguese labels at narrow sidebar widths.
- [ ] Verify loading, error, empty, and read-only states for the extracted sales workspaces.

## Completion criteria

- [ ] The sales page is exclusively the sales-history workspace.
- [ ] Orders, preparation, and approvals have independent canonical routes.
- [ ] All sidebar destinations use the new route taxonomy.
- [ ] No legacy redirect or compatibility page exists.
- [ ] No old dashboard path remains referenced.
- [ ] No old migrated route directory remains.
- [ ] Navigation visibility considers organization capabilities and member permissions.
- [ ] Page and API guards use the shared capability vocabulary.
- [ ] Expandable groups are active-aware, responsive, and keyboard accessible.
- [ ] Read-only users can view permitted modules without mutation controls.
- [ ] All required automated checks pass.
- [ ] The production build succeeds.

## Out of scope

- Redesigning the contents of each ERP module.
- Changing public QR-code routes.
- Changing public shop URLs.
- Changing API URLs solely to mirror the dashboard information architecture.
- Adding breadcrumbs to every existing page unless needed for the moved route.
- Promoting every module-local tab to a route during this migration.
