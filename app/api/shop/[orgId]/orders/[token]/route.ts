import { appApiHandler } from "@/lib/app-api";
import type { TAppliedCoupon } from "@/schemas/coupons";
import type { TShopRewardSnapshot } from "@/schemas/shop";
import { db } from "@/services/drizzle";
import { shopOrderRequests } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import z from "zod";

const GetPublicShopOrderInputSchema = z.object({
	orgId: z.string({ required_error: "Organização não informada.", invalid_type_error: "Tipo não válido para organização." }).min(1),
	token: z
		.string({ required_error: "Token do pedido não informado.", invalid_type_error: "Tipo não válido para token do pedido." })
		.uuid("Token do pedido inválido."),
});
export type TGetPublicShopOrderInput = z.infer<typeof GetPublicShopOrderInputSchema>;

type TShopDraftMetadata = {
	shop?: {
		criadoEm?: string;
		subtotalItens?: number;
		cashbackResgateSolicitado?: number;
		cupom?: TAppliedCoupon | null;
		recompensas?: TShopRewardSnapshot[] | null;
		// Formato anterior a múltiplas recompensas (pedidos antigos).
		recompensa?: TShopRewardSnapshot | null;
		pagamento?: {
			metodo?: string;
			descricao?: string;
			observacoes?: string | null;
		};
		entrega?: { modalidade?: "RETIRADA" | "ENTREGA" };
	};
};

type TShopItemMetadata = {
	nome?: string;
	codigo?: string;
	imagemUrl?: string | null;
};

function hashPublicAccessToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

function getPathParams(pathname: string) {
	const segments = pathname.split("/");
	return { orgId: segments[3], token: segments[5] };
}

function maskCep(value: string | null) {
	if (!value) return null;
	const digits = value.replace(/\D/g, "");
	return digits.length >= 5 ? digits.slice(0, 3) + "**-***" : "***";
}

function maskDeliveryAddress(
	location: {
		localizacaoCep: string | null;
		localizacaoEstado: string | null;
		localizacaoCidade: string | null;
		localizacaoBairro: string | null;
		localizacaoLogradouro: string | null;
	} | null,
) {
	if (!location) return null;
	return {
		logradouro: location.localizacaoLogradouro,
		numero: "**",
		bairro: location.localizacaoBairro,
		cidade: location.localizacaoCidade,
		estado: location.localizacaoEstado,
		cep: maskCep(location.localizacaoCep),
	};
}

