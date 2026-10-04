import { Box, Cylinder, Extrude, Plane, Shadow } from "./engine";
import { INK, ISO, type TIsoMaterial } from "./palette";

// Objetos isométricos reutilizados por capas e ícones. Coordenadas no mundo: (x, y) é o canto de
// trás do objeto no chão. A ordem de desenho é a do pintor — o que está mais perto de +x/+y vem
// depois —, então ao compor uma cena, desenhe primeiro os objetos com x + y menor.

type TAt = { x: number; y: number; z?: number };

export function Floor({ x, y, w, d, h = 10, m = ISO.floor }: TAt & { w: number; d: number; h?: number; m?: TIsoMaterial }) {
	return <Box x={x} y={y} z={-h} w={w} d={d} h={h} m={m} />;
}

export function Store({ x, y }: TAt) {
	const w = 130;
	const d = 96;
	const h = 78;
	const stripes = Array.from({ length: 11 }, (_, i) => i);
	return (
		<g>
			<Shadow x={x} y={y} w={w} d={d} />
			<Box x={x} y={y} w={w} d={d} h={h} m={ISO.paper} />
			{/* Fachada (face left): vitrine e porta */}
			<Plane plane="left" at={[x, y + d, h]}>
				<rect x={10} y={24} width={58} height={40} rx={3} fill={INK.glass} />
				<path d="M10 24 h58 v14 L10 64 Z" fill={INK.glassLight} opacity={0.7} />
				<rect x={38} y={24} width={2.5} height={40} fill={INK.white} />
				<rect x={8} y={64} width={62} height={4} rx={1} fill={ISO.sky.right} />
				<rect x={82} y={30} width={34} height={48} rx={3} fill={INK.navy} />
				<rect x={86} y={34} width={26} height={22} rx={2} fill={INK.glass} />
				<circle cx={108} cy={60} r={2.2} fill={INK.amber} />
			</Plane>
			{/* Lateral (face right): janela */}
			<Plane plane="right" at={[x + w, y + d, h]}>
				<rect x={18} y={26} width={30} height={26} rx={3} fill={INK.glass} />
				<rect x={56} y={26} width={30} height={26} rx={3} fill={INK.glass} />
				<path d="M18 26 h30 v8 L18 52 Z" fill={INK.glassLight} opacity={0.6} />
			</Plane>
			{/* Toldo listrado */}
			<Box x={x + 4} y={y + d} z={h - 22} w={w - 8} d={16} h={7} m={ISO.amber} />
			<Plane plane="left" at={[x + 4, y + d + 16, h - 15]}>
				{stripes.map((i) => (i % 2 === 1 ? <rect key={i} x={i * 11.1} y={0} width={11.1} height={7} fill={INK.white} /> : null))}
				{stripes.map((i) => (
					<path key={`s-${i}`} d={`M${i * 11.1} 7 a5.55 5.55 0 0 0 11.1 0 Z`} fill={i % 2 === 1 ? INK.white : INK.amber} />
				))}
			</Plane>
			{/* Telhado e letreiro */}
			<Box x={x - 5} y={y - 5} z={h} w={w + 10} d={d + 10} h={8} m={ISO.blue} />
			<Box x={x + 24} y={y + d - 4} z={h + 8} w={72} d={5} h={24} m={ISO.navy} />
			<Plane plane="left" at={[x + 24, y + d + 1, h + 32]}>
				<rect x={8} y={8} width={30} height={4} rx={2} fill={INK.white} />
				<rect x={8} y={15} width={18} height={3} rx={1.5} fill={INK.glass} />
				<circle cx={58} cy={12} r={6} fill={INK.amber} />
			</Plane>
		</g>
	);
}

