import { type TExternalActorContext, authenticateExternalRequest } from "@/lib/access/authentication";
import { appApiHandler } from "@/lib/app-api";
import { getDesktopAgentInstallerUrl } from "@/lib/files-storage/desktop-agent";
import { db } from "@/services/drizzle";
import { accessPrincipals, agentVersions } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type THeartbeatParams = {
	actor: TExternalActorContext;
	versaoApp: string | null;
	plataforma: string | null;
};
// Qualquer principal autenticado pode reportar heartbeat — não exige scope específico.
async function registerHeartbeat({ actor, versaoApp, plataforma }: THeartbeatParams) {
	const principal = await db.query.accessPrincipals.findFirst({
		where: eq(accessPrincipals.id, actor.principalId),
		columns: { id: true, nome: true, status: true, metadados: true },
	});

	const now = new Date();
	await db
		.update(accessPrincipals)
		.set({
			ultimoAcesso: now,
			dataAtualizacao: now,
			metadados: {
				...principal?.metadados,
				...(versaoApp ? { versaoApp } : {}),
				...(plataforma ? { plataforma } : {}),
			},
		})
		.where(eq(accessPrincipals.id, actor.principalId));

	const publishedVersion = actor.scopes.has("desktop-agent:configuration:read")
		? await db.query.agentVersions.findFirst({
				where: eq(agentVersions.publicada, true),
				columns: { versao: true, sha256: true, tamanhoBytes: true, storagePath: true },
			})
		: null;

	return {
		data: {
			principalId: actor.principalId,
			nome: principal?.nome ?? null,
			organizacaoId: actor.organizationId,
			clientCode: actor.clientCode,
			scopes: Array.from(actor.scopes),
			dataContato: now,
			atualizacao: publishedVersion
				? {
						versao: publishedVersion.versao,
						sha256: publishedVersion.sha256,
						tamanhoBytes: publishedVersion.tamanhoBytes,
						downloadUrl: getDesktopAgentInstallerUrl(publishedVersion.storagePath),
					}
				: null,
		},
		message: "Contato registrado com sucesso.",
	};
}
export type THeartbeatOutput = Awaited<ReturnType<typeof registerHeartbeat>>;

async function heartbeatRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	const result = await registerHeartbeat({
		actor,
		versaoApp: request.headers.get("x-poi-device-version"),
		plataforma: request.headers.get("x-poi-platform"),
	});
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: heartbeatRoute });
