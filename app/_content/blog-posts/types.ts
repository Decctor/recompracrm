import type { TIsoCoverKey } from "@/components/Illustrations/Isometric/IsoCover";
import type { TIsoIconKey } from "@/components/Illustrations/Isometric/IsoIcon";

// Corpo dos artigos. Texto aceita **negrito**, [link](url), parágrafos separados por \n\n e
// listas com linhas iniciadas por •.
export type ContentSection =
	| { type: "text"; heading?: string; body: string }
	| { type: "feature-highlight"; icon: TIsoIconKey; title: string; body: string }
	// `source` é obrigatório na prática: número sem fonte não entra no blog.
	| { type: "stats"; items: { value: string; label: string; source?: string }[] }
	| { type: "quote"; text: string; author?: string }
	| { type: "image"; src: string; alt: string; caption?: string }
	| { type: "callout"; tone: "dica" | "atencao" | "dado"; title: string; body: string }
	| { type: "table"; heading?: string; columns: string[]; rows: string[][]; note?: string }
	| { type: "timeline"; heading?: string; items: { date: string; title: string; body: string }[] }
	| { type: "cashback-calculator"; heading?: string };

// Pergunta/resposta usada para renderizar a seção de FAQ e o schema FAQPage (JSON-LD).
export type FAQItem = { question: string; answer: string };

export type BlogCategory = "guias" | "dicas" | "dados";

export const BLOG_CATEGORIES: { value: BlogCategory; label: string }[] = [
	{ value: "guias", label: "Guias práticos" },
	{ value: "dados", label: "Dados do varejo" },
	{ value: "dicas", label: "Dicas de gestão" },
];

// Número da capa. `source` vazio = dado do próprio artigo (uma contagem, um prazo), não uma estatística
// externa — nesse caso a capa diz "Dado do próprio artigo" em vez de inventar uma fonte.
export type BlogCover = {
	stat: string;
	label: string;
	source?: string;
};

export type BlogPost = {
	slug: string;
	title: string;
	headline: string; // short subtitle shown on cards
	description: string; // meta description
	category: BlogCategory;
	categoryLabel: string;
	// Capa de dados: o número-chave do artigo em destaque, com rótulo e fonte. A cor vem da categoria.
	// Sem ela, a capa cai no tempo de leitura (ver `components/Content/DataCover.tsx`).
	cover?: BlogCover;
	illustration: TIsoCoverKey; // ilustração isométrica usada na imagem de compartilhamento (Open Graph)
	author?: string; // autor exibido e usado no JSON-LD (default: "Equipe RecompraCRM")
	publishedAt: string; // ISO date
	updatedAt?: string; // ISO date — usado em dateModified do JSON-LD
	readingTime: string;
	sections: ContentSection[];
	faqs?: FAQItem[];
	// Fontes citadas no texto, listadas no fim do artigo.
	sources?: { label: string; url: string }[];
	cta: {
		headline: string;
		sub: string;
		buttonText: string;
		whatsappMessage: string;
	};
	seo: {
		keywords: string[];
	};
	relatedSlugs: string[];
};
