---
name: RecompraCRM
description: CRM e automação de retenção para o varejo físico brasileiro — moderno, claro, próximo do lojista
colors:
 azul-primario: "#24549c"
 azul-profundo: "#1a3d7a"
 ouro-comercial: "#ffb900"
 ouro-escuro: "#e6a700"
 canvas: "#ffffff"
 superficie: "#f5f5f5"
 borda: "#e5e5e5"
 muted: "#737373"
 carbono: "#171717"
 destrutivo: "#ef4444"
 sucesso: "#16a34a"
 chart-gold-1: "#f5cf52"
 chart-gold-2: "#e3b042"
 chart-gold-3: "#c98a2c"
 chart-gold-4: "#9a691e"
 chart-gold-5: "#7a5117"
typography:
 display:
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
  fontSize: "60px"
  fontWeight: 800
  lineHeight: 1.02
  letterSpacing: "-0.025em"
 title:
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
  fontSize: "28px"
  fontWeight: 800
  lineHeight: 1.15
  letterSpacing: "-0.015em"
 subtitle:
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
  fontSize: "18px"
  fontWeight: 500
  lineHeight: 1.45
  letterSpacing: "-0.005em"
 body:
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
  fontSize: "16px"
  fontWeight: 400
  lineHeight: 1.6
 label:
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
  fontSize: "12px"
  fontWeight: 800
  lineHeight: 1
  letterSpacing: "0.08em"
  textTransform: "uppercase"
 micro:
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif"
  fontSize: "11px"
  fontWeight: 600
  lineHeight: 1.2
rounded:
 sm: "6px"
 md: "8px"
 base: "10px"
 lg: "10px"
 xl: "14px"
 2xl: "18px"
 3xl: "22px"
 4xl: "26px"
 full: "9999px"
spacing:
 xs: "4px"
 sm: "8px"
 md: "16px"
 lg: "24px"
 xl: "32px"
 2xl: "48px"
 3xl: "64px"
components:
 button-primary:
  backgroundColor: "{colors.azul-primario}"
  textColor: "#ffffff"
  rounded: "{rounded.2xl}"
  padding: "0 22px"
  height: "44px"
  shadow: "0 6px 14px -4px rgba(36,84,156,0.32), 0 2px 4px rgba(36,84,156,0.18)"
 button-primary-hover:
  backgroundColor: "{colors.azul-profundo}"
  shadow: "0 10px 22px -6px rgba(36,84,156,0.38), 0 3px 6px rgba(36,84,156,0.22)"
  transform: "translateY(-1px)"
 button-brand:
  backgroundColor: "{colors.ouro-comercial}"
  textColor: "{colors.carbono}"
  rounded: "{rounded.2xl}"
  padding: "0 22px"
  height: "44px"
  shadow: "0 6px 14px -4px rgba(255,185,0,0.42), 0 2px 4px rgba(0,0,0,0.08)"
 button-brand-hover:
  backgroundColor: "{colors.ouro-escuro}"
  transform: "translateY(-1px)"
 button-outline:
  backgroundColor: "transparent"
  textColor: "{colors.carbono}"
  borderColor: "{colors.borda}"
  rounded: "{rounded.2xl}"
  padding: "0 22px"
  height: "44px"
 button-ghost:
  backgroundColor: "transparent"
  textColor: "{colors.carbono}"
  rounded: "{rounded.xl}"
  padding: "0 16px"
  height: "40px"
 badge-default:
  backgroundColor: "{colors.azul-primario}"
  textColor: "#ffffff"
  rounded: "{rounded.full}"
  padding: "4px 12px"
  fontWeight: 700
  fontSize: "11px"
 badge-brand:
  backgroundColor: "{colors.ouro-comercial}"
  textColor: "{colors.carbono}"
  rounded: "{rounded.full}"
  padding: "4px 12px"
 badge-soft-blue:
  backgroundColor: "rgba(36,84,156,0.10)"
  borderColor: "rgba(36,84,156,0.20)"
  textColor: "{colors.azul-primario}"
  rounded: "{rounded.full}"
  padding: "4px 12px"
 badge-soft-amber:
  backgroundColor: "rgba(255,185,0,0.18)"
  borderColor: "rgba(255,185,0,0.35)"
  textColor: "{colors.carbono}"
  rounded: "{rounded.full}"
  padding: "4px 12px"
 card:
  backgroundColor: "{colors.canvas}"
  textColor: "{colors.carbono}"
  borderColor: "{colors.borda}"
  rounded: "{rounded.3xl}"
  padding: "24px"
  shadow: "0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)"
 card-elevated:
  backgroundColor: "{colors.canvas}"
  rounded: "{rounded.3xl}"
  padding: "24px"
  shadow: "0 12px 32px -12px rgba(36,84,156,0.18), 0 4px 8px rgba(0,0,0,0.04)"
 input-default:
  backgroundColor: "{colors.canvas}"
  textColor: "{colors.carbono}"
  borderColor: "{colors.borda}"
  rounded: "{rounded.xl}"
  padding: "0 14px"
  height: "44px"
 input-focus:
  borderColor: "{colors.azul-primario}"
  shadow: "0 0 0 3px rgba(36,84,156,0.15)"
 section-wrapper:
  backgroundColor: "{colors.canvas}"
  rounded: "{rounded.3xl}"
  padding: "24px"
