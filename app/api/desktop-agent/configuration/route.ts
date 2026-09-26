import { type TExternalActorContext, authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { appApiHandler } from "@/lib/app-api";
import { db } from "@/services/drizzle";
import { accessPrincipals, agentPrinters, organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// Cadência sugerida ao agent. Com o canal WebSocket desligado por padrão (ver
// `app/api/desktop-agent/ws/route.ts`), este intervalo É a latência máxima entre a criação de um
// job e o claim, então fica curto. O claim é barato (mediana ~0 ms, ~10 ms de CPU) e a instância já
// está quente pelo resto do tráfego; 5 s por agent custa centavos por dia. O agent aceita 5–300 s e
// troca o timer em vigor na próxima leitura desta rota, sem release. `DESKTOP_AGENT_POLLING_SEGUNDOS`
// ajusta sem deploy.
const POLLING_INTERVALO_SEGUNDOS_PADRAO = 5;
const POLLING_INTERVALO_SEGUNDOS_MIN = 5;
const POLLING_INTERVALO_SEGUNDOS_MAX = 300;
const CLAIM_LIMITE_PADRAO = 5;

function resolvePollingIntervalSeconds() {
	const raw = Number(process.env.DESKTOP_AGENT_POLLING_SEGUNDOS);
	if (!Number.isInteger(raw)) return POLLING_INTERVALO_SEGUNDOS_PADRAO;
	return Math.min(POLLING_INTERVALO_SEGUNDOS_MAX, Math.max(POLLING_INTERVALO_SEGUNDOS_MIN, raw));
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
			polling: { intervaloSegundos: resolvePollingIntervalSeconds(), claimLimite: CLAIM_LIMITE_PADRAO },
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
