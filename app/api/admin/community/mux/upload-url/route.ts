import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { createMuxDirectUpload } from "@/lib/mux/upload";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function createUploadUrlRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const { uploadId, uploadUrl } = await createMuxDirectUpload();

	return NextResponse.json({
		data: { uploadId, uploadUrl },
		message: "URL de upload gerada com sucesso.",
	});
}
export type TCreateMuxUploadUrlOutput = { data: { uploadId: string; uploadUrl: string }; message: string };

export const POST = appApiHandler({ POST: createUploadUrlRoute });
