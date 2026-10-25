import { formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { resend } from "@/services/resend";
import { db } from "@/services/drizzle";
import { organizationMembers } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import type { TSaleEntity } from "@/services/drizzle/schema/sales";
import type { TIbptRefreshFailure, TIbptUf } from "./ibpt-rates";
import type { TFiscalPendingSummary } from "./pending";
import { eq, isNotNull } from "drizzle-orm";

function escapeHtml(value: unknown) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function getAppBaseUrl() {
	return process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recompracrm.com.br";
}

async function listFiscalNotificationRecipients(organization: TOrganizationEntity) {
	const members = await db.query.organizationMembers.findMany({
		where: eq(organizationMembers.organizacaoId, organization.id),
		with: {
			usuario: {
				columns: {
					email: true,
					nome: true,
				},
			},
		},
	});

	const emails = new Set<string>();
	if (organization.email) emails.add(organization.email);
	if (organization.fiscalConfiguracao?.emailFiscal) emails.add(organization.fiscalConfiguracao.emailFiscal);

	for (const member of members) {
		const fiscalPermissions = member.permissoes?.fiscal;
		if ((fiscalPermissions?.configurar || fiscalPermissions?.emitir) && member.usuario?.email) {
			emails.add(member.usuario.email);
		}
	}

	return [...emails];
}

type NotifyFiscalEmissionFailureParams = {
	organization: TOrganizationEntity;
	sale: Pick<TSaleEntity, "id" | "valorTotal" | "dataVenda" | "canal">;
	errorMessage: string;
};

// Best-effort developer alert. Customers are not notified: an automatic emission failure is
// retried/resolved from the fiscal module, and the e-mail was only adding noise for them.
// Never throws: a failure to notify must not break sale processing.
export async function notifyFiscalEmissionFailure({ organization, sale, errorMessage }: NotifyFiscalEmissionFailureParams) {
	const recipient = process.env.BUG_REPORT_EMAIL;
	if (!recipient) {
		console.error("[FISCAL] BUG_REPORT_EMAIL is not set; skipping developer alert email.", {
			saleId: sale.id,
			organizacaoId: organization.id,
			errorMessage,
		});
		return;
	}

	const fiscalUrl = `${getAppBaseUrl()}${appRoutes.fiscal.root()}`;

	try {
		const { error } = await resend.emails.send({
			from: "RecompraCRM <fiscal@recompracrm.com.br>",
			to: [recipient],
			subject: `[ALERTA] Falha na emissão fiscal automática — ${organization.nome}`,
			text: [
				`A venda ${sale.id} foi confirmada, mas a emissão fiscal automática falhou.`,
				"",
				`Organização: ${organization.nome} (${organization.id})`,
				`Canal: ${sale.canal ?? "N/A"}`,
				`Valor: ${formatToMoney(sale.valorTotal)}`,
				`Erro: ${errorMessage}`,
				"",
				`Módulo fiscal: ${fiscalUrl}`,
			].join("\n"),
		});

		if (error) console.error("[FISCAL] Failed to send developer alert email:", error);
	} catch (error) {
		console.error("[FISCAL] Error notifying fiscal emission failure.", error);
	}
}

type TIbptNotificationFailure = Omit<TIbptRefreshFailure, "uf"> & { uf: TIbptUf | null };

export async function notifyFiscalIbptRefreshFailure(failures: TIbptNotificationFailure[]) {
	if (failures.length === 0) return;

	try {
		const failedUfs = new Set(failures.flatMap((failure) => (failure.uf ? [failure.uf] : [])));
		const fiscalOrganizations = await db.query.organizations.findMany({
			where: (fields) => isNotNull(fields.fiscalConfiguracao),
		});
		const affectedOrganizations =
			failedUfs.size === 0
				? fiscalOrganizations
				: fiscalOrganizations.filter((organization) => failedUfs.has(organization.fiscalConfiguracao?.endereco?.uf?.trim().toUpperCase() as TIbptUf));
		const recipientLists = await Promise.all(affectedOrganizations.map(listFiscalNotificationRecipients));
		const recipients = new Set(recipientLists.flat());
		if (process.env.BUG_REPORT_EMAIL) recipients.add(process.env.BUG_REPORT_EMAIL);

		if (recipients.size === 0) {
			console.error("[IBPT] Nenhum destinatário configurado para o alerta de falha.", failures);
			return;
		}

		const details = failures.map((failure) => `${failure.uf ?? "GERAL"}: falha após ${failure.tentativas} tentativa(s) — ${failure.erro}`);
		const safeDetails = details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("");
		const result = await Promise.allSettled(
			[...recipients].map(async (recipient) => {
				const { error } = await resend.emails.send({
					from: "RecompraCRM <fiscal@recompracrm.com.br>",
					to: [recipient],
					subject: "[ALERTA] Falha na atualização da tabela IBPT",
					text: [
						"A atualização automática da tabela IBPT falhou após as retentativas configuradas.",
						"",
						...details,
						"",
						"As tabelas instaladas anteriormente foram preservadas. Verifique a API de origem e execute a atualização manual se necessário.",
					].join("\n"),
					html: `
						<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
							<h2 style="margin: 0 0 12px;">Falha na atualização da tabela IBPT</h2>
							<p>A atualização automática falhou após as retentativas configuradas:</p>
							<ul>${safeDetails}</ul>
							<p>As tabelas instaladas anteriormente foram preservadas. Verifique a API de origem e execute a atualização manual se necessário.</p>
						</div>
					`,
				});
				if (error) throw new Error(error.message);
			}),
		);

		for (const rejected of result.filter((item) => item.status === "rejected")) {
			console.error("[IBPT] Falha ao enviar e-mail de alerta:", rejected.reason);
		}
	} catch (error) {
		console.error("[IBPT] Erro inesperado ao notificar falha de atualização.", error);
	}
}

// Quem recebe o resumo diario de pendencias: membros com `fiscal.configurar` (quem consegue
// resolver a causa) e o e-mail fiscal da organizacao, quando configurado.
async function listFiscalPendingDigestRecipients(organization: Pick<TOrganizationEntity, "id" | "fiscalConfiguracao">) {
	const members = await db.query.organizationMembers.findMany({
		where: eq(organizationMembers.organizacaoId, organization.id),
		with: { usuario: { columns: { email: true } } },
	});
	const emails = new Set<string>();
	if (organization.fiscalConfiguracao?.emailFiscal) emails.add(organization.fiscalConfiguracao.emailFiscal);
	for (const member of members) {
		if (member.permissoes?.fiscal?.configurar && member.usuario?.email) emails.add(member.usuario.email);
	}
	return [...emails];
}

type NotifyFiscalPendingDigestParams = {
	organization: Pick<TOrganizationEntity, "id" | "nome" | "fiscalConfiguracao">;
	summary: TFiscalPendingSummary;
};

/**
 * Resumo diario do trabalho fiscal pendente. Um e-mail por organizacao por dia, agrupado por
 * causa (nao por venda), com link direto para a aba Pendencias. Nunca lanca.
 */
export async function notifyFiscalPendingDigest({ organization, summary }: NotifyFiscalPendingDigestParams) {
	if (summary.resumo.total === 0) return { sent: false, recipients: 0 };
	const recipients = await listFiscalPendingDigestRecipients(organization);
	if (recipients.length === 0) return { sent: false, recipients: 0 };

	const pendingUrl = `${getAppBaseUrl()}${appRoutes.fiscal.pending()}`;
	const causes = summary.porAlvo.slice(0, 10).map((group) => {
		const title = group.alvo.rotulo ? `${group.alvo.rotulo}: ${group.problema.acaoSugerida}` : group.problema.mensagem;
		return `${title} — ${group.documentos.length} documento(s), ${formatToMoney(group.valorTravado)} travados`;
	});
	const products = summary.produtosSemPerfil.slice(0, 10).map((product) => `${product.nome} — ${product.vendasRecentes} venda(s) nos últimos 30 dias`);
	const lines = [
		`Sua organização tem ${summary.resumo.documentos} documento(s) fiscal(is) travado(s) (${formatToMoney(summary.resumo.valorTravado)}) e ${summary.resumo.produtosSemPerfil} produto(s) vendido(s) sem perfil fiscal.`,
		"",
		...(causes.length > 0 ? ["Causas:", ...causes.map((cause) => `- ${cause}`), ""] : []),
		...(products.length > 0 ? ["Produtos sem perfil fiscal:", ...products.map((product) => `- ${product}`), ""] : []),
		`Resolva em: ${pendingUrl}`,
	];
	const html = `
		<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
			<h2 style="margin: 0 0 12px;">Pendências fiscais — ${escapeHtml(organization.nome)}</h2>
			<p>${escapeHtml(lines[0])}</p>
			${causes.length > 0 ? `<h3 style="margin: 16px 0 6px; font-size: 14px;">Causas</h3><ul>${causes.map((cause) => `<li>${escapeHtml(cause)}</li>`).join("")}</ul>` : ""}
			${products.length > 0 ? `<h3 style="margin: 16px 0 6px; font-size: 14px;">Produtos sem perfil fiscal</h3><ul>${products.map((product) => `<li>${escapeHtml(product)}</li>`).join("")}</ul>` : ""}
			<p><a href="${escapeHtml(pendingUrl)}">Abrir pendências fiscais</a></p>
		</div>
	`;

	try {
		const { error } = await resend.emails.send({
			from: "RecompraCRM <fiscal@recompracrm.com.br>",
			to: recipients,
			subject: `[FISCAL] ${summary.resumo.documentos} documento(s) com pendência — ${organization.nome}`,
			text: lines.join("\n"),
			html,
		});
		if (error) {
			console.error("[FISCAL] Falha ao enviar resumo de pendências:", error);
			return { sent: false, recipients: recipients.length };
		}
		return { sent: true, recipients: recipients.length };
	} catch (error) {
		console.error("[FISCAL] Erro inesperado ao enviar resumo de pendências.", error);
		return { sent: false, recipients: recipients.length };
	}
}

type NotifyInboundDocumentCancelledParams = {
	organization: TOrganizationEntity;
	document: { chaveAcesso: string; emitenteNome: string | null; valorTotal: number | null };
	purchase: { id: string; titulo: string; status: string };
};

/**
 * A SEFAZ cancelou (ou denegou) uma nota que ja virou compra. Quem lancou precisa decidir o que
 * fazer: a compra nao e desfeita sozinha. Nunca lanca: e um aviso, nao parte do sync.
 */
export async function notifyInboundDocumentCancelled({ organization, document, purchase }: NotifyInboundDocumentCancelledParams) {
	const recipients = await listFiscalNotificationRecipients(organization);
	if (recipients.length === 0) return;
	const purchaseUrl = `${getAppBaseUrl()}${appRoutes.purchase(purchase.id)}`;
	const received = purchase.status === "RECEBIDA";
	const lines = [
		`A NF-e ${document.chaveAcesso}${document.emitenteNome ? ` de ${document.emitenteNome}` : ""}${
			document.valorTotal != null ? ` (${formatToMoney(document.valorTotal)})` : ""
		} foi cancelada na SEFAZ, mas está lançada na compra "${purchase.titulo}".`,
		"",
		received
			? "A compra já foi recebida: o estoque e o lançamento contábil continuam valendo. Cancele ou estorne a compra se a mercadoria não entrou."
			: "A compra ainda não foi recebida e não poderá ser recebida enquanto a nota estiver cancelada. Cancele a compra ou lance a nota substituta.",
		"",
		`Compra: ${purchaseUrl}`,
	];
	try {
		const { error } = await resend.emails.send({
			from: "RecompraCRM <fiscal@recompracrm.com.br>",
			to: recipients,
			subject: `[FISCAL] Nota cancelada na SEFAZ já lançada em compra — ${organization.nome}`,
			text: lines.join("\n"),
		});
		if (error) console.error("[FISCAL_INBOUND] Falha ao avisar cancelamento de nota lancada:", error);
	} catch (error) {
		console.error("[FISCAL_INBOUND] Erro ao avisar cancelamento de nota lancada.", error);
	}
}
