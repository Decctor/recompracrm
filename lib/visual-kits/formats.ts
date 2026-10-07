import type { TVisualKitFormatEnum, TVisualKitOutputEnum } from "@/schemas/enums";
import type { TVisualKitConfig } from "@/schemas/visual-kits";
import {
	CircleDot,
	GalleryHorizontal,
	Globe,
	Image,
	type LucideIcon,
	MessageCircle,
	Newspaper,
	Smartphone,
	Square,
	Sticker,
	Store,
	Tag,
} from "lucide-react";

// Registro dos formatos de peça. Formatos não são entidade no banco: a tabela de peças guarda só a
// chave, e tudo que descreve o formato (tamanho, folha, saídas, limites) mora aqui.

// Página em px CSS (96 dpi). A4 = 210 × 297 mm.
const MM = 96 / 25.4;
export const A4_PAGE = { width: Math.round(210 * MM), height: Math.round(297 * MM) };
export const mmToPx = (mm: number) => mm * MM;

export type TVisualKitFormatCategory = "POINT_OF_SALE" | "ONLINE";

export type TVisualKitOutputOption = { id: TVisualKitOutputEnum; title: string; description: string };

export type TVisualKitFormatSpec = {
	id: TVisualKitFormatEnum;
	name: string;
	description: string;
	icon: LucideIcon;
	category: TVisualKitFormatCategory;
	sizeLabel: string; // rótulo exibido ("10 × 4 cm")
	facts: { label: string; value: string }[];
	outputs: TVisualKitOutputOption[]; // a primeira é o padrão
	printsHeadline: boolean; // a peça imprime a chamada do kit
	// Itens por página (folhas e listas) ou nulo quando é um item por imagem.
	itemsPerPage: number | null;
	// Teto de itens da peça inteira (carrossel: 20 imagens no Instagram = capa + 18 + fechamento).
	maxItems: number | null;
	// Página em px CSS — folhas usam A4; digitais, o tamanho final em px.
	page: { width: number; height: number };
	// Miniatura proporcional usada nos cards de revisão [largura, altura, raio].
	thumbnail: [number, number, string];
};

