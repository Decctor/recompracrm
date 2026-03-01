import type { TFiscalDocumentStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { fiscalDocuments } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import type { IFiscalProvider, TCancelarDocumentoResult, TEmitirDocumentoInput, TEmitirDocumentoResult } from "../types";

/**
 * ManualFiscalProvider — creates a fiscal document record with PENDENTE status.
 * The actual emission is handled manually by the operator or by a future provider integration.
 */
export class ManualFiscalProvider implements IFiscalProvider {
	async emitirDocumento(input: TEmitirDocumentoInput): Promise<TEmitirDocumentoResult> {
		const [inserted] = await db
			.insert(fiscalDocuments)
			.values({
				organizacaoId: input.organizacao.id,
				vendaId: input.venda.id,
				lancamentoContabilId: input.lancamentoContabilId ?? null,
				tipo: input.tipo,
				status: "PENDENTE",
			})
			.returning({
				id: fiscalDocuments.id,
			});

		return {
			documentoId: inserted.id,
			status: "PENDENTE",
		};
	}

	async consultarStatus(documentoId: string): Promise<TFiscalDocumentStatusEnum> {
		const doc = await db.query.fiscalDocuments.findFirst({
			where: (fields, { eq }) => eq(fields.id, documentoId),
			columns: { status: true },
		});

		if (!doc) throw new Error(`Documento fiscal ${documentoId} não encontrado.`);
		return doc.status;
	}

	async cancelarDocumento(documentoId: string, _motivo: string): Promise<TCancelarDocumentoResult> {
		await db.update(fiscalDocuments).set({ status: "CANCELADA" }).where(eq(fiscalDocuments.id, documentoId));

		return {
			documentoId,
			status: "CANCELADA",
		};
	}
}
