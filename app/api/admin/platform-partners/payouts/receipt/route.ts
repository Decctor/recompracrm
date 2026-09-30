import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { storePrivateFile } from "@/lib/files-storage/private";
import {
	PLATFORM_PARTNER_RECEIPT_CONTENT_TYPES,
	PLATFORM_PARTNER_RECEIPT_MAX_BYTES,
	getPlatformPartnerReceiptPath,
	resolvePlatformPartnerReceiptUrl,
} from "@/lib/platform-partnerships/receipts";
import { db } from "@/services/drizzle";
import { platformPartnerPayouts } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const PayoutIdSchema = z
	.string({ required_error: "ID do payout não informado.", invalid_type_error: "Tipo inválido para o ID do payout." })
	.min(1, "ID do payout não informado.");

const CreateAdminPlatformPartnerPayoutReceiptFieldsSchema = z.object({ payoutId: PayoutIdSchema });
export type TCreateAdminPlatformPartnerPayoutReceiptInput = z.infer<typeof CreateAdminPlatformPartnerPayoutReceiptFieldsSchema> & { file: File };

async function createAdminPlatformPartnerPayoutReceipt({ input }: { input: TCreateAdminPlatformPartnerPayoutReceiptInput }) {
	const extension = PLATFORM_PARTNER_RECEIPT_CONTENT_TYPES[input.file.type];
	if (!extension) throw new createHttpError.BadRequest("Envie o comprovante em PDF ou imagem (JPG, PNG ou WEBP).");
	if (input.file.size === 0) throw new createHttpError.BadRequest("O arquivo enviado está vazio.");
	if (input.file.size > PLATFORM_PARTNER_RECEIPT_MAX_BYTES) throw new createHttpError.BadRequest("O comprovante pode ter até 10 MB.");

	const payout = await db.query.platformPartnerPayouts.findFirst({
		where: eq(platformPartnerPayouts.id, input.payoutId),
		columns: { id: true, partnerId: true, status: true },
	});
	if (!payout) throw new createHttpError.NotFound("Payout não encontrado.");
	if (payout.status === "CANCELADO") throw new createHttpError.BadRequest("Payout cancelado não recebe comprovante.");

	const path = await storePrivateFile({
		path: getPlatformPartnerReceiptPath({ partnerId: payout.partnerId, payoutId: payout.id, extension }),
		data: await input.file.arrayBuffer(),
		contentType: input.file.type,
	});
	await db.update(platformPartnerPayouts).set({ comprovanteUrl: path, dataAtualizacao: new Date() }).where(eq(platformPartnerPayouts.id, payout.id));

	return {
		data: { payoutId: payout.id },
		message: "Comprovante enviado com sucesso.",
	};
}
export type TCreateAdminPlatformPartnerPayoutReceiptOutput = Awaited<ReturnType<typeof createAdminPlatformPartnerPayoutReceipt>>;

const GetAdminPlatformPartnerPayoutReceiptInputSchema = z.object({ payoutId: PayoutIdSchema });
export type TGetAdminPlatformPartnerPayoutReceiptInput = z.infer<typeof GetAdminPlatformPartnerPayoutReceiptInputSchema>;

async function getAdminPlatformPartnerPayoutReceipt({ input }: { input: TGetAdminPlatformPartnerPayoutReceiptInput }) {
	const payout = await db.query.platformPartnerPayouts.findFirst({
		where: eq(platformPartnerPayouts.id, input.payoutId),
		columns: { comprovanteUrl: true },
	});
	if (!payout?.comprovanteUrl) throw new createHttpError.NotFound("Comprovante não encontrado.");
	return { data: { url: await resolvePlatformPartnerReceiptUrl(payout.comprovanteUrl) }, message: "Comprovante obtido com sucesso." };
}
export type TGetAdminPlatformPartnerPayoutReceiptOutput = Awaited<ReturnType<typeof getAdminPlatformPartnerPayoutReceipt>>;

async function assertAdmin() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");
	return session;
}

async function createAdminPlatformPartnerPayoutReceiptRoute(request: NextRequest) {
	await assertAdmin();
	const formData = await request.formData();
	const fields = CreateAdminPlatformPartnerPayoutReceiptFieldsSchema.parse({ payoutId: formData.get("payoutId") });
	const file = formData.get("file");
	if (!(file instanceof File)) throw new createHttpError.BadRequest("Arquivo do comprovante não informado.");
	const result = await createAdminPlatformPartnerPayoutReceipt({ input: { ...fields, file } });
	return NextResponse.json(result);
}

async function getAdminPlatformPartnerPayoutReceiptRoute(request: NextRequest) {
	await assertAdmin();
	const input = GetAdminPlatformPartnerPayoutReceiptInputSchema.parse({ payoutId: request.nextUrl.searchParams.get("payoutId") });
	const result = await getAdminPlatformPartnerPayoutReceipt({ input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAdminPlatformPartnerPayoutReceiptRoute });
export const POST = appApiHandler({ POST: createAdminPlatformPartnerPayoutReceiptRoute });
