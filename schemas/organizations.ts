import z from "zod";
import {
	DefaultDataSourceEnum,
	DiscountLimitTypeEnum,
	OrganizationIntegrationTypeEnum,
	PoiRegistrationFlowEnum,
} from "./enums";
import { OrganizationFiscalConfigSchema } from "./fiscal";
import { DataSourceIntegrationConfigSchema } from "./integrations";
import { ORGANIZATION_SLUG_INVALID_MESSAGE, ORGANIZATION_SLUG_REGEX } from "@/lib/organizations/slug";
import { normalizeEmail } from "@/lib/formatting";
import { PaymentEffectivenessTypeEnum } from "@/lib/payments/schemas";

/**
 * @deprecated As variantes vivem em `schemas/integrations.ts` (DataSourceIntegrationConfigSchema);
 * a conexão de fonte de dados agora é uma linha em `integrations`. Este alias existe só para as
 * colunas congeladas `organizations.integracaoTipo`/`integracaoConfiguracao` até a fase de limpeza
 * (docs/dev-planning/data-source-integrations-migration-plan.md, Fase 4).
 */
export const OrganizationIntegrationConfigSchema = DataSourceIntegrationConfigSchema;
export type TOrganizationIntegrationConfig = z.infer<typeof OrganizationIntegrationConfigSchema>;

/**
 * Um campo personalizado colocado no assistente de cadastro de uma superfície do POI. Guarda só a
 * referência (`campoId`) e a política local (`obrigatorio`) — título, tipo e opções continuam
 * vivendo na definição em `custom_fields`, para que renomear um campo não exija reescrever o jsonb.
 */
export const PoiRegistrationFieldConfigSchema = z.object({
	campoId: z.string({
		required_error: "ID do campo do cadastro do POI não informado.",
		invalid_type_error: "Tipo não válido para o ID do campo do cadastro do POI.",
	}),
	obrigatorio: z
		.boolean({
			invalid_type_error: "Tipo não válido para a obrigatoriedade do campo do cadastro do POI.",
		})
		.default(false),
});
export type TPoiRegistrationFieldConfig = z.infer<typeof PoiRegistrationFieldConfigSchema>;

/**
 * Configuração do cadastro de UMA superfície (celular ou totem). A ORDEM do array `campos` é a
 * ordem dos passos do assistente — não há campo de posição separado justamente para que a ordem
 * não possa divergir de si mesma.
 */
export const PoiRegistrationSurfaceConfigSchema = z.object({
	fluxo: PoiRegistrationFlowEnum,
	campos: z
		.array(PoiRegistrationFieldConfigSchema, {
			invalid_type_error: "Tipo não válido para os campos do cadastro do POI.",
		})
		.default([]),
});
export type TPoiRegistrationSurfaceConfig = z.infer<typeof PoiRegistrationSurfaceConfigSchema>;

/**
 * As duas superfícies são configuradas separadamente de propósito: o totem do balcão e o celular
 * do cliente têm paciências diferentes para responder perguntas.
 *
 * "Stored" no nome do tipo separa isto do `TPoiRegistrationConfig` de
 * `lib/point-of-interaction/registration.ts`, que é a versão já resolvida (com título, tipo e
 * opções de cada campo) entregue ao assistente público. Aqui só ficam referências.
 */
export const StoredPoiRegistrationConfigSchema = z.object({
	mobile: PoiRegistrationSurfaceConfigSchema,
	kiosk: PoiRegistrationSurfaceConfigSchema,
});
export type TStoredPoiRegistrationConfig = z.infer<typeof StoredPoiRegistrationConfigSchema>;

/**
 * Configuração própria do Ponto de Interação. Sucessor EXPLÍCITO da derivação
 * `transactionRequiresSaleProcessing = !integracaoTipo` (D8): o registro de vendas do POI é
 * config decidida uma vez (backfill = snapshot do comportamento atual), não derivação do estado
 * das integrações. Consolidação futura das demais capacidades do POI (resgate, confirmação de
 * valor, QR codes, perfil) entra aqui em plano próprio.
 *
 * `cadastro` é opcional: ausência = cadastro rápido nas duas superfícies, sem campos — exatamente
 * o comportamento que as organizações existentes já têm, sem backfill.
 */
export const OrganizationPoiConfigSchema = z.object({
	vendas: z.object({
		registroAtivo: z.boolean({
			required_error: "Configuração de registro de vendas do POI não informada.",
			invalid_type_error: "Tipo não válido para o registro de vendas do POI.",
		}),
	}),
	cadastro: StoredPoiRegistrationConfigSchema.optional(),
});
export type TOrganizationPoiConfig = z.infer<typeof OrganizationPoiConfigSchema>;

