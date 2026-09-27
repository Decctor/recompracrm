/**
 * Gera o JSON de CURADORIA dos complementos do iFood contra os adicionais do cadastro.
 *
 * NÃO ESCREVE NADA — só lê o catálogo (GET) e o cadastro (SELECT).
 *
 * Uso:
 *   npx tsx scripts/ifood-suggest-option-links.ts --org=<organizationId> [--merchant=<id>] [--out=<arquivo>]
 *
 * O iFood copia o grupo de complementos para cada item ("Escolha seu gelato:" existe 6 vezes, com
 * ids de opção próprios em cada cópia). Por isso a curadoria é por GRUPO LÓGICO (nome normalizado)
 * e por OPÇÃO DISTINTA (nome normalizado dentro do grupo): cada linha junta todas as cópias, e o
 * vínculo que sair dela é muitos-para-um (N opções do iFood → 1 opção local).
 *
 * Para cada opção distinta, a sugestão de `acao`:
 * - VINCULAR     — já existe opção local com o mesmo nome no grupo local correspondente.
 * - REATIVAR     — existe no grupo local, mas inativa/excluída: reativar em vez de criar.
 * - CRIAR_OPCAO  — não existe opção no grupo; `candidato` pode apontar o produto (ex.: sabor como
 *                  matéria-prima) ao qual a opção nova deve ficar ligada.
 * - REVISAR      — há risco de duplicação: nome igual em OUTRO grupo local ativo, grafia
 *                  parecida no mesmo grupo, ou grupo local indefinido. Os `alertas` dizem qual.
 *
 * A curadoria humana edita `acao` e `candidato`; o apply lê o arquivo revisado.
 */
import "@/utils/scripts/load-next-env";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getIfoodCatalogs, getIfoodItemFlat, listIfoodCategories, listIfoodOptionGroups } from "@/lib/integrations/ifood/catalog";
import type { TIfoodOptionGroupDTO } from "@/lib/integrations/ifood/catalog-types";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { connection, db } from "@/services/drizzle";
import { organizations, productAddOns, products } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

// "(Zero adição de açúcar)" e "(Zero)" são a mesma coisa nos nomes do cardápio.
function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/adicao de acucar|sem acucar/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

const STOPWORDS = new Set(["de", "do", "da", "com", "e", "o", "a", "na", "no", "seu", "sua"]);
function tokens(value: string) {
	return new Set(
		normalize(value)
			.split(" ")
			.filter((token) => token && !STOPWORDS.has(token)),
	);
}

function similarity(a: string, b: string) {
	const tokensA = tokens(a);
	const tokensB = tokens(b);
	if (!tokensA.size || !tokensB.size) return 0;
	let intersection = 0;
	for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
	return Math.round((intersection / (tokensA.size + tokensB.size - intersection)) * 100) / 100;
}

function differsOnlyByZero(a: string, b: string) {
	const tokensA = tokens(a);
	const tokensB = tokens(b);
	const diff = [...tokensA].filter((token) => !tokensB.has(token)).concat([...tokensB].filter((token) => !tokensA.has(token)));
	return diff.length > 0 && diff.every((token) => token === "zero");
}

type TLocalOption = {
	tipo: "OPCAO";
	id: string;
	nome: string;
	grupoId: string;
	grupo: string;
	grupoAtivo: boolean;
	ativo: boolean;
	excluida: boolean;
	codigo: string | null;
	produtoId: string | null;
	precoDelta: number;
};

type TLocalProduct = {
	tipo: "PRODUTO";
	id: string;
	nome: string;
	grupo: string;
	ativo: boolean;
	vendavel: boolean;
	codigo: string | null;
};

