import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { PurchaseCostModifierEffectEnum, PurchaseCostModifierKeyEnum, PurchaseCostTreatmentEnum } from "@/schemas/enums";

export const IMPORT_COMPOSITION_ALLOWED_MIME_TYPES = [
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/webp",
	"application/xml",
	"text/xml",
] as const;
export type TImportCompositionMimeType = (typeof IMPORT_COMPOSITION_ALLOWED_MIME_TYPES)[number];

export const ExtractedCostModifierSchema = z.object({
	chave: PurchaseCostModifierKeyEnum,
	valorCentavos: z.number().int().positive(),
	efeito: PurchaseCostModifierEffectEnum,
	// XML identifies the tax, but not the organization's right to a tax credit.
	tratamento: PurchaseCostTreatmentEnum.nullable(),
	descricao: z.string().optional().nullable(),
});
export type TExtractedCostModifier = z.infer<typeof ExtractedCostModifierSchema>;

export const ExtractedCompositionItemSchema = z.object({
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição do item extraído." }),
	codigoFornecedor: z.string({ invalid_type_error: "Tipo não válido para o código do item no fornecedor." }).nullable(),
	ean: z.string({ invalid_type_error: "Tipo não válido para o EAN do item extraído." }).nullable(),
	ncm: z.string({ invalid_type_error: "Tipo não válido para o NCM do item extraído." }).optional().nullable(),
	unidade: z.string({ invalid_type_error: "Tipo não válido para a unidade do item extraído." }).nullable(),
	quantidade: z.number({ invalid_type_error: "Tipo não válido para a quantidade do item extraído." }),
	valorUnitario: z.number({ invalid_type_error: "Tipo não válido para o valor unitário do item extraído." }),
	valorTotal: z.number({ invalid_type_error: "Tipo não válido para o valor total do item extraído." }),
	desconto: z.number({ invalid_type_error: "Tipo não válido para o desconto do item extraído." }).nullable(),
	modificadoresCusto: z.array(ExtractedCostModifierSchema).optional(),
});
export type TExtractedCompositionItem = z.infer<typeof ExtractedCompositionItemSchema>;

export const ExtractedCompositionSchema = z.object({
	fornecedor: z
		.object({
			nome: z.string({ invalid_type_error: "Tipo não válido para o nome do fornecedor extraído." }).nullable(),
			cnpj: z.string({ invalid_type_error: "Tipo não válido para o CNPJ do fornecedor extraído." }).nullable(),
		})
		.nullable(),
	// Cabeçalho do documento: alimenta o lançamento contábil da compra (valor efetivo, competência
	// e título) e permite conferir se a soma das linhas lidas explica o total impresso.
	numeroDocumento: z.string({ invalid_type_error: "Tipo não válido para o número do documento extraído." }).nullable(),
	dataEmissao: z.string({ invalid_type_error: "Tipo não válido para a data de emissão extraída." }).nullable(),
	valorTotalDocumento: z.number({ invalid_type_error: "Tipo não válido para o valor total do documento extraído." }).nullable(),
	valorFrete: z.number({ invalid_type_error: "Tipo não válido para o valor do frete extraído." }).nullable(),
	valorDesconto: z.number({ invalid_type_error: "Tipo não válido para o valor de desconto extraído." }).nullable(),
	origem: z.enum(["XML", "IA"]).optional(),
	chaveAcesso: z.string().optional().nullable(),
	serieDocumento: z.string().optional().nullable(),
	totaisOriginais: z
		.object({
			produtosCentavos: z.number().int().optional().nullable(),
			descontoCentavos: z.number().int().optional().nullable(),
			freteCentavos: z.number().int().optional().nullable(),
			seguroCentavos: z.number().int().optional().nullable(),
			despesasAcessoriasCentavos: z.number().int().optional().nullable(),
			ipiCentavos: z.number().int().optional().nullable(),
			icmsStCentavos: z.number().int().optional().nullable(),
			fcpStCentavos: z.number().int().optional().nullable(),
			documentoCentavos: z.number().int().optional().nullable(),
		})
		.optional(),
	itens: z.array(ExtractedCompositionItemSchema),
});
export type TExtractedComposition = z.infer<typeof ExtractedCompositionSchema>;

const EXTRACTION_SYSTEM_PROMPT = `Você é um especialista em leitura de documentos fiscais brasileiros: NF-e (DANFE), NFC-e, cupons fiscais e recibos de compra.
Sua tarefa é extrair o EMITENTE (fornecedor) e a lista COMPLETA de itens do documento anexado, no schema JSON pedido.

Regras:
- Extraia TODOS os itens do documento, na ordem em que aparecem. Não resuma nem agrupe.
- "descricao" é a descrição do produto exatamente como impressa no documento.
- "codigoFornecedor" é o código do produto usado pelo emitente (coluna CÓDIGO/COD/REF do DANFE). Se não houver, null.
- "ean" é o código de barras GTIN/EAN quando visível (13 ou 8 dígitos, às vezes na coluna própria). Se não houver, null.
- "ncm" é o código NCM do item quando impresso (8 dígitos, coluna NCM/SH do DANFE). Se não houver, null.
- "unidade" é a unidade comercial (UN, KG, CX, PC, LT...). Se não houver, null.
- "quantidade" e "valorUnitario" são os valores comerciais da linha. "valorTotal" é o total da linha.
- Valores monetários em número decimal (ponto como separador). Ex: "1.234,56" vira 1234.56.
- "desconto" é o desconto da linha quando destacado; senão null.
- "fornecedor" é o EMITENTE do documento (quem vendeu), nunca o destinatário. CNPJ apenas com dígitos. Se ilegível, use null nos campos.

Cabeçalho do documento:
- "numeroDocumento" é o número da nota/cupom/pedido quando impresso; senão null.
- "dataEmissao" no formato ISO "AAAA-MM-DD". Se só houver dia/mês, deduza o ano pelo restante do documento. Se ilegível, null.
- "valorTotalDocumento" é o VALOR TOTAL DA NOTA (total geral a pagar, já com frete e descontos quando o documento assim declarar).
- "valorFrete" e "valorDesconto" apenas quando destacados em campo próprio; senão null.
- Nunca estime nem calcule esses valores: se não estiverem impressos, use null.

- Se o documento não for uma nota/cupom de compra ou estiver ilegível, retorne itens: [].`;

// Sonnet for document vision quality; the cheaper mapping step (match-products) uses Haiku.
const EXTRACTION_MODEL = "anthropic/claude-sonnet-4.5";

export async function extractCompositionFromFile({ dataBase64, mimeType }: { dataBase64: string; mimeType: TImportCompositionMimeType }) {
	const buffer = Buffer.from(dataBase64, "base64");

	// PDF e imagem entram como parte "file" (a parte "image" foi depreciada no AI SDK 7).
	const filePart = { type: "file", data: buffer, mediaType: mimeType } as const;

	const { output } = await generateText({
		model: gateway(EXTRACTION_MODEL),
		output: Output.object({ schema: ExtractedCompositionSchema }),
		system: EXTRACTION_SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "Extraia o fornecedor e a composição de itens deste documento fiscal." }, filePart],
			},
		],
	});

	return ExtractedCompositionSchema.parse({ ...output, origem: "IA" });
}
