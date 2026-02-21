import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getSessionStatus } from "@/lib/whatsapp/internal-gateway";
import { db } from "@/services/drizzle";
import { campaigns } from "@/services/drizzle/schema/campaigns";
import { whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { and, eq, isNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// ============= GET - Poll Internal Gateway Connection Status =============

async function getConnectionStatus({
	session,
	connectionId,
}: {
	session: TAuthUserSession;
	connectionId: string;
}) {
	console.log("[INFO] [GET CONNECTION STATUS] Getting connection status for connection ID:", connectionId);
	const organizacaoId = session.membership?.organizacao.id;

	if (!organizacaoId) {
		throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	}

	// Get connection from database
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, connectionId), eq(fields.organizacaoId, organizacaoId)),
	});

	if (!connection) {
		throw new createHttpError.NotFound("Conexão não encontrada.");
	}

	if (connection.tipoConexao !== "INTERNAL_GATEWAY") {
		throw new createHttpError.BadRequest("Esta conexão não é do tipo Gateway Interno.");
	}

	if (!connection.gatewaySessaoId) {
		throw new createHttpError.BadRequest("Session ID não encontrado para esta conexão.");
	}

	// Get status from gateway
	const gatewayStatus = await getSessionStatus(connection.gatewaySessaoId);

	// Update database if status changed
	if (gatewayStatus.status !== connection.gatewayStatus) {
		const updateData: {
			gatewayStatus: string;
			gatewayUltimaConexao?: Date;
		} = {
			gatewayStatus: gatewayStatus.status,
		};

		// Set last connected timestamp when status becomes connected
		if (gatewayStatus.status === "connected" && connection.gatewayStatus !== "connected") {
			updateData.gatewayUltimaConexao = new Date();
		}

		await db.update(whatsappConnections).set(updateData).where(eq(whatsappConnections.id, connectionId));
	}

	// When connection becomes effective, auto-fill default campaigns without phone.
	if (gatewayStatus.status === "connected") {
		const firstConnectionPhone = await db.query.whatsappConnectionPhones.findFirst({
			where: (fields, { eq }) => eq(fields.conexaoId, connectionId),
			columns: {
				id: true,
			},
		});

		if (firstConnectionPhone?.id) {
			await db
				.update(campaigns)
				.set({
					whatsappConexaoTelefoneId: firstConnectionPhone.id,
				})
				.where(and(eq(campaigns.organizacaoId, organizacaoId), isNull(campaigns.whatsappConexaoTelefoneId)));
		}
	}

	return {
		data: {
			connectionId,
			status: gatewayStatus.status,
			qrCode: gatewayStatus.qrCode,
			phoneNumber: gatewayStatus.phoneNumber,
			connectedAt: gatewayStatus.connectedAt || connection.gatewayUltimaConexao?.toISOString(),
		},
		message: "Status obtido com sucesso.",
	};
}

export type TGetInternalGatewayStatusOutput = Awaited<ReturnType<typeof getConnectionStatus>>;

type RouteContext = {
	params: Promise<{ connectionId: string }>;
};

async function getHandler(req: NextRequest, context: RouteContext) {
	const session = await getCurrentSessionUncached();
	if (!session) {
		throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	}

	const { connectionId } = await context.params;
	if (!connectionId) {
		throw new createHttpError.BadRequest("ID da conexão não informado.");
	}

	const result = await getConnectionStatus({ session, connectionId });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

// Extract connectionId from URL: /api/whatsapp-connections/internal-gateway/[connectionId]/status
function extractConnectionId(pathname: string): string {
	const parts = pathname.split("/");
	// URL format: /api/whatsapp-connections/internal-gateway/{connectionId}/status
	// parts = ['', 'api', 'whatsapp-connections', 'internal-gateway', '{connectionId}', 'status']
	return parts[parts.length - 2];
}

export const GET = appApiHandler({
	GET: (req: NextRequest) => getHandler(req, { params: Promise.resolve({ connectionId: extractConnectionId(req.nextUrl.pathname) }) }),
});