async function main() {
	const orgId = getArgValue("org");
	if (!orgId) throw new Error("Informe --org=<organizationId>.");

	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { id: true, nome: true, slug: true } });
	if (!organization) throw new Error(`Organização ${orgId} não encontrada.`);

	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: getArgValue("merchant") });
	const merchantId = getArgValue("merchant") ?? context.merchantIds[0];
	if (!merchantId) throw new Error("Nenhuma loja iFood encontrada na conexão.");

	const remoteGroups: TIfoodOptionGroupDTO[] = [];
	for (let page = 1; ; page += 1) {
		const batch = await listIfoodOptionGroups(context.client, merchantId, { page, limit: 100 });
		remoteGroups.push(...batch);
		if (batch.length < 100) break;
	}

	// Cópias de grupo que algum item do cardápio usa. As demais são órfãs: o iFood as guarda, mas
	// nenhum cliente as alcança — vincular não muda nada, então viram IGNORAR.
	const usedGroupIds = new Set<string>();
	for (const catalog of await getIfoodCatalogs(context.client, merchantId)) {
		for (const category of await listIfoodCategories(context.client, merchantId, { catalogId: catalog.id })) {
			for (const item of category.itens) {
				if (!item.id) continue;
				const flat = await getIfoodItemFlat(context.client, merchantId, item.id);
				for (const group of flat.gruposComplementos) if (group.id) usedGroupIds.add(group.id);
			}
		}
	}

	const [localAddOns, localProductRows] = await Promise.all([
		db.query.productAddOns.findMany({
			where: eq(productAddOns.organizacaoId, orgId),
			columns: { id: true, nome: true, internoNome: true, ativo: true },
			with: {
				opcoes: { columns: { id: true, nome: true, ativo: true, dataExclusao: true, codigo: true, produtoId: true, precoDelta: true } },
			},
		}),
		db.query.products.findMany({
			where: eq(products.organizacaoId, orgId),
			columns: { id: true, nome: true, grupo: true, ativo: true, vendavel: true, codigo: true },
		}),
	]);

	const localOptions: TLocalOption[] = localAddOns.flatMap((addOn) =>
		addOn.opcoes.map((option) => ({
			tipo: "OPCAO" as const,
			id: option.id,
			nome: option.nome.trim(),
			grupoId: addOn.id,
			grupo: addOn.nome.trim(),
			grupoAtivo: addOn.ativo ?? true,
			ativo: option.ativo ?? true,
			excluida: !!option.dataExclusao,
			codigo: option.codigo,
			produtoId: option.produtoId,
			precoDelta: option.precoDelta,
		})),
	);
	const localProducts: TLocalProduct[] = localProductRows.map((product) => ({
		tipo: "PRODUTO" as const,
		id: product.id,
		nome: product.nome.trim(),
		grupo: product.grupo,
		ativo: product.ativo ?? true,
		vendavel: product.vendavel,
		codigo: product.codigo,
	}));
	const liveOption = (option: TLocalOption) => option.ativo && !option.excluida;

	// Grupos lógicos do iFood: as cópias por item compartilham o nome.
	const logicalGroups = new Map<string, TIfoodOptionGroupDTO[]>();
	for (const group of remoteGroups) {
		const key = normalize(group.nome ?? "");
		const list = logicalGroups.get(key) ?? [];
		list.push(group);
		logicalGroups.set(key, list);
	}

	const groups = [...logicalGroups.entries()].map(([key, allCopies]) => {
		const usedCopies = allCopies.filter((copy) => usedGroupIds.has(copy.id));
		const orfao = usedCopies.length === 0;
		const copies = orfao ? allCopies : usedCopies;
		// Opções distintas do grupo lógico, juntando as cópias em uso.
		const distinct = new Map<string, { nome: string; opcoes: { itemGrupoId: string; opcaoId: string; status: string | null; preco: number | null }[] }>();
		for (const copy of copies) {
			for (const option of copy.opcoes) {
				if (!option.id || !option.nome) continue;
				const optionKey = normalize(option.nome);
				const entry = distinct.get(optionKey) ?? { nome: option.nome.trim(), opcoes: [] };
				entry.opcoes.push({ itemGrupoId: copy.id, opcaoId: option.id, status: option.status, preco: option.preco });
				distinct.set(optionKey, entry);
			}
		}
		const distinctNames = [...distinct.keys()];

		// Grupo local correspondente: mesmo nome; senão, o grupo ATIVO com mais nomes de opção em comum.
		const byName = localAddOns.filter((addOn) => normalize(addOn.nome) === key);
		const pickedByName = byName.find((addOn) => addOn.ativo) ?? byName[0];
		let localGroup = pickedByName ?? null;
		let grupoMotivo = pickedByName ? "Mesmo nome." : "";
		if (!localGroup) {
			const scored = localAddOns
				.filter((addOn) => addOn.ativo)
				.map((addOn) => ({
					addOn,
					overlap: addOn.opcoes.filter((option) => distinctNames.includes(normalize(option.nome))).length,
				}))
				.sort((a, b) => b.overlap - a.overlap);
			if (scored[0] && scored[0].overlap >= Math.max(2, Math.ceil(distinctNames.length / 3))) {
				localGroup = scored[0].addOn;
				grupoMotivo = `Nome diferente, mas ${scored[0].overlap} de ${distinctNames.length} opções em comum.`;
			} else {
				grupoMotivo = "Nenhum grupo local corresponde — criar ou escolher manualmente.";
			}
		}

		const opcoes = [...distinct.entries()].map(([optionKey, entry]) => {
			const alertas: string[] = [];
			const inGroup = localGroup ? localOptions.filter((option) => option.grupoId === localGroup.id) : [];
			const exactInGroup = inGroup.filter((option) => normalize(option.nome) === optionKey);
			const exactLiveInGroup = exactInGroup.find(liveOption);
			const exactElsewhere = localOptions.filter((option) => option.grupoId !== localGroup?.id && normalize(option.nome) === optionKey);
			const exactProducts = localProducts.filter((product) => normalize(product.nome) === optionKey);
			const similarOptions = localOptions
				.filter((option) => normalize(option.nome) !== optionKey)
				.map((option) => ({ ...option, score: similarity(entry.nome, option.nome) }))
				.filter((option) => option.score >= 0.5)
				.sort((a, b) => b.score - a.score);
			const similarProducts = localProducts
				.filter((product) => normalize(product.nome) !== optionKey)
				.map((product) => ({ ...product, score: similarity(entry.nome, product.nome) }))
				.filter((product) => product.score >= 0.5)
				.sort((a, b) => b.score - a.score);

			let acao: "VINCULAR" | "REATIVAR" | "CRIAR_OPCAO" | "REVISAR";
			let candidato: TLocalOption | TLocalProduct | null = null;

			if (exactLiveInGroup) {
				acao = "VINCULAR";
				candidato = exactLiveInGroup;
				if (exactInGroup.filter(liveOption).length > 1) {
					acao = "REVISAR";
					alertas.push(`${exactInGroup.filter(liveOption).length} opções ativas com esse nome no mesmo grupo local.`);
				}
			} else if (exactInGroup.length) {
				// Já existe no grupo, só está inativa: reativar é o oposto de duplicar.
				acao = "REATIVAR";
				candidato = exactInGroup.find((option) => !option.excluida) ?? exactInGroup[0];
				if ((candidato as TLocalOption).excluida) alertas.push("A opção local está EXCLUÍDA (não só inativa).");
			} else {
				acao = "CRIAR_OPCAO";
				// Para a opção nova, o produto de mesmo nome (ex.: sabor matéria-prima) é o candidato natural.
				candidato = exactProducts.find((product) => product.ativo) ?? exactProducts[0] ?? null;
				if (!localGroup) {
					acao = "REVISAR";
					alertas.push("Grupo local ainda não definido.");
				}
				// Duplicação real só é possível contra opção VIVA em grupo ATIVO.
				const liveElsewhere = exactElsewhere.filter((option) => liveOption(option) && option.grupoAtivo);
				if (liveElsewhere.length) {
					acao = "REVISAR";
					alertas.push(`Mesmo nome em outro grupo local ativo: ${[...new Set(liveElsewhere.map((option) => option.grupo))].join(", ")} — é a mesma coisa ou só o mesmo nome?`);
				}
				// Nome quase igual NO MESMO grupo (ex.: grafia diferente). "X" × "X (Zero)" é sabor
				// diferente de propósito e não conta.
				const nearInGroup = similarOptions.filter(
					(option) => option.grupoId === localGroup?.id && option.score >= 0.6 && !differsOnlyByZero(entry.nome, option.nome),
				);
				if (nearInGroup.length) {
					acao = "REVISAR";
					alertas.push(`Nome parecido no mesmo grupo local: ${nearInGroup.slice(0, 3).map((option) => `"${option.nome}"${liveOption(option) ? "" : " (inativa)"}`).join(", ")} — grafia diferente do mesmo sabor?`);
				}
			}
			if (exactProducts.length > 1) alertas.push(`${exactProducts.length} produtos com esse nome no cadastro.`);

			const statuses = entry.opcoes.map((option) => option.status ?? "?");
			const precos = [...new Set(entry.opcoes.map((option) => option.preco ?? 0))];
			if (precos.length > 1) alertas.push(`Preço varia entre as cópias do iFood: ${precos.join(" / ")}.`);

			if (orfao) alertas.unshift("Grupo órfão no iFood (nenhum item usa) — ignorado.");

			return {
				acao: orfao ? ("IGNORAR" as const) : acao,
				nomeIfood: entry.nome,
				copias: entry.opcoes.length,
				statusIfood: {
					disponivel: statuses.filter((status) => status === "AVAILABLE").length,
					indisponivel: statuses.filter((status) => status !== "AVAILABLE").length,
				},
				precosIfood: precos,
				alertas,
				candidato,
				alternativas: {
					opcoesMesmoNomeOutrosGrupos: exactElsewhere.map(({ id, nome, grupo, ativo, excluida, produtoId }) => ({ id, nome, grupo, ativo, excluida, produtoId })),
					produtosMesmoNome: exactProducts,
					opcoesParecidas: similarOptions.slice(0, 3).map(({ id, nome, grupo, ativo, score }) => ({ id, nome, grupo, ativo, score })),
					produtosParecidos: similarProducts.slice(0, 3).map(({ id, nome, grupo, ativo, vendavel, score }) => ({ id, nome, grupo, ativo, vendavel, score })),
				},
				opcoesIfood: entry.opcoes,
			};
		});

		return {
			nomeIfood: copies[0].nome,
			orfao,
			copias: copies.length,
			copiasOrfas: allCopies.length - usedCopies.length,
			gruposIfoodIds: copies.map((copy) => copy.id),
			grupoLocal: localGroup ? { id: localGroup.id, nome: localGroup.nome, ativo: localGroup.ativo } : null,
			grupoMotivo,
			resumo: {
				opcoes: opcoes.length,
				vincular: opcoes.filter((option) => option.acao === "VINCULAR").length,
				reativar: opcoes.filter((option) => option.acao === "REATIVAR").length,
				criar: opcoes.filter((option) => option.acao === "CRIAR_OPCAO").length,
				revisar: opcoes.filter((option) => option.acao === "REVISAR").length,
				ignorar: opcoes.filter((option) => option.acao === "IGNORAR").length,
			},
			opcoes,
		};
	});

	groups.sort((a, b) => b.resumo.opcoes - a.resumo.opcoes);
	const allOptions = groups.flatMap((group) => group.opcoes);

	const output = {
		geradoEm: new Date().toISOString(),
		organizacao: organization,
		merchantId,
		legenda: {
			acao: "VINCULAR = opção local já existe no grupo; REATIVAR = existe no grupo mas inativa (reativar e vincular); CRIAR_OPCAO = criar opção no grupo local (ligada a `candidato` se for PRODUTO); REVISAR = risco de duplicação, ver `alertas`. Edite `acao` (VINCULAR | REATIVAR | CRIAR_OPCAO | IGNORAR) e `candidato`.",
			grupoLocal: "Grupo local que recebe as opções. null = criar ou escolher manualmente.",
			copias: "Quantas opções do iFood (uma por cópia do grupo) serão ligadas à mesma opção local.",
		},
		resumo: {
			gruposIfood: remoteGroups.length,
			gruposLogicos: groups.length,
			gruposOrfaos: groups.filter((group) => group.orfao).length,
			gruposSemCorrespondenteLocal: groups.filter((group) => !group.grupoLocal && !group.orfao).length,
			opcoesIfood: allOptions.reduce((sum, option) => sum + option.copias, 0),
			opcoesDistintas: allOptions.length,
			vincular: allOptions.filter((option) => option.acao === "VINCULAR").length,
			reativar: allOptions.filter((option) => option.acao === "REATIVAR").length,
			criar: allOptions.filter((option) => option.acao === "CRIAR_OPCAO").length,
			revisar: allOptions.filter((option) => option.acao === "REVISAR").length,
			ignorar: allOptions.filter((option) => option.acao === "IGNORAR").length,
		},
		grupos: groups,
	};

	const outPath = resolve(getArgValue("out") ?? `./.local-analysis/ifood/curadoria-complementos-${organization.slug}.json`);
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, JSON.stringify(output, null, 2), { encoding: "utf-8" });

	console.log(`Arquivo gerado: ${outPath}`);
	console.log(output.resumo);
	for (const group of groups) {
		console.log(`  ${group.orfao ? "[ÓRFÃO] " : ""}${group.copias}x "${group.nomeIfood}" → ${group.grupoLocal ? `"${group.grupoLocal.nome}"` : "—"}  ${JSON.stringify(group.resumo)}`);
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
