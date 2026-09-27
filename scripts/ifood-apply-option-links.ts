/**
 * Aplica a curadoria de complementos (`scripts/ifood-suggest-option-links.ts`) com as decisões
 * humanas codificadas abaixo: cria as opções locais que faltam e grava os vínculos muitos-para-um
 * (drizzle/0116) — um vínculo ADD_ON por cópia do grupo EM USO no iFood e um ADD_ON_OPCAO por option.
 *
 * Uso:
 *   npx tsx scripts/ifood-apply-option-links.ts --file=<curadoria.json> [--confirm]
 *
 * Sem `--confirm` só mostra o plano. NÃO empurra nada para o iFood: os vínculos nascem PENDENTE e o
 * primeiro push de disponibilidade é um passo separado (pausa no iFood as opções inativas daqui).
 *
 * Políticas:
 * - Grupo (cópia): só mapeamento — nome/disponibilidade/criarOpcoes desligados. A cópia é do
 *   catálogo legado; completar ou renomear a partir daqui mexeria na montagem feita no Portal.
 * - Opção: só disponibilidade. Nome e preço seguem geridos no Portal (decisão do lojista).
 *
 * Idempotente: opção a criar que já exista viva no grupo é reaproveitada; vínculos são upserts.
 */
import "@/utils/scripts/load-next-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { listAllIfoodOptionGroups } from "@/lib/integrations/ifood/sync/add-ons";
import { upsertCatalogLink } from "@/lib/integrations/ifood/sync/links";
import type { TCatalogLinkSyncPolicy } from "@/schemas/catalog-links";
import { connection, db } from "@/services/drizzle";
import { productAddOnOptions, productAddOns } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { isHttpError } from "http-errors";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

const GROUP_POLICY: TCatalogLinkSyncPolicy = {
	nome: false,
	descricao: false,
	imagem: false,
	preco: false,
	disponibilidade: false,
	complementos: false,
	criarOpcoes: false,
};
const OPTION_POLICY: TCatalogLinkSyncPolicy = { ...GROUP_POLICY, disponibilidade: true };

