import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { DEFAULT_GATEWAY_ENABLED_EVENTS, deleteSession, generateSessionId, initSession } from "@/lib/whatsapp/internal-gateway";
import { db } from "@/services/drizzle";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { whatsappTemplates } from "@/services/drizzle/schema/whatsapp-templates";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= POST - Initialize Internal Gateway Connection =============

const initializeConnectionSchema = z.object({
	phoneName: z.string().min(1, "Nome do telefone é obrigatório"),
	phoneNumber: z.string().min(10, "Número de telefone inválido"),
});

export type TInitializeInternalGatewayInput = z.infer<typeof initializeConnectionSchema>;

async function initializeInternalGatewayConnection({
	session,
	input,
}: {
	session: TAuthUserSession;
	input: TInitializeInternalGatewayInput;
}) {
	const organizacaoId = session.membership?.organizacao.id;
	const userId = session.user?.id;

	if (!organizacaoId) {
		throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização para conectar o WhatsApp.");
	}

	if (!userId) {
		throw new createHttpError.Unauthorized("Usuário não autenticado.");
	}

	// Use a transaction to prevent race conditions
	return await db.transaction(async (tx) => {
		// Check if organization already has a connection
		const existingConnection = await tx.query.whatsappConnections.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizacaoId),
		});

		if (existingConnection) {
			throw new createHttpError.BadRequest("Sua organização já possui uma conexão WhatsApp ativa. Desconecte a conexão atual antes de criar uma nova.");
		}

		// Generate session ID
		const sessionId = generateSessionId(organizacaoId);

		// Initialize session with gateway
		const gatewayResponse = await initSession(sessionId, {
			enabledEvents: DEFAULT_GATEWAY_ENABLED_EVENTS,
		});

		// Create whatsappConnections record
		const [newConnection] = await tx
			.insert(whatsappConnections)
			.values({
				organizacaoId,
				tipoConexao: "INTERNAL_GATEWAY",
				gatewaySessaoId: sessionId,
				gatewayStatus: gatewayResponse.status,
				autorId: userId,
			})
			.returning({ id: whatsappConnections.id });

		// Create whatsappConnectionPhones record
		const [newPhone] = await tx
			.insert(whatsappConnectionPhones)
			.values({
				conexaoId: newConnection.id,
				nome: input.phoneName,
				numero: input.phoneNumber,
				// Meta fields left null for Internal Gateway
				whatsappBusinessAccountId: null,
				whatsappTelefoneId: null,
			})
			.returning({ id: whatsappConnectionPhones.id });

		return {
			data: {
				connectionId: newConnection.id,
				phoneId: newPhone.id,
				sessionId,
				qrCode: gatewayResponse.qrCode,
				status: gatewayResponse.status,
			},
			message: "Conexão iniciada. Escaneie o QR code com seu WhatsApp.",
		};
	});
}

export type TInitializeInternalGatewayOutput = Awaited<ReturnType<typeof initializeInternalGatewayConnection>>;

async function postHandler(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) {
		throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	}

	const body = await req.json();
	const input = initializeConnectionSchema.parse(body);

	const result = await initializeInternalGatewayConnection({ session, input });
	return NextResponse.json(result, { status: 201 });
}

// ============= DELETE - Remove Internal Gateway Connection =============

async function deleteInternalGatewayConnection({
	session,
	connectionId,
}: {
	session: TAuthUserSession;
	connectionId: string;
}) {
	const organizacaoId = session.membership?.organizacao.id;

	if (!organizacaoId) {
		throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização para desconectar o WhatsApp.");
	}

	// Get connection to verify ownership and get session ID
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, connectionId), eq(fields.organizacaoId, organizacaoId)),
	});

	if (!connection) {
		throw new createHttpError.NotFound("Conexão não encontrada.");
	}

	if (connection.tipoConexao !== "INTERNAL_GATEWAY") {
		throw new createHttpError.BadRequest("Esta conexão não é do tipo Gateway Interno.");
	}

	// Delete session from gateway
	if (connection.gatewaySessaoId) {
		try {
			await deleteSession(connection.gatewaySessaoId);
		} catch (error) {
			console.error("[INTERNAL_GATEWAY_DELETE] Error deleting session from gateway:", error);
			// Continue with database cleanup even if gateway delete fails
		}
	}

	// Delete connection from database (cascades to phones)
	await db.delete(whatsappConnections).where(and(eq(whatsappConnections.id, connectionId), eq(whatsappConnections.organizacaoId, organizacaoId)));

	// Also delete any templates for this organization
	await db.delete(whatsappTemplates).where(eq(whatsappTemplates.organizacaoId, organizacaoId));

	return {
		data: { deletedId: connectionId },
		message: "Conexão do Gateway Interno removida com sucesso.",
	};
}

export type TDeleteInternalGatewayOutput = Awaited<ReturnType<typeof deleteInternalGatewayConnection>>;

async function deleteHandler(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) {
		throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	}

	const connectionId = req.nextUrl.searchParams.get("id");
	if (!connectionId) {
		throw new createHttpError.BadRequest("ID da conexão não informado.");
	}

	const result = await deleteInternalGatewayConnection({ session, connectionId });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const POST = appApiHandler({
	POST: postHandler,
});

export const DELETE = appApiHandler({
	DELETE: deleteHandler,
});
