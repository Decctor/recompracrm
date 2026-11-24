import { appRoutes } from "@/lib/navigation/routes";
import { db } from "@/services/drizzle";
import { organizationMembers, users } from "@/services/drizzle/schema";
import { type TWhatsappPhoneDisconnection, whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { resend } from "@/services/resend";
import dayjs from "dayjs";
import { and, eq, sql } from "drizzle-orm";
import { mapMetaPhoneFields, META_PHONE_STATE_FIELDS } from "./channel-activation";
import {
	classifyWhatsappPhoneHealth,
	pickWhatsappDisconnection,
	resolveNextWhatsappPhoneHealth,
	type TWhatsappAccountHealthEvent,
	type TWhatsappPhoneHealthCheck,
} from "./connection-health-policy";

/**
 * Saúde das conexões Meta Cloud API: uma GET no telefone com o token da conexão diz se o app
 * ainda alcança o número. O resultado fica em `metadados.saude` do telefone e, na transição
 * para falha, os membros com `empresa.editar` recebem e-mail para reconectar.
 *
 * Existe porque a perda de acesso é silenciosa: token revogado, WABA excluído ou número
 * migrado para outro WABA (coexistência reonboardada) só apareciam quando o cliente tentava
 * enviar template ou campanha. Dois gatilhos: o cron `whatsapp-connections-health` (varredura)
 * e os webhooks `account_update`/`phone_number_quality_update` (checagem imediata dos
 * telefones do WABA).
 */

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v23.0";
const LOG = "[WHATSAPP_CONNECTION_HEALTH]";

type THealthCheckPhone = {
	id: string;
	nome: string;
	numero: string;
	whatsappTelefoneId: string | null;
	organizacaoId: string;
	token: string | null;
};

type TFailedPhone = Pick<THealthCheckPhone, "nome" | "numero"> & { mensagem: string; falhandoDesde: string };

async function listMetaWhatsappPhones({ whatsappBusinessAccountId }: { whatsappBusinessAccountId?: string }): Promise<THealthCheckPhone[]> {
	return db
		.select({
			id: whatsappConnectionPhones.id,
			nome: whatsappConnectionPhones.nome,
			numero: whatsappConnectionPhones.numero,
			whatsappTelefoneId: whatsappConnectionPhones.whatsappTelefoneId,
			organizacaoId: whatsappConnections.organizacaoId,
			token: whatsappConnections.token,
		})
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConnectionPhones.conexaoId))
		.where(
			and(
				eq(whatsappConnections.tipoConexao, "META_CLOUD_API"),
				whatsappBusinessAccountId ? eq(whatsappConnectionPhones.whatsappBusinessAccountId, whatsappBusinessAccountId) : undefined,
			),
		);
}

async function fetchWhatsappPhoneHealth(phone: THealthCheckPhone): Promise<TWhatsappPhoneHealthCheck> {
	if (!phone.token || !phone.whatsappTelefoneId) {
		return { status: "FALHA", motivo: "CREDENCIAIS_AUSENTES", mensagem: "A conexão não tem token ou identificador do número na Meta." };
	}
	try {
		const response = await fetch(`${GRAPH_API_BASE_URL}/${phone.whatsappTelefoneId}?fields=status`, {
			headers: { Authorization: `Bearer ${phone.token}` },
			signal: AbortSignal.timeout(15_000),
		});
		if (response.status >= 500) return { status: "INDETERMINADO", mensagem: `Meta respondeu HTTP ${response.status}.` };
		const body = (await response.json()) as {
			status?: string;
			error?: { code?: number; error_subcode?: number; message?: string; is_transient?: boolean };
		};
		return classifyWhatsappPhoneHealth({ phone: body, error: body.error ?? null });
	} catch (error) {
		return { status: "INDETERMINADO", mensagem: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Nome de exibição, qualidade e limite de envio, para os passos do canal. Pedido à parte e sem
 * lançar: `name_status` é beta, e um campo que a Meta recuse derrubaria o GET de `status` inteiro —
 * a checagem de saúde viraria falha e mandaria a loja reconectar um número que funciona.
 */
async function refreshWhatsappPhoneMetaState(phone: THealthCheckPhone) {
	if (!phone.token || !phone.whatsappTelefoneId) return;
	try {
		const response = await fetch(`${GRAPH_API_BASE_URL}/${phone.whatsappTelefoneId}?fields=${META_PHONE_STATE_FIELDS}`, {
			headers: { Authorization: `Bearer ${phone.token}` },
			signal: AbortSignal.timeout(15_000),
		});
		const body = (await response.json()) as Parameters<typeof mapMetaPhoneFields>[0] & { error?: { message?: string } };
		if (!response.ok || body.error) {
			console.warn(`${LOG} Campos da Meta indisponíveis para o telefone ${phone.id}:`, body.error?.message ?? response.status);
			return;
		}
		const meta = mapMetaPhoneFields(body, new Date());
		await db
			.update(whatsappConnectionPhones)
			.set({ metadados: sql`jsonb_set(coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb), '{meta}', ${JSON.stringify(meta)}::jsonb, true)` })
			.where(eq(whatsappConnectionPhones.id, phone.id));
	} catch (error) {
		console.warn(`${LOG} Falha ao ler os campos da Meta do telefone ${phone.id}:`, error instanceof Error ? error.message : error);
	}
}

/**
 * Grava o próximo estado sob lock da linha do telefone: cron e webhook podem checar o mesmo
 * número ao mesmo tempo, e o lock garante que só um deles reivindica o aviso por e-mail.
 * Mescla apenas a chave `saude` para não sobrescrever pagamento/sincronização gravados em paralelo.
 */
async function recordWhatsappPhoneHealth({ phoneId, check }: { phoneId: string; check: TWhatsappPhoneHealthCheck }) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select({ metadados: whatsappConnectionPhones.metadados })
			.from(whatsappConnectionPhones)
			.where(eq(whatsappConnectionPhones.id, phoneId))
			.for("update");
		if (!row) return null;

		const next = resolveNextWhatsappPhoneHealth({
			current: row.metadados?.saude,
			check,
			now: new Date(),
			desconexao: row.metadados?.desconexao,
		});
		if (!next) return null;

		await tx
			.update(whatsappConnectionPhones)
			.set({
				metadados: sql`coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb) || jsonb_build_object('saude', ${JSON.stringify(next.saude)}::jsonb)`,
			})
			.where(eq(whatsappConnectionPhones.id, phoneId));
		return next;
	});
}

