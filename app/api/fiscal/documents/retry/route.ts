import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getErrorMessage } from "@/lib/errors";
import { enqueueFiscalDocument, getFiscalDocumentById } from "@/lib/fiscal/documents";
import { getFiscalDocumentAction, resolveFiscalDocumentActions } from "@/lib/fiscal/document-actions";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const RetryFiscalDocumentsInputSchema = z.object({
	documentIds: z
		.array(z.string({ invalid_type_error: "Tipo não válido para o ID do documento fiscal." }), {
			required_error: "IDs dos documentos fiscais não informados.",
			invalid_type_error: "Tipo não válido para os IDs dos documentos fiscais.",
		})
		.min(1, "Informe ao menos um documento fiscal.")
		.max(50, "Reenvie no máximo 50 documentos por vez."),
});
export type TRetryFiscalDocumentsInput = z.infer<typeof RetryFiscalDocumentsInputSchema>;

type RetryOutcome = { documentoId: string; sucesso: boolean; statusInterno: string | null; mensagem: string };

/**
 * Reenvio em lote: cada documento e re-preparado (prontidao + validacao) na hora, entao o
 * operador descobre imediatamente se a causa ainda esta de pe. O envio a SEFAZ fica com a fila,
 * que roda a cada 2 minutos.
 */
async function retryFiscalDocuments({
	input,
	organizationId,
	authorId,
}: {
	input: TRetryFiscalDocumentsInput;
	organizationId: string;
	authorId: string;
}) {
	const resultados: RetryOutcome[] = [];
	const organization = await loadFiscalOrganization(organizationId);
	for (const documentId of new Set(input.documentIds)) {
		const documento = await getFiscalDocumentById({ documentId, organizationId });
		if (!documento) {
			resultados.push({ documentoId: documentId, sucesso: false, statusInterno: null, mensagem: "Documento fiscal não encontrado." });
			continue;
		}
		const reenviar = getFiscalDocumentAction(resolveFiscalDocumentActions({ document: documento }), "REENVIAR");
		if (!reenviar.disponivel || !documento.vendaId || (documento.tipo !== "NFCE" && documento.tipo !== "NFE")) {
			resultados.push({
				documentoId: documento.id,
				sucesso: false,
				statusInterno: documento.statusInterno,
				mensagem: reenviar.motivoIndisponivel ?? "Reenvio indisponível.",
			});
			continue;
		}
		if (organization?.fiscalConfiguracao?.operacoesRevenda?.habilitada && documento.tipo === "NFE" && !documento.documentoOrigemId) {
			resultados.push({
				documentoId: documento.id,
				sucesso: false,
				statusInterno: documento.statusInterno,
				mensagem: "Abra o documento e revise a destinação e o crédito na emissão manual antes de reenviar.",
			});
			continue;
		}
		try {
			const result = await enqueueFiscalDocument({
				vendaId: documento.vendaId,
				tipo: documento.tipo,
				organizacaoId: organizationId,
				autorId: authorId,
				origem: "MANUAL",
				documentoOrigemId: documento.documentoOrigemId ?? null,
				chaveAcessoReferencia: documento.chaveAcessoReferencia ?? null,
			});
			resultados.push({
				documentoId: result.documentoId,
				sucesso: true,
				statusInterno: result.statusInterno,
				mensagem: "Documento reenfileirado para emissão.",
			});
		} catch (error) {
			resultados.push({ documentoId: documento.id, sucesso: false, statusInterno: "ERRO", mensagem: getErrorMessage(error) });
		}
	}
	const enviados = resultados.filter((item) => item.sucesso).length;
	return {
		data: { resultados, enviados, falhas: resultados.length - enviados },
		message:
			enviados === resultados.length
				? `${enviados} documento(s) reenfileirado(s) para emissão.`
				: `${enviados} reenfileirado(s), ${resultados.length - enviados} ainda com pendência.`,
	};
}
export type TRetryFiscalDocumentsOutput = Awaited<ReturnType<typeof retryFiscalDocuments>>;

async function retryFiscalDocumentsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const sessionMembership = session.membership;
	if (!sessionMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!sessionMembership.permissoes.fiscal.emitir)
		throw new createHttpError.Forbidden("Oops, você não possui permissão para emitir documentos fiscais.");

	const input = RetryFiscalDocumentsInputSchema.parse(await request.json());
	const result = await retryFiscalDocuments({ input, organizationId: sessionMembership.organizacao.id, authorId: session.user.id });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: retryFiscalDocumentsRoute });
