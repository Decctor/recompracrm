import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderHandoffHeaderPng } from "@/lib/chats/transfer-notification/render";
import { createMetaWhatsappTemplate, listMetaWhatsappTemplates } from "@/lib/message-templates/channels/whatsapp/meta-client";
import type { TMetaCreateTemplatePayload } from "@/lib/message-templates/channels/whatsapp/types";
import { uploadTemplateMediaToMeta } from "@/lib/whatsapp/media-upload";

const TEMPLATE_NAME = "service_transfer_notification_v2";
const OUTPUT_PATH = path.join(process.cwd(), "exports", "brand", `${TEMPLATE_NAME}.png`);

function requireEnvironmentVariable(name: "META_ACCESS_TOKEN" | "META_WHATSAPP_BUSINESS_ACCOUNT_ID" | "META_APP_ID") {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} não configurado no .env.`);
	return value;
}

async function renderSampleHeader() {
	return renderHandoffHeaderPng({
		organizationName: "Famoso Pão",
		clientName: "Lucas Fernandes",
		clientPhone: "+55 34 99662-6855",
		reason: "A política de pagamento não está documentada e precisa ser confirmada pela equipe.",
		transferredBy: null,
	});
}

function buildTemplatePayload(headerHandle: string): TMetaCreateTemplatePayload {
	return {
		name: TEMPLATE_NAME,
		category: "utility",
		language: "pt_BR",
		parameter_format: "named",
		components: [
			{ type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } },
			{
				type: "BODY",
				text: `Novo atendimento transferido pela IA.

Organização: {{organizacao_nome}}
Cliente: {{cliente_nome}}
Telefone: {{cliente_telefone}}

Detalhes:
{{atendimento_detalhes}}

Toque no número do cliente acima para conversar pelo WhatsApp.`,
				example: {
					body_text_named_params: [
						{ param_name: "organizacao_nome", example: "Famoso Pão" },
						{ param_name: "cliente_nome", example: "Lucas Fernandes" },
						{ param_name: "cliente_telefone", example: "+55 34 99662-6855" },
						{
							param_name: "atendimento_detalhes",
							example: "Motivo: política de pagamento não documentada. Resumo: cliente aguarda confirmação da equipe.",
						},
					],
				},
			},
		],
	};
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const headerPng = await renderSampleHeader();
	await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, headerPng);

	if (dryRun) {
		console.log(JSON.stringify({ image: OUTPUT_PATH, payload: buildTemplatePayload("<header_handle:pending>") }, null, 2));
		return;
	}

	const accessToken = requireEnvironmentVariable("META_ACCESS_TOKEN");
	const whatsappBusinessAccountId = requireEnvironmentVariable("META_WHATSAPP_BUSINESS_ACCOUNT_ID");
	const appId = requireEnvironmentVariable("META_APP_ID");
	const templates = await listMetaWhatsappTemplates({
		accessToken,
		whatsappBusinessAccountId,
		fields: ["id", "name", "status", "category", "language", "parameter_format", "components", "rejected_reason"],
	});
	const existing = templates.find((template) => template.name === TEMPLATE_NAME && template.language === "pt_BR");
	if (existing) {
		console.log(JSON.stringify({ created: false, template: existing }, null, 2));
		return;
	}

	const { headerHandle } = await uploadTemplateMediaToMeta({
		appId,
		accessToken,
		fileBuffer: headerPng,
		fileName: `${TEMPLATE_NAME}.png`,
		fileType: "image/png",
	});
	const template = await createMetaWhatsappTemplate({
		accessToken,
		whatsappBusinessAccountId,
		payload: buildTemplatePayload(headerHandle),
	});
	console.log(JSON.stringify({ created: true, template }, null, 2));
}

void main().catch((error) => {
	console.error("[CREATE_SERVICE_TRANSFER_TEMPLATE_V2_ERROR]", error instanceof Error ? error.message : error);
	process.exit(1);
});
