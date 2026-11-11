import { COLORS, DISPLAY_FONT, FLOOR_Y, HEIGHT, WIDTH } from "../theme";

// Cenário da sorveteria da Márcia, 1080×1920. Tons claros e pouco contraste para os personagens e
// os textos saltarem; a porta à esquerda é o lugar do Caramelo.

const WALL = "#eef4fc";
const WALL_STRIPE = "#e3edf9";
const LINE = "#c9d6e8";

export function Sorveteria() {
	const stripes = Array.from({ length: Math.ceil(WIDTH / 120) }, (_, i) => i * 120);
	const tiles = Array.from({ length: 10 }, (_, i) => i);
	return (
		<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT}>
			<rect width={WIDTH} height={HEIGHT} fill={WALL} />
			{stripes.map((x) => (
				<rect key={x} x={x} y={0} width={60} height={FLOOR_Y - 250} fill={WALL_STRIPE} />
			))}

			{/* luminárias */}
			{[300, 780].map((x) => (
				<g key={x}>
					<line x1={x} y1={0} x2={x} y2={150} stroke={LINE} strokeWidth={6} />
					<path d={`M${x - 70},210 Q${x},120 ${x + 70},210 Z`} fill={COLORS.gold} opacity={0.85} />
					<ellipse cx={x} cy={214} rx={40} ry={10} fill="#fff6d6" />
				</g>
			))}

			{/* porta com placa ABERTO */}
			<rect x={30} y={560} width={290} height={FLOOR_Y - 560} rx={16} fill="#ffffff" stroke={LINE} strokeWidth={10} />
			<rect x={62} y={600} width={226} height={520} rx={10} fill="#d7e8f7" />
			<path d="M80,640 L150,600 M100,700 L220,620" stroke="#ffffff" strokeWidth={14} strokeLinecap="round" opacity={0.8} />
			<rect x={100} y={760} width={150} height={66} rx={10} fill={COLORS.good} />
			<text x={175} y={806} textAnchor="middle" fontFamily={DISPLAY_FONT} fontWeight={800} fontSize={40} fill="#ffffff">
				ABERTO
			</text>
			<rect x={262} y={1180} width={18} height={90} rx={9} fill={LINE} />

			{/* quadro com casquinha: sem texto, para não brigar com os cartões que passam por cima */}
			<rect x={640} y={560} width={360} height={430} rx={30} fill={COLORS.cobaltDark} />
			<rect x={662} y={582} width={316} height={386} rx={20} fill="none" stroke={COLORS.gold} strokeWidth={6} strokeDasharray="18 12" />
			<path d="M760,760 L820,930 L880,760 Z" fill="#e8b46a" stroke="#b9823c" strokeWidth={6} strokeLinejoin="round" />
			<path d="M778,790 L862,790 M790,830 L850,830 M772,770 L848,880 M868,770 L800,890" stroke="#b9823c" strokeWidth={4} />
			<circle cx={820} cy={700} r={62} fill="#f6b6c8" />
			<circle cx={772} cy={740} r={46} fill="#b9e3c6" />
			<circle cx={868} cy={740} r={46} fill="#fbe3a2" />
			<circle cx={838} cy={676} r={14} fill="#ffffff" opacity={0.6} />
			<circle cx={820} cy={628} r={14} fill="#d64545" />

			{/* balcão refrigerado atrás dos personagens */}
			<rect x={330} y={1060} width={WIDTH - 330} height={FLOOR_Y - 1060} fill="#ffffff" />
			<rect x={330} y={1060} width={WIDTH - 330} height={28} fill={COLORS.cobalt} />
			<rect x={360} y={1110} width={WIDTH - 390} height={200} rx={18} fill="#dcecf8" />
			{["#f6b6c8", "#fbe3a2", "#b9e3c6", "#c9b6f2", "#f6b6c8", "#ffd8a8"].map((color, i) => (
				<g key={i}>
					<rect x={385 + i * 112} y={1200} width={92} height={90} rx={12} fill="#ffffff" />
					<ellipse cx={431 + i * 112} cy={1206} rx={46} ry={22} fill={color} />
				</g>
			))}
			<rect x={330} y={1340} width={WIDTH - 330} height={FLOOR_Y - 1340} fill="#f4f7fb" />
			<line x1={330} y1={1340} x2={WIDTH} y2={1340} stroke={LINE} strokeWidth={6} />

			{/* piso xadrez */}
			<rect x={0} y={FLOOR_Y - 20} width={WIDTH} height={HEIGHT - FLOOR_Y + 20} fill="#f3eadb" />
			{tiles.map((row) =>
				tiles.map((col) =>
					(row + col) % 2 === 0 ? (
						<rect key={`${row}-${col}`} x={col * 120} y={FLOOR_Y - 20 + row * 90} width={120} height={90} fill="#e4d6bf" />
					) : null,
				),
			)}
			<rect x={0} y={FLOOR_Y - 26} width={WIDTH} height={12} fill="#d8c7aa" />
		</svg>
	);
}