export const OrganizationPaymentMethodDefaultsSchema = z.object({
	suportado: z.boolean({
		invalid_type_error: "Tipo não válido para se o método de pagamento é suportado.",
	}),
	contaFinanceiraPadraoId: z.string({ invalid_type_error: "Tipo não válido para a conta financeira padrão." }).nullable(),
	contaFinanceiraPadraoKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta financeira padrão." }).nullable(),
	// Quando true, o operador pode trocar a conta financeira do pagamento no PDV (a padrão vem
	// pré-selecionada). Organizações existentes não têm a chave no jsonb — daí o default.
	contaFinanceiraEditavel: z.boolean({ invalid_type_error: "Tipo não válido para se a conta financeira é editável na venda." }).default(false),
	efetivacaoTipoPadrao: PaymentEffectivenessTypeEnum,
	delayDiasPadrao: z.number({ invalid_type_error: "Tipo não válido para o delay padrão em dias." }).int().nullable(),
	parcelamento: z.object({
		permitido: z.boolean({
			invalid_type_error: "Tipo não válido para se o parcelamento é permitido.",
		}),
		minParcelas: z.number({ invalid_type_error: "Tipo não válido para o mínimo de parcelas." }).int(),
		maxParcelas: z.number({ invalid_type_error: "Tipo não válido para o máximo de parcelas." }).int().nullable(),
		intervaloMeses: z.number({ invalid_type_error: "Tipo não válido para o intervalo em meses." }).int().nullable(),
	}),
});
export type TOrganizationPaymentMethodDefaults = z.infer<typeof OrganizationPaymentMethodDefaultsSchema>;

export const OrganizationDefaultsSchema = z.object({
	contabilidade: z.object({
		lancamentosPadrao: z.object({
			vendas: z.object({
				debitoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de débito padrão de vendas." }).nullable(),
				debitoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito padrão de vendas." }).nullable(),
				creditoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de crédito padrão de vendas." }).nullable(),
				creditoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de crédito padrão de vendas." }).nullable(),
			}),
			// A compra é o único lançamento padrão com mais de um débito: o valor devido ao fornecedor se
			// reparte entre estoque, crédito tributário e despesa do período conforme o `tratamento` de cada
			// modificador do item. Por isso os débitos extras moram aqui, e não num bloco paralelo — são
			// pernas do mesmo lançamento. Ver docs/domain/purchase-costing.md.
			compras: z.object({
				debitoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de débito padrão de compras." }).nullable(),
				debitoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito padrão de compras." }).nullable(),
				creditoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de crédito padrão de compras." }).nullable(),
				creditoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de crédito padrão de compras." }).nullable(),
				// `.default(null)` e não `.nullable()` puro: configurações gravadas antes destes campos
				// existirem não trazem a chave, e um `null` obrigatório faria o parse delas quebrar.
				debitoCreditoTributarioContaId: z
					.string({ invalid_type_error: "Tipo não válido para a conta de débito de crédito tributário de compras." })
					.nullable()
					.default(null),
				debitoCreditoTributarioContaKey: z
					.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito de crédito tributário de compras." })
					.nullable()
					.default(null),
				debitoDespesaPeriodoContaId: z
					.string({ invalid_type_error: "Tipo não válido para a conta de débito de despesas do período de compras." })
					.nullable()
					.default(null),
				debitoDespesaPeriodoContaKey: z
					.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito de despesas do período de compras." })
					.nullable()
					.default(null),
			}),
			transferencias: z
				.object({
					debitoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de débito padrão de transferências." }).nullable(),
					debitoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito padrão de transferências." }).nullable(),
					creditoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de crédito padrão de transferências." }).nullable(),
					creditoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de crédito padrão de transferências." }).nullable(),
				})
				.default({
					debitoContaId: null,
					debitoContaKey: null,
					creditoContaId: null,
					creditoContaKey: null,
				}),
			perdasEstoque: z
				.object({
					debitoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de débito padrão de perdas de estoque." }).nullable(),
					debitoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito padrão de perdas de estoque." }).nullable(),
					creditoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de crédito padrão de perdas de estoque." }).nullable(),
					creditoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de crédito padrão de perdas de estoque." }).nullable(),
				})
				.default({
					debitoContaId: null,
					debitoContaKey: null,
					creditoContaId: null,
					creditoContaKey: null,
				}),
			// Taxas retidas por canais gerenciados (ex.: comissao do iFood): despesa comercial que
			// reduz o recebivel do canal — o repasse ja chega liquido, entao o credito e o proprio
			// contas a receber, nao um contas a pagar (que dobraria a obrigacao).
			taxasCanal: z
				.object({
					debitoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de débito padrão de taxas de canal." }).nullable(),
					debitoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de débito padrão de taxas de canal." }).nullable(),
					creditoContaId: z.string({ invalid_type_error: "Tipo não válido para a conta de crédito padrão de taxas de canal." }).nullable(),
					creditoContaKey: z.string({ invalid_type_error: "Tipo não válido para a chave da conta de crédito padrão de taxas de canal." }).nullable(),
				})
				.default({
					debitoContaId: null,
					debitoContaKey: null,
					creditoContaId: null,
					creditoContaKey: null,
				}),
		}),
	}),
	pagamentos: z.object({
		metodos: z.object({
			DINHEIRO: OrganizationPaymentMethodDefaultsSchema,
			PIX: OrganizationPaymentMethodDefaultsSchema,
			CARTAO_DEBITO: OrganizationPaymentMethodDefaultsSchema,
			CARTAO_CREDITO: OrganizationPaymentMethodDefaultsSchema,
			BOLETO: OrganizationPaymentMethodDefaultsSchema,
			TRANSFERENCIA: OrganizationPaymentMethodDefaultsSchema,
			CASHBACK: OrganizationPaymentMethodDefaultsSchema,
			VALE: OrganizationPaymentMethodDefaultsSchema,
			A_DEFINIR: OrganizationPaymentMethodDefaultsSchema,
			FIADO_NOTA: OrganizationPaymentMethodDefaultsSchema,
			OUTRO: OrganizationPaymentMethodDefaultsSchema,
		}),
	}),
});
export type TOrganizationDefaults = z.infer<typeof OrganizationDefaultsSchema>;
export type TOrganizationAccountingDefaults = TOrganizationDefaults;

