import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { STATEMENT_BALANCE_MISMATCH_TOLERANCE, STATEMENT_EXTRACTION_MODEL } from "../constants";
import { deriveStatementPeriod, inferPaymentMethodFromDescription, type TCanonicalStatementLine, type TParsedStatement } from "../normalize";

/**
 * Extração IA de extratos em PDF/imagem — molde de lib/purchase/import.ts. É o caminho de menor
 * confiabilidade: o resultado é validado contra os saldos declarados do extrato quando presentes,
 * e a importação fica marcada como origem IA para revisão humana obrigatória.
 */

const ExtractedStatementLineSchema = z.object({
	data: z.string({ invalid_type_error: "Tipo não válido para a data da linha extraída." }),
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição da linha extraída." }),
	valor: z.number({ invalid_type_error: "Tipo não válido para o valor da linha extraída." }),
	tipo: z.enum(["ENTRADA", "SAIDA"], { invalid_type_error: "Tipo não válido para o tipo da linha extraída." }),
});

const ExtractedStatementSchema = z.object({
	banco: z.string({ invalid_type_error: "Tipo não válido para o banco extraído." }).nullable(),
	periodoInicio: z.string({ invalid_type_error: "Tipo não válido para o início do período extraído." }).nullable(),
	periodoFim: z.string({ invalid_type_error: "Tipo não válido para o fim do período extraído." }).nullable(),
	saldoInicial: z.number({ invalid_type_error: "Tipo não válido para o saldo inicial extraído." }).nullable(),
	saldoFinal: z.number({ invalid_type_error: "Tipo não válido para o saldo final extraído." }).nullable(),
	linhas: z.array(ExtractedStatementLineSchema),
});
export type TExtractedStatement = z.infer<typeof ExtractedStatementSchema>;

const EXTRACTION_SYSTEM_PROMPT = `Você é um especialista em leitura de extratos bancários brasileiros (contas correntes, poupança, carteiras digitais e faturas exportadas em PDF).
Sua tarefa é extrair TODAS as transações do extrato anexado, no schema JSON pedido.

Regras:
- Extraia TODAS as linhas de transação, na ordem em que aparecem. Não resuma, não agrupe, não pule páginas.
- "data" no formato ISO "AAAA-MM-DD". Se o extrato mostrar só dia/mês, deduza o ano pelo período do extrato.
- "descricao" é o histórico/lançamento exatamente como impresso.
- "valor" é o valor absoluto da linha em número decimal (ponto como separador). Ex: "1.234,56" vira 1234.56.
- "tipo" é ENTRADA para créditos e SAIDA para débitos (sinais negativos, colunas de débito ou letra "D" indicam SAIDA).
- NÃO inclua linhas de saldo (saldo anterior, saldo do dia, saldo final) como transações.
- "saldoInicial"/"saldoFinal" são os saldos declarados no extrato quando visíveis; senão null.
- "periodoInicio"/"periodoFim" no formato ISO quando o extrato declarar o período; senão null.
- Se o documento não for um extrato bancário ou estiver ilegível, retorne linhas: [].`;

export async function extractStatementFromDocument({ buffer, mimeType }: { buffer: Buffer; mimeType: string }): Promise<TParsedStatement> {
	// PDF e imagem entram como parte "file" (a parte "image" foi depreciada no AI SDK 7).
	const filePart = { type: "file", data: buffer, mediaType: mimeType } as const;

	const { output } = await generateText({
		model: gateway(STATEMENT_EXTRACTION_MODEL),
		output: Output.object({ schema: ExtractedStatementSchema }),
		system: EXTRACTION_SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "Extraia as transações deste extrato bancário." }, filePart],
			},
		],
	});
	const extracted = ExtractedStatementSchema.parse(output);

	const avisos: string[] = ["Extraído por IA a partir de documento — confira os valores antes de conciliar."];
	const linhas: TCanonicalStatementLine[] = [];
	for (const linha of extracted.linhas) {
		const dataTransacao = new Date(`${linha.data}T00:00:00.000Z`);
		if (Number.isNaN(dataTransacao.getTime()) || !linha.descricao.trim() || linha.valor <= 0) continue;
		linhas.push({
			dataTransacao,
			descricao: linha.descricao.trim(),
			tipo: linha.tipo,
			valor: linha.valor,
			metodo: inferPaymentMethodFromDescription(linha.descricao),
			idExterno: null,
			metadados: null,
		});
	}

	// Sanidade: a soma líquida das linhas deve explicar a variação de saldo declarada.
	if (extracted.saldoInicial !== null && extracted.saldoFinal !== null) {
		const liquido = linhas.reduce((total, linha) => total + (linha.tipo === "ENTRADA" ? linha.valor : -linha.valor), 0);
		const variacao = extracted.saldoFinal - extracted.saldoInicial;
		if (Math.abs(liquido - variacao) > STATEMENT_BALANCE_MISMATCH_TOLERANCE) {
			avisos.push(
				`A soma das linhas extraídas (R$ ${liquido.toFixed(2)}) diverge da variação de saldo do extrato (R$ ${variacao.toFixed(2)}) — a extração pode estar incompleta.`,
			);
		}
	}

	const derived = deriveStatementPeriod(linhas);
	const periodoInicio = extracted.periodoInicio ? new Date(`${extracted.periodoInicio}T00:00:00.000Z`) : null;
	const periodoFim = extracted.periodoFim ? new Date(`${extracted.periodoFim}T00:00:00.000Z`) : null;

	return {
		linhas,
		periodoInicio: periodoInicio && !Number.isNaN(periodoInicio.getTime()) ? periodoInicio : derived.periodoInicio,
		periodoFim: periodoFim && !Number.isNaN(periodoFim.getTime()) ? periodoFim : derived.periodoFim,
		saldoInicial: extracted.saldoInicial,
		saldoFinal: extracted.saldoFinal,
		avisos,
	};
}
