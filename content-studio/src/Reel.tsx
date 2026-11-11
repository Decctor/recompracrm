import { useMemo } from "react";
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { Caramelo } from "./characters/Caramelo";
import { Marcia } from "./characters/Marcia";
import { Sorveteria } from "./scene/Sorveteria";
import { buildTimeline, chunkCaptions, mouthOpenness, wordTime } from "./timeline";
import { COLORS, DISPLAY_FONT, FLOOR_Y, WIDTH } from "./theme";
import type { TBeat, TScript, TShot, TVoice } from "./types";
import { AppHeadline, CashbackSettingsPhone } from "./ui/AppScreen";
import { Caption, Card, Counter, SeriesBadge, SourcePill, TopLabel } from "./ui/Overlays";

export type TReelProps = { episodeId: string; script: TScript | null; voice: TVoice | null };

type Placement = { x: number; scale: number };
type ShotLayout = { camera: { scale: number; focusX: number; focusY: number }; owner?: Placement; dog?: Placement; dim?: number };

// Onde cada personagem fica em cada tipo de plano, e para onde a câmera olha.
const SHOTS: Record<TShot, ShotLayout> = {
	owner: { camera: { scale: 1.06, focusX: 540, focusY: 1300 }, owner: { x: 540, scale: 1.22 } },
	both: { camera: { scale: 1, focusX: 540, focusY: 1100 }, owner: { x: 730, scale: 0.95 }, dog: { x: 300, scale: 0.85 } },
	dog: { camera: { scale: 1.04, focusX: 400, focusY: 1300 }, owner: { x: 830, scale: 0.9 }, dog: { x: 290, scale: 1 } },
	app: { camera: { scale: 1, focusX: 540, focusY: 1000 }, owner: { x: 230, scale: 0.85 }, dim: 0.25 },
	outro: { camera: { scale: 1.06, focusX: 540, focusY: 1300 }, dog: { x: 540, scale: 1.12 } },
};

export function Reel({ episodeId, script, voice }: TReelProps) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const timeline = useMemo(() => (script && voice ? buildTimeline(script, voice) : null), [script, voice]);
	if (!script || !voice || !timeline) return <AbsoluteFill style={{ background: COLORS.paleBlue }} />;

	const t = frame / fps;
	let beatIndex = 0;
	timeline.beats.forEach((b, i) => {
		if (t >= b.start) beatIndex = i;
	});
	const beat = script.beats[beatIndex];
	const timed = timeline.beats[beatIndex];
	const previous: TBeat | undefined = script.beats[beatIndex - 1];
	const beatFrame = frame - Math.round(timed.start * fps);
	const layout = SHOTS[beat.shot];
	const previousLayout = previous ? SHOTS[previous.shot] : layout;

	// Câmera: corta para o novo plano com um leve empurrão (ease de 12 frames).
	const ease = interpolate(beatFrame, [0, 12], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
	const cam = {
		scale: interpolate(ease, [0, 1], [previousLayout.camera.scale, layout.camera.scale]),
		focusX: interpolate(ease, [0, 1], [previousLayout.camera.focusX, layout.camera.focusX]),
		focusY: interpolate(ease, [0, 1], [previousLayout.camera.focusY, layout.camera.focusY]),
	};
	const drift = 1 + beatFrame * 0.00025;

	const chunks = chunkCaptions(timed);
	const chunk = chunks.filter((c) => t >= c.start - 0.05).pop();
	const showChunk = chunk && t <= chunk.end + 0.5 ? chunk : null;
	const chunkFrame = showChunk ? frame - Math.round(showChunk.start * fps) : 0;

	// No primeiro passo tudo já está em cena no quadro 0: é o gancho e a capa do Reel.
	const ownerEnters = beatIndex > 0 && (!previous?.owner || previous.shot !== beat.shot);
	const dogEnters = beatIndex > 0 && (!previous?.dog || previous.shot !== beat.shot);
	const overlayFrame = beatIndex === 0 ? beatFrame + 20 : beatFrame;
	// Soco de câmera e tremida quando o dono reclama no gancho.
	const hookPunch = beatIndex === 0 ? interpolate(frame, [0, 10], [1.12, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) }) : 1;
	const hookShake = beatIndex === 0 && beat.owner?.mood === "annoyed" ? Math.sin(frame * 2.1) * interpolate(frame, [0, 14], [10, 0], { extrapolateRight: "clamp" }) : 0;
	const dogVisible = Boolean(beat.dog && layout.dog);
	const ownerVisible = Boolean(beat.owner && layout.owner);
	// No close da dona com cartão, ela vai para a esquerda e o cartão fica à direita.
	const ownerPlacement = beat.shot === "owner" && beat.card ? { x: 290, scale: 1.12 } : layout.owner;

	const counterValue = beat.counter;
	const previousCounter = previous?.counter;

	return (
		<AbsoluteFill style={{ background: COLORS.paleBlue, overflow: "hidden" }}>
			<Audio src={staticFile(`${episodeId}/voice.mp3`)} />

			<AbsoluteFill
				style={{
					transformOrigin: `${cam.focusX}px ${cam.focusY}px`,
					transform: `translateX(${hookShake}px) scale(${cam.scale * drift * hookPunch})`,
				}}
			>
				<Sorveteria />
				{ownerVisible && beat.owner && ownerPlacement ? (
					<Actor placement={ownerPlacement} width={500} height={1000} enterFrame={ownerEnters ? beatFrame : 99}>
						<Marcia pose={beat.owner.pose} mood={beat.owner.mood} frame={frame} mouth={mouthOpenness(timeline.words, t, "owner")} />
					</Actor>
				) : null}
				{dogVisible && beat.dog && layout.dog ? (
					<Actor placement={layout.dog} width={600} height={800} enterFrame={dogEnters ? beatFrame : 99}>
						<Caramelo
							pose={beat.dog.pose}
							mood={beat.dog.mood}
							mouth={mouthOpenness(timeline.words, t, "dog")}
							frame={frame}
							gesture={spring({ frame: beatFrame - 4, fps, config: { damping: 12, stiffness: 140 } })}
						/>
					</Actor>
				) : null}
				{layout.dim ? <AbsoluteFill style={{ background: `rgba(23,58,110,${layout.dim})` }} /> : null}
			</AbsoluteFill>

			{beat.shot === "app" && beat.app ? (
				<>
					<AppHeadline text={beat.app.headline} frame={beatFrame} />
					<CashbackSettingsPhone
						frame={beatFrame}
						highlight={appHighlight(timed, t)}
						notifyAt={(() => {
							const at = wordTime(timed, "aviso");
							return at === null ? null : Math.round((at - timed.start) * fps);
						})()}
					/>
				</>
			) : beat.label ? (
				<TopLabel text={beat.label} frame={overlayFrame} />
			) : null}

			{script.format === "glossario" && script.glossary && beat.shot !== "app" && beat.shot !== "outro" ? (
				<SeriesBadge term={script.glossary.term} frame={beatIndex === 0 ? 30 : 99} />
			) : null}
			{script.counter && counterValue ? (
				<Counter label={script.counter.label} better={script.counter.better} value={counterValue} previous={previousCounter} frame={overlayFrame} />
			) : null}

			{beat.card ? <Card card={beat.card} frame={overlayFrame} layout={beat.shot === "dog" || beat.shot === "owner" ? "right" : "top"} /> : null}

			{beat.shot === "outro" ? <FollowButton frame={beatFrame} /> : null}

			{showChunk ? <Caption chunk={showChunk} time={t} frame={beatIndex === 0 && chunkFrame < 20 ? chunkFrame + 20 : chunkFrame} /> : null}
			{beat.source ? <SourcePill text={beat.source} frame={beatFrame} /> : null}
		</AbsoluteFill>
	);
}

