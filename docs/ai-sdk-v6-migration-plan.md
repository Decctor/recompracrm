# AI SDK v6 Migration Plan

## Current State

- **Version**: `ai: ^5.0.78`, `@ai-sdk/openai: ^2.0.53`
- **Files using AI SDK**: 5 files
- **Key APIs in use**: `generateObject`, `generateText`, `Experimental_Agent`, `tool`, `experimental_transcribe`
- **Provider**: Direct OpenAI via `@ai-sdk/openai` with `OPENAI_API_KEY`

---

## Migration Goals

1. **Upgrade to AI SDK v6** - Use stable Agent API, new Output API
2. **Migrate to Vercel AI Gateway** - Replace `@ai-sdk/openai` with built-in `gateway()` provider

---

## Summary of Changes

| Change | Impact | Files Affected |
|--------|--------|----------------|
| `@ai-sdk/openai` → `gateway()` from `ai` | **High** | All 4 files using OpenAI |
| `OPENAI_API_KEY` → `AI_GATEWAY_API_KEY` | **High** | Environment config |
| `generateObject` → `generateText` + `Output.object()` | **High** | `generate-hints.ts` |
| `Experimental_Agent` → `Agent` (stable) | **Medium** | `ai-agent/index.ts` |
| `system` → `instructions` (Agent) | **Medium** | `ai-agent/index.ts` |
| `tool()` inputSchema validation stricter | **Low** | `ai-agent/tools.ts` |
| `experimental_transcribe` remains experimental | **None** | `ai-media-processing/index.ts`, `process-media.ts` |
| `strictJsonSchema` enabled by default | **Low** | All structured outputs |

---

## Vercel AI Gateway Benefits

- **Single billing** - No separate OpenAI/Anthropic accounts
- **Multi-provider access** - OpenAI, Anthropic, Google, Meta, xAI, Mistral, DeepSeek
- **Automatic fallbacks** - Provider outage resilience
- **Observability** - Built-in logging and analytics in Vercel dashboard
- **$5 free monthly** - Trial credits included
- **0% markup with BYOK** - Bring your own key option available

---

## Files to Migrate

### 1. `/lib/ai-hints/generate-hints.ts`

**Current code:**
```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
import { gateway, generateText, Output } from "ai";

const { output: generatedHints, usage } = await generateText({
  model: gateway("openai/gpt-4o"),  // Uses AI_GATEWAY_API_KEY automatically
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
- Remove `@ai-sdk/openai` import entirely
- Import `gateway` from `ai` instead
- Replace `generateObject` with `generateText` + `Output.object()`
- Change model from `openai("gpt-4o")` to `gateway("openai/gpt-4o")`
- Change destructured property from `object` to `output`

---

### 2. `/lib/ai-agent/index.ts`

**Current code:**
```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { Experimental_Agent as Agent, Output, stepCountIs } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
import { gateway, Agent, Output, stepCountIs } from "ai";

export const agent = new Agent({
  model: gateway("openai/gpt-5"),  // Uses AI_GATEWAY_API_KEY automatically
  instructions: ENHANCED_SYSTEM_PROMPT,  // system → instructions
  tools: agentTools,
  output: Output.object({  // experimental_output → output
    schema: AgentOutputSchema,
  }),
  stopWhen: stepCountIs(20),
});
```

**Changes:**
- Remove `@ai-sdk/openai` import entirely
- Import `gateway` from `ai` instead
- Remove `Experimental_Agent as` alias - use `Agent` directly
- Change model from `openai("gpt-5")` to `gateway("openai/gpt-5")`
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

**Current code:**
```typescript
import { openai } from "@ai-sdk/openai";
import { generateText, experimental_transcribe as transcribe } from "ai";

const transcriptionResponse = await transcribe({
  model: openai.transcription("whisper-1"),
  audio: fileBuffer,
});

const result = await generateText({
  model: openai("gpt-4o"),
  prompt: "...",
});
```

**Migrated code:**
```typescript
import { gateway, generateText, experimental_transcribe as transcribe } from "ai";

const transcriptionResponse = await transcribe({
  model: gateway("openai/whisper-1"),  // Transcription via gateway
  audio: fileBuffer,
});

const result = await generateText({
  model: gateway("openai/gpt-4o"),
  prompt: "...",
});
```

**Changes:**
- Remove `@ai-sdk/openai` import
- Import `gateway` from `ai`
- Change `openai.transcription("whisper-1")` to `gateway("openai/whisper-1")`
- Change `openai("gpt-4o")` to `gateway("openai/gpt-4o")`

---

### 5. `/pages/api/integrations/ai/process-media.ts`

**Same changes as file #4** - Replace `@ai-sdk/openai` with `gateway()` from `ai`.

---

## Migration Steps

### Step 1: Configure Vercel AI Gateway

1. Go to your Vercel dashboard → Project Settings → AI Gateway
2. Enable AI Gateway for your project
3. (Optional) Configure BYOK if you want to use your existing OpenAI key
4. Copy the `AI_GATEWAY_API_KEY` or note that `VERCEL_OIDC_TOKEN` is auto-injected

### Step 2: Update Environment Variables

```bash
# Remove (or keep for BYOK fallback)
OPENAI_API_KEY=sk-...

