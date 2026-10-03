import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { emitFiscalDocument, getFiscalDocumentDetailsById, listFiscalDocumentEvents, listFiscalDocuments } from "@/lib/fiscal/documents";
import { decorateFiscalDocuments } from "@/lib/fiscal/document-actions-loader";
import { FiscalDocumentsFiltersSchema } from "@/lib/fiscal/document-filters";
import { resolveEmissionDocumentType } from "@/lib/fiscal/document-type";
import {
	EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH,
	EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH,
	getExceptionalPresenceRestriction,
} from "@/lib/fiscal/exceptional-presence";
import { blocksNewManualFiscalEmission } from "@/lib/fiscal/manual-emission-policy";
import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import { FiscalDocumentTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

async function requireOrgSession() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return { session, orgId };
}

const GetFiscalDocumentsInputSchema = FiscalDocumentsFiltersSchema.extend({
	documentId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do documento fiscal.",
		})
		.optional()
		.nullable(),
	page: z.coerce.number().min(1).default(1),
});
export type TGetFiscalDocumentsInput = z.infer<typeof GetFiscalDocumentsInputSchema>;

async function getFiscalDocuments({ input }: { input: TGetFiscalDocumentsInput }) {
	const { session, orgId } = await requireOrgSession();

	const userHasFiscalViewPermission = session.membership?.permissoes.fiscal.visualizar;
	if (!userHasFiscalViewPermission) throw new createHttpError.Forbidden("Oops, você não possui permissão para visualizar o módulo fiscal.");

	if (input.documentId) {
		const document = await getFiscalDocumentDetailsById({
			documentId: input.documentId,
			organizationId: orgId,
		});
		if (!document || document.organizacaoId !== orgId) throw new createHttpError.NotFound("Documento fiscal não encontrado.");
		const [events, organizacao] = await Promise.all([
			listFiscalDocumentEvents({ documentId: document.id, organizationId: orgId }),
			loadFiscalOrganization(orgId),
		]);
		// `acoes` e `problemas` estendem o documento: o que pode ser feito (e por que nao) e o que
		// travou (com alvo). A UI nao recalcula nada disso.
		const [decorated] = await decorateFiscalDocuments({
			documents: [document],
			organizationId: orgId,
			provider: organizacao?.fiscalProvedor,
		});
		return {
			data: {
				byId: {
					document: decorated,
					events,
				},
				default: null,
			},
			message: "Documento fiscal encontrado com sucesso.",
		};
	}

	const [result, organizacao] = await Promise.all([
		listFiscalDocuments({
			organizacaoId: orgId,
			page: input.page,
			filters: input,
		}),
		loadFiscalOrganization(orgId),
	]);
	const documents = await decorateFiscalDocuments({
		documents: result.documents,
		organizationId: orgId,
		provider: organizacao?.fiscalProvedor,
	});
	return {
		data: {
			byId: null,
			default: { ...result, documents },
		},
		message: "Documentos fiscais encontrados com sucesso.",
	};
}
export type TGetFiscalDocumentsOutput = Awaited<ReturnType<typeof getFiscalDocuments>>;
export type TGetFiscalDocumentsOutputById = NonNullable<TGetFiscalDocumentsOutput["data"]["byId"]>;
export type TGetFiscalDocumentsOutputDefault = NonNullable<TGetFiscalDocumentsOutput["data"]["default"]>;
async function getFiscalDocumentsRoute(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const input = GetFiscalDocumentsInputSchema.parse({
		documentId: searchParams.get("documentId") ?? undefined,
		page: searchParams.get("page") ?? 1,
		search: searchParams.get("search") ?? undefined,
		statusInterno: searchParams.get("statusInterno") ?? undefined,
		tipos: searchParams.get("tipos") ?? undefined,
		ambiente: searchParams.get("ambiente") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
	});
	const result = await getFiscalDocuments({ input });
	return NextResponse.json(result);
}

