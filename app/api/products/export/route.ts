import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { GetProductsDefaultInputSchema, queryProductsList } from "@/lib/products/list";
import { withProductSearch } from "@/lib/products/search";
import { db } from "@/services/drizzle";
import { products, productFiscalProfiles } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetProductsExportInputSchema = GetProductsDefaultInputSchema.omit({ mode: true }).extend({
	page: z
		.string({ required_error: "Página não informada.", invalid_type_error: "Tipo inválido para página." })
		.default("1")
		.transform(Number)
		.pipe(z.number().int().positive()),
});
export type TGetProductsExportInput = z.infer<typeof GetProductsExportInputSchema>;

async function getProductsExport({ input, session }: { input: TGetProductsExportInput; session: TAuthUserSession }) {
	const membership = session.membership;
	if (!membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (membership.organizacao.assinaturaPlano === "ESSENCIAL") throw new createHttpError.Forbidden("Recurso indisponível no plano ESSENCIAL.");
	const orgId = membership.organizacao.id;
	const canViewFiscal = !!membership.organizacao.configuracao.recursos.erp.acesso && !!membership.permissoes.fiscal.visualizar;
	const canViewSuppliers = !!membership.permissoes.compras.visualizar;
	return withProductSearch(db, input.search, async (database) => {
		const result = await queryProductsList({ input, userOrgId: orgId, pageSize: 200 }, database);
		const listed = result.data.default;
		const ids = listed.products.map((product) => product.id);
		const hydrated = ids.length
			? await database.query.products.findMany({
					where: and(eq(products.organizacaoId, orgId), inArray(products.id, ids)),
					columns: {
						id: true,
						codigoBarras: true,
						ativo: true,
						vendavel: true,
						rastreamentoEstoqueAtivo: true,
						dataInsercao: true,
						dataAtualizacao: true,
					},
					with: {
						variantes: {
							where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
							orderBy: (fields, { asc }) => [asc(fields.nome), asc(fields.id)],
							columns: {
								id: true,
								nome: true,
								codigo: true,
								codigoBarras: true,
								precoVenda: true,
								precoCusto: true,
								quantidade: true,
								ativo: true,
								rastreamentoEstoqueAtivo: true,
							},
						},
					},
				})
			: [];

		const profiles =
			canViewFiscal && ids.length
				? await database.query.productFiscalProfiles.findMany({
						where: and(
							eq(productFiscalProfiles.organizacaoId, orgId),
							eq(productFiscalProfiles.ativo, true),
							inArray(productFiscalProfiles.produtoId, ids),
						),
						columns: {
							id: true,
							produtoId: true,
							produtoVarianteId: true,
							ncm: true,
							exTipi: true,
							cest: true,
							cfopPadrao: true,
							origemMercadoria: true,
							unidadeComercial: true,
							codigoBeneficioFiscal: true,
						},
						orderBy: (fields, { asc }) => asc(fields.id),
						with: { grupoTributario: { columns: { nome: true } } },
					})
				: [];
		const profilesByProductId = new Map<string, typeof profiles>();
		for (const profile of profiles) {
			const entries = profilesByProductId.get(profile.produtoId) ?? [];
			entries.push(profile);
			profilesByProductId.set(profile.produtoId, entries);
		}
		const byId = new Map(hydrated.map((product) => [product.id, product]));
		const rows = listed.products.flatMap((product) => {
			const details = byId.get(product.id);
			if (!details) return [];
			const { fornecedorPrincipal, ncm, ...fields } = product;
			const detailFields = details;
			return [
				{
					...fields,
					...detailFields,
					...(canViewSuppliers ? { fornecedorPrincipal } : {}),
					...(canViewFiscal ? { ncm, perfisFiscais: profilesByProductId.get(product.id) ?? [] } : {}),
				},
			];
		});
		return {
			data: {
				rows,
				totalPages: input.page === 1 ? listed.totalPages : null,
				totalMatched: input.page === 1 ? listed.productsMatched : null,
				permissoes: { fiscal: canViewFiscal, fornecedores: canViewSuppliers },
			},
			message: "Produtos carregados com sucesso.",
		};
	});
}
export type TGetProductsExportOutput = Awaited<ReturnType<typeof getProductsExport>>;
export type TProductExportEntry = TGetProductsExportOutput["data"]["rows"][number];

async function getProductsExportRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetProductsExportInputSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
	return NextResponse.json(await getProductsExport({ input, session }));
}
export const GET = appApiHandler({ GET: getProductsExportRoute });