function appHighlight(beat: ReturnType<typeof buildTimeline>["beats"][number], t: number) {
	const order: Array<["percentual" | "validade" | "whatsapp", string]> = [
		["percentual", "percentual"],
		["validade", "validade"],
		["whatsapp", "aviso"],
	];
	let current: "percentual" | "validade" | "whatsapp" | null = null;
	for (const [key, word] of order) {
		const at = wordTime(beat, word);
		if (at !== null && t >= at) current = key;
	}
	return current;
}

function Actor({ placement, width, height, enterFrame, children }: { placement: { x: number; scale: number }; width: number; height: number; enterFrame: number; children: React.ReactNode }) {
	const { fps } = useVideoConfig();
	const enter = spring({ frame: enterFrame, fps, config: { damping: 11, stiffness: 150, mass: 0.8 } });
	const w = width * placement.scale;
	const h = height * placement.scale;
	return (
		<div
			style={{
				position: "absolute",
				left: placement.x - w / 2,
				top: FLOOR_Y + 10 - h,
				width: w,
				height: h,
				transformOrigin: "50% 100%",
				transform: `translateY(${(1 - enter) * 80}px) scale(${0.9 + enter * 0.1}, ${0.86 + enter * 0.14})`,
				opacity: Math.min(1, enter * 1.6),
			}}
		>
			<div style={{ transform: `scale(${placement.scale})`, transformOrigin: "0 0", width, height }}>{children}</div>
		</div>
	);
}

/** O botão "Seguir" do Instagram, com a mãozinha tocando: o pedido de follow do fim. */
function FollowButton({ frame }: { frame: number }) {
	const { fps } = useVideoConfig();
	const pop = spring({ frame: frame - 18, fps, config: { damping: 12, stiffness: 160 } });
	const tapCycle = (frame - 30) % 36;
	const tap = frame > 30 && tapCycle < 8 ? 0.92 : 1;
	return (
		<div style={{ position: "absolute", top: 520, left: (WIDTH - 620) / 2, width: 620, padding: "36px 0 26px", background: "#ffffff", borderRadius: 40, border: `5px solid ${COLORS.cobalt}`, boxShadow: "0 14px 0 rgba(23,58,110,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: pop, transform: `scale(${0.7 + pop * 0.3})` }}>
			<div
				style={{
					transform: `scale(${(0.6 + pop * 0.4) * tap})`,
					background: COLORS.cobalt,
					color: "#ffffff",
					borderRadius: 999,
					padding: "18px 64px 10px",
					fontFamily: DISPLAY_FONT,
					fontWeight: 800,
					fontSize: 72,
					boxShadow: "0 10px 0 rgba(23,58,110,0.3)",
					position: "relative",
				}}
			>
				Seguir
				<svg viewBox="0 0 100 120" width={110} height={132} style={{ position: "absolute", right: -70, top: 50, transform: `translateY(${tap < 1 ? -10 : 0}px)` }}>
					<path
						d="M38,8 C30,8 28,14 28,20 L28,62 L20,54 C14,48 4,52 8,62 L30,98 C36,108 46,112 58,112 L70,112 C84,112 92,100 92,86 L92,58 C92,50 82,48 78,56 C78,46 66,44 63,52 C62,42 50,42 48,50 L48,20 C48,14 46,8 38,8 Z"
						fill="#ffffff"
						stroke={COLORS.ink}
						strokeWidth={5}
						strokeLinejoin="round"
					/>
				</svg>
			</div>
			<div style={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 44, color: COLORS.cobalt }}>@recompracrm</div>
		</div>
	);
}
