import type { TVisualKitFormatEnum, TVisualKitOutputEnum } from "@/schemas/enums";
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
export const A4_PAGE = { largura: Math.round(210 * MM), altura: Math.round(297 * MM) };
export const mmToPx = (mm: number) => mm * MM;

export type TVisualKitFormatCategory = "PDV" | "ONLINE";

export type TVisualKitOutputOption = { id: TVisualKitOutputEnum; titulo: string; descricao: string };

export type TVisualKitFormatSpec = {
	id: TVisualKitFormatEnum;
	nome: string;
	descricao: string;
	icone: LucideIcon;
	categoria: TVisualKitFormatCategory;
	tamanho: string; // rótulo exibido ("10 × 4 cm")
	fatos: { rotulo: string; valor: string }[];
	saidas: TVisualKitOutputOption[]; // a primeira é o padrão
	usaChamada: boolean; // a peça imprime a chamada do kit
	// Itens por página (folhas e listas) ou nulo quando é um item por imagem.
	itensPorPagina: number | null;
	// Teto de itens da peça inteira (carrossel: 20 imagens no Instagram = capa + 18 + fechamento).
	maxItens: number | null;
	// Página em px CSS — folhas usam A4; digitais, o tamanho final em px.
	pagina: { largura: number; altura: number };
	// Miniatura proporcional usada nos cards de revisão [largura, altura, raio].
	miniatura: [number, number, string];
};

