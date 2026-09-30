import { type TExternalActorContext, authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { appApiHandler } from "@/lib/app-api";
import { resolveDesktopAgentPollingCadence } from "@/lib/desktop-agent/polling";
import { isDesktopAgentWebSocketEnabled } from "@/lib/desktop-agent/websocket-channel";
import { db } from "@/services/drizzle";
import { accessPrincipals, agentPrinters, organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

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
			polling: resolveDesktopAgentPollingCadence(),
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
