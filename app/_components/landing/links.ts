// Destinos dos CTAs da landing. Os links de WhatsApp são os mesmos que a landing anterior usava.

const WHATSAPP_NUMBER = "553492465388";

function whatsapp(text: string) {
	return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const SIGNUP_HREF = "/auth/signup";
export const SIGNIN_HREF = "/auth/signin";
export const ERP_HREF = "/erp";

export const WHATSAPP_SPECIALIST = whatsapp("Olá, gostaria de falar com um especialista do RecompraCRM.");
export const WHATSAPP_CONSULTORIA = whatsapp(
	"Olá! Quero agendar um diagnóstico e entender a gestão com gestor de crescimento dedicado do RecompraCRM.",
);
export const WHATSAPP_ERP = whatsapp("Olá! Quero conhecer o ERP do RecompraCRM.");