export function Calendar({ x, y, z = 0, highlight = 9 }: TAt & { highlight?: number }) {
	const w = 76;
	const d = 12;
	const h = 84;
	const cells = Array.from({ length: 12 }, (_, i) => i);
	return (
		<g>
			{z === 0 && <Shadow x={x} y={y} w={w} d={d} />}
			<Box x={x} y={y} z={z} w={w} d={d} h={h} m={ISO.paper} />
			<Box x={x} y={y} z={z + h - 20} w={w} d={d} h={20} m={ISO.blue} />
			<Plane plane="left" at={[x, y + d, z + h]}>
				<rect x={10} y={7} width={26} height={4} rx={2} fill={INK.white} />
				<rect x={10} y={13} width={14} height={3} rx={1.5} fill={INK.glass} />
				{cells.map((i) => {
					const col = i % 4;
					const row = Math.floor(i / 4);
					const isHighlight = i === highlight;
					return (
						<rect
							key={i}
							x={8 + col * 16}
							y={28 + row * 17}
							width={12}
							height={12}
							rx={2.5}
							fill={isHighlight ? INK.amber : INK.lineSoft}
						/>
					);
				})}
			</Plane>
			{/* Argolas */}
			{[16, 52].map((ox) => (
				<Box key={ox} x={x + ox} y={y + 4} z={z + h - 6} w={7} d={4} h={12} m={ISO.navy} />
			))}
		</g>
	);
}

export function Phone({ x, y, z = 0 }: TAt) {
	const w = 58;
	const d = 7;
	const h = 108;
	return (
		<g>
			{z === 0 && <Shadow x={x} y={y} w={w} d={d} />}
			<Box x={x} y={y} z={z} w={w} d={d} h={h} m={ISO.navy} />
			<Plane plane="left" at={[x, y + d, z + h]}>
				<rect x={4} y={6} width={50} height={96} rx={6} fill={INK.white} />
				<rect x={21} y={9} width={16} height={3} rx={1.5} fill={ISO.sky.left} />
				<rect x={8} y={20} width={30} height={12} rx={5} fill={ISO.sky.top} />
				<rect x={20} y={38} width={30} height={12} rx={5} fill={INK.blue} />
				<rect x={8} y={56} width={26} height={12} rx={5} fill={ISO.sky.top} />
				<rect x={16} y={74} width={34} height={16} rx={5} fill={INK.amber} />
				<rect x={21} y={80} width={20} height={3} rx={1.5} fill={INK.navy} opacity={0.55} />
			</Plane>
		</g>
	);
}

function bubblePath(w: number, h: number, tailLeft = true) {
	const r = 8;
	const tail = tailLeft ? `M${r} ${h} l-6 9 l16 -9 Z` : `M${w - r} ${h} l6 9 l-16 -9 Z`;
	return `M${r} 0 h${w - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} v${h - 2 * r} a${r} ${r} 0 0 1 ${-r} ${r} h${-(w - 2 * r)} a${r} ${r} 0 0 1 ${-r} ${-r} v${-(h - 2 * r)} a${r} ${r} 0 0 1 ${r} ${-r} Z ${tail}`;
}

export function ChatBubble({ x, y, z = 60, w = 46, h = 28, m = ISO.blue, lines = 2, tailLeft = true }: TAt & { w?: number; h?: number; m?: TIsoMaterial; lines?: number; tailLeft?: boolean }) {
	const lineColor = m === ISO.paper ? ISO.sky.left : INK.white;
	return (
		<g>
			<Extrude plane="left" at={[x, y, z]} depth={6} m={m} shape={(fill) => <path d={bubblePath(w, h, tailLeft)} fill={fill} />} />
			<Plane plane="left" at={[x, y, z]}>
				{Array.from({ length: lines }, (_, i) => (
					<rect key={i} x={9} y={8 + i * 7} width={i === lines - 1 ? w * 0.4 : w - 18} height={3.2} rx={1.6} fill={lineColor} opacity={0.9} />
				))}
			</Plane>
		</g>
	);
}

export function CoinStack({ x, y, count = 4, r = 17, m = ISO.amber }: TAt & { count?: number; r?: number; m?: TIsoMaterial }) {
	const coinH = 6;
	return (
		<g>
			<Shadow x={x - r} y={y - r} w={r * 2} d={r * 2} />
			{Array.from({ length: count }, (_, i) => (
				<g key={i}>
					<Cylinder x={x} y={y} z={i * (coinH + 1)} r={r} h={coinH} m={ISO.bronze} />
					<Cylinder x={x} y={y} z={i * (coinH + 1) + 1} r={r} h={coinH - 1} m={m} />
				</g>
			))}
			<Plane plane="top" at={[x, y, count * (coinH + 1)]}>
				<circle cx={0} cy={0} r={r * 0.68} fill="none" stroke={ISO.bronze.left} strokeWidth={2} />
			</Plane>
		</g>
	);
}

export function BarChart({ x, y, heights = [26, 44, 36, 62, 88] }: TAt & { heights?: number[] }) {
	const bw = 16;
	const gap = 8;
	const w = heights.length * (bw + gap) + gap;
	const d = 32;
	return (
		<g>
			<Shadow x={x} y={y} w={w} d={d} />
			<Box x={x} y={y} w={w} d={d} h={6} m={ISO.sky} />
			{heights.map((bh, i) => (
				<Box
					key={i}
					x={x + gap + i * (bw + gap)}
					y={y + 8}
					z={6}
					w={bw}
					d={16}
					h={bh}
					m={i === heights.length - 1 ? ISO.amber : ISO.blue}
				/>
			))}
		</g>
	);
}

export function GiftBox({ x, y, s = 44, m = ISO.amber, ribbon = ISO.navy }: TAt & { s?: number; m?: TIsoMaterial; ribbon?: TIsoMaterial }) {
	const h = s * 0.8;
	const band = s * 0.18;
	const mid = (s - band) / 2;
	return (
		<g>
			<Shadow x={x} y={y} w={s} d={s} />
			<Box x={x} y={y} w={s} d={s} h={h} m={m} />
			<Plane plane="left" at={[x, y + s, h]}>
				<rect x={mid} y={0} width={band} height={h} fill={ribbon.left} />
			</Plane>
			<Plane plane="right" at={[x + s, y + s, h]}>
				<rect x={mid} y={0} width={band} height={h} fill={ribbon.right} />
			</Plane>
			{/* Tampa */}
			<Box x={x - 2} y={y - 2} z={h} w={s + 4} d={s + 4} h={s * 0.16} m={m} />
			<Plane plane="left" at={[x - 2, y + s + 2, h + s * 0.16]}>
				<rect x={mid + 2} y={0} width={band} height={s * 0.16} fill={ribbon.left} />
			</Plane>
			<Plane plane="right" at={[x + s + 2, y + s + 2, h + s * 0.16]}>
				<rect x={mid + 2} y={0} width={band} height={s * 0.16} fill={ribbon.right} />
			</Plane>
			<Plane plane="top" at={[x - 2, y - 2, h + s * 0.16]}>
				<rect x={mid + 2} y={0} width={band} height={s + 4} fill={ribbon.top} />
				<rect x={0} y={mid + 2} width={s + 4} height={band} fill={ribbon.top} />
			</Plane>
			{/* Laço */}
			<Extrude
				plane="left"
				at={[x + s / 2 - s * 0.32, y + s / 2 + 2, h + s * 0.16 + s * 0.3]}
				depth={4}
				m={ribbon}
				shape={(fill) => (
					<path
						d={`M${s * 0.32} ${s * 0.3} C${s * 0.1} ${s * 0.02} ${-s * 0.02} ${s * 0.12} ${s * 0.06} ${s * 0.26} Z M${s * 0.32} ${s * 0.3} C${s * 0.54} ${s * 0.02} ${s * 0.66} ${s * 0.12} ${s * 0.58} ${s * 0.26} Z`}
						fill={fill}
						stroke={fill}
						strokeWidth={s * 0.08}
						strokeLinejoin="round"
					/>
				)}
			/>
		</g>
	);
}