async function listOrganizationEditorEmails(organizationId: string): Promise<string[]> {
	const rows = await db
		.select({ email: users.email, permissoes: organizationMembers.permissoes })
		.from(organizationMembers)
		.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
		.where(eq(organizationMembers.organizacaoId, organizationId));
	return [...new Set(rows.filter((row) => row.permissoes?.empresa?.editar && row.email).map((row) => row.email as string))];
}

function getAppBaseUrl() {
	return process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recompracrm.com.br";
}

/** Nunca lança: falhar em avisar não pode derrubar a varredura nem o webhook. */
async function notifyWhatsappConnectionHealthFailure({ organizationId, phones }: { organizationId: string; phones: TFailedPhone[] }) {
	try {
		const recipients = await listOrganizationEditorEmails(organizationId);
		if (recipients.length === 0) {
			console.warn(`${LOG} Organização ${organizationId} sem membros com empresa.editar e e-mail; aviso não enviado.`);
			return false;
		}

		const connectionUrl = `${getAppBaseUrl()}${appRoutes.settings()}?view=meta-oauth`;
		const lines = [
			phones.length === 1
				? "O RecompraCRM perdeu o acesso a um número de WhatsApp da sua empresa na Meta."
				: `O RecompraCRM perdeu o acesso a ${phones.length} números de WhatsApp da sua empresa na Meta.`,
			"Enquanto isso não for resolvido, campanhas, automações e templates não são enviados por esse número.",
			"",
			...phones.flatMap((phone) => [
				`- ${phone.nome} (${phone.numero})`,
				`  ${phone.mensagem}`,
				`  Falhando desde ${dayjs(phone.falhandoDesde).format("DD/MM/YYYY HH:mm")}.`,
			]),
			"",
			"Para resolver, reconecte o WhatsApp concedendo todas as permissões solicitadas e selecionando o número:",
			connectionUrl,
			"",
			"Se o número usa o app WhatsApp Business junto com a API (coexistência), mantenha o app em uso no celular:",
			"a Meta desconecta a integração quando o app fica muito tempo sem ser aberto.",
		];

		const { error } = await resend.emails.send({
			from: "RecompraCRM <noreply@recompracrm.com.br>",
			to: recipients,
			subject: "[RecompraCRM] Ação necessária: reconecte seu WhatsApp",
			text: lines.join("\n"),
		});
		if (error) {
			console.error(`${LOG} Falha ao enviar o aviso para a organização ${organizationId}:`, error);
			return false;
		}
		return true;
	} catch (error) {
		console.error(`${LOG} Erro inesperado ao avisar a organização ${organizationId}:`, error);
		return false;
	}
}

/**
 * Checa, grava e avisa. Sem filtro, varre todos os telefones Meta Cloud API; com
 * `whatsappBusinessAccountId`, só os daquele WABA (gatilho do webhook). Falhas por telefone
 * não interrompem a varredura — voltam contadas em `erros` para o chamador decidir.
 */
