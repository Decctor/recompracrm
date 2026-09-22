import { AUTO_EMISSION_MAX_DELAY_MINUTES } from "@/lib/fiscal/constants";
import { z } from "zod";
import {
  FiscalClientTaxIndicatorEnum,
  FiscalDocumentEnvironmentEnum,
  FiscalDocumentEventTypeEnum,
  FiscalDocumentLifecycleStatusEnum,
  FiscalDocumentStatusEnum,
  FiscalDocumentTypeEnum,
  FiscalIcmsCsosnEnum,
  FiscalOperationConsumerPresenceEnum,
  FiscalOperationFinalityEnum,
  FiscalPisCofinsCstEnum,
  FiscalProductOriginEnum,
  FiscalTaxRuleScopeEnum,
  PaymentMethodEnum,
} from "./enums";

export const FiscalAddressSchema = z.object({
  logradouro: z.string({
    required_error: "Logradouro fiscal não informado.",
    invalid_type_error: "Tipo não valido para o logradouro fiscal.",
  }),
  numero: z.string({
    required_error: "Numero fiscal não informado.",
    invalid_type_error: "Tipo não valido para o numero fiscal.",
  }),
  complemento: z
    .string({
      invalid_type_error: "Tipo não valido para o complemento fiscal.",
    })
    .optional()
    .nullable(),
  bairro: z.string({
    required_error: "Bairro fiscal não informado.",
    invalid_type_error: "Tipo não valido para o bairro fiscal.",
  }),
  codigoMunicipio: z.string({
    required_error: "Codigo do municipio fiscal não informado.",
    invalid_type_error: "Tipo não valido para o codigo do municipio fiscal.",
  }),
  cidade: z.string({
    required_error: "Cidade fiscal não informada.",
    invalid_type_error: "Tipo não valido para a cidade fiscal.",
  }),
  uf: z.string({
    required_error: "UF fiscal não informada.",
    invalid_type_error: "Tipo não valido para a UF fiscal.",
  }),
  cep: z.string({
    required_error: "CEP fiscal não informado.",
    invalid_type_error: "Tipo não valido para o CEP fiscal.",
  }),
  codigoPais: z
    .string({
      invalid_type_error: "Tipo não valido para o codigo do pais fiscal.",
    })
    .default("1058"),
  pais: z
    .string({ invalid_type_error: "Tipo não valido para o pais fiscal." })
    .default("BRASIL"),
});
export type TFiscalAddress = z.infer<typeof FiscalAddressSchema>;

export const FiscalCertificateMetadataSchema = z.object({
  // Legacy read compatibility only. New uploads are forwarded directly to the provider and never stored by us.
  storagePath: z
    .string({
      invalid_type_error: "Tipo não valido para o path do certificado.",
    })
    .optional()
    .nullable(),
  providerManaged: z
    .boolean({
      invalid_type_error:
        "Tipo não valido para o gerenciamento do certificado.",
    })
    .optional()
    .default(false),
  // From/to provider
  serialNumber: z
    .string({
      invalid_type_error: "Tipo não valido para o serial do certificado.",
    })
    .optional()
    .nullable(),
  issuerName: z
    .string({
      invalid_type_error: "Tipo não valido para a emissora do certificado.",
    })
    .optional()
    .nullable(),
  subjectName: z
    .string({
      invalid_type_error: "Tipo não valido para o assunto do certificado.",
    })
    .optional()
    .nullable(),
  thumbprint: z
    .string({
      invalid_type_error: "Tipo não valido para o thumbprint do certificado.",
    })
    .optional()
    .nullable(),
  validFrom: z
    .string({
      invalid_type_error:
        "Tipo não valido para a validade inicial do certificado.",
    })
    .datetime({
      message: "Tipo não valido para a validade inicial do certificado.",
    })
    .optional()
    .nullable(),
  validTo: z
    .string({
      invalid_type_error:
        "Tipo não valido para a validade final do certificado.",
    })
    .datetime({
      message: "Tipo não valido para a validade final do certificado.",
    })
    .optional()
    .nullable(),
  uploadedAt: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de upload do certificado.",
    })
    .datetime({
      message: "Tipo não valido para a data de upload do certificado.",
    })
    .optional()
    .nullable(),
});
export type TFiscalCertificateMetadata = z.infer<
  typeof FiscalCertificateMetadataSchema
>;

