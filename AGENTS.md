# Agent.md — AI Agent Guidelines for This Codebase

This file provides instructions for AI agents working on this codebase. Read CLAUDE.md first for architectural patterns.

---

## Before Writing Code

1. **Read existing patterns first.** Before creating a new feature, find a similar existing feature and study its structure (schema, API, state hook, modals, pages).
2. **Check `schemas/enums.ts`** for existing enum values before creating new ones.
3. **Check `lib/db-utils/`** for existing utility functions before writing custom batch operations.
4. **Check `components/Modals/Internal/`** for the correct modal naming convention (New vs Control).

---

## Creating a New Feature (Checklist)

When building a new admin feature, create files in this order:

### 1. Database Schema
- [ ] Create `/services/drizzle/schema/{domain}.ts`
- [ ] Add pgEnums to `/services/drizzle/schema/enums.ts`
- [ ] Add `export * from "./{domain}"` to `/services/drizzle/schema/index.ts`

### 2. Zod Schemas
- [ ] Create `/schemas/{domain}.ts`
- [ ] Add Zod enums to `/schemas/enums.ts`
- [ ] Include `required_error` and `invalid_type_error` on every field

### 3. API Routes
- [ ] Create `/app/api/admin/{domain}/{entity}/route.ts`
- [ ] Follow the 4-part pattern: Input Schema → Business Logic → Route Handler → Export
- [ ] Use multi-mode GET (byId + default list)
- [ ] Use nested payloads for parent+children operations
- [ ] Use `handleAdminSimpleChildRowsProcessing` for child entity batch operations
- [ ] Export all input/output types

### 4. Client Queries & Mutations
- [ ] Create `/lib/queries/{domain}.ts` with query hooks (expose `queryKey`)
- [ ] Create `/lib/mutations/{domain}.ts` with typed mutation functions

### 5. State Hooks
- [ ] Create `/state-hooks/use-internal-{entity}-state.tsx`
- [ ] Include soft-delete pattern for child arrays (`deletar: true`)
- [ ] Expose `state`, `updateX`, `addChild`, `removeChild`, `redefineState`, `resetState`

### 6. Modals
- [ ] Create `/components/Modals/Internal/{Domain}/New{Entity}.tsx`
- [ ] Create `/components/Modals/Internal/{Domain}/Control{Entity}.tsx` (loads data, hydrates with `redefineState`)
- [ ] Create form blocks in `/components/Modals/Internal/{Domain}/Blocks/`
- [ ] Accept `callbacks?: { onMutate?, onSuccess?, onError?, onSettled? }` prop

### 7. Admin Pages
- [ ] Create `/app/(admin)/admin-dashboard/{domain}/page.tsx` (server component with auth check)
- [ ] Create `/app/(admin)/admin-dashboard/{domain}/{domain}-page.tsx` (client component)
- [ ] Pages open modals for create/edit — no inline editing

---

## Common Mistakes to Avoid

- **Don't put Zod enums inside entity schema files.** They go in `/schemas/enums.ts`.
- **Don't put pgEnums inside entity schema files.** They go in `/services/drizzle/schema/enums.ts`.
- **Don't create dual-purpose New/Edit forms.** Use separate `NewFoo` and `ControlFoo` modals.
- **Don't manage form state inline in components.** Create a dedicated state hook in `/state-hooks/`.
- **Don't hard-delete child items in state.** Use soft-delete (`deletar: true`) for existing items.
- **Don't create separate API routes for child entities when they can be managed via the parent.** Prefer sending parent + children together in update payloads.
- **Don't skip typing API responses.** Always export `TOutput = Awaited<ReturnType<typeof fn>>`.
- **Don't import React Query hooks in mutation files.** Mutations are plain async functions; hooks go in components.
- **Don't write page-level inline editing UIs.** All CRUD goes through modals (`ResponsiveMenu`).

---

## Key Utility Functions

| Function | Location | Purpose |
|---|---|---|
| `appApiHandler` | `/lib/app-api.ts` | Wraps API route handlers with error handling |
| `getCurrentSessionUncached` | `/lib/authentication/session.ts` | Gets auth session (API routes) |
| `getCurrentSession` | `/lib/authentication/session.ts` | Gets auth session (server components, cached) |
| `handleAdminSimpleChildRowsProcessing` | `/lib/db-utils/index.ts` | Batch insert/update/delete children in a transaction |
| `handleSimpleChildRowsProcessing` | `/lib/db-utils/index.ts` | Same as above but scoped to `organizacaoId` |
| `getErrorMessage` | `/lib/errors.ts` | Extracts readable error message from any error |
| `uploadFile` | `/lib/files-storage/index.ts` | Uploads file to Supabase Storage |
| `createMuxDirectUpload` | `/lib/mux/upload.ts` | Creates Mux direct upload URL |

---

## Key UI Components

| Component | Location | Usage |
|---|---|---|
| `ResponsiveMenu` | `/components/Utils/ResponsiveMenu.tsx` | Dialog (desktop) / Drawer (mobile) for modals |
| `ResponsiveMenuSection` | `/components/Utils/ResponsiveMenuSection.tsx` | Visual section grouping inside modals |
| `LoadingButton` | `/components/loading-button.tsx` | Button with loading spinner |
| `SectionWrapper` | `/components/ui/section-wrapper.tsx` | Titled content section |
| `VideoInput` | `/components/Inputs/VideoInput.tsx` | File picker with video preview |
| `TextInput` | `/components/Inputs/TextInput.tsx` | Labeled text input |
| `TextareaInput` | `/components/Inputs/TextareaInput.tsx` | Labeled textarea input |

---

## Language & Messaging

- All user-facing text is in **Portuguese (Brazilian)**
- API success messages: "X criado/atualizado/excluído com sucesso."
- API error messages: "Você não está autenticado.", "Acesso restrito a administradores."
- Zod error messages: "Titulo do curso nao informado.", "Tipo não válido para..."
- Use accented characters where appropriate (é, ã, ç, etc.)