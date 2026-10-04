import type { ReactNode } from "react";
import type { TIsoMaterial } from "./palette";

// Projeção isométrica verdadeira (30°). Eixos do mundo:
//   x → desce para a direita, y → desce para a esquerda, z → sobe.
// Quem olha a cena está do lado de +x/+y, então as faces visíveis de uma caixa são o topo,
// a face x = máx ("right", sombra) e a face y = máx ("left", tom base). A luz vem de cima
// à esquerda, por isso topo > left > right em claridade.
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

export function project(x: number, y: number, z: number): [number, number] {
	return [(x - y) * COS, (x + y) * SIN - z];
}

function toPoints(points: [number, number, number][]) {
	return points
		.map(([x, y, z]) => project(x, y, z))
		.map(([sx, sy]) => `${round(sx)},${round(sy)}`)
		.join(" ");
}

function round(n: number) {
	return Math.round(n * 100) / 100;
}

type TBoxProps = {
	x: number;
	y: number;
	z?: number;
	w: number; // extensão em x
	d: number; // extensão em y
	h: number; // altura (z)
	m: TIsoMaterial;
	stroke?: string;
};

export function Box({ x, y, z = 0, w, d, h, m, stroke }: TBoxProps) {
	const top: [number, number, number][] = [
		[x, y, z + h],
		[x + w, y, z + h],
		[x + w, y + d, z + h],
		[x, y + d, z + h],
	];
	const right: [number, number, number][] = [
		[x + w, y, z],
		[x + w, y + d, z],
		[x + w, y + d, z + h],
		[x + w, y, z + h],
	];
	const left: [number, number, number][] = [
		[x, y + d, z],
		[x + w, y + d, z],
		[x + w, y + d, z + h],
		[x, y + d, z + h],
	];
	const strokeProps = stroke ? { stroke, strokeWidth: 1, strokeLinejoin: "round" as const } : {};
	return (
		<g>
			<polygon points={toPoints(right)} fill={m.right} {...strokeProps} />
			<polygon points={toPoints(left)} fill={m.left} {...strokeProps} />
			<polygon points={toPoints(top)} fill={m.top} {...strokeProps} />
		</g>
	);
}

type TCylinderProps = {
	x: number;
	y: number;
	z?: number;
	r: number;
	h: number;
	m: TIsoMaterial;
};

// Cilindro de eixo vertical. Um círculo horizontal de raio r vira uma elipse alinhada aos eixos
// da tela com rx = √2·r·cos30 e ry = √2·r·sin30.
export function Cylinder({ x, y, z = 0, r, h, m }: TCylinderProps) {
	const rx = Math.SQRT2 * r * COS;
	const ry = Math.SQRT2 * r * SIN;
	const [cx, cyBottom] = project(x, y, z);
	const cyTop = cyBottom - h;
	const side = `M${round(cx - rx)},${round(cyTop)} L${round(cx - rx)},${round(cyBottom)} A${round(rx)},${round(ry)} 0 0 0 ${round(cx + rx)},${round(cyBottom)} L${round(cx + rx)},${round(cyTop)} Z`;
	// Metade direita do costado mais escura: o mesmo sombreamento das caixas.
	const sideRight = `M${round(cx)},${round(cyTop + ry)} L${round(cx)},${round(cyBottom + ry)} A${round(rx)},${round(ry)} 0 0 0 ${round(cx + rx)},${round(cyBottom)} L${round(cx + rx)},${round(cyTop)} A${round(rx)},${round(ry)} 0 0 1 ${round(cx)},${round(cyTop + ry)} Z`;
	return (
		<g>
			<path d={side} fill={m.left} />
			<path d={sideRight} fill={m.right} />
			<ellipse cx={round(cx)} cy={round(cyTop)} rx={round(rx)} ry={round(ry)} fill={m.top} />
		</g>
	);
}

export type TIsoPlane = "left" | "right" | "top";

// Matriz que leva um desenho 2D (u para a direita, v para baixo) para o plano escolhido.
//   left  → plano y = const, u ao longo de +x, v ao longo de -z
//   right → plano x = const, u ao longo de -y, v ao longo de -z
//   top   → plano z = const, u ao longo de +x, v ao longo de +y
function planeMatrix(plane: TIsoPlane, origin: [number, number, number]) {
	const [ox, oy] = project(...origin);
	if (plane === "left") return `matrix(${COS} ${SIN} 0 1 ${round(ox)} ${round(oy)})`;
	if (plane === "right") return `matrix(${COS} ${-SIN} 0 1 ${round(ox)} ${round(oy)})`;
	return `matrix(${COS} ${SIN} ${-COS} ${SIN} ${round(ox)} ${round(oy)})`;
}

type TPlaneProps = {
	plane: TIsoPlane;
	at: [number, number, number];
	children: ReactNode;
};

// Desenha SVG comum (rect, path, text) "colado" numa face. Use para janelas, letreiros, linhas
// de texto e qualquer detalhe que deve acompanhar a perspectiva sem virar geometria 3D.
export function Plane({ plane, at, children }: TPlaneProps) {
	return <g transform={planeMatrix(plane, at)}>{children}</g>;
}

type TExtrudeProps = {
	plane: Exclude<TIsoPlane, "top">;
	at: [number, number, number];
	depth: number;
	m: TIsoMaterial;
	// Recebe a cor de preenchimento e devolve a forma 2D (em coordenadas do plano).
	shape: (fill: string) => ReactNode;
};

// Extrusão de uma forma 2D: empilha cópias na cor da lateral, do fundo para a frente, e fecha
// com a face na cor do material. No plano left a frente usa o tom base e a lateral visível é a
// sombra; no plano right a frente é a sombra e a lateral visível é o tom base. Dá volume a glifos (coração, raio, %) sem modelar cada um.
export function Extrude({ plane, at, depth, m, shape }: TExtrudeProps) {
	const [x, y, z] = at;
	const layers: ReactNode[] = [];
	const steps = Math.max(2, Math.ceil(depth));
	for (let i = steps; i >= 1; i--) {
		const k = (depth * i) / steps;
		// A profundidade sempre se afasta do observador (−y no plano left, −x no plano right).
		const back: [number, number, number] = plane === "left" ? [x, y - k, z] : [x - k, y, z];
		layers.push(
			<Plane key={i} plane={plane} at={back}>
				{shape(plane === "left" ? m.right : m.left)}
			</Plane>,
		);
	}
	return (
		<g>
			{layers}
			<Plane plane={plane} at={at}>
				{shape(plane === "left" ? m.left : m.right)}
			</Plane>
		</g>
	);
}

type TShadowProps = {
	x: number;
	y: number;
	w: number;
	d: number;
	z?: number;
	color?: string;
};

// Sombra de contato: três losangos concêntricos translúcidos, levemente deslocados para longe da
// luz. Sem <filter>: ids de filtro colidem quando várias ilustrações dividem a página.
export function Shadow({ x, y, w, d, z = 0, color = "#1a3d7a" }: TShadowProps) {
	return (
		<g fill={color}>
			{[7, 4, 1].map((pad, i) => (
				<polygon
					key={pad}
					points={toPoints([
						[x - pad + 2, y - pad, z],
						[x + w + pad + 5, y - pad, z],
						[x + w + pad + 5, y + d + pad + 3, z],
						[x - pad + 2, y + d + pad + 3, z],
					])}
					opacity={[0.05, 0.06, 0.07][i]}
				/>
			))}
		</g>
	);
}

export { toPoints };
