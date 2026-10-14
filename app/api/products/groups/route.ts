import { appApiHandler } from "@/lib/app-api";
import { requireOrgSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { catalogLinks, couponTargets, preparationStationRules, products, salesChannels } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// `products.grupo` é texto livre: não há entidade de grupo, então renomear é reescrever o mesmo
// texto em todo lugar que o referencia por nome. Os pontos abaixo são o inventário disso hoje —
// qualquer coluna nova que case com `products.grupo` precisa entrar aqui, senão o vínculo se perde
// silenciosamente no dia em que alguém corrigir um acento.
const RenameProductGroupInputSchema = z.object({
	grupoAtual: z
		.string({
			required_error: "Grupo atual não informado.",
			invalid_type_error: "Tipo não válido para grupo atual.",
		})
		.min(1, { message: "Grupo atual não informado." }),
	grupoNovo: z
		.string({
			required_error: "Novo nome do grupo não informado.",
			invalid_type_error: "Tipo não válido para novo nome do grupo.",
		})
		.trim()
		.min(1, { message: "Informe o novo nome do grupo." }),
});
export type TRenameProductGroupInput = z.infer<typeof RenameProductGroupInputSchema>;

/**
 * Os grupos que a organização já usa. Não há tabela de grupos: a lista é o DISTINCT do texto livre
 * do cadastro, e existe para que escolher um grupo existente seja mais fácil do que digitar de novo
 * — é a digitação repetida que cria "Bebidas" e "bebidas " como dois grupos.
 */
async function getProductGroups({ orgId }: { orgId: string }) {
	const rows = await db.selectDistinct({ grupo: products.grupo }).from(products).where(eq(products.organizacaoId, orgId)).orderBy(products.grupo);

	return {
		data: { groups: rows.map((row) => row.grupo).filter((grupo) => grupo && grupo.trim().length > 0) },
		message: "Grupos de produtos carregados com sucesso.",
	};
}
export type TGetProductGroupsOutput = Awaited<ReturnType<typeof getProductGroups>>;

async function renameProductGroup({ orgId, input }: { orgId: string; input: TRenameProductGroupInput }) {
	const { grupoAtual, grupoNovo } = input;
	if (grupoAtual === grupoNovo) throw new createHttpError.BadRequest("O novo nome é igual ao atual.");

	const affected = await db
		.select({ id: products.id })
		.from(products)
		.where(and(eq(products.organizacaoId, orgId), eq(products.grupo, grupoAtual)));
	if (affected.length === 0) throw new createHttpError.NotFound("Nenhum produto encontrado nesse grupo.");

	// Renomear para um grupo que já existe é uma FUSÃO, e é intencional: é assim que se corrige um
	// cadastro que virou dois grupos por acento ou espaço sobrando. A tela avisa antes de enviar.
	const channels = await db.query.salesChannels.findMany({
		where: eq(salesChannels.organizacaoId, orgId),
		columns: { id: true, ordemGrupos: true },
	});
	const channelsToUpdate = channels
		.filter((channel) => channel.ordemGrupos.includes(grupoAtual))
		.map((channel) => ({
			id: channel.id,
			// A fusão pode gerar o mesmo nome duas vezes na ordem; a posição que vale é a primeira.
			ordemGrupos: channel.ordemGrupos
				.map((grupo) => (grupo === grupoAtual ? grupoNovo : grupo))
				.filter((grupo, index, list) => list.indexOf(grupo) === index),
		}));

	await db.transaction(async (tx) => {
		await tx
			.update(products)
			.set(withProductUpdateStamp({ grupo: grupoNovo }))
			.where(and(eq(products.organizacaoId, orgId), eq(products.grupo, grupoAtual)));

		// Alvos de cupom casam por nome (`coupon_targets.grupo`): sem esta reescrita, um cupom de
		// grupo pararia de valer sem nenhum sinal na tela do cupom.
		await tx
			.update(couponTargets)
			.set({ grupo: grupoNovo })
			.where(and(eq(couponTargets.organizacaoId, orgId), eq(couponTargets.grupo, grupoAtual)));

		// Vínculos de categoria do iFood guardam o grupo interno por nome. Só o vínculo é corrigido:
		// levar o nome novo até o iFood é trabalho do push, que detecta a divergência pelo snapshot.
		await tx
			.update(catalogLinks)
			.set({ grupoInterno: grupoNovo })
			.where(and(eq(catalogLinks.organizacaoId, orgId), eq(catalogLinks.tipo, "CATEGORIA"), eq(catalogLinks.grupoInterno, grupoAtual)));

		// Regras GRUPO das estações de preparo casam por nome (sem caixa e sem espaços nas pontas,
		// como o resolver). Na fusão, se o grupo de destino já tem estação, a dele prevalece e a regra
		// do grupo antigo sai — um grupo pertence a no máximo uma estação.
		const groupRuleOf = (grupo: string) =>
			and(
				eq(preparationStationRules.organizacaoId, orgId),
				eq(preparationStationRules.criterio, "GRUPO"),
				sql`lower(trim(${preparationStationRules.valor}->>'grupo')) = lower(trim(${grupo}))`,
			);
		const sameNormalizedGroup = grupoAtual.trim().toLocaleLowerCase("pt-BR") === grupoNovo.trim().toLocaleLowerCase("pt-BR");
		const [targetStationRule] = sameNormalizedGroup
			? []
			: await tx.select({ id: preparationStationRules.id }).from(preparationStationRules).where(groupRuleOf(grupoNovo)).limit(1);
		// A regra casa sem caixa/espaços, mas o rename só move o texto exato: se sobrou produto com
		// outra grafia do grupo antigo ("bebidas "), a regra antiga continua valendo para ele e o
		// grupo novo ganha uma cópia — senão esses produtos cairiam na estação padrão em silêncio.
		const [remainingOldGroupProduct] = sameNormalizedGroup
			? []
			: await tx
					.select({ id: products.id })
					.from(products)
					.where(and(eq(products.organizacaoId, orgId), sql`lower(trim(${products.grupo})) = lower(trim(${grupoAtual}))`))
					.limit(1);
		if (remainingOldGroupProduct) {
			if (!targetStationRule) {
				// Um grupo pertence a no máximo uma estação: a cópia vai para a mesma, uma vez só.
				const [oldRule] = await tx
					.select({ estacaoId: preparationStationRules.estacaoId })
					.from(preparationStationRules)
					.where(groupRuleOf(grupoAtual))
					.limit(1);
				if (oldRule)
					await tx.insert(preparationStationRules).values({
						organizacaoId: orgId,
						estacaoId: oldRule.estacaoId,
						criterio: "GRUPO",
						valor: { criterio: "GRUPO", grupo: grupoNovo },
					});
			}
		} else if (targetStationRule) await tx.delete(preparationStationRules).where(groupRuleOf(grupoAtual));
		else
			await tx
				.update(preparationStationRules)
				.set({ valor: { criterio: "GRUPO", grupo: grupoNovo } })
				.where(groupRuleOf(grupoAtual));

		for (const channel of channelsToUpdate) {
			await tx.update(salesChannels).set({ ordemGrupos: channel.ordemGrupos, dataAtualizacao: new Date() }).where(eq(salesChannels.id, channel.id));
		}
	});

	return {
		data: { grupo: grupoNovo, produtosAtualizados: affected.length },
		message: `Grupo renomeado em ${affected.length === 1 ? "1 produto" : `${affected.length} produtos`}.`,
	};
}
export type TRenameProductGroupOutput = Awaited<ReturnType<typeof renameProductGroup>>;

async function getProductGroupsRoute() {
	const session = requireOrgSession(await getCurrentSessionUncached());
	const result = await getProductGroups({ orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function renameProductGroupRoute(request: NextRequest) {
	const session = requireOrgSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = RenameProductGroupInputSchema.parse(await request.json());
	const result = await renameProductGroup({ orgId, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductGroupsRoute });
export const PUT = appApiHandler({ PUT: renameProductGroupRoute });
