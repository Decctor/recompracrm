// Imprime a chamada de síntese de voz de um episódio, pronta para o Monid:
//   npm run tts-request -- 001-desconto-vs-cashback
// Claude Code passa provider/endpoint/input/tag/maxCost para monid_run e depois roda save-voice.
import { readScript, readVoiceConfig, ttsRequestFor } from "./lib";

const episodeId = process.argv[2];
if (!episodeId) {
	console.error("Uso: npm run tts-request -- <episodeId>");
	process.exit(1);
}
const config = readVoiceConfig();
const body = ttsRequestFor(readScript(episodeId), config);
const pricePerKb = config.model === "drama-3" ? 0.05 : 0.015;
const estimate = (Buffer.byteLength(body.text, "utf8") / 1000) * pricePerKb;
console.log(
	JSON.stringify(
		{ provider: config.provider, endpoint: config.endpoint, tag: `content-studio-${episodeId}`, maxCost: Number((estimate * 2 + 0.01).toFixed(3)), input: { body }, estimatedCostUsd: Number(estimate.toFixed(4)) },
		null,
		"\t",
	),
);
