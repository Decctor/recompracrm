// Materiais das ilustrações isométricas. Cada material é um tom em três faces (topo iluminado,
// face esquerda no tom base, face direita na sombra). Tudo deriva das duas cores da marca —
// Azul Primário (#24549c) e Ouro Comercial (#ffb900) — e da rampa chart-gold do DESIGN.md.
// Não abra matiz nova aqui sem registrar em DESIGN.md (seção "Ilustrações").
export type TIsoMaterial = { top: string; left: string; right: string };

export const ISO = {
	blue: { top: "#3b6db8", left: "#24549c", right: "#1a3d7a" },
	navy: { top: "#24549c", left: "#1a3d7a", right: "#132e5c" },
	sky: { top: "#e4edf9", left: "#c6d7ef", right: "#a6bfe3" },
	amber: { top: "#ffd45e", left: "#ffb900", right: "#e6a700" },
	bronze: { top: "#e3b042", left: "#c98a2c", right: "#9a691e" },
	paper: { top: "#ffffff", left: "#f0f4fa", right: "#d9e3f1" },
	floor: { top: "#f5f8fd", left: "#e3ebf7", right: "#cfdcef" },
} satisfies Record<string, TIsoMaterial>;

// Tintas planas para detalhes desenhados nas faces (linhas de texto, janelas, contornos).
export const INK = {
	navy: "#1a3d7a",
	blue: "#24549c",
	line: "#c6d7ef",
	lineSoft: "#e4edf9",
	amber: "#ffb900",
	white: "#ffffff",
	glass: "#9fc0ea",
	glassLight: "#d4e4f7",
};
