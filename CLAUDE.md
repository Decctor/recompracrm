# CLAUDE.md — Codebase Patterns & Conventions

This file documents the architectural patterns, conventions, and "tastes" of this codebase. Follow these patterns when writing new code.

## Tech Stack

- **Package manager**: **npm** (`package-lock.json`). Never pnpm/yarn/bun — Vercel picks the package manager by lockfile, and a foreign one breaks the build on undeclared transitive imports. See *Package Manager* in AGENTS.md.
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Supabase, Drizzle ORM
- **Auth**: Lucia (session-based), `admin: boolean` flag on users for platform admin access
- **UI**: Tailwind CSS v4, Radix UI, shadcn/ui components
- **State**: Custom `useState` + `useCallback` hooks (no react-hook-form)
- **Data fetching**: React Query (`@tanstack/react-query`) + Axios
- **Validation**: Zod
- **Video**: Mux (`@mux/mux-node` server, `@mux/mux-player-react` client)
- **File storage**: Supabase Storage
- **Payments**: Stripe
- **Rich text**: Tiptap v3
- **Toasts**: Sonner
- **Icons**: lucide-react

---

## Database Schema Conventions

**Location**: `/services/drizzle/schema/` (one file per domain)

- Use `newTable` from `./common.ts` (prefixes tables with `ampmais_`)
- Primary keys: `varchar("id", { length: 255 })` with `.$defaultFn(() => crypto.randomUUID())`
- Timestamps: `timestamp("data_insercao").defaultNow().notNull()`
- Portuguese field names in snake_case for DB columns (e.g., `titulo`, `descricao`, `nivel_acesso`)
- camelCase for Drizzle field names (e.g., `nivelAcesso`, `dataInsercao`)
- Foreign keys use `onDelete: "cascade"` where appropriate
- Export `relations`, inferred types (`$inferSelect`, `$inferInsert`), and barrel-export from `schema/index.ts`
- **Enums (Drizzle `pgEnum`)** go in `schema/enums.ts`, not co-located with the table file

---

## Zod Schema Conventions

**Location**: `/schemas/` (one file per domain)

- Every field should have explicit `required_error` and `invalid_type_error` messages
- **Enums (Zod `z.enum`)** go in `/schemas/enums.ts`, not co-located with entity schemas
- Export both the schema and the inferred type: `export const FooEnum = z.enum([...])` + `export type TFooEnum = z.infer<typeof FooEnum>`
- Date fields use `.string().datetime().transform(val => new Date(val))` pattern
- Include `dataInsercao` and computed fields in base schemas, then use `.omit()` in API input schemas to remove them

---

## API Route Conventions

**Location**: `/app/api/` (App Router)

### Migration standard

- New and migrated API routes must live under `/app/api/**/route.ts`; do not add new `pages/api` routes.
- Route files follow four parts in order: input schema, service function, route handler, method export.
- Input/output type names use the operation verb and resource: `TGetSalesInput`, `TCreateSaleOutput`, `TUpdateProductInput`, `TDeleteGoalOutput`.
- Service functions receive typed `input` and `session` when authenticated, do all business/database work, and never read `NextRequest`, cookies, or return `NextResponse`.
- Route handlers read the session with `getCurrentSessionUncached` from `@/lib/authentication/session`, parse query/body input, delegate to the service, and return `NextResponse.json`.
- Export handlers through `appApiHandler`; do not use `apiHandler`, `NextApiRequest`, `NextApiResponse`, or `@/lib/authentication/pages-session` in App Router routes.
- Client query/mutation types must import from `@/app/api/**/route`, never from `@/pages/api/**`.

### GET query params

Parse raw query params as strings in the route handler and transform them in the Zod input schema:

```typescript
const GetFoosInputSchema = z.object({
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
	ids: z
		.string({ invalid_type_error: "Tipo inválido para IDs." })
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	activeOnly: z
		.string({ invalid_type_error: "Tipo inválido para ativo." })
		.optional()
		.nullable()
		.transform((v) => v === "true"),
	periodAfter: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null)),
});
```

