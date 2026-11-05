import "dotenv/config";
import { materializeERPPermissions } from "@/lib/permissions/erp-backfill";
import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import { connection, db } from "@/services/drizzle";
import { organizationMembers, organizationMembershipInvitations } from "@/services/drizzle/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

// Backfill das permissões granulares do ERP (caixa, configuração de vendas, produtos, estoque e
// produção). Roda uma vez depois do deploy que as introduziu; o fallback em lib/permissions/* cobre
// o intervalo até lá e quem ficar de fora. Grava exatamente o que o fallback já resolvia, então
// ninguém ganha nem perde acesso — a partir daí o gestor restringe pela tela de permissões.
//
// Uso: npm run backfill:erp-permissions            (simulação, não grava)
//      npm run backfill:erp-permissions -- --apply  (grava)
//
// Cada linha é atualizada com trava otimista (`permissoes` igual ao que foi lido): se um gestor
// editar o membro durante a execução, a linha é pulada e basta rodar de novo.

type TTarget = {
	label: string;
	rows: { id: string; organizacaoId: string; permissoes: TOrganizationMemberPermissions }[];
	update: (args: { id: string; previous: TOrganizationMemberPermissions; next: TOrganizationMemberPermissions }) => Promise<number>;
};

async function main() {
	const apply = process.argv.includes("--apply");

	const targets: TTarget[] = [
		{
			label: "membros",
			rows: await db
				.select({ id: organizationMembers.id, organizacaoId: organizationMembers.organizacaoId, permissoes: organizationMembers.permissoes })
				.from(organizationMembers),
			update: async ({ id, previous, next }) => {
				const updated = await db
					.update(organizationMembers)
					.set({ permissoes: next })
					.where(and(eq(organizationMembers.id, id), sql`${organizationMembers.permissoes} = ${JSON.stringify(previous)}::jsonb`))
					.returning({ id: organizationMembers.id });
				return updated.length;
			},
		},
		{
			// Convites ainda não aceitos: viram membership com estas permissões.
			label: "convites pendentes",
			rows: await db
				.select({
					id: organizationMembershipInvitations.id,
					organizacaoId: organizationMembershipInvitations.organizacaoId,
					permissoes: organizationMembershipInvitations.permissoes,
				})
				.from(organizationMembershipInvitations)
				.where(isNull(organizationMembershipInvitations.dataEfetivacao)),
			update: async ({ id, previous, next }) => {
				const updated = await db
					.update(organizationMembershipInvitations)
					.set({ permissoes: next })
					.where(
						and(
							eq(organizationMembershipInvitations.id, id),
							sql`${organizationMembershipInvitations.permissoes} = ${JSON.stringify(previous)}::jsonb`,
						),
					)
					.returning({ id: organizationMembershipInvitations.id });
				return updated.length;
			},
		},
	];

	for (const target of targets) {
		let pending = 0;
		let written = 0;
		let skipped = 0;

		for (const row of target.rows) {
			const next = materializeERPPermissions(row.permissoes);
			if (!next) continue;
			pending += 1;
			if (!apply) continue;

			const count = await target.update({ id: row.id, previous: row.permissoes, next });
			if (count === 1) {
				written += 1;
			} else {
				skipped += 1;
				console.warn(`[${target.label}] ${row.id} (org ${row.organizacaoId}) mudou durante o backfill; rode novamente.`);
			}
		}

		if (apply) {
			console.log(`[${target.label}] ${written} atualizado(s), ${skipped} pulado(s), ${target.rows.length - pending} já completo(s).`);
		} else {
			console.log(`[${target.label}] ${pending} de ${target.rows.length} seriam atualizado(s).`);
		}
	}

	if (!apply) console.log("Simulação: nada foi gravado. Execute novamente com --apply para persistir.");
}

main()
	.catch((error) => {
		console.error("Falha no backfill das permissões do ERP:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
