import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import createHttpError from "http-errors";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { generateText, gateway, Output } from "ai";
import { z } from "zod";

const BulkClientCanonicalFieldSchema = z.enum([
	"nome",
	"cpfCnpj",
	"telefone",
	"email",
	"dataNascimento",
	"canalAquisicao",
	"localizacaoCidade",
	"localizacaoEstado",
	"localizacaoBairro",
	"localizacaoCep",
]);

const BulkClientsMappingDefinitionSchema = z.object({
	field: BulkClientCanonicalFieldSchema,
	sourceColumn: z.string().nullable(),
	confidence: z.number().min(0).max(1).nullable(),
	reason: z.string().optional().nullable(),
});

const BulkClientsMapInputSchema = z.object({
	headers: z.array(z.string()).min(1, "Cabeçalhos da planilha não informados."),
	sampleRows: z.array(z.record(z.string(), z.unknown())).min(1, "Amostra da planilha não informada."),
});

const BulkClientsMapOutputSchema = z.object({
	mappingDefinitions: z.array(BulkClientsMappingDefinitionSchema),
	warnings: z.array(z.string()),
});
type TBulkClientsMapOutput = z.infer<typeof BulkClientsMapOutputSchema>;

type TMapClientsSheetOutput = {
	data: TBulkClientsMapOutput;
	message: string;
};

const FIELD_LABELS: Record<z.infer<typeof BulkClientCanonicalFieldSchema>, string> = {
	nome: "NOME",
	cpfCnpj: "CPF/CNPJ",
	telefone: "TELEFONE",
	email: "EMAIL",
	dataNascimento: "DATA DE NASCIMENTO",
	canalAquisicao: "CANAL DE AQUISIÇÃO",
	localizacaoCidade: "CIDADE",
	localizacaoEstado: "ESTADO",
	localizacaoBairro: "BAIRRO",
	localizacaoCep: "CEP",
};

const FIELD_SYNONYMS: Record<z.infer<typeof BulkClientCanonicalFieldSchema>, string[]> = {
	nome: ["nome", "cliente", "consumidor", "razao", "fantasia"],
	cpfCnpj: ["cpf", "cnpj", "documento", "doc"],
	telefone: ["telefone", "celular", "fone", "whatsapp", "tel", "contato"],
	email: ["email", "e-mail", "mail", "correio"],
	dataNascimento: ["nascimento", "data de nascimento", "aniversario", "dt nasc", "dn"],
	canalAquisicao: ["canal", "origem", "aquisicao", "captacao", "fonte"],
	localizacaoCidade: ["cidade", "municipio", "localidade"],
	localizacaoEstado: ["estado", "uf", "sigla estado"],
	localizacaoBairro: ["bairro", "distrito", "setor"],
	localizacaoCep: ["cep", "codigo postal", "postal"],
};

function normalizeHeader(value: string) {
	return value
		.trim()
		.toUpperCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function runHeuristicMapping(headers: string[]): TBulkClientsMapOutput {
	const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));
	const mappingDefinitions = BulkClientCanonicalFieldSchema.options.map((field) => {
		const matched = normalizedHeaders.find((header) => FIELD_SYNONYMS[field].some((synonym) => header.normalized.includes(normalizeHeader(synonym))));

		return {
			field,
			sourceColumn: matched?.original ?? null,
			confidence: matched ? 0.55 : null,
			reason: matched ? "Mapeamento por heurística de cabeçalho." : "Nenhuma coluna equivalente detectada automaticamente.",
		};
	});

	return {
		mappingDefinitions,
		warnings: [],
	};
}

function sanitizeMapOutput({ headers, output }: { headers: string[]; output: TBulkClientsMapOutput }): TBulkClientsMapOutput {
	const headerSet = new Set(headers);
	const outputByField = new Map(output.mappingDefinitions.map((mapping) => [mapping.field, mapping]));
	const warnings = [...output.warnings];

	const mappingDefinitions = BulkClientCanonicalFieldSchema.options.map((field) => {
		const candidate = outputByField.get(field);
		if (!candidate) {
			return {
				field,
				sourceColumn: null,
				confidence: null,
				reason: "Campo não retornado pela IA.",
			};
		}

		if (candidate.sourceColumn && !headerSet.has(candidate.sourceColumn)) {
			warnings.push(`A coluna sugerida para '${FIELD_LABELS[field]}' não existe na planilha e foi ignorada.`);
			return {
				field,
				sourceColumn: null,
				confidence: null,
				reason: "Coluna sugerida não existe na planilha.",
			};
		}

		return candidate;
	});

	return { mappingDefinitions, warnings };
}

const mapClientsSheetRoute: PagesRouteHandler<TMapClientsSheetOutput> = async (req, res) => {
	// Etapa da importação (e chamada paga ao modelo): mesma permissão de importar.
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanManageClientBase(sessionUser);
	const input = BulkClientsMapInputSchema.parse(req.body);
	const heuristicResult = runHeuristicMapping(input.headers);

	try {
		const fieldsPrompt = BulkClientCanonicalFieldSchema.options.map((field) => `${field} (${FIELD_LABELS[field]})`).join(", ");

		const { output } = await generateText({
			model: gateway("anthropic/claude-haiku-4.5"),
			output: Output.object({
				schema: BulkClientsMapOutputSchema,
			}),
			system:
				"Você é um especialista em mapeamento de colunas de planilhas de clientes. Responda sempre em JSON válido no schema pedido. " +
				"Escolha apenas colunas existentes. Se não tiver certeza, retorne sourceColumn = null.",
			prompt: `Mapeie os cabeçalhos para os campos canônicos: ${fieldsPrompt}.

Cabeçalhos da planilha:
${JSON.stringify(input.headers)}

Linhas de amostra:
${JSON.stringify(input.sampleRows.slice(0, 20))}
`,
		});
		console.log("[INFO] [CLIENTS_BULK_MAPPING] AI Output", output);
		const sanitized = sanitizeMapOutput({ headers: input.headers, output });
		const parsed = BulkClientsMapOutputSchema.parse(sanitized);
		return res.status(200).json({
			data: parsed,
			message: "Mapeamento sugerido com sucesso.",
		});
	} catch (error) {
		console.error("[CLIENTS_BULK_MAP] Erro ao mapear com IA, usando heurística.", error);
		return res.status(200).json({
			data: heuristicResult,
			message: "Mapeamento sugerido com heurística.",
		});
	}
};

const routeHandlers = {
	POST: mapClientsSheetRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
