import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { requireIntegrationManageSession } from "@/lib/integrations/ifood/sync/guards";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { importIfoodItem } from "@/lib/integrations/ifood/sync/import";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ImportIfoodItemInputSchema = z.object({
	merchantId: z.string({ required_error: "ID da loja não informado.", invalid_type_error: "Tipo não válido para ID da loja." }).min(1),
	itemId: z.string({ required_error: "ID do item não informado.", invalid_type_error: "Tipo não válido para ID do item." }).min(1),
});
export type TImportIfoodItemInput = z.infer<typeof ImportIfoodItemInputSchema>;

async function importItem({ orgId, userId, input }: { orgId: string; userId: string; input: TImportIfoodItemInput }) {
	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: input.merchantId });
	const result = await importIfoodItem({
		client: context.client,
		orgId,
		integracaoId: context.integrationId,
		merchantId: input.merchantId,
		itemId: input.itemId,
		autorId: userId,
	});
	return {
		data: result,
		message: result.criouProduto ? "Item importado e produto criado com sucesso." : "Item vinculado ao produto existente com o mesmo código.",
	};
}
export type TImportIfoodItemOutput = Awaited<ReturnType<typeof importItem>>;

async function importItemRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = ImportIfoodItemInputSchema.parse(await request.json());
	const result = await importItem({ orgId, userId: session.user.id, input });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: importItemRoute });
