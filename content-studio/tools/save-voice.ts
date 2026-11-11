// Guarda a voz de um episódio a partir do resultado do Monid (monid_get_run), salvo em arquivo:
//   npm run save-voice -- 001-desconto-vs-cashback /caminho/do/run.json
// Baixa o MP3 (o link assinado vale ~1 h), encurta toda pausa entre palavras para no máximo
// `maxPauseSeconds` (o ritmo de corte seco dos Reels) e escreve episodes/<id>/voice.json com os
// tempos de cada palavra já no áudio encurtado. Por fim acelera tudo por `tempo` (atempo do ffmpeg,
// que não muda o tom da voz) e divide os tempos pelo mesmo fator.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
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

const config = readVoiceConfig();
const dir = path.join(EPISODES, episodeId);
const raw = path.join(dir, "voice.raw.mp3");
const mp3 = path.join(dir, "voice.mp3");
const response = await fetch(link);
if (!response.ok) {
	console.error(`Download falhou (${response.status}). O link expira em ~1 h: busque o run de novo com monid_get_run.`);
	process.exit(1);
}
writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
const rawDuration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw]).toString().trim());

// Trechos a manter: corta o meio de cada pausa longa, deixando metade da pausa máxima de cada lado.
const maxPause = config.maxPauseSeconds;
const keep: Array<[number, number]> = [];
let cursor = Math.max(0, segments[0].start - 0.05);
for (let i = 0; i < segments.length - 1; i++) {
	const gapStart = segments[i].end;
	const gapEnd = segments[i + 1].start;
	if (gapEnd - gapStart > maxPause) {
		keep.push([cursor, gapStart + maxPause / 2]);
		cursor = gapEnd - maxPause / 2;
	}
}
keep.push([cursor, Math.min(rawDuration, segments[segments.length - 1].end + 0.35)]);

const remap = (t: number) => {
	let removed = keep[0][0];
	for (let i = 0; i < keep.length; i++) {
		if (t <= keep[i][1]) return Math.max(0, t - removed);
		if (i + 1 < keep.length) removed += keep[i + 1][0] - keep[i][1];
	}
	return t - removed;
};

const tempo = config.tempo ?? 1;
const filter = `${keep.map(([s, e], i) => `[0:a]atrim=${s.toFixed(3)}:${e.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`).join(";")};${keep.map((_, i) => `[a${i}]`).join("")}concat=n=${keep.length}:v=0:a=1[cut];[cut]atempo=${tempo}[out]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-filter_complex", filter, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k", mp3]);
rmSync(raw);
const durationSeconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3]).toString().trim());

const round = (n: number) => Math.round(n * 1000) / 1000;
const voice = {
	provider: config.provider,
	model: config.model,
	speed: config.speed,
	maxPauseSeconds: maxPause,
	tempo,
	spoken: config.spoken,
	durationSeconds: round(durationSeconds),
	words: segments.map((s) => ({ text: s.text, start: round(remap(s.start) / tempo), end: round(remap(s.end) / tempo) })),
};
writeFileSync(path.join(dir, "voice.json"), `${JSON.stringify(voice, null, "\t")}\n`);
console.log(`${mp3}: ${round(rawDuration)}s → ${voice.durationSeconds}s (${keep.length - 1} pausas encurtadas, ${tempo}×), ${voice.words.length} palavras`);
