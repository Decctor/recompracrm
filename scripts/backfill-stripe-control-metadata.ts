import "dotenv/config";
import { connection, db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { getStripeClient, resolveStripeAccount } from "@/services/stripe";
import { isNotNull } from "drizzle-orm";

/**
 * Backfill do metadata `ctrl_*` nos customers Stripe criados antes da convenção.
 *
 * O Control (Syncroniza) identifica vendas/assinaturas do RecompraCRM pelo
 * metadata `ctrl_organizacao_id`/`ctrl_email`/`ctrl_phone` — checkouts novos já
 * o gravam; este script cobre a base histórica, tornando o matching 100%
 * determinístico (sem depender de IA/heurística para clientes antigos).
 *
 * Idempotente: `customers.update` com metadata faz merge por chave — re-rodar
 * apenas regrava os mesmos valores. Não altera nenhum dado local.
 *
 * Dry-run por padrão; passe `--apply` para persistir no Stripe.
 *
 * Uso:
 *   npm run backfill:stripe-control-metadata            # dry-run
 *   npm run backfill:stripe-control-metadata -- --apply
 */
async function main() {
	const apply = process.argv.includes("--apply");

	const rows = await db.query.organizations.findMany({
		where: isNotNull(organizations.stripeCustomerId),
		columns: { id: true, nome: true, email: true, telefone: true, stripeConta: true, stripeCustomerId: true },
	});

	console.log(`${rows.length} organização(ões) com customer Stripe${apply ? "" : " [DRY RUN — use --apply para gravar]"}`);

	let updated = 0;
	let failed = 0;

	for (const organization of rows) {
		if (!organization.stripeCustomerId) continue;

		const metadata: Record<string, string> = {
			organizationId: organization.id,
			ctrl_organizacao_id: organization.id,
			ctrl_organizacao_nome: organization.nome,
		};
		if (organization.email) metadata.ctrl_email = organization.email;
		if (organization.telefone) metadata.ctrl_phone = organization.telefone;

		if (!apply) {
			console.log(`  [DRY] ${organization.stripeCustomerId} ← ${organization.nome} (${organization.id})`);
			continue;
		}

		try {
			await getStripeClient(resolveStripeAccount(organization.stripeConta)).customers.update(organization.stripeCustomerId, { metadata });
			updated++;
		} catch (error) {
			failed++;
			console.error(`  [ERRO] ${organization.stripeCustomerId} (${organization.nome}):`, error instanceof Error ? error.message : error);
		}
	}

	if (apply) console.log(`Concluído: ${updated} atualizado(s), ${failed} falha(s).`);
}

main()
	.catch((error) => {
		console.error("[BACKFILL-STRIPE-METADATA] Falha:", error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