Client queries build URLs with `new URLSearchParams()`, omit null/undefined/empty values, join arrays with commas, and serialize dates with `.toISOString()`. Mutation files stay as plain Axios wrappers and do not import React Query hooks.

### Structure

```typescript
// 1. Input schema with explicit type export
const GetFoosInputSchema = z.object({ ... });
export type TGetFoosInput = z.infer<typeof GetFoosInputSchema>;

// 2. Business logic function (pure, no request/auth handling)
async function getFoos({ input }: { input: TGetFoosInput }) {
  // DB queries here
  return { data: { ... }, message: "..." };
}
export type TGetFoosOutput = Awaited<ReturnType<typeof getFoos>>;

// 3. Route handler (auth + parsing + delegation)
async function getFoosRoute(request: NextRequest) {
  const session = await getCurrentSessionUncached();
  if (!session) throw new createHttpError.Unauthorized("...");
  if (!session.user.admin) throw new createHttpError.Forbidden("...");
  const input = GetFoosInputSchema.parse({ ... });
  const result = await getFoos({ input });
  return NextResponse.json(result);
}

// 4. Export via appApiHandler
export const GET = appApiHandler({ GET: getFoosRoute });
```

### Multi-mode GET endpoints

Instead of separate routes, use a single GET with conditional logic:

```typescript
// Response shape: only one field is non-null at a time
return {
	data: {
		byId: singleResult, // when ?id= is provided
		default: listResult, // when listing (with pagination)
	},
	message: "...",
};
```

### Nested payloads for create/update

Parent + children are sent together in one request:

```typescript
const CreateFooInputSchema = z.object({
	foo: FooSchema.omit({ dataInsercao: true, autorId: true }),
	fooChildren: z.array(FooChildSchema.omit({ fooId: true, dataInsercao: true })),
});
```

### Child entity management (insert/update/delete)

Children include optional `id` and `deletar` fields. Use `handleSimpleChildRowsProcessing()` from `/lib/db-utils/` for batch operations in a transaction:

```typescript
await handleSimpleChildRowsProcessing({
	trx: tx,
	table: childTable,
	entities: input.children,
	fatherEntityKey: "parentId",
	fatherEntityId: parentId,
	organizacaoId, // tenancy isolation
});
```

### Response format

Always `{ data: ..., message: "..." }`. Export the return type for client consumption.

---

## Query Hook Conventions

**Location**: `/lib/queries/` (one file per domain)

- Separate fetch functions (private) from hooks (exported)
- Query keys are exposed alongside the hook: `return { ...useQuery({ queryKey, queryFn }), queryKey }`
- Use `byId` suffix for single-entity hooks: `useAdminFooById({ fooId })`
- List hooks include pagination params with debounce: `params`, `updateParams`, `debouncedParams`
- Type the fetch function response using the route's exported output type

```typescript
async function fetchFooById(id: string) {
	const { data } = await axios.get<TGetFoosOutput>(`/api/admin/foos?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("...");
	return result;
}

export function useAdminFooById({ fooId }: { fooId: string }) {
	return {
		...useQuery({ queryKey: ["admin-foo-by-id", fooId], queryFn: () => fetchFooById(fooId) }),
		queryKey: ["admin-foo-by-id", fooId],
	};
}
```

---

## Mutation Conventions

**Location**: `/lib/mutations/` (one file per domain)

- Thin wrappers around Axios calls
- Type inputs/outputs from the API route's exported types
- Functions are named to match the API operation: `createFoo`, `updateFoo`, `deleteFoo`
- No React Query mutation logic here — that goes in the component/modal

---

## State Hook Conventions

**Location**: `/state-hooks/` (one file per entity)

- Named `use-internal-{entity}-state.tsx`
- Define a state schema using Zod (`.omit()` computed fields, `.extend()` with `id` and `deletar`)
- Accept `initialState: Partial<T>` and provide defaults
- Expose: `state`, `updateX`, `addChild`, `removeChild`, `redefineState`, `resetState`
- All updaters wrapped in `useCallback`
- `removeChild` uses soft-delete pattern: if item has `id`, mark `deletar: true`; if new (no `id`), filter out
- Export the return type: `export type TUseInternalFooState = ReturnType<typeof useInternalFooState>`

---

## Modal Conventions

**Location**: `/components/Modals/Internal/{Domain}/`

### Naming

- **`NewFoo.tsx`** — Create modal. Uses blank initial state.
- **`ControlFoo.tsx`** — Edit modal. Fetches existing data via query hook, hydrates state with `redefineState` in `useEffect`.

### Structure

```typescript
type NewFooProps = {
  closeModal: () => void;
  callbacks?: {
    onMutate?: (variables: TInput) => void;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
    onSettled?: () => void;
  };
};

