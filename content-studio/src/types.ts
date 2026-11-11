import { z } from "zod";

// O roteiro é o contrato entre quem escreve (Claude, a partir do CONTENT-GUIDE.md) e o renderizador.
// Campos de dado em português (é o que o roteirista lê e escreve), nomes de código em inglês.

export const DogPoseEnum = z.enum(["sit", "point", "wave"]);
export const MoodEnum = z.enum(["happy", "hopeful", "worried", "explain", "annoyed"]);
/** Quem fala o passo: o Caramelo (narrador) ou o dono da loja do episódio. */
export const SpeakerEnum = z.enum(["dog", "owner"]);
export const OwnerPoseEnum = z.enum(["idle", "sign", "phone", "worried"]);
export const ShotEnum = z.enum(["owner", "both", "dog", "app", "outro"]);
/**
 * Telas do produto. Só as de IMPLEMENTED_SCREENS têm print (episodes/_screens, tools/capture-screens.ts) e roteiro de destaque (SPECS em src/ui/screens.tsx; as
 * duas listas andam juntas); as outras recusam o render.
 */
export const AppScreenEnum = z.enum(["cashback-settings", "campaign-whatsapp", "rfm-segments", "product-abc", "dashboard-ticket"]);
export type TAppScreen = z.infer<typeof AppScreenEnum>;
export const IMPLEMENTED_SCREENS: TAppScreen[] = ["cashback-settings", "rfm-segments", "product-abc", "dashboard-ticket"];
export const MarkEnum = z.enum(["check", "cross"]);

const MathCardSchema = z.object({
	kind: z.literal("math"),
	rows: z.array(
		z.object({
			label: z.string(),
			value: z.string(),
			strong: z.boolean().optional(),
			bad: z.boolean().optional(),
			accent: z.boolean().optional(),
		}),
	),
});

const StatCardSchema = z.object({
	kind: z.literal("stat"),
	value: z.string(),
	caption: z.string(),
	mark: MarkEnum.optional(),
});

const CompareCardSchema = z.object({
	kind: z.literal("compare"),
	rows: z.array(z.object({ text: z.string(), mark: MarkEnum })),
});

/** Verbete: o termo e a definição curta, como num dicionário (formato glossário). */
const TermCardSchema = z.object({
	kind: z.literal("term"),
	term: z.string(),
	/** Linha pequena sob o termo: a categoria do glossário ou o nome por extenso da sigla. */
	tag: z.string().optional(),
	definition: z.string(),
});

/** Fórmula em uma linha, com as palavras de `highlight` em destaque e um exemplo opcional embaixo. */
const FormulaCardSchema = z.object({
	kind: z.literal("formula"),
	expression: z.string(),
	highlight: z.array(z.string()).default([]),
	example: z.string().optional(),
});

/** Cola para salvar: termo em destaque e o que lembrar dele, em uma linha cada. */
const RecapCardSchema = z.object({
	kind: z.literal("recap"),
	title: z.string().default("COLA RÁPIDA"),
	rows: z.array(z.object({ term: z.string(), text: z.string() })).min(2).max(4),
});

export const CardSchema = z.discriminatedUnion("kind", [MathCardSchema, StatCardSchema, CompareCardSchema, TermCardSchema, FormulaCardSchema, RecapCardSchema]);

export const BeatSchema = z.object({
	/** A fala do passo, com números por extenso. A legenda mostra exatamente isto. */
	say: z.string().min(1),
	speaker: SpeakerEnum.default("dog"),
	/** Direção de atuação para a voz, em inglês e curta ("annoyed, complaining fast"). Não aparece na tela. */
	tone: z.string().optional(),
	/** Rótulo do topo, em maiúsculas, com dígitos. */
	label: z.string().optional(),
	shot: ShotEnum,
	owner: z.object({ pose: OwnerPoseEnum, mood: MoodEnum }).optional(),
	dog: z.object({ pose: DogPoseEnum, mood: MoodEnum }).optional(),
	card: CardSchema.optional(),
	/** Obrigatório quando o passo afirma um número. */
	source: z.string().optional(),
	/** Valor do contador do episódio neste passo. */
	counter: z.string().optional(),
	app: z.object({ headline: z.string(), screen: AppScreenEnum }).optional(),
});

export const ScriptSchema = z.object({
	id: z.string(),
	title: z.string(),
	/** "balcao": um erro de loja e o jeito certo. "glossario": um termo de app/_content/glossary.ts em 40 s. */
	format: z.enum(["balcao", "glossario"]),
	/** Só no formato glossário: o verbete de app/_content/glossary.ts que o episódio explica. */
	glossary: z.object({ slug: z.string(), term: z.string() }).optional(),
	segment: z.string(),
	scene: z.enum(["sorveteria"]),
	owner: z.object({ name: z.string(), look: z.enum(["marcia"]) }),
	/** `better`: se subir ("up") ou cair ("down") é boa notícia; define a cor da troca de valor. */
	counter: z.object({ label: z.string(), better: z.enum(["up", "down"]).default("up") }).optional(),
	beats: z.array(BeatSchema).min(3),
	instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
});

export const VoiceSchema = z.object({
	provider: z.string(),
	/** Palavras do roteiro trocadas antes da síntese ("RecompraCRM" → "Recompra cê érre ême"). */
	spoken: z.record(z.string()).default({}),
	durationSeconds: z.number(),
	words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
});

export type TScript = z.infer<typeof ScriptSchema>;
export type TBeat = z.infer<typeof BeatSchema>;
export type TCard = z.infer<typeof CardSchema>;
export type TVoice = z.infer<typeof VoiceSchema>;
export type TMood = z.infer<typeof MoodEnum>;
export type TDogPose = z.infer<typeof DogPoseEnum>;
export type TOwnerPose = z.infer<typeof OwnerPoseEnum>;
export type TShot = z.infer<typeof ShotEnum>;
export type TSpeaker = z.infer<typeof SpeakerEnum>;