export const OrganizationFiscalConfigSchema = z.object({
  ambiente: FiscalDocumentEnvironmentEnum.default("HOMOLOGACAO"),
  regimeTributario: z
    .number({
      required_error: "Regime tributario não informado.",
      invalid_type_error: "Tipo não valido para o regime tributario.",
    })
    .int()
    .min(1)
    .max(4),
  emailFiscal: z
    .string({ invalid_type_error: "Tipo não valido para o email fiscal." })
    .email("Email fiscal invalido.")
    .optional()
    .nullable(),
  telefoneFiscal: z
    .string({ invalid_type_error: "Tipo não valido para o telefone fiscal." })
    .optional()
    .nullable(),
  nomeRazaoSocial: z.string({
    required_error: "Razao social fiscal não informada.",
    invalid_type_error: "Tipo não valido para a razao social fiscal.",
  }),
  nomeFantasia: z
    .string({
      invalid_type_error: "Tipo não valido para o nome fantasia fiscal.",
    })
    .optional()
    .nullable(),
  cpfCnpj: z.string({
    required_error: "CPF/CNPJ fiscal não informado.",
    invalid_type_error: "Tipo não valido para o CPF/CNPJ fiscal.",
  }),
  inscricaoEstadual: z
    .string({
      invalid_type_error: "Tipo não valido para a inscricao estadual.",
    })
    .optional()
    .nullable(),
  inscricaoMunicipal: z
    .string({
      invalid_type_error: "Tipo não valido para a inscricao municipal.",
    })
    .optional()
    .nullable(),
  cnae: z
    .string({ invalid_type_error: "Tipo não valido para o CNAE fiscal." })
    .optional()
    .nullable(),
  endereco: FiscalAddressSchema,
  spedy: z
    .object({
      companyId: z
        .string({
          invalid_type_error: "Tipo não valido para o ID da empresa na Spedy.",
        })
        .optional()
        .nullable(),
      companyApiKey: z
        .string({
          invalid_type_error:
            "Tipo não valido para a chave de emissão da empresa na Spedy.",
        })
        .optional()
        .nullable(),
      certificado: FiscalCertificateMetadataSchema.default({}),
      nfce: z.object({
        tokenId: z
          .string({
            invalid_type_error: "Tipo não valido para o ID do token da NFC-e.",
          })
          .optional()
          .nullable(),
        csc: z
          .string({
            invalid_type_error: "Tipo não valido para o CSC da NFC-e.",
          })
          .optional()
          .nullable(),
      }),
      nfe: z.object({}).default({}),
    })
    .default({
      companyId: null,
      companyApiKey: null,
      certificado: {},
      nfce: {},
      nfe: {},
    }),
  operacaoPadraoPorTipo: z
    .object({
      NFCE: z
        .string({
          invalid_type_error:
            "Tipo não valido para a operacao padrao da NFC-e.",
        })
        .optional()
        .nullable(),
      NFE: z
        .string({
          invalid_type_error: "Tipo não valido para a operacao padrao da NF-e.",
        })
        .optional()
        .nullable(),
    })
    .default({ NFCE: null, NFE: null }),
  // DF-e (notas recebidas contra o CNPJ da organizacao).
  dfe: z
    .object({
      habilitado: z
        .boolean({
          invalid_type_error: "Tipo não valido para a flag de notas recebidas.",
        })
        .default(false),
      // Corte de importacao: so notas emitidas depois desta data entram (SEFAZ retem ~90 dias).
      // ISO string (sem transform): o valor mora no JSON de configuracao e precisa fazer roundtrip.
      dataInicio: z
        .string({
          invalid_type_error:
            "Tipo não valido para a data de inicio das notas recebidas.",
        })
        .datetime({ message: "Data de inicio das notas recebidas invalida." })
        .optional()
        .nullable(),
      // Registrar ciencia automaticamente ao receber novas notas (destrava o XML completo).
      autoCiencia: z
        .boolean({
          invalid_type_error:
            "Tipo não valido para a flag de auto-ciencia DF-e.",
        })
        .default(true),
    })
    .default({ habilitado: false, dataInicio: null, autoCiencia: true }),
  emissaoAutomatica: z
    .object({
      // Espera entre a venda ficar elegível e a emissão acontecer (0 = imediato). A elegibilidade
      // é reavaliada no fim da espera, então a venda pode ser corrigida ou cancelada na janela.
      // Teto do schema = limite do delay da fila (7 dias); a interface limita a 24 h.
      atrasoMinutos: z
        .number({
          invalid_type_error:
            "Tipo não valido para o atraso da emissão automática.",
        })
        .int({ message: "O atraso da emissão automática deve ser em minutos inteiros." })
        .min(0, { message: "O atraso da emissão automática não pode ser negativo." })
        .max(AUTO_EMISSION_MAX_DELAY_MINUTES, {
          message: "O atraso da emissão automática não pode passar de 7 dias.",
        })
        .default(0),
      // Exceções combinadas por OR: qualquer condição que casar suprime a emissão automática
      // (a emissão manual e o override explícito por venda continuam disponíveis).
      excecoes: z
        .object({
          // Não emitir quando a venda for paga exclusivamente com estes métodos — mix com método fora da lista emite.
          pagamentoExclusivo: z
            .array(PaymentMethodEnum, {
              invalid_type_error:
                "Tipo não valido para os métodos de pagamento exclusivo.",
            })
            .default([]),
        })
        .default({ pagamentoExclusivo: [] }),
    })
    .default({ atrasoMinutos: 0, excecoes: { pagamentoExclusivo: [] } }),
  emissaoManual: z
    .object({
      classificacaoPresencialExcepcional: z
        .object({
          habilitada: z
            .boolean({
              invalid_type_error:
                "Tipo não valido para a classificação presencial excepcional.",
            })
            .default(false),
        })
        .default({ habilitada: false }),
    })
    .default({ classificacaoPresencialExcepcional: { habilitada: false } }),
});
export type TOrganizationFiscalConfig = z.infer<
  typeof OrganizationFiscalConfigSchema
