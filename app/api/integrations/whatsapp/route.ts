import { appApiHandler } from "@/lib/app-api";
import { archiveExternalEvent, runArchivedEventProcessing } from "@/lib/external-events/archive";
import {
	classifyMetaWebhookBody,
	processMetaWebhookBody,
	resolveMetaWebhookOrganizationId,
	type TMetaWebhookBody,
} from "@/lib/whatsapp/webhook-processing";
import { verifyMetaWebhookSignature } from "@/lib/whatsapp/webhook-signature";
import { waitUntil } from "@vercel/functions";
import { NextRequest, NextResponse } from "next/server";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

async function getWhatsappWebhookRoute(req: NextRequest) {
	// Webhook verification (GET request)
	const searchParams = req.nextUrl.searchParams;
	console.log("[INFO] [WHATSAPP_WEBHOOK] [VERIFY] Query received:", Object.fromEntries(searchParams));
	const mode = searchParams.get("hub.mode");
	const token = searchParams.get("hub.verify_token");
	const challenge = searchParams.get("hub.challenge");

	if (mode && token) {
		if (mode === "subscribe" && token === VERIFY_TOKEN) {
			console.log("WEBHOOK_VERIFIED");
			return new NextResponse(challenge, { status: 200 });
		}
		console.log("WEBHOOK_VERIFICATION_FAILED");
		return NextResponse.json({ error: "Verification failed" }, { status: 403 });
	}

	return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
}

async function postWhatsappWebhookRoute(req: NextRequest) {
	// Verificação sobre o corpo CRU, antes de qualquer parse: a Meta assina os bytes exatos
	// do POST. O verify token do GET autentica só o handshake de subscrição, não deliveries.
	const rawBody = await req.text();
	if (!verifyMetaWebhookSignature({ rawBody, signatureHeader: req.headers.get("x-hub-signature-256") })) {
		console.warn("[WHATSAPP_WEBHOOK] [POST] Assinatura x-hub-signature-256 ausente ou inválida — request rejeitado.");
		return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
	}
	const body = JSON.parse(rawBody) as TMetaWebhookBody;

	if (body.object !== "whatsapp_business_account") {
		console.warn("[WHATSAPP_WEBHOOK] [POST] Objeto não suportado:", body.object);
		return NextResponse.json({ error: "Event not supported" }, { status: 404 });
	}

	// Inbox durável: payload arquivado APÓS a autenticação e ANTES do processamento. Falha
	// no arquivamento propaga (500 via appApiHandler) e a Meta reentrega — melhor retry do
	// provider do que payload perdido com 200 devolvido.
	const tipo = classifyMetaWebhookBody(body);
	const archived = await archiveExternalEvent({
		origem: "META-WHATSAPP",
		tipo,
		payload: body,
	});

	// O payload inteiro já está no inbox (`archived.id`). Imprimi-lo formatado em toda entrega —
	// dezenas de milhares por semana, históricos de mensagens inclusos — custava CPU e pico de
	// memória só para duplicar o que o inbox guarda.
	console.log("[INFO] [WHATSAPP_WEBHOOK] [POST] Webhook recebido:", { eventId: archived.id, tipo, bytes: rawBody.length });

	// A Meta reentrega quando o 200 demora — e o processamento inclui debounce e run de
	// LLM. Todo o trabalho sai da request; desfecho (status/erro/organização) fica na linha
	// do inbox, e as reentregas residuais são inócuas graças ao índice de wamid (0057).
	waitUntil(
		runArchivedEventProcessing({
			eventId: archived.id,
			run: () => processMetaWebhookBody(body),
			resolveOrganizationId: () => resolveMetaWebhookOrganizationId(body),
		}),
	);
	return NextResponse.json({ success: true }, { status: 200 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = appApiHandler({
	GET: getWhatsappWebhookRoute,
});

export const POST = appApiHandler({
	POST: postWhatsappWebhookRoute,
});
