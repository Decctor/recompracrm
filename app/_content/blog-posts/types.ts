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

export type BlogPost = {
	slug: string;
	title: string;
	headline: string; // short subtitle shown on cards
	description: string; // meta description
	category: BlogCategory;
	categoryLabel: string;
	cover: TIsoCoverKey; // ilustração isométrica da capa (também usada na imagem de compartilhamento)
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
