import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { storePrivateFile } from "@/lib/files-storage/private";
import {
	PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES,
	PLATFORM_PARTNER_DOCUMENT_MAX_BYTES,
	getPlatformPartnerDocumentPrefix,
} from "@/lib/platform-partnerships/documents";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CreatePlatformPartnerDocumentFieldsSchema = z.object({
	tipo: z.enum(["cpf", "cnpj"], {
		required_error: "Tipo do documento não informado.",
		invalid_type_error: "Tipo do documento inválido.",
	}),
});
export type TCreatePlatformPartnerDocumentInput = z.infer<typeof CreatePlatformPartnerDocumentFieldsSchema> & { file: File };

async function createPlatformPartnerDocument({ input, userId }: { input: TCreatePlatformPartnerDocumentInput; userId: string }) {
	const extension = PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES[input.file.type];
	if (!extension) throw new createHttpError.BadRequest("Envie o documento em PDF ou foto (JPG, PNG, WEBP ou HEIC).");
	if (input.file.size > PLATFORM_PARTNER_DOCUMENT_MAX_BYTES) throw new createHttpError.BadRequest("O documento pode ter até 10 MB.");
	if (input.file.size === 0) throw new createHttpError.BadRequest("O arquivo enviado está vazio.");

	const path = `${getPlatformPartnerDocumentPrefix(userId)}${input.tipo}-${crypto.randomUUID()}.${extension}`;
	const caminho = await storePrivateFile({ path, data: await input.file.arrayBuffer(), contentType: input.file.type });

	return {
		data: {
			tipo: input.tipo,
			caminho,
			nomeArquivo: input.file.name,
			tamanhoBytes: input.file.size,
		},
		message: "Documento enviado com sucesso.",
	};
}
export type TCreatePlatformPartnerDocumentOutput = Awaited<ReturnType<typeof createPlatformPartnerDocument>>;

async function createPlatformPartnerDocumentRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const formData = await request.formData();
	const fields = CreatePlatformPartnerDocumentFieldsSchema.parse({ tipo: formData.get("tipo") });
	const file = formData.get("file");
	if (!(file instanceof File)) throw new createHttpError.BadRequest("Arquivo do documento não informado.");

	const result = await createPlatformPartnerDocument({ input: { ...fields, file }, userId: session.user.id });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createPlatformPartnerDocumentRoute });
