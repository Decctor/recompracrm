import { getOverallSalesStats, getPartnerRankings, getProductRankings, getSellerRankings } from "@/lib/reports/data-fetchers";
import { buildMonthlyReportMessage } from "@/lib/reports/message-templates";
import { sendMessage } from "@/lib/whatsapp/internal-gateway";
import { formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import { db } from "@/services/drizzle";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import type { NextApiHandler } from "next";

dayjs.locale("pt-br");

export const config = {
	maxDuration: 60,
};

const INTERNAL_SESSION_ID = process.env.INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS as string;

const monthlyReportHandler: NextApiHandler = async (req, res) => {
	try {
		console.log("[INFO] [MONTHLY_REPORT] Starting monthly report generation");

		// Validate Vercel Cron secret for security
		const authHeader = req.headers.authorization;
		if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
			console.error("[ERROR] [MONTHLY_REPORT] Unauthorized request");
			return res.status(401).json({ error: "Unauthorized" });
		}

		if (!INTERNAL_SESSION_ID) {
			console.error("[ERROR] [MONTHLY_REPORT] INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS not configured");
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

		console.log(`[INFO] [MONTHLY_REPORT] Processing ${organizationsList.length} organizations`);

		const allResults = [];

		for (const organization of organizationsList) {
			try {
				const ownerPhone = organization.autor?.telefone;
				if (!ownerPhone) {
					console.warn(`[ORG: ${organization.id}] [WARN] [MONTHLY_REPORT] Owner has no phone number, skipping`);
					continue;
				}
				const recipientPhone = formatPhoneForInternalGateway(ownerPhone);

				console.log(`[ORG: ${organization.id}] [INFO] [MONTHLY_REPORT] Generating report`);

				// Get data for last month (full month)
				const lastMonth = dayjs().subtract(1, "month");
				const periodAfter = lastMonth.startOf("month").toDate();
				const periodBefore = lastMonth.endOf("month").toDate();

				console.log(`[ORG: ${organization.id}] [INFO] [MONTHLY_REPORT] Fetching data for period:`, {
					after: periodAfter,
					before: periodBefore,
				});

				// Fetch sales stats
				const stats = await getOverallSalesStats({ after: periodAfter, before: periodBefore, organizacaoId: organization.id });

				// Fetch top sellers, partners, and products
				const topSellers = await getSellerRankings({ after: periodAfter, before: periodBefore, organizacaoId: organization.id }, 3);
				const topPartners = await getPartnerRankings({ after: periodAfter, before: periodBefore, organizacaoId: organization.id }, 3);
				const topProducts = await getProductRankings({ after: periodAfter, before: periodBefore, organizacaoId: organization.id }, 3);

				// Build the styled text message
				const periodo = dayjs(periodAfter).format("MMMM/YYYY").toUpperCase();
				const text = buildMonthlyReportMessage({
					orgNome: organization.nome,
					periodo,
					stats,
					topSellers,
					topPartners,
					topProducts,
				});

				// Send to org owner via internal gateway
				try {
					console.log(`[ORG: ${organization.id}] [INFO] [MONTHLY_REPORT] Sending report to owner: ${recipientPhone}`);

					const result = await sendMessage(INTERNAL_SESSION_ID, recipientPhone, { type: "text", text });

					allResults.push({
						organizationId: organization.id,
						recipient: recipientPhone,
						status: "success",
						messageId: result.clientMessageId ?? result.jobId ?? null,
					});

					console.log(`[ORG: ${organization.id}] [INFO] [MONTHLY_REPORT] Successfully sent report to owner`);
				} catch (error) {
					console.error(`[ORG: ${organization.id}] [ERROR] [MONTHLY_REPORT] Failed to send report to owner:`, error);
					allResults.push({
						organizationId: organization.id,
						recipient: recipientPhone,
						status: "error",
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}

				console.log(`[ORG: ${organization.id}] [INFO] [MONTHLY_REPORT] Report completed`);
			} catch (error) {
				console.error(`[ORG: ${organization.id}] [ERROR] [MONTHLY_REPORT] Error generating report:`, error);
				// Continuar para proxima organizacao mesmo com erro
			}
		}

		const successCount = allResults.filter((r) => r.status === "success").length;
		console.log(`[INFO] [MONTHLY_REPORT] Reports sent: ${successCount}/${allResults.length} total`);

		return res.status(200).json({
			message: "Monthly report completed",
			sent: successCount,
			total: allResults.length,
			results: allResults,
		});
	} catch (error) {
		console.error("[ERROR] [MONTHLY_REPORT] Fatal error:", error);
		return res.status(500).json({
			error: "Failed to generate monthly report",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
};

export default monthlyReportHandler;
