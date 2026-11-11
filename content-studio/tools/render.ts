// Renderiza um episódio.
//   npm run render -- 001-desconto-vs-cashback            → out/001-desconto-vs-cashback.mp4
//   npm run render -- 001-desconto-vs-cashback --stills   → out/<id>/beat-NN.jpg + contact-sheet.jpg
//   npm run render -- 001-desconto-vs-cashback --frames 0,8,30  → out/<id>/frame-N.jpg + frames.jpg
//     (o quadro 0 é a capa e o gancho: confira sempre)
// O modo --stills tira um quadro do meio de cada passo: é o que se revisa antes do vídeo inteiro.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { buildTimeline } from "../src/timeline";
import { ScriptSchema, VoiceSchema } from "../src/types";

const root = path.resolve(import.meta.dirname, "..");
const episodeId = process.argv[2];
const stills = process.argv.includes("--stills");
const framesArg = process.argv.indexOf("--frames");
const frames = framesArg > 0 ? process.argv[framesArg + 1].split(",").map(Number) : null;
if (!episodeId) {
	console.error("Uso: npm run render -- <episodeId> [--stills]");
	process.exit(1);
}

const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE ?? null;
const chromeMode = "headless-shell" as const;
const inputProps = { episodeId, script: null, voice: null };

const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "episodes") });
const composition = await selectComposition({ serveUrl, id: "Reel", inputProps, browserExecutable, chromeMode });
const outDir = path.join(root, "out");
mkdirSync(outDir, { recursive: true });

if (frames) {
	const dir = path.join(outDir, episodeId);
	mkdirSync(dir, { recursive: true });
	const files = [];
	for (const frame of frames) {
		const file = path.join(dir, `frame-${frame}.jpg`);
		await renderStill({ composition, serveUrl, output: file, frame, inputProps, browserExecutable, chromeMode, imageFormat: "jpeg", jpegQuality: 85 });
		files.push(file);
	}
	execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex", `${files.map((_, i) => `[${i}]scale=360:-1[s${i}]`).join(";")};${files.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${files.length}`, path.join(dir, "frames.jpg")]);
	console.log(`Quadros ${frames.join(", ")} em ${path.join(dir, "frames.jpg")}`);
} else if (stills) {
	const script = ScriptSchema.parse(JSON.parse(readFileSync(path.join(root, "episodes", episodeId, "script.json"), "utf8")));
	const voice = VoiceSchema.parse(JSON.parse(readFileSync(path.join(root, "episodes", episodeId, "voice.json"), "utf8")));
	const timeline = buildTimeline(script, voice);
	const dir = path.join(outDir, episodeId);
	mkdirSync(dir, { recursive: true });
	const files: string[] = [];
	for (const beat of timeline.beats) {
		// Quadro a 70% do passo: animações de entrada já assentaram e a legenda está no meio.
		const at = beat.start + (beat.end - beat.start) * 0.7;
		const file = path.join(dir, `beat-${String(beat.index + 1).padStart(2, "0")}.jpg`);
		await renderStill({ composition, serveUrl, output: file, frame: Math.round(at * composition.fps), inputProps, browserExecutable, chromeMode, imageFormat: "jpeg", jpegQuality: 85 });
		files.push(file);
	}
	const columns = Math.min(5, files.length);
	const rows = Math.ceil(files.length / columns);
	execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex", `${files.map((_, i) => `[${i}]scale=360:-1[s${i}]`).join(";")};${files.map((_, i) => `[s${i}]`).join("")}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % columns) * 360}_${Math.floor(i / columns) * 640}`).join("|")}:fill=black`, "-frames:v", "1", path.join(dir, "contact-sheet.jpg")]);
	console.log(`Quadros em ${dir} (${rows}×${columns} na contact-sheet.jpg)`);
} else {
	const output = path.join(outDir, `${episodeId}.mp4`);
	await renderMedia({
		composition,
		serveUrl,
		codec: "h264",
		crf: 20,
		outputLocation: output,
		inputProps,
		browserExecutable,
		chromeMode,
		onProgress: ({ progress }) => {
			if (Math.round(progress * 100) % 10 === 0) process.stdout.write(`\r${Math.round(progress * 100)}%`);
		},
	});
	console.log(`\n${output}`);
}
