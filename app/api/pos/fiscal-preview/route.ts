import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getFiscalDocumentPreview } from "@/lib/fiscal/document-preview";
import { DeliveryModeEnum } from "@/schemas/enums";
import { SaleFiscalDocumentSchema } from "@/schemas/fiscal";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetFiscalPreviewInputSchema = z.object({
	clienteId: z.string({ required_error: "Cliente não informado.", invalid_type_error: "Cliente inválido." }).optional().nullable(),
	entregaLocalizacaoId: z.string({ required_error: "Endereço não informado.", invalid_type_error: "Endereço inválido." }).optional().nullable(),
	entregaModalidade: DeliveryModeEnum.default("PRESENCIAL"),
	canal: z.string({ required_error: "Canal não informado.", invalid_type_error: "Canal inválido." }).optional().nullable(),
	emissaoFiscalDocumento: SaleFiscalDocumentSchema.optional(),
	saleId: z.string({ required_error: "Venda não informada.", invalid_type_error: "Venda inválida." }).optional().nullable(),
});
export type TGetFiscalPreviewInput = z.infer<typeof GetFiscalPreviewInputSchema>;

async function getFiscalPreview({ input, session }: { input: TGetFiscalPreviewInput; session: TAuthUserSession }) {
	const membership = session.membership;
	if (!membership) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!membership.organizacao.configuracao.recursos.erp.acesso)
		throw new createHttpError.Forbidden("O módulo ERP não está disponível para esta organização.");
	if (!membership.permissoes.vendas.criar && !membership.permissoes.vendas.editar && !membership.permissoes.fiscal.emitir) {
		throw new createHttpError.Forbidden("Você não tem permissão para consultar a emissão desta venda.");
	}
	const preview = await getFiscalDocumentPreview({ ...input, organizationId: membership.organizacao.id });
	return {
		data: { ...preview, podeAlterar: !!membership.permissoes.fiscal.emitir && !preview.documentoExistente },
		message: "Previsão fiscal consultada com sucesso.",
	};
}
export type TGetFiscalPreviewOutput = Awaited<ReturnType<typeof getFiscalPreview>>;

async function getFiscalPreviewRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const params = request.nextUrl.searchParams;
	const input = GetFiscalPreviewInputSchema.parse({
		clienteId: params.get("clienteId"),
		entregaLocalizacaoId: params.get("entregaLocalizacaoId"),
		entregaModalidade: params.get("entregaModalidade") ?? undefined,
		canal: params.get("canal"),
		emissaoFiscalDocumento: params.get("emissaoFiscalDocumento"),
		saleId: params.get("saleId"),
	});
	return NextResponse.json(await getFiscalPreview({ input, session }));
}
export const GET = appApiHandler({ GET: getFiscalPreviewRoute });