export const VISUAL_KIT_FORMATS: Record<TVisualKitFormatEnum, TVisualKitFormatSpec> = {
	ETIQUETA_GONDOLA: {
		id: "ETIQUETA_GONDOLA",
		name: "Etiqueta de gôndola",
		description: "Preço, nome e código de barras para a prateleira.",
		icon: Tag,
		category: "POINT_OF_SALE",
		sizeLabel: "10 × 4 cm",
		facts: [
			{ label: "Tamanho", value: "10 × 4 cm" },
			{ label: "Folha", value: "A4 · 14 etiquetas por folha" },
			{ label: "Saída", value: "PDF para impressão" },
		],
		outputs: [
			{ id: "PDF", title: "PDF para impressão", description: "A4 · 14 etiquetas por folha · linhas de corte" },
			{ id: "PDF_ETIQUETADORA", title: "PDF para impressora de etiquetas", description: "Uma etiqueta por página · 10 × 4 cm" },
		],
		printsHeadline: false,
		itemsPerPage: 14,
		maxItems: null,
		page: A4_PAGE,
		thumbnail: [56, 22, "3px"],
	},
	ADESIVO_PRECO: {
		id: "ADESIVO_PRECO",
		name: "Adesivo de preço",
		description: "Adesivo pequeno para colar direto na embalagem.",
		icon: Sticker,
		category: "POINT_OF_SALE",
		sizeLabel: "38 × 21 mm",
		facts: [
			{ label: "Tamanho", value: "38 × 21 mm" },
			{ label: "Folha", value: "A4 · 65 adesivos por folha" },
			{ label: "Saída", value: "PDF para impressão" },
		],
		outputs: [{ id: "PDF", title: "PDF para impressão", description: "A4 · 65 adesivos por folha · 38 × 21 mm" }],
		printsHeadline: false,
		itemsPerPage: 65,
		maxItems: null,
		page: A4_PAGE,
		thumbnail: [50, 28, "4px"],
	},
	WOBBLER: {
		id: "WOBBLER",
		name: "Wobbler",
		description: "Disco com haste que se destaca da prateleira, para a oferta principal.",
		icon: CircleDot,
		category: "POINT_OF_SALE",
		sizeLabel: "Ø 10 cm + haste de 4 cm",
		facts: [
			{ label: "Tamanho", value: "Ø 10 cm + haste de 4 cm" },
			{ label: "Folha", value: "A4 · 4 por folha" },
			{ label: "Saída", value: "PDF com linhas de corte" },
		],
		outputs: [{ id: "PDF", title: "PDF para impressão", description: "A4 · 4 por folha · linhas de corte e dobra" }],
		printsHeadline: false,
		itemsPerPage: 4,
		maxItems: null,
		page: A4_PAGE,
		thumbnail: [44, 44, "9999px"],
	},
	ENCARTE: {
		id: "ENCARTE",
		name: "Encarte",
		description: "Página A4 com até 9 ofertas, para imprimir ou mandar no WhatsApp.",
		icon: Newspaper,
		category: "POINT_OF_SALE",
		sizeLabel: "A4 · 21 × 29,7 cm",
		facts: [
			{ label: "Tamanho", value: "A4 · 21 × 29,7 cm" },
			{ label: "Produtos", value: "Até 9 por página" },
			{ label: "Saída", value: "PDF ou PNG" },
		],
		outputs: [
			{ id: "PDF", title: "PDF para impressão", description: "A4 · 300 dpi" },
			{ id: "PNG", title: "Imagem PNG", description: "Para enviar no WhatsApp" },
		],
		printsHeadline: true,
		itemsPerPage: 9,
		maxItems: null,
		page: A4_PAGE,
		thumbnail: [38, 54, "3px"],
	},
	SELO_PRODUTO: {
		id: "SELO_PRODUTO",
		name: "Selo para foto do produto",
		description: "Preço e desconto aplicados sobre a foto de cada produto.",
		icon: Image,
		category: "ONLINE",
		sizeLabel: "1080 × 1080 px",
		facts: [
			{ label: "Tamanho", value: "1080 × 1080 px" },
			{ label: "Uso", value: "Loja digital, marketplaces e iFood" },
			{ label: "Saída", value: "Uma imagem por produto" },
		],
		outputs: [
			{ id: "PNG", title: "PNG 1080 × 1080", description: "Um arquivo por produto, em .zip" },
			{ id: "JPG", title: "JPG 1080 × 1080", description: "Arquivos menores, aceitos por todos os marketplaces" },
		],
		printsHeadline: false,
		itemsPerPage: null,
		maxItems: null,
		page: { width: 1080, height: 1080 },
		thumbnail: [46, 46, "4px"],
	},
	POST_FEED: {
		id: "POST_FEED",
		name: "Post para feed",
		description: "Post quadrado com foto, nome e preço do produto.",
		icon: Square,
		category: "ONLINE",
		sizeLabel: "1080 × 1080 px",
		facts: [
			{ label: "Tamanho", value: "1080 × 1080 px" },
			{ label: "Uso", value: "Instagram e Facebook" },
			{ label: "Saída", value: "Uma imagem por produto" },
		],
		outputs: [
			{ id: "PNG", title: "PNG 1080 × 1080", description: "Um arquivo por produto, em .zip" },
			{ id: "JPG", title: "JPG 1080 × 1080", description: "Arquivos menores" },
		],
		printsHeadline: true,
		itemsPerPage: null,
		maxItems: null,
		page: { width: 1080, height: 1080 },
		thumbnail: [46, 46, "4px"],
	},
	STORY: {
		id: "STORY",
		name: "Story",
		description: "Formato vertical para stories e status do WhatsApp.",
		icon: Smartphone,
		category: "ONLINE",
		sizeLabel: "1080 × 1920 px",
		facts: [
			{ label: "Tamanho", value: "1080 × 1920 px" },
			{ label: "Uso", value: "Stories e status do WhatsApp" },
			{ label: "Saída", value: "Uma imagem por produto" },
		],
		outputs: [
			{ id: "PNG", title: "PNG 1080 × 1920", description: "Um arquivo por produto, em .zip" },
			{ id: "JPG", title: "JPG 1080 × 1920", description: "Arquivos menores" },
		],
		printsHeadline: true,
		itemsPerPage: null,
		maxItems: null,
		page: { width: 1080, height: 1920 },
		thumbnail: [30, 54, "5px"],
	},
	CARROSSEL: {
		id: "CARROSSEL",
		name: "Carrossel",
		description: "Capa, um produto por página e fechamento, para arrastar no feed.",
		icon: GalleryHorizontal,
		category: "ONLINE",
		sizeLabel: "1080 × 1350 px (4:5)",
		facts: [
			{ label: "Tamanho", value: "1080 × 1350 px (4:5)" },
			{ label: "Páginas", value: "Capa + produtos + fechamento · até 20" },
			{ label: "Saída", value: "Imagens numeradas em .zip" },
		],
		outputs: [
			{ id: "PNG", title: "PNG 1080 × 1350", description: "Páginas numeradas, em .zip" },
			{ id: "JPG", title: "JPG 1080 × 1350", description: "Arquivos menores" },
		],
		printsHeadline: true,
		itemsPerPage: null,
		maxItems: 18,
		page: { width: 1080, height: 1350 },
		thumbnail: [40, 50, "4px"],
	},
	LISTA_WHATSAPP: {
		id: "LISTA_WHATSAPP",
		name: "Lista para WhatsApp",
		description: "Todas as ofertas numa imagem só, para mandar em conversas e grupos.",
		icon: MessageCircle,
		category: "ONLINE",
		sizeLabel: "1080 px de largura",
		facts: [
			{ label: "Tamanho", value: "1080 px de largura" },
			{ label: "Produtos", value: "Até 12 por imagem" },
			{ label: "Saída", value: "PNG ou PDF" },
		],
		outputs: [
			{ id: "PNG", title: "Imagem PNG", description: "1080 px de largura · para conversas e grupos" },
			{ id: "PDF", title: "PDF", description: "Uma página, para imprimir ou anexar" },
		],
		printsHeadline: true,
		itemsPerPage: 12,
		maxItems: 12,
		// Altura cresce com a quantidade de itens: 480 de cabeçalho/rodapé + 150 por item.
		page: { width: 1080, height: 480 + 12 * 150 },
		thumbnail: [26, 56, "4px"],
	},
};

