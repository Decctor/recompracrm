import { db } from "@/services/drizzle";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { resolveConnectionTestUpdate, type TConnectionTest } from "./channel-activation";

/**
 * Mensagem de teste da conexão. Depois de conectar, a loja manda um modelo de mensagem do próprio
 * número para o WhatsApp de quem conectou. A Meta cobra mensagem de modelo, então:
 *
 * - entregue → a conta do WhatsApp Business tem forma de pagamento (e o canal funciona);
 * - recusada com 131042 → falta a forma de pagamento, e a pessoa descobre isso ainda na
 *   configuração, não quando a primeira campanha travar.
 *
 * O modelo é criado na conta da Meta da loja (precisa ser dela: a mensagem sai do número dela) e
 * só pode ser usado depois de aprovado — de minutos a algumas horas. Ele não entra na lista de
 * modelos da organização: é infraestrutura, não conteúdo dela.
 */

const GRAPH = "https://graph.facebook.com/v23.0";
const LOG = "[WHATSAPP_CONNECTION_TEST]";
export const CONNECTION_TEST_TEMPLATE_NAME = "recompracrm_teste_conexao";
const CONNECTION_TEST_LANGUAGE = "pt_BR";
const CONNECTION_TEST_BODY =
	"✅ Teste de conexão do RecompraCRM.\n\nSe você recebeu esta mensagem, o WhatsApp da sua empresa já está pronto para enviar campanhas pela conexão oficial.";

type TMetaError = { code?: number; error_subcode?: number; message?: string; error_user_msg?: string };

async function loadMetaPhone({ organizationId, phoneId }: { organizationId: string; phoneId: string }) {
	const [phone] = await db
		.select({
			id: whatsappConnectionPhones.id,
			whatsappTelefoneId: whatsappConnectionPhones.whatsappTelefoneId,
			whatsappBusinessAccountId: whatsappConnectionPhones.whatsappBusinessAccountId,
			metadados: whatsappConnectionPhones.metadados,
			token: whatsappConnections.token,
			tipoConexao: whatsappConnections.tipoConexao,
		})
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConnectionPhones.conexaoId))
		.where(and(eq(whatsappConnectionPhones.id, phoneId), eq(whatsappConnections.organizacaoId, organizationId)))
		.limit(1);
	if (!phone) throw new createHttpError.NotFound("Número não encontrado nesta organização.");
	if (phone.tipoConexao !== "META_CLOUD_API" || !phone.token || !phone.whatsappTelefoneId || !phone.whatsappBusinessAccountId)
		throw new createHttpError.BadRequest("O teste de conexão só vale para o WhatsApp oficial da Meta.");
	return phone as typeof phone & { token: string; whatsappTelefoneId: string; whatsappBusinessAccountId: string };
}

async function saveConnectionTest(phoneId: string, test: TConnectionTest) {
	await db
		.update(whatsappConnectionPhones)
		.set({
			metadados: sql`jsonb_set(coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb), '{testeConexao}', ${JSON.stringify(test)}::jsonb, true)`,
		})
		.where(eq(whatsappConnectionPhones.id, phoneId));
	return test;
}

function statusFromMetaTemplate(status: string | undefined): TConnectionTest["status"] {
	if (status === "APPROVED") return "PRONTO";
	if (status === "REJECTED" || status === "DISABLED" || status === "PAUSED") return "MODELO_RECUSADO";
	return "AGUARDANDO_MODELO";
}

async function findTestTemplate(phone: { token: string; whatsappBusinessAccountId: string }) {
	const url = new URL(`${GRAPH}/${phone.whatsappBusinessAccountId}/message_templates`);
	url.searchParams.set("name", CONNECTION_TEST_TEMPLATE_NAME);
	url.searchParams.set("fields", "id,name,status,language");
	const body = (await (await fetch(url, { headers: { Authorization: `Bearer ${phone.token}` } })).json()) as {
		data?: Array<{ id: string; name: string; status: string; language: string }>;
		error?: TMetaError;
	};
	if (body.error) throw new Error(body.error.message ?? "Erro ao consultar o modelo de teste na Meta.");
	return body.data?.find((template) => template.name === CONNECTION_TEST_TEMPLATE_NAME && template.language === CONNECTION_TEST_LANGUAGE) ?? null;
}

/**
 * Cria o modelo de teste na conta da Meta do número (ou reaproveita o que já existe com o mesmo
 * nome) e grava o estado. Chamado depois de conectar; idempotente.
 */
