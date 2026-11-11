import { type CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { Reel, type TReelProps } from "./Reel";
import { buildTimeline } from "./timeline";
import { FPS, HEIGHT, WIDTH } from "./theme";
import { IMPLEMENTED_SCREENS, ScriptSchema, VoiceSchema } from "./types";

const DEFAULT_EPISODE = "001-desconto-vs-cashback";

const loadEpisode: CalculateMetadataFunction<TReelProps> = async ({ props }) => {
	const [scriptRaw, voiceRaw] = await Promise.all([
		fetch(staticFile(`${props.episodeId}/script.json`)).then((r) => r.json()),
		fetch(staticFile(`${props.episodeId}/voice.json`)).then((r) => r.json()),
	]);
	const script = ScriptSchema.parse(scriptRaw);
	const voice = VoiceSchema.parse(voiceRaw);
	const missing = script.beats.map((b) => b.app?.screen).filter((s) => s && !IMPLEMENTED_SCREENS.includes(s));
	if (missing.length > 0) throw new Error(`Tela ainda não desenhada: ${missing.join(", ")}. Veja src/ui/AppScreen.tsx.`);
	const { duration } = buildTimeline(script, voice);
	return { durationInFrames: Math.ceil(duration * FPS), props: { ...props, script, voice } };
};

export function Root() {
	return (
		<Composition
			id="Reel"
			component={Reel}
			width={WIDTH}
			height={HEIGHT}
			fps={FPS}
			durationInFrames={FPS * 60}
			defaultProps={{ episodeId: DEFAULT_EPISODE, script: null, voice: null } satisfies TReelProps}
			calculateMetadata={loadEpisode}
		/>
	);
}
