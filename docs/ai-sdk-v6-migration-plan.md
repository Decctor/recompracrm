# AI SDK v6 Migration Plan

## Current State

- **Version**: `ai: ^5.0.78`
- **Files using AI SDK**: 5 files
- **Key APIs in use**: `generateObject`, `generateText`, `Experimental_Agent`, `tool`, `experimental_transcribe`

---

## Summary of Breaking Changes

| Change | Impact | Files Affected |
|--------|--------|----------------|
| `generateObject` → `generateText` + `Output.object()` | **High** | `generate-hints.ts` |
| `Experimental_Agent` → `Agent` (stable) | **Medium** | `ai-agent/index.ts` |
| `system` → `instructions` (Agent) | **Medium** | `ai-agent/index.ts` |
| `tool()` inputSchema validation stricter | **Low** | `ai-agent/tools.ts` |
| `experimental_transcribe` remains experimental | **None** | `ai-media-processing/index.ts`, `process-media.ts` |
| `strictJsonSchema` enabled by default | **Low** | All structured outputs |

---

## Files to Migrate

### 1. `/lib/ai-hints/generate-hints.ts`

**Current code:**
```typescript
import { generateObject } from "ai";

const { object: generatedHints, usage } = await generateObject({
  model: openai("gpt-4o"),
  schema: z.object({
    hints: z.array(AIHintContentSchema).max(3),
  }),
  system: systemPrompt,
  prompt: userPrompt,
});
```

**Migrated code:**
```typescript
import { generateText, Output } from "ai";

const { output: generatedHints, usage } = await generateText({
  model: openai("gpt-4o"),
  output: Output.object({
    schema: z.object({
      hints: z.array(AIHintContentSchema).max(3),
    }),
  }),
  system: systemPrompt,
  prompt: userPrompt,
});
```

**Changes:**
- Replace `generateObject` import with `generateText, Output`
- Wrap schema in `Output.object({})`
- Change destructured property from `object` to `output`

---

### 2. `/lib/ai-agent/index.ts`

**Current code:**
```typescript
import { Experimental_Agent as Agent, Output, stepCountIs } from "ai";

export const agent = new Agent({
  model: openai("gpt-5"),
  system: ENHANCED_SYSTEM_PROMPT,
  tools: agentTools,
  experimental_output: Output.object({
    schema: AgentOutputSchema,
  }),
  stopWhen: stepCountIs(20),
});
```

**Migrated code:**
```typescript
import { Agent, Output, stepCountIs } from "ai";

export const agent = new Agent({
  model: openai("gpt-5"),
  instructions: ENHANCED_SYSTEM_PROMPT,  // system → instructions
  tools: agentTools,
  output: Output.object({  // experimental_output → output
    schema: AgentOutputSchema,
  }),
  stopWhen: stepCountIs(20),
});
```

**Changes:**
- Remove `Experimental_Agent as` alias - use `Agent` directly
- Rename `system` to `instructions`
- Rename `experimental_output` to `output`

---

### 3. `/lib/ai-agent/tools.ts`

**Current code:**
```typescript
import { tool } from "ai";

export const getCustomerPurchaseHistoryTool = tool({
  description: "...",
  inputSchema: z.object({
    clientId: z.string(),
    limit: z.number().optional(),
  }),
  execute: async ({ clientId, limit }) => { ... }
});
```

**Migrated code:**
```typescript
import { tool } from "ai";

export const getCustomerPurchaseHistoryTool = tool({
  description: "...",
  parameters: z.object({  // inputSchema → parameters
    clientId: z.string(),
    limit: z.number().optional(),
  }),
  execute: async ({ clientId, limit }) => { ... }
});
```

**Changes:**
- Rename `inputSchema` to `parameters` (if not already migrated)
- Review schemas for `strictJsonSchema` compatibility (avoid `undefined`, use `null`)

---

### 4. `/lib/ai-media-processing/index.ts`

**No breaking changes required.**

```typescript
// experimental_transcribe remains experimental in v6
import { experimental_transcribe as transcribe } from "ai";
```

Keep the alias import as-is since transcribe is still experimental.

---

### 5. `/pages/api/integrations/ai/process-media.ts`

**No breaking changes required.**

Same as above - `experimental_transcribe` remains experimental.

---

## Migration Steps

### Step 1: Update Dependencies

```bash
npm install ai@^6.0.0 @ai-sdk/openai@latest
```

### Step 2: Run Automated Codemod

```bash
npx @ai-sdk/codemod v6
```

This will automatically handle most changes:
- `generateObject` → `generateText` with `Output.object()`
- `Experimental_Agent` → `Agent`
- Property renames (`system` → `instructions`, etc.)

### Step 3: Manual Review

After codemod, manually verify:

1. **Schema compatibility** - Ensure Zod schemas work with `strictJsonSchema`:
   - Replace `.optional()` with `.nullable()` where appropriate
   - Avoid `undefined` in favor of `null`

2. **Output destructuring** - Update from `object` to `output`:
   ```typescript
   // Before
   const { object: result } = await generateObject({ ... });

   // After
   const { output: result } = await generateText({ output: Output.object({ ... }) });
   ```

3. **Agent configuration** - Verify property renames applied correctly

### Step 4: Test

1. **AI Hints generation** - Test `/api/ai-hints/generate`
2. **AI Agent** - Test WhatsApp chat AI responses
3. **Media processing** - Test audio transcription and image analysis
4. **Tool execution** - Verify all 8 agent tools work correctly

---

## Rollback Plan

If issues arise:

```bash
npm install ai@^5.0.78 @ai-sdk/openai@<previous-version>
git checkout -- lib/ai-hints lib/ai-agent lib/ai-media-processing pages/api/integrations/ai
```

---

## Checklist

- [ ] Backup current working state (git commit)
- [ ] Update `ai` package to v6
- [ ] Update `@ai-sdk/openai` to latest
- [ ] Run `npx @ai-sdk/codemod v6`
- [ ] Review and fix any codemod warnings
- [ ] Update `generate-hints.ts` - `generateObject` → `generateText` + `Output`
- [ ] Update `ai-agent/index.ts` - Agent class and property names
- [ ] Update `ai-agent/tools.ts` - verify `parameters` vs `inputSchema`
- [ ] Test AI Hints generation
- [ ] Test AI Agent chat responses
- [ ] Test media processing (transcription, image analysis)
- [ ] Run full test suite
- [ ] Deploy to staging and verify
- [ ] Deploy to production

---

## References

- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [Migration Guide 5.x to 6.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [Building Agents](https://ai-sdk.dev/docs/agents/building-agents)
- [Transcription API](https://ai-sdk.dev/docs/ai-sdk-core/transcription)