---

# Design System: RecompraCRM

## 1. Overview

**Creative North Star: "Moderno, claro, brasileiro"**

The system speaks the language of contemporary Brazilian fintech — bold primary color, friendly rounded geometry, confident typography at scale. The audience is the local shop owner: someone running a hardware store, a bakery, a pet shop on the corner. They want software that respects them without being corporate-stuffy or dev-tool-cold.

Two brand colors carry the system. **Azul Primário** (`#24549c`) is structural: every primary CTA, every active state, every focus ring, every link. **Ouro Comercial** (`#ffb900`) is the loyalty signal: cashback values, retention moments, the second-CTA that says "this is commercially special." The brand is the relationship between these two — never just one.

Restraint is structural — every screen has a job, every element earns its space. But the brand has warmth: generous rounding (10–22px the norm, never under 8px), confident display type (44–72px on landing surfaces), soft modern shadows tinted with the brand blue on raised surfaces. Color is information AND identity.

This system explicitly rejects:

- The corporate-stuffy SaaS look (Salesforce / Hubspot dense tables, cold grays)
- Dev-tool minimalism (Linear / Vercel terminal aesthetics — too cold for this audience)
- The pastel SaaS-template grid (icon cards in 3-column rows, rounded everything-the-same)
- Glassmorphism, gradient text, side-stripe borders (universal bans)
- Antique / ledger aesthetics (this brand is friendly fintech, not bookkeeping)

The mood is closer to Nubank / C6 / Mercado Pago than enterprise B2B: a confident Brazilian SaaS speaking directly to the lojista.

**Key Characteristics:**

- Two committed brand colors used at full strength: blue for structure, amber for loyalty moments
- Single typeface (Outfit), confident weight contrast (400 → 700 → 800)
- Generous rounding throughout (10–22px the norm, 26px on the roundest standard surfaces, pill-rounded badges)
- Modern soft elevation: 1px subtle border + small shadow on cards, blue-tinted shadows on hero CTAs
- Warm gold chart palette derived from the amber brand — distinctive and on-brand for data viz
- Sentence-case headings; UPPERCASE reserved for labels/eyebrows at 12px

---

## 2. Colors: Blue + Amber, Committed

Two brand colors carry the identity. Don't try to make this a one-color minimal system or a many-color rainbow.

### Primary brand

- **Azul Primário** (`#24549c`): The Nubank-of-retail blue. Primary buttons, active navigation, focus rings, link color, headline emphasis. Trust + authority.
- **Azul Profundo** (`#1a3d7a`): Hover/pressed state for blue. Also for deep-blue section backgrounds when a full-bleed brand surface is needed (testimonials, footers, CTA bands).

### Secondary brand

