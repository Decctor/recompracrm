// Conteúdo dos cases de clientes: a seção "Resultado" da landing e as páginas /cases e
// /cases/[id]. Conteúdo de marketing vive em código (como app/_content/integration-pages):
// poucos clientes, curadoria manual — sem necessidade de banco/admin por ora.
//
// Para adicionar um case:
// 1. Suba a logo do cliente em /public/landing/cases/{slug}.png (fundo transparente).
// 2. Faça upload do vídeo no Mux com playback policy PUBLIC e copie o playback ID
//    (scripts/upload-mux-video.ts).
// 3. Adicione uma entrada em LANDING_CASES abaixo. O `id` vira o slug de /cases/{id}.

export type TCaseMetric = {
	label: string;
	value: number;
	/** Renderizado menor, antes do número (ex: "+R$") */
	prefix?: string;
	/** Renderizado colado ao número (ex: "%") */
	suffix?: string;
	/** Renderizado menor, depois do número (ex: "dias") */
	unit?: string;
	decimals?: number;
	description: string;
};

export type TCaseVideo = {
	/** Playback ID de um asset Mux com playback policy PUBLIC */
	muxPlaybackId: string;
	/** "resultado" = cliente fala do resultado deste case; "depoimento" = cliente fala sobre o produto em geral */
	kind: "resultado" | "depoimento";
	title: string;
	/** Segundo do vídeo usado como capa (default: 0) */
	thumbnailTime?: number;
	/** default: "landscape" (16:9). "portrait" para vídeos gravados no celular (9:16) */
	orientation?: "landscape" | "portrait";
};

export type TLandingCase = {
	id: string;
	client: {
		name: string;
		segment: string;
		city: string;
		state: string;
		/** Caminho em /public (ex: "/landing/cases/ampere-mais.png"). Sem logo, renderiza monograma com as iniciais. */
		logoSrc?: string;
	};
	/** Período do demonstrativo (ex: "30 dias · Abril 2026") */
	period?: string;
	/** Pode ficar vazio para cases só de depoimento (sem demonstrativo de resultado) */
	metrics: TCaseMetric[];
	quote?: { text: string; author?: string; role?: string };
	video?: TCaseVideo;
	/** Slugs de /features/{slug} usados no case, na ordem em que aparecem em "Com o que foi feito". */
	features?: string[];
};

export const LANDING_CASES: TLandingCase[] = [
	{
		id: "ampere-mais",
		client: {
			name: "Ampère Mais",
			segment: "Materiais elétricos",
			city: "Ituiutaba",
			state: "MG",
			logoSrc:
				"https://wawrqfehfafrrnfsycgs.supabase.co/storage/v1/object/public/files/public/organizations/ampere_mais-logo%20-%202026-04-21T11:16:11.803Z",
			// TODO: subir logo em /public/landing/cases/ampere-mais.png e apontar aqui
		},
		period: "30 dias · Abril 2026",
		metrics: [
			{
				label: "Receita extra",
				value: 17482,
				prefix: "+R$",
				description: "gerada por campanhas automatizadas no WhatsApp",
			},
			{
				label: "Ticket médio",
				value: 46,
				prefix: "+",
				suffix: "%",
				description: "de aumento médio nos clientes que voltaram pela campanha",
			},
			{
				label: "Ciclo de recompra",
				value: 17,
				prefix: "−",
				unit: "dias",
				description: "de antecipação no retorno ao balcão vs. comportamento orgânico",
			},
		],
		quote: {
			text: "Nenhum anúncio novo. Nenhum desconto agressivo. Só a mensagem certa, para quem já conhecia a loja, no momento certo.",
		},
		video: {
			muxPlaybackId: "4taz2R5ysEqdh5V028dKVcRiv4Ezrv7GiC5pEsiTGpu4",
			kind: "resultado",
			title: "Como a Ampère Mais gerou R$17 mil extras em 30 dias",
			orientation: "landscape",
		},
		features: ["campanhas-whatsapp", "business-intelligence"],
	},
	{
		id: "congelatte",
		client: {
			name: "Congelatte Gelateria",
			segment: "Gelateria",
			city: "Ituiutaba",
			state: "MG",
			logoSrc: "https://storage.googleapis.com/prod-cardapio-web/uploads/company/logo/11697/dabeb30aTCHOW__3_.png",
			// TODO: subir logo em /public/landing/cases/congelatte.png e apontar aqui o logoSrc
		},
		period: "Últimos 4 meses", // Baseado na fala do Pedro sobre o uso mais intenso recente
		metrics: [
			{
				label: "Aumento nas vendas",
				value: 30,
				prefix: "+",
				suffix: "%",
				description: "através do engajamento e campanhas de recompra com clientes",
			},
			{
				label: "Adesão ao programa",
				value: 50,
				prefix: ">",
				suffix: "%",
				description: "da base total de clientes ativamente cadastrada no sistema",
			},
		],
		quote: {
			text:
				"Para quem não tem ainda um sistema de recompra, está perdendo dinheiro, perdendo tempo e deixando também que o seu produto não chegue nas pessoas.",
			author: "Pedro Sacramento",
			role: "Sócio e Fundador",
		},
		video: {
			muxPlaybackId: "I2U2Z8aagOpyVoOxcm6006D7YKk6WyjSk5nuDAA9Ylkk",
			kind: "depoimento",
			title: "Como a Congelatte aumentou em 30% suas vendas com a RecompraCRM",
			orientation: "landscape",
		},
		features: ["programa-de-cashback", "campanhas-whatsapp"],
	},
];

export function getCase(id: string): TLandingCase | undefined {
	return LANDING_CASES.find((item) => item.id === id);
}