export const VISUAL_KIT_FORMATS: Record<TVisualKitFormatEnum, TVisualKitFormatSpec> = {
	ETIQUETA_GONDOLA: {
		id: "ETIQUETA_GONDOLA",
		nome: "Etiqueta de gôndola",
		descricao: "Preço, nome e código de barras para a prateleira.",
		icone: Tag,
		categoria: "PDV",
		tamanho: "10 × 4 cm",
		fatos: [
			{ rotulo: "Tamanho", valor: "10 × 4 cm" },
			{ rotulo: "Folha", valor: "A4 · 14 etiquetas por folha" },
			{ rotulo: "Saída", valor: "PDF para impressão" },
		],
		saidas: [
			{ id: "PDF", titulo: "PDF para impressão", descricao: "A4 · 14 etiquetas por folha · linhas de corte" },
			{ id: "PDF_ETIQUETADORA", titulo: "PDF para impressora de etiquetas", descricao: "Uma etiqueta por página · 10 × 4 cm" },
		],
		usaChamada: false,
		itensPorPagina: 14,
		maxItens: null,
		pagina: A4_PAGE,
		miniatura: [56, 22, "3px"],
	},
	ADESIVO_PRECO: {
		id: "ADESIVO_PRECO",
		nome: "Adesivo de preço",
		descricao: "Adesivo pequeno para colar direto na embalagem.",
		icone: Sticker,
		categoria: "PDV",
		tamanho: "38 × 21 mm",
		fatos: [
			{ rotulo: "Tamanho", valor: "38 × 21 mm" },
			{ rotulo: "Folha", valor: "A4 · 65 adesivos por folha" },
			{ rotulo: "Saída", valor: "PDF para impressão" },
		],
		saidas: [{ id: "PDF", titulo: "PDF para impressão", descricao: "A4 · 65 adesivos por folha · 38 × 21 mm" }],
		usaChamada: false,
		itensPorPagina: 65,
		maxItens: null,
		pagina: A4_PAGE,
		miniatura: [50, 28, "4px"],
	},
	WOBBLER: {
		id: "WOBBLER",
		nome: "Wobbler",
		descricao: "Disco com haste que se destaca da prateleira, para a oferta principal.",
		icone: CircleDot,
		categoria: "PDV",
		tamanho: "Ø 10 cm + haste de 4 cm",
		fatos: [
			{ rotulo: "Tamanho", valor: "Ø 10 cm + haste de 4 cm" },
			{ rotulo: "Folha", valor: "A4 · 4 por folha" },
			{ rotulo: "Saída", valor: "PDF com linhas de corte" },
		],
		saidas: [{ id: "PDF", titulo: "PDF para impressão", descricao: "A4 · 4 por folha · linhas de corte e dobra" }],
		usaChamada: false,
		itensPorPagina: 4,
		maxItens: null,
		pagina: A4_PAGE,
		miniatura: [44, 44, "9999px"],
	},
	ENCARTE: {
		id: "ENCARTE",
		nome: "Encarte",
		descricao: "Página A4 com até 9 ofertas, para imprimir ou mandar no WhatsApp.",
		icone: Newspaper,
		categoria: "PDV",
		tamanho: "A4 · 21 × 29,7 cm",
		fatos: [
			{ rotulo: "Tamanho", valor: "A4 · 21 × 29,7 cm" },
			{ rotulo: "Produtos", valor: "Até 9 por página" },
			{ rotulo: "Saída", valor: "PDF ou PNG" },
		],
		saidas: [
			{ id: "PDF", titulo: "PDF para impressão", descricao: "A4 · 300 dpi" },
			{ id: "PNG", titulo: "Imagem PNG", descricao: "Para enviar no WhatsApp" },
		],
		usaChamada: true,
		itensPorPagina: 9,
		maxItens: null,
		pagina: A4_PAGE,
		miniatura: [38, 54, "3px"],
	},
	SELO_PRODUTO: {
		id: "SELO_PRODUTO",
		nome: "Selo para foto do produto",
		descricao: "Preço e desconto aplicados sobre a foto de cada produto.",
		icone: Image,
		categoria: "ONLINE",
		tamanho: "1080 × 1080 px",
		fatos: [
			{ rotulo: "Tamanho", valor: "1080 × 1080 px" },
			{ rotulo: "Uso", valor: "Loja digital, marketplaces e iFood" },
			{ rotulo: "Saída", valor: "Uma imagem por produto" },
		],
		saidas: [
			{ id: "PNG", titulo: "PNG 1080 × 1080", descricao: "Um arquivo por produto, em .zip" },
			{ id: "JPG", titulo: "JPG 1080 × 1080", descricao: "Arquivos menores, aceitos por todos os marketplaces" },
		],
		usaChamada: false,
		itensPorPagina: null,
		maxItens: null,
		pagina: { largura: 1080, altura: 1080 },
		miniatura: [46, 46, "4px"],
	},
	POST_FEED: {
		id: "POST_FEED",
		nome: "Post para feed",
		descricao: "Post quadrado com foto, nome e preço do produto.",
		icone: Square,
		categoria: "ONLINE",
		tamanho: "1080 × 1080 px",
		fatos: [
			{ rotulo: "Tamanho", valor: "1080 × 1080 px" },
			{ rotulo: "Uso", valor: "Instagram e Facebook" },
			{ rotulo: "Saída", valor: "Uma imagem por produto" },
		],
		saidas: [
			{ id: "PNG", titulo: "PNG 1080 × 1080", descricao: "Um arquivo por produto, em .zip" },
			{ id: "JPG", titulo: "JPG 1080 × 1080", descricao: "Arquivos menores" },
		],
		usaChamada: true,
		itensPorPagina: null,
		maxItens: null,
		pagina: { largura: 1080, altura: 1080 },
		miniatura: [46, 46, "4px"],
	},
	STORY: {
		id: "STORY",
		nome: "Story",
		descricao: "Formato vertical para stories e status do WhatsApp.",
		icone: Smartphone,
		categoria: "ONLINE",
		tamanho: "1080 × 1920 px",
		fatos: [
			{ rotulo: "Tamanho", valor: "1080 × 1920 px" },
			{ rotulo: "Uso", valor: "Stories e status do WhatsApp" },
			{ rotulo: "Saída", valor: "Uma imagem por produto" },
		],
		saidas: [
			{ id: "PNG", titulo: "PNG 1080 × 1920", descricao: "Um arquivo por produto, em .zip" },
			{ id: "JPG", titulo: "JPG 1080 × 1920", descricao: "Arquivos menores" },
		],
		usaChamada: true,
		itensPorPagina: null,
		maxItens: null,
		pagina: { largura: 1080, altura: 1920 },
		miniatura: [30, 54, "5px"],
	},
	CARROSSEL: {
		id: "CARROSSEL",
		nome: "Carrossel",
		descricao: "Capa, um produto por página e fechamento, para arrastar no feed.",
		icone: GalleryHorizontal,
		categoria: "ONLINE",
		tamanho: "1080 × 1350 px (4:5)",
		fatos: [
			{ rotulo: "Tamanho", valor: "1080 × 1350 px (4:5)" },
			{ rotulo: "Páginas", valor: "Capa + produtos + fechamento · até 20" },
			{ rotulo: "Saída", valor: "Imagens numeradas em .zip" },
		],
		saidas: [
			{ id: "PNG", titulo: "PNG 1080 × 1350", descricao: "Páginas numeradas, em .zip" },
			{ id: "JPG", titulo: "JPG 1080 × 1350", descricao: "Arquivos menores" },
		],
		usaChamada: true,
		itensPorPagina: null,
		maxItens: 18,
		pagina: { largura: 1080, altura: 1350 },
		miniatura: [40, 50, "4px"],
	},
	LISTA_WHATSAPP: {
		id: "LISTA_WHATSAPP",
		nome: "Lista para WhatsApp",
		descricao: "Todas as ofertas numa imagem só, para mandar em conversas e grupos.",
		icone: MessageCircle,
		categoria: "ONLINE",
		tamanho: "1080 px de largura",
		fatos: [
			{ rotulo: "Tamanho", valor: "1080 px de largura" },
			{ rotulo: "Produtos", valor: "Até 12 por imagem" },
			{ rotulo: "Saída", valor: "PNG ou PDF" },
		],
		saidas: [
			{ id: "PNG", titulo: "Imagem PNG", descricao: "1080 px de largura · para conversas e grupos" },
			{ id: "PDF", titulo: "PDF", descricao: "Uma página, para imprimir ou anexar" },
		],
		usaChamada: true,
		itensPorPagina: 12,
		maxItens: 12,
		// Altura cresce com a quantidade de itens: 480 de cabeçalho/rodapé + 150 por item.
		pagina: { largura: 1080, altura: 480 + 12 * 150 },
		miniatura: [26, 56, "4px"],
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
	nome: string;
	chamada: string;
	descricao: string;
	icone: LucideIcon;
}[] = [
	{
		id: "PDV",
		nome: "Ponto de venda",
		chamada: "Para imprimir e usar na loja",
		descricao: "Etiquetas, adesivos, wobblers e encartes impressos, com preço, código de barras e validade.",
		icone: Store,
	},
	{
		id: "ONLINE",
		nome: "Online",
		chamada: "Para loja digital, marketplaces e redes",
		descricao: "Selos sobre a foto do produto, posts, stories, carrosséis e listas para WhatsApp.",
		icone: Globe,
	},
];

export const VISUAL_KIT_PRESETS: { id: string; nome: string; descricao: string; formatos: TVisualKitFormatEnum[] }[] = [
	{
		id: "semana",
		nome: "Oferta da semana",
		descricao: "Encarte, redes e WhatsApp com as mesmas ofertas.",
		formatos: ["ENCARTE", "POST_FEED", "STORY", "LISTA_WHATSAPP"],
	},
	{
		id: "etiquetagem",
		nome: "Etiquetagem da loja",
		descricao: "Preço na prateleira, na embalagem e um destaque.",
		formatos: ["ETIQUETA_GONDOLA", "ADESIVO_PRECO", "WOBBLER"],
	},
	{ id: "digital", nome: "Vitrine digital", descricao: "Loja digital, marketplaces e redes.", formatos: ["SELO_PRODUTO", "STORY", "CARROSSEL"] },
];

export function sortVisualKitFormats<T extends { formato: TVisualKitFormatEnum }>(pieces: T[]): T[] {
	return [...pieces].sort((a, b) => VISUAL_KIT_FORMAT_ORDER.indexOf(a.formato) - VISUAL_KIT_FORMAT_ORDER.indexOf(b.formato));
}

/** Quantos itens a peça usa de fato (respeita o teto do formato). */
export function visualKitPieceItemCount(formato: TVisualKitFormatEnum, total: number) {
	const max = VISUAL_KIT_FORMATS[formato].maxItens;
	return max == null ? total : Math.min(total, max);
}

/**
 * Resumo da peça para cards e revisão ("14 etiquetas · 1 folha A4"). Adesivos repetem os produtos
 * até completar a folha de 65.
 */
export function describeVisualKitPiece(formato: TVisualKitFormatEnum, total: number) {
	const n = Math.max(0, total);
	const plural = (count: number, singular: string, pluralWord: string) => `${count} ${count === 1 ? singular : pluralWord}`;
	const sheets = (perSheet: number) => Math.max(1, Math.ceil(n / perSheet));
	switch (formato) {
		case "ETIQUETA_GONDOLA":
			return `${plural(n, "etiqueta", "etiquetas")} · ${plural(sheets(14), "folha A4", "folhas A4")}`;
		case "ADESIVO_PRECO": {
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