export function Bag({ x, y, m = ISO.paper, accent = INK.amber, s = 1 }: TAt & { m?: TIsoMaterial; accent?: string; s?: number }) {
	const w = 38 * s;
	const d = 18 * s;
	const h = 46 * s;
	return (
		<g>
			<Shadow x={x} y={y} w={w} d={d} />
			<Plane plane="left" at={[x, y + d / 2, h]}>
				<path
					d={`M${w * 0.28} 0 v-${8 * s} a${w * 0.22} ${w * 0.22} 0 0 1 ${w * 0.44} 0 v${8 * s}`}
					fill="none"
					stroke={ISO.navy.left}
					strokeWidth={3 * s}
					strokeLinecap="round"
				/>
			</Plane>
			<Box x={x} y={y} w={w} d={d} h={h} m={m} />
			<Plane plane="left" at={[x, y + d, h]}>
				<rect x={0} y={h * 0.38} width={w} height={h * 0.2} fill={accent} />
			</Plane>
			<Plane plane="right" at={[x + w, y + d, h]}>
				<rect x={0} y={h * 0.38} width={d} height={h * 0.2} fill={accent} opacity={0.8} />
			</Plane>
		</g>
	);
}

export function Clipboard({ x, y, z = 0, checked = 2 }: TAt & { checked?: number }) {
	const w = 74;
	const d = 96;
	const rows = [0, 1, 2, 3];
	return (
		<g>
			{z === 0 && <Shadow x={x} y={y} w={w} d={d} />}
			<Box x={x} y={y} z={z} w={w} d={d} h={5} m={ISO.navy} />
			<Box x={x + 6} y={y + 8} z={z + 5} w={w - 12} d={d - 14} h={2} m={ISO.paper} />
			<Plane plane="top" at={[x + 6, y + 8, z + 7]}>
				{rows.map((i) => (
					<g key={i}>
						<rect x={8} y={12 + i * 17} width={10} height={10} rx={2.5} fill={i < checked ? INK.amber : INK.lineSoft} />
						{i < checked && <path d={`M10.5 ${17 + i * 17} l2.5 2.5 l4 -5`} fill="none" stroke={INK.navy} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
						<rect x={24} y={13 + i * 17} width={i % 2 ? 22 : 30} height={3.5} rx={1.75} fill={ISO.sky.left} />
						<rect x={24} y={18.5 + i * 17} width={14} height={2.5} rx={1.25} fill={INK.lineSoft} />
					</g>
				))}
			</Plane>
			<Box x={x + w / 2 - 12} y={y + 2} z={z + 5} w={24} d={10} h={6} m={ISO.amber} />
		</g>
	);
}

export function LoyaltyCard({ x, y, z = 0, m = ISO.blue }: TAt & { m?: TIsoMaterial }) {
	const w = 92;
	const d = 58;
	return (
		<g>
			{z === 0 && <Shadow x={x} y={y} w={w} d={d} />}
			<Box x={x} y={y} z={z} w={w} d={d} h={4} m={m} />
			<Plane plane="top" at={[x, y, z + 4]}>
				<rect x={10} y={12} width={16} height={12} rx={3} fill={INK.amber} />
				<rect x={10} y={34} width={44} height={4} rx={2} fill={INK.white} opacity={0.85} />
				<rect x={10} y={42} width={26} height={3} rx={1.5} fill={INK.white} opacity={0.5} />
				<circle cx={74} cy={40} r={8} fill={INK.amber} opacity={0.9} />
				<circle cx={66} cy={40} r={8} fill={INK.white} opacity={0.35} />
			</Plane>
		</g>
	);
}

export function PriceTag({ x, y, z = 40, m = ISO.amber, label = "%" }: TAt & { m?: TIsoMaterial; label?: string }) {
	return (
		<g>
			<Extrude
				plane="left"
				at={[x, y, z]}
				depth={5}
				m={m}
				shape={(fill) => <path d="M14 0 H62 a6 6 0 0 1 6 6 V40 a6 6 0 0 1 -6 6 H14 L0 23 Z" fill={fill} />}
			/>
			<Plane plane="left" at={[x, y, z]}>
				<circle cx={14} cy={23} r={4} fill={INK.white} />
				<text x={43} y={32} textAnchor="middle" fontSize={24} fontWeight={800} fill={INK.navy} fontFamily="inherit">
					{label}
				</text>
			</Plane>
		</g>
	);
}

export function Clock({ x, y, z = 30, r = 26 }: TAt & { r?: number }) {
	return (
		<g>
			<Extrude plane="left" at={[x, y, z]} depth={6} m={ISO.navy} shape={(fill) => <circle cx={r} cy={r} r={r} fill={fill} />} />
			<Plane plane="left" at={[x, y, z]}>
				<circle cx={r} cy={r} r={r - 5} fill={INK.white} />
				{[0, 90, 180, 270].map((deg) => (
					<rect key={deg} x={r - 1} y={8} width={2} height={4} rx={1} fill={ISO.sky.right} transform={`rotate(${deg} ${r} ${r})`} />
				))}
				<path d={`M${r} ${r} V${r - 13} M${r} ${r} L${r + 9} ${r + 4}`} stroke={INK.navy} strokeWidth={3} strokeLinecap="round" />
				<circle cx={r} cy={r} r={3} fill={INK.amber} />
			</Plane>
		</g>
	);
}

export function Bunting({ x, y, z = 90, length = 220, sag = 16 }: TAt & { length?: number; sag?: number }) {
	const flags = Math.floor(length / 20);
	const colors = [INK.amber, INK.blue, INK.white, INK.amber, ISO.bronze.left, INK.white];
	return (
		<Plane plane="left" at={[x, y, z]}>
			<path d={`M0 0 Q${length / 2} ${sag * 2} ${length} 0`} fill="none" stroke={INK.navy} strokeWidth={1.4} />
			{Array.from({ length: flags }, (_, i) => {
				const t = (i + 0.5) / flags;
				const px = t * length;
				const py = 2 * t * (1 - t) * sag * 2;
				return <path key={i} d={`M${px - 7} ${py} L${px + 7} ${py} L${px} ${py + 15} Z`} fill={colors[i % colors.length]} stroke={ISO.sky.right} strokeWidth={0.6} />;
			})}
		</Plane>
	);
}

export function Pole({ x, y, h = 96 }: TAt & { h?: number }) {
	return <Box x={x} y={y} w={4} d={4} h={h} m={ISO.bronze} />;
}

export function Monitor({ x, y }: TAt) {
	const w = 84;
	return (
		<g>
			<Shadow x={x} y={y} w={w} d={30} />
			<Box x={x + 22} y={y + 6} w={40} d={24} h={4} m={ISO.navy} />
			<Box x={x + 37} y={y + 14} z={4} w={10} d={6} h={20} m={ISO.navy} />
			<Box x={x} y={y + 10} z={24} w={w} d={6} h={58} m={ISO.navy} />
			<Plane plane="left" at={[x, y + 16, 82]}>
				<rect x={4} y={4} width={w - 8} height={48} rx={3} fill={INK.white} />
				<rect x={10} y={10} width={26} height={4} rx={2} fill={INK.blue} />
				<rect x={10} y={20} width={32} height={22} rx={3} fill={ISO.sky.top} />
				<rect x={48} y={20} width={26} height={9} rx={3} fill={INK.amber} />
				<rect x={48} y={33} width={26} height={9} rx={3} fill={INK.blue} />
			</Plane>
		</g>
	);
}

export function Target({ x, y }: TAt) {
	const rings: [number, TIsoMaterial][] = [
		[30, ISO.blue],
		[23, ISO.paper],
		[16, ISO.blue],
		[8, ISO.amber],
	];
	return (
		<g>
			<Shadow x={x - 30} y={y - 30} w={60} d={60} />
			{rings.map(([r, m], i) => (
				<Cylinder key={r} x={x} y={y} z={i * 4} r={r} h={4} m={m} />
			))}
		</g>
	);
}

// Glifos extrudados: forma 2D em caixa de 48×48, de pé no plano left.
const GLYPHS = {
	heart: "M24 44 C10 34 2 26 2 16 C2 8 8 3 15 3 C19 3 22 5 24 8 C26 5 29 3 33 3 C40 3 46 8 46 16 C46 26 38 34 24 44 Z",
	bolt: "M28 1 L8 27 H22 L18 47 L40 19 H26 Z",
	sparkle: "M24 1 C26 15 33 22 47 24 C33 26 26 33 24 47 C22 33 15 26 1 24 C15 22 22 15 24 1 Z",
	flame: "M24 1 C30 12 40 18 40 31 C40 41 33 47 24 47 C15 47 8 41 8 31 C8 24 12 19 16 16 C16 22 19 26 23 26 C19 18 20 9 24 1 Z",
	check: "M4 25 L17 38 L44 9 L38 4 L17 27 L10 19 Z",
	trophy:
		"M12 2 H36 V6 H46 V12 C46 20 41 24 35 25 C33 30 29 33 27 34 V39 H34 V46 H14 V39 H21 V34 C19 33 15 30 13 25 C7 24 2 20 2 12 V6 H12 Z M7 11 V12 C7 16 9 19 12 20 C12 17 12 14 12 11 Z M41 11 H36 C36 14 36 17 36 20 C39 19 41 16 41 12 Z",
	lock: "M14 20 V14 C14 7 18 2 24 2 C30 2 34 7 34 14 V20 H38 A4 4 0 0 1 42 24 V43 A4 4 0 0 1 38 47 H10 A4 4 0 0 1 6 43 V24 A4 4 0 0 1 10 20 Z M19 20 H29 V14 C29 10 27 7 24 7 C21 7 19 10 19 14 Z",
	plug: "M16 2 H21 V12 H27 V2 H32 V12 H38 V22 C38 30 32 35 27 36 V46 H21 V36 C16 35 10 30 10 22 V12 H16 Z",
} as const;

export type TGlyph = keyof typeof GLYPHS;

export function Glyph({ x, y, z = 22, glyph, m = ISO.amber, depth = 7 }: TAt & { glyph: TGlyph; m?: TIsoMaterial; depth?: number }) {
	return (
		<Extrude plane="left" at={[x, y, z + 48]} depth={depth} m={m} shape={(fill) => <path d={GLYPHS[glyph]} fill={fill} fillRule="evenodd" />} />
	);
}

function gearPath(cx: number, cy: number, teeth = 8, rOuter = 23, rInner = 17, hole = 7) {
	const points: string[] = [];
	const step = (Math.PI * 2) / teeth;
	for (let i = 0; i < teeth; i++) {
		const a = i * step;
		const angles = [a - step * 0.32, a - step * 0.18, a + step * 0.18, a + step * 0.32];
		const radii = [rInner, rOuter, rOuter, rInner];
		angles.forEach((ang, k) => points.push(`${(cx + Math.cos(ang) * radii[k]).toFixed(2)},${(cy + Math.sin(ang) * radii[k]).toFixed(2)}`));
	}
	return `M${points.join(" L")} Z M${cx + hole},${cy} A${hole} ${hole} 0 1 0 ${cx - hole},${cy} A${hole} ${hole} 0 1 0 ${cx + hole},${cy} Z`;
}

export function Gear({ x, y, z = 24, m = ISO.blue }: TAt & { m?: TIsoMaterial }) {
	return <Extrude plane="left" at={[x, y, z + 48]} depth={8} m={m} shape={(fill) => <path d={gearPath(24, 24)} fill={fill} fillRule="evenodd" />} />;
}

export function Calculator({ x, y }: TAt) {
	const w = 46;
	const d = 60;
	return (
		<g>
			<Shadow x={x} y={y} w={w} d={d} />
			<Box x={x} y={y} w={w} d={d} h={8} m={ISO.navy} />
			<Plane plane="top" at={[x, y, 8]}>
				<rect x={6} y={6} width={w - 12} height={14} rx={2} fill={ISO.sky.top} />
				{Array.from({ length: 9 }, (_, i) => (
					<rect key={i} x={6 + (i % 3) * 12} y={25 + Math.floor(i / 3) * 10} width={10} height={7} rx={1.5} fill={i === 8 ? INK.amber : ISO.blue.top} />
				))}
			</Plane>
		</g>
	);
}

// Cubo decorativo flutuante — dá profundidade e ritmo às capas.
export function Cube({ x, y, z, s = 10, m = ISO.amber }: TAt & { s?: number; m?: TIsoMaterial }) {
	return <Box x={x} y={y} z={z} w={s} d={s} h={s} m={m} />;
}
