import fs from "node:fs";
import path from "node:path";

// Fotos dos produtos de exemplo (Gelateria Aurora) nas telas do PDV e da loja digital. Vêm do
// Pexels (licença livre para uso comercial, sem atribuição obrigatória; o crédito fica aqui mesmo
// assim) e são baixadas e recortadas por `scripts/download-erp-mock-photos.ts`:
//   npm run download:erp-mock-photos
// O script grava em public/images/erp/products/<slug>.webp (4:3, cards do PDV) e, quando
// `square` está marcado, também <slug>-square.webp (1:1, cards da loja digital).
//
// Para trocar uma foto: mude `pexelsId`/`source` abaixo e rode o script de novo.

export type TMockProductPhoto = {
	slug: string;
	pexelsId: string;
	/** URL do arquivo no CDN do Pexels (a mesma de "download" na página da foto). */
	source: string;
	alt: string;
	photographer: string;
	pexelsUrl: string;
	/** Também gera a versão quadrada, para a loja digital. */
	square?: boolean;
};

export const PRODUCT_PHOTOS_DIR = path.join("public", "images", "erp", "products");
export const PRODUCT_PHOTOS_PUBLIC_PATH = "/images/erp/products";

const pexels = (id: string, file = `pexels-photo-${id}.jpeg`) => `https://images.pexels.com/photos/${id}/${file}`;

export const MOCK_PRODUCT_PHOTOS: TMockProductPhoto[] = [
	{
		slug: "pote-chocolate-belga",
		pexelsId: "5061214",
		source: pexels("5061214"),
		alt: "Sorvete de chocolate em um pote",
		photographer: "Roman Odintsov",
		pexelsUrl: "https://www.pexels.com/photo/chocolate-ice-cream-on-brown-round-cup-5061214/",
		square: true,
	},
	{
		slug: "pote-pistache",
		pexelsId: "36576781",
		source: pexels("36576781"),
		alt: "Bolas de sorvete com pistache e castanhas",
		photographer: "Kunal Lakhotia",
		pexelsUrl: "https://www.pexels.com/photo/delicious-ice-cream-with-mixed-nuts-on-wooden-board-36576781/",
	},
	{
		slug: "pote-morango",
		pexelsId: "7886448",
		source: pexels("7886448"),
		alt: "Sorvete de morango com morangos frescos",
		photographer: "Micheile Henderson",
		pexelsUrl: "https://www.pexels.com/photo/flatlay-photography-of-strawberry-ice-cream-7886448/",
	},
	{
		slug: "gelato",
		pexelsId: "3631",
		source: pexels("3631", "summer-dessert-sweet-ice-cream.jpg"),
		alt: "Vitrine de gelatos de vários sabores",
		photographer: "JÉSHOOTS",
		pexelsUrl: "https://www.pexels.com/photo/dessert-ice-cream-summer-sweet-3631/",
		square: true,
	},
	{
		slug: "milkshake",
		pexelsId: "6463660",
		source: pexels("6463660"),
		alt: "Milkshakes com cobertura em potes de vidro",
		photographer: "alleksana",
		pexelsUrl: "https://www.pexels.com/photo/close-up-shot-of-milkshakes-6463660/",
		square: true,
	},
	{
		slug: "acai",
		pexelsId: "8465241",
		source: pexels("8465241"),
		alt: "Tigela de açaí com granola e castanhas",
		photographer: "Messala Ciulla",
		pexelsUrl: "https://www.pexels.com/photo/white-bowl-with-acai-ice-cream-decorated-with-muesli-and-nuts-8465241/",
	},
	{
		slug: "picole-limao",
		pexelsId: "8705929",
		source: pexels("8705929"),
		alt: "Picolés de limão com rodelas de limão e hortelã",
		photographer: "Anton Uniqueton",
		pexelsUrl: "https://www.pexels.com/photo/green-popsicles-in-close-up-shot-8705929/",
	},
	{
		slug: "casquinha",
		pexelsId: "684968",
		source: pexels("684968"),
		alt: "Casquinha de sorvete em um suporte de metal",
		photographer: "Valeria Boltneva",
		pexelsUrl: "https://www.pexels.com/photo/ice-cream-on-cone-with-gray-metallic-holder-photo-684968/",
	},
	{
		slug: "affogato",
		pexelsId: "1233464",
		source: pexels("1233464"),
		alt: "Sorvete com calda em uma taça de vidro",
		photographer: "Nick Collins",
		pexelsUrl: "https://www.pexels.com/photo/white-ice-cream-in-clear-parfait-glass-1233464/",
	},
	{
		slug: "sundae-caramelo",
		pexelsId: "6025811",
		source: pexels("6025811"),
		alt: "Sundaes com calda e cobertura em copos de vidro",
		photographer: "Piotr Arnoldes",
		pexelsUrl: "https://www.pexels.com/photo/tasty-desserts-served-on-table-in-cafe-6025811/",
	},
	{
		slug: "pote-doce-de-leite",
		pexelsId: "5060454",
		source: pexels("5060454"),
		alt: "Sorvete com calda de caramelo e castanhas",
		photographer: "Roman Odintsov",
		pexelsUrl: "https://www.pexels.com/photo/close-up-of-ice-cream-with-caramel-sauce-and-nuts-on-top-5060454/",
	},
	{
		slug: "paleta-morango",
		pexelsId: "8724098",
		source: pexels("8724098"),
		alt: "Paletas de morango com folhas de hortelã",
		photographer: "Anton Uniqueton",
		pexelsUrl: "https://www.pexels.com/photo/popsicles-and-green-min-leaves-in-close-up-photography-8724098/",
	},
];

/**
 * Caminho público da foto, ou `null` se o script ainda não a baixou. As telas caem no ícone de
 * produto sem foto (o mesmo do app) em vez de mostrar uma imagem quebrada. Roda no servidor: as
 * telas são componentes de servidor, renderizados na geração estática.
 */
export function mockProductPhotoSrc(slug: string, variant: "card" | "square" = "card") {
	const file = variant === "square" ? `${slug}-square.webp` : `${slug}.webp`;
	if (!fs.existsSync(path.join(process.cwd(), PRODUCT_PHOTOS_DIR, file))) return null;
	return `${PRODUCT_PHOTOS_PUBLIC_PATH}/${file}`;
}

export function getMockProductPhoto(slug: string) {
	return MOCK_PRODUCT_PHOTOS.find((photo) => photo.slug === slug) ?? null;
}
