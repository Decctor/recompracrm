import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { notifyControlWhatsappConnectFailure } from "@/lib/control/notices";
import {
	applyWhatsappSubmissionResultToMetadata,
	buildWhatsappSubmissionPhoneMetadata,
	submitMessageTemplateToWhatsappPhone,
} from "@/lib/message-templates";
import { getOrganizationWhatsappPhones } from "@/lib/whatsapp/organization-phones";
import { lockConnectedWhatsappPhone, mergeMessageTemplatePhoneMetadataSql } from "@/lib/db-utils";
import { consumeOAuthRedirect } from "@/lib/integrations/oauth-redirect";
import { reconcileOnboardingCampaigns } from "@/lib/onboarding/reconcile";
import { buildWhatsappPhoneSyncMetadataPatch } from "@/lib/whatsapp/connection-phone-metadata";
import { runWhatsappConnectionsHealthCheck } from "@/lib/whatsapp/connection-health";
import { submitWhatsappConnectionTestTemplate } from "@/lib/whatsapp/connection-test";
import {
	buildWhatsappConnectReturnPath,
	classifyMetaCallbackError,
	planWhatsappConnectionUpsert,
	type TWhatsappConnectErrorCode,
	type TWhatsappConnectSuccess,
} from "@/lib/whatsapp/meta-connect";
import { triggerSmbAppContactsSync } from "@/lib/whatsapp/smb-contacts-sync";
import { db } from "@/services/drizzle";
import { messageTemplates, whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema";
import { campaigns } from "@/services/drizzle/schema/campaigns";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import dayjs from "dayjs";
import { after } from "next/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { WHATSAPP_OAUTH_REDIRECT_COOKIE_NAME, WHATSAPP_OAUTH_STATE_COOKIE_NAME } from "../route";

const GRAPH = "https://graph.facebook.com/v21.0";
const LOG = "[WHATSAPP_CONNECT_CALLBACK]";
const DEFAULT_RETURN = "/dashboard/settings?view=meta-oauth";

type TMetaPhone = { nome: string; whatsappBusinessAccountId: string; whatsappTelefoneId: string; numero: string };

/**
 * Volta do fluxo da Meta. Toda saída é um redirect para a tela de onde a pessoa veio (onboarding ou
 * configurações) com o resultado na URL (`lib/whatsapp/meta-connect.ts`) — nunca um JSON cru.
 */
async function getWhatsappAuthCallbackRoute(req: NextRequest) {
	const cookieStore = await cookies();
	const returnPath = consumeOAuthRedirect(cookieStore, WHATSAPP_OAUTH_REDIRECT_COOKIE_NAME, DEFAULT_RETURN);
	const expectedState = cookieStore.get(WHATSAPP_OAUTH_STATE_COOKIE_NAME)?.value ?? null;
	cookieStore.delete(WHATSAPP_OAUTH_STATE_COOKIE_NAME);
	const appUrl = process.env.NEXT_PUBLIC_APP_URL;
	const back = (outcome: { erro: TWhatsappConnectErrorCode } | { sucesso: TWhatsappConnectSuccess; numeros: number }) =>
		NextResponse.redirect(new URL(buildWhatsappConnectReturnPath(returnPath, outcome), appUrl));

	const sessionUser = await getCurrentSessionUncached();
	const organizationId = sessionUser?.membership?.organizacao.id ?? null;
	if (!sessionUser || !organizationId) return back({ erro: "sessao" });

	// Falha que vale um empurrão do time (Control): a pessoa tentou e não conseguiu. Nunca lança.
	const fail = (erro: TWhatsappConnectErrorCode, detail?: unknown) => {
		if (detail) console.error(`${LOG} ${erro}:`, detail);
		after(() => notifyControlWhatsappConnectFailure({ organizationId, codigo: erro }));
		return back({ erro });
	};

	const searchParams = req.nextUrl.searchParams;
	const metaError = classifyMetaCallbackError(searchParams);
	if (metaError) return fail(metaError, searchParams.get("error_description"));

	const code = searchParams.get("code");
	if (!code) return fail("meta", "Volta da Meta sem code.");
	const state = searchParams.get("state");
	if (!expectedState || state !== expectedState) return back({ erro: "expirado" });

	const appId = process.env.NEXT_PUBLIC_META_APP_ID as string;
	const appSecret = process.env.META_APP_SECRET as string;
	const redirectUri = `${appUrl}/api/integrations/whatsapp/auth/callback`;

	// 1. Código → token.
	let accessToken: string;
	let accessTokenExpiresAt: Date;
	try {
		const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
		tokenUrl.searchParams.set("client_id", appId);
		tokenUrl.searchParams.set("redirect_uri", redirectUri);
		tokenUrl.searchParams.set("client_secret", appSecret);
		tokenUrl.searchParams.set("code", code);
		const data = (await (await fetch(tokenUrl.toString())).json()) as { access_token?: string; expires_in?: number; error?: unknown };
		if (data.error || !data.access_token) return fail("meta", data.error ?? "Resposta sem access_token.");
		accessToken = data.access_token;
		// Sem `expires_in`, o padrão da Meta para token de longa duração: 60 dias.
		accessTokenExpiresAt = dayjs()
			.add(data.expires_in ?? 60 * 24 * 3600, "seconds")
			.toDate();
	} catch (error) {
		return fail("meta", error);
	}

	// 2. Contas (WABA) que a autorização liberou para mensagens.
	const debugData = (await (
		await fetch(`https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`)
	).json()) as {
		data?: { scopes?: string[]; granular_scopes?: Array<{ scope: string; target_ids?: string[] }> };
	};
	const accountIds = debugData.data?.granular_scopes?.find((scope) => scope.scope === "whatsapp_business_messaging")?.target_ids ?? [];
	if (accountIds.length === 0) return fail("sem-permissao", debugData);

	// 3. Inscreve o app em cada conta e lista os números Cloud API.
	const phones: TMetaPhone[] = (
		await Promise.all(
			accountIds.map(async (whatsappBusinessAccountId) => {
				try {
					const subscribe = (await (
						await fetch(`${GRAPH}/${whatsappBusinessAccountId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } })
					).json()) as { success?: boolean };
					if (!subscribe.success) console.error(`${LOG} Falha ao inscrever o app no WABA ${whatsappBusinessAccountId}:`, subscribe);
				} catch (error) {
					console.error(`${LOG} Erro ao inscrever o app no WABA ${whatsappBusinessAccountId}:`, error);
				}
				const list = (await (await fetch(`${GRAPH}/${whatsappBusinessAccountId}/phone_numbers?access_token=${accessToken}`)).json()) as {
					data?: Array<{ id: string; verified_name?: string | null; display_phone_number: string; platform_type: string }>;
				};
				return (list.data ?? [])
					.filter((phone) => phone.platform_type === "CLOUD_API")
					.map((phone) => ({
						nome: phone.verified_name?.trim() || phone.display_phone_number,
						whatsappBusinessAccountId,
						whatsappTelefoneId: phone.id,
						numero: phone.display_phone_number,
					}));
			}),
		)
	).flat();
	if (phones.length === 0) return fail("sem-numero");

	// 4. Grava: reconectar renova a conexão que já tem esses números (sem duplicar telefones).
	const onboardingAt = new Date();
	const existing = await db
		.select({
			conexaoId: whatsappConnectionPhones.conexaoId,
			telefoneId: whatsappConnectionPhones.id,
			whatsappTelefoneId: whatsappConnectionPhones.whatsappTelefoneId,
		})
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConnectionPhones.conexaoId))
		.where(
			and(
				eq(whatsappConnections.organizacaoId, organizationId),
				eq(whatsappConnections.tipoConexao, "META_CLOUD_API"),
				inArray(
					whatsappConnectionPhones.whatsappTelefoneId,
					phones.map((phone) => phone.whatsappTelefoneId),
				),
			),
		);
	const plan = planWhatsappConnectionUpsert({
		existing: existing.flatMap((row) => (row.whatsappTelefoneId ? [{ ...row, whatsappTelefoneId: row.whatsappTelefoneId }] : [])),
		incoming: phones,
	});

	const insertedPhones = await db.transaction(async (tx) => {
		const connectionValues = { token: accessToken, dataExpiracao: accessTokenExpiresAt, metaEscopo: debugData.data?.scopes?.join(",") ?? null };
		let connectionId = plan.conexaoId;
		if (connectionId) {
			await tx.update(whatsappConnections).set(connectionValues).where(eq(whatsappConnections.id, connectionId));
		} else {
			const [created] = await tx
				.insert(whatsappConnections)
				.values({ organizacaoId: organizationId, autorId: sessionUser.user.id, dataInsercao: onboardingAt, ...connectionValues })
				.returning({ id: whatsappConnections.id });
			if (!created) throw new Error("Falha ao criar a conexão do WhatsApp.");
			connectionId = created.id;
		}

		for (const { telefoneId, incoming } of plan.atualizar) {
			await tx
				.update(whatsappConnectionPhones)
				.set({
					conexaoId: connectionId,
					nome: incoming.nome,
					numero: incoming.numero,
					whatsappBusinessAccountId: incoming.whatsappBusinessAccountId,
					// Reconectar o número na Meta é o jeito natural de trazê-lo de volta.
					dataDesativacao: null,
					desativacaoAutorId: null,
					// A credencial nova resolve o bloqueio de envio por credencial inválida; os outros
					// motivos (pagamento, conta restrita) continuam até a Meta confirmar uma entrega.
					metadados: sql`case when ${whatsappConnectionPhones.metadados}->'bloqueioEnvio'->>'motivo' = 'CREDENCIAL_INVALIDA'
						then ${whatsappConnectionPhones.metadados} - 'bloqueioEnvio' else ${whatsappConnectionPhones.metadados} end`,
				})
				.where(eq(whatsappConnectionPhones.id, telefoneId));
		}

		const inserted =
			plan.inserir.length > 0
				? await tx
						.insert(whatsappConnectionPhones)
						.values(
							plan.inserir.map((phone) => ({
								conexaoId: connectionId as string,
								nome: phone.nome,
								whatsappBusinessAccountId: phone.whatsappBusinessAccountId,
								whatsappTelefoneId: phone.whatsappTelefoneId,
								numero: phone.numero,
								metadados: buildWhatsappPhoneSyncMetadataPatch({ currentMetadata: null, syncType: "contacts", onboardingAt }),
							})),
						)
						.returning({
							id: whatsappConnectionPhones.id,
							whatsappTelefoneId: whatsappConnectionPhones.whatsappTelefoneId,
							metadados: whatsappConnectionPhones.metadados,
						})
				: [];

		// Números que mudaram de conexão podem deixar uma conexão Meta antiga vazia (com token):
		// sem telefone ela não serve para nada e só confunde a tela de configurações.
		if (plan.atualizar.length > 0) {
			await tx.execute(sql`
				delete from ${whatsappConnections} c
				where c.organizacao_id = ${organizationId} and c.tipo_conexao = 'META_CLOUD_API' and c.id <> ${connectionId}
				  and not exists (select 1 from ${whatsappConnectionPhones} p where p.conexao_id = c.id)`);
		}

		const firstPhoneId = inserted[0]?.id ?? plan.atualizar[0]?.telefoneId;
		if (firstPhoneId) {
			await tx
				.update(campaigns)
				.set({ whatsappConexaoTelefoneId: firstPhoneId })
				.where(and(eq(campaigns.organizacaoId, organizationId), isNull(campaigns.whatsappConexaoTelefoneId)));
		}
		return inserted;
	});

	// 5. Números novos: sincronização de contatos do app (janela de onboarding da coexistência).
	for (const phone of insertedPhones) {
		if (!phone.whatsappTelefoneId) continue;
		try {
			const contactsSync = await triggerSmbAppContactsSync({ phoneNumberId: phone.whatsappTelefoneId, accessToken });
			if (contactsSync.requested) {
				await db
					.update(whatsappConnectionPhones)
					.set({
						metadados: buildWhatsappPhoneSyncMetadataPatch({
							currentMetadata: phone.metadados,
							syncType: "contacts",
							requestedAt: new Date(),
							requestId: contactsSync.requestId,
							onboardingAt,
						}),
					})
					.where(eq(whatsappConnectionPhones.id, phone.id));
			}
		} catch (error) {
			// A conexão continua utilizável mesmo sem a sincronização de contatos.
			console.error(`${LOG} Falha ao pedir a sincronização de contatos do telefone ${phone.id}:`, error);
		}
	}

	// 6. Templates da organização enviados à Meta para cada número (os que já têm id externo são pulados).
	const connectedPhoneIds = new Set([...insertedPhones.map((phone) => phone.id), ...plan.atualizar.map((item) => item.telefoneId)]);
	const phonesToSync = (await getOrganizationWhatsappPhones(organizationId)).filter((phone) => connectedPhoneIds.has(phone.id));
	const organizationTemplates = await db.query.messageTemplates.findMany({ where: eq(messageTemplates.organizacaoId, organizationId) });
	for (const template of organizationTemplates) {
		let nextMetadata = template.metadados;
		for (const phone of phonesToSync) {
			try {
				if (nextMetadata.porNumeroTelefone[phone.id]?.idExterno) continue;
				const result = await submitMessageTemplateToWhatsappPhone({
					template: { ...template, metadados: nextMetadata },
					phone,
					organizationId,
					origin: "whatsapp_auth_callback",
					mode: "create",
				});
				nextMetadata = applyWhatsappSubmissionResultToMetadata({ metadata: nextMetadata, phoneId: phone.id, idExterno: result.idExterno });
				await db.transaction(async (tx) => {
					const connected = await lockConnectedWhatsappPhone({ trx: tx, organizationId, phoneId: phone.id });
					if (!connected) return;
					await tx
						.update(messageTemplates)
						.set({
							metadados: mergeMessageTemplatePhoneMetadataSql({
								entries: { [phone.id]: buildWhatsappSubmissionPhoneMetadata(result.idExterno) },
								mode: "replace",
							}),
							dataAtualizacao: new Date(),
						})
						.where(and(eq(messageTemplates.id, template.id), eq(messageTemplates.organizacaoId, organizationId)));
				});
			} catch (error) {
				console.error(`${LOG} Falha ao enviar o template ${template.id} para o telefone ${phone.id}:`, error);
			}
		}
	}

	await reconcileOnboardingCampaigns({ executor: db, organizationId });

	// Depois de responder: saúde dos números (nome de exibição, qualidade, limite) e o template de
	// teste de conexão, que verifica o pagamento na Meta antes da primeira campanha.
	const accounts = [...new Set(phones.map((phone) => phone.whatsappBusinessAccountId))];
	after(async () => {
		for (const whatsappBusinessAccountId of accounts) {
			await runWhatsappConnectionsHealthCheck({ whatsappBusinessAccountId }).catch((error) => console.error(`${LOG} Checagem de saúde falhou:`, error));
		}
		for (const phone of phonesToSync) {
			await submitWhatsappConnectionTestTemplate({ organizationId, phoneId: phone.id }).catch((error) =>
				console.error(`${LOG} Template de teste de conexão falhou para o telefone ${phone.id}:`, error),
			);
		}
	});

	return back({ sucesso: plan.atualizar.length > 0 && insertedPhones.length === 0 ? "reconectado" : "conectado", numeros: connectedPhoneIds.size });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = appApiHandler({
	GET: getWhatsappAuthCallbackRoute,
});
