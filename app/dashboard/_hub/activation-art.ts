import type { TIsoIconKey } from "@/components/Illustrations/Isometric/IsoIcon";
import type { TActivation, TActivationCelebration } from "@/lib/onboarding/activation";
import type { TErpChannel } from "@/lib/onboarding/erp-channels";

/**
 * Qual cena isométrica acompanha cada momento de "Primeiros passos". As cenas são do kit de
 * components/Illustrations/Isometric (DESIGN.md, "Ilustrações isométricas"): mesma luz e mesma
 * paleta das capas do blog, para o hub e o conteúdo serem da mesma família.
 *
 * A chave da ação vem do modelo (lib/onboarding/activation.ts); uma ação nova cai na cena neutra
 * até ganhar a sua.
 */

const ACTION_ART: Record<string, TIsoIconKey> = {
	"conectar-whatsapp": "phoneChat",
	"reconectar-whatsapp": "phoneChat",
	"pagamento-whatsapp": "card",
	"template-rejeitado": "chat",
	"liberar-campanha": "chat",
	"preparar-campanha": "chat",
	"revisar-campanhas": "chat",
	"aguardando-meta": "clock",
	"aguardando-publico": "clock",
	"aguardando-base": "boxes",
	"reconectar-integracao": "plug",
	"definir-fonte": "plug",
	"primeira-venda-balcao": "monitor",
	"registrar-balcao": "monitor",
	"escolher-canal": "store",
	"cadastrar-produtos": "tag",
	"abrir-pdv": "calculator",
	"abrir-loja": "bag",
	"abrir-comandas": "checklist",
};

export function resolveActionArt(chave: string | null | undefined): TIsoIconKey {
	if (!chave) return "checklist";
	if (chave.startsWith("lancamento-")) return "checklist";
	return ACTION_ART[chave] ?? "checklist";
}

const CHANNEL_ART: Record<TErpChannel, TIsoIconKey> = { BALCAO: "calculator", CATALOGO: "bag", MESAS: "checklist" };

export function resolveRegressionArt(activation: Pick<TActivation, "regressao" | "canalErp">): TIsoIconKey {
	switch (activation.regressao?.motivo) {
		case "CANAL_PERDIDO":
			return "phoneChat";
		case "SEM_VENDA":
			return CHANNEL_ART[activation.canalErp ?? "BALCAO"];
		default:
			return "chat";
	}
}

export function resolveCelebrationArt(celebration: TActivationCelebration): TIsoIconKey {
	const kind = celebration.chave.split(":")[0];
	switch (kind) {
		case "primeira-recompra":
			return "coins";
		case "primeira-entrega":
			return "chat";
		case "primeira-venda-balcao":
			return "card";
		default:
			return "bag";
	}
}