>;

export const FiscalSeriesSchema = z.object({
  organizacaoId: z.string({
    required_error: "ID da organizacao não informado.",
    invalid_type_error: "Tipo não valido para o ID da organizacao.",
  }),
  tipoDocumento: FiscalDocumentTypeEnum,
  ambiente: FiscalDocumentEnvironmentEnum.default("HOMOLOGACAO"),
  serie: z.string({
    required_error: "Serie fiscal não informada.",
    invalid_type_error: "Tipo não valido para a serie fiscal.",
  }),
  proximoNumero: z.number({
    required_error: "Proximo numero fiscal não informado.",
    invalid_type_error: "Tipo não valido para o proximo numero fiscal.",
  }),
  ativo: z
    .boolean({
      invalid_type_error: "Tipo não valido para o status da serie fiscal.",
    })
    .default(true),
  dataInsercao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de insercao da serie fiscal.",
    })
    .datetime({
      message: "Tipo não valido para a data de insercao da serie fiscal.",
    })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TFiscalSeries = z.infer<typeof FiscalSeriesSchema>;

export const FiscalOperationProfileSchema = z.object({
  organizacaoId: z.string({
    required_error: "ID da organizacao não informado.",
    invalid_type_error: "Tipo não valido para o ID da organizacao.",
  }),
  nome: z.string({
    required_error: "Nome da operacao fiscal não informado.",
    invalid_type_error: "Tipo não valido para o nome da operacao fiscal.",
  }),
  descricao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a descricao da operacao fiscal.",
    })
    .optional()
    .nullable(),
  tipoDocumento: FiscalDocumentTypeEnum,
  finalidade: FiscalOperationFinalityEnum.default("NORMAL"),
  presencaConsumidor: FiscalOperationConsumerPresenceEnum.default(
    "OPERACAO_PRESENCIAL",
  ),
  consumidorFinal: z
    .boolean({ invalid_type_error: "Tipo não valido para consumidor final." })
    .default(true),
  cfopPadrao: z.string({
    required_error: "CFOP padrao não informado.",
    invalid_type_error: "Tipo não valido para o CFOP padrao.",
  }),
  naturezaOperacao: z.string({
    required_error: "Natureza da operacao não informada.",
    invalid_type_error: "Tipo não valido para a natureza da operacao.",
  }),
  seriePadraoId: z
    .string({
      invalid_type_error: "Tipo não valido para o ID da serie padrao.",
    })
    .optional()
    .nullable(),
  ativo: z
    .boolean({
      invalid_type_error: "Tipo não valido para o status da operacao fiscal.",
    })
    .default(true),
  dataInsercao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de insercao da operacao fiscal.",
    })
    .datetime({
      message: "Tipo não valido para a data de insercao da operacao fiscal.",
    })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TFiscalOperationProfile = z.infer<
  typeof FiscalOperationProfileSchema
>;