- **Ouro Comercial** (`#ffb900`): The signature amber. Cashback values, brand mark moments, secondary CTAs on the landing, the "celebrate" color. Earnable, not decorative.
- **Ouro Escuro** (`#e6a700`): Hover/pressed state for amber.

### Neutral

- **Canvas** (`#ffffff`): Main background and card surface.
- **Superfície** (`#f5f5f5`): Secondary surface for tab containers, muted backgrounds, hover wash on ghost buttons.
- **Borda** (`#e5e5e5`): All 1px structural borders and dividers.
- **Muted** (`#737373`): Supporting text — descriptions, captions, placeholders.
- **Carbono** (`#171717`): Primary body text on canvas. NOT primary CTAs.

### Semantic

- **Destrutivo** (`#ef4444`): Delete actions, errors. Never decorative.
- **Sucesso** (`#16a34a`): Confirmation feedback, "ATIVA" status. Used sparingly. Token: `--color-success`.
- **Sucesso Forte** (`#15803d`): O passo escuro do verde. Existe para pares de estado em que
  "concluído" e "encerrado definitivamente" precisam se distinguir sem trocar de matiz —
  hoje `RESOLVIDO` vs. `ENCERRADO` no hub de atendimentos. Token: `--color-success-strong`.
- **Aviso**: o ouro da marca no papel semântico — prazo correndo, ambiente de homologação, ação
  que exige atenção mas não é erro. Tokens: `--color-warning` / `--color-warning-foreground`.
- **Informação**: o azul da marca no papel semântico — "aguardando o provedor", "na fila".
  Tokens: `--color-info` / `--color-info-foreground`.

#### Os quatro papéis de um tom

Um tom semântico não é uma cor, são quatro. Sem essa distinção, quem precisava de um fundo suave
de aviso escrevia `bg-amber-50` no callsite — e a paleta vazava.

| Papel                        | Token                            | Uso                                            |
| ---------------------------- | -------------------------------- | ---------------------------------------------- |
| Preenchimento sólido         | `--color-{tom}`                  | chip sólido, ponto de timeline, ícone de ênfase |
| Texto sobre o sólido         | `--color-{tom}-foreground`       | rótulo dentro do chip sólido                   |
| Superfície suave             | `--color-{tom}-surface`          | fundo de callout, chip suave                   |
| Texto sobre a superfície     | `--color-{tom}-surface-foreground` | texto e ícone dentro do callout               |

Só o quarto papel precisa passar em contraste AA — por isso, no tema claro, "aviso" escreve em
ouro escuro (`#7a5117`, o `chart-gold-5`) e não no ouro da marca, que é ilegível sobre branco.
O par suave inverte no tema escuro; o sólido não muda, porque é a cor da marca.

Os quatro tons com par suave: `warning`, `info`, `destructive`, `success`. Um callout neutro usa
`muted`/`border` e não abre tom novo.

### Estados de atendimento (hub de chats)

O ciclo de vida de um atendimento tem sete estados, e um select sem cor obriga a ler texto
para achar o que importa. O mapeamento reusa a paleta existente em vez de abrir matizes novas:

| Estado               | Cor            | Por quê                                                               |
| -------------------- | -------------- | --------------------------------------------------------------------- |
| `ABERTO`             | Ouro Comercial | Há pendência do cliente esperando resposta — é o estado que pede ação |
| `EM_ATENDIMENTO`     | Azul Primário  | Em curso, sob controle                                                |
| `AGUARDANDO_CLIENTE` | Muted          | A bola está com o cliente; não há nada a fazer                        |
| `AGUARDANDO_INTERNO` | Muted          | Bloqueado por terceiro interno                                        |
| `RESOLVIDO`          | Sucesso        | Fim positivo, ainda reaberto por uma resposta do cliente              |
| `ENCERRADO`          | Sucesso Forte  | Fim definitivo; libera o chat para um novo atendimento                |
| `CANCELADO`          | Destrutivo     | Encerrado sem desfecho                                                |

