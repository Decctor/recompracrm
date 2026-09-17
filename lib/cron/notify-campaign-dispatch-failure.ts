import { db } from "@/services/drizzle";
import { campaignDispatches } from "@/services/drizzle/schema";
import { resend } from "@/services/resend";
import { eq } from "drizzle-orm";

type TCampaignDispatchFailureReport = {
	dispatchId: string;
	stage: "expand" | "send";
	error: string;
};

// Alerta best-effort ao time quando um disparo falha terminalmente na fila (após as tentativas).
// Nunca lança: falhar em avisar não pode derrubar o consumer. O disparo continua visível e
// reexecutável no painel de disparos da campanha.
export async function notifyCampaignDispatchFailure(report: TCampaignDispatchFailureReport) {
	const recipient = process.env.BUG_REPORT_EMAIL;
	if (!recipient) {
		console.error("[CAMPAIGN_DISPATCH_FAILURE] BUG_REPORT_EMAIL is not set; skipping developer alert email.", report);
		return;
	}

	try {
		const dispatch = await db.query.campaignDispatches.findFirst({
			where: eq(campaignDispatches.id, report.dispatchId),
			with: { campanha: { columns: { id: true, titulo: true } } },
		});

		const lines = [
			`Falha terminal no estágio "${report.stage}" de um disparo de campanha.`,
			"",
			`Organização: ${dispatch?.organizacaoId ?? "desconhecida"}`,
			`Campanha: ${dispatch?.campanha?.titulo ?? "desconhecida"} (${dispatch?.campanhaId ?? "?"})`,
			`Disparo: ${report.dispatchId} (${dispatch?.origem ?? "?"}, janela ${dispatch?.janelaReferencia ?? "?"})`,
			`Destinatários: ${dispatch?.totalDestinatarios ?? 0} | enviados ${dispatch?.totalEnviados ?? 0} | falhados ${dispatch?.totalFalhados ?? 0} | pulados ${dispatch?.totalPulados ?? 0}`,
			"",
			`Erro: ${report.error}`,
			"",
			"O disparo pode ser reexecutado pelo painel de disparos da campanha (Estatísticas > Disparos).",
		];

		const { error } = await resend.emails.send({
			from: "RecompraCRM <noreply@recompracrm.com.br>",
			to: [recipient],
			subject: `[ALERTA] Falha no disparo de campanha ${report.dispatchId}`,
			text: lines.join("\n"),
		});
		if (error) console.error("[CAMPAIGN_DISPATCH_FAILURE] Failed to send developer alert email:", error);
	} catch (error) {
		console.error("[CAMPAIGN_DISPATCH_FAILURE] Unexpected error sending developer alert email:", error);
	}
}
