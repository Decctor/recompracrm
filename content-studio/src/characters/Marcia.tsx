import type { ReactNode } from "react";
import type { TMood, TOwnerPose } from "../types";
import { COLORS, DISPLAY_FONT } from "../theme";

// Márcia, dona da sorveteria. viewBox 500×1000, pés em y=985, centro em x=250.
// Os braços têm ombro e cotovelo, então novas poses são só ângulos.

const SKIN = "#c98b63";
const SKIN_DARK = "#a86d4b";
const HAIR = "#3a2420";
const SHIRT = "#ffcf5c";
const PANTS = "#2c3550";
const STROKE = { stroke: COLORS.outline, strokeWidth: 6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

type Angles = { shoulder: number; elbow: number };
const POSES: Record<TOwnerPose, { left: Angles; right: Angles }> = {
	idle: { left: { shoulder: 7, elbow: -4 }, right: { shoulder: -7, elbow: 4 } },
	sign: { left: { shoulder: 18, elbow: -118 }, right: { shoulder: -18, elbow: 118 } },
	phone: { left: { shoulder: 7, elbow: -4 }, right: { shoulder: 12, elbow: 128 } },
	worried: { left: { shoulder: 7, elbow: -4 }, right: { shoulder: 28, elbow: 142 } },
};

type MarciaProps = { pose: TOwnerPose; mood: TMood; frame: number; mouth?: number; signText?: string };

export function Marcia({ pose, mood, frame, mouth = 0, signText = "10% OFF\nEM TUDO" }: MarciaProps) {
	const t = frame / 30;
	const sway = Math.sin(t * 1.6) * 1.2;
	const blink = (frame + 40) % 110 < 5 ? 0.12 : 1;
	const angles = POSES[pose];
	const handProp = pose === "phone" ? <Phone /> : null;

	return (
		<svg viewBox="0 0 500 1000" width={500} height={1000} style={{ overflow: "visible" }}>
			<ellipse cx={250} cy={985} rx={150} ry={18} fill="rgba(40,30,20,0.18)" />
			<g transform={`rotate(${sway} 250 985)`}>
				{/* pernas e sapatos */}
				<path d="M188,700 L192,962 L244,962 L248,700 Z" fill={PANTS} {...STROKE} />
				<path d="M252,700 L256,962 L308,962 L312,700 Z" fill={PANTS} {...STROKE} />
				<path d="M178,962 C178,940 250,940 250,962 L250,978 L178,978 Z" fill="#ffffff" {...STROKE} />
				<path d="M250,962 C250,940 322,940 322,962 L322,978 L250,978 Z" fill="#ffffff" {...STROKE} />

				{/* braço esquerdo (atrás do corpo) */}
				<Arm side="left" angles={angles.left} />

				{/* tronco */}
				<path d="M178,452 C214,432 286,432 322,452 C350,470 354,566 346,724 L154,724 C146,566 150,470 178,452 Z" fill={SHIRT} {...STROKE} />
				{/* avental azul da sorveteria */}
				<path d="M196,520 L304,520 L318,736 L182,736 Z" fill={COLORS.cobalt} {...STROKE} />
				<path d="M196,520 L214,452 M304,520 L286,452" {...STROKE} stroke={COLORS.cobaltDark} strokeWidth={10} />
				<rect x={222} y={600} width={56} height={44} rx={10} fill="#ffffff" opacity={0.9} />
				<path d="M240,612 L250,636 L260,612 Z" fill={COLORS.gold} />
				<circle cx={250} cy={609} r={9} fill="#f3a7c0" />

				{/* pescoço e cabeça */}
				<rect x={228} y={404} width={44} height={50} rx={14} fill={SKIN_DARK} />
				<Head mood={mood} blink={blink} t={t} mouth={mouth} />

				{/* braço direito (na frente) */}
				<Arm side="right" angles={angles.right} hand={handProp} />

				{pose === "sign" ? <Sign text={signText} /> : null}
			</g>
		</svg>
	);
}

function Arm({ side, angles, hand }: { side: "left" | "right"; angles: Angles; hand?: ReactNode }) {
	const sx = side === "left" ? 166 : 334;
	const sy = 474;
	return (
		<g transform={`rotate(${angles.shoulder} ${sx} ${sy})`}>
			<rect x={sx - 24} y={sy - 18} width={48} height={136} rx={24} fill={SHIRT} {...STROKE} />
			<g transform={`rotate(${angles.elbow} ${sx} ${sy + 108})`}>
				<rect x={sx - 19} y={sy + 92} width={38} height={124} rx={19} fill={SKIN} {...STROKE} />
				<circle cx={sx} cy={sy + 222} r={25} fill={SKIN} {...STROKE} />
				{hand ? <g transform={`translate(${sx} ${sy + 222})`}>{hand}</g> : null}
			</g>
		</g>
	);
}

function Phone() {
	return (
		<g transform="rotate(-128)">
			<rect x={-30} y={-58} width={60} height={104} rx={12} fill="#1b1b1f" {...STROKE} strokeWidth={5} />
			<rect x={-22} y={-48} width={44} height={82} rx={6} fill={COLORS.paleBlue} />
			<rect x={-22} y={-48} width={44} height={16} rx={6} fill={COLORS.cobalt} />
		</g>
	);
}

function Head({ mood, blink, t, mouth }: { mood: TMood; blink: number; t: number; mouth: number }) {
	const tilt = mood === "worried" ? 5 : mood === "hopeful" ? -3 : mood === "annoyed" ? -2 + Math.sin(t * 6) * 1.5 : Math.sin(t * 1.3) * 1.5;
	const brows: Record<TMood, [string, string]> = {
		happy: ["M196,300 Q212,290 228,298", "M272,298 Q288,290 304,300"],
		hopeful: ["M196,296 Q212,282 228,292", "M272,292 Q288,282 304,296"],
		worried: ["M196,292 Q214,292 230,306", "M270,306 Q286,292 304,292"],
		explain: ["M196,300 Q212,294 228,300", "M272,294 Q288,284 304,292"],
		annoyed: ["M196,290 Q214,296 232,308", "M268,308 Q286,296 304,290"],
	};
	const mouths: Record<TMood, ReactNode> = {
		happy: <path d="M222,378 Q250,410 278,378 Z" fill="#7a2330" {...STROKE} strokeWidth={5} />,
		hopeful: <path d="M226,380 Q250,398 274,380" fill="none" {...STROKE} strokeWidth={6} />,
		worried: <path d="M228,390 Q239,380 250,388 Q261,396 272,386" fill="none" {...STROKE} strokeWidth={6} />,
		explain: <path d="M230,384 Q250,394 270,384" fill="none" {...STROKE} strokeWidth={6} />,
		annoyed: <path d="M228,392 Q250,380 272,392" fill="none" {...STROKE} strokeWidth={6} />,
	};
	// Falando: boca aberta que acompanha as sílabas (mesma conta do Caramelo).
	const h = 6 + 30 * mouth;
	const tense = mood === "worried" || mood === "annoyed";
	const talking = mouth > 0.08 && tense ? (
		<g>
			{/* boca em "O": fala de susto ou reclamação, nunca sorrindo */}
			<ellipse cx={250} cy={388} rx={12 + 6 * mouth} ry={5 + 14 * mouth} fill="#7a2330" {...STROKE} strokeWidth={5} />
		</g>
	) : mouth > 0.08 ? (
		<g>
			<path d={`M226,380 Q250,386 274,380 Q272,${380 + h} 250,${382 + h} Q228,${380 + h} 226,380 Z`} fill="#7a2330" {...STROKE} strokeWidth={5} />
			<ellipse cx={250} cy={378 + h * 0.85} rx={11} ry={Math.min(h * 0.28, 8)} fill="#f07c8a" />
		</g>
	) : null;
	return (
		<g transform={`rotate(${tilt} 250 420)`}>
			{/* coque com prendedor dourado */}
			<circle cx={250} cy={196} r={46} fill={HAIR} {...STROKE} />
			<rect x={218} y={226} width={64} height={18} rx={9} fill={COLORS.gold} {...STROKE} strokeWidth={5} />
			<circle cx={146} cy={340} r={20} fill={SKIN} {...STROKE} />
			<circle cx={354} cy={340} r={20} fill={SKIN} {...STROKE} />
			<path d="M250,232 C320,232 356,282 356,340 C356,402 312,438 250,438 C188,438 144,402 144,340 C144,282 180,232 250,232 Z" fill={SKIN} {...STROKE} />
			{/* cabelo preso, com franja lateral */}
			<path d="M146,330 C140,262 190,226 250,226 C314,226 362,264 354,330 C330,296 300,280 258,276 C228,296 186,312 146,330 Z" fill={HAIR} {...STROKE} />
			<ellipse cx={196} cy={372} rx={18} ry={10} fill="#e58c7a" opacity={0.5} />
			<ellipse cx={304} cy={372} rx={18} ry={10} fill="#e58c7a" opacity={0.5} />
			{[212, 288].map((cx) => (
				<g key={cx} transform={`translate(${cx} 336) scale(1 ${blink}) translate(${-cx} -336)`}>
					<ellipse cx={cx} cy={336} rx={12} ry={15} fill="#22150f" />
					<circle cx={cx + 4} cy={330} r={4} fill="#ffffff" />
				</g>
			))}
			<g fill="none" stroke={HAIR} strokeWidth={7} strokeLinecap="round">
				<path d={brows[mood][0]} />
				<path d={brows[mood][1]} />
			</g>
			<path d="M250,346 Q244,362 252,364" fill="none" stroke={SKIN_DARK} strokeWidth={5} strokeLinecap="round" />
			{talking ?? mouths[mood]}
			<circle cx={146} cy={366} r={6} fill={COLORS.gold} />
			<circle cx={354} cy={366} r={6} fill={COLORS.gold} />
		</g>
	);
}

function Sign({ text }: { text: string }) {
	const lines = text.split("\n");
	return (
		<g transform="rotate(-3 250 600)">
			<path d="M196,470 L250,420 L304,470" fill="none" stroke={COLORS.outline} strokeWidth={5} />
			<rect x={118} y={468} width={264} height={200} rx={18} fill="#ffffff" {...STROKE} />
			<rect x={132} y={482} width={236} height={172} rx={12} fill="none" stroke={COLORS.bad} strokeWidth={5} strokeDasharray="14 10" />
			{lines.map((line, i) => (
				<text
					key={line}
					x={250}
					y={556 + i * 70}
					textAnchor="middle"
					fontFamily={DISPLAY_FONT}
					fontWeight={800}
					fontSize={i === 0 ? 62 : 50}
					fill={COLORS.bad}
				>
					{line}
				</text>
			))}
		</g>
	);
}
