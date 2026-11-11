// Confere os roteiros contra o CONTENT-GUIDE.md antes de gastar com voz e render:
//   npm run lint            → todos os episódios
//   npm run lint -- 003-…   → um episódio
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { IMPLEMENTED_SCREENS } from "../src/types";
import { EPISODES, narrationFor, readScript, readVoiceConfig } from "./lib";

const only = process.argv[2];
const ids = only ? [only] : readdirSync(EPISODES).filter((d) => existsSync(path.join(EPISODES, d, "script.json")));
const config = readVoiceConfig();
let errors = 0;

for (const id of ids) {
	const problems: string[] = [];
	const warnings: string[] = [];
	let script;
	try {
		script = readScript(id);
	} catch (error) {
		console.log(`✗ ${id}\n   roteiro inválido: ${(error as Error).message}`);
		errors++;
		continue;
	}
	script.beats.forEach((beat, i) => {
		const n = `passo ${i + 1}`;
		if (/\d/.test(beat.say)) problems.push(`${n}: número em dígito no "say" (escreva por extenso; dígitos vão no label/cartão)`);
		if (beat.card?.kind === "stat" && !beat.source && beat.card.mark !== "cross") problems.push(`${n}: cartão de número sem "source"`);
		if (beat.card?.kind === "stat" && beat.card.mark === "cross" && !beat.source && !/[⅓½]/.test(beat.card.value)) problems.push(`${n}: cartão de número sem "source"`);
		if (beat.shot === "app" && !beat.app) problems.push(`${n}: plano "app" sem "app"`);
		if (beat.app && !IMPLEMENTED_SCREENS.includes(beat.app.screen)) warnings.push(`${n}: tela "${beat.app.screen}" ainda não desenhada (o render vai recusar)`);
		if ((beat.shot === "dog" || beat.shot === "outro") && !beat.dog) problems.push(`${n}: plano "${beat.shot}" sem o Caramelo`);
	});
	if (script.beats[script.beats.length - 1].shot !== "outro") problems.push(`o último passo deve ser "outro" (CTA + seguir)`);
	if (!script.beats.some((b) => b.shot === "app")) warnings.push("nenhum passo mostra o produto");
	const seconds = narrationFor(script, config.spoken).length / 15.5;
	if (seconds < 35 || seconds > 65) warnings.push(`duração estimada ${seconds.toFixed(0)} s (alvo: 40–60 s)`);
	const hasVoice = existsSync(path.join(EPISODES, id, "voice.json"));
	console.log(`${problems.length ? "✗" : "✓"} ${id} · ~${seconds.toFixed(0)} s · ${hasVoice ? "com voz" : "sem voz"}`);
	for (const p of problems) console.log(`   erro: ${p}`);
	for (const w of warnings) console.log(`   aviso: ${w}`);
	errors += problems.length;
}
process.exit(errors ? 1 : 0);
