import { formatDateAsLocale } from "@/lib/formatting";
import { getOverallSalesStats, getPartnerRankings, getProductRankings, getSellerRankings } from "@/lib/reports/data-fetchers";
import { formatDate } from "@/lib/reports/formatters";
import { buildDailyReportMessage } from "@/lib/reports/message-templates";
import { sendMessage } from "@/lib/whatsapp/internal-gateway";
import { formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import { db } from "@/services/drizzle";
import dayjs from "dayjs";
import type { NextApiHandler } from "next";

export const config = {
	maxDuration: 60,
};

const INTERNAL_SESSION_ID = process.env.INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS as string;

const dailyReportHandler: NextApiHandler = async (req, res) => {
	try {
		console.log("[INFO] [DAILY_REPORT] Starting daily report generation");

		// Validate Vercel Cron secret for security
		const authHeader = req.headers.authorization;
		if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
			console.error("[ERROR] [DAILY_REPORT] Unauthorized request");
			return res.status(401).json({ error: "Unauthorized" });
		}

		if (!INTERNAL_SESSION_ID) {
			console.error("[ERROR] [DAILY_REPORT] INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS not configured");
			return res.status(500).json({ error: "Sessão WhatsApp interna não configurada" });
		}

		// Buscar todas as organizacoes com o autor (owner)
		const organizationsList = await db.query.organizations.findMany({
			columns: { id: true, nome: true },
			with: {
				autor: {
					columns: { telefone: true },
				},
			},
		});

		console.log(`[INFO] [DAILY_REPORT] Processing ${organizationsList.length} organizations`);

		const allResults = [];

		for (const organization of organizationsList) {
			try {
				const ownerPhone = organization.autor?.telefone;
				if (!ownerPhone) {
					console.warn(`[ORG: ${organization.id}] [WARN] [DAILY_REPORT] Owner has no phone number, skipping`);
					continue;
				}
				const recipientPhone = formatPhoneForInternalGateway(ownerPhone);

				console.log(`[ORG: ${organization.id}] [INFO] [DAILY_REPORT] Generating report`);

				// Get data for yesterday (D-1)
				const yesterday = dayjs().subtract(1, "day");
				const periodAfter = yesterday.startOf("day").toDate();
				const periodBefore = yesterday.endOf("day").toDate();
				const comparisonAfter = yesterday.subtract(1, "day").startOf("day").toDate();
				const comparisonBefore = yesterday.subtract(1, "day").endOf("day").toDate();
				console.log(`[ORG: ${organization.id}] [INFO] [DAILY_REPORT] Fetching data for period:`, {
					after: formatDateAsLocale(periodAfter, true),
					before: formatDateAsLocale(periodBefore, true),
					comparisonAfter: formatDateAsLocale(comparisonAfter, true),
					comparisonBefore: formatDateAsLocale(comparisonBefore, true),
				});

				// Fetch sales stats
				const stats = await getOverallSalesStats({
					after: periodAfter,
					before: periodBefore,
					comparisonAfter,
					comparisonBefore,
					organizacaoId: organization.id,
				});

				// Doing a check to validate if there any relevant stats at all
				if (stats.faturamento.atual === 0) {
					console.log(`[ORG: ${organization.id}] [INFO] [DAILY_REPORT] No relevant stats found, skipping`);
					continue;
				}

				// Fetch top sellers, partners, and products
				const topSellers = await getSellerRankings(
					{ after: periodAfter, before: periodBefore, comparisonAfter, comparisonBefore, organizacaoId: organization.id },
					3,
				);
				const topPartners = await getPartnerRankings(
					{ after: periodAfter, before: periodBefore, comparisonAfter, comparisonBefore, organizacaoId: organization.id },
					3,
				);
				const topProducts = await getProductRankings(
					{ after: periodAfter, before: periodBefore, comparisonAfter, comparisonBefore, organizacaoId: organization.id },
					3,
				);

				// Build the styled text message
				const periodo = formatDate(periodAfter);
				const text = buildDailyReportMessage({
					orgNome: organization.nome,
					periodo,
					stats,
					topSellers,
					topPartners,
					topProducts,
				});

				// Send to org owner via internal gateway
				try {
					console.log(`[ORG: ${organization.id}] [INFO] [DAILY_REPORT] Sending report to owner: ${recipientPhone}`);

					const result = await sendMessage(INTERNAL_SESSION_ID, recipientPhone, { type: "text", text });
					console.log("[FAKE] [DAILY_REPORT] Sending report: ", {
						organizationId: organization.id,
						recipient: recipientPhone,
						text: text,
					});
					allResults.push({
						organizationId: organization.id,
						recipient: recipientPhone,
						status: "success",
						messageId: result.clientMessageId ?? result.jobId ?? null,
					});

					console.log(`[ORG: ${organization.id}] [INFO] [DAILY_REPORT] Successfully sent report to owner`);
				} catch (error) {
					console.error(`[ORG: ${organization.id}] [ERROR] [DAILY_REPORT] Failed to send report to owner:`, error);
					allResults.push({
						organizationId: organization.id,
						recipient: recipientPhone,
						status: "error",
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}

				console.log(`[ORG: ${organization.id}] [INFO] [DAILY_REPORT] Report completed`);
			} catch (error) {
				console.error(`[ORG: ${organization.id}] [ERROR] [DAILY_REPORT] Error generating report:`, error);
				// Continuar para proxima organizacao mesmo com erro
			}
		}

		const successCount = allResults.filter((r) => r.status === "success").length;
		console.log(`[INFO] [DAILY_REPORT] Reports sent: ${successCount}/${allResults.length} total`);

		return res.status(200).json({
			message: "Daily report completed",
			sent: successCount,
			total: allResults.length,
			results: allResults,
		});
	} catch (error) {
		console.error("[ERROR] [DAILY_REPORT] Fatal error:", error);
		return res.status(500).json({
			error: "Failed to generate daily report",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
};

export default dailyReportHandler;