Só dois estados usam cor quente (`ABERTO` em ouro, `CANCELADO` em vermelho), o que mantém a
proporção 1:3 de âmbar mesmo com o select colorido.

### Data visualization

Five warm gold steps. Distinctive — most analytics tools default to cold blue/teal/red. The gold palette extends the brand identity into charts:

- `chart-gold-1` (`#f5cf52`) light gold — primary series highlight
- `chart-gold-2` (`#e3b042`) medium gold — secondary series
- `chart-gold-3` (`#c98a2c`) golden bronze
- `chart-gold-4` (`#9a691e`) dark bronze
- `chart-gold-5` (`#7a5117`) deepest bronze

### Named rules

**The two-brand commitment.** Both blue and amber are brand colors used at full saturation. Never desaturate them to feel "tasteful" — that loses the identity. Use them confidently or not at all.

**The 1:3 amber-to-blue ratio.** In any viewport, amber should appear less often than blue. Blue can carry every primary CTA, every active state. Amber is the rarer moment — cashback, the second CTA, the loyalty highlight. Roughly 1 amber for every 3 blue elements keeps the hierarchy clear.

**The palette closure rule.** These eleven tokens (plus chart palette) are the complete vocabulary. Introducing a new UI color requires updating DESIGN.md. No ad-hoc `text-green-500` or `bg-purple-100`.

---

## 3. Typography: Confident Brazilian Voice

**Single font: Outfit** (already loaded; weights 400–800 in use).

Outfit is geometric and open, holds personality across weights, and reads beautifully in Portuguese — accents and tildes render cleanly. The system uses weight contrast (400 body → 700 title → 800 display) rather than multiple typefaces.

Outfit replaced Raleway for one concrete reason: **Raleway has no `tnum` feature**, so `font-variant-numeric: tabular-nums` did nothing and the app's figures never aligned (Raleway's "1" is literally half the width of its "0"). Outfit ships `tnum`, and every digit maps to a uniform-width `.tf` variant. Any future typeface change must keep `tnum` — check the font's GSUB table before switching, not just how it looks in a specimen.

### Hierarchy

- **Display** (extrabold 800, 44–72px, line-height 1.0–1.05, letter-spacing -0.025em): Landing heroes, section heroes. Confident, big. Sentence case.
- **Title** (extrabold 800, 24–32px, line-height 1.15, letter-spacing -0.015em): Section headings, card titles. Sentence case.
- **Subtitle** (medium 500, 16–20px, line-height 1.45): Lead paragraphs under heroes; muted-foreground for secondary emphasis.
- **Body** (regular 400, 15–16px, line-height 1.6): Descriptions, paragraphs. Cap line length 65–75ch.
- **Label** (bold 800, 12px, line-height 1, letter-spacing 0.08em, UPPERCASE): Eyebrows, badge text, sidebar groups, stat labels. The workhorse of structure.
- **Micro** (semibold 600, 11px): Timestamps, secondary metadata. Sparing use.

### Named rules

**Confident scale on brand surfaces.** Landing displays go 56–72px. Dashboard titles go 24–32px. Don't shrink display type to feel professional — the brand projects confidence.

**Sentence case for titles, UPPERCASE for labels.** Mixing the two in the same hierarchy level (e.g., shouty all-caps headings) is prohibited. The eyebrow is uppercase; the heading right below it is sentence case.

**Label e Micro são utilitários, não strings.** Use `text-label` (12px/800/0.08em/uppercase) e
`text-micro` (11px/600) de `styles/globals.css`. Escrever `text-[10px] uppercase tracking-[0.08em]`
à mão foi como o sistema acabou com 113 eyebrows, quase nenhum no tamanho que a spec pede.

**Número é `text-numeric`, no contêiner — nunca `tabular-nums` avulso.** Por padrão os dígitos da
Outfit têm larguras diferentes (o "1" mede 321 unidades contra 659 do "0"), então "R$ 12.480,90"
muda de largura a cada refetch e coluna de tabela não alinha. O utilitário `text-numeric` liga
`tabular-nums`, que troca todo dígito por uma variante `.tf` de 590 unidades. Vai no painel ou no
cartão — os números herdam.

