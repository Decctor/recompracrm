import { readFileSync } from "node:fs";
import path from "node:path";
import { ScriptSchema, type TScript } from "../src/types";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const EPISODES = path.join(ROOT, "episodes");

type TVoiceEntry = { voiceId: string; tone: string };
export type TVoiceConfig = {
	provider: string;
	endpoint: string;
	model: string;
	speed: number;
	maxPauseSeconds: number;
	tempo: number;
	voices: { dog: TVoiceEntry; owners: Record<string, TVoiceEntry> };
	spoken: Record<string, string>;
};

export function readVoiceConfig(): TVoiceConfig {
	return JSON.parse(readFileSync(path.join(ROOT, "voice.config.json"), "utf8"));
}

export function readScript(episodeId: string): TScript {
	return ScriptSchema.parse(JSON.parse(readFileSync(path.join(EPISODES, episodeId, "script.json"), "utf8")));
}

export function applySpoken(text: string, spoken: Record<string, string>) {
	let out = text;
	for (const [word, replacement] of Object.entries(spoken)) {
		out = out.replace(new RegExp(`(?<![\\p{L}\\d])${word}(?![\\p{L}\\d])`, "gu"), replacement);
	}
	return out;
}

/** Só as falas, como serão ditas (para estimar duração). */
export function narrationFor(script: TScript, spoken: Record<string, string>) {
	return applySpoken(script.beats.map((b) => b.say).join(" "), spoken);
}

/**
 * O texto da síntese com diálogo: `<|speaker:N|>` a cada troca de quem fala e a direção de atuação
 * de cada passo entre colchetes. As marcações não viram palavras nos tempos devolvidos.
 */
export function ttsRequestFor(script: TScript, config: TVoiceConfig) {
	const owner = config.voices.owners[script.owner.look];
	if (!owner) throw new Error(`Sem voz para o dono "${script.owner.look}" em voice.config.json`);
	const speakers = (["dog", "owner"] as const).filter((s) => script.beats.some((b) => b.speaker === s));
	const voiceFor = { dog: config.voices.dog, owner };
	const multi = speakers.length > 1;
	let previous: string | null = null;
	const parts = script.beats.map((beat) => {
		const tag = multi && beat.speaker !== previous ? `<|speaker:${speakers.indexOf(beat.speaker)}|>` : "";
		previous = beat.speaker;
		return `${tag}[${beat.tone ?? voiceFor[beat.speaker].tone}] ${applySpoken(beat.say, config.spoken)}`;
	});
	const voiceIds = speakers.map((s) => voiceFor[s].voiceId);
	return {
		text: parts.join(" "),
		voice_id: multi ? voiceIds : voiceIds[0],
		model: config.model,
		prosody: { speed: config.speed },
	};
}
