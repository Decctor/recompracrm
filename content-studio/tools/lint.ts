// Confere os roteiros contra o CONTENT-GUIDE.md antes de gastar com voz e render:
//   npm run lint            → todos os episódios
//   npm run lint -- 003-…   → um episódio
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { IMPLEMENTED_SCREENS } from "../src/types";
import { applySpoken, EPISODES, narrationFor, readScript, readVoiceConfig } from "./lib";

/** Ritmo final (drama-3 + pausas encurtadas + tempo 1.18), medido no episódio 001: 773 caracteres em 45,7 s. */
const CHARS_PER_SECOND = 17;

const only = process.argv[2];
const ids = only ? [only] : readdirSync(EPISODES).filter((d) => existsSync(path.join(EPISODES, d, "script.json")));
const config = readVoiceConfig();
const glossarySource = readFileSync(path.join(EPISODES, "..", "..", "app", "_content", "glossary.ts"), "utf8");

/** O trecho de um verbete em glossary.ts, do seu slug até o próximo. */
function glossaryEntry(slug: string | undefined) {
	if (!slug) return null;
	const start = glossarySource.indexOf(`slug: "${slug}"`);
	if (start < 0) return null;
	const next = glossarySource.indexOf("slug: \"", start + 1);
	return glossarySource.slice(start, next < 0 ? undefined : next);
}
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
	script.beats.forEach((beat, i) => {
		if (beat.speaker === "owner" && !beat.owner) problems.push(`passo ${i + 1}: o dono fala mas não está em cena`);
	});
	// Gancho: abre com o problema na boca do dono, em até ~3,5 s, e o rótulo é uma pergunta ao espectador.
	const hook = script.beats[0];
	if (hook.speaker !== "owner") warnings.push("o gancho não é o dono reclamando do problema");
	if (!hook.label?.trim().endsWith("?")) warnings.push("o rótulo do gancho não é uma pergunta para quem assiste");
	const hookSeconds = applySpoken(hook.say, config.spoken).length / CHARS_PER_SECOND;
	if (hookSeconds > 3.8) warnings.push(`gancho longo: ~${hookSeconds.toFixed(1)} s (alvo: até 3,5 s)`);
	if (hook.counter || hook.card) warnings.push("o gancho tem contador ou cartão: deixe só o rótulo e o dono em cena");
	if (script.format === "balcao" && !script.beats.some((b) => b.shot === "app")) warnings.push("nenhum passo mostra o produto");
	if (script.format === "glossario") {
		const entry = glossaryEntry(script.glossary?.slug);
		if (!entry) problems.push(`glossário: "${script.glossary?.slug ?? "(sem glossary.slug)"}" não existe em app/_content/glossary.ts`);
		if (!script.beats.some((b) => b.card?.kind === "term")) problems.push("glossário: falta o cartão do verbete (kind: term)");
		if (!script.beats.some((b) => b.card?.kind === "recap")) warnings.push("glossário: falta a cola para salvar (kind: recap)");
		// O verbete diz quando o produto faz algo com o termo (`inRecompra`); sem isso, nada de tela do produto.
		if (entry && !entry.includes("inRecompra") && script.beats.some((b) => b.shot === "app"))
			problems.push("glossário: o verbete não tem inRecompra, então o produto não faz nada com esse termo; tire o passo app");
	}
	const seconds = narrationFor(script, config.spoken).length / CHARS_PER_SECOND;
	if (seconds < 25 || seconds > 55) warnings.push(`duração estimada ${seconds.toFixed(0)} s (alvo: 30–50 s)`);
	const hasVoice = existsSync(path.join(EPISODES, id, "voice.json"));
	console.log(`${problems.length ? "✗" : "✓"} ${id} · ~${seconds.toFixed(0)} s · ${hasVoice ? "com voz" : "sem voz"}`);
	for (const p of problems) console.log(`   erro: ${p}`);
	for (const w of warnings) console.log(`   aviso: ${w}`);
	errors += problems.length;
}
process.exit(errors ? 1 : 0);
