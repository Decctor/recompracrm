import type { TAccessClientCategoryEnum, TAccessScopeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { accessClients } from "@/services/drizzle/schema";

// Scopes operacionais do fluxo POI — teto tanto do app mobile quanto do kiosk web.
export const POI_ACCESS_SCOPES: TAccessScopeEnum[] = [
	"poi:configuration:read",
	"poi:clients:read",
	"poi:clients:create",
	"poi:transactions:create",
	"poi:coupons:read",
	"poi:prizes:read",
	"poi:sellers:read",
];

// Scopes do agente desktop local (recompra-local-agent) — controle de periféricos da loja.
export const DESKTOP_AGENT_ACCESS_SCOPES: TAccessScopeEnum[] = [
	"desktop-agent:configuration:read",
	"desktop-agent:printers:sync",
	"desktop-agent:print-jobs:read",
	"desktop-agent:print-jobs:update",
];

// Scopes de leitura dos agentes de IA (MCP). `agent:clients:pii` fica de fora do teto padrão:
// é o único que expõe contato de cliente, e um cliente MCP genérico não deveria poder pedi-lo —
// quando um agente precisar, o teto daquela aplicação é ampliado explicitamente.
export const AGENT_READ_ACCESS_SCOPES: TAccessScopeEnum[] = [
	"agent:results:read",
	"agent:clients:read",
	"agent:products:read",
	"agent:campaigns:read",
	"agent:sales:read",
	"agent:finances:read",
	"agent:members:read",
	"agent:message-templates:read",
];

export const AGENT_MUTATION_ACCESS_SCOPES: TAccessScopeEnum[] = [
	// Só cria sugestões (match SUGERIDO tipo IA) e linhas de extrato; nunca confirma conciliação.
	"agent:finances:reconcile",
	"agent:campaigns:write",
	"agent:campaigns:activate",
	"agent:message-templates:write",
	"agent:message-templates:submit",
	"agent:message-template-media:write",
];

// Capacidades que atravessam organizações. Pertencem ao teto do AGENT_CONTROL, mas só são
// concedidas a um principal criado explicitamente como CONTA_PLATAFORMA.
export const PLATFORM_AGENT_ACCESS_SCOPES: TAccessScopeEnum[] = ["platform:organizations:read", "platform:metrics:read"];

export function getDefaultAgentAccessScopes({ isPlatform }: { isPlatform: boolean }): TAccessScopeEnum[] {
	return isPlatform ? [...AGENT_READ_ACCESS_SCOPES, ...PLATFORM_AGENT_ACCESS_SCOPES] : [...AGENT_READ_ACCESS_SCOPES];
}

type TNativeAccessClientDefinition = {
	codigo: string;
	nome: string;
	categoria: TAccessClientCategoryEnum;
	escoposPermitidos: TAccessScopeEnum[];
};
// Catálogo das aplicações nativas. Service accounts e parceiros são cadastrados por fluxo
// administrativo próprio, não por este catálogo.
export const NATIVE_ACCESS_CLIENTS: TNativeAccessClientDefinition[] = [
	{
		codigo: "RECOMPRA_POI_MOBILE",
		nome: "Aplicativo POI para tablets",
		categoria: "NATIVO_MOBILE",
		escoposPermitidos: POI_ACCESS_SCOPES,
	},
	{
		codigo: "RECOMPRA_POI_WEB",
		nome: "POI web (kiosk no navegador)",
		categoria: "NATIVO_WEB_KIOSK",
		escoposPermitidos: POI_ACCESS_SCOPES,
	},
	{
		codigo: "RECOMPRA_LOCAL_AGENT",
		nome: "Agente desktop local (periféricos)",
		categoria: "NATIVO_DESKTOP",
		escoposPermitidos: DESKTOP_AGENT_ACCESS_SCOPES,
	},
	// Um cliente por aplicação de IA, e não um "MCP" genérico: é o que permite revogar o Claude
	// de uma organização sem derrubar o ChatGPT, e o que faz a auditoria dizer quem consultou.
	// platform:* no teto expressa capacidade, não concessão automática (mesmo racional do
	// AGENT_CONTROL): o grant só nasce do consentimento OAuth de um admin da plataforma, que
	// provisiona CONTA_PLATAFORMA.
	{
		codigo: "AGENT_CLAUDE",
		nome: "Claude (conector MCP)",
		categoria: "APLICACAO_PARCEIRA",
		escoposPermitidos: [...AGENT_READ_ACCESS_SCOPES, ...AGENT_MUTATION_ACCESS_SCOPES, ...PLATFORM_AGENT_ACCESS_SCOPES],
	},
	{
		codigo: "AGENT_CHATGPT",
		nome: "ChatGPT (conector MCP)",
		categoria: "APLICACAO_PARCEIRA",
		escoposPermitidos: [...AGENT_READ_ACCESS_SCOPES, ...AGENT_MUTATION_ACCESS_SCOPES, ...PLATFORM_AGENT_ACCESS_SCOPES],
	},
	// Fallback do registro OAuth dinâmico: um cliente MCP que não reconhecemos pelo redirect
	// (Cursor, inspetores, apps novos) cai aqui, com teto só de leitura — mutação exige uma
	// aplicação identificada no catálogo.
	{
		codigo: "AGENT_MCP",
		nome: "Cliente MCP genérico (OAuth)",
		categoria: "APLICACAO_PARCEIRA",
		escoposPermitidos: AGENT_READ_ACCESS_SCOPES,
	},
	{
		codigo: "AGENT_CONTROL",
		nome: "Syncroniza Control (agentes internos)",
		categoria: "SERVIDOR_EXTERNO",
		// O teto expressa capacidade, não concessão automática. Principals Control de organização
		// recebem apenas agent:*; platform:* exige emissão explícita como CONTA_PLATAFORMA.
		escoposPermitidos: [...AGENT_READ_ACCESS_SCOPES, ...AGENT_MUTATION_ACCESS_SCOPES, ...PLATFORM_AGENT_ACCESS_SCOPES, "agent:clients:pii"],
	},
];

// Upsert idempotente por código — seguro de rodar em deploy/seed repetidamente.
export async function ensureNativeAccessClients() {
	for (const definition of NATIVE_ACCESS_CLIENTS) {
		await db
			.insert(accessClients)
			.values({
				codigo: definition.codigo,
				nome: definition.nome,
				categoria: definition.categoria,
				nativo: true,
				escoposPermitidos: definition.escoposPermitidos,
			})
			.onConflictDoUpdate({
				target: accessClients.codigo,
				set: {
					nome: definition.nome,
					categoria: definition.categoria,
					nativo: true,
					escoposPermitidos: definition.escoposPermitidos,
					dataAtualizacao: new Date(),
				},
			});
	}
}
