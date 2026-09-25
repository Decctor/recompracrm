import { db } from "@/services/drizzle";
import { organizationMembers, organizations, users } from "@/services/drizzle/schema";
import { resend } from "@/services/resend";
import { eq, sql } from "drizzle-orm";
import { formatUsd } from "../providers/pricing";
import { getOrganizationAiSpend, resolveAiSpendLimitUsd } from "./spend";

/**
 * Aviso aos administradores da organização quando o gasto mensal com IA cruza 80% do limite.
 *
 * Diferente de `credit-alert.ts` (crédito global do Gateway, destinatário é o desenvolvedor),
 * este é um aviso de negócio para quem configura o agente: os membros com `empresa.editar`.
 * Silenciado por 7 dias via `ampmais_utils` com `organizacao_id`, então um mês recebe no máximo
 * um e-mail de 80% — o de 100% é o próprio hub mostrando "Limite de IA atingido".
 *
 * Nunca lança: roda depois de uma run bem-sucedida, e falhar em avisar não pode virar falha da run.
 */

const ALERT_KEY = "ai-spend-limit-alert";
const ALERT_THRESHOLD = 0.8;
const ALERT_SILENCE_DAYS = 7;
const LOG = "[AI_SPEND_ALERT]";

async function claimAlertWindow(organizacaoId: string): Promise<boolean> {
	const [existing] = await db.execute<{ id: string }>(sql`
		select id from ampmais_utils
		where identificador = ${ALERT_KEY} and organizacao_id = ${organizacaoId}
		limit 1
	`);

	if (!existing) {
		await db.execute(sql`
			insert into ampmais_utils (id, identificador, organizacao_id, valor)
			values (${crypto.randomUUID()}, ${ALERT_KEY}, ${organizacaoId}, '{}'::jsonb)
		`);
		return true;
	}

	const updated = await db.execute<{ id: string }>(sql`
		update ampmais_utils
		set data_ultima_atualizacao = now()
		where id = ${existing.id}
			and data_ultima_atualizacao < now() - (${ALERT_SILENCE_DAYS} * interval '1 day')
		returning id
	`);
	return updated.length > 0;
}

async function listOrganizationAdminEmails(organizacaoId: string): Promise<string[]> {
	const rows = await db
		.select({ email: users.email, permissoes: organizationMembers.permissoes })
		.from(organizationMembers)
		.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
		.where(eq(organizationMembers.organizacaoId, organizacaoId));
	return rows.filter((row) => row.permissoes?.empresa?.editar && row.email).map((row) => row.email as string);
}

export async function notifyAiSpendThresholdIfReached({ organizacaoId }: { organizacaoId: string }): Promise<void> {
	try {
		const organization = await db.query.organizations.findFirst({
			where: eq(organizations.id, organizacaoId),
			columns: { nome: true, configuracao: true },
		});
		const limite = resolveAiSpendLimitUsd(organization?.configuracao);
		if (!organization || limite === null) return;

		const { custoUsd } = await getOrganizationAiSpend(db, { organizacaoId });
		if (custoUsd < limite * ALERT_THRESHOLD) return;
		if (!(await claimAlertWindow(organizacaoId))) return;

		const recipients = await listOrganizationAdminEmails(organizacaoId);
		if (recipients.length === 0) {
			console.warn(`${LOG} Organização ${organizacaoId} sem administradores com e-mail; aviso de 80% não enviado.`);
			return;
		}

		const percent = Math.round((custoUsd / limite) * 100);
		const lines = [
			`O agente de IA da ${organization.nome} já usou ${percent}% do limite mensal de créditos.`,
			"",
			`Gasto estimado no mês: ${formatUsd(custoUsd)}`,
			`Limite configurado: ${formatUsd(limite)}`,
			"",
			"Ao atingir 100%, o agente para de responder e as conversas voltam para a fila da equipe até o",
			"início do próximo mês ou até o limite ser ajustado pela plataforma.",
			"",
			"Para reduzir o gasto: escolha um modelo mais econômico em Configurações → Agente de IA, ou",
			"restrinja o escopo de clientes que o agente atende.",
		];

		const { error } = await resend.emails.send({
			from: "RecompraCRM <noreply@recompracrm.com.br>",
			to: recipients,
			subject: `[RecompraCRM] Agente de IA em ${percent}% do limite mensal`,
			text: lines.join("\n"),
		});
		if (error) console.error(`${LOG} Falha ao enviar o aviso:`, error);
	} catch (error) {
		console.error(`${LOG} Erro inesperado ao avaliar o aviso de gasto:`, error);
	}
}

export { ALERT_THRESHOLD as AI_SPEND_ALERT_THRESHOLD };