export function NewFoo({ closeModal, callbacks }: NewFooProps) {
  const { state, updateFoo, ... } = useInternalFooState({ initialState: {} });

  const { mutate, isPending } = useMutation({
    mutationKey: ["create-foo"],
    mutationFn: createFoo,
    onMutate: (vars) => callbacks?.onMutate?.(vars),
    onSuccess: (data) => { callbacks?.onSuccess?.(); toast.success(data.message); closeModal(); },
    onError: (err) => { callbacks?.onError?.(err); toast.error(getErrorMessage(err)); },
    onSettled: () => callbacks?.onSettled?.(),
  });

  return (
    <ResponsiveMenu
      menuTitle="NOVO FOO"
      menuActionButtonText="CRIAR"
      menuCancelButtonText="CANCELAR"
      actionFunction={() => mutate(state)}
      actionIsLoading={isPending}
      stateIsLoading={false}
      stateError={null}
      closeMenu={closeModal}
    >
      <FooGeneralBlock foo={state.foo} updateFoo={updateFoo} />
    </ResponsiveMenu>
  );
}
```

### Form Blocks

- Located in `Blocks/` subdirectory within the modal folder
- Each block is a logical group of fields (General, Contact, Content, etc.)
- Receive state slice + updater function as props
- Use `ResponsiveMenuSection` for visual grouping inside modals

---

## Admin Page Conventions

**Location**: `/app/(admin)/admin-dashboard/`

- **Server component** (`page.tsx`): Auth check, redirect if not admin, renders client component
- **Client component** (`{name}-page.tsx`): Main page logic with hooks and state
- Admin dashboard has its own sidebar layout (`layout.tsx` + `AdminSidebar.tsx`)
- Pages render lists/cards with action buttons that open `New*` or `Control*` modals
- No inline editing — all edits happen through modals

---

## Dashboard Hub Conventions

**Location**: `/app/dashboard/_hub/`

- `/dashboard` is an attention hub, not an analytics page. Deep analysis lives in each module (Vendas > Resultados, Financeiro > Visão geral, Campanhas > Estatísticas). Never add filters to the hub.
- Widgets are declared in `registry.tsx` with the `capability` that governs them and are filtered with `filterNavigationItems`, the same function the sidebar and command palette use. A widget the member cannot see must never render, even empty.
- Two kinds: `pendencia` (something that needs action now) and `pulso` (one number for today or the week). Three sizes: `compacto` (number + two rows, the whole card is a link), `lista` (named items, each row may link to its entity, the header carries "Ver todos") and `largo` (full width, for widgets with two internal columns).
- The headline (`headline.tsx`) sits above the sections and is not a registry widget. It carries today's revenue and, when a goal is active, the goal's daily target as a reference line over the same bars. One element, one chart: most organizations have no goal, so the goal must never occupy a card of its own.
- Build every widget from `HubWidget` primitives in `hub-widget.tsx`; each widget owns its own query and its own loading, error and empty states so one failing endpoint blanks only its card.
- Prefer an existing query hook. When the hub needs a shape no module exposes, add a small GET route under the owning resource (e.g. `/api/clients/birthdays`) and its hook in `lib/queries/dashboard-hub.ts`.
- "Today" comes from `useDayKey()` plus `resolveTodayRange()`, never from module-level date constants: the page stays open all day on a counter tablet.

## Public Page Conventions

**Location**: `/app/(external)/`

- No authentication required (session is optional, used for conditional rendering)
- Use `layout.tsx` for shared header/footer
- Server components can read params via `params: Promise<{ id: string }>`
- Access-level enforcement happens at the API layer, not the page layer

---

## Component Conventions

- `components/ui/` — shadcn/ui primitives (don't modify unless necessary)
- `components/Inputs/` — Custom input components (TextInput, VideoInput, etc.)
- `components/Layouts/` — Layout utilities (LoadingComponent, ErrorComponent, HeaderApp)
- `components/Utils/` — Utilities (ResponsiveMenu, ResponsiveMenuSection)
- `components/Sidebar/` — Sidebar components (AppSidebar, AdminSidebar)
- `components/Brand/` — Brand assets (BrandLogo)

---

## Brand Logo Conventions

**Never import a logo file directly.** Use `<BrandLogo>` from `components/Brand/BrandLogo.tsx`:

```tsx
<BrandLogo lockup="horizontal" tone="color-on-dark" fill className="object-contain" />
```

Two axes, named after the industry standard (`utils/svgs/logos/{lockup}-{tone}.svg`):

| `lockup`           | What it shows            | Available `tone`s                       |
| ------------------ | ------------------------ | --------------------------------------- |
| `icon`             | bare symbol              | `color-on-dark`, `black`, `white`, `blue` |
| `icon-badge`       | symbol in blue capsule   | `color`                                 |
| `wordmark`         | text only                | `black`, `white`, `blue`                |
| `horizontal`       | symbol + text, side by side | `color-on-dark`, `black`, `white`, `blue` |
| `horizontal-badge` | capsule + text           | `color-on-light`, `color-on-dark`       |
| `stacked`          | symbol above text        | `color-on-dark`, `black`, `white`, `blue` |

Valid `lockup`/`tone` pairs are enforced by the type — `<BrandLogo lockup="icon-badge" tone="black" />` won't compile.

**The trap the naming exists to prevent:** two of the symbol's five bars are white, so every `color-on-dark` variant partially disappears on a light background. On light backgrounds use a `*-badge` lockup (the blue capsule restores contrast) or a monochrome tone.

The `on-dark`/`on-light` qualifier appears exactly when the asset contains an element whose contrast depends on the background. `*-badge` lockups carry their own background, which is why `icon-badge` is plain `color` — it works on any surface. **Never rebuild a badge by wrapping `icon` in a colored `div`; use `icon-badge` so the radius and blue stay consistent.**

For a dynamic `src` (e.g. `org.logoUrl ?? …`), a raw `<img>` in a satori template (needs `.src`), or passing the asset to another component, use `brandLogoSource(lockup, tone)` instead.

Server-side templates in `lib/brand/` use the parallel `BRAND_LOGOS` registry in `lib/brand/assets.ts` — same axes, same files. Keep the two in sync.

PNG exports exist only where a raster is genuinely required; `public/logo.png` is referenced by absolute URL in JSON-LD, so it must keep that path.

---

## Naming Conventions

- **Files**: PascalCase for components, kebab-case for hooks/utils
- **DB columns**: Portuguese, snake_case (`nivel_acesso`, `data_insercao`)
- **Drizzle fields**: Portuguese, camelCase (`nivelAcesso`, `dataInsercao`)
- **API messages**: Portuguese ("Curso criado com sucesso.", "Acesso restrito a administradores.")
- **UI labels**: Portuguese
- **Types**: Prefix with `T` (e.g., `TCommunityCourseEntity`)
- **Enums**: Suffix with `Enum` (e.g., `CommunityCourseStatusEnum`)
- **State hooks**: Prefix with `useInternal` (e.g., `useInternalCommunityCourseState`)

---

## Portuguese vs. English

English is the language of the code. Portuguese is the language of the data and of everything the
user reads. One question decides every case:

> **Does this name travel as data, or does it only exist inside the code?**

If the name shows up in a `SELECT`, in `console.log(response.data)`, or in a form's state object, it
is **Portuguese**. If it only exists in the implementation, it is **English**.

### 1. Data is Portuguese

DB columns, Drizzle fields, Zod entity schemas, entity-shaped values nested in request/response
bodies, and form state.

```typescript
custoTotal: doublePrecision("custo_total"),            // Drizzle
custoTotal: z.number({ ... }).optional().nullable(),   // Zod entity schema
{ data: { producoes: [{ titulo, entradas, saidas }] } } // API payload
```

### 2. Code is English

Function, component, hook, and type **names**; variables, parameters, files, folders.

```typescript
export function getProductPricingMap({ organizationId, items }) { ... }
const pricingMap = await getProductPricingMap({ ... });
let costedQuantity = 0;
export function ValuationChips({ valores }: ValuationChipsProps) { ... }  // valuation-chips.tsx
```

### 3. API envelope keys are code; nested entity fields are data

Top-level and structural keys that organize an API operation are part of the code contract, so
name them in English. A nested object or array validated by an entity schema keeps that schema's
Portuguese fields. Do not make the whole request body Portuguese merely because it carries data.

```typescript
// Correct — English operation envelope, Portuguese fields inside entity-shaped values
const CreateClientInputSchema = z.object({
	orgId: z.string(),
	client: ClientSchema.pick({ nome: true, telefone: true }),
	customFieldAnswers: z.array(CustomFieldValueInputSchema), // [{ campoId, valor }]
	marketingConsent: z.boolean(),
});