const EmitFiscalDocumentInputSchema = z.object({
	vendaId: z.string({
		required_error: "ID da venda não informado.",
		invalid_type_error: "Tipo não válido para o ID da venda.",
	}),
	tipo: FiscalDocumentTypeEnum.extract(["NFCE", "NFE"]).optional(),
	classificacaoPresencialExcepcional: z
		.object({
			confirmada: z.literal(true),
			justificativa: z
				.string({
					required_error: "Justificativa da classificação presencial não informada.",
					invalid_type_error: "Tipo não válido para a justificativa da classificação presencial.",
				})
				.trim()
				.min(
					EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH,
					`A justificativa deve ter ao menos ${EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH} caracteres.`,
				)
				.max(
					EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH,
					`A justificativa deve ter no máximo ${EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH} caracteres.`,
				),
		})
		.optional(),
});
export type TEmitFiscalDocumentInput = z.infer<typeof EmitFiscalDocumentInputSchema>;

async function createFiscalDocument({ input }: { input: TEmitFiscalDocumentInput }) {
	const { session, orgId } = await requireOrgSession();
	const userHasFiscalEmitPermission = session.membership?.permissoes.fiscal.emitir;
	if (!userHasFiscalEmitPermission) throw new createHttpError.Forbidden("Oops, você não possui permissão para emitir documentos fiscais.");

	const saleBelongsToOrg = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.vendaId), eq(fields.organizacaoId, orgId)),
		with: {
			cliente: { columns: { cpfCnpj: true } },
			documentosFiscais: { columns: { statusInterno: true } },
		},
	});
	if (!saleBelongsToOrg) throw new createHttpError.NotFound("Venda não encontrada para emissão fiscal.");
	const fiscalOrganization = await loadFiscalOrganization(orgId);
	if (input.classificacaoPresencialExcepcional) {
		if (saleBelongsToOrg.statusVenda !== "CONFIRMADA") {
			throw new createHttpError.BadRequest("Apenas vendas confirmadas podem usar a classificação presencial excepcional.");
		}
		const restriction = getExceptionalPresenceRestriction({
			origem: "MANUAL",
			habilitada: fiscalOrganization?.fiscalConfiguracao?.emissaoManual?.classificacaoPresencialExcepcional?.habilitada ?? false,
			podeConfigurarFiscal: !!session.user.admin || !!session.membership?.permissoes.fiscal.configurar,
			entregaModalidade: saleBelongsToOrg.entregaModalidade,
		});
		if (restriction?.code === "MISSING_PERMISSION") throw new createHttpError.Forbidden(restriction.message);
		if (restriction) throw new createHttpError.BadRequest(restriction.message);
	}
	if (!input.tipo) {
		if (saleBelongsToOrg.statusVenda !== "CONFIRMADA") {
			throw new createHttpError.BadRequest("Apenas vendas confirmadas podem emitir nota fiscal.");
		}
		const hasActiveFiscalDocument = saleBelongsToOrg.documentosFiscais.some((document) => blocksNewManualFiscalEmission(document.statusInterno));
		if (hasActiveFiscalDocument) {
			throw new createHttpError.Conflict("Esta venda já possui um documento fiscal ativo.");
		}
	}
	const tipo =
		input.tipo ??
		(await resolveEmissionDocumentType({
			organizacaoId: orgId,
			operacaoPadraoNfeId: fiscalOrganization?.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE ?? null,
			signals: {
				canal: saleBelongsToOrg.canal,
				entregaModalidade: saleBelongsToOrg.entregaModalidade,
				destinatarioCpfCnpj: saleBelongsToOrg.cliente?.cpfCnpj,
			},
		}));

	const result = await emitFiscalDocument({
		vendaId: input.vendaId,
		tipo,
		organizacaoId: orgId,
		autorId: session.user.id,
		origem: "MANUAL",
		classificacaoPresencaExcepcional: input.classificacaoPresencialExcepcional
			? {
					presencaConsumidor: "OPERACAO_PRESENCIAL",
					justificativa: input.classificacaoPresencialExcepcional.justificativa,
					autorId: session.user.id,
					dataDeclaracao: new Date(),
				}
			: null,
	});
	return {
		data: result,
		message: "Documento fiscal emitido com sucesso.",
	};
}
export type TCreateFiscalDocumentOutput = Awaited<ReturnType<typeof createFiscalDocument>>;

async function createFiscalDocumentRoute(request: NextRequest) {
	const payload = await request.json();
	const input = EmitFiscalDocumentInputSchema.parse(payload);
	const result = await createFiscalDocument({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFiscalDocumentsRoute });
export const POST = appApiHandler({ POST: createFiscalDocumentRoute });
