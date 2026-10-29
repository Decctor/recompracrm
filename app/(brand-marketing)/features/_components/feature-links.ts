const WHATSAPP_NUMBER = "553492465388";

export const SIGNUP_HREF = "/auth/signup";
export const PLANS_HREF = "/#planos";

// Mesmo evento do Dock e da landing, para que os CTAs das funcionalidades entrem no mesmo funil.
export const FEATURE_CTA_EVENT = "landing_cta_clicked";

export function featureHref(slug: string) {
	return `/features/${slug}`;
}

export function whatsappHref(text: string) {
	return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}
