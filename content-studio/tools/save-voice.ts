// Guarda a voz de um episódio a partir do resultado do Monid (monid_get_run), salvo em arquivo:
//   npm run save-voice -- 002-promocao-pra-base-toda /caminho/do/run.json
// Baixa o MP3 (o link assinado vale ~1 h) e escreve episodes/<id>/voice.json com os tempos de cada palavra.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EPISODES, readVoiceConfig } from "./lib";

const [episodeId, runFile] = process.argv.slice(2);
if (!episodeId || !runFile) {
	console.error("Uso: npm run save-voice -- <episodeId> <arquivo-do-run.json>");
	process.exit(1);
}

type TSegment = { text: string; start: number; end: number };
const run = JSON.parse(readFileSync(runFile, "utf8"));
const output = run.output ?? run;
const segments: TSegment[] | undefined = output.segments;
const link: string | undefined = output.audio?.download_link;
if (!segments?.length || !link) {
	console.error("O arquivo não tem output.segments e output.audio.download_link. Ele é o resultado de /text-to-speech/timestamps?");
	process.exit(1);
}

const dir = path.join(EPISODES, episodeId);
const mp3 = path.join(dir, "voice.mp3");
const response = await fetch(link);
if (!response.ok) {
	console.error(`Download falhou (${response.status}). O link expira em ~1 h: busque o run de novo com monid_get_run.`);
	process.exit(1);
}
writeFileSync(mp3, Buffer.from(await response.arrayBuffer()));

let durationSeconds = segments[segments.length - 1].end + 0.3;
try {
	durationSeconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString().trim());
} catch {
	console.warn("ffprobe indisponível: duração estimada pela última palavra.");
}

const config = readVoiceConfig();
const round = (n: number) => Math.round(n * 1000) / 1000;
const voice = {
	provider: config.provider,
	model: config.model,
	voiceId: config.voiceId,
	speed: config.speed,
	spoken: config.spoken,
	durationSeconds: round(durationSeconds),
	words: segments.map((s) => ({ text: s.text, start: round(s.start), end: round(s.end) })),
};
writeFileSync(path.join(dir, "voice.json"), `${JSON.stringify(voice, null, "\t")}\n`);
console.log(`${mp3} (${voice.durationSeconds}s, ${voice.words.length} palavras)`);