export async function submitWhatsappConnectionTestTemplate({ organizationId, phoneId }: { organizationId: string; phoneId: string }) {
	const phone = await loadMetaPhone({ organizationId, phoneId });
	const current = phone.metadados?.testeConexao;
	if (current?.templateIdExterno && current.status !== "MODELO_RECUSADO") return current;

	const existing = await findTestTemplate(phone);
	if (existing) {
		return saveConnectionTest(phone.id, {
			status: statusFromMetaTemplate(existing.status),
			templateNome: CONNECTION_TEST_TEMPLATE_NAME,
			templateIdExterno: existing.id,
			atualizadoEm: new Date().toISOString(),
		});
	}

	const response = await fetch(`${GRAPH}/${phone.whatsappBusinessAccountId}/message_templates`, {
		method: "POST",
		headers: { Authorization: `Bearer ${phone.token}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			name: CONNECTION_TEST_TEMPLATE_NAME,
			language: CONNECTION_TEST_LANGUAGE,
			category: "UTILITY",
			components: [{ type: "BODY", text: CONNECTION_TEST_BODY }],
		}),
	});
	const created = (await response.json()) as { id?: string; status?: string; error?: TMetaError };
	if (created.error || !created.id) {
		console.error(`${LOG} Falha ao criar o modelo de teste do telefone ${phone.id}:`, created.error);
		throw new Error(created.error?.error_user_msg ?? created.error?.message ?? "A Meta não aceitou o modelo de teste.");
	}
	return saveConnectionTest(phone.id, {
		status: statusFromMetaTemplate(created.status),
		templateNome: CONNECTION_TEST_TEMPLATE_NAME,
		templateIdExterno: created.id,
		atualizadoEm: new Date().toISOString(),
	});
}

/** Consulta a aprovação do modelo de teste (a tela chama ao abrir, enquanto ele estiver em revisão). */
export async function refreshWhatsappConnectionTest({ organizationId, phoneId }: { organizationId: string; phoneId: string }) {
	const phone = await loadMetaPhone({ organizationId, phoneId });
	const current = phone.metadados?.testeConexao;
	if (!current?.templateIdExterno) return submitWhatsappConnectionTestTemplate({ organizationId, phoneId });
	if (current.status !== "AGUARDANDO_MODELO" && current.status !== "MODELO_RECUSADO") return current;
	const existing = await findTestTemplate(phone);
	const status = statusFromMetaTemplate(existing?.status);
	if (status === current.status) return current;
	return saveConnectionTest(phone.id, { ...current, status, atualizadoEm: new Date().toISOString() });
}

/** Normaliza o WhatsApp de destino para o formato da Meta (só dígitos, com 55 do Brasil). */
export function normalizeTestDestination(raw: string) {
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 10 || digits.length === 11) return `55${digits}`;
	if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
	return null;
}

/** Manda o modelo de teste do número da loja para `destino`. A entrega chega pelo webhook de status. */
export async function sendWhatsappConnectionTest({ organizationId, phoneId, destino }: { organizationId: string; phoneId: string; destino: string }) {
	const to = normalizeTestDestination(destino);
	if (!to) throw new createHttpError.BadRequest("Informe um WhatsApp com DDD para receber o teste.");
	const phone = await loadMetaPhone({ organizationId, phoneId });
	let current = phone.metadados?.testeConexao;
	if (current?.status === "AGUARDANDO_MODELO" || current?.status === "MODELO_RECUSADO" || !current)
		current = await refreshWhatsappConnectionTest({ organizationId, phoneId });
	if (!current || current.status === "AGUARDANDO_MODELO")
		throw new createHttpError.Conflict("O modelo de teste ainda está em revisão na Meta. Tente de novo em alguns minutos.");
	if (current.status === "MODELO_RECUSADO")
		throw new createHttpError.Conflict("A Meta recusou o modelo de teste. A primeira campanha entregue confirma o canal.");

	const response = await fetch(`${GRAPH}/${phone.whatsappTelefoneId}/messages`, {
		method: "POST",
		headers: { Authorization: `Bearer ${phone.token}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			messaging_product: "whatsapp",
			to,
			type: "template",
			template: { name: CONNECTION_TEST_TEMPLATE_NAME, language: { code: CONNECTION_TEST_LANGUAGE } },
		}),
	});
	const body = (await response.json()) as { messages?: Array<{ id: string }>; error?: TMetaError };
	const now = new Date().toISOString();
	const destinoExibicao = `+${to}`;
	if (body.error || !body.messages?.[0]?.id) {
		const code = body.error?.code ?? null;
		console.error(`${LOG} Envio do teste recusado para o telefone ${phone.id}:`, body.error);
		return saveConnectionTest(phone.id, {
			...current,
			status: code === 131042 ? "RECUSADO_PAGAMENTO" : "FALHOU",
			destino: destinoExibicao,
			mensagemId: null,
			erroCodigo: code,
			erroMensagem: body.error?.error_user_msg ?? body.error?.message ?? null,
			atualizadoEm: now,
		});
	}
	return saveConnectionTest(phone.id, {
		...current,
		status: "ENVIADO",
		destino: destinoExibicao,
		mensagemId: body.messages[0].id,
		erroCodigo: null,
		erroMensagem: null,
		atualizadoEm: now,
	});
}

/**
 * Webhook de status: se a mensagem é o teste de conexão de algum número, avança o estado dele.
 * O pagamento em si já é observado por `observeWhatsappPayment` (entregue → VERIFICADO, 131042 →
 * PENDENTE); aqui é só o estado do teste que a tela mostra.
 */
export async function observeWhatsappConnectionTest({
	whatsappPhoneNumberId,
	whatsappMessageId,
	status,
	errors,
}: {
	whatsappPhoneNumberId?: string;
	whatsappMessageId?: string;
	status: string;
	errors?: Array<{ code?: number; title?: string; message?: string }>;
}) {
	if (!whatsappPhoneNumberId || !whatsappMessageId) return;
	const phone = await db.query.whatsappConnectionPhones.findFirst({
		where: and(
			eq(whatsappConnectionPhones.whatsappTelefoneId, whatsappPhoneNumberId),
			sql`${whatsappConnectionPhones.metadados}->'testeConexao'->>'mensagemId' = ${whatsappMessageId}`,
		),
		columns: { id: true, metadados: true },
	});
	const current = phone?.metadados?.testeConexao;
	if (!phone || !current) return;
	const next = resolveConnectionTestUpdate({ current: current.status, status, errors });
	if (!next) return;
	await saveConnectionTest(phone.id, { ...current, ...next, atualizadoEm: new Date().toISOString() });
}