export const ProductFiscalProfileSchema = z.object({
  organizacaoId: z.string({
    required_error: "ID da organizacao não informado.",
    invalid_type_error: "Tipo não valido para o ID da organizacao.",
  }),
  produtoId: z.string({
    required_error: "ID do produto não informado.",
    invalid_type_error: "Tipo não valido para o ID do produto.",
  }),
  produtoVarianteId: z
    .string({
      invalid_type_error: "Tipo não valido para o ID da variante do produto.",
    })
    .optional()
    .nullable(),
  grupoTributarioId: z
    .string({
      invalid_type_error: "Tipo não valido para o ID do grupo tributario.",
    })
    .optional()
    .nullable(),
  origemMercadoria: FiscalProductOriginEnum.default("NACIONAL"),
  ncm: z.string({
    required_error: "NCM fiscal não informado.",
    invalid_type_error: "Tipo não valido para o NCM fiscal.",
  }),
  exTipi: z
    .string({ invalid_type_error: "Tipo não valido para o EX TIPI fiscal." })
    .optional()
    .nullable(),
  cest: z
    .string({ invalid_type_error: "Tipo não valido para o CEST fiscal." })
    .optional()
    .nullable(),
  cfopPadrao: z
    .string({
      invalid_type_error: "Tipo não valido para o CFOP padrao do produto.",
    })
    .optional()
    .nullable(),
  unidadeComercial: z
    .string({ invalid_type_error: "Tipo não valido para a unidade comercial." })
    .default("UN"),
  codigoBeneficioFiscal: z
    .string({
      invalid_type_error: "Tipo não valido para o codigo de beneficio fiscal.",
    })
    .optional()
    .nullable(),
  ativo: z
    .boolean({
      invalid_type_error:
        "Tipo não valido para o status do perfil fiscal do produto.",
    })
    .default(true),
  dataInsercao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de insercao do perfil fiscal.",
    })
    .datetime({
      message: "Tipo não valido para a data de insercao do perfil fiscal.",
    })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TProductFiscalProfile = z.infer<typeof ProductFiscalProfileSchema>;

export const FiscalTaxGroupSchema = z.object({
  organizacaoId: z.string({
    required_error: "ID da organizacao não informado.",
    invalid_type_error: "Tipo não valido para o ID da organizacao.",
  }),
  nome: z.string({
    required_error: "Nome do grupo tributario não informado.",
    invalid_type_error: "Tipo não valido para o nome do grupo tributario.",
  }),
  descricao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a descricao do grupo tributario.",
    })
    .optional()
    .nullable(),
  csosn: FiscalIcmsCsosnEnum.default("102"),
  aliquotaIcms: z
    .number({ invalid_type_error: "Tipo não valido para a aliquota de ICMS." })
    .min(0)
    .default(0),
  percentualReducaoBc: z
    .number({
      invalid_type_error:
        "Tipo não valido para o percentual de reducao da base de ICMS.",
    })
    .min(0)
    .default(0),
  modalidadeBc: z
    .number({
      invalid_type_error: "Tipo não valido para a modalidade de base de ICMS.",
    })
    .int()
    .min(0)
    .max(3)
    .default(3),
  percentualCreditoSn: z
    .number({
      invalid_type_error:
        "Tipo não valido para o percentual de credito do Simples Nacional.",
    })
    .min(0)
    .optional()
    .nullable(),
  temSubstituicaoTributaria: z
    .boolean({
      invalid_type_error:
        "Tipo não valido para a flag de substituicao tributaria.",
    })
    .default(false),
  mvaSt: z
    .number({
      invalid_type_error:
        "Tipo não valido para o MVA da substituicao tributaria.",
    })
    .min(0)
    .optional()
    .nullable(),
  aliquotaIcmsSt: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota de ICMS-ST.",
    })
    .min(0)
    .optional()
    .nullable(),
  aliquotaInternaDestino: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota interna do destino.",
    })
    .min(0)
    .optional()
    .nullable(),
  percentualReducaoBcSt: z
    .number({
      invalid_type_error:
        "Tipo não valido para o percentual de reducao da base de ICMS-ST.",
    })
    .min(0)
    .optional()
    .nullable(),
  aliquotaFcp: z
    .number({ invalid_type_error: "Tipo não valido para a aliquota de FCP." })
    .min(0)
    .default(0),
  aliquotaFcpSt: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota de FCP-ST.",
    })
    .min(0)
    .default(0),
  cstPis: FiscalPisCofinsCstEnum.default("49"),
  aliquotaPis: z
    .number({ invalid_type_error: "Tipo não valido para a aliquota de PIS." })
    .min(0)
    .default(0),
  cstCofins: FiscalPisCofinsCstEnum.default("49"),
  aliquotaCofins: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota de COFINS.",
    })
    .min(0)
    .default(0),
  ativo: z
    .boolean({
      invalid_type_error: "Tipo não valido para o status do grupo tributario.",
    })
    .default(true),
  dataInsercao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de insercao do grupo tributario.",
    })
    .datetime({
      message: "Tipo não valido para a data de insercao do grupo tributario.",
    })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TFiscalTaxGroup = z.infer<typeof FiscalTaxGroupSchema>;

