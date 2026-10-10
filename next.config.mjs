/** @type {import('next').NextConfig} */
const nextConfig = {
	reactCompiler: true,
	reactStrictMode: true,
	async redirects() {
		// Os posts de caso de uso do blog foram convertidos em landings de conversão
		// por segmento (/segmentos/[slug]) — o conteúdo vive em app/_content/segment-pages.ts.
		const blogCasePostToSegment = {
			"sua-sorveteria": "sorveteria",
			"seu-petshop": "pet-shop",
			"sua-loja-de-roupas": "loja-de-roupas",
			"sua-loja-de-alimentacao": "restaurantes",
			"seu-supermercado-ou-mercearia": "supermercado-e-mercearia",
			"sua-loja-de-calcados": "loja-de-calcados",
			"sua-perfumaria-ou-loja-de-cosmeticos": "perfumaria-e-cosmeticos",
			"sua-farmacia": "farmacia-e-drogaria",
			"sua-loja-de-construcao": "materiais-de-construcao",
			"sua-loja-de-autopecas": "autopecas",
			"sua-loja-de-eletronicos-e-eletrodomesticos": "eletronicos-e-eletrodomesticos",
			"sua-otica": "otica",
			"sua-joalheria-ou-loja-de-acessorios": "joalheria-e-acessorios",
			"sua-papelaria-ou-loja-de-presentes": "papelaria-e-presentes",
			"sua-loja-de-casa-e-decoracao": "casa-e-decoracao",
			"sua-loja-de-esportes-e-lazer": "esportes-e-lazer",
			"sua-loja-de-brinquedos-e-infantil": "brinquedos-e-infantil",
			"sua-padaria-ou-confeitaria": "padaria-e-confeitaria",
			"seu-acougue-ou-peixaria": "acougue-e-peixaria",
			"sua-loja-de-materiais-eletricos-e-hidraulicos": "materiais-eletricos-e-hidraulicos",
			"seu-varejo": "varejo",
			"seu-delivery": "delivery",
			"sua-rede-de-lojas": "rede-de-lojas",
		};

		const legacyFeatureSlugs = ["programa-de-cashback", "campanhas-whatsapp", "ponto-de-interacao", "business-intelligence"];

		return [
			// O hub de WhatsApp virou o módulo "Conversas" (canal-agnóstico). As duas rotas antigas do hub
			// (`/dashboard/chats` e `/dashboard/channels/whatsapp`) seguem valendo para favoritos e links
			// antigos; a query string (filtros da inbox) segue junto no redirect.
			{ source: "/dashboard/chats", destination: "/dashboard/conversations", permanent: false },
			{ source: "/dashboard/channels/whatsapp", destination: "/dashboard/conversations", permanent: false },
			// Consolidate every route on the canonical www host.
			{
				source: "/:path*",
				has: [{ type: "host", value: "recompracrm.com.br" }],
				destination: "https://www.recompracrm.com.br/:path*",
				permanent: true,
			},
			// A página de lotes foi movida para dentro do módulo de Estoque.
			{
				source: "/casos-de-uso",
				destination: "/segmentos",
				permanent: true,
			},
			...legacyFeatureSlugs.map((slug) => ({
				source: `/funcionalidades/${slug}`,
				destination: `/features/${slug}`,
				permanent: true,
			})),
			...Object.entries(blogCasePostToSegment).map(([blogSuffix, segmentSlug]) => ({
				source: `/blog/como-recompracrm-pode-ajudar-${blogSuffix}`,
				destination: `/segmentos/${segmentSlug}`,
				permanent: true,
			})),
		];
	},
	serverExternalPackages: ["@resvg/resvg-js"],
	typescript: {
		ignoreBuildErrors: true,
	},
	images: {
		minimumCacheTTL: 2678400, // 31 days
		remotePatterns: [
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "firebasestorage.googleapis.com",
			},
			{
				protocol: "https",
				hostname: "sc-erp.s3.amazonaws.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "wawrqfehfafrrnfsycgs.supabase.co",
			},
			{
				protocol: "https",
				hostname: "static.saipos.com",
			},
			{
				protocol: "https",
				hostname: "storage.googleapis.com",
			},
			{
				protocol: "https",
				hostname: "acdn-us.mitiendanube.com",
			},
			{
				protocol: "https",
				hostname: "brave-warbler-898.convex.cloud",
			},
			{
				protocol: "https",
				hostname: "image.mux.com",
			},
			{
				protocol: "https",
				hostname: "upload.wikimedia.org",
			},
			{
				protocol: "http",
				hostname: "localhost",
			},
		],
	},
};

export default nextConfig;