// Impressão automática via agente desktop (docs/dev-planning/auto-print-wiring-plan.md).
// `canais` é allowlist de chaves de política derivadas da venda: canal interno cru ("POS",
// "SHOP", "COMANDA") ou "INTEGRACAO-<canal>" para vendas externas ("INTEGRACAO-IFOOD").
// Canal fora da lista (inclusive nulo e integrações novas) não imprime — opt-in explícito.
const OrganizationAutoPrintRuleSchema = z.object({
	habilitada: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação da impressão automática." }).default(false),
	canais: z.array(z.string({ invalid_type_error: "Tipo não válido para o canal de impressão automática." })).default([]),
	copias: z.number({ invalid_type_error: "Tipo não válido para o número de cópias da impressão automática." }).int().min(1).max(5).default(1),
});
export type TOrganizationAutoPrintRule = z.infer<typeof OrganizationAutoPrintRuleSchema>;

// Standalone (não só inline em preferencias): os orquestradores de auto-print parseiam este
// bloco defensivamente — `configuracao` não é re-parseada em cada leitura e linhas antigas não
// têm a chave até o próximo save de settings.
export const OrganizationPrintPreferencesSchema = z
	.object({
		automatica: z
			.object({
				CUPOM_VENDA: OrganizationAutoPrintRuleSchema.default({}),
				DANFE_NFCE: OrganizationAutoPrintRuleSchema.default({}),
				DANFE_NFE: OrganizationAutoPrintRuleSchema.default({}),
			})
			.default({}),
	})
	.default({});
export type TOrganizationPrintPreferences = z.infer<typeof OrganizationPrintPreferencesSchema>;

