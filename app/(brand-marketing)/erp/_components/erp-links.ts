const WHATSAPP_NUMBER = "553499480791";
const WHATSAPP_ERP_TEXT = "Olá! Quero conhecer o ERP do RecompraCRM (PDV, nota fiscal, estoque e financeiro) para a minha loja.";

export const ERP_WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_ERP_TEXT)}`;

// Mesmo evento do Dock e da landing, para que os CTAs do ERP entrem no mesmo funil.
export const ERP_CTA_EVENT = "landing_cta_clicked";