A classe `tabular-nums` do Tailwind **não** serve para isso e ainda estraga o efeito: ela compõe
`font-variant-numeric` a partir de variáveis `@property` com `inherits: false`, então um filho com
`tabular-nums` redeclara a propriedade inteira e descarta o que herdaria do pai. Um contêiner com
`text-numeric` e filhos com `tabular-nums` é pior que nenhum dos dois. Dentro de um contêiner com
`text-numeric`, não escreva `tabular-nums`.

**A fonte precisa ter `tnum`.** Isto não é detalhe de implementação: é o motivo de a Raleway ter
saído. Ela não tem a feature, então a mesma declaração era inerte e os números continuavam
desalinhados — parecia bug de CSS e era a fonte. Antes de trocar de tipografia, confira a tabela
GSUB do arquivo (Urbanist e Mulish, por exemplo, também não têm `tnum`; Outfit, Jost, Archivo,
Inter e Figtree têm).

**Single voice rule.** Don't introduce a second display font. Don't reach for a monospace for "data" tables — Outfit with `tabular-nums` handles tabular figures.

_A regra já foi violada em silêncio._ `FullScreenWrapper` carregava a Inter e a aplicava no div que
envolve o app inteiro, então landing, ajuda, blog, auth, ponto de interação, painel do parceiro e
vitrine renderizavam em Inter — só dashboard, admin e comunidade reafirmavam a fonte e escapavam.
Ninguém percebeu porque a violação estava num wrapper de layout, não numa tela. Uma fonte só carrega
uma vez, no `app/layout.tsx`: se aparecer um segundo `next/font` no repositório, é regressão.

_Exceção nomeada:_ código literal — payload JSON, XML, chave de API, trecho de terminal — é
monoespaçado, porque ali o alinhamento por caractere é a informação. A exceção vive dentro do
primitive `CodeBlock`; fora dele, mono é violação. Número em tabela não é código.

---

## 4. Elevation: Soft Modern, Brand-Tinted

The brand has warmth. Surfaces lift slightly with soft shadows, with a subtle blue tint on hero surfaces.

### Shadow vocabulary

- **Hairline** (`0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)`): Default for cards and elevated panels. The "barely lifted" rest state.
- **Card** (`0 4px 12px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`): Featured cards, primary buttons. Clear lift.
- **Float** (`0 12px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)`): Dropdowns, popovers, tooltips.
- **Hero brand** (`0 16px 40px -12px rgba(36,84,156,0.30), 0 6px 12px rgba(36,84,156,0.16)`): Primary CTAs on landing, hero illustrations. The blue-tinted glow that signals brand-critical.
- **Hero amber** (`0 16px 40px -12px rgba(255,185,0,0.40), 0 6px 12px rgba(0,0,0,0.08)`): For amber CTAs on landing only. The loyalty glow.

### Named rules

**Tinted shadows on heroes only.** Blue-tinted shadows reserved for the most prominent CTA/surface in a viewport. Using them everywhere flattens the hierarchy.

**Flat-by-default for content containers.** Static text containers and content blocks don't get shadows. Elevation signals lift or interactivity, not decoration.

---

## 5. Components

### Buttons

Generous rounding (18px = `rounded-2xl`). Confident weight (font-extrabold for primary CTAs; font-bold for outline/ghost).

- **Primary** (`bg-primary text-primary-foreground` in shadcn, `bg-[#24549c]` raw): Azul fill, white text, 18px rounded (`rounded-2xl`), 44px tall (h-11), `Hero brand` shadow on landing CTAs, `Card` shadow on app CTAs. Default action everywhere.
- **Brand** (`bg-brand text-brand-foreground`): Ouro fill, near-black text. Same geometry. For loyalty-critical CTAs (cashback flows, secondary landing CTA).
- **Outline**: transparent fill, 1px Borda border, Carbono text. Hover: Superfície wash.
- **Ghost**: transparent, no border. Hover: Superfície wash. Icon-only toolbar buttons.
- **Destructive**: Destrutivo fill, white text. Confirmed delete flows only.

