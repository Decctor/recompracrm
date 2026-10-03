import type { TVisualKitPieceProps } from "../types";

export const VISUAL_KIT_IMAGE_PROXY_PATH = "/api/visual-kits/image";

function currentOrigin(): string | null {
	return typeof window === "undefined" ? null : window.location.origin;
}

/**
 * Imagem de outra origem contamina o canvas (e o html-to-image não consegue embuti-la): passa pelo
 * proxy da mesma origem. Relativas, mesma origem, `data:` e `blob:` seguem como estão.
 */
export function proxyVisualKitImageUrl(url: string | null, origin: string | null = currentOrigin()): string | null {
	if (!url) return url;
	if (url.startsWith("data:") || url.startsWith("blob:")) return url;
	if (url.startsWith(VISUAL_KIT_IMAGE_PROXY_PATH)) return url;
	let parsed: URL;
	try {
		parsed = new URL(url, origin ?? undefined);
	} catch {
		return url; // relativa sem origem conhecida (fora do navegador)
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
	if (origin != null && parsed.origin === origin) return url;
	return `${VISUAL_KIT_IMAGE_PROXY_PATH}?url=${encodeURIComponent(parsed.href)}`;
}

/** Props com todas as imagens (fotos dos itens e logo) reescritas para o proxy quando preciso. Pura. */
export function withProxiedImages(props: TVisualKitPieceProps, origin: string | null = currentOrigin()): TVisualKitPieceProps {
	return {
		...props,
		itens: props.itens.map((item) => ({ ...item, imagemUrl: proxyVisualKitImageUrl(item.imagemUrl, origin) })),
		marca: { ...props.marca, logoUrl: proxyVisualKitImageUrl(props.marca.logoUrl, origin) },
	};
}
