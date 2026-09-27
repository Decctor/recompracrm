import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	Bot,
	Building2,
	Grid3x3,
	Key,
	Landmark,
	ListChecks,
	type LucideIcon,
	MessageCircle,
	Plug,
	Send,
	Sparkles,
	Store,
	TabletSmartphone,
	ToggleRight,
	User,
	UsersRound,
} from "lucide-react";

type TMembership = NonNullable<TAuthUserSession["membership"]>;

/**
 * Os valores aceitos em `?view=`. Nomes preservados dos que já circulam em links espalhados pelo
 * app — renomear quebraria deep links vivos, como o de SalesEmptyState.
 */
export const SETTINGS_VIEWS = [
	"profile",
	"organization",
	"modules",
	"sales-channels",
	"users",
	"devices",
	"meta-oauth",
	"message-templates",
	"outbound",
	"ai-agent",
	"ai-connections",
	"integration",
	"finances",
	"segments",
	"custom-fields",
] as const;

export type TSettingsView = (typeof SETTINGS_VIEWS)[number];

export const DEFAULT_SETTINGS_VIEW: TSettingsView = "profile";

export type TSettingsSection = {
	view: TSettingsView;
	label: string;
	description: string;
	icon: LucideIcon;
	/**
	 * Ausente significa que qualquer membro entra. Quando presente e reprovando, o item continua
	 * visível no rail com cadeado em vez de sumir: o lojista precisa descobrir o que existe para
	 * saber o que pedir ao administrador.
	 */
	canAccess?: (membership: TMembership) => boolean;
	restrictedReason?: string;
};

export type TSettingsGroup = {
	label: string;
	sections: TSettingsSection[];
};

const canViewCompany = (membership: TMembership) => membership.permissoes.empresa.visualizar;
const COMPANY_RESTRICTED_REASON = "Peça a um administrador da organização o acesso de visualização da empresa.";

/**
 * Fonte única da navegação de configurações: rótulos, descrições, ícones e gating de permissão
 * saem todos daqui, e o rail é renderizado a partir destes dados. A ordem dos grupos segue a
 * jornada de quem configura a conta — primeiro você, depois o negócio, depois como ele fala com o
 * cliente, por fim de onde vêm os dados.
 */
export const SETTINGS_GROUPS: TSettingsGroup[] = [
	{
		label: "Conta",
		sections: [
			{
				view: "profile",
				label: "Meu perfil",
				description: "Seus dados pessoais, foto e contato dentro da organização.",
				icon: User,
			},
		],
	},
	{
		label: "Negócio",
		sections: [
			{
				view: "organization",
				label: "Organização",
				description: "Os dados de cadastro do negócio e as cores que a sua marca usa nas telas do cliente.",
				icon: Building2,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
			{
				view: "modules",
				label: "Módulos",
				description: "Quais recursos da plataforma ficam ligados para a sua operação, e as regras de cada um.",
				icon: ToggleRight,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
			{
				view: "finances",
				label: "Financeiro",
				description: "Contas contábeis e métodos de pagamento aplicados por padrão nos lançamentos do seu negócio.",
				icon: Landmark,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
			{
				view: "sales-channels",
				label: "Canais de venda",
				description: "As regras de operação de cada canal — o que o balcão pode dispensar e o autoatendimento não.",
				icon: Store,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
			{
				view: "users",
				label: "Usuários",
				description: "Quem acessa a plataforma, com quais permissões, e os convites ainda em aberto.",
				icon: UsersRound,
				canAccess: (membership) => membership.permissoes.usuarios.visualizar,
				restrictedReason: "Peça a um administrador da organização o acesso de visualização de usuários.",
			},
			{
				view: "devices",
				label: "Dispositivos",
				description: "Tablets, kiosks e agentes desktop vinculados à organização, e o link do Ponto de Interação.",
				icon: TabletSmartphone,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
		],
	},
	{
		label: "Comunicação",
		sections: [
			{
				view: "meta-oauth",
				label: "Conexão com WhatsApp",
				description: "Os números que disparam suas campanhas e atendem seus clientes, pela API oficial ou por QR Code.",
				icon: Key,
			},
			{
				view: "message-templates",
				label: "Templates de mensagem",
				description: "Os modelos aprovados que suas campanhas usam para falar com o cliente no WhatsApp.",
				icon: MessageCircle,
			},
			{
				view: "outbound",
				label: "Envios e relatórios",
				description: "Quem recebe os relatórios do negócio e quanto suas campanhas podem enviar por semana.",
				icon: Send,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
			{
				view: "ai-agent",
				label: "Agente de IA",
				description: "O atendente automático que responde no WhatsApp e passa a conversa para a equipe quando precisa.",
				icon: Bot,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
		],
	},
	{
		label: "Dados & Integrações",
		sections: [
			{
				view: "ai-connections",
				label: "Conexões de IA",
				description: "Assistentes como Claude e ChatGPT consultando seus dados, cada um com chave e permissões próprias.",
				icon: Sparkles,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
			{
				view: "integration",
				label: "Integração",
				description: "Conecte seu ERP ou PDV para que vendas, produtos e clientes cheguem sozinhos até aqui.",
				icon: Plug,
			},
			{
				view: "segments",
				label: "Segmentações",
				description: "A matriz RFM que classifica seus clientes e alimenta o gatilho das campanhas.",
				icon: Grid3x3,
			},
			{
				view: "custom-fields",
				label: "Campos personalizados",
				description: "O que você coleta sobre cada cliente além do cadastro básico — no ponto de interação, em pesquisas e como filtro de público.",
				icon: ListChecks,
				canAccess: canViewCompany,
				restrictedReason: COMPANY_RESTRICTED_REASON,
			},
		],
	},
];

const SETTINGS_LOCATIONS = new Map<TSettingsView, { group: TSettingsGroup; section: TSettingsSection }>(
	SETTINGS_GROUPS.flatMap((group) => group.sections.map((section) => [section.view, { group, section }] as const)),
);

/** O grupo e a seção correspondentes a um `?view=`, para montar o eyebrow e o cabeçalho da seção. */
export function getSettingsLocation(view: TSettingsView) {
	// Só cai no fallback se um valor entrar em SETTINGS_VIEWS sem ganhar uma seção no registry.
	return SETTINGS_LOCATIONS.get(view) ?? { group: SETTINGS_GROUPS[0], section: SETTINGS_GROUPS[0].sections[0] };
}

export function isSettingsSectionAccessible(section: TSettingsSection, membership: TMembership) {
	return section.canAccess ? section.canAccess(membership) : true;
}
