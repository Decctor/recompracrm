import z from "zod";

export const PartnerSchema = z.object({
	clienteId: z.string({ invalid_type_error: "Tipo não válido para o ID do cliente." }).optional().nullable(),
	identificador: z.string({
		required_error: "Identificador do parceiro não informado.",
		invalid_type_error: "Tipo não válido para o identificador do parceiro.",
	}),
	codigoAfiliacao: z.string({ invalid_type_error: "Tipo não válido para o código de afiliação." }).optional().nullable(),
	nome: z.string({
		required_error: "Nome do parceiro não informado.",
		invalid_type_error: "Tipo não válido para o nome do parceiro.",
	}),
	avatarUrl: z.string({ invalid_type_error: "Tipo não válido para a url do avatar do parceiro." }).optional().nullable(),
	cpfCnpj: z.string({ invalid_type_error: "Tipo não válido para o CPF/CNPJ do parceiro." }).optional().nullable(),
	telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone do parceiro." }).optional().nullable(),
	telefoneBase: z.string({ invalid_type_error: "Tipo não válido para o telefone base do parceiro." }).optional().nullable(),
	email: z.string({ invalid_type_error: "Tipo não válido para o email do parceiro." }).optional().nullable(),
	// Location
	localizacaoCep: z.string({ invalid_type_error: "Tipo não válido para o CEP do parceiro." }).optional().nullable(),
	localizacaoEstado: z.string({ invalid_type_error: "Tipo não válido para o estado do parceiro." }).optional().nullable(),
	localizacaoCidade: z.string({ invalid_type_error: "Tipo não válido para a cidade do parceiro." }).optional().nullable(),
	localizacaoBairro: z.string({ invalid_type_error: "Tipo não válido para o bairro do parceiro." }).optional().nullable(),
	localizacaoLogradouro: z.string({ invalid_type_error: "Tipo não válido para o logradouro do parceiro." }).optional().nullable(),
	localizacaoNumero: z.string({ invalid_type_error: "Tipo não válido para o número do parceiro." }).optional().nullable(),
	localizacaoComplemento: z.string({ invalid_type_error: "Tipo não válido para o complemento do parceiro." }).optional().nullable(),
	// Others
	dataInsercao: z
		.string({
			required_error: "Data de inserção do parceiro não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção do parceiro.",
		})
		.transform((val) => new Date(val)),
});

export const PartnerStateSchema = z.object({
	partner: PartnerSchema,
	avatarHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z
			.string({
				invalid_type_error: "Tipo não válido para a url do preview do avatar do parceiro.",
			})
			.optional()
			.nullable(),
	}),
});
export type TPartnerState = z.infer<typeof PartnerStateSchema>;
