# CLAUDE.md — Codebase Patterns & Conventions

This file documents the architectural patterns, conventions, and "tastes" of this codebase. Follow these patterns when writing new code.

## Tech Stack

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
    byId: singleResult,       // when ?id= is provided
    default: listResult,       // when listing (with pagination)
  },
  message: "..."
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

Children include optional `id` and `deletar` fields. Use `handleAdminSimpleChildRowsProcessing()` from `/lib/db-utils/` for batch operations in a transaction:

```typescript
await handleAdminSimpleChildRowsProcessing({
  trx: tx,
  table: childTable,
  entities: input.children,
  fatherEntityKey: "parentId",
  fatherEntityId: parentId,
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

## Git Conventions

- Commit messages: `feat:`, `fix:`, `refactor:` prefixes
- Keep commits focused on a single concern