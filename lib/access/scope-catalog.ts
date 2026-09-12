import type { TAccessScopeEnum } from "@/schemas/enums";

// A chave crua ("desktop-agent:print-jobs:update") é contrato de integração, não linguagem de loja.
// Quem abre a tela de dispositivos é o lojista: cada scope precisa dizer o que o aparelho passa a
// conseguir fazer no balcão. Este catálogo é a única fonte desses rótulos.

export type TAccessScopeGroup = "PONTO_DE_INTERACAO" | "AGENTE_DESKTOP" | "AGENTE_IA" | "PLATAFORMA" | "OUTROS";

export type TAccessScopeDescriptor = {
	label: string;
	description: string;
	group: TAccessScopeGroup;
};

export const ACCESS_SCOPE_GROUP_LABELS: Record<TAccessScopeGroup, string> = {
	PONTO_DE_INTERACAO: "Ponto de interação",
	AGENTE_DESKTOP: "Agente desktop",
	AGENTE_IA: "Agente de IA",
	PLATAFORMA: "Plataforma (interno)",
	OUTROS: "Outras permissões",
};

// Ordem de renderização dos grupos — estável, independente da ordem que os scopes chegam da API.
export const ACCESS_SCOPE_GROUP_ORDER: TAccessScopeGroup[] = ["PONTO_DE_INTERACAO", "AGENTE_DESKTOP", "AGENTE_IA", "PLATAFORMA", "OUTROS"];