export const OrganizationConfigurationSchema = z.object({
	recursos: z.object({
		analytics: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de análise de dados.",
			}),
		}),
		campanhas: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de campanhas.",
			}),
			limiteAtivas: z.number({ invalid_type_error: "Tipo não válido para o limite de campanhas ativas." }).nullable(),
		}),
		programasCashback: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de programas de cashback.",
			}),
		}),
		hubAtendimentos: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de atendimentos via WhatsApp Hub.",
			}),
			limiteAtendentes: z
				.number({
					invalid_type_error: "Tipo não válido para o limite de atendentes (assentos) simultâneos.",
				})
				.nullable(),
		}),
		integracoes: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de integrações.",
			}),
			limiteAtivas: z
				.number({
					invalid_type_error: "Tipo não válido para o limite de integrações ativas simultâneas.",
				})
				.nullable(),
		}),
		relatoriosWhatsapp: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de relatórios via WhatsApp.",
			}),
		}),
		iaAtendimento: z.object({
			acesso: z.boolean({
				invalid_type_error: "Tipo não válido para o acesso aos recursos de atendimento via IA.",
			}),
			limiteCreditos: z
				.number({
					invalid_type_error: "Tipo não válido para o limite de créditos de IA por atendimento.",
				})
				.nullable(),
		}),
		erp: z
			.object({
				acesso: z.boolean({
					invalid_type_error: "Tipo não válido para o acesso aos recursos de ERP.",
				}),
			})
			.default({ acesso: false }),
	}),
	preferencias: z.object({
		rastreamentoEstoque: z.boolean({
			required_error: "Configuração global de rastreamento de estoque não informada.",
			invalid_type_error: "Tipo não válido para a configuração global de rastreamento de estoque.",
		}),
		limiteMensagensSemanaisViaCampanhas: z
			.number({
				invalid_type_error: "Tipo não válido para o limite semanal de mensagens enviadas via campanhas.",
			})
			.nullable()
			.optional()
			.default(null),
		relatoriosDestinatariosIds: z
			.array(z.string({ invalid_type_error: "Tipo não válido para o ID do destinatário de relatórios." }))
			.optional()
			.nullable(),
		sessoesVenda: z
			.object({
				habilitado: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação de sessões de venda." }),
				obrigatorio: z.boolean({ invalid_type_error: "Tipo não válido para a obrigatoriedade de sessões de venda." }),
				exigirFundoTroco: z.boolean({ invalid_type_error: "Tipo não válido para a exigência de fundo de troco." }),
				conferenciaCega: z.boolean({ invalid_type_error: "Tipo não válido para a conferência cega." }),
				bloquearFechamentoComPendenciaFiscal: z.boolean({
					invalid_type_error: "Tipo não válido para o bloqueio de fechamento com pendência fiscal.",
				}),
			})
			.default({
				habilitado: false,
				obrigatorio: false,
				exigirFundoTroco: false,
				conferenciaCega: false,
				bloquearFechamentoComPendenciaFiscal: false,
			}),
		carteirasClientes: z
			.object({
				habilitado: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação do módulo de carteira de clientes." }),
			})
			.default({
				habilitado: false,
			}),
		// Política de canal para vendas de integrações (fase 3 do plano iFood/fulfillment):
		// quais efeitos de ERP as vendas de canais gerenciados (ex.: iFood) geram na plataforma.
		// Cashback NÃO entra aqui: continua governado por cashbackPrograms.acumuloPermitirViaIntegracao.
		integracaoERP: z
			.object({
				fulfillment: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação do atendimento de vendas de integração." }),
				estoque: z.boolean({ invalid_type_error: "Tipo não válido para a baixa de estoque de vendas de integração." }),
				financeiro: z.boolean({ invalid_type_error: "Tipo não válido para o financeiro de vendas de integração." }),
				fiscal: z.boolean({ invalid_type_error: "Tipo não válido para a emissão fiscal de vendas de integração." }),
			})
			.default({
				fulfillment: false,
				estoque: false,
				financeiro: false,
				fiscal: false,
			}),
		// FEATURE GATE do módulo de contas de atendimento (servicePoints + tabs): decide se
		// o módulo existe para a organização (navegação e rota). NÃO confundir com a POLÍTICA
		// operacional `serviceSettings.contas.habilitadas`, que define como a organização opera
		// (preset balcão/mesas/comandas) e vive na tabela própria do módulo — a sidebar só
		// enxerga a configuração da organização, por isso o gate precisa estar aqui.
		// UI pode rotular com o jargão do segmento ("Mesas & Comandas"); a chave é neutra.
		contasAtendimento: z
			.object({
				habilitado: z.boolean({ invalid_type_error: "Tipo não válido para a habilitação de contas de atendimento." }),
			})
			.default({ habilitado: false }),
		impressoes: OrganizationPrintPreferencesSchema,
	}),
	defaults: OrganizationDefaultsSchema,
});
export type TOrganizationConfiguration = z.infer<typeof OrganizationConfigurationSchema>;