export const FiscalTaxGroupRuleSchema = z.object({
  grupoTributarioId: z.string({
    required_error: "ID do grupo tributario não informado.",
    invalid_type_error: "Tipo não valido para o ID do grupo tributario.",
  }),
  organizacaoId: z.string({
    required_error: "ID da organizacao não informado.",
    invalid_type_error: "Tipo não valido para o ID da organizacao.",
  }),
  escopo: FiscalTaxRuleScopeEnum,
  ufDestino: z
    .string({ invalid_type_error: "Tipo não valido para a UF de destino." })
    .length(2)
    .optional()
    .nullable(),
  indicadorDestinatario: FiscalClientTaxIndicatorEnum.optional().nullable(),
  finalidade: FiscalOperationFinalityEnum.optional().nullable(),
  csosn: FiscalIcmsCsosnEnum.optional().nullable(),
  cfop: z
    .string({ invalid_type_error: "Tipo não valido para o CFOP da regra." })
    .optional()
    .nullable(),
  aliquotaIcms: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota de ICMS da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  percentualReducaoBc: z
    .number({
      invalid_type_error:
        "Tipo não valido para o percentual de reducao da base da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  percentualCreditoSn: z
    .number({
      invalid_type_error:
        "Tipo não valido para o percentual de credito do SN da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  temSubstituicaoTributaria: z
    .boolean({
      invalid_type_error: "Tipo não valido para a flag de ST da regra.",
    })
    .optional()
    .nullable(),
  mvaSt: z
    .number({ invalid_type_error: "Tipo não valido para o MVA da regra." })
    .min(0)
    .optional()
    .nullable(),
  aliquotaIcmsSt: z
    .number({
      invalid_type_error:
        "Tipo não valido para a aliquota de ICMS-ST da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  aliquotaInternaDestino: z
    .number({
      invalid_type_error:
        "Tipo não valido para a aliquota interna de destino da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  percentualReducaoBcSt: z
    .number({
      invalid_type_error:
        "Tipo não valido para o percentual de reducao da base de ST da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  aliquotaFcp: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota de FCP da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  aliquotaFcpSt: z
    .number({
      invalid_type_error: "Tipo não valido para a aliquota de FCP-ST da regra.",
    })
    .min(0)
    .optional()
    .nullable(),
  ativo: z
    .boolean({ invalid_type_error: "Tipo não valido para o status da regra." })
    .default(true),
  dataInsercao: z
    .string({
      invalid_type_error: "Tipo não valido para a data de insercao da regra.",
    })
    .datetime({ message: "Tipo não valido para a data de insercao da regra." })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TFiscalTaxGroupRule = z.infer<typeof FiscalTaxGroupRuleSchema>;

export const FiscalDocumentSchema = z.object({
  organizacaoId: z.string({
    required_error: "ID da organizacao não informado.",
    invalid_type_error: "Tipo não valido para o ID da organizacao.",
  }),
  vendaId: z
    .string({ invalid_type_error: "Tipo não valido para o ID da venda." })
    .optional()
    .nullable(),
  compraId: z
    .string({ invalid_type_error: "Tipo não valido para o ID da compra." })
    .optional()
    .nullable(),
  lancamentoContabilId: z
    .string({
      invalid_type_error: "Tipo não valido para o ID do lancamento contabil.",
    })
    .optional()
    .nullable(),
  tipo: FiscalDocumentTypeEnum,
  status: FiscalDocumentStatusEnum.default("PENDENTE"),
  statusInterno: FiscalDocumentLifecycleStatusEnum.default("RASCUNHO"),
  ambiente: FiscalDocumentEnvironmentEnum.default("HOMOLOGACAO"),
  referencia: z.string({
    required_error: "Referencia fiscal não informada.",
    invalid_type_error: "Tipo não valido para a referencia fiscal.",
  }),
  provedor: z
    .string({ invalid_type_error: "Tipo não valido para o provedor fiscal." })
    .optional()
    .nullable(),
  provedorDocumentoId: z
    .string({
      invalid_type_error:
        "Tipo não valido para o ID externo do documento fiscal.",
    })
    .optional()
    .nullable(),
  provedorStatus: z
    .string({
      invalid_type_error:
        "Tipo não valido para o status externo do documento fiscal.",
    })
    .optional()
    .nullable(),
  chaveAcesso: z
    .string({ invalid_type_error: "Tipo não valido para a chave de acesso." })
    .optional()
    .nullable(),
  numero: z
    .string({
      invalid_type_error: "Tipo não valido para o numero do documento.",
    })
    .optional()
    .nullable(),
  serie: z
    .string({
      invalid_type_error: "Tipo não valido para a serie do documento.",
    })
    .optional()
    .nullable(),
  protocolo: z
    .string({
      invalid_type_error: "Tipo não valido para o protocolo do documento.",
    })
    .optional()
    .nullable(),
  mensagens: z
    .array(z.unknown(), {
      invalid_type_error: "Tipo não valido para as mensagens fiscais.",
    })
    .default([]),
  snapshotOrigemVenda: z.record(z.any()).optional().nullable(),
  provedorPayload: z.record(z.any()).optional().nullable(),
  provedorRetorno: z.record(z.any()).optional().nullable(),
  xmlStoragePath: z
    .string({ invalid_type_error: "Tipo não valido para o path do XML." })
    .optional()
    .nullable(),
  pdfStoragePath: z
    .string({ invalid_type_error: "Tipo não valido para o path do PDF." })
    .optional()
    .nullable(),
  tentativasEnvio: z
    .number({
      invalid_type_error:
        "Tipo não valido para o numero de tentativas de envio.",
    })
    .default(0),
  dataUltimaSincronizacao: z
    .string({
      invalid_type_error: "Tipo não valido para a ultima sincronizacao.",
    })
    .datetime({ message: "Tipo não valido para a ultima sincronizacao." })
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  dataAutorizacao: z
    .string({
      invalid_type_error: "Tipo não valido para a data de autorizacao.",
    })
    .datetime({ message: "Tipo não valido para a data de autorizacao." })
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  dataCancelamento: z
    .string({
      invalid_type_error: "Tipo não valido para a data de cancelamento.",
    })
    .datetime({ message: "Tipo não valido para a data de cancelamento." })
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  dataEmissao: z
    .string({ invalid_type_error: "Tipo não valido para a data de emissao." })
    .datetime({ message: "Tipo não valido para a data de emissao." })
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  dataInsercao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de insercao do documento fiscal.",
    })
    .datetime({
      message: "Tipo não valido para a data de insercao do documento fiscal.",
    })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TFiscalDocument = z.infer<typeof FiscalDocumentSchema>;

export const FiscalDocumentEventSchema = z.object({
  documentoFiscalId: z.string({
    required_error: "ID do documento fiscal não informado.",
    invalid_type_error: "Tipo não valido para o ID do documento fiscal.",
  }),
  tipo: FiscalDocumentEventTypeEnum,
  descricao: z
    .string({
      invalid_type_error: "Tipo não valido para a descricao do evento fiscal.",
    })
    .optional()
    .nullable(),
  payload: z.record(z.any()).optional().nullable(),
  autorId: z
    .string({
      invalid_type_error:
        "Tipo não valido para o ID do autor do evento fiscal.",
    })
    .optional()
    .nullable(),
  dataInsercao: z
    .string({
      invalid_type_error:
        "Tipo não valido para a data de insercao do evento fiscal.",
    })
    .datetime({
      message: "Tipo não valido para a data de insercao do evento fiscal.",
    })
    .default(new Date().toISOString())
    .transform((val) => new Date(val)),
});
export type TFiscalDocumentEvent = z.infer<typeof FiscalDocumentEventSchema>;

export const FiscalClientProfileSchema = z.object({
  inscricaoEstadual: z
    .string({
      invalid_type_error:
        "Tipo não valido para a inscricao estadual do cliente.",
    })
    .optional()
    .nullable(),
  indicadorInscricaoEstadual:
    FiscalClientTaxIndicatorEnum.default("NAO_CONTRIBUINTE"),
  suframa: z
    .string({
      invalid_type_error: "Tipo não valido para a SUFRAMA do cliente.",
    })
    .optional()
    .nullable(),
});
export type TFiscalClientProfile = z.infer<typeof FiscalClientProfileSchema>;