export const ACCESS_SCOPE_CATALOG: Record<TAccessScopeEnum, TAccessScopeDescriptor> = {
	"poi:configuration:read": {
		label: "Ler a configuração da loja",
		description: "Carregar as regras de cashback, os limites de desconto e os prêmios ativos.",
		group: "PONTO_DE_INTERACAO",
	},
	"poi:clients:read": {
		label: "Consultar clientes",
		description: "Buscar o cliente pelo telefone e ver o saldo de cashback disponível.",
		group: "PONTO_DE_INTERACAO",
	},
	"poi:clients:create": {
		label: "Cadastrar clientes",
		description: "Criar um cliente novo direto no balcão, sem passar pelo painel.",
		group: "PONTO_DE_INTERACAO",
	},
	"poi:transactions:create": {
		label: "Registrar compras e resgates",
		description: "Lançar a venda, gerar o cashback e dar baixa nos resgates do cliente.",
		group: "PONTO_DE_INTERACAO",
	},
	"poi:coupons:read": {
		label: "Consultar cupons",
		description: "Ver os cupons que o cliente pode usar na compra.",
		group: "PONTO_DE_INTERACAO",
	},
	"poi:prizes:read": {
		label: "Consultar prêmios",
		description: "Ver o catálogo de prêmios que o cliente pode trocar por cashback.",
		group: "PONTO_DE_INTERACAO",
	},
	"poi:sellers:read": {
		label: "Consultar vendedores",
		description: "Listar os vendedores para atribuir a venda a quem atendeu.",
		group: "PONTO_DE_INTERACAO",
	},
	"desktop-agent:configuration:read": {
		label: "Ler a configuração de impressão",
		description: "Carregar as preferências de impressão automática da organização.",
		group: "AGENTE_DESKTOP",
	},
	"desktop-agent:printers:sync": {
		label: "Sincronizar impressoras",
		description: "Reportar quais impressoras estão instaladas e disponíveis nesta máquina.",
		group: "AGENTE_DESKTOP",
	},
	"desktop-agent:print-jobs:read": {
		label: "Receber trabalhos de impressão",
		description: "Buscar a fila de cupons, etiquetas e notas que aguardam impressão.",
		group: "AGENTE_DESKTOP",
	},
	"desktop-agent:print-jobs:update": {
		label: "Confirmar impressões",
		description: "Marcar cada trabalho como impresso ou reportar o erro que ocorreu.",
		group: "AGENTE_DESKTOP",
	},
	"agent:results:read": {
		label: "Consultar resultados comerciais",
		description: "Ver faturamento, margem, ticket médio e o quanto a meta do período já foi atingida.",
		group: "AGENTE_IA",
	},
	"agent:clients:read": {
		label: "Consultar clientes",
		description: "Buscar clientes e ver histórico de compras, categoria RFM e tempo desde a última visita.",
		group: "AGENTE_IA",
	},
	"agent:clients:pii": {
		label: "Ver dados de contato dos clientes",
		description: "Enxergar telefone, e-mail e CPF/CNPJ completos em vez de mascarados. Conceda apenas se o agente precisar entrar em contato.",
		group: "AGENTE_IA",
	},
	"agent:products:read": {
		label: "Consultar produtos",
		description: "Buscar no catálogo e ver preço, estoque e o que mais vendeu no período.",
		group: "AGENTE_IA",
	},
	"agent:campaigns:read": {
		label: "Consultar campanhas",
		description: "Ver as campanhas cadastradas, quando disparam e para quantos clientes.",
		group: "AGENTE_IA",
	},
	"agent:sales:read": {
		label: "Consultar vendas",
		description: "Ver vendas individuais do período, com valor, vendedor, canal e cliente.",
		group: "AGENTE_IA",
	},
	"agent:finances:read": {
		label: "Consultar o financeiro",
		description: "Ver contas financeiras, transações (entradas e saídas) e linhas de extrato importadas.",
		group: "AGENTE_IA",
	},
	"agent:finances:reconcile": {
		label: "Sugerir conciliações de extrato",
		description: "Importar linhas de extrato transcritas e sugerir vínculos com transações. Toda sugestão exige confirmação humana no painel.",
		group: "AGENTE_IA",
	},
	"agent:members:read": {
		label: "Consultar membros",
		description: "Listar membros da organização para atribuir responsabilidades de negócio.",
		group: "AGENTE_IA",
	},
	"agent:campaigns:write": {
		label: "Criar e editar rascunhos de campanha",
		description: "Criar e alterar campanhas sem ativá-las ou realizar envios.",
		group: "AGENTE_IA",
	},
	"agent:campaigns:activate": {
		label: "Ativar campanhas",
		description: "Permitir a ativação operacional de campanhas após aprovação.",
		group: "AGENTE_IA",
	},
	"agent:message-templates:read": {
		label: "Consultar templates de mensagem",
		description: "Listar templates e acompanhar aprovação e qualidade por número de WhatsApp.",
		group: "AGENTE_IA",
	},
	"agent:message-templates:write": {
		label: "Criar e editar rascunhos de template",
		description: "Criar e alterar templates locais sem submetê-los à Meta.",
		group: "AGENTE_IA",
	},
	"agent:message-templates:submit": {
		label: "Submeter templates à Meta",
		description: "Enviar templates para análise da Meta após aprovação humana.",
		group: "AGENTE_IA",
	},
	"agent:message-template-media:write": {
		label: "Enviar mídia de templates",
		description: "Enviar imagens e outros cabeçalhos para o armazenamento da organização.",
		group: "AGENTE_IA",
	},
	"platform:organizations:read": {
		label: "Consultar organizações da plataforma",
		description: "Listar todas as organizações e ver a saúde de cada conta. Interno — nunca conceda a uma aplicação de lojista.",
		group: "PLATAFORMA",
	},
	"platform:metrics:read": {
		label: "Consultar métricas da plataforma",
		description: "Ver totais agregados da base inteira: organizações, usuários e ativação. Interno.",
		group: "PLATAFORMA",
	},
};

// Um grant pode ter sobrevivido a uma mudança de catálogo: nunca esconda o scope só porque
// não há rótulo — o lojista ainda precisa poder revogá-lo.
export function describeAccessScope(scope: string): TAccessScopeDescriptor {
	return (
		ACCESS_SCOPE_CATALOG[scope as TAccessScopeEnum] ?? {
			label: scope,
			description: "Permissão fora do catálogo padrão deste dispositivo.",
			group: "OUTROS",
		}
	);
}