async function getPublicShopOrder({ input }: { input: TGetPublicShopOrderInput }) {
	const requestRecord = await db.query.shopOrderRequests.findFirst({
		where: and(
			eq(shopOrderRequests.organizacaoId, input.orgId),
			eq(shopOrderRequests.publicAccessTokenHash, hashPublicAccessToken(input.token)),
			eq(shopOrderRequests.status, "CONCLUIDO"),
		),
		with: {
			organizacao: {
				columns: {
					nome: true,
					logoUrl: true,
					telefone: true,
					corPrimaria: true,
					corPrimariaForeground: true,
					corSecundaria: true,
					corSecundariaForeground: true,
				},
			},
			venda: {
				columns: {
					id: true,
					valorTotal: true,
					descontosTotal: true,
					acrescimosTotal: true,
					entregaModalidade: true,
					observacoes: true,
					rascunhoMetadados: true,
					dataVenda: true,
					statusVenda: true,
					statusAtendimento: true,
					canal: true,
				},
				with: {
					entregaLocalizacao: {
						columns: {
							localizacaoCep: true,
							localizacaoEstado: true,
							localizacaoCidade: true,
							localizacaoBairro: true,
							localizacaoLogradouro: true,
						},
					},
					itens: {
						columns: {
							id: true,
							quantidade: true,
							valorVendaUnitario: true,
							valorVendaTotalBruto: true,
							valorTotalDesconto: true,
							valorVendaTotalLiquido: true,
							metadados: true,
						},
						with: {
							produto: { columns: { nome: true, imagemCapaUrl: true } },
							produtoVariante: { columns: { nome: true, imagemCapaUrl: true } },
							adicionais: {
								columns: {
									id: true,
									nome: true,
									quantidade: true,
									valorUnitario: true,
									valorTotal: true,
								},
							},
						},
					},
					transacoesCashback: {
						columns: {
							id: true,
							tipo: true,
							valor: true,
							status: true,
						},
					},
				},
			},
		},
	});

	if (!requestRecord?.venda || requestRecord.venda.canal !== "SHOP") {
		throw new createHttpError.NotFound("Pedido não encontrado.");
	}

	const sale = requestRecord.venda;
	const metadata = sale.rascunhoMetadados as TShopDraftMetadata | null;
	const shopMetadata = metadata?.shop;
	const cashbackAccumulated = sale.transacoesCashback
		.filter((transaction) => transaction.tipo === "ACÚMULO" && transaction.status !== "EXPIRADO")
		.reduce((sum, transaction) => sum + transaction.valor, 0);

	return {
		data: {
			order: {
				orderNumber: sale.id.slice(0, 8).toUpperCase(),
				createdAt: shopMetadata?.criadoEm ?? sale.dataVenda?.toISOString() ?? null,
				checkedAt: new Date().toISOString(),
				status: sale.statusVenda,
				statusAtendimento: sale.statusAtendimento,
				deliveryMode: sale.entregaModalidade,
				items: sale.itens.map((item) => {
					const itemMetadata = item.metadados as TShopItemMetadata | null;
					return {
						id: item.id,
						name: itemMetadata?.nome ?? item.produtoVariante?.nome ?? item.produto?.nome ?? "Produto",
						imageUrl: itemMetadata?.imagemUrl ?? item.produtoVariante?.imagemCapaUrl ?? item.produto?.imagemCapaUrl ?? null,
						quantity: item.quantidade,
						unitPrice: item.valorVendaUnitario,
						grossTotal: item.valorVendaTotalBruto,
						discount: item.valorTotalDesconto,
						total: item.valorVendaTotalLiquido,
						modifiers: item.adicionais.map((modifier) => ({
							id: modifier.id,
							name: modifier.nome,
							quantity: modifier.quantidade,
							unitPrice: modifier.valorUnitario,
							total: modifier.valorTotal,
						})),
					};
				}),
				subtotal: shopMetadata?.subtotalItens ?? sale.itens.reduce((sum, item) => sum + item.valorVendaTotalBruto, 0),
				discount: sale.descontosTotal ?? 0,
				coupon: shopMetadata?.cupom
					? {
							code: shopMetadata.cupom.codigo ?? null,
							title: shopMetadata.cupom.titulo ?? null,
							discount: shopMetadata.cupom.valorDesconto,
						}
					: null,
				rewards: (shopMetadata?.recompensas ?? (shopMetadata?.recompensa ? [shopMetadata.recompensa] : [])).map((reward) => ({
					title: reward.titulo,
					points: reward.valor,
					commercialValue: reward.valorVenda,
					quantity: reward.quantidade ?? 1,
					imageUrl: reward.imagemCapaUrl,
				})),
				additions: sale.acrescimosTotal ?? 0,
				total: sale.valorTotal,
				payment: {
					method: shopMetadata?.pagamento?.metodo ?? null,
					description: shopMetadata?.pagamento?.descricao ?? null,
				},
				deliveryAddress: maskDeliveryAddress(sale.entregaLocalizacao),
				notes: sale.observacoes,
				cashback: {
					redeemed: shopMetadata?.cashbackResgateSolicitado ?? 0,
					accumulated: cashbackAccumulated,
				},
			},
			organization: requestRecord.organizacao,
		},
		message: "Pedido carregado com sucesso.",
	};
}
export type TGetPublicShopOrderOutput = Awaited<ReturnType<typeof getPublicShopOrder>>;

async function getPublicShopOrderRoute(request: NextRequest) {
	const input = GetPublicShopOrderInputSchema.parse(getPathParams(request.nextUrl.pathname));
	const result = await getPublicShopOrder({ input });
	return NextResponse.json(result, {
		headers: {
			"Cache-Control": "private, no-store",
		},
	});
}

export const GET = appApiHandler({ GET: getPublicShopOrderRoute });