# Add (if not using VERCEL_OIDC_TOKEN)
AI_GATEWAY_API_KEY=your-gateway-key
```

**Note:** When deployed on Vercel, `VERCEL_OIDC_TOKEN` is automatically available and the gateway uses it by default.

### Step 3: Update Dependencies

```bash
# Remove @ai-sdk/openai, upgrade ai to v6
npm uninstall @ai-sdk/openai
npm install ai@^6.0.0
```

### Step 4: Run Automated Codemod

```bash
npx @ai-sdk/codemod v6
```

This will automatically handle:
- `generateObject` → `generateText` with `Output.object()`
- `Experimental_Agent` → `Agent`
- Property renames (`system` → `instructions`, etc.)

**Note:** The codemod does NOT handle the `@ai-sdk/openai` → `gateway()` migration. This must be done manually.

### Step 5: Manual Gateway Migration

For each file, manually replace:

```typescript
// BEFORE
import { createOpenAI } from "@ai-sdk/openai";
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = openai("gpt-4o");

// AFTER
import { gateway } from "ai";
const model = gateway("openai/gpt-4o");
```

**Model name format:** `provider/model-name`
- `openai/gpt-4o`
- `openai/gpt-5`
- `openai/whisper-1`
- `anthropic/claude-3-5-sonnet` (if switching providers later)

### Step 6: Schema Compatibility Review

Ensure Zod schemas work with `strictJsonSchema` (enabled by default in v6):
- Replace `.optional()` with `.nullable()` where appropriate
- Avoid `undefined` in favor of `null`

### Step 7: Test

1. **AI Hints generation** - Test `/api/ai-hints/generate`
2. **AI Agent** - Test WhatsApp chat AI responses
3. **Media processing** - Test audio transcription and image analysis
4. **Tool execution** - Verify all 8 agent tools work correctly
5. **Gateway connectivity** - Verify requests go through Vercel AI Gateway (check dashboard)

---

## Rollback Plan

If issues arise:

```bash
# Reinstall old packages
npm install ai@^5.0.78 @ai-sdk/openai@^2.0.53

# Restore code
git checkout -- lib/ai-hints lib/ai-agent lib/ai-media-processing pages/api/integrations/ai

# Restore environment
# Re-add OPENAI_API_KEY to .env
```

---

## Environment Variables Summary

| Variable | Purpose | Required |
|----------|---------|----------|
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway authentication | Yes (if not on Vercel) |
| `VERCEL_OIDC_TOKEN` | Auto-injected on Vercel deployments | Auto |
| `OPENAI_API_KEY` | Only if using BYOK | Optional |

---

## Checklist

### Vercel AI Gateway Setup
- [ ] Enable AI Gateway in Vercel project settings
- [ ] Configure BYOK (optional - if keeping OpenAI key)
- [ ] Update environment variables

### Dependencies
- [ ] Backup current working state (git commit)
- [ ] Remove `@ai-sdk/openai` package
- [ ] Update `ai` package to v6
- [ ] Run `npx @ai-sdk/codemod v6`
- [ ] Review and fix any codemod warnings

### Code Migration
- [ ] `lib/ai-hints/generate-hints.ts` - Replace OpenAI with gateway + Output API
- [ ] `lib/ai-agent/index.ts` - Replace OpenAI with gateway + stable Agent API
- [ ] `lib/ai-agent/tools.ts` - Verify `parameters` vs `inputSchema`
- [ ] `lib/ai-media-processing/index.ts` - Replace OpenAI with gateway
- [ ] `pages/api/integrations/ai/process-media.ts` - Replace OpenAI with gateway

### Testing
- [ ] Test AI Hints generation
- [ ] Test AI Agent chat responses
- [ ] Test media processing (transcription, image analysis)
- [ ] Verify requests in Vercel AI Gateway dashboard
- [ ] Run full test suite

### Deployment
- [ ] Deploy to staging and verify
- [ ] Monitor AI Gateway metrics
- [ ] Deploy to production

---

## Multi-Provider Examples (Future)

With the gateway, you can easily switch or add providers:

```typescript
import { gateway } from "ai";

// OpenAI
const gpt = gateway("openai/gpt-4o");

// Anthropic (same codebase, no new package)
const claude = gateway("anthropic/claude-3-5-sonnet");

// Google
const gemini = gateway("google/gemini-1.5-pro");

// Meta
const llama = gateway("meta/llama-3.1-70b");
```

---

## References

- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)
- [Migration Guide 5.x to 6.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [Building Agents](https://ai-sdk.dev/docs/agents/building-agents)
- [Transcription API](https://ai-sdk.dev/docs/ai-sdk-core/transcription)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [AI Gateway Provider](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway)
- [OpenAI-Compatible API](https://vercel.com/docs/ai-gateway/openai-compat)