Sizes:

- `lg` (h-12 px-6 text-[15px]) — hero CTAs, primary marketing buttons
- `default` (h-11 px-5 text-sm) — primary actions, most contexts
- `sm` (h-9 px-4 text-sm) — table row actions, dense contexts
- `icon` (h-10 w-10 rounded-lg) — toolbar icon buttons

### Badges / Pills

Pill-shaped (rounded-full) at small sizes. 11–12px bold, generous horizontal padding (`px-3 py-1`).

- **Default** — Azul fill, white text. Status emphasis.
- **Brand** — Ouro fill, near-black text. Loyalty highlights.
- **Soft blue** — `bg-blue/10 border-blue/20 text-blue` — secondary tag.
- **Soft amber** — `bg-amber/18 border-amber/35 text-carbono` — featured tag.
- **Outline** — transparent fill, 1px border, muted text.

### Cards

Generous rounding (22px = `rounded-3xl`), 1px subtle border, hairline shadow.

```
rounded-3xl border border-border bg-card shadow-sm p-6
```

Don't stack heavy shadows. Don't add gradient backgrounds. Don't put colored accent strips along the top edge. If a card needs to stand out, use `card-elevated` (blue-tinted shadow).

### Inputs

- Rounded-xl (14px), 1px Borda border, transparent fill.
- 44px height (h-11), 16px body type for legibility.
- Focus: 3px ring at `rgba(36,84,156,0.15)` + border color shift to Azul. Soft, not loud.
- Error: Destrutivo border, no fill change.

### Navigation

**Landing/marketing**: Fixed top, white-canvas background, 64px tall, soft shadow on scroll. Logo left, anchor links centered, primary CTA right. Mobile: hamburger drawer.

**App sidebar (inset variant)**: Slightly tinted off-white background, 14px body for items, `rounded-lg` on active state with full-row `bg-sidebar-accent` fill. No left-edge stripes.

### Stats / KPI cells

A label (12px uppercase, muted) above a confident number (24–48px, font-extrabold, tabular-nums). Optional delta indicator as a pill-rounded badge (`+12%` in soft-success green). No sparklines unless data genuinely warrants. No gradient header strips on the cell.

---

## 6. Do's and Don'ts

### Do

- **Do** use blue as the primary CTA color and amber as the loyalty-moment color. Both at full saturation.
- **Do** apply generous rounding: `rounded-2xl` on buttons, `rounded-3xl` on cards, `rounded-full` on badges.
- **Do** use confident display type: 56–72px on landing heroes, 24–32px on dashboard sections.
- **Do** tint shadows with the brand blue on hero CTAs (the brand glow).
- **Do** keep chart palette in the warm gold range — it's distinctive and extends the brand identity.
- **Do** use sentence case for titles, UPPERCASE only for labels/eyebrows at 12px.
- **Do** keep amber rarer than blue in any viewport (roughly 1:3 ratio).

### Don't

- **Don't** treat grafite/near-black as the primary brand color. The brand is blue + amber.
- **Don't** flatten the rounded language: anything under 8px feels rigid and corporate.
- **Don't** use gradient text (`background-clip: text` with gradients). A solid color at increased weight communicates emphasis without the cliché.
- **Don't** use glassmorphism (`backdrop-filter: blur`) decoratively.
- **Don't** apply `border-left` greater than 1px as a colored accent stripe on cards or alerts.
- **Don't** introduce a second display font. Outfit carries it.
- **Don't** lean on the SaaS-template hero metric (big number + supporting stats grid + sparkline). It's the cliché.
- **Don't** stack `shadow-lg` on static content containers. Heavy shadows belong to floating layers.
- **Don't** use the ledger / ink-on-paper aesthetic — this brand is friendly Brazilian fintech, not antique accounting.
- **Don't** introduce Tailwind color utilities outside the palette (`text-purple-500`, `bg-emerald-100`). The system is closed.
