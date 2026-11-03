import { db } from "@/services/drizzle";
import { whatsappConnectionPhones } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { reconcileOnboardingCampaigns } from "./reconcile";
import { resolvePaymentObservation, shouldReconcileAfterPaymentObservation } from "./payment-observation";

const lastReconcileAtByOrganization = new Map<string, number>();

export async function observeWhatsappPayment({ whatsappPhoneNumberId, status, errors, timestamp }: {
 whatsappPhoneNumberId?: string; status: string; errors?: Array<{ code?: number }>; timestamp: number;
}) {
 const payment = resolvePaymentObservation({ status, errors });
 if (!payment || !whatsappPhoneNumberId || !Number.isFinite(timestamp)) return;
 const phone = await db.query.whatsappConnectionPhones.findFirst({ where: eq(whatsappConnectionPhones.whatsappTelefoneId, whatsappPhoneNumberId), with: { conexao: true } });
 if (!phone || phone.conexao.tipoConexao !== "META_CLOUD_API") return;
 const updatedAt = new Date(timestamp).toISOString();
 const metadata = JSON.stringify({ status: payment, atualizadoEm: updatedAt, ...(payment === "PENDENTE" ? { ultimoErroCodigo: "131042" } : {}) });
 // A gravação segue a cada observação: a guarda de `atualizadoEm` depende dela para um PENDENTE
 // atrasado não sobrescrever um VERIFICADO mais novo.
 await db.update(whatsappConnectionPhones).set({
  metadados: sql`jsonb_set(coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb), '{pagamento}', ${metadata}::jsonb, true)`,
 }).where(and(eq(whatsappConnectionPhones.id, phone.id), sql`coalesce(${whatsappConnectionPhones.metadados}->'pagamento'->>'atualizadoEm', '') <= ${updatedAt}`));

 const organizationId = phone.conexao.organizacaoId;
 const now = Date.now();
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
  await reconcileOnboardingCampaigns({ executor: db, organizationId });
 } catch (error) {
  // Falhou: a próxima observação tenta de novo em vez de esperar a janela.
  lastReconcileAtByOrganization.delete(organizationId);
  throw error;
 }
}
