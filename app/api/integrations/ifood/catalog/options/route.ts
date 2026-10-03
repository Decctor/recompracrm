import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { addIfoodOptions, assertIfoodOptionPatches, patchIfoodOptionsPrice, patchIfoodOptionsStatus } from "@/lib/integrations/ifood/catalog-items";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { canManageIntegrations } from "@/lib/integrations/mask";
import { IFOOD_CATALOG_TITLE_MAX_LENGTH, IfoodCatalogStatusEnum, type TIfoodCatalogStatusEnum } from "@/schemas/enums";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ---------------------------------------------------------------------------
// POST — adiciona opções a um grupo de complementos
// ---------------------------------------------------------------------------

const CreateIfoodOptionsInputSchema = z.object({
	merchantId: z
		.string({
			required_error: "ID da loja do iFood não informado.",
			invalid_type_error: "Tipo inválido para o ID da loja do iFood.",
		})
		.min(1, "ID da loja do iFood não informado."),
	optionGroupId: z
		.string({
			required_error: "ID do grupo de complementos não informado.",
			invalid_type_error: "Tipo inválido para o ID do grupo de complementos.",
		})
		.min(1, "ID do grupo de complementos não informado."),
	opcoes: z
		.array(
			z.object({
				nome: z
					.string({
						required_error: "Nome da opção não informado.",
						invalid_type_error: "Tipo inválido para o nome da opção.",
					})
					.trim()
					.min(1, "Nome da opção não informado.")
					.max(IFOOD_CATALOG_TITLE_MAX_LENGTH, `O nome da opção não pode passar de ${IFOOD_CATALOG_TITLE_MAX_LENGTH} caracteres.`),
				preco: z
					.number({ invalid_type_error: "Tipo inválido para o preço da opção." })
					.min(0, "Preço da opção não pode ser negativo.")
					.optional()
					.nullable(),
				codigoExterno: z.string({ invalid_type_error: "Tipo inválido para o código externo da opção." }).optional().nullable(),
				status: IfoodCatalogStatusEnum.optional().nullable(),
			}),
			{
				required_error: "Opções não informadas.",
				invalid_type_error: "Tipo inválido para as opções.",
			},
		)
		.min(1, "Informe ao menos uma opção."),
});
export type TCreateIfoodOptionsInput = z.infer<typeof CreateIfoodOptionsInputSchema>;

async function createIfoodOptionsService({ input, session }: { input: TCreateIfoodOptionsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id as string;
	const context = await resolveIfoodManagementContext({ organizacaoId, merchantId: input.merchantId });
	await addIfoodOptions(context.client, input.merchantId, input.optionGroupId, input.opcoes);
	return { data: { optionGroupId: input.optionGroupId }, message: "Opções adicionadas com sucesso no iFood." };
}
export type TCreateIfoodOptionsOutput = Awaited<ReturnType<typeof createIfoodOptionsService>>;

async function createIfoodOptionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para gerenciar a integração do iFood.");
	if (!session.membership?.organizacao.id)
		throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização para gerenciar a integração do iFood.");
	if (!canManageIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para gerenciar integrações.");

	const input = CreateIfoodOptionsInputSchema.parse(await request.json());
	const result = await createIfoodOptionsService({ input, session });
	return NextResponse.json(result);
}

// ---------------------------------------------------------------------------
// PATCH — atualiza preço ou status de opções em lote
// ---------------------------------------------------------------------------

const PatchIfoodOptionsInputSchema = z.object({
	merchantId: z
		.string({
			required_error: "ID da loja do iFood não informado.",
			invalid_type_error: "Tipo inválido para o ID da loja do iFood.",
		})
		.min(1, "ID da loja do iFood não informado."),
	tipo: z.enum(["PRECO", "STATUS"], {
		required_error: "Tipo da atualização de opções não informado.",
		invalid_type_error: "Tipo inválido para a atualização de opções.",
	}),
	opcoes: z
		.array(
			z.object({
				optionId: z
					.string({
						required_error: "ID da opção não informado.",
						invalid_type_error: "Tipo inválido para o ID da opção.",
					})
					.min(1, "ID da opção não informado."),
				preco: z
					.number({ invalid_type_error: "Tipo inválido para o preço da opção." })
					.min(0, "Preço da opção não pode ser negativo.")
					.optional()
					.nullable(),
				status: IfoodCatalogStatusEnum.optional().nullable(),
			}),
			{
				required_error: "Opções não informadas.",
				invalid_type_error: "Tipo inválido para as opções.",
			},
		)
		.min(1, "Informe ao menos uma opção."),
});
export type TPatchIfoodOptionsInput = z.infer<typeof PatchIfoodOptionsInputSchema>;

async function patchIfoodOptionsService({ input, session }: { input: TPatchIfoodOptionsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id as string;
	const context = await resolveIfoodManagementContext({ organizacaoId, merchantId: input.merchantId });

	if (input.tipo === "PRECO") {
		const opcoes = input.opcoes.filter((opcao) => opcao.preco != null).map((opcao) => ({ optionId: opcao.optionId, preco: opcao.preco as number }));
		if (!opcoes.length) throw new createHttpError.BadRequest("Nenhuma opção com preço informado.");
		assertIfoodOptionPatches(await patchIfoodOptionsPrice(context.client, input.merchantId, opcoes));
		return { data: { atualizadas: opcoes.length }, message: "Preços das opções atualizados com sucesso no iFood." };
	}

	const opcoes = input.opcoes
		.filter((opcao) => opcao.status != null)
		.map((opcao) => ({ optionId: opcao.optionId, status: opcao.status as TIfoodCatalogStatusEnum }));
	if (!opcoes.length) throw new createHttpError.BadRequest("Nenhuma opção com status informado.");
	assertIfoodOptionPatches(await patchIfoodOptionsStatus(context.client, input.merchantId, opcoes));
	return { data: { atualizadas: opcoes.length }, message: "Status das opções atualizados com sucesso no iFood." };
}
export type TPatchIfoodOptionsOutput = Awaited<ReturnType<typeof patchIfoodOptionsService>>;

async function patchIfoodOptionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para gerenciar a integração do iFood.");
	if (!session.membership?.organizacao.id)
		throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização para gerenciar a integração do iFood.");
	if (!canManageIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para gerenciar integrações.");

	const input = PatchIfoodOptionsInputSchema.parse(await request.json());
	const result = await patchIfoodOptionsService({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createIfoodOptionsRoute });
export const PATCH = appApiHandler({ PATCH: patchIfoodOptionsRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
