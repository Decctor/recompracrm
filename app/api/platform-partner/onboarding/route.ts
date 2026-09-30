import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { formatAsSlug } from "@/lib/formatting";
import { isPlatformPartnerDocumentPathOwnedBy } from "@/lib/platform-partnerships/documents";
import { PlatformPartnerOnboardingSchema } from "@/schemas/platform-partnerships";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CreatePlatformPartnerOnboardingInputSchema = z.object({
	partner: PlatformPartnerOnboardingSchema,
});
export type TCreatePlatformPartnerOnboardingInput = z.infer<typeof CreatePlatformPartnerOnboardingInputSchema>;

async function generateUniquePartnerCode(nome: string) {
	const base = formatAsSlug(nome).replace(/-/g, "").slice(0, 12).toUpperCase() || "PARCEIRO";
	for (let attempt = 0; attempt < 10; attempt++) {
		const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
		const codigo = `${base}${suffix}`;
		const existing = await db.query.platformPartners.findFirst({
			where: eq(platformPartners.codigo, codigo),
			columns: { id: true },
		});
		if (!existing) return codigo;
	}
	return crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
}

async function createPlatformPartnerOnboarding({ input, userId }: { input: TCreatePlatformPartnerOnboardingInput; userId: string }) {
	// Documentos só do prefixo do próprio usuário: sem isso, dava para apontar o cadastro para o arquivo de outra pessoa.
	for (const path of Object.values(input.partner.arquivos)) {
		if (path && !isPlatformPartnerDocumentPathOwnedBy({ path, userId }))
			throw new createHttpError.BadRequest("Documento inválido. Envie o arquivo novamente.");
	}

	const existingPartner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.usuarioId, userId),
	});
	// Parceiro ativo não troca chave PIX nem documento por aqui: isso passa pelo financeiro.
	if (existingPartner?.status === "ATIVO") throw new createHttpError.Conflict("Seu cadastro de parceiro já está ativo.");

	const now = new Date();
	const partnerData = {
		nome: input.partner.nome,
		email: input.partner.email,
		telefone: input.partner.telefone,
		tipoPessoa: input.partner.tipoPessoa,
		cpfCnpj: input.partner.cpfCnpj,
		chavePix: input.partner.chavePix,
		chavePixTipo: input.partner.chavePixTipo,
		dataConfirmacaoTitularPix: now,
		arquivos: input.partner.arquivos,
		aceiteTermos: input.partner.aceiteTermos,
		dataAceiteTermos: now,
	};

	if (existingPartner) {
		const [updatedPartner] = await db
			.update(platformPartners)
			.set({
				...partnerData,
				status: existingPartner.status === "REJEITADO" ? "PENDENTE_APROVACAO" : existingPartner.status,
				dataAtualizacao: now,
			})
			.where(eq(platformPartners.id, existingPartner.id))
			.returning({ id: platformPartners.id });

		return {
			data: {
				partnerId: updatedPartner?.id ?? existingPartner.id,
			},
			message: "Cadastro de parceiro atualizado com sucesso.",
		};
	}

	const codigo = await generateUniquePartnerCode(input.partner.nome);
	const [createdPartner] = await db
		.insert(platformPartners)
		.values({
			usuarioId: userId,
			status: "PENDENTE_APROVACAO",
			codigo,
			...partnerData,
		})
		.returning({ id: platformPartners.id });

	if (!createdPartner) throw new createHttpError.InternalServerError("Erro ao criar cadastro de parceiro.");

	return {
		data: {
			partnerId: createdPartner.id,
		},
		message: "Cadastro de parceiro enviado para aprovação.",
	};
}
export type TCreatePlatformPartnerOnboardingOutput = Awaited<ReturnType<typeof createPlatformPartnerOnboarding>>;

async function createPlatformPartnerOnboardingRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const payload = await request.json();
	const input = CreatePlatformPartnerOnboardingInputSchema.parse(payload);
	const result = await createPlatformPartnerOnboarding({ input, userId: session.user.id });
	return NextResponse.json(result);
}

export const POST = appApiHandler({
	POST: createPlatformPartnerOnboardingRoute,
});
