import { readFileSync } from "node:fs";
import path from "node:path";
import { ScriptSchema, type TScript } from "../src/types";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const EPISODES = path.join(ROOT, "episodes");

export type TVoiceConfig = {
	provider: string;
	endpoint: string;
	voiceId: string;
	model: string;
	temperature: number;
	speed: number;
	spoken: Record<string, string>;
};

export function readVoiceConfig(): TVoiceConfig {
	return JSON.parse(readFileSync(path.join(ROOT, "voice.config.json"), "utf8"));
}

export function readScript(episodeId: string): TScript {
	return ScriptSchema.parse(JSON.parse(readFileSync(path.join(EPISODES, episodeId, "script.json"), "utf8")));
}

/** O texto que vai para a síntese: as falas em sequência, com as trocas de pronúncia aplicadas. */
export function narrationFor(script: TScript, spoken: Record<string, string>) {
	let text = script.beats.map((b) => b.say).join(" ");
	for (const [word, replacement] of Object.entries(spoken)) {
		text = text.replace(new RegExp(`(?<![\\p{L}\\d])${word}(?![\\p{L}\\d])`, "gu"), replacement);
	}
	return text;
}
