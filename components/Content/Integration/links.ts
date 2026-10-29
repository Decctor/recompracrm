// Destinos dos CTAs das páginas de integração. Fica fora do TrackedLink ("use client") para que
// os componentes de servidor possam montar a URL.

export const SIGNUP_HREF = "/auth/signup";

export function buildWhatsappUrl(message: string) {
	return `https://wa.me/553492465388?text=${encodeURIComponent(message)}`;
}
