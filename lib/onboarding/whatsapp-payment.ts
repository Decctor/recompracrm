import { notifyControlWhatsappPaymentPending } from "@/lib/control/notices";
import { db } from "@/services/drizzle";
import { campaigns, whatsappConnectionPhones } from "@/services/drizzle/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { reconcileOnboardingCampaigns } from "./reconcile";
import { UNCHANGED_PAYMENT_RECONCILE_INTERVAL_MS, resolvePaymentObservation, shouldReconcileAfterPaymentObservation } from "./payment-observation";

// Primeiro filtro, sem banco: cada instância olha cada organização no máximo uma vez por janela.
// A trava durável (`acquireUnchangedPaymentReconcileLease`) decide entre as instâncias.
const lastReconcileAtByOrganization = new Map<string, number>();

export async function observeWhatsappPayment({
	whatsappPhoneNumberId,
	status,
	errors,
	timestamp,
}: {
	whatsappPhoneNumberId?: string;
	status: string;
	errors?: Array<{ code?: number }>;
	timestamp: number;
}) {
	const payment = resolvePaymentObservation({ status, errors });
	if (!payment || !whatsappPhoneNumberId || !Number.isFinite(timestamp)) return;
	const phone = await db.query.whatsappConnectionPhones.findFirst({
		where: eq(whatsappConnectionPhones.whatsappTelefoneId, whatsappPhoneNumberId),
		columns: { id: true, metadados: true },
		with: { conexao: { columns: { organizacaoId: true, tipoConexao: true } } },
	});
	if (!phone || phone.conexao.tipoConexao !== "META_CLOUD_API") return;
	const updatedAt = new Date(timestamp).toISOString();
	const metadata = JSON.stringify({ status: payment, atualizadoEm: updatedAt, ...(payment === "PENDENTE" ? { ultimoErroCodigo: "131042" } : {}) });
	// A gravação segue a cada observação: a guarda de `atualizadoEm` depende dela para um PENDENTE
	// atrasado não sobrescrever um VERIFICADO mais novo.
	await db
		.update(whatsappConnectionPhones)
		.set({
			metadados: sql`jsonb_set(coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb), '{pagamento}', ${metadata}::jsonb, true)`,
		})
		.where(
			and(
				eq(whatsappConnectionPhones.id, phone.id),
				sql`coalesce(${whatsappConnectionPhones.metadados}->'pagamento'->>'atualizadoEm', '') <= ${updatedAt}`,
			),
		);

	const organizationId = phone.conexao.organizacaoId;
	const now = Date.now();
	const paymentChanged = phone.metadados?.pagamento?.status !== payment;
	// Só na transição para PENDENTE: o time do Control ajuda a cadastrar o pagamento na Meta antes
	// que a primeira campanha trave. Chave diária no Control; nunca lança.
	if (paymentChanged && payment === "PENDENTE") await notifyControlWhatsappPaymentPending({ organizationId, telefoneId: phone.id });
	if (
		!shouldReconcileAfterPaymentObservation({
			previousStatus: phone.metadados?.pagamento?.status,
			payment,
			lastReconcileAt: lastReconcileAtByOrganization.get(organizationId),
			now,
		})
	) {
		return;
	}
	lastReconcileAtByOrganization.set(organizationId, now);
	try {
		// A reconciliação só lê e liga/desliga campanhas semeadas por preset. Sem nenhuma, ela não
		// muda nada — e custaria ~14 consultas, entre elas contagens sobre todas as vendas.
		if (!(await hasPresetCampaigns(organizationId))) return;
		// Mudança de pagamento reconcilia sempre; sem mudança, só a instância que levar a trava.
		if (!paymentChanged && !(await acquireUnchangedPaymentReconcileLease({ phoneId: phone.id, now }))) return;
		await reconcileOnboardingCampaigns({ executor: db, organizationId });
	} catch (error) {
		// Falhou: a próxima observação tenta de novo em vez de esperar a janela.
		lastReconcileAtByOrganization.delete(organizationId);
		throw error;
	}
}

async function hasPresetCampaigns(organizationId: string) {
	const campaign = await db.query.campaigns.findFirst({
		where: and(eq(campaigns.organizacaoId, organizationId), isNotNull(campaigns.chavePreset)),
		columns: { id: true },
	});
	return !!campaign;
}

// Avança `reconciliacaoOnboardingEm` só se ele for mais velho que a janela. O UPDATE condicional é
// atômico: entre instâncias que chegam juntas, uma leva a linha e as outras saem sem reconciliar.
async function acquireUnchangedPaymentReconcileLease({ phoneId, now }: { phoneId: string; now: number }) {
	const nowIso = new Date(now).toISOString();
	const cutoffIso = new Date(now - UNCHANGED_PAYMENT_RECONCILE_INTERVAL_MS).toISOString();
	const acquired = await db
		.update(whatsappConnectionPhones)
		.set({
			metadados: sql`jsonb_set(coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb), '{reconciliacaoOnboardingEm}', to_jsonb(${nowIso}::text), true)`,
		})
		.where(
			and(
				eq(whatsappConnectionPhones.id, phoneId),
				sql`coalesce(${whatsappConnectionPhones.metadados}->>'reconciliacaoOnboardingEm', '') <= ${cutoffIso}`,
			),
		)
		.returning({ id: whatsappConnectionPhones.id });
	return acquired.length > 0;
}
