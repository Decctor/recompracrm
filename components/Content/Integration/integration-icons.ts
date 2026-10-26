import {
	ChartBar,
	Coins,
	IdCard,
	Layers,
	type LucideIcon,
	MessageCircle,
	Monitor,
	Package,
	ReceiptText,
	Sparkles,
	UsersRound,
	UtensilsCrossed,
} from "lucide-react";

// Ícones das páginas de integração. O conteúdo (app/_content/integration-pages.ts) descreve os
// dados em linguagem de negócio; o ícone sai do nome da entidade e do slug da funcionalidade, com
// um fallback neutro para qualquer entidade nova.

const ENTITY_ICONS: Record<string, LucideIcon> = {
	Vendas: ReceiptText,
	Pedidos: ReceiptText,
	Clientes: UsersRound,
	Produtos: Package,
	Cardápio: UtensilsCrossed,
	Equipe: IdCard,
};

const FEATURE_ICONS: Record<string, LucideIcon> = {
	"programa-de-cashback": Coins,
	"campanhas-whatsapp": MessageCircle,
	"business-intelligence": ChartBar,
	"ponto-de-interacao": Monitor,
};

export function getEntityIcon(entity: string): LucideIcon {
	return ENTITY_ICONS[entity] ?? Layers;
}

export function getFeatureIcon(featureSlug: string): LucideIcon {
	return FEATURE_ICONS[featureSlug] ?? Sparkles;
}
