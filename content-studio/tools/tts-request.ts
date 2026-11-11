// Imprime a chamada de síntese de voz de um episódio, pronta para o Monid:
//   npm run tts-request -- 002-promocao-pra-base-toda
// Claude Code passa o resultado para monid_run (provider/endpoint/input) e depois roda save-voice.
import { narrationFor, readScript, readVoiceConfig } from "./lib";

const episodeId = process.argv[2];
if (!episodeId) {
	console.error("Uso: npm run tts-request -- <episodeId>");
	process.exit(1);
}
const config = readVoiceConfig();
const text = narrationFor(readScript(episodeId), config.spoken);
const bytes = Buffer.byteLength(text, "utf8");
console.log(
	JSON.stringify(
		{
			provider: config.provider,
			endpoint: config.endpoint,
			tag: `content-studio-${episodeId}`,
			maxCost: 0.1,
			input: { body: { text, voice_id: config.voiceId, model: config.model, temperature: config.temperature, prosody: { speed: config.speed } } },
			estimatedCostUsd: Number(((bytes / 1000) * 0.015).toFixed(4)),
		},
		null,
		"\t",
	),
);
