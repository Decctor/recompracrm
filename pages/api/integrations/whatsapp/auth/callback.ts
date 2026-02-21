import { FacebookOAuth } from "@/lib/authentication/oauth";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import { syncWhatsappTemplates } from "@/lib/whatsapp/template-management";
import { db } from "@/services/drizzle";
import { type TNewWhatsappConnection, whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema";
import { campaigns } from "@/services/drizzle/schema/campaigns";
import type { OAuth2Tokens } from "arctic";
import { and, eq, isNull } from "drizzle-orm";

import dayjs from "dayjs";
import type { NextApiRequest, NextApiResponse } from "next";

type TWhatsappIntegrationData = {
	tipo: "WHATSAPP";
	organizacaoId: string;
	token: string;
	dataExpiracao: string;
	metaAutorAppId: string;
	metaEscopo: string[];
	telefones: { nome: string; whatsappBusinessAccountId: string; whatsappTelefoneId: string; numero: string }[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	// Get user session to determine organization
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) {
		return res.status(401).json({ error: "Você precisa estar autenticado para conectar o WhatsApp." });
	}
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) {
		return res.status(400).json({ error: "Você precisa estar vinculado a uma organização para conectar o WhatsApp." });
	}
	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Query Params:", req.query);
	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Body:", req.body);
	const { code, state } = req.query;
	if (!code) {
		return res.status(400).json({ error: "Authorization code is missing." });
	}

	const appId = process.env.NEXT_PUBLIC_META_APP_ID;
	const appSecret = process.env.META_APP_SECRET;
	const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/whatsapp/auth/callback`;

	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Config:", {
		appId,
		appSecretPresent: !!appSecret,
		redirectUri,
		codeLength: (code as string).length,
	});

	// O redirect_uri deve ser um dos URIs configurados no seu painel da Meta
	let tokens: any; // Usando any temporariamente para lidar com a resposta manual
	let accessToken: string | undefined;
	let accessTokenExpiresAt: Date | undefined;

	try {
		// Tentativa manual de troca de token para debug detalhado e contorno de erro da lib
		const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
		tokenUrl.searchParams.set("client_id", appId as string);
		tokenUrl.searchParams.set("redirect_uri", redirectUri);
		tokenUrl.searchParams.set("client_secret", appSecret as string);
		tokenUrl.searchParams.set("code", code as string);

		console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Trocando código por token manualmente:", tokenUrl.toString().replace(appSecret as string, "***"));

		const response = await fetch(tokenUrl.toString());
		const data = await response.json();

		console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Resposta da troca de token:", data);

		if (data.error) {
			throw {
				message: data.error.message,
				data: data.error,
				status: 400,
			};
		}

		// Mapeia a resposta manual para o formato esperado
		accessToken = data.access_token;
		if (data.expires_in) {
			accessTokenExpiresAt = dayjs().add(data.expires_in, "seconds").toDate();
		} else {
			// Se não vier expires_in, definimos um padrão de 60 dias (token de longa duração comum no FB)
			console.warn("[WARN] 'expires_in' não retornado pela Meta. Usando padrão de 60 dias.");
			accessTokenExpiresAt = dayjs().add(60, "days").toDate();
		}

		// Simula o objeto tokens para compatibilidade se necessário, mas já extraímos o que precisamos
		tokens = {
			accessToken: () => accessToken,
			accessTokenExpiresAt: () => accessTokenExpiresAt,
		};
	} catch (error: any) {
		console.error("[ERROR] [WHATSAPP_CONNECT_CALLBACK] Error validating authorization code:", {
			message: error.message,
			status: error.status,
			data: error.data,
			stack: error.stack,
		});
		return res.status(400).json({
			error: "Falha ao validar código de autorização",
			details: error.data || error.message,
			hint: "Verifique se o redirect_uri no Meta App Dashboard corresponde exatamente a: " + redirectUri,
		});
	}

	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Tokens obtidos com sucesso:", {
		hasAccessToken: !!accessToken,
		accessTokenExpiresAt,
		tokenLength: accessToken?.length,
	});

	const debugUrl = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
	const debugResponse = await fetch(debugUrl);
	const debugData = await debugResponse.json();

	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Debug Data:", debugData);
	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Debug Data Granular Scopes:", debugData.data?.granular_scopes);

	const whatsappMessagingTargeIds =
		debugData.data?.granular_scopes.find((scope: any) => scope.scope === "whatsapp_business_messaging")?.target_ids ?? [];
	const phones = (
		await Promise.all(
			whatsappMessagingTargeIds.map(async (targetId: string) => {
				const whatsappBusinessAccountId = targetId;

				try {
					const subscribeUrl = `https://graph.facebook.com/v21.0/${whatsappBusinessAccountId}/subscribed_apps`;
					const subscribeResponse = await fetch(subscribeUrl, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					});
					const subscribeResult = await subscribeResponse.json();

					if (subscribeResult.success) {
						console.log(`[SUCCESS] App inscrito com sucesso no WABA: ${whatsappBusinessAccountId}`);
					} else {
						console.error("[ERROR] Falha ao inscrever app no WABA:", subscribeResult);
					}
				} catch (error) {
					console.error(`[ERROR] Erro na requisição de subscribed_apps para ${whatsappBusinessAccountId}:`, error);
				}

				const phoneNumbersUrl = `https://graph.facebook.com/v21.0/${whatsappBusinessAccountId}/phone_numbers?access_token=${accessToken}`;
				const phoneNumbersResponse = await fetch(phoneNumbersUrl);
				const phoneNumbersDataResult = await phoneNumbersResponse.json();
				const phoneNumbersData = phoneNumbersDataResult.data[0];
				console.log(`[INFO] [WHATSAPP_CONNECT] Phone Numbers Data for ${whatsappBusinessAccountId}:`, phoneNumbersData);
				if (phoneNumbersData.platform_type !== "CLOUD_API") return null;
				return {
					nome: phoneNumbersData.verified_name as string,
					whatsappBusinessAccountId: whatsappBusinessAccountId,
					whatsappTelefoneId: phoneNumbersData.id,
					numero: phoneNumbersData.display_phone_number,
				};
			}),
		)
	).filter((p) => !!p);

	const insertedPhones = await db.transaction(async (tx) => {
		const whatsappConnection: TNewWhatsappConnection = {
			organizacaoId: userOrgId,
			token: accessToken ?? "",
			dataExpiracao: accessTokenExpiresAt ?? dayjs().add(1, "month").toDate(),
			autorId: sessionUser.user.id,
			metaEscopo: debugData.data?.scopes.join(","),
		};

		const insertedWhatsappConnection = await tx.insert(whatsappConnections).values(whatsappConnection).returning({ id: whatsappConnections.id });
		const insertedWhatsappConnectionId = insertedWhatsappConnection[0]?.id;
		if (!insertedWhatsappConnectionId) throw new Error("Failed to insert whatsapp connection");

		const insertedWhatsappConnectionPhones = await tx
			.insert(whatsappConnectionPhones)
			.values(
				phones.map((phone) => ({
					conexaoId: insertedWhatsappConnectionId,
					nome: phone.nome,
					whatsappBusinessAccountId: phone.whatsappBusinessAccountId,
					whatsappTelefoneId: phone.whatsappTelefoneId,
					numero: phone.numero,
				})),
			)
			.returning({ id: whatsappConnectionPhones.id, whatsappBusinessAccountId: whatsappConnectionPhones.whatsappBusinessAccountId });

		return insertedWhatsappConnectionPhones;
	});

	const firstPhoneId = insertedPhones[0]?.id;
	if (firstPhoneId) {
		await db
			.update(campaigns)
			.set({
				whatsappConexaoTelefoneId: firstPhoneId,
			})
			.where(and(eq(campaigns.organizacaoId, userOrgId), isNull(campaigns.whatsappConexaoTelefoneId)));
	}

	// Sync templates for each connected phone
	console.log("[INFO] [WHATSAPP_CONNECT_CALLBACK] Starting automatic template sync for connected phones");
	for (const phone of insertedPhones) {
		try {
			if (!phone.whatsappBusinessAccountId || !phone.id) continue;
			const syncResult = await syncWhatsappTemplates({
				whatsappToken: accessToken ?? "",
				whatsappBusinessAccountId: phone.whatsappBusinessAccountId,
				phoneId: phone.id,
				organizationId: userOrgId,
				userId: sessionUser.user.id,
				db,
			});
			console.log(
				`[INFO] [WHATSAPP_CONNECT_CALLBACK] Template sync completed for phone ${phone.id}. Created: ${syncResult.created}, Updated: ${syncResult.updated}, Errors: ${syncResult.errors}`,
			);
		} catch (error) {
			console.error(`[ERROR] [WHATSAPP_CONNECT_CALLBACK] Failed to sync templates for phone ${phone.id}:`, error);
			// Don't fail the connection if template sync fails
		}
	}

	return res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?view=meta-oauth`);
}