// Ordem canônica (ponto de venda primeiro, depois online) usada em toda listagem de peças.
export const VISUAL_KIT_FORMAT_ORDER: TVisualKitFormatEnum[] = [
	"ETIQUETA_GONDOLA",
	"ADESIVO_PRECO",
	"WOBBLER",
	"ENCARTE",
	"SELO_PRODUTO",
	"POST_FEED",
	"STORY",
	"CARROSSEL",
	"LISTA_WHATSAPP",
];

export const VISUAL_KIT_CATEGORIES: {
	id: TVisualKitFormatCategory;
	name: string;
	tagline: string;
	description: string;
	icon: LucideIcon;
}[] = [
	{
		id: "POINT_OF_SALE",
		name: "Ponto de venda",
		tagline: "Para imprimir e usar na loja",
		description: "Etiquetas, adesivos, wobblers e encartes impressos, com preço, código de barras e validade.",
		icon: Store,
	},
	{
		id: "ONLINE",
		name: "Online",
		tagline: "Para loja digital, marketplaces e redes",
		description: "Selos sobre a foto do produto, posts, stories, carrosséis e listas para WhatsApp.",
		icon: Globe,
	},
];

export const VISUAL_KIT_PRESETS: { id: string; name: string; description: string; formats: TVisualKitFormatEnum[] }[] = [
	{
		id: "semana",
		name: "Oferta da semana",
		description: "Encarte, redes e WhatsApp com as mesmas ofertas.",
		formats: ["ENCARTE", "POST_FEED", "STORY", "LISTA_WHATSAPP"],
	},
	{
		id: "etiquetagem",
		name: "Etiquetagem da loja",
		description: "Preço na prateleira, na embalagem e um destaque.",
		formats: ["ETIQUETA_GONDOLA", "ADESIVO_PRECO", "WOBBLER"],
	},
	{ id: "digital", name: "Vitrine digital", description: "Loja digital, marketplaces e redes.", formats: ["SELO_PRODUTO", "STORY", "CARROSSEL"] },
];

export function sortVisualKitFormats<T extends { formato: TVisualKitFormatEnum }>(pieces: T[]): T[] {
	return [...pieces].sort((a, b) => VISUAL_KIT_FORMAT_ORDER.indexOf(a.formato) - VISUAL_KIT_FORMAT_ORDER.indexOf(b.formato));
}

/** Quantos itens a peça usa de fato (respeita o teto do formato). */
export function visualKitPieceItemCount(formato: TVisualKitFormatEnum, total: number) {
	const max = VISUAL_KIT_FORMATS[formato].maxItems;
	return max == null ? total : Math.min(total, max);
}

/**
 * Resumo da peça para cards e revisão ("14 etiquetas · 1 folha A4"). Com `completarFolhaAdesivos`,
 * adesivos repetem os produtos até completar a folha de 65.
 */
export function describeVisualKitPiece(formato: TVisualKitFormatEnum, total: number, configuracao?: TVisualKitConfig) {
	const n = Math.max(0, total);
	const plural = (count: number, singular: string, pluralWord: string) => `${count} ${count === 1 ? singular : pluralWord}`;
	const sheets = (perSheet: number) => Math.max(1, Math.ceil(n / perSheet));
	switch (formato) {
		case "ETIQUETA_GONDOLA":
			return `${plural(n, "etiqueta", "etiquetas")} · ${plural(sheets(14), "folha A4", "folhas A4")}`;
		case "ADESIVO_PRECO": {
			if (!configuracao?.completarFolhaAdesivos) return `${plural(n, "adesivo", "adesivos")} · ${plural(sheets(65), "folha A4", "folhas A4")}`;
			const copies = Math.max(1, Math.floor(65 / Math.max(1, n)));
			return `${plural(copies * n, "adesivo", "adesivos")} · ${copies} por produto`;
		}
		case "WOBBLER":
			return `${plural(n, "wobbler", "wobblers")} · ${plural(sheets(4), "folha A4", "folhas A4")}`;
		case "ENCARTE":
			return `${plural(n, "produto", "produtos")} · ${plural(sheets(9), "página A4", "páginas A4")}`;
		case "SELO_PRODUTO":
			return plural(n, "imagem", "imagens");
		case "POST_FEED":
			return plural(n, "post", "posts");
		case "STORY":
			return plural(n, "story", "stories");
		case "CARROSSEL":
			return `${visualKitPieceItemCount(formato, n) + 2} páginas`;
		case "LISTA_WHATSAPP":
			return `1 imagem · ${plural(visualKitPieceItemCount(formato, n), "produto", "produtos")}`;
	}
}
