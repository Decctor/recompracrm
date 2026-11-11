import { interpolate, spring, useVideoConfig } from "remotion";
import type { TCard } from "../types";
import type { TCaptionChunk } from "../timeline";
import { COLORS, DISPLAY_FONT } from "../theme";

function pop(frame: number, fps: number, delay = 0) {
	return spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 180, mass: 0.7 } });
}

/** Rótulo do topo: caixa branca, borda azul, texto em maiúsculas (o "título" de cada passo). */
export function TopLabel({ text, frame }: { text: string; frame: number }) {
	const { fps } = useVideoConfig();
	const appear = pop(frame, fps);
	return (
		<div style={{ position: "absolute", top: 120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
			<div
				style={{
					transform: `scale(${0.6 + appear * 0.4})`,
					opacity: appear,
					background: "#ffffff",
					border: `6px solid ${COLORS.cobalt}`,
					borderRadius: 22,
					padding: "8px 30px 2px",
					maxWidth: 900,
					textAlign: "center",
					fontFamily: DISPLAY_FONT,
					fontWeight: 800,
					fontSize: 62,
					lineHeight: 1.05,
					color: COLORS.cobalt,
					boxShadow: "0 10px 0 rgba(23,58,110,0.18)",
				}}
			>
				{text}
			</div>
		</div>
	);
}

function parseMoney(value: string) {
	const n = Number(value.replace(/[^\d,]/g, "").replace(",", "."));
	return Number.isFinite(n) ? n : null;
}

/** Contador do episódio (ex.: LUCRO POR PICOLÉ). Treme e muda de cor quando o valor muda. */
export function Counter({ label, value, previous, better, frame }: { label: string; value: string; previous?: string; better: "up" | "down"; frame: number }) {
	const changed = previous !== undefined && previous !== value;
	const now = parseMoney(value);
	const before = previous ? parseMoney(previous) : null;
	const worse = changed && now !== null && before !== null && (better === "up" ? now < before : now > before);
	const pulse = changed ? interpolate(frame, [0, 6, 22], [1, 1.22, 1], { extrapolateRight: "clamp" }) : 1;
	const shake = worse ? Math.sin(frame * 1.6) * interpolate(frame, [0, 20], [10, 0], { extrapolateRight: "clamp" }) : 0;
	const color = changed && frame < 40 ? (worse ? COLORS.bad : COLORS.good) : COLORS.ink;
	return (
		<div
			style={{
				position: "absolute",
				top: 270,
				right: 50,
				width: 300,
				background: "#ffffff",
				borderRadius: 24,
				border: `4px solid ${COLORS.cobalt}`,
				padding: "14px 18px 6px",
				textAlign: "center",
				fontFamily: DISPLAY_FONT,
				transform: `translateX(${shake}px)`,
				boxShadow: "0 8px 0 rgba(23,58,110,0.15)",
			}}
		>
			<div style={{ fontSize: 26, fontWeight: 800, color: COLORS.cobalt, lineHeight: 1.1 }}>{label}</div>
			<div style={{ fontSize: 70, fontWeight: 800, color, lineHeight: 1.1, transform: `scale(${pulse})` }}>{value}</div>
		</div>
	);
}

/** Legenda palavra a palavra: a palavra falada agora fica dourada. */
export function Caption({ chunk, time, frame }: { chunk: TCaptionChunk; time: number; frame: number }) {
	const { fps } = useVideoConfig();
	const appear = pop(frame, fps);
	return (
		<div style={{ position: "absolute", top: 1450, left: 60, right: 60, display: "flex", justifyContent: "center" }}>
			<div
				style={{
					transform: `scale(${0.85 + appear * 0.15})`,
					display: "flex",
					flexWrap: "wrap",
					justifyContent: "center",
					gap: "0 22px",
					fontFamily: DISPLAY_FONT,
					fontWeight: 800,
					fontSize: 92,
					lineHeight: 1.05,
					textTransform: "uppercase",
				}}
			>
				{chunk.words.map((word, i) => {
					const active = time >= word.start && time <= word.end + 0.08;
					return (
						<span
							key={`${word.text}-${i}`}
							style={{
								// Fala do dono em rosa, do Caramelo em dourado: dá para seguir o diálogo sem som.
								color: active ? (word.speaker === "owner" ? "#ff9ec4" : COLORS.gold) : "#ffffff",
								WebkitTextStroke: `14px ${COLORS.cobaltDark}`,
								paintOrder: "stroke fill",
								textShadow: "0 8px 0 rgba(10,25,50,0.35)",
							}}
						>
							{word.text}
						</span>
					);
				})}
			</div>
		</div>
	);
}

export function SourcePill({ text, frame }: { text: string; frame: number }) {
	const { fps } = useVideoConfig();
	const appear = pop(frame, fps, 6);
	return (
		<div style={{ position: "absolute", top: 1565, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: appear }}>
			<div
				style={{
					background: "#ffffff",
					border: `3px solid ${COLORS.ink}`,
					borderRadius: 14,
					padding: "6px 20px 2px",
					fontFamily: DISPLAY_FONT,
					fontWeight: 700,
					fontSize: 32,
					color: COLORS.ink,
					maxWidth: 900,
					textAlign: "center",
				}}
			>
				Fonte: {text}
			</div>
		</div>
	);
}

function MarkBadge({ mark, size = 64 }: { mark: "check" | "cross"; size?: number }) {
	return (
		<svg viewBox="0 0 64 64" width={size} height={size} style={{ flex: "none" }}>
			<circle cx={32} cy={32} r={30} fill={mark === "check" ? COLORS.good : COLORS.bad} />
			{mark === "check" ? (
				<path d="M18,33 L28,43 L46,23" fill="none" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
			) : (
				<path d="M21,21 L43,43 M43,21 L21,43" stroke="#ffffff" strokeWidth={8} strokeLinecap="round" />
			)}
		</svg>
	);
}

/** Cartão do centro da tela: conta, número grande ou comparação certo/errado. */
export function Card({ card, frame, layout }: { card: TCard; frame: number; layout: "right" | "top" }) {
	const { fps } = useVideoConfig();
	const appear = pop(frame, fps, 3);
	const box = layout === "right" ? { top: 440, left: 420, width: 610 } : { top: 440, left: 90, width: 900 };
	const shell = {
		position: "absolute" as const,
		...box,
		background: "#ffffff",
		borderRadius: 36,
		border: `5px solid ${COLORS.cobalt}`,
		boxShadow: "0 14px 0 rgba(23,58,110,0.18)",
		padding: "30px 36px 24px",
		fontFamily: DISPLAY_FONT,
		color: COLORS.ink,
		transform: `scale(${0.7 + appear * 0.3}) rotate(${(1 - appear) * -4}deg)`,
		opacity: appear,
	};

	if (card.kind === "math") {
		return (
			<div style={shell}>
				{card.rows.map((row, i) => {
					const rowPop = pop(frame, fps, 6 + i * 7);
					const shake = row.bad ? Math.sin(frame * 1.5) * interpolate(frame, [14, 34], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
					return (
						<div
							key={row.label}
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "baseline",
								gap: 16,
								padding: "6px 0 0",
								borderTop: row.strong ? `4px solid ${COLORS.ink}` : "none",
								marginTop: row.strong ? 10 : 0,
								opacity: rowPop,
								transform: `translateX(${(1 - rowPop) * 40 + shake}px)`,
							}}
						>
							<span style={{ fontSize: row.strong ? 50 : 44, fontWeight: row.strong ? 800 : 700, lineHeight: 1.15, minWidth: 0 }}>{row.label}</span>
							<span
								style={{
									fontSize: row.strong ? 64 : 52,
									fontWeight: 800,
									lineHeight: 1.15,
									color: row.bad ? COLORS.bad : row.strong ? COLORS.cobalt : COLORS.ink,
									background: row.accent ? COLORS.gold : "transparent",
									borderRadius: 14,
									padding: row.accent ? "0 14px" : 0,
									whiteSpace: "nowrap",
									flex: "none",
								}}
							>
								{row.value}
							</span>
						</div>
					);
				})}
			</div>
		);
	}

	if (card.kind === "stat") {
		return (
			<div style={{ ...shell, textAlign: "center" }}>
				{card.mark ? (
					<div style={{ position: "absolute", top: -28, right: -20 }}>
						<MarkBadge mark={card.mark} size={84} />
					</div>
				) : null}
				<div style={{ fontSize: 190, fontWeight: 800, lineHeight: 1, color: card.mark === "cross" ? COLORS.bad : COLORS.cobalt }}>{card.value}</div>
				<div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.1 }}>{card.caption}</div>
			</div>
		);
	}

	if (card.kind === "term") {
		// Página de dicionário: papel creme com margem vermelha.
		return (
			<div style={{ ...shell, background: "#fffdf6", paddingLeft: 64, overflow: "hidden" }}>
				<div style={{ position: "absolute", left: 34, top: 0, bottom: 0, width: 4, background: "#f2a7a7" }} />
				<div style={{ fontSize: Math.min(96, Math.floor(500 / (0.52 * card.term.length))), fontWeight: 800, lineHeight: 1, color: COLORS.cobalt, whiteSpace: "nowrap" }}>{card.term}</div>
				{card.tag ? <div style={{ fontSize: 30, fontWeight: 700, fontStyle: "italic", color: "#687a80", marginTop: 6 }}>{card.tag}</div> : null}
				<div style={{ height: 6, width: 120, background: COLORS.gold, borderRadius: 3, margin: "14px 0 16px" }} />
				<div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.18, opacity: pop(frame, fps, 10) }}>{card.definition}</div>
			</div>
		);
	}

	if (card.kind === "formula") {
		const words = card.expression.split(/(\s+)/);
		const exampleIn = pop(frame, fps, 18);
		return (
			<div style={{ ...shell, textAlign: "center" }}>
				<div style={{ fontSize: 30, fontWeight: 800, color: "#687a80", letterSpacing: 2 }}>FÓRMULA</div>
				<div style={{ fontSize: Math.min(50, Math.floor(530 / (0.5 * card.expression.length))), fontWeight: 800, lineHeight: 1.25, whiteSpace: "nowrap" }}>
					{words.map((word, i) =>
						card.highlight.includes(word) ? (
							<span key={i} style={{ background: COLORS.gold, borderRadius: 14, padding: "0 12px" }}>
								{word}
							</span>
						) : (
							<span key={i}>{word}</span>
						),
					)}
				</div>
				{card.example ? (
					<div style={{ marginTop: 16, paddingTop: 14, borderTop: "4px dashed #c9d6e8", fontSize: Math.min(54, Math.floor(530 / (0.5 * card.example.length))), whiteSpace: "nowrap", fontWeight: 800, color: COLORS.cobalt, opacity: exampleIn, transform: `translateY(${(1 - exampleIn) * 20}px)` }}>
						{card.example}
					</div>
				) : null}
			</div>
		);
	}

	if (card.kind === "recap") {
		return (
			<div style={{ ...shell, background: "#fffdf6", display: "flex", flexDirection: "column", gap: 18 }}>
				<div style={{ fontSize: 34, fontWeight: 800, color: COLORS.cobalt, letterSpacing: 1 }}>📌 {card.title}</div>
				{card.rows.map((row, i) => {
					const rowPop = pop(frame, fps, 8 + i * 12);
					return (
						<div key={row.term} style={{ display: "flex", alignItems: "center", gap: 18, opacity: rowPop, transform: `translateX(${(1 - rowPop) * 40}px)` }}>
							<span style={{ flex: "none", background: COLORS.cobalt, color: "#ffffff", borderRadius: 14, padding: "6px 16px 0", fontSize: 34, fontWeight: 800 }}>{row.term}</span>
							<span style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1 }}>{row.text}</span>
						</div>
					);
				})}
			</div>
		);
	}

	return (
		<div style={{ ...shell, display: "flex", flexDirection: "column", gap: 22 }}>
			{card.rows.map((row, i) => {
				const rowPop = pop(frame, fps, 8 + i * 16);
				return (
					<div key={row.text} style={{ display: "flex", alignItems: "center", gap: 22, opacity: rowPop, transform: `scale(${0.8 + rowPop * 0.2})` }}>
						<MarkBadge mark={row.mark} size={76} />
						<span style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.05 }}>{row.text}</span>
					</div>
				);
			})}
		</div>
	);
}

/** Selo da série no lugar do contador: diz de cara que é o glossário e qual o termo do episódio. */
export function SeriesBadge({ term, frame }: { term: string; frame: number }) {
	const { fps } = useVideoConfig();
	const appear = pop(frame, fps);
	return (
		<div
			style={{
				position: "absolute",
				top: 270,
				right: 50,
				width: 300,
				background: COLORS.cobalt,
				borderRadius: 24,
				padding: "14px 18px 6px",
				textAlign: "center",
				fontFamily: DISPLAY_FONT,
				color: "#ffffff",
				boxShadow: "0 8px 0 rgba(23,58,110,0.25)",
				transform: `scale(${0.7 + appear * 0.3})`,
				opacity: appear,
			}}
		>
			<div style={{ fontSize: 30, fontWeight: 800, color: COLORS.gold, lineHeight: 1.1, letterSpacing: 2 }}>📖 GLOSSÁRIO</div>
			<div style={{ fontSize: Math.min(60, Math.floor(280 / (0.56 * term.length))), fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap" }}>{term}</div>
		</div>
	);
}
