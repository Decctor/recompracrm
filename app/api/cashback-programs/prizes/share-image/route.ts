import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewCashback } from "@/lib/permissions/cashback";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { renderCashbackPrizesShareImage } from "@/lib/cashback/render-prizes-share-image";
import { db } from "@/services/drizzle";
import { supabaseClient } from "@/services/supabase";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCashbackProgramPrizesShareImageInputSchema = z.object({
	mode: z
		.enum(["summary", "promoting"], {
			required_error: "Modo da imagem não informado.",
			invalid_type_error: "Tipo não válido para o modo da imagem.",
		})
		.default("summary"),
});
export type TGetCashbackProgramPrizesShareImageInput = z.infer<typeof GetCashbackProgramPrizesShareImageInputSchema>;

function sanitizeFileName(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

async function getCashbackProgramPrizesShareImage({
	input,
	session,
}: {
	input: TGetCashbackProgramPrizesShareImageInput;
	session: TAuthUserSession;
}) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (input.mode === "promoting") throw new createHttpError.NotImplemented("O modo promocional ainda não está disponível.");

	const [organization, program] = await Promise.all([
		db.query.organizations.findFirst({
			where: (fields, { eq }) => eq(fields.id, organizationId),
			columns: { id: true, nome: true, logoUrl: true, corPrimaria: true, corSecundaria: true },
		}),
		db.query.cashbackPrograms.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
			columns: {
				id: true,
				titulo: true,
				terminologia: true,
				acumuloTipo: true,
				acumuloValor: true,
				acumuloRegraValorMinimo: true,
				expiracaoRegraValidadeValor: true,
			},
			with: {
				recompensas: {
					where: (fields, { eq }) => eq(fields.ativo, true),
					orderBy: (fields, { asc }) => [asc(fields.valor), asc(fields.titulo)],
					columns: { titulo: true, valor: true, imagemCapaUrl: true },
					with: {
						produto: { columns: { imagemCapaUrl: true } },
						produtoVariante: { columns: { imagemCapaUrl: true } },
					},
				},
			},
		}),
	]);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	if (!program) throw new createHttpError.NotFound("Programa de cashback não encontrado.");
	if (program.recompensas.length === 0) throw new createHttpError.BadRequest("O programa não possui prêmios ativos para compartilhar.");

	const png = await renderCashbackPrizesShareImage({
		mode: input.mode,
		organization,
		program,
		prizes: program.recompensas.map((prize) => ({
			titulo: prize.titulo,
			valor: prize.valor,
			imagemCapaUrl: prize.imagemCapaUrl ?? prize.produtoVariante?.imagemCapaUrl ?? prize.produto?.imagemCapaUrl ?? null,
		})),
	});
	const storagePath = `public/cashback-programs/${organization.id}/${program.id}/prizes-summary.png`;
	const { error } = await supabaseClient.storage.from("files").upload(storagePath, png, {
		contentType: "image/png",
		cacheControl: "0",
		upsert: true,
	});
	if (error) throw new createHttpError.InternalServerError(`Não foi possível armazenar o resumo dos prêmios: ${error.message}`);

	const {
		data: { publicUrl },
	} = supabaseClient.storage.from("files").getPublicUrl(storagePath);
	const fileName = `resumo-premios-${sanitizeFileName(organization.nome) || "cashback"}.png`;

	return {
		data: {
			url: `${publicUrl}?v=${Date.now()}`,
			fileName,
			mode: input.mode,
		},
		message: "Resumo dos prêmios gerado com sucesso.",
	};
}
export type TGetCashbackProgramPrizesShareImageOutput = Awaited<ReturnType<typeof getCashbackProgramPrizesShareImage>>;

async function getCashbackProgramPrizesShareImageRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!canViewCashback(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar o programa de cashback.");
	const input = GetCashbackProgramPrizesShareImageInputSchema.parse({
		mode: request.nextUrl.searchParams.get("mode") ?? undefined,
	});
	const result = await getCashbackProgramPrizesShareImage({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCashbackProgramPrizesShareImageRoute });
