import { type TExternalActorContext, authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { appApiHandler } from "@/lib/app-api";
import { isDesktopAgentWebSocketEnabled } from "@/lib/desktop-agent/websocket-channel";
import { db } from "@/services/drizzle";
import { accessPrincipals, agentPrinters, organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// Cadência sugerida ao agent. Com o canal WebSocket desligado por padrão (ver
// `app/api/desktop-agent/ws/route.ts`), o polling É a latência entre a criação de um job e o claim.
// O agent alterna entre duas cadências: `ativoMs` enquanto houve impressão recente (a loja está em
// atendimento) e `ociosoMs` depois de uma janela quieta — assim a latência fica baixa quando
// importa e a carga no banco cai fora do expediente. O claim é barato (mediana ~0 ms, ~10 ms de CPU)
// numa instância já quente; 2,5 s por agent ativo custa centavos por dia.
//
// `intervaloSegundos` continua sendo servido para agents antigos, que só conhecem uma cadência
// inteira em segundos (aceitam 5–300 s). Os três valores têm override por env, sem deploy:
// DESKTOP_AGENT_POLLING_ATIVO_MS, DESKTOP_AGENT_POLLING_OCIOSO_MS, DESKTOP_AGENT_POLLING_SEGUNDOS.
const POLLING_ATIVO_MS_PADRAO = 2_500;
const POLLING_OCIOSO_MS_PADRAO = 15_000;
const POLLING_MS_MIN = 1_000;
const POLLING_MS_MAX = 300_000;
const POLLING_INTERVALO_SEGUNDOS_PADRAO = 5;
const POLLING_INTERVALO_SEGUNDOS_MIN = 5;
const POLLING_INTERVALO_SEGUNDOS_MAX = 300;
const CLAIM_LIMITE_PADRAO = 5;

function resolveIntegerEnv({ name, fallback, min, max }: { name: string; fallback: number; min: number; max: number }) {
	const raw = Number(process.env[name]);
	if (!Number.isInteger(raw)) return fallback;
	return Math.min(max, Math.max(min, raw));
}

function resolvePollingCadence() {
	const ativoMs = resolveIntegerEnv({ name: "DESKTOP_AGENT_POLLING_ATIVO_MS", fallback: POLLING_ATIVO_MS_PADRAO, min: POLLING_MS_MIN, max: POLLING_MS_MAX });
	const ociosoMs = resolveIntegerEnv({ name: "DESKTOP_AGENT_POLLING_OCIOSO_MS", fallback: POLLING_OCIOSO_MS_PADRAO, min: POLLING_MS_MIN, max: POLLING_MS_MAX });
	const intervaloSegundos = resolveIntegerEnv({
		name: "DESKTOP_AGENT_POLLING_SEGUNDOS",
		fallback: POLLING_INTERVALO_SEGUNDOS_PADRAO,
		min: POLLING_INTERVALO_SEGUNDOS_MIN,
		max: POLLING_INTERVALO_SEGUNDOS_MAX,
	});
	// O ocioso nunca fica mais rápido que o ativo: a janela quieta é para desacelerar.
	return { intervaloSegundos, ativoMs, ociosoMs: Math.max(ativoMs, ociosoMs), claimLimite: CLAIM_LIMITE_PADRAO };
}

// Bootstrap do agente desktop após a ativação: identidade da organização, estado das
// impressoras vinculadas e parâmetros de operação.
async function getDesktopAgentConfiguration({ actor }: { actor: TExternalActorContext }) {
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, actor.organizationId),
		columns: { id: true, nome: true, logoUrl: true, telefone: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const principal = await db.query.accessPrincipals.findFirst({
		where: eq(accessPrincipals.id, actor.principalId),
		columns: { id: true, nome: true, lojaId: true },
	});

	const printers = await db.query.agentPrinters.findMany({
		where: eq(agentPrinters.principalId, actor.principalId),
		columns: {
			id: true,
			nomeSistema: true,
			apelido: true,
			driver: true,
			finalidades: true,
			ativa: true,
			disponivel: true,
			metadados: true,
			ultimaSincronizacao: true,
		},
		orderBy: (fields, { asc }) => asc(fields.dataInsercao),
	});

	return {
		data: {
			organization,
			principal,
			impressoras: printers,
			scopes: Array.from(actor.scopes),
			polling: resolvePollingCadence(),
			// O agent só abre o canal WebSocket quando o CRM diz que ele existe; caso contrário opera
			// só com o polling acima, sem bater numa rota que responde 501.
			realtime: { websocket: isDesktopAgentWebSocketEnabled() },
		},
		message: "Configuração carregada com sucesso.",
	};
}
export type TGetDesktopAgentConfigurationOutput = Awaited<ReturnType<typeof getDesktopAgentConfiguration>>;

async function getDesktopAgentConfigurationRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "desktop-agent:configuration:read");
	const result = await getDesktopAgentConfiguration({ actor });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getDesktopAgentConfigurationRoute });