export const OrganizationSchema = z.object({
	nome: z.string({
		required_error: "Nome da organização não informado.",
		invalid_type_error: "Tipo não válido para o nome da organização.",
	}),
	cnpj: z.string({
		required_error: "CNPJ da organização não informado.",
		invalid_type_error: "Tipo não válido para o CNPJ da organização.",
	}),
	// Endereço público da loja (/shop/{slug}) — obrigatório e único.
	slug: z
		.string({
			required_error: "Endereço da loja da organização não informado.",
			invalid_type_error: "Tipo não válido para o endereço da loja da organização.",
		})
		.regex(ORGANIZATION_SLUG_REGEX, { message: ORGANIZATION_SLUG_INVALID_MESSAGE }),
	logoUrl: z.string({ invalid_type_error: "Tipo não válido para a url do logo da organização." }).optional().nullable(),
	telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone da organização." }).optional().nullable(),
	email: z.string({ invalid_type_error: "Tipo não válido para o email da organização." }).optional().nullable(),

	// Location
	localizacaoCep: z.string({ invalid_type_error: "Tipo não válido para o CEP da organização." }).optional().nullable(),
	localizacaoEstado: z.string({ invalid_type_error: "Tipo não válido para o estado da organização." }).optional().nullable(),
	localizacaoCidade: z.string({ invalid_type_error: "Tipo não válido para a cidade da organização." }).optional().nullable(),
	localizacaoBairro: z.string({ invalid_type_error: "Tipo não válido para o bairro da organização." }).optional().nullable(),
	localizacaoLogradouro: z.string({ invalid_type_error: "Tipo não válido para o logradouro da organização." }).optional().nullable(),
	localizacaoNumero: z.string({ invalid_type_error: "Tipo não válido para o número da organização." }).optional().nullable(),
	localizacaoComplemento: z.string({ invalid_type_error: "Tipo não válido para o complemento da organização." }).optional().nullable(),

	// Onboarding + Marketing + Commercial Data (for us)
	atuacaoNicho: z.string({ invalid_type_error: "Tipo não válido para o nicho de atuação da organização." }).optional().nullable(),
	atuacaoCanais: z.string({ invalid_type_error: "Tipo não válido para os canais de atuação da organização." }).optional().nullable(),
	tamanhoBaseClientes: z
		.number({
			invalid_type_error: "Tipo não válido para o tamanho da base de clientes da organização.",
		})
		.optional()
		.nullable(),
	plataformasUtilizadas: z
		.string({
			invalid_type_error: "Tipo não válido para as plataformas utilizadas da organização.",
		})
		.optional()
		.nullable(),
	origemLead: z.string({ invalid_type_error: "Tipo não válido para a origem dos leads da organização." }).optional().nullable(),

	assinaturaPlano: z.string({ invalid_type_error: "Tipo não válido para o plano de assinatura da organização." }).optional().nullable(),
	dadosViaERP: z
		.boolean({
			invalid_type_error: "Tipo não válido para se os dados da organização foram via ERP.",
		})
		.default(false),
	dadosViaPDI: z
		.boolean({
			invalid_type_error: "Tipo não válido para se os dados da organização foram via PDI.",
		})
		.default(false),
	dadosViaIntegracoes: z
		.boolean({
			invalid_type_error: "Tipo não válido para se os dados da organização foram via integrações.",
		})
		.default(false),
	origemDadosPadrao: DefaultDataSourceEnum.default("RECEPTOR").nullable(),
	// Integration
	integracaoTipo: OrganizationIntegrationTypeEnum.optional().nullable(),
	integracaoConfiguracao: OrganizationIntegrationConfigSchema.optional().nullable(),
	integracaoDataUltimaSincronizacao: z
		.string({
			invalid_type_error: "Tipo não válido para a data da última sincronização da integração.",
		})
		.datetime({ message: "Tipo não válido para a data da última sincronização da integração." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	fiscalProvedor: z.enum(["MANUAL", "SPEDY"]).optional().nullable(),
	fiscalEmissaoAutomatica: z
		.boolean({
			invalid_type_error: "Tipo não válido para a emissão automatica fiscal.",
		})
		.default(false),
	fiscalConfiguracao: OrganizationFiscalConfigSchema.optional().nullable(),

	// Others
	periodoTesteInicio: z
		.string({ invalid_type_error: "Tipo não válido para a data de início do período de teste." })
		.datetime({ message: "Tipo não válido para a data de início do período de teste." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodoTesteFim: z
		.string({ invalid_type_error: "Tipo não válido para a data de fim do período de teste." })
		.datetime({ message: "Tipo não válido para a data de fim do período de teste." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	// Consultoria / gestão assistida: a conta é operada pelo nosso time. Além do add-on comercial,
	// é o que autoriza uma conexão MCP de plataforma a executar mutações nesta organização
	// (ver `resolveResponsibleUser` em lib/agent-tools/organization-scope.ts).
	consultoriaAtiva: z.boolean({ invalid_type_error: "Tipo não válido para a consultoria ativa." }).optional().default(false),
	baselineInicio: z
		.string({ invalid_type_error: "Tipo não válido para a data de início do baseline." })
		.datetime({ message: "Tipo não válido para a data de início do baseline." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),

	// Custom Colors
	corPrimaria: z
		.string({ invalid_type_error: "Tipo não válido para a cor primária." })
		.regex(/^#[0-9A-Fa-f]{6}$/, {
			message: "A cor primária deve estar no formato hexadecimal (ex: #FFB900).",
		})
		.optional()
		.nullable(),
	corPrimariaForeground: z
		.string({ invalid_type_error: "Tipo não válido para a cor de foreground primária." })
		.regex(/^#[0-9A-Fa-f]{6}$/, {
			message: "A cor de foreground primária deve estar no formato hexadecimal (ex: #000000).",
		})
		.optional()
		.nullable(),
	corSecundaria: z
		.string({ invalid_type_error: "Tipo não válido para a cor secundária." })
		.regex(/^#[0-9A-Fa-f]{6}$/, {
			message: "A cor secundária deve estar no formato hexadecimal (ex: #15599a).",
		})
		.optional()
		.nullable(),
	corSecundariaForeground: z
		.string({ invalid_type_error: "Tipo não válido para a cor de foreground secundária." })
		.regex(/^#[0-9A-Fa-f]{6}$/, {
			message: "A cor de foreground secundária deve estar no formato hexadecimal (ex: #FFFFFF).",
		})
		.optional()
		.nullable(),
	poiQrCodeKioskDataUrl: z.string({ invalid_type_error: "Tipo não válido para o QR Code kiosk da organização." }).optional().nullable(),
	poiQrCodeMobileDataUrl: z.string({ invalid_type_error: "Tipo não válido para o QR Code mobile da organização." }).optional().nullable(),
	poiConfirmacaoValorObrigatoria: z
		.boolean({
			required_error: "Configuração de confirmação do valor no POI não informada.",
			invalid_type_error: "Tipo não válido para a confirmação do valor no POI.",
		})
		.default(false),
	poiConfiguracao: OrganizationPoiConfigSchema.optional().nullable(),

	// Onboarding conclusion marker. Null = onboarding still in progress.
	dataOnboardingConclusao: z
		.string({ invalid_type_error: "Tipo não válido para a data de conclusão do onboarding." })
		.datetime({ message: "Tipo não válido para a data de conclusão do onboarding." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),

	configuracao: OrganizationConfigurationSchema,
	autorId: z.string({ invalid_type_error: "Tipo não válido para o ID do autor da organização." }),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção da organização." })
		.datetime({ message: "Tipo não válido para a data de inserção da organização." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TOrganizationFiscalConfig = z.infer<typeof OrganizationFiscalConfigSchema>;

/**
 * Slug no cadastro de organização: opcional e tolerante a vazio/null — quando não chega um
 * endereço válido, o servidor gera um a partir do nome (getUniqueOrganizationSlug). O contrato
 * estrito (obrigatório) continua sendo o de `OrganizationSchema`.
 */
export const OrganizationSlugCreateInputSchema = z
	.union([OrganizationSchema.shape.slug, z.literal("")])
	.optional()
	.nullable();

export const OrganizationMemberPermissionsSchema = z.object({
	empresa: z.object({
		visualizar: z.boolean({
			required_error: "Permissão de visualização das configurações da empresa não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização das configurações da empresa.",
		}),
		editar: z.boolean({
			required_error: "Permissão de edição das configurações da empresa não informada.",
			invalid_type_error: "Tipo não válido para a permissão de edição das configurações da empresa.",
		}),
	}),
	resultados: z.object({
		escopo: z
			.array(
				z.string({
					required_error: "Escopo de resultados não informado.",
					invalid_type_error: "Tipo não válido para o escopo de resultados.",
				}),
			)
			.optional()
			.nullable(),
		visualizar: z.boolean({
			required_error: "Permissão de visualização de resultados não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de resultados.",
		}),
		visualizarSensiveis: z.boolean({
			required_error: "Permissão de visualização de dados sensíveis não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de dados sensíveis.",
		}),
		// Goals
		criarMetas: z.boolean({
			required_error: "Permissão de criação de metas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de criação de metas.",
		}),
		visualizarMetas: z.boolean({
			required_error: "Permissão de visualização de metas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de metas.",
		}),
		editarMetas: z.boolean({
			required_error: "Permissão de edição de metas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de edição de metas.",
		}),
		excluirMetas: z.boolean({
			required_error: "Permissão de exclusão de metas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de exclusão de metas.",
		}),
	}),
	usuarios: z.object({
		visualizar: z.boolean({
			required_error: "Permissão de visualização de usuários não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de usuários.",
		}),
		criar: z.boolean({
			required_error: "Permissão de criação de usuários não informada.",
			invalid_type_error: "Tipo não válido para a permissão de criação de usuários.",
		}),
		editar: z.boolean({
			required_error: "Permissão de edição de usuários não informada.",
			invalid_type_error: "Tipo não válido para a permissão de edição de usuários.",
		}),
		excluir: z.boolean({
			required_error: "Permissão de exclusão de usuários não informada.",
			invalid_type_error: "Tipo não válido para a permissão de exclusão de usuários.",
		}),
	}),
	vendas: z.object({
		visualizar: z.boolean({
			required_error: "Permissão de visualização de vendas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de vendas.",
		}),
		criar: z.boolean({
			required_error: "Permissão de criação de vendas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de criação de vendas.",
		}),
		editar: z.boolean({
			required_error: "Permissão de edição de vendas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de edição de vendas.",
		}),
		excluir: z.boolean({
			required_error: "Permissão de exclusão de vendas não informada.",
			invalid_type_error: "Tipo não válido para a permissão de exclusão de vendas.",
		}),
		// Controle de descontos no PDV. Opcional para não quebrar membros existentes: ausência/null =
		// comportamento legado (desconto liberado sem teto; aprovar cai para empresa.editar). A semântica
		// de ausência é resolvida em lib/permissions/discounts.ts — não leia esta chave diretamente.
		descontos: z
			.object({
				aplicar: z.boolean({
					required_error: "Permissão de aplicação de descontos não informada.",
					invalid_type_error: "Tipo não válido para a permissão de aplicação de descontos.",
				}),
				limiteTipo: DiscountLimitTypeEnum.nullable(),
				limiteValor: z
					.number({ invalid_type_error: "Tipo não válido para o valor do limite de descontos." })
					.nonnegative({ message: "O valor do limite de descontos não pode ser negativo." })
					.nullable(),
				aprovar: z.boolean({
					required_error: "Permissão de aprovação de descontos não informada.",
					invalid_type_error: "Tipo não válido para a permissão de aprovação de descontos.",
				}),
			})
			.optional()
			.nullable(),
	}),
	compras: z.object({
		visualizar: z.boolean({
			required_error: "Permissão de visualização de compras não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de compras.",
		}),
		criar: z.boolean({
			required_error: "Permissão de criação de compras não informada.",
			invalid_type_error: "Tipo não válido para a permissão de criação de compras.",
		}),
		editar: z.boolean({
			required_error: "Permissão de edição de compras não informada.",
			invalid_type_error: "Tipo não válido para a permissão de edição de compras.",
		}),
		excluir: z.boolean({
			required_error: "Permissão de exclusão de compras não informada.",
			invalid_type_error: "Tipo não válido para a permissão de exclusão de compras.",
		}),
	}),
	fiscal: z.object({
		visualizar: z.boolean({
			required_error: "Permissão de visualização de documentos fiscais não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de documentos fiscais.",
		}),
		configurar: z.boolean({
			required_error: "Permissão de configuração de documentos fiscais não informada.",
			invalid_type_error: "Tipo não válido para a permissão de configuração de documentos fiscais.",
		}),
		emitir: z.boolean({
			required_error: "Permissão de emissão de documentos fiscais não informada.",
			invalid_type_error: "Tipo não válido para a permissão de emissão de documentos fiscais.",
		}),
		cancelar: z.boolean({
			required_error: "Permissão de cancelamento de documentos fiscais não informada.",
			invalid_type_error: "Tipo não válido para a permissão de cancelamento de documentos fiscais.",
		}),
	}),
	// Módulo financeiro (lançamentos, transações, conciliação bancária). Opcional para não quebrar a
	// validação de membros já existentes cujo JSONB de permissões ainda não tem a chave; a ausência
	// cai para empresa.visualizar/editar — resolvida em lib/permissions/finances.ts, não leia direto.
	financeiro: z
		.object({
			visualizar: z.boolean({
				required_error: "Permissão de visualização do financeiro não informada.",
				invalid_type_error: "Tipo não válido para a permissão de visualização do financeiro.",
			}),
			criar: z.boolean({
				required_error: "Permissão de criação de lançamentos financeiros não informada.",
				invalid_type_error: "Tipo não válido para a permissão de criação de lançamentos financeiros.",
			}),
			editar: z.boolean({
				required_error: "Permissão de edição de lançamentos financeiros não informada.",
				invalid_type_error: "Tipo não válido para a permissão de edição de lançamentos financeiros.",
			}),
			conciliar: z.boolean({
				required_error: "Permissão de conciliação bancária não informada.",
				invalid_type_error: "Tipo não válido para a permissão de conciliação bancária.",
			}),
		})
		.optional()
		.nullable(),
	atendimentos: z.object({
		visualizar: z.boolean({
			required_error: "Permissão de visualização de atendimentos não informada.",
			invalid_type_error: "Tipo não válido para a permissão de visualização de atendimentos.",
		}),
		iniciar: z.boolean({
			required_error: "Permissão de início de atendimentos não informada.",
			invalid_type_error: "Tipo não válido para a permissão de início de atendimentos.",
		}),
		responder: z.boolean({
			required_error: "Permissão de resposta de atendimentos não informada.",
			invalid_type_error: "Tipo não válido para a permissão de resposta de atendimentos.",
		}),
		finalizar: z.boolean({
			required_error: "Permissão de finalização de atendimentos não informada.",
			invalid_type_error: "Tipo não válido para a permissão de finalização de atendimentos.",
		}),
		receberTransferencias: z
			.boolean({
				required_error: "Permissão de recebimento de transferências de atendimentos não informada.",
				invalid_type_error: "Tipo não válido para a permissão de recebimento de transferências de atendimentos.",
			})
			.optional()
			.nullable(),
	}),
	// Integrações de marketing/parceiros (Meta Ads, CAPI, audiences…). Opcional para não quebrar a
	// validação de membros já existentes cujo JSONB de permissões ainda não tem a chave; a ausência
	// é tratada como "sem permissão" na aplicação (com fallback para empresa.editar — ver rota).
	integracoes: z
		.object({
			visualizar: z.boolean({
				required_error: "Permissão de visualização de integrações não informada.",
				invalid_type_error: "Tipo não válido para a permissão de visualização de integrações.",
			}),
			gerenciar: z.boolean({
				required_error: "Permissão de gerenciamento de integrações não informada.",
				invalid_type_error: "Tipo não válido para a permissão de gerenciamento de integrações.",
			}),
		})
		.optional()
		.nullable(),
});
export type TOrganizationMemberPermissions = z.infer<typeof OrganizationMemberPermissionsSchema>;

export const OrganizationMemberSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da organização." }),
	usuarioId: z.string({ invalid_type_error: "Tipo não válido para o ID do usuário." }),
	usuarioVendedorId: z.string({ invalid_type_error: "Tipo não válido para o ID do vendedor do usuário." }).optional().nullable(),
	permissoes: OrganizationMemberPermissionsSchema,
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção da organização." })
		.datetime({ message: "Tipo não válido para a data de inserção da organização." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});

export const OrganizationMembershipInvitationSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da organização." }),
	nome: z.string({
		invalid_type_error: "Tipo não válido para o nome da convite de membro da organização.",
	}),
	email: z
		.string({
			invalid_type_error: "Tipo não válido para o email da convite de membro da organização.",
		})
		.email({
			message: "Email inválido para o convite.",
		})
		.transform(normalizeEmail),
	telefone: z
		.string({
			invalid_type_error: "Tipo não válido para o telefone da convite de membro da organização.",
		})
		.optional()
		.nullable(),
	vendedorAplicavel: z
		.boolean({
			invalid_type_error: "Tipo não válido para se o vendedor deve ser aplicado ao convite de membro da organização.",
		})
		.default(false),
	vendedorId: z
		.string({
			invalid_type_error: "Tipo não válido para o ID do vendedor do convite de membro da organização.",
		})
		.optional()
		.nullable(),
	permissoes: OrganizationMemberPermissionsSchema,
	autorId: z.string({
		invalid_type_error: "Tipo não válido para o ID do autor da convite de membro da organização.",
	}),
	dataEfetivacao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de efetivação da convite de membro da organização.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataExpiracao: z
		.string({
			invalid_type_error: "Tipo não válido para a data de expiração da convite de membro da organização.",
		})
		.datetime({
			message: "Tipo não válido para a data de expiração da convite de membro da organização.",
		})
		.transform((val) => new Date(val)),
});
export type TOrganizationMembershipInvitation = z.infer<typeof OrganizationMembershipInvitationSchema>;

export const OrganizationMembershipInvitationStateSchema = z.object({
	invitation: OrganizationMembershipInvitationSchema.omit({
		dataExpiracao: true,
		autorId: true,
		organizacaoId: true,
		dataEfetivacao: true,
	}),
});
export type TOrganizationMembershipInvitationState = z.infer<typeof OrganizationMembershipInvitationStateSchema>;