export async function runWhatsappConnectionsHealthCheck({ whatsappBusinessAccountId }: { whatsappBusinessAccountId?: string } = {}) {
	const phones = await listMetaWhatsappPhones({ whatsappBusinessAccountId });
	const toNotify = new Map<string, TFailedPhone[]>();
	const summary = {
		verificados: 0,
		saudaveis: 0,
		falhas: 0,
		indeterminados: 0,
		organizacoesNotificadas: 0,
		erros: [] as Array<{ telefoneId: string; erro: string }>,
	};

	for (const phone of phones) {
		try {
			const check = await fetchWhatsappPhoneHealth(phone);
			summary.verificados += 1;
			if (check.status === "SAUDAVEL") summary.saudaveis += 1;
			else if (check.status === "FALHA") summary.falhas += 1;
			else {
				summary.indeterminados += 1;
				console.warn(`${LOG} Checagem indeterminada para o telefone ${phone.id}:`, check.mensagem);
			}

			const next = await recordWhatsappPhoneHealth({ phoneId: phone.id, check });
			if (check.status === "SAUDAVEL") await refreshWhatsappPhoneMetaState(phone);
			if (next?.notify && next.saude.mensagem && next.saude.falhandoDesde) {
				const failed = toNotify.get(phone.organizacaoId) ?? [];
				failed.push({ nome: phone.nome, numero: phone.numero, mensagem: next.saude.mensagem, falhandoDesde: next.saude.falhandoDesde });
				toNotify.set(phone.organizacaoId, failed);
			}
		} catch (error) {
			summary.erros.push({ telefoneId: phone.id, erro: error instanceof Error ? error.message : String(error) });
			console.error(`${LOG} Falha ao checar o telefone ${phone.id}:`, error);
		}
	}

	for (const [organizationId, failedPhones] of toNotify) {
		if (await notifyWhatsappConnectionHealthFailure({ organizationId, phones: failedPhones })) summary.organizacoesNotificadas += 1;
	}

	return summary;
}

/**
 * Guarda o motivo do PARTNER_REMOVED nos telefones do WABA antes da checagem: é dele que sai a
 * mensagem da falha (e do e-mail), e ele precisa sobreviver às checagens seguintes do cron.
 */
async function recordWhatsappDisconnection({
	whatsappBusinessAccountId,
	desconexao,
}: {
	whatsappBusinessAccountId: string;
	desconexao: TWhatsappPhoneDisconnection;
}) {
	await db
		.update(whatsappConnectionPhones)
		.set({
			metadados: sql`coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb) || jsonb_build_object('desconexao', ${JSON.stringify(desconexao)}::jsonb)`,
		})
		.where(eq(whatsappConnectionPhones.whatsappBusinessAccountId, whatsappBusinessAccountId));
}

/** Processador dos webhooks de conta/número: lança se alguma checagem falhou, para o inbox registrar FALHOU. */
export async function handleWhatsappAccountHealthEvents(events: TWhatsappAccountHealthEvent[]) {
	const accountIds = [...new Set(events.map((event) => event.whatsappBusinessAccountId))];
	for (const whatsappBusinessAccountId of accountIds) {
		const accountEvents = events.filter((event) => event.whatsappBusinessAccountId === whatsappBusinessAccountId);
		console.log(`${LOG} Evento de conta recebido:`, {
			whatsappBusinessAccountId,
			eventos: accountEvents.map((event) =>
				[event.campo, event.evento ?? "?", event.motivoDesconexao, event.desconexaoIniciadaPor].filter(Boolean).join(":"),
			),
		});
		const desconexao = pickWhatsappDisconnection(accountEvents, new Date());
		if (desconexao) await recordWhatsappDisconnection({ whatsappBusinessAccountId, desconexao });
		const summary = await runWhatsappConnectionsHealthCheck({ whatsappBusinessAccountId });
		if (summary.erros.length > 0) {
			throw new Error(`Checagem de saúde falhou para ${summary.erros.length} telefone(s) do WABA ${whatsappBusinessAccountId}.`);
		}
	}
}

/** Org dona do WABA, quando única — backfill de `organizacaoId` no inbox para eventos sem phone_number_id. */
export async function resolveOrganizationIdByWhatsappBusinessAccountId(whatsappBusinessAccountId: string): Promise<string | null> {
	const rows = await db
		.selectDistinct({ organizacaoId: whatsappConnections.organizacaoId })
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConnectionPhones.conexaoId))
		.where(eq(whatsappConnectionPhones.whatsappBusinessAccountId, whatsappBusinessAccountId));
	return rows.length === 1 ? rows[0].organizacaoId : null;
}
