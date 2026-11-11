import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { listInboundDocuments } from "@/lib/fiscal/inbound";
import { INBOUND_WITHOUT_MANIFEST_FILTER } from "@/lib/fiscal/inbound/registration-status";
import { DEFAULT_PAGE_SIZE, pageSizeInputSchema } from "@/lib/pagination";
import {
	FiscalInboundManifestEventEnum,
	FiscalInboundRegistrationStatusEnum,
	type TFiscalInboundManifestEventEnum,
	type TFiscalInboundRegistrationStatusEnum,
} from "@/schemas/enums";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetInboundDocumentsInputSchema = z.object({
	page: z.coerce.number().min(1).default(1),
	pageSize: pageSizeInputSchema(),
	search: z.string({ invalid_type_error: "Tipo não válido para busca." }).optional().nullable(),
	registrationStatuses: z
		.string({ invalid_type_error: "Tipo não válido para situação da nota." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : []))
		.refine((val) => val.every((v) => FiscalInboundRegistrationStatusEnum.safeParse(v).success), {
			message: "Situação da nota inválida.",
			path: ["registrationStatuses"],
		})
		.transform((val) => val as TFiscalInboundRegistrationStatusEnum[]),
	periodAfter: z
		.string({ invalid_type_error: "Tipo não válido para o início do período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo não válido para o fim do período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	supplierIds: z
		.string({ invalid_type_error: "Tipo não válido para fornecedores." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	manifestations: z
		.string({ invalid_type_error: "Tipo não válido para manifestação." })
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : []))
		.refine((val) => val.every((v) => v === INBOUND_WITHOUT_MANIFEST_FILTER || FiscalInboundManifestEventEnum.safeParse(v).success), {
			message: "Manifestação inválida.",
			path: ["manifestations"],
		})
		.transform((val) => val as (TFiscalInboundManifestEventEnum | typeof INBOUND_WITHOUT_MANIFEST_FILTER)[]),
	valueMin: z
		.string({ invalid_type_error: "Tipo não válido para valor mínimo." })
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	valueMax: z
		.string({ invalid_type_error: "Tipo não válido para valor máximo." })
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
});
export type TGetInboundDocumentsInput = z.infer<typeof GetInboundDocumentsInputSchema>;

async function getInboundDocuments({ orgId, input }: { orgId: string; input: TGetInboundDocumentsInput }) {
	const { page, pageSize, ...filters } = input;
	const result = await listInboundDocuments({ organizationId: orgId, page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE, filters });
	return { data: { default: result }, message: "Notas recebidas encontradas com sucesso." };
}
export type TGetInboundDocumentsOutput = Awaited<ReturnType<typeof getInboundDocuments>>;
export type TGetInboundDocumentsOutputDefault = NonNullable<TGetInboundDocumentsOutput["data"]["default"]>;

async function getInboundDocumentsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership?.permissoes.fiscal.visualizar)
		throw new createHttpError.Forbidden("Oops, você não possui permissão para visualizar o módulo fiscal.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetInboundDocumentsInputSchema.parse({
		page: searchParams.get("page") ?? 1,
		pageSize: searchParams.get("pageSize"),
		search: searchParams.get("search"),
		registrationStatuses: searchParams.get("registrationStatuses"),
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
		supplierIds: searchParams.get("supplierIds"),
		manifestations: searchParams.get("manifestations"),
		valueMin: searchParams.get("valueMin"),
		valueMax: searchParams.get("valueMax"),
	});
	const result = await getInboundDocuments({ orgId, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getInboundDocumentsRoute });
