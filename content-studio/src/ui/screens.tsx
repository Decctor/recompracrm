import type { ReactNode } from "react";
import { Img, interpolate, spring, staticFile, useVideoConfig } from "remotion";
import manifest from "../../episodes/_screens/manifest.json";
import { COLORS } from "../theme";
import type { TAppScreen } from "../types";
import { WhatsAppBalanceNotice } from "./AppScreen";

// Telas do produto no passo `shot: "app"`: prints da página inteira do app real, na largura de um
// celular, tirados por tools/capture-screens.ts (componentes do app com as respostas de API do
// episódio). O celular do vídeo rola o print e acende o elemento quando a palavra é falada.
// `cue("risco")` devolve o quadro (relativo ao início do passo) em que "risco" é dito, ou null.

export type TScreenProps = { frame: number; cue: (word: string) => number | null };

type TRect = { x: number; y: number; w: number; h: number };
type TCapture = { image: string; width: number; height: number; marks: Record<string, TRect> };

type TScreenSpec = {
	/** Marca onde a tela abre (rolada até ela); sem marca, abre no topo. */
	start?: string;
	/** Palavra da fala → marca que rola para a vista e acende. A primeira palavra dita vence. */
	cues: Array<[word: string, mark: string]>;
	overlay?: (props: TScreenProps) => ReactNode;
};

const SPECS: Partial<Record<TAppScreen, TScreenSpec>> = {
	"cashback-settings": {
		start: "acumulo",
		cues: [
			["percentual", "valor"],
			["validade", "validade"],
		],
		overlay: ({ frame, cue }) => <WhatsAppBalanceNotice frame={frame} at={cue("aviso")} />,
	},
	"rfm-segments": {
		start: "matriz",
		cues: [
			["campeões", "campeoes"],
			["risco", "risco"],
			["esfriando", "risco"],
			["perdidos", "perdidos"],
			["sumiu", "perdidos"],
		],
	},
	"product-abc": {
		cues: [
			["curva", "abc"],
			["posição", "abc"],
		],
	},
	"dashboard-ticket": {
		cues: [
			["ticket", "ticket"],
			["vendedor", "vendedor"],
		],
	},
};

const CAPTURES = manifest as Record<string, TCapture>;

/** Telas com print e roteiro de destaques: o render recusa as outras. */
export const CAPTURED_SCREENS = Object.keys(SPECS).filter((key) => key in CAPTURES) as TAppScreen[];

// Moldura do celular no vídeo: 620×1240, tela interna com 20 px de borda. Grande o bastante para o
// texto do app (14 px no celular) passar de 18 px no vídeo.
const PHONE = { left: 420, top: 330, width: 620, height: 1240, bezel: 20 };
const SCREEN_W = PHONE.width - PHONE.bezel * 2;
const SCREEN_H = PHONE.height - PHONE.bezel * 2;

export function RealScreen({ screen, frame, cue }: { screen: TAppScreen } & TScreenProps) {
	const { fps } = useVideoConfig();
	const spec = SPECS[screen];
	const capture = CAPTURES[screen];
	if (!spec || !capture) return null;

	const scale = SCREEN_W / capture.width;
	const visible = SCREEN_H / scale;
	const maxScroll = Math.max(0, capture.height - visible);
	const clampScroll = (y: number) => Math.min(maxScroll, Math.max(0, y));
	const startMark = spec.start ? capture.marks[spec.start] : undefined;

	// Linha do tempo de rolagem: abre na marca inicial e, a cada palavra, rola até a marca dela.
	const steps: Array<{ at: number; scroll: number; mark: string | null }> = [{ at: 0, scroll: clampScroll(startMark ? startMark.y - 12 : 0), mark: null }];
	for (const [word, key] of spec.cues) {
		const at = cue(word);
		const rect = capture.marks[key];
		if (at === null || !rect) continue;
		if (steps.some((step) => step.mark === key)) continue;
		steps.push({ at, scroll: clampScroll(rect.y - visible * 0.28), mark: key });
	}
	steps.sort((a, b) => a.at - b.at);
	let index = 0;
	steps.forEach((step, i) => {
		if (frame >= step.at) index = i;
	});
	const current = steps[index];
	const previous = steps[Math.max(0, index - 1)];
	const move = spring({ frame: frame - current.at, fps, config: { damping: 18, stiffness: 90 } });
	const scroll = index === 0 ? current.scroll : interpolate(move, [0, 1], [previous.scroll, current.scroll]);

	const enter = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
	const glow = current.mark ? spring({ frame: frame - current.at - 6, fps, config: { damping: 12, stiffness: 160 } }) : 0;
	const rect = current.mark ? capture.marks[current.mark] : null;

	return (
		<>
			<div
				style={{
					position: "absolute",
					left: PHONE.left,
					top: PHONE.top,
					width: PHONE.width,
					height: PHONE.height,
					transform: `translateY(${(1 - enter) * 700}px) rotate(${(1 - enter) * 8 + 2}deg)`,
				}}
			>
				<div style={{ position: "absolute", inset: 0, background: "#16171c", borderRadius: 72, boxShadow: "0 30px 60px rgba(10,25,50,0.35)" }} />
				<div style={{ position: "absolute", inset: PHONE.bezel, background: "#ffffff", borderRadius: 56, overflow: "hidden" }}>
					<Img src={staticFile(capture.image)} style={{ position: "absolute", left: 0, top: 0, width: SCREEN_W, transform: `translateY(${-scroll * scale}px)` }} />
					{rect ? (
						<div
							style={{
								position: "absolute",
								left: rect.x * scale - 6,
								top: (rect.y - scroll) * scale - 6,
								width: rect.w * scale + 12,
								height: rect.h * scale + 12,
								borderRadius: 18,
								border: `6px solid ${COLORS.gold}`,
								boxShadow: `0 0 0 9999px rgba(10,25,50,${0.28 * glow}), 0 0 24px rgba(255,185,0,0.6)`,
								opacity: glow,
								transform: `scale(${1.08 - glow * 0.08})`,
							}}
						/>
					) : null}
				</div>
			</div>
			{spec.overlay ? spec.overlay({ frame, cue }) : null}
		</>
	);
}
