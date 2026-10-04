import { blackFridayNatal2026Post } from "./posts/black-friday-natal-2026";
import { cashbackMargemPost } from "./posts/cashback-margem";
import { fechamentoSemanalPost } from "./posts/fechamento-semanal";
import { festaJuninaPost } from "./posts/festa-junina";
import { segmentacaoRfmPost } from "./posts/segmentacao-rfm";
import { valorDoClientePost } from "./posts/valor-do-cliente";
import { whatsappPrecos2026Post } from "./posts/whatsapp-precos-2026";
import type { BlogPost } from "./types";

export * from "./types";

// Um arquivo por artigo em ./posts. A ordem aqui é a de desempate quando duas datas coincidem.
export const BLOG_POSTS: BlogPost[] = [
	blackFridayNatal2026Post,
	whatsappPrecos2026Post,
	cashbackMargemPost,
	valorDoClientePost,
	segmentacaoRfmPost,
	festaJuninaPost,
	fechamentoSemanalPost,
];

export function getBlogPost(slug: string): BlogPost | undefined {
	return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getBlogPostsByCategory(category: BlogPost["category"]): BlogPost[] {
	return BLOG_POSTS.filter((p) => p.category === category);
}
