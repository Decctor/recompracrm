import "dotenv/config";
import { RecompraCRMDefaultAccountCharts, type TOnboardingAccountChartNode } from "@/config/onboarding";
import { connection, db } from "@/services/drizzle";
import { accountsCharts } from "@/services/drizzle/schema";

// Cria, nas organizações que já existiam, as contas de destino de compra que entraram no plano padrão
// depois do onboarding delas: Imobilizado (1.6, com 1.6.1 e 1.6.2), Manutenção e Reparos (6.6) e
// Material de Uso e Consumo (6.7). Ver lib/purchase/destination.ts.
//
// Uma conta só é criada quando o código está livre no plano da organização. Código ocupado por outra
// conta (plano personalizado) é relatado e pulado — nunca renomeado nem reaproveitado.
//
// Uso:
//   npx tsx ./scripts/provision-purchase-destination-accounts.ts            (simulação)
//   npx tsx ./scripts/provision-purchase-destination-accounts.ts --apply    (grava)
//   ... --org=<organizacaoId>                                               (uma organização só)

const DESTINATION_KEYS = new Set(["imobilizado", "maquinas_moveis_equipamentos", "benfeitorias_imoveis_terceiros", "manutencao_reparos", "material_uso_consumo"]);

type TSeedEntry = { node: TOnboardingAccountChartNode; parentCode: string | null };

function collectDestinationSeeds(nodes: TOnboardingAccountChartNode[], parentCode: string | null = null, acc: TSeedEntry[] = []) {
	for (const node of nodes) {
		if (DESTINATION_KEYS.has(node.key)) acc.push({ node, parentCode });
		if (node.children) collectDestinationSeeds(node.children, node.codigo, acc);
	}
	return acc;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const orgFilter = process.argv.find((arg) => arg.startsWith("--org="))?.slice("--org=".length) ?? null;
	// Pais antes dos filhos: 1.6 precisa existir quando 1.6.1 for criada.
	const seeds = collectDestinationSeeds(RecompraCRMDefaultAccountCharts).sort((a, b) => a.node.codigo.length - b.node.codigo.length);

	const organizations = await db.query.organizations.findMany({
		where: orgFilter ? (fields, { eq }) => eq(fields.id, orgFilter) : undefined,
		columns: { id: true, nome: true },
	});
	console.log(`${apply ? "Aplicando" : "Simulando"} em ${organizations.length} organização(ões).`);

	let created = 0;
	let skipped = 0;
	for (const organization of organizations) {
		await db.transaction(async (tx) => {
			const accounts = await tx.query.accountsCharts.findMany({
				where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
				columns: { id: true, nome: true, codigo: true },
			});
			const byCode = new Map(accounts.filter((account) => account.codigo).map((account) => [account.codigo as string, account]));
			for (const { node, parentCode } of seeds) {
				const existing = byCode.get(node.codigo);
				if (existing) {
					if (existing.nome.trim().toLowerCase() !== node.nome.toLowerCase()) {
						skipped++;
						console.log(`  [${organization.nome}] código ${node.codigo} já usado por "${existing.nome}" — "${node.nome}" não criada.`);
					}
					continue;
				}
				const parentId = parentCode ? (byCode.get(parentCode)?.id ?? null) : null;
				created++;
				console.log(`  [${organization.nome}] ${apply ? "criando" : "criaria"} ${node.codigo} ${node.nome}${parentId ? "" : " (sem conta pai)"}`);
				if (!apply) {
					// Na simulação, o pai "existe" para os filhos serem relatados corretamente.
					byCode.set(node.codigo, { id: `simulado-${node.codigo}`, nome: node.nome, codigo: node.codigo });
					continue;
				}
				const [inserted] = await tx
					.insert(accountsCharts)
					.values({ organizacaoId: organization.id, nome: node.nome, codigo: node.codigo, natureza: node.natureza, idContaPai: parentId })
					.returning({ id: accountsCharts.id, nome: accountsCharts.nome, codigo: accountsCharts.codigo });
				if (inserted) byCode.set(node.codigo, inserted);
			}
		});
	}

	console.log(`${apply ? "Criadas" : "Seriam criadas"}: ${created}. Puladas por código ocupado: ${skipped}.`);
	await connection.end();
}

main().catch(async (error) => {
	console.error("Falha ao provisionar contas de destino de compra:", error);
	await connection.end();
	process.exit(1);
});
