import type { TDogPose, TMood } from "../types";
import { COLORS } from "../theme";

// Caramelo, o vira-lata da porta da loja. Desenhado em SVG para que qualquer pose, expressão e
// sincronia de boca saiam do código, sem gerar imagem por episódio.
// viewBox 600×800, pés em y=790, centro em x=300.

const FUR = "#d98c3f";
const FUR_DARK = "#b8692b";
const CREAM = "#f8e6c8";
const EYE = "#2b1a12";
const STROKE = { stroke: COLORS.outline, strokeWidth: 7, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

type CarameloProps = {
	pose: TDogPose;
	mood: TMood;
	/** Abertura da boca 0–1 (fala). */
	mouth: number;
	/** Frame local, para piscar, respirar e abanar o rabo. */
	frame: number;
	/** 0–1 para gestos que entram (pata subindo). */
	gesture: number;
};

export function Caramelo({ pose, mood, mouth, frame, gesture }: CarameloProps) {
	const t = frame / 30;
	const breath = Math.sin(t * 2.2) * 0.012;
	const wagSpeed = mood === "happy" ? 14 : mood === "worried" ? 3 : 7;
	const wagAmp = mood === "worried" ? 4 : 14;
	const wag = Math.sin(t * wagSpeed) * wagAmp;
	const headTilt = mood === "explain" ? -5 + Math.sin(t * 1.4) * 1.5 : mood === "worried" ? 4 : Math.sin(t * 1.7) * 2;
	const blinkPhase = (frame + 17) % 96;
	const blink = blinkPhase < 5 ? 0.12 : 1;
	const earDrop = mood === "worried" ? 1 : mood === "annoyed" ? 0.5 : 0;

	// Pata do lado direito da tela: em pé (0°), apontando para cima-direita, ou acenando.
	const raise = pose === "sit" ? 0 : gesture;
	const pointAngle = -148 * gesture;
	const waveAngle = (-128 + Math.sin(t * 10) * 14) * gesture;
	const rightLegAngle = pose === "point" ? pointAngle : pose === "wave" ? waveAngle : 0;

	// Pata da frente direita. Parada, fica na frente do corpo; no gesto, sai de trás do ombro e sobe,
	// mostrando a almofadinha.
	const rightLeg = (
		<g transform={`translate(${44 * raise} ${-24 * raise}) rotate(${rightLegAngle} 340 575)`}>
			<rect x={316} y={536} width={48} height={228} rx={24} fill={FUR} {...STROKE} />
			<ellipse cx={340} cy={768} rx={40} ry={21} fill={CREAM} {...STROKE} />
			{raise > 0.5 ? (
				<g fill="#f2a0a8">
					<ellipse cx={340} cy={770} rx={16} ry={9} />
					<circle cx={322} cy={757} r={6} />
					<circle cx={340} cy={753} r={6} />
					<circle cx={358} cy={757} r={6} />
				</g>
			) : (
				<path d="M328,768 L328,780 M352,768 L352,780" {...STROKE} strokeWidth={5} />
			)}
		</g>
	);

	return (
		<svg viewBox="0 0 600 800" width={600} height={800} style={{ overflow: "visible" }}>
			{/* sombra */}
			<ellipse cx={300} cy={790} rx={190} ry={20} fill="rgba(40,30,20,0.18)" />

			<g transform={`translate(300 790) scale(${1 - breath / 2} ${1 + breath}) translate(-300 -790)`}>
				{/* rabo */}
				<g transform={`rotate(${wag} 405 640)`}>
					<path d="M400,650 C478,648 532,592 522,512 C519,490 494,489 494,512 C495,570 458,606 400,612 Z" fill={FUR_DARK} {...STROKE} />
				</g>

				{raise >= 0.05 ? rightLeg : null}

				{/* patas de trás, sentado */}
				<ellipse cx={200} cy={712} rx={92} ry={72} fill={FUR} {...STROKE} />
				<ellipse cx={400} cy={712} rx={92} ry={72} fill={FUR} {...STROKE} />
				<ellipse cx={168} cy={772} rx={52} ry={22} fill={CREAM} {...STROKE} />
				<ellipse cx={432} cy={772} rx={52} ry={22} fill={CREAM} {...STROKE} />

				{/* corpo */}
				<path d="M300,380 C196,380 160,505 172,625 C182,722 232,772 300,772 C368,772 418,722 428,625 C440,505 404,380 300,380 Z" fill={FUR} {...STROKE} />
				<path d="M300,430 C250,430 232,520 240,598 C249,676 276,716 300,716 C324,716 351,676 360,598 C368,520 350,430 300,430 Z" fill={CREAM} />

				{/* pata da frente esquerda (sempre no chão) */}
				<path d="M236,560 L236,752 C236,768 284,768 284,752 L284,560 Z" fill={FUR} {...STROKE} />
				<ellipse cx={260} cy={768} rx={40} ry={21} fill={CREAM} {...STROKE} />
				<path d="M248,768 L248,780 M272,768 L272,780" {...STROKE} strokeWidth={5} />

				{raise < 0.05 ? rightLeg : null}

				{/* cabeça */}
				<g transform={`rotate(${headTilt} 300 430)`}>
					<Bandana />

					{/* orelha em pé (esquerda), com a pontinha dobrada */}
					<g transform={`rotate(${-6 - earDrop * 38 + Math.sin(t * 3) * 2} 205 215)`}>
						<path d="M168,236 C150,170 150,110 172,86 C198,104 238,150 262,196 Z" fill={FUR_DARK} {...STROKE} />
						<path d="M172,86 C186,96 198,108 206,120 C190,122 178,116 172,86 Z" fill={FUR} {...STROKE} strokeWidth={5} />
					</g>
					{/* orelha caída (direita) */}
					<g transform={`rotate(${4 + earDrop * 14 + Math.sin(t * 2.6 + 1) * 3} 395 205)`}>
						<path d="M352,176 C410,160 470,190 480,250 C488,300 470,336 446,330 C430,300 404,250 352,226 Z" fill={FUR_DARK} {...STROKE} />
					</g>

					<path d="M300,140 C402,140 462,204 462,292 C462,382 394,432 300,432 C206,432 138,382 138,292 C138,204 198,140 300,140 Z" fill={FUR} {...STROKE} />
					<path d="M300,168 C284,168 278,232 287,286 L313,286 C322,232 316,168 300,168 Z" fill={CREAM} />
					<ellipse cx={300} cy={350} rx={92} ry={64} fill={CREAM} />

					<ellipse cx={203} cy={334} rx={24} ry={13} fill="#ef9a7a" opacity={0.55} />
					<ellipse cx={397} cy={334} rx={24} ry={13} fill="#ef9a7a" opacity={0.55} />

					<Eyes mood={mood} blink={blink} t={t} />
					<Brows mood={mood} />

					{/* focinho */}
					<path d="M270,310 C270,296 330,296 330,310 C330,325 314,338 300,338 C286,338 270,325 270,310 Z" fill={EYE} />
					<ellipse cx={288} cy={306} rx={9} ry={5} fill="#ffffff" opacity={0.7} />
					<Mouth mood={mood} mouth={mouth} t={t} />
				</g>
			</g>
		</svg>
	);
}

function Bandana() {
	return (
		<g>
			<path d="M206,408 C250,430 350,430 394,408 L388,446 C350,462 250,462 212,446 Z" fill={COLORS.cobalt} {...STROKE} />
			<path d="M236,440 L300,528 L364,440 Z" fill={COLORS.cobalt} {...STROKE} />
			<circle cx={300} cy={492} r={27} fill={COLORS.gold} {...STROKE} strokeWidth={6} />
			<circle cx={300} cy={492} r={17} fill="none" stroke={COLORS.goldDark} strokeWidth={4} />
			{/* seta de volta: o cliente que retorna */}
			<path d="M291,486 A10,10 0 1 1 296,501" fill="none" stroke={COLORS.goldDark} strokeWidth={4} strokeLinecap="round" />
			<path d="M286,481 L291,487 L297,482" fill="none" stroke={COLORS.goldDark} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
		</g>
	);
}

function Eyes({ mood, blink, t }: { mood: TMood; blink: number; t: number }) {
	if (mood === "happy" && Math.sin(t * 0.9) > 0.55) {
		return (
			<g fill="none" stroke={EYE} strokeWidth={10} strokeLinecap="round">
				<path d="M218,284 Q240,256 262,284" />
				<path d="M338,284 Q360,256 382,284" />
			</g>
		);
	}
	const lookX = mood === "explain" ? 5 : 0;
	return (
		<g>
			{[240, 360].map((cx) => (
				<g key={cx} transform={`translate(${cx + lookX} 278) scale(1 ${blink}) translate(${-(cx + lookX)} -278)`}>
					<ellipse cx={cx + lookX} cy={278} rx={24} ry={30} fill={EYE} />
					<circle cx={cx + lookX + 8} cy={266} r={9} fill="#ffffff" />
					<circle cx={cx + lookX - 7} cy={290} r={4} fill="#ffffff" />
				</g>
			))}
		</g>
	);
}

function Brows({ mood }: { mood: TMood }) {
	const shapes: Record<TMood, [string, string]> = {
		happy: ["M216,226 Q238,214 260,222", "M340,222 Q362,214 384,226"],
		hopeful: ["M216,222 Q238,208 260,216", "M340,216 Q362,208 384,222"],
		worried: ["M216,216 Q240,214 262,236", "M338,236 Q360,214 384,216"],
		explain: ["M216,226 Q238,220 260,226", "M340,214 Q362,200 384,212"],
		annoyed: ["M216,214 Q240,222 262,234", "M338,234 Q360,222 384,214"],
	};
	return (
		<g fill="none" stroke={COLORS.outline} strokeWidth={8} strokeLinecap="round">
			<path d={shapes[mood][0]} />
			<path d={shapes[mood][1]} />
		</g>
	);
}

function Mouth({ mood, mouth, t }: { mood: TMood; mouth: number; t: number }) {
	// Parado e feliz, o Caramelo ofega de leve, como cachorro contente.
	const idleOpen = mood === "happy" ? 0.35 + Math.sin(t * 9) * 0.08 : 0;
	const open = Math.max(mouth, idleOpen);
	if (open < 0.08) {
		const corner = mood === "worried" ? 344 : 362;
		return (
			<g fill="none" {...STROKE} strokeWidth={7}>
				<path d="M300,338 L300,352" />
				<path d={mood === "worried" ? `M300,352 C290,346 272,348 262,${corner}` : `M300,352 C290,368 270,368 260,354`} />
				<path d={mood === "worried" ? `M300,352 C310,346 328,348 338,${corner}` : `M300,352 C310,368 330,368 340,354`} />
			</g>
		);
	}
	const h = 10 + 46 * open;
	return (
		<g>
			<path d="M300,338 L300,350" fill="none" {...STROKE} strokeWidth={7} />
			<path
				d={`M262,350 Q300,360 338,350 Q336,${350 + h * 1.15} 300,${350 + h * 1.25} Q264,${350 + h * 1.15} 262,350 Z`}
				fill="#7a2330"
				{...STROKE}
				strokeWidth={6}
			/>
			<ellipse cx={300} cy={350 + h * 0.98} rx={20} ry={Math.min(h * 0.32, 14)} fill="#f07c8a" />
		</g>
	);
}
