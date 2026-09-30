import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TParsedAddress } from "@/lib/geo/address-parsing";
import { isKnownCityForUf, normalizeCityName, normalizeUf } from "@/lib/geo/brazilian-locations";
import { generateText, gateway, Output } from "ai";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Interpretação por IA de um endereço colado como texto livre. É o último degrau do preenchimento
 * automático: o formulário só chama esta rota quando a leitura local (`parseBrazilianAddress`) não
 * tem confiança — mensagens de WhatsApp com referência, rua sem tipo, texto corrido sem vírgulas.
 *
 * DeepSeek V4.1 Flash com o raciocínio desligado: extrair campos de uma frase não precisa de
 * raciocínio, e com ele ligado a chamada passa de ~0,5s para ~7s (medido em 2026-09-30) — tempo
 * demais para um operador de caixa esperando o formulário preencher.
 */
const ADDRESS_PARSING_MODEL = "deepseek/deepseek-v4.1-flash";
const ADDRESS_PARSING_TIMEOUT_MS = 10_000;

const ParseClientLocationAddressInputSchema = z.object({
	text: z
		.string({ required_error: "Texto do endereço não informado.", invalid_type_error: "Tipo inválido para o texto do endereço." })
		.trim()
		.min(3, "Texto do endereço muito curto.")
		.max(1000, "Texto do endereço muito longo."),
	defaultRegion: z
		.object({
			localizacaoEstado: z.string({ invalid_type_error: "Tipo inválido para o estado padrão." }).nullable(),
			localizacaoCidade: z.string({ invalid_type_error: "Tipo inválido para a cidade padrão." }).nullable(),
		})
		.optional()
		.nullable(),
});
export type TParseClientLocationAddressInput = z.infer<typeof ParseClientLocationAddressInputSchema>;

const nullableField = (description: string) => z.string().nullable().describe(description);
const ModelAddressSchema = z.object({
	localizacaoLogradouro: nullableField("Tipo e nome da via por extenso, ex.: 'Rua Quinze de Novembro'. Sem número."),
	localizacaoNumero: nullableField("Número do imóvel, ou 'S/N' quando o texto disser que não tem."),
	localizacaoComplemento: nullableField("Apartamento, bloco, casa, fundos e pontos de referência, separados por vírgula."),
	localizacaoBairro: nullableField("Bairro."),
	localizacaoCidade: nullableField("Município, somente se estiver escrito no texto."),
	localizacaoEstado: nullableField("Sigla da UF, somente se estiver escrita no texto ou decorrer da cidade escrita."),
	localizacaoCep: nullableField("CEP no formato 00000-000, somente se estiver escrito no texto."),
});

// Sem raciocínio, o modelo segue exemplo melhor que regra: foi com os exemplos que ele parou de
// grudar o número no logradouro e de descartar os pontos de referência.
const ADDRESS_PARSING_EXAMPLES = `Exemplos:
Texto: "Jardim América, av brasil 1500 ap 12"
{"localizacaoLogradouro":"Avenida Brasil","localizacaoNumero":"1500","localizacaoComplemento":"ap 12","localizacaoBairro":"Jardim América","localizacaoCidade":null,"localizacaoEstado":null,"localizacaoCep":null}
Texto: "oi! entrega na r. das flores n 30 fundos, centro, casa verde ao lado da farmácia, cwb"
{"localizacaoLogradouro":"Rua das Flores","localizacaoNumero":"30","localizacaoComplemento":"fundos, casa verde, ao lado da farmácia","localizacaoBairro":"Centro","localizacaoCidade":"Curitiba","localizacaoEstado":"PR","localizacaoCep":null}`;

function cleanText(value: string | null) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Rua X, 300" / "Rua X n 300" com número 300: o número já tem campo próprio. */
function stripNumberFromStreet(logradouro: string | null, numero: string | null) {
	if (!logradouro || !numero) return logradouro;
	const stripped = logradouro.replace(new RegExp(`[,\\s]+(?:n[º°o.]?\\s*)?${escapeRegExp(numero)}$`, "i"), "").trim();
	return stripped || logradouro;
}

async function parseClientLocationAddress({ input }: { input: TParseClientLocationAddressInput }) {
	const region = input.defaultRegion?.localizacaoCidade
		? `A loja fica em ${input.defaultRegion.localizacaoCidade}/${input.defaultRegion.localizacaoEstado}. Use isso só para desambiguar (ex.: um nome que é bairro dessa cidade); não preencha cidade nem estado que o texto não mencione.`
		: "";

	const { output } = await generateText({
		model: gateway(ADDRESS_PARSING_MODEL),
		output: Output.object({ schema: ModelAddressSchema }),
		providerOptions: { deepseek: { thinking: { type: "disabled" } } },
		abortSignal: AbortSignal.timeout(ADDRESS_PARSING_TIMEOUT_MS),
		system: [
			"Você extrai endereços brasileiros de textos livres, como mensagens de WhatsApp de clientes pedindo entrega.",
			"Ignore saudações e qualquer coisa que não seja endereço. Campo ausente no texto é null; nunca invente.",
			"Abreviações de tipo de via vão por extenso (R. -> Rua, Av. -> Avenida). Não corrija a grafia de nomes.",
			"O logradouro é o trecho com tipo de via (Rua, Avenida, Travessa...), sem o número. Os trechos podem vir em qualquer ordem: 'Vila X', 'Jardim X', 'Parque X' e 'Conjunto X' antes ou depois da rua costumam ser o bairro.",
			"Siglas e apelidos de cidade valem como cidade escrita (ex.: 'cwb' é Curitiba/PR, 'sp' sozinho é São Paulo/SP).",
			ADDRESS_PARSING_EXAMPLES,
			region,
		]
			.filter(Boolean)
			.join("\n"),
		prompt: input.text,
	});

	// A saída do modelo passa pelas mesmas regras do formulário: UF em sigla e cidade da lista oficial.
	const estado = normalizeUf(output.localizacaoEstado);
	const cidade = normalizeCityName(output.localizacaoCidade, estado);
	const cepDigits = output.localizacaoCep?.replace(/\D/g, "") ?? "";

	const numero = cleanText(output.localizacaoNumero);
	const address: TParsedAddress = {
		localizacaoLogradouro: stripNumberFromStreet(cleanText(output.localizacaoLogradouro), numero),
		localizacaoNumero: numero,
		localizacaoComplemento: cleanText(output.localizacaoComplemento),
		localizacaoBairro: cleanText(output.localizacaoBairro),
		localizacaoEstado: estado,
		localizacaoCidade: cidade && isKnownCityForUf(cidade, estado) ? cidade : null,
		localizacaoCep: cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : null,
	};

	return {
		data: { address },
		message: "Endereço interpretado com sucesso.",
	};
}
export type TParseClientLocationAddressOutput = Awaited<ReturnType<typeof parseClientLocationAddress>>;

async function parseClientLocationAddressRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const input = ParseClientLocationAddressInputSchema.parse(await request.json());
	const result = await parseClientLocationAddress({ input });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: parseClientLocationAddressRoute });
