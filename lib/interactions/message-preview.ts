import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import type { TInteractionContextMetadados, TMessageTemplateVariables } from "@/lib/message-templates";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";

type TInteractionContextVariablesMap = Omit<
	Record<keyof TMessageTemplateVariables, string>,
	| "clientName"
	| "clientPhoneNumber"
	| "clientEmail"
	| "clientSegmentation"
	| "clientFavoriteProduct"
	| "clientFavoriteProductGroup"
	| "clientSuggestedProduct"
>;

export type TInteractionMessagePreviewClient = {
	nome: string;
	telefone?: string | null;
	email?: string | null;
	analiseRFMTitulo?: string | null;
	metadataGrupoProdutoMaisComprado?: string | null;
	metadataProdutoMaisCompradoNome?: string | null;
	metadataProdutoSugeridoNome?: string | null;
};

export function buildContextVariablesMap(
	ctx?: TInteractionContextMetadados,
	terminology: TCashbackProgramTerminologyEnum = "DINHEIRO",
): TInteractionContextVariablesMap {
	return {
		purchaseValue: formatToMoney(ctx?.compraValor ?? 0),
		purchaseCashbackAccumulated: formatCashbackValue(ctx?.compraCashbackAcumulado ?? 0, terminology),
		purchaseCashbackNewBalance: formatCashbackValue(ctx?.compraCashbackNovoSaldo ?? 0, terminology),
		purchaseSellerName: ctx?.compraVendedorNome ?? "",
		cashbackAvailableBalance: formatCashbackValue(ctx?.cashbackSaldoDisponivel ?? 0, terminology),
		cashbackLifetimeAccumulated: formatCashbackValue(ctx?.cashbackTotalAcumuladoVida ?? 0, terminology),
		cashbackLifetimeRedeemed: formatCashbackValue(ctx?.cashbackTotalResgatadoVida ?? 0, terminology),
		cashbackExpiringAmount: formatCashbackValue(ctx?.cashbackExpirandoValor ?? 0, terminology),
		cashbackExpiringDate: ctx?.cashbackExpirandoData ?? "",
		cashbackExpiringWindow: ctx?.cashbackExpirandoJanela ?? "",
		couponCode: ctx?.cupomCodigo ?? "",
		couponTitle: ctx?.cupomTitulo ?? "",
		couponExpirationDate: ctx?.cupomExpiracaoData ?? "",
		promotionProductName: ctx?.promocaoProdutoNome ?? "",
		// Preço ausente vira string vazia, como as demais variáveis de contexto: "R$ 0,00" seria uma
		// afirmação de preço que o dado não sustenta.
		promotionProductPrice: ctx?.promocaoProdutoPrecoPromocional != null ? formatToMoney(ctx.promocaoProdutoPrecoPromocional) : "",
		promotionProductOriginalPrice: ctx?.promocaoProdutoPrecoOriginal != null ? formatToMoney(ctx.promocaoProdutoPrecoOriginal) : "",
	};
}

export function buildInteractionMessageVariables({
	client,
	contextMetadados,
	terminology = contextMetadados?.terminologia ?? "DINHEIRO",
}: {
	client: TInteractionMessagePreviewClient;
	contextMetadados?: TInteractionContextMetadados | null;
	terminology?: TCashbackProgramTerminologyEnum;
}): Record<keyof TMessageTemplateVariables, string> {
	const contextVars = buildContextVariablesMap(contextMetadados ?? undefined, terminology);

	return {
		clientEmail: client.email ?? "",
		clientName: client.nome,
		clientPhoneNumber: client.telefone ?? "",
		clientSegmentation: client.analiseRFMTitulo ?? "",
		clientFavoriteProduct: client.metadataProdutoMaisCompradoNome ?? "",
		clientFavoriteProductGroup: client.metadataGrupoProdutoMaisComprado ?? "",
		clientSuggestedProduct: client.metadataProdutoSugeridoNome ?? "",
		...contextVars,
	};
}
