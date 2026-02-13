import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { type ImmediateProcessingData, processSingleInteractionImmediately } from "@/lib/interactions";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { TSale } from "@/schemas/sales";
import { type DBTransaction, db } from "@/services/drizzle";
import {
	cashbackProgramBalances,
	cashbackProgramTransactions,
	cashbackPrograms,
	clients,
	interactions,
	organizations,
	products,
	saleItems,
	sales,
} from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";
import z from "zod";

type GetResponse = {
	data: TSale | TSale[];
};

/**
 * Helper function to check if a campaign can be scheduled for a client based on frequency rules
 * @param tx - Database transaction instance
 * @param clienteId - Client ID
 * @param campanhaId - Campaign ID
 * @param permitirRecorrencia - Whether the campaign allows recurrence
 * @param frequenciaIntervaloValor - Frequency interval value
 * @param frequenciaIntervaloMedida - Frequency interval unit (DIAS, HORAS, etc.)
 * @returns true if the campaign can be scheduled, false otherwise
 */
async function canScheduleCampaignForClient(
	tx: DBTransaction,
	clienteId: string,
	campanhaId: string,
	permitirRecorrencia: boolean,
	frequenciaIntervaloValor: number | null,
	frequenciaIntervaloMedida: string | null,
): Promise<boolean> {
	// Check if campaign allows recurrence
	if (!permitirRecorrencia) {
		const previousInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId)),
		});
		if (previousInteraction) {
			console.log(`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} does not allow recurrence. Skipping for client ${clienteId}.`);
			return false;
		}
	}

	// Check for time interval (Frequency Cap)
	if (permitirRecorrencia && frequenciaIntervaloValor && frequenciaIntervaloValor > 0 && frequenciaIntervaloMedida) {
		// Map the enum to dayjs units
		const dayjsUnit = DASTJS_TIME_DURATION_UNITS_MAP[frequenciaIntervaloMedida as TTimeDurationUnitsEnum] || "day";

		// Calculate the cutoff date based on the campaign's interval settings
		const cutoffDate = dayjs().subtract(frequenciaIntervaloValor, dayjsUnit).toDate();

		const recentInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq, gt }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId), gt(fields.dataInsercao, cutoffDate)),
		});

		if (recentInteraction) {
			console.log(
				`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} frequency limit reached for client ${clienteId}. Last interaction was at ${recentInteraction.dataInsercao}.`,
			);
			return false;
		}
	}

	return true;
}

const GetSalesInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable(),
	page: z
		.string({
			required_error: "Página não informada.",
			invalid_type_error: "Tipo inválido para página.",
		})
		.default("1")
		.transform((val) => (val ? Number(val) : 1)),
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	sellersIds: z
		.string({
			invalid_type_error: "Tipo inválido para ID do vendedor.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	partnersIds: z
		.string({
			invalid_type_error: "Tipo inválido para ID do parceiro.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : null)),
	saleNatures: z
		.string({
			invalid_type_error: "Tipo inválido para natureza de venda.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	clientId: z
		.string({
			invalid_type_error: "Tipo inválido para ID do cliente.",
		})
		.optional()
		.nullable(),
	productGroups: z
		.string({
			invalid_type_error: "Tipo inválido para grupos de produto.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	productIds: z
		.string({
			invalid_type_error: "Tipo inválido para IDs de produto.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? val.split(",") : [])),
	totalMin: z
		.string({
			invalid_type_error: "Tipo inválido para valor mínimo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
	totalMax: z
		.string({
			invalid_type_error: "Tipo inválido para valor máximo.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : null)),
});

export type TGetSalesInput = z.infer<typeof GetSalesInputSchema>;

async function getSales({ input, sessionUser }: { input: TGetSalesInput; sessionUser: TAuthUserSession }) {
	const PAGE_SIZE = 25;
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { id, page, search, periodAfter, periodBefore, sellersIds, partnersIds, saleNatures, clientId, productGroups, productIds, totalMin, totalMax } =
		input;

	if (id) {
		const sale = await db.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, id), eq(fields.organizacaoId, userOrgId)),
			with: {
				cliente: {
					columns: {
						id: true,
						nome: true,
						telefone: true,
						email: true,
						dataNascimento: true,
						analiseRFMTitulo: true,
						analiseRFMNotasFrequencia: true,
						analiseRFMNotasMonetario: true,
						analiseRFMNotasRecencia: true,
						localizacaoCep: true,
						localizacaoEstado: true,
						localizacaoCidade: true,
						localizacaoBairro: true,
						localizacaoLogradouro: true,
						localizacaoNumero: true,
						localizacaoComplemento: true,
					},
				},
				vendedor: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
				parceiro: {
					columns: {
						id: true,
						nome: true,
						avatarUrl: true,
					},
				},
				itens: {
					columns: {
						id: true,
						quantidade: true,
						valorCustoUnitario: true,
						valorCustoTotal: true,
						valorVendaUnitario: true,
						valorVendaTotalBruto: true,
						valorTotalDesconto: true,
						valorVendaTotalLiquido: true,
					},
					with: {
						produto: {
							columns: {
								id: true,
								descricao: true,
								codigo: true,
								imagemCapaUrl: true,
								grupo: true,
								unidade: true,
							},
						},
						produtoVariante: {
							columns: {
								id: true,
								nome: true,
								codigo: true,
								imagemCapaUrl: true,
							},
						},
						adicionais: {
							columns: {
								id: true,
								quantidade: true,
								valorUnitario: true,
								valorTotal: true,
							},
							with: {
								opcao: {
									columns: {
										id: true,
										nome: true,
									},
								},
							},
						},
					},
				},
				transacoesCashback: {
					columns: {
						tipo: true,
						valor: true,
						saldoValorAnterior: true,
						saldoValorPosterior: true,
						expiracaoData: true,
						dataInsercao: true,
					},
				},
				atribuicaoCampanhaConversao: {
					columns: {
						deltaFrequencia: true,
						deltaMonetarioAbsoluto: true,
						deltaMonetarioPercentual: true,
						diasDesdeUltimaCompra: true,
						tipoConversao: true,
						dataInteracao: true,
						tempoParaConversaoMinutos: true,
					},
				},
			},
		});
		if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
		return {
			data: {
				default: null,
				byId: sale,
				byClientId: null,
			},
			message: "Venda encontrada com sucesso.",
		};
	}
	const conditions = [eq(sales.organizacaoId, userOrgId)];

	if (search)
		conditions.push(
			inArray(
				sales.clienteId,
				db
					.select({ id: clients.id })
					.from(clients)
					.where(
						sql`to_tsvector('portuguese', ${clients.nome}) @@ plainto_tsquery('portuguese', ${search}) OR ${clients.nome} ILIKE '%' || ${search} || '%'`,
					),
			),
		);
	if (periodAfter) conditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) conditions.push(lte(sales.dataVenda, periodBefore));
	if (sellersIds && sellersIds.length > 0) conditions.push(inArray(sales.vendedorId, sellersIds));
	if (partnersIds && partnersIds.length > 0) conditions.push(inArray(sales.parceiroId, partnersIds));
	if (saleNatures && saleNatures.length > 0) conditions.push(inArray(sales.natureza, saleNatures));
	if (clientId) conditions.push(eq(sales.clienteId, clientId));
	if (totalMin !== null && totalMin !== undefined) conditions.push(gte(sales.valorTotal, totalMin));
	if (totalMax !== null && totalMax !== undefined) conditions.push(lte(sales.valorTotal, totalMax));
	if (productIds && productIds.length > 0) {
		conditions.push(
			inArray(
				sales.id,
				db
					.select({ id: saleItems.vendaId })
					.from(saleItems)
					.where(and(eq(saleItems.organizacaoId, userOrgId), inArray(saleItems.produtoId, productIds))),
			),
		);
	}
	if (productGroups && productGroups.length > 0) {
		conditions.push(
			inArray(
				sales.id,
				db
					.select({ id: saleItems.vendaId })
					.from(saleItems)
					.innerJoin(products, eq(products.id, saleItems.produtoId))
					.where(and(eq(saleItems.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), inArray(products.grupo, productGroups))),
			),
		);
	}

	const salesMatched = await db
		.select({ count: count() })
		.from(sales)
		.where(and(...conditions));
	const salesMatchedCount = salesMatched[0]?.count ?? 0;

	const totalPages = Math.ceil(salesMatchedCount / PAGE_SIZE);

	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	const salesResult = await db.query.sales.findMany({
		where: and(...conditions),
		with: {
			cliente: {
				columns: {
					id: true,
					nome: true,
					telefone: true,
					localizacaoCep: true,
					localizacaoEstado: true,
					localizacaoCidade: true,
					localizacaoBairro: true,
					localizacaoLogradouro: true,
					localizacaoNumero: true,
					localizacaoComplemento: true,
					primeiraCompraData: true,
				},
			},
			vendedor: {
				columns: {
					id: true,
					nome: true,
					avatarUrl: true,
				},
			},
			parceiro: {
				columns: {
					id: true,
					nome: true,
					avatarUrl: true,
				},
			},
			itens: {
				columns: {
					id: true,
					quantidade: true,
					valorVendaUnitario: true,
					valorTotalDesconto: true,
					valorVendaTotalLiquido: true,
				},
				with: {
					produto: {
						columns: {
							id: true,
							descricao: true,
						},
					},
				},
			},
			transacoesCashback: {
				columns: {
					id: true,
					valor: true,
					tipo: true,
					status: true,
					expiracaoData: true,
					dataInsercao: true,
					saldoValorAnterior: true,
					saldoValorPosterior: true,
				},
				with: {
					programa: {
						columns: {
							id: true,
							titulo: true,
						},
					},
				},
			},
			atribuicaoCampanhaConversao: {
				columns: {
					id: true,
					dataInteracao: true,
					dataConversao: true,
					tempoParaConversaoMinutos: true,
					atribuicaoReceita: true,
				},
				with: {
					campanha: {
						columns: {
							id: true,
							titulo: true,
							cashbackGeracaoTipo: true,
							cashbackGeracaoValor: true,
						},
					},
					interacao: {
						columns: {
							id: true,
							titulo: true,
							dataEnvio: true,
						},
					},
				},
			},
		},
		orderBy: (fields, { desc }) => desc(fields.dataVenda),
		offset: skip,
		limit: limit,
	});

	return {
		data: {
			default: clientId
				? null
				: {
						sales: salesResult,
						totalPages: totalPages,
						salesMatched: salesMatchedCount,
					},
			byId: null,
			byClientId: clientId
				? {
						sales: salesResult,
						totalPages: totalPages,
						salesMatched: salesMatchedCount,
					}
				: null,
		},
		message: "Vendas encontradas com sucesso.",
	};
}
export type TGetSalesOutput = Awaited<ReturnType<typeof getSales>>;
export type TGetSalesOutputDefault = Exclude<Awaited<TGetSalesOutput>["data"]["default"], null>;
export type TGetSalesOutputById = Exclude<Awaited<TGetSalesOutput>["data"]["byId"], null>;
export type TGetSalesOutputByClientId = Exclude<Awaited<TGetSalesOutput>["data"]["byClientId"], null>;
const getSalesRoute: NextApiHandler<TGetSalesOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetSalesInputSchema.parse(req.query);

	const result = await getSales({ input, sessionUser });

	return res.status(200).json(result);
};

// POST handler for creating sales from point-of-interaction
const CreateSaleInputSchema = z.object({
	orgId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para ID da organização.",
	}),
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
	saleValue: z
		.number({
			required_error: "Valor total não informado.",
			invalid_type_error: "Tipo não válido para valor total.",
		})
		.positive("Valor total deve ser positivo."),
	cashbackApplied: z.boolean().default(false),
	cashbackAppliedAmount: z.number().nonnegative().default(0),
	password: z
		.string({
			required_error: "Senha do operador não informada.",
			invalid_type_error: "Tipo não válido para senha do operador.",
		})
		.length(4, "Senha deve ter 4 dígitos."),
});
export type TCreateSaleInput = z.infer<typeof CreateSaleInputSchema>;
export type TCreateSaleOutput = {
	data: {
		saleId: string;
		cashbackAcumulado: number;
		newBalance: number;
	};
	message: string;
};

const createSaleRoute: NextApiHandler<TCreateSaleOutput> = async (req, res) => {
	const input = CreateSaleInputSchema.parse(req.body);

	const result = await db.transaction(async (tx) => {
		// 1. Validate operator password
		const org = await tx.query.organizations.findFirst({
			where: eq(organizations.id, input.orgId),
			columns: { cnpj: true },
		});

		if (!org) {
			throw new createHttpError.NotFound("Organização não encontrada.");
		}

		const cnpjFirst4Digits = org.cnpj.replace(/\D/g, "").substring(0, 4);
		if (input.password !== cnpjFirst4Digits) {
			throw new createHttpError.Unauthorized("Senha inválida.");
		}

		// 2. Get cashback program
		const program = await tx.query.cashbackPrograms.findFirst({
			where: eq(cashbackPrograms.organizacaoId, input.orgId),
		});

		if (!program) {
			throw new createHttpError.NotFound("Programa de cashback não encontrado.");
		}

		// 2.1. Query campaigns for cashback accumulation trigger
		const campaignsForCashbackAccumulation = await tx.query.campaigns.findMany({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, input.orgId), eq(fields.ativo, true), eq(fields.gatilhoTipo, "CASHBACK-ACUMULADO")),
			with: {
				segmentacoes: true,
				whatsappTemplate: true,
			},
		});

		// Query whatsappConnection for immediate processing
		const whatsappConnection = await tx.query.whatsappConnections.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, input.orgId),
		});

		// 3. If using cashback: validate balance and create redemption
		let currentBalance = 0;
		if (input.cashbackApplied && input.cashbackAppliedAmount > 0) {
			const balance = await tx.query.cashbackProgramBalances.findFirst({
				where: and(eq(cashbackProgramBalances.clienteId, input.clientId), eq(cashbackProgramBalances.organizacaoId, input.orgId)),
			});

			if (!balance) {
				throw new createHttpError.NotFound("Saldo de cashback não encontrado para este cliente.");
			}

			if (balance.saldoValorDisponivel < input.cashbackAppliedAmount) {
				throw new createHttpError.BadRequest("Saldo insuficiente.");
			}

			currentBalance = balance.saldoValorDisponivel;

			// Create redemption transaction (will be associated with sale after sale creation)
			const previousBalance = balance.saldoValorDisponivel;
			const newBalanceAfterRedemption = previousBalance - input.cashbackAppliedAmount;

			// Update balance (debit)
			await tx
				.update(cashbackProgramBalances)
				.set({
					saldoValorDisponivel: newBalanceAfterRedemption,
					saldoValorResgatadoTotal: balance.saldoValorResgatadoTotal + input.cashbackAppliedAmount,
					dataAtualizacao: new Date(),
				})
				.where(eq(cashbackProgramBalances.id, balance.id));

			currentBalance = newBalanceAfterRedemption;
		}

		// 4. Create sale record
		const valorFinalVenda = input.saleValue - input.cashbackAppliedAmount;
		const saleDate = new Date();
		const insertedSaleResponse = await tx
			.insert(sales)
			.values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				idExterno: `POI-${Date.now()}-${Math.random().toString(36).substring(7)}`,
				valorTotal: valorFinalVenda,
				custoTotal: 0,
				vendedorNome: "PONTO DE INTERAÇÃO",
				vendedorId: null,
				parceiro: "N/A",
				parceiroId: null,
				chave: "N/A",
				documento: "N/A",
				modelo: "DV",
				movimento: "RECEITAS",
				natureza: "SN01",
				serie: "0",
				situacao: "00",
				tipo: "Venda de produtos",
				dataVenda: saleDate,
			})
			.returning({ id: sales.id });

		const saleId = insertedSaleResponse[0]?.id;
		if (!saleId) {
			throw new createHttpError.InternalServerError("Erro ao criar venda.");
		}

		// 5. If cashback was used, create the redemption transaction linked to this sale
		if (input.cashbackApplied && input.cashbackAppliedAmount > 0) {
			await tx.insert(cashbackProgramTransactions).values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				vendaId: saleId,
				programaId: program.id,
				tipo: "RESGATE",
				status: "ATIVO",
				valor: input.cashbackAppliedAmount,
				valorRestante: 0,
				saldoValorAnterior: currentBalance + input.cashbackAppliedAmount,
				saldoValorPosterior: currentBalance,
				expiracaoData: null,
			});
		}

		// 6. Calculate and accumulate new cashback based on ORIGINAL sale value (before cashback discount)
		let accumulatedBalance = 0;
		const balance = await tx.query.cashbackProgramBalances.findFirst({
			where: and(eq(cashbackProgramBalances.clienteId, input.clientId), eq(cashbackProgramBalances.organizacaoId, input.orgId)),
		});

		if (!balance) {
			throw new createHttpError.NotFound("Saldo de cashback não encontrado.");
		}

		if (program.acumuloTipo === "FIXO") {
			if (input.saleValue >= program.acumuloRegraValorMinimo) {
				accumulatedBalance = program.acumuloValor;
			}
		} else if (program.acumuloTipo === "PERCENTUAL") {
			if (input.saleValue >= program.acumuloRegraValorMinimo) {
				accumulatedBalance = (input.saleValue * program.acumuloValor) / 100;
			}
		}

		const previousOverallAvailableBalance = balance.saldoValorDisponivel;
		const previousOverallAccumulatedBalance = balance.saldoValorAcumuladoTotal;
		const newOverallAvailableBalance = previousOverallAvailableBalance + accumulatedBalance;
		const newOverallAccumulatedBalance = previousOverallAccumulatedBalance + accumulatedBalance;

		// Collect data for immediate processing
		const immediateProcessingDataList: ImmediateProcessingData[] = [];

		if (accumulatedBalance > 0) {
			// Update balance (credit)
			await tx
				.update(cashbackProgramBalances)
				.set({
					saldoValorDisponivel: newOverallAvailableBalance,
					saldoValorAcumuladoTotal: newOverallAccumulatedBalance,
					dataAtualizacao: new Date(),
				})
				.where(eq(cashbackProgramBalances.id, balance.id));

			// Create accumulation transaction
			await tx.insert(cashbackProgramTransactions).values({
				organizacaoId: input.orgId,
				clienteId: input.clientId,
				vendaId: saleId,
				programaId: program.id,
				tipo: "ACÚMULO",
				status: "ATIVO",
				valor: accumulatedBalance,
				valorRestante: accumulatedBalance,
				saldoValorAnterior: previousOverallAvailableBalance,
				saldoValorPosterior: newOverallAvailableBalance,
				expiracaoData: dayjs().add(program.expiracaoRegraValidadeValor, "day").toDate(),
				dataInsercao: saleDate,
			});

			// 6.1. Check for applicable cashback accumulation campaigns
			if (campaignsForCashbackAccumulation.length > 0) {
				const applicableCampaigns = campaignsForCashbackAccumulation.filter((campaign) => {
					// Check if the new accumulated cashback meets the minimum threshold (if defined)
					const meetsNewCashbackThreshold =
						campaign.gatilhoNovoCashbackAcumuladoValorMinimo === null ||
						campaign.gatilhoNovoCashbackAcumuladoValorMinimo === undefined ||
						accumulatedBalance >= campaign.gatilhoNovoCashbackAcumuladoValorMinimo;

					// Check if the total accumulated cashback meets the minimum threshold (if defined)
					const meetsTotalCashbackThreshold =
						campaign.gatilhoTotalCashbackAcumuladoValorMinimo === null ||
						campaign.gatilhoTotalCashbackAcumuladoValorMinimo === undefined ||
						newOverallAvailableBalance >= campaign.gatilhoTotalCashbackAcumuladoValorMinimo;

					// Both conditions must be met (if defined)
					return meetsNewCashbackThreshold && meetsTotalCashbackThreshold;
				});

				if (applicableCampaigns.length > 0) {
					console.log(
						`[ORG: ${input.orgId}] ${applicableCampaigns.length} campanhas de cashback acumulado aplicáveis encontradas para o cliente ${input.clientId}.`,
					);
				}

				// Query client data for immediate processing
				const clientData = await tx.query.clients.findFirst({
					where: (fields, { eq }) => eq(fields.id, input.clientId),
					columns: {
						id: true,
						nome: true,
						telefone: true,
						email: true,
						analiseRFMTitulo: true,
						metadataProdutoMaisCompradoId: true,
						metadataGrupoProdutoMaisComprado: true,
					},
				});

				for (const campaign of applicableCampaigns) {
					// Validate campaign frequency before scheduling
					const canSchedule = await canScheduleCampaignForClient(
						tx,
						input.clientId,
						campaign.id,
						campaign.permitirRecorrencia,
						campaign.frequenciaIntervaloValor,
						campaign.frequenciaIntervaloMedida,
					);

					if (!canSchedule) {
						console.log(
							`[ORG: ${input.orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${input.clientId} due to frequency limits.`,
						);
						continue;
					}

					const interactionScheduleDate = getPostponedDateFromReferenceDate({
						date: dayjs().toDate(),
						unit: campaign.execucaoAgendadaMedida,
						value: campaign.execucaoAgendadaValor,
					});

					const [insertedInteraction] = await tx
						.insert(interactions)
						.values({
							clienteId: input.clientId,
							campanhaId: campaign.id,
							organizacaoId: input.orgId,
							titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
							tipo: "ENVIO-MENSAGEM",
							descricao: `Cliente acumulou R$ ${(accumulatedBalance / 100).toFixed(2)} em cashback. Total acumulado: R$ ${(newOverallAccumulatedBalance / 100).toFixed(2)}.`,
							agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
							agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
							metadados: {
								cashbackAcumuladoValor: accumulatedBalance,
								whatsappMensagemId: null,
								whatsappTemplateId: null,
							},
						})
						.returning({ id: interactions.id });

					// Check for immediate processing (execucaoAgendadaValor === 0)
					if (
						campaign.execucaoAgendadaValor === 0 &&
						campaign.whatsappTemplate &&
						whatsappConnection &&
						clientData &&
						campaign.whatsappConexaoTelefoneId
					) {
						immediateProcessingDataList.push({
							interactionId: insertedInteraction.id,
							organizationId: input.orgId,
							client: {
								id: clientData.id,
								nome: clientData.nome,
								telefone: clientData.telefone,
								email: clientData.email,
								analiseRFMTitulo: clientData.analiseRFMTitulo,
								metadataProdutoMaisCompradoId: clientData.metadataProdutoMaisCompradoId,
								metadataGrupoProdutoMaisComprado: clientData.metadataGrupoProdutoMaisComprado,
							},
							campaign: {
								autorId: campaign.autorId,
								whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
								whatsappTemplate: campaign.whatsappTemplate,
							},
							whatsappToken: whatsappConnection.token ?? undefined,
							whatsappSessionId: whatsappConnection.gatewaySessaoId ?? undefined,
						});
					}
				}
			}
		}

		// 7. Update client last purchase
		await tx
			.update(clients)
			.set({
				ultimaCompraData: saleDate,
				ultimaCompraId: saleId,
			})
			.where(eq(clients.id, input.clientId));

		return {
			saleId,
			cashbackAcumulado: accumulatedBalance,
			newBalance: newOverallAvailableBalance,
			immediateProcessingDataList,
		};
	});

	// Process interactions immediately after transaction (fire-and-forget)
	if (result.immediateProcessingDataList && result.immediateProcessingDataList.length > 0) {
		for (const processingData of result.immediateProcessingDataList) {
			processSingleInteractionImmediately(processingData).catch((err) =>
				console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${processingData.interactionId}:`, err),
			);
		}
	}

	return res.status(201).json({
		data: {
			saleId: result.saleId,
			cashbackAcumulado: result.cashbackAcumulado,
			newBalance: result.newBalance,
		},
		message: "Venda criada com sucesso.",
	});
};

export default apiHandler({ GET: getSalesRoute, POST: createSaleRoute });