// Wrong — structural keys translated as though they were entity fields
const CreateClientInputSchema = z.object({
	cliente: ClientSchema,
	respostasCampos: z.array(CustomFieldValueInputSchema),
	consentimentoMarketing: z.boolean(),
});
```

The same rule applies to response envelopes: `data`, `pagination`, and operation-specific grouping
keys are English; entities inside them retain their Portuguese fields.

### 4. Whatever extends the entity is data too

A computed block that the API attaches to an entity does not open a new namespace — it extends the
entity, and travels beside `titulo`, `entradas`, `saidas`. Name it in Portuguese.

```typescript
// Correct — extends the returned production
valores: resolveProductionValuation({ production, pricingMap });
// { custoTotal, retornoEsperado, margem, margemPercentual, origemValores }

// Wrong — an English island inside a Portuguese payload
valuation: { totalCost, expectedReturn, margin, marginPercentage, valuationOrigin }
```

### 5. Do not translate a field just because it entered a signature

When a parameter, prop, or internal type carries entity fields, it keeps the entity's names. The
**type name** is English; its **fields** follow the data. Translating buys nothing and forces a
mapping layer that exists only to rename things.

```typescript
// Correct — English type name, Portuguese fields; entity rows go straight in
export type TPricedItem = { produtoId: string; produtoVarianteId?: string | null };
const pricingMap = await getProductPricingMap({ organizationId, items: recipe.insumos });

// Wrong — forces a mapper whose only job is renaming
export type TPricedItem = { productId: string; productVariantId?: string | null };
const items = recipe.insumos.map((i) => ({ productId: i.produtoId, productVariantId: i.produtoVarianteId }));
```

A mapper is only justified when it computes something. `toValuationItem` in
`/lib/productions/valuation.ts` earns its place because it collapses `quantidadeReal ??
quantidadePrevista` into a single `quantidade` — it is not a translation.

### Enum values

Enum values travel as data, so they are Portuguese and SCREAMING_CASE, matching the existing
`pgEnum`/`z.enum` sets: `"RASCUNHO"`, `"CONCLUIDA"`, `"MANUAL"`, `"SNAPSHOT" | "PROJECAO" | "CATALOGO"`.

### Reference implementation

`/lib/productions/valuation.ts` plus `/app/api/productions/route.ts` show these rules together:
English functions and type names, Portuguese fields and payload, no renaming mappers.

---

## Git Conventions

- Commit messages: `feat:`, `fix:`, `refactor:` prefixes
- Keep commits focused on a single concern