const norm = (value: string | null | undefined) =>
	(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

type TTarget = { kind: "existing"; grupo: string; opcao: string } | { kind: "create"; grupo: string; nome: string } | { kind: "skip"; motivo: string };

const GELATO = "Escolha seu gelato:";
const COOKIE = "Escolha seu cookie favorito:";
const COBERTURA = "Escolha sua cobertura favorita:";

/**
 * Decisões do lojista (2026-09-27) sobre o que a curadoria marcou para revisão. A chave é o nome da
 * option no iFood, normalizado; `localGroup` é o grupo interno para onde a cópia foi mapeada.
 */
function decide(ifoodName: string, localGroup: string | null): TTarget | null {
	const name = norm(ifoodName);
	if (name === "pistache") {
		// Sabor Pistache = a opção de "Escolha o sabor:"; Pistache de cobertura é outra coisa.
		return localGroup === COBERTURA ? { kind: "create", grupo: COBERTURA, nome: "Pistache" } : { kind: "existing", grupo: "Escolha o sabor:", opcao: "Pistache" };
	}
	const table: Record<string, TTarget> = {
		"kinder bueno com avela": { kind: "existing", grupo: GELATO, opcao: "Kinder Bueno" },
		"acai zero": { kind: "existing", grupo: GELATO, opcao: "Açaí (Zero adição de açúcar e Zero Lactose)" },
		"extrablack zero": { kind: "existing", grupo: GELATO, opcao: "Extrablack (Zero adição de açúcar e Zero Lactose)" },
		"cookie pistache": { kind: "existing", grupo: COOKIE, opcao: "Cookie de Pistache" },
		"cookie tradicional de chocolate": { kind: "existing", grupo: COOKIE, opcao: "Cookie Tradicional" },
		"brownie de chocolate": { kind: "existing", grupo: "Escolha seu brownie:", opcao: "Brownie de Chocolate" },
		banoffee: { kind: "existing", grupo: GELATO, opcao: "Banoffe" },
		"cheesecake pistache": { kind: "create", grupo: GELATO, nome: "Cheesecake de Pistache" },
		"cheesecake de pistache": { kind: "create", grupo: GELATO, nome: "Cheesecake de Pistache" },
		// Sabor ≠ cobertura: opção nova no grupo de sabores, separada das de "adicionais".
		morango: { kind: "create", grupo: GELATO, nome: "Morango" },
		"leite ninho": { kind: "create", grupo: GELATO, nome: "Leite Ninho" },
		// A bebida do upsell já existe localmente com o rótulo "310ml" (o iFood diz 350ml): mesma
		// opção — criar outra duplicaria o Guaraná no grupo.
		"guarana antartica 350ml": { kind: "existing", grupo: "Que tal uma bebida?", opcao: "Guaraná Antartica - 310ml" },
		"guarana antarctica zero 350ml": { kind: "existing", grupo: "Que tal uma bebida?", opcao: "Guaraná Antartica Zero - 310ml" },
	};
	return table[name] ?? null;
}

/**
 * Grupos em que TODA opção viva aponta para um produto (estoque/relatório): opção nova ali segue a
 * convenção e herda o produto de mesmo nome que a curadoria achou. No grupo de sabores a convenção
 * é mista e o homônimo costuma ser o insumo errado ("Morango" = a fruta), então não herda.
 */
const GROUPS_WITH_PRODUCT_CONVENTION = new Set([COOKIE, COBERTURA, "Que tal uma bebida?"]);

type TCuration = {
	organizacao: { id: string; nome: string };
	merchantId: string;
	grupos: {
		nomeIfood: string;
		orfao: boolean;
		gruposIfoodIds: string[];
		grupoLocal: { id: string; nome: string } | null;
		opcoes: {
			acao: "VINCULAR" | "REATIVAR" | "CRIAR_OPCAO" | "REVISAR" | "IGNORAR";
			nomeIfood: string;
			candidato: { tipo: "OPCAO" | "PRODUTO"; id: string; nome: string } | null;
			opcoesIfood: { itemGrupoId: string; opcaoId: string; status: string | null; preco: number | null }[];
		}[];
	}[];
};

async function main() {
	const file = getArgValue("file");
	if (!file) throw new Error("Informe --file=<curadoria.json>.");
	const confirm = process.argv.includes("--confirm");
	const curation = JSON.parse(readFileSync(resolve(file), "utf-8")) as TCuration;
	const orgId = curation.organizacao.id;
	const merchantId = curation.merchantId;
	console.log(`${confirm ? "APLICANDO" : "SIMULAÇÃO (use --confirm para gravar)"} — ${curation.organizacao.nome}, loja ${merchantId}\n`);

	// Estado atual: grupos/opções locais e o catálogo remoto (ids podem ter mudado desde a curadoria).
	const localGroups = await db.query.productAddOns.findMany({
		where: eq(productAddOns.organizacaoId, orgId),
		columns: { id: true, nome: true },
		with: { opcoes: { columns: { id: true, nome: true, ativo: true, dataExclusao: true } } },
	});
	const groupByName = new Map(localGroups.map((group) => [group.nome.trim(), group]));
	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId });
	const remoteGroups = await listAllIfoodOptionGroups(context.client, merchantId);
	const remoteOption = new Map(remoteGroups.flatMap((group) => group.opcoes.map((option) => [`${group.id}|${option.id}`, option] as const)));

	const findOption = (grupoNome: string, opcaoNome: string) => {
		const group = groupByName.get(grupoNome);
		if (!group) throw new Error(`Grupo local "${grupoNome}" não existe.`);
		const matches = group.opcoes.filter((opcao) => norm(opcao.nome) === norm(opcaoNome));
		const best =
			matches.find((opcao) => opcao.ativo !== false && !opcao.dataExclusao) ?? matches.find((opcao) => !opcao.dataExclusao) ?? matches[0];
		return best ? { id: best.id, grupoId: group.id } : null;
	};

	// 1. Resolve o alvo local de cada option remota em uso.
	type TCreate = { grupoId: string; grupo: string; nome: string; precos: number[]; disponivel: boolean; produtoId: string | null; produtoNome: string | null };
	const creates = new Map<string, TCreate>();
	const links: { externoOptionGroupId: string; externoOptionId: string; target: { optionId: string; grupoId: string } | { createKey: string } }[] = [];
	const groupLinks: { grupoId: string; grupo: string; externoOptionGroupId: string }[] = [];
	const unresolved: string[] = [];
	let reactivateSkipped = 0;

	for (const group of curation.grupos) {
		if (group.orfao || !group.grupoLocal) continue;
		for (const copyId of group.gruposIfoodIds) groupLinks.push({ grupoId: group.grupoLocal.id, grupo: group.grupoLocal.nome, externoOptionGroupId: copyId });

		for (const option of group.opcoes) {
			if (option.acao === "IGNORAR") continue;
			let target: TTarget | null = decide(option.nomeIfood, group.grupoLocal.nome);
			if (!target) {
				if ((option.acao === "VINCULAR" || option.acao === "REATIVAR") && option.candidato?.tipo === "OPCAO") {
					if (option.acao === "REATIVAR") reactivateSkipped += 1;
					const local = localGroups.flatMap((local) => local.opcoes.map((opcao) => ({ opcao, grupoId: local.id }))).find((entry) => entry.opcao.id === option.candidato?.id);
					if (local) {
						for (const copy of option.opcoesIfood) links.push({ externoOptionGroupId: copy.itemGrupoId, externoOptionId: copy.opcaoId, target: { optionId: local.opcao.id, grupoId: local.grupoId } });
						continue;
					}
				}
				if (option.acao === "CRIAR_OPCAO") target = { kind: "create", grupo: group.grupoLocal.nome, nome: option.nomeIfood.trim() };
			}
			if (!target) {
				unresolved.push(`[${group.nomeIfood}] ${option.nomeIfood} (${option.acao})`);
				continue;
			}
			if (target.kind === "skip") continue;
			if (target.kind === "existing") {
				const local = findOption(target.grupo, target.opcao);
				if (!local) {
					unresolved.push(`[${group.nomeIfood}] ${option.nomeIfood} → "${target.opcao}" não encontrada em "${target.grupo}"`);
					continue;
				}
				for (const copy of option.opcoesIfood) links.push({ externoOptionGroupId: copy.itemGrupoId, externoOptionId: copy.opcaoId, target: { optionId: local.id, grupoId: local.grupoId } });
				continue;
			}
			const localGroup = groupByName.get(target.grupo);
			if (!localGroup) {
				unresolved.push(`Grupo local "${target.grupo}" não existe (para "${target.nome}")`);
				continue;
			}
			const createKey = `${localGroup.id}|${norm(target.nome)}`;
			const product = GROUPS_WITH_PRODUCT_CONVENTION.has(localGroup.nome) && option.candidato?.tipo === "PRODUTO" ? option.candidato : null;
			const entry = creates.get(createKey) ?? {
				grupoId: localGroup.id,
				grupo: localGroup.nome,
				nome: target.nome,
				precos: [],
				disponivel: false,
				produtoId: product?.id ?? null,
				produtoNome: product?.nome ?? null,
			};
			for (const copy of option.opcoesIfood) {
				entry.precos.push(copy.preco ?? 0);
				// Nasce ativa se está à venda em alguma cópia: o push inicial não pode pausar o que vende hoje.
				if (copy.status === "AVAILABLE") entry.disponivel = true;
				links.push({ externoOptionGroupId: copy.itemGrupoId, externoOptionId: copy.opcaoId, target: { createKey } });
			}
			creates.set(createKey, entry);
		}
	}

	if (unresolved.length) {
		console.log("SEM DECISÃO — nada foi gravado:");
		for (const line of unresolved) console.log(`  ? ${line}`);
		process.exitCode = 1;
		return;
	}

	// Remotas que sumiram desde a curadoria: fora do plano, listadas.
	const missingRemote = links.filter((link) => !remoteOption.has(`${link.externoOptionGroupId}|${link.externoOptionId}`));
	const liveLinks = links.filter((link) => remoteOption.has(`${link.externoOptionGroupId}|${link.externoOptionId}`));

	const mostCommon = (values: number[]) => {
		const counts = new Map<number, number>();
		for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
	};

	console.log(`Opções locais a criar: ${creates.size}`);
	for (const entry of creates.values()) {
		const precos = [...new Set(entry.precos)];
		console.log(`  + [${entry.grupo}] ${entry.nome}  precoDelta ${mostCommon(entry.precos)}${precos.length > 1 ? ` (cópias: ${precos.join("/")})` : ""}  ${entry.disponivel ? "ativa" : "INATIVA (indisponível no iFood)"}${entry.produtoNome ? `  → produto "${entry.produtoNome}"` : ""}`);
	}
	console.log(`Vínculos de grupo (cópias em uso): ${groupLinks.length}`);
	console.log(`Vínculos de opção: ${liveLinks.length}${missingRemote.length ? ` (${missingRemote.length} options sumiram do iFood desde a curadoria — ignoradas)` : ""}`);
	console.log(`Opções locais INATIVAS vinculadas sem reativar: ${reactivateSkipped} linhas da curadoria (serão pausadas no iFood no push inicial)`);
	if (!confirm) return;

	// 2. Cria as opções (reaproveita opção viva de mesmo nome — rerun não duplica).
	const createdIds = new Map<string, string>();
	for (const [key, entry] of creates) {
		const existing = findOption(entry.grupo, entry.nome);
		const live = existing && localGroups.find((group) => group.id === existing.grupoId)?.opcoes.find((opcao) => opcao.id === existing.id && !opcao.dataExclusao);
		if (live) {
			createdIds.set(key, live.id);
			continue;
		}
		const [inserted] = await db
			.insert(productAddOnOptions)
			.values({
				organizacaoId: orgId,
				produtoAddOnId: entry.grupoId,
				nome: entry.nome,
				precoDelta: mostCommon(entry.precos),
				ativo: entry.disponivel,
				produtoId: entry.produtoId,
			})
			.returning({ id: productAddOnOptions.id });
		createdIds.set(key, inserted.id);
	}

	// 3. Vínculos de grupo, depois de opção.
	let groupDone = 0;
	for (const link of groupLinks) {
		await upsertCatalogLink({
			orgId,
			merchantId,
			node: { tipo: "ADD_ON", produtoAddOnId: link.grupoId },
			externalRefs: { externoOptionGroupId: link.externoOptionGroupId },
			sincronizar: GROUP_POLICY,
		});
		groupDone += 1;
	}

	let optionDone = 0;
	const conflicts: string[] = [];
	for (const link of liveLinks) {
		const target =
			"createKey" in link.target
				? { optionId: createdIds.get(link.target.createKey) as string, grupoId: creates.get(link.target.createKey)?.grupoId as string }
				: link.target;
		const remote = remoteOption.get(`${link.externoOptionGroupId}|${link.externoOptionId}`);
		try {
			await upsertCatalogLink({
				orgId,
				merchantId,
				node: { tipo: "ADD_ON_OPCAO", produtoAddOnId: target.grupoId, produtoAddOnOpcaoId: target.optionId },
				externalRefs: { externoOptionGroupId: link.externoOptionGroupId, externoOptionId: link.externoOptionId, externoProdutoId: remote?.produtoId ?? null },
				sincronizar: OPTION_POLICY,
			});
			optionDone += 1;
		} catch (error) {
			if (isHttpError(error) && error.status === 409) {
				conflicts.push(`${remote?.nome ?? link.externoOptionId}: ${error.message}`);
				continue;
			}
			throw error;
		}
	}

	console.log(`\nCriadas ${[...createdIds.values()].length} opções; ${groupDone} vínculos de grupo; ${optionDone} vínculos de opção.`);
	if (conflicts.length) {
		console.log(`${conflicts.length} options já vinculadas a outra opção (mantidas):`);
		for (const line of conflicts) console.log(`  ! ${line}`);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
