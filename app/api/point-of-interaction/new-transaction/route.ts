import { appApiHandler } from "@/lib/app-api";
import { generateCashbackForCampaign } from "@/lib/cashback/generate-campaign-cashback";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { formatPhoneAsBase } from "@/lib/formatting";
import { type ImmediateProcessingData, processSingleInteractionImmediately } from "@/lib/interactions";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, cashbackPrograms, clients, interactions, sales } from "@/services/drizzle/schema";
import { waitUntil } from "@vercel/functions";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Helper function to check if a campaign can be scheduled for a client based on frequency rules
 */
async function canScheduleCampaignForClient(
	tx: DBTransaction,
	clienteId: string,
	campanhaId: string,
	permitirRecorrencia: boolean,
	frequenciaIntervaloValor: number | null,
	frequenciaIntervaloMedida: string | null,
): Promise<boolean> {
	if (!permitirRecorrencia) {
		const previousInteraction = await tx.query.interactions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.clienteId, clienteId), eq(fields.campanhaId, campanhaId)),
		});
		if (previousInteraction) {
			console.log(`[CAMPAIGN_FREQUENCY] Campaign ${campanhaId} does not allow recurrence. Skipping for client ${clienteId}.`);
			return false;
		}
	}

	if (permitirRecorrencia && frequenciaIntervaloValor && frequenciaIntervaloValor > 0 && frequenciaIntervaloMedida) {
		const dayjsUnit = DASTJS_TIME_DURATION_UNITS_MAP[frequenciaIntervaloMedida as TTimeDurationUnitsEnum] || "day";
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

const CreatePointOfInteractionTransactionInputSchema = z.object({
	orgId: z
		.string({
			required_error: "ID da organização não informado.",
			invalid_type_error: "Tipo não válido para ID da organização.",
		})
		.describe("A organização a partir da qual a transação foi requisitada."),
	client: z
		.object({
			id: z
				.string({
					invalid_type_error: "Tipo não válido para ID do cliente.",
				})
				.optional()
				.nullable(),
			nome: z.string({
				required_error: "Nome do cliente não informado.",
				invalid_type_error: "Tipo não válido para nome do cliente.",
			}),
			cpfCnpj: z
				.string({
					invalid_type_error: "Tipo não válido para CPF/CNPJ.",
				})
				.optional()
				.nullable(),
			telefone: z.string({
				required_error: "Telefone não informado.",
				invalid_type_error: "Tipo não válido para telefone.",
			}),
		})
		.describe("O cliente que realizou a transação."),
	sale: z.object({
		valor: z
			.number({
				required_error: "Valor da transação não informado.",
				invalid_type_error: "Tipo não válido para valor da transação.",
			})
			.positive("Valor da transação deve ser positivo.")
			.describe("O valor da transação."),
		cashback: z
			.object({
				aplicar: z
					.boolean({
						required_error: "Se deve aplicar cashback não informado.",
						invalid_type_error: "Tipo não válido para se deve aplicar cashback.",
					})
					.default(false)
					.describe("Se deve aplicar cashback."),
				valor: z
					.number({
						required_error: "Valor do cashback não informado.",
						invalid_type_error: "Tipo não válido para valor do cashback.",
					})
					.nonnegative()
					.default(0)
					.describe("O valor do cashback."),
			})
			.describe("Os dados do cashback da transação."),
	}),
	operatorIdentifier: z
		.string({
			required_error: "Identificador do operador não informado.",
			invalid_type_error: "Tipo não válido para identificador do operador.",
		})
		.describe("O identificador do operador que aprovou a transação."),
});
export type TCreatePointOfInteractionTransactionInput = z.infer<typeof CreatePointOfInteractionTransactionInputSchema>;

export type TCreatePointOfInteractionTransactionOutput = {
	data: {
		saleId: string | null;
		clientAccumulatedCashbackValue: number;
		clientNewOverallAvailableBalance: number | null;
		visualClientAccumulatedCashbackValue: number;
		visualClientNewOverallAvailableBalance: number | null;
	};
	message: string;
};

function calculateAccumulatedCashbackValue({
	accumulationType,
	accumulationValue,
	minimumSaleValue,
	saleValue,
}: {
	accumulationType: string;
	accumulationValue: number;
	minimumSaleValue: number;
	saleValue: number;
}) {
	if (saleValue < minimumSaleValue) {
		return 0;
	}

	if (accumulationType === "FIXO") {
		return accumulationValue;
	}

	if (accumulationType === "PERCENTUAL") {
		return (saleValue * accumulationValue) / 100;
	}

	return 0;
}

async function handleNewTransaction(req: NextRequest): Promise<NextResponse<TCreatePointOfInteractionTransactionOutput>> {
	const body = await req.json();
	const input = CreatePointOfInteractionTransactionInputSchema.parse(body);
	console.log(`[POI ${input.orgId}] [NEW_TRANSACTION]`, input);
	const result = await db.transaction(async (tx) => {
		const program = await tx.query.cashbackPrograms.findFirst({
			where: eq(cashbackPrograms.organizacaoId, input.orgId),
			with: {
				organizacao: {
					columns: {
						id: true,
						integracaoTipo: true,
					},
				},
			},
		});

		if (!program) {
			throw new createHttpError.NotFound("Programa de cashback não encontrado.");
		}

		// Transactions only require accumulation processing when organization allows it
		const transactionRequiresAccumulationProcessing = program.acumuloPermitirViaPontoIntegracao;
		// Transactions only require sale processing when organization has no defined integration
		const transactionRequiresSaleProcessing = !program.organizacao.integracaoTipo;
		// Transactions only require redemption processing when cashback is applied and has a positive value
		const transactionRequiresRedemptionProcessing = input.sale.cashback.aplicar && input.sale.cashback.valor > 0;

		// PRE-STEPS:
		const organizationWhatsappConnection = await tx.query.whatsappConnections.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, input.orgId),
		});
		const {
			campaignsForNewPurchase,
			campaignsForFirstPurchase,
			campaignsForCashbackAccumulation,
			campaignsForTotalPurchaseCount,
			campaignsForTotalPurchaseValue,
		} = await getOrganizationCampaigns({
			tx,
			orgId: input.orgId,
		});
		console.log(`[POI ${input.orgId}] [CAMPAIGNS APPLICABLE]`, {
			"CAMPAIGNS FOR NEW PURCHASE": campaignsForNewPurchase.length,
			"CAMPAIGNS FOR FIRST PURCHASE": campaignsForFirstPurchase.length,
			"CAMPAIGNS FOR CASHBACK ACCUMULATION": campaignsForCashbackAccumulation.length,
			"CAMPAIGNS FOR TOTAL PURCHASE COUNT": campaignsForTotalPurchaseCount.length,
			"CAMPAIGNS FOR TOTAL PURCHASE VALUE": campaignsForTotalPurchaseValue.length,
		});
		// FIRST STEP: Identifying the transaction operator
		const operator = await tx.query.sellers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.senhaOperador, input.operatorIdentifier), eq(fields.organizacaoId, input.orgId)),
		});
		if (!operator) throw new createHttpError.Unauthorized("Operador não encontrado.");

		const operatorMembership = await tx.query.organizationMembers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.usuarioVendedorId, operator.id), eq(fields.organizacaoId, input.orgId)),
			with: {
				usuario: true,
			},
		});
		const operatorMembershipUser = operatorMembership?.usuario;
		if (!operatorMembershipUser) throw new createHttpError.Unauthorized("Operador não encontrado ou não pertence a esta organização.");

		const immediateProcessingDataList: ImmediateProcessingData[] = [];

		let transactionSaleId: string | null = null;
		let transactionAccumulationId: string | null = null;
		let transactionRedemptionId: string | null = null;

		// SECOND STEP: Identifying the transaction client
		let clientId = input.client.id;
		let clientFirstSaleId: string | null = null;
		let clientFirstSaleDate: Date | null = null;
		let clientIsNew = false;
		let clientRfmTitle: string | null = "CLIENTES RECENTES";
		let clientCurrentPurchaseCount = 0; // Client's current all-time purchase count (from metadata)
		let clientCurrentPurchaseValue = 0;
		let clientNewAccumulatedCashbackValue = 0;
		let clientCashbackAvailableBalance: number | null = null;
		let clientCashbackAccumulatedBalance: number | null = null;
		let clientCashbackRedeemedBalanceTotal: number | null = null;
		let visualClientAccumulatedCashbackValue = 0;
		let visualClientNewOverallAvailableBalance: number | null = null;
		if (!clientId) {
			// Client's current all-time purchase value (from metadata)

			// Create new client
			const clientPhoneAsBase = formatPhoneAsBase(input.client.telefone);

			const existingClientForPhone = await tx.query.clients.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.telefoneBase, clientPhoneAsBase), eq(fields.organizacaoId, input.orgId)),
			});

			if (existingClientForPhone) throw new createHttpError.BadRequest("Cliente já existe para este telefone.");

			const insertedClientResponse = await tx
				.insert(clients)
				.values({
					organizacaoId: input.orgId,
					nome: input.client.nome,
					telefone: input.client.telefone,
					telefoneBase: clientPhoneAsBase,
					canalAquisicao: "PONTO DE INTERAÇÃO",
				})
				.returning({ id: clients.id });

			const insertedClientId = insertedClientResponse[0]?.id;
			if (!insertedClientId) {
				throw new createHttpError.InternalServerError("Erro ao criar cliente.");
			}

			clientId = insertedClientId;
			clientIsNew = true;
			clientRfmTitle = "CLIENTES RECENTES";

			// Initialize cashback balance for new client
			await tx.insert(cashbackProgramBalances).values({
				clienteId: insertedClientId,
				programaId: program.id,
				organizacaoId: input.orgId,
				saldoValorDisponivel: 0,
				saldoValorAcumuladoTotal: 0,
				saldoValorResgatadoTotal: 0,
			});
			clientCashbackAvailableBalance = 0;
			clientCashbackAccumulatedBalance = 0;
			clientCashbackRedeemedBalanceTotal = 0;
		} else {
			const client = await tx.query.clients.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, clientId as string), eq(fields.organizacaoId, input.orgId)),
			});
			if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");

			const initialClientCashbackBalance = await tx.query.cashbackProgramBalances.findFirst({
				where: (fields, { and, eq }) =>
					and(eq(fields.clienteId, clientId as string), eq(fields.programaId, program.id), eq(fields.organizacaoId, input.orgId)),
			});
			if (initialClientCashbackBalance) {
				clientCashbackAvailableBalance = initialClientCashbackBalance.saldoValorDisponivel;
				clientCashbackAccumulatedBalance = initialClientCashbackBalance.saldoValorAcumuladoTotal;
				clientCashbackRedeemedBalanceTotal = initialClientCashbackBalance.saldoValorResgatadoTotal;
			} else {
				await tx.insert(cashbackProgramBalances).values({
					clienteId: clientId as string,
					programaId: program.id,
					organizacaoId: input.orgId,
					saldoValorDisponivel: 0,
					saldoValorAcumuladoTotal: 0,
					saldoValorResgatadoTotal: 0,
				});
				clientCashbackAvailableBalance = 0;
				clientCashbackAccumulatedBalance = 0;
				clientCashbackRedeemedBalanceTotal = 0;
			}
			clientFirstSaleId = client.primeiraCompraId;
			clientFirstSaleDate = client.primeiraCompraData;
			clientRfmTitle = client.analiseRFMTitulo ?? "CLIENTES RECENTES";
			// Store current metadata for trigger evaluation
			clientCurrentPurchaseCount = client.metadataTotalCompras ?? 0;
			clientCurrentPurchaseValue = client.metadataValorTotalCompras ?? 0;
		}

		// Visual-only tracking values for UX (no persistence writes).
		// They simulate redemption/accumulation computation even when accumulation is handled by external integration.
		visualClientNewOverallAvailableBalance = clientCashbackAvailableBalance ?? 0;
		if (transactionRequiresRedemptionProcessing) {
			visualClientNewOverallAvailableBalance -= input.sale.cashback.valor;
		}
		visualClientAccumulatedCashbackValue = calculateAccumulatedCashbackValue({
			accumulationType: program.acumuloTipo,
			accumulationValue: program.acumuloValor,
			minimumSaleValue: program.acumuloRegraValorMinimo,
			saleValue: input.sale.valor,
		});
		visualClientNewOverallAvailableBalance += visualClientAccumulatedCashbackValue;

		// THIRD STEP: Processing cashback redemption (if applicable)
		if (transactionRequiresRedemptionProcessing) {
			if (program.resgateLimiteTipo && program.resgateLimiteValor !== null) {
				let maxAllowedRedemption: number;

				if (program.resgateLimiteTipo === "FIXO") {
					maxAllowedRedemption = program.resgateLimiteValor;
				} else if (program.resgateLimiteTipo === "PERCENTUAL") {
					maxAllowedRedemption = (input.sale.valor * program.resgateLimiteValor) / 100;
				} else {
					maxAllowedRedemption = Number.MAX_SAFE_INTEGER;
				}
				if (input.sale.cashback.valor > maxAllowedRedemption) {
					throw new createHttpError.BadRequest(`Valor de resgate excede o limite permitido. Máximo: R$ ${maxAllowedRedemption.toFixed(2)}`);
				}
			}
			if (clientCashbackAvailableBalance < input.sale.cashback.valor) {
				throw new createHttpError.BadRequest("Saldo insuficiente.");
			}

			// Getting a snapshot of the current available balance
			const previousBalance = clientCashbackAvailableBalance;
			// Calculating the new available balance after the redemption
			const newBalanceAfterRedemption = previousBalance - input.sale.cashback.valor;

			// Updating balance for the redemption process
			await tx
				.update(cashbackProgramBalances)
				.set({
					saldoValorDisponivel: newBalanceAfterRedemption,
					saldoValorResgatadoTotal: clientCashbackRedeemedBalanceTotal + input.sale.cashback.valor,
					dataAtualizacao: new Date(),
				})
				.where(and(eq(cashbackProgramBalances.organizacaoId, input.orgId), eq(cashbackProgramBalances.clienteId, clientId)));
			clientCashbackAvailableBalance = newBalanceAfterRedemption;

			// Inserting a new transaction for RESGATE
			const insertedRedemptionTransactionResponse = await tx
				.insert(cashbackProgramTransactions)
				.values({
					organizacaoId: input.orgId,
					clienteId: clientId,
					vendaId: null, // No associated sale (yet ?)
					vendaValor: input.sale.valor,
					programaId: program.id,
					tipo: "RESGATE",
					status: "ATIVO",
					valor: input.sale.cashback.valor,
					valorRestante: 0, // RESGATE transactions are fully consumed
					saldoValorAnterior: previousBalance,
					saldoValorPosterior: newBalanceAfterRedemption,
					expiracaoData: null, // RESGATE transactions do not have expiration date
					operadorId: operatorMembershipUser.id,
				})
				.returning({ id: cashbackProgramTransactions.id });
			const insertedRedemptionTransactionId = insertedRedemptionTransactionResponse[0]?.id;
			if (!insertedRedemptionTransactionId) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar transação de resgate.");
			transactionRedemptionId = insertedRedemptionTransactionId;
		}
		// FOURTH STEP: Processing cashback accumulation (if applicable)
		if (transactionRequiresAccumulationProcessing) {
			// If the transaction value is greater than or equal to the minimum value rule, accumulate the value
			// according to the accumulation type

			// Getting a snapshot of the current accumulated balance and available balance
			const previousAccumulatedBalance = clientCashbackAccumulatedBalance;
			const previousAvailableBalance = clientCashbackAvailableBalance;
			clientNewAccumulatedCashbackValue = calculateAccumulatedCashbackValue({
				accumulationType: program.acumuloTipo,
				accumulationValue: program.acumuloValor,
				minimumSaleValue: program.acumuloRegraValorMinimo,
				saleValue: input.sale.valor,
			});
			clientCashbackAccumulatedBalance += clientNewAccumulatedCashbackValue;
			clientCashbackAvailableBalance += clientNewAccumulatedCashbackValue;

			// If the value to accumulate is greater than 0
			// It means the transaction generated accumulation, so, updating the balance and inserting a new transaction
			if (clientNewAccumulatedCashbackValue > 0) {
				// Updating the balances
				await tx
					.update(cashbackProgramBalances)
					.set({
						saldoValorDisponivel: clientCashbackAvailableBalance,
						saldoValorAcumuladoTotal: clientCashbackAccumulatedBalance,
						dataAtualizacao: new Date(),
					})
					.where(and(eq(cashbackProgramBalances.organizacaoId, input.orgId), eq(cashbackProgramBalances.clienteId, clientId)));
				// Inserting a new transaction for ACUMULO
				// TODO: track ID for further update (in case of sale processing, use the sale ID to update this)
				const insertedAccumulationTransactionResponse = await tx
					.insert(cashbackProgramTransactions)
					.values({
						organizacaoId: input.orgId,
						clienteId: clientId,
						vendaId: null, // No associated sale (yet ?)
						vendaValor: input.sale.valor,
						programaId: program.id,
						tipo: "ACÚMULO",
						status: "ATIVO",
						valor: clientNewAccumulatedCashbackValue,
						valorRestante: clientNewAccumulatedCashbackValue,
						saldoValorAnterior: previousAvailableBalance,
						saldoValorPosterior: clientCashbackAvailableBalance,
						expiracaoData: dayjs().add(program.expiracaoRegraValidadeValor, "day").toDate(),
						dataInsercao: new Date(),
						operadorId: operatorMembershipUser.id,
					})
					.returning({ id: cashbackProgramTransactions.id });
				const insertedAccumulationTransactionId = insertedAccumulationTransactionResponse[0]?.id;
				if (!insertedAccumulationTransactionId) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar transação de acumulo.");
				transactionAccumulationId = insertedAccumulationTransactionId;
			}

			// TODO: Handle campaign proccesing for CASHBACK-ACUMULADO
			await handleCampaignProcessingForCashbackAccumulation({
				tx,
				orgId: input.orgId,
				orgWhatsappConnectionToken: organizationWhatsappConnection?.token ?? null,
				orgWhatsappConnectionGatewaySessionId: organizationWhatsappConnection?.gatewaySessaoId ?? null,
				cashbackAccumulationCampaigns: campaignsForCashbackAccumulation,
				addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
				clientId: clientId,
				clientCashbackToAccumulate: clientNewAccumulatedCashbackValue,
				clientCashbackAvailableBalance: clientCashbackAvailableBalance,
			});
		}

		// FIFTH STEP: Processing sale processing (if applicable)
		if (transactionRequiresSaleProcessing) {
			const saleFinalValue = input.sale.valor - input.sale.cashback.valor;
			const insertedSaleResponse = await tx
				.insert(sales)
				.values({
					organizacaoId: input.orgId,
					clienteId: clientId,
					idExterno: `POI-${Date.now()}-${Math.random().toString(36).substring(7)}`,
					valorTotal: saleFinalValue,
					custoTotal: 0,
					vendedorNome: operator.nome,
					vendedorId: operator.id,
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
					dataVenda: new Date(),
				})
				.returning({ id: sales.id });
			const insertedSaleId = insertedSaleResponse[0]?.id;
			if (!insertedSaleResponse) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar venda.");
			transactionSaleId = insertedSaleId;
			// Updating clients metadata
			const isClientsFirstPurchase = !clientFirstSaleId && !clientFirstSaleDate;
			if (isClientsFirstPurchase) {
				clientFirstSaleId = insertedSaleId;
				clientFirstSaleDate = new Date();
			}
			clientCurrentPurchaseCount++;
			clientCurrentPurchaseValue += input.sale.valor;

			// Updating client's sale related metadata
			await tx
				.update(clients)
				.set({
					primeiraCompraId: clientFirstSaleId,
					primeiraCompraData: clientFirstSaleDate,
					ultimaCompraId: insertedSaleId,
					ultimaCompraData: new Date(),
					metadataTotalCompras: clientCurrentPurchaseCount,
					metadataValorTotalCompras: clientCurrentPurchaseValue,
				})
				.where(eq(clients.id, clientId));

			// Updating other transaction entities (accumulation and redemption)
			if (transactionAccumulationId) {
				await tx
					.update(cashbackProgramTransactions)
					.set({
						vendaId: transactionSaleId,
					})
					.where(eq(cashbackProgramTransactions.id, transactionAccumulationId));
			}
			if (transactionRedemptionId) {
				await tx
					.update(cashbackProgramTransactions)
					.set({
						vendaId: transactionSaleId,
					})
					.where(eq(cashbackProgramTransactions.id, transactionRedemptionId));
			}

			// TODO: Handle campaign proccesing for NOVA-COMPRA, PRIMEIRA-COMPRA, QUANTIDADE-TOTAL-COMPRAS, VALOR-TOTAL-COMPRAS
			// Processing PRIMEIRA-COMPRA campaign for new clients
			if (clientIsNew)
				await handleCampaignProcessingForFirstPurchase({
					tx,
					orgId: input.orgId,
					orgWhatsappConnectionToken: organizationWhatsappConnection?.token ?? null,
					orgWhatsappConnectionGatewaySessionId: organizationWhatsappConnection?.gatewaySessaoId ?? null,
					campaignsForFirstPurchase: campaignsForFirstPurchase,
					addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
					saleId: transactionSaleId,
					saleValue: input.sale.valor,
					clientId: clientId,
					clientRFMTitle: clientRfmTitle,
				});
			const wouldCauseDoubleInteraction = clientIsNew && campaignsForFirstPurchase.length > 0 && campaignsForNewPurchase.length > 0;
			// Processing NOVA-COMPRA campaign for existing clients or new clients (if no double interaction would occur)
			if (!wouldCauseDoubleInteraction)
				await handleCampaignProcessingForNewPurchase({
					tx,
					orgId: input.orgId,
					orgWhatsappConnectionToken: organizationWhatsappConnection?.token ?? null,
					orgWhatsappConnectionGatewaySessionId: organizationWhatsappConnection?.gatewaySessaoId ?? null,
					campaignsForNewPurchase: campaignsForNewPurchase,
					addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
					saleId: transactionSaleId,
					saleValue: input.sale.valor,
					clientId: clientId,
					clientRFMTitle: clientRfmTitle,
				});
			// Processing QUANTIDADE-TOTAL-COMPRAS campaigns
			await handleCampaignProcessingForTotalPurchaseCount({
				tx,
				orgId: input.orgId,
				orgWhatsappConnectionToken: organizationWhatsappConnection?.token ?? null,
				orgWhatsappConnectionGatewaySessionId: organizationWhatsappConnection?.gatewaySessaoId ?? null,
				campaignsForTotalPurchaseCount: campaignsForTotalPurchaseCount,
				addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
				saleId: transactionSaleId,
				saleValue: input.sale.valor,
				clientId: clientId,
				clientRFMTitle: clientRfmTitle,
				clientNewTotalPurchaseCount: clientCurrentPurchaseCount,
			});
			// Processing VALOR-TOTAL-COMPRAS campaigns
			await handleCampaignProcessingForTotalPurchaseValue({
				tx,
				orgId: input.orgId,
				orgWhatsappConnectionToken: organizationWhatsappConnection?.token ?? null,
				orgWhatsappConnectionGatewaySessionId: organizationWhatsappConnection?.gatewaySessaoId ?? null,
				campaignsForTotalPurchaseValue: campaignsForTotalPurchaseValue,
				addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
				saleId: transactionSaleId,
				saleValue: input.sale.valor,
				clientId: clientId,
				clientRFMTitle: clientRfmTitle,
				clientNewTotalPurchaseValue: clientCurrentPurchaseValue,
			});
		}

		return {
			transactionSaleId,
			clientAccumulatedCashbackValue: clientNewAccumulatedCashbackValue,
			clientNewOverallAvailableBalance: clientCashbackAvailableBalance,
			visualClientAccumulatedCashbackValue,
			visualClientNewOverallAvailableBalance,
			immediateProcessingDataList,
		};
	});

	if (result.immediateProcessingDataList && result.immediateProcessingDataList.length > 0) {
		// Create all processing promises
		const processingPromises = result.immediateProcessingDataList.map(async (processingData) => {
			console.log(`[POI] [IMMEDIATE_PROCESS] Processing interaction ${processingData.interactionId} for client ${processingData.client.id}`);
			console.log(
				`[POI] [IMMEDIATE_PROCESS] Client phone: ${processingData.client.telefone}, Template: ${processingData.campaign.whatsappTemplate?.nome || "unknown"}`,
			);

			try {
				await processSingleInteractionImmediately(processingData);
				console.log(`[POI] [IMMEDIATE_PROCESS] Successfully processed interaction ${processingData.interactionId}`);
			} catch (err) {
				console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${processingData.interactionId}:`, err);
			}
		});

		// Use waitUntil to keep the function alive until all processing is complete
		// This allows us to return the response immediately while ensuring the background work finishes
		waitUntil(Promise.all(processingPromises));
	} else {
		console.log("[POI] [IMMEDIATE_PROCESS] No interactions to process immediately");
	}

	return NextResponse.json(
		{
			data: {
				saleId: result.transactionSaleId,
				clientAccumulatedCashbackValue: result.clientAccumulatedCashbackValue,
				clientNewOverallAvailableBalance: result.clientNewOverallAvailableBalance,
				visualClientAccumulatedCashbackValue: result.visualClientAccumulatedCashbackValue,
				visualClientNewOverallAvailableBalance: result.visualClientNewOverallAvailableBalance,
			},
			message: "Transação processada com sucesso.",
		},
		{ status: 201 },
	);
}

export const POST = appApiHandler({
	POST: handleNewTransaction,
});

type TGetOrganizationCampaignsParams = {
	tx: DBTransaction;
	orgId: string;
};
async function getOrganizationCampaigns({ tx, orgId }: TGetOrganizationCampaignsParams) {
	const organizationCampaigns = await tx.query.campaigns.findMany({
		where: (fields, { and, or, eq }) =>
			and(
				eq(fields.organizacaoId, orgId),
				eq(fields.ativo, true),
				or(
					eq(fields.gatilhoTipo, "NOVA-COMPRA"),
					eq(fields.gatilhoTipo, "PRIMEIRA-COMPRA"),
					eq(fields.gatilhoTipo, "CASHBACK-ACUMULADO"),
					eq(fields.gatilhoTipo, "QUANTIDADE-TOTAL-COMPRAS"),
					eq(fields.gatilhoTipo, "VALOR-TOTAL-COMPRAS"),
				),
			),
		with: {
			segmentacoes: true,
			whatsappTemplate: true,
		},
	});

	const campaignsForNewPurchase = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "NOVA-COMPRA");
	const campaignsForFirstPurchase = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "PRIMEIRA-COMPRA");
	const campaignsForCashbackAccumulation = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "CASHBACK-ACUMULADO");
	const campaignsForTotalPurchaseCount = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "QUANTIDADE-TOTAL-COMPRAS");
	const campaignsForTotalPurchaseValue = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "VALOR-TOTAL-COMPRAS");

	return {
		campaignsForNewPurchase,
		campaignsForFirstPurchase,
		campaignsForCashbackAccumulation,
		campaignsForTotalPurchaseCount,
		campaignsForTotalPurchaseValue,
	};
}
type TGetOrganizationCampaignsOutput = Awaited<ReturnType<typeof getOrganizationCampaigns>>;

type THandleCampaignProcessingForNewPurchaseParams = {
	tx: DBTransaction;
	orgId: string;
	orgWhatsappConnectionToken: string | null;
	orgWhatsappConnectionGatewaySessionId: string | null;
	campaignsForNewPurchase: TGetOrganizationCampaignsOutput["campaignsForNewPurchase"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string;
	saleValue: number;
	clientId: string;
	clientRFMTitle: string;
};

async function handleCampaignProcessingForNewPurchase({
	tx,
	orgId,
	orgWhatsappConnectionToken,
	orgWhatsappConnectionGatewaySessionId,
	campaignsForNewPurchase,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientRFMTitle,
}: THandleCampaignProcessingForNewPurchaseParams) {
	if (campaignsForNewPurchase.length === 0) return;
	const applicableCampaigns = campaignsForNewPurchase.filter((campaign) => {
		// Validate campaign trigger for new purchase
		const meetsNewPurchaseValueTrigger =
			campaign.gatilhoNovaCompraValorMinimo === null ||
			campaign.gatilhoNovaCompraValorMinimo === undefined ||
			saleValue >= campaign.gatilhoNovaCompraValorMinimo;

		const meetsSegmentationTrigger = campaign.segmentacoes.some((s) => s.segmentacao === clientRFMTitle);

		return meetsNewPurchaseValueTrigger && meetsSegmentationTrigger;
	});

	console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] ${applicableCampaigns.length} applicable campaigns after filtering`);

	if (applicableCampaigns.length > 0) {
		console.log(`[ORG: ${orgId}] ${applicableCampaigns.length} campanhas de nova compra aplicáveis encontradas para o cliente ${clientId}.`);

		// Query client data for immediate processing
		const clientData = await tx.query.clients.findFirst({
			where: (fields, { eq }) => eq(fields.id, clientId),
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

		if (!clientData) {
			throw new createHttpError.NotFound("Cliente não encontrado.");
		}

		console.log(
			`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Client data for immediate processing: ${clientData ? `found (telefone: ${clientData.telefone})` : "NOT FOUND"}`,
		);

		for (const campaign of applicableCampaigns) {
			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Processing campaign "${campaign.titulo}"`);

			// Validate campaign frequency before scheduling
			const canSchedule = await canScheduleCampaignForClient(
				tx,
				clientId,
				campaign.id,
				campaign.permitirRecorrencia,
				campaign.frequenciaIntervaloValor,
				campaign.frequenciaIntervaloMedida,
			);

			if (!canSchedule) {
				console.log(`[ORG: ${orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${clientId} due to frequency limits.`);
				continue;
			}

			const interactionScheduleDate = getPostponedDateFromReferenceDate({
				date: dayjs().toDate(),
				unit: campaign.execucaoAgendadaMedida,
				value: campaign.execucaoAgendadaValor,
			});

			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Creating interaction with schedule date: ${dayjs(interactionScheduleDate).format("YYYY-MM-DD")}`);

			const [insertedInteraction] = await tx
				.insert(interactions)
				.values({
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: `Cliente se enquadrou no parâmetro de nova compra ${clientRFMTitle}.`,
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
				})
				.returning({ id: interactions.id });

			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Interaction created: ${insertedInteraction.id}`);

			// Check for immediate processing (execucaoAgendadaValor === 0 or null/undefined means immediate)
			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] SHOULD PROCESS IMMEDIATELY PARAMS:`, {
				SHOULD_PROCESS_IMMEDIATELY: shouldProcessImmediately,
				HAS_WHATSAPP_TEMPLATE: !!campaign.whatsappTemplate,
				HAS_WHATSAPP_CONNECTION: !!orgWhatsappConnectionToken || !!orgWhatsappConnectionGatewaySessionId,
				HAS_CLIENT_DATA: !!clientData,
			});
			if (shouldProcessImmediately && campaign.whatsappTemplate && clientData && campaign.whatsappConexaoTelefoneId) {
				// Checking if both whatsapp connection token and gateway session are not avaliable
				// If so, skipping the interaction
				if (!orgWhatsappConnectionToken && !orgWhatsappConnectionGatewaySessionId) continue;

				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: orgWhatsappConnectionToken ?? undefined,
					whatsappSessionId: orgWhatsappConnectionGatewaySessionId ?? undefined,
				});
			} else {
				console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] NOT adding to immediate processing - conditions not met`);
			}

			// Generate campaign cashback for NOVA-COMPRA trigger
			if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
				console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Generating campaign cashback`);
				await generateCashbackForCampaign({
					tx,
					organizationId: orgId,
					clientId: clientId,
					campaignId: campaign.id,
					cashbackType: campaign.cashbackGeracaoTipo,
					cashbackValue: campaign.cashbackGeracaoValor,
					saleId: saleId,
					saleValue: saleValue,
					expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
					expirationValue: campaign.cashbackGeracaoExpiracaoValor,
				});
			}
		}
	} else {
		console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] No applicable campaigns found after filtering`);
	}
}

type THandleCampaignProcessingForFirstPurchaseParams = {
	tx: DBTransaction;
	orgId: string;
	orgWhatsappConnectionToken: string | null;
	orgWhatsappConnectionGatewaySessionId: string | null;
	campaignsForFirstPurchase: TGetOrganizationCampaignsOutput["campaignsForFirstPurchase"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string;
	saleValue: number;
	clientId: string;
	clientRFMTitle: string;
};
async function handleCampaignProcessingForFirstPurchase({
	tx,
	orgId,
	orgWhatsappConnectionToken,
	orgWhatsappConnectionGatewaySessionId,
	campaignsForFirstPurchase,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientRFMTitle,
}: THandleCampaignProcessingForFirstPurchaseParams) {
	if (campaignsForFirstPurchase.length === 0) return;
	const applicableCampaigns = campaignsForFirstPurchase.filter((campaign) => campaign.segmentacoes.some((s) => s.segmentacao === clientRFMTitle));

	console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] ${applicableCampaigns.length} applicable campaigns after filtering`);

	if (applicableCampaigns.length > 0) {
		console.log(`[ORG: ${orgId}] ${applicableCampaigns.length} campanhas de primeira compra aplicáveis encontradas para o cliente ${clientId}.`);

		for (const campaign of applicableCampaigns) {
			console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] Processing campaign "${campaign.titulo}"`);

			// Validate campaign frequency before scheduling
			const canSchedule = await canScheduleCampaignForClient(
				tx,
				clientId,
				campaign.id,
				campaign.permitirRecorrencia,
				campaign.frequenciaIntervaloValor,
				campaign.frequenciaIntervaloMedida,
			);

			if (!canSchedule) {
				console.log(`[ORG: ${orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${clientId} due to frequency limits.`);
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
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: "Cliente realizou sua primeira compra.",
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
				})
				.returning({ id: interactions.id });

			console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] Interaction created: ${insertedInteraction.id}`);

			// Check for immediate processing (execucaoAgendadaValor === 0 or null/undefined means immediate)
			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;
			console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] SHOULD PROCESS IMMEDIATELY PARAMS:`, {
				SHOULD_PROCESS_IMMEDIATELY: shouldProcessImmediately,
				HAS_WHATSAPP_TEMPLATE: !!campaign.whatsappTemplate,
				HAS_WHATSAPP_CONNECTION: !!orgWhatsappConnectionToken || !!orgWhatsappConnectionGatewaySessionId,
			});
			if (shouldProcessImmediately && campaign.whatsappTemplate && campaign.whatsappConexaoTelefoneId) {
				// Checking if both whatsapp connection token and gateway session are not avaliable
				// If so, skipping the interaction
				if (!orgWhatsappConnectionToken && !orgWhatsappConnectionGatewaySessionId) continue;

				const clientData = await tx.query.clients.findFirst({
					where: (fields, { eq }) => eq(fields.id, clientId),
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

				if (!clientData) {
					throw new createHttpError.NotFound("Cliente não encontrado.");
				}
				console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] Adding to immediate processing list`);
				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: orgWhatsappConnectionToken ?? undefined,
					whatsappSessionId: orgWhatsappConnectionGatewaySessionId ?? undefined,
				});
			} else {
				console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] NOT adding to immediate processing - conditions not met`);
			}

			// Generate campaign cashback for PRIMEIRA-COMPRA trigger
			if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
				console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] Generating campaign cashback`);
				await generateCashbackForCampaign({
					tx,
					organizationId: orgId,
					clientId: clientId,
					campaignId: campaign.id,
					cashbackType: campaign.cashbackGeracaoTipo,
					cashbackValue: campaign.cashbackGeracaoValor,
					saleId: saleId,
					saleValue: saleValue,
					expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
					expirationValue: campaign.cashbackGeracaoExpiracaoValor,
				});
			}
		}
	}
}

type THandleCampaignProcessingForCashbackAccumulationParams = {
	tx: DBTransaction;
	orgId: string;
	orgWhatsappConnectionToken: string | null;
	orgWhatsappConnectionGatewaySessionId: string | null;
	cashbackAccumulationCampaigns: TGetOrganizationCampaignsOutput["campaignsForCashbackAccumulation"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	clientId: string;
	clientCashbackToAccumulate: number;
	clientCashbackAvailableBalance: number;
};
async function handleCampaignProcessingForCashbackAccumulation({
	tx,
	orgId,
	orgWhatsappConnectionToken,
	orgWhatsappConnectionGatewaySessionId,
	cashbackAccumulationCampaigns,
	addToImmediateProcessingDataList,
	clientId,
	clientCashbackToAccumulate,
	clientCashbackAvailableBalance,
}: THandleCampaignProcessingForCashbackAccumulationParams) {
	if (cashbackAccumulationCampaigns.length === 0) return;
	if (clientCashbackToAccumulate <= 0) return;

	const applicableCampaigns = cashbackAccumulationCampaigns.filter((campaign) => {
		const meetsNewCashbackThreshold =
			campaign.gatilhoNovoCashbackAcumuladoValorMinimo === null ||
			campaign.gatilhoNovoCashbackAcumuladoValorMinimo === undefined ||
			clientCashbackToAccumulate >= campaign.gatilhoNovoCashbackAcumuladoValorMinimo;

		const meetsTotalCashbackThreshold =
			campaign.gatilhoTotalCashbackAcumuladoValorMinimo === null ||
			campaign.gatilhoTotalCashbackAcumuladoValorMinimo === undefined ||
			clientCashbackAvailableBalance >= campaign.gatilhoTotalCashbackAcumuladoValorMinimo;

		return meetsNewCashbackThreshold && meetsTotalCashbackThreshold;
	});

	if (applicableCampaigns.length > 0) {
		console.log(`[ORG: ${orgId}] ${applicableCampaigns.length} campanhas de cashback acumulado aplicáveis encontradas para o cliente.`);
	}

	// Query client data for immediate processing
	const clientData = await tx.query.clients.findFirst({
		where: (fields, { eq }) => eq(fields.id, clientId),
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
		const canSchedule = await canScheduleCampaignForClient(
			tx,
			clientId,
			campaign.id,
			campaign.permitirRecorrencia,
			campaign.frequenciaIntervaloValor,
			campaign.frequenciaIntervaloMedida,
		);

		if (!canSchedule) {
			console.log(`[ORG: ${orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${clientId} due to frequency limits.`);
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
				clienteId: clientId,
				campanhaId: campaign.id,
				organizacaoId: orgId,
				titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
				tipo: "ENVIO-MENSAGEM",
				descricao: `Cliente acumulou R$ ${(clientCashbackToAccumulate).toFixed(2)} em cashback. Total acumulado: R$ ${(clientCashbackAvailableBalance).toFixed(2)}.`,
				agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
				agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
				metadados: {
					cashbackAcumuladoValor: clientCashbackToAccumulate,
					whatsappMensagemId: null,
					whatsappTemplateId: null,
				},
			})
			.returning({ id: interactions.id });

		// Check for immediate processing (execucaoAgendadaValor === 0 or null/undefined means immediate)
		const shouldProcessImmediately =
			campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

		console.log(`[POI] [ORG: ${orgId}] [CASHBACK-ACUMULADO] SHOULD PROCESS IMMEDIATELY PARAMS:`, {
			SHOULD_PROCESS_IMMEDIATELY: shouldProcessImmediately,
			HAS_WHATSAPP_TEMPLATE: !!campaign.whatsappTemplate,
			HAS_WHATSAPP_CONNECTION: !!orgWhatsappConnectionToken || !!orgWhatsappConnectionGatewaySessionId,
			HAS_CLIENT_DATA: !!clientData,
		});
		if (shouldProcessImmediately && campaign.whatsappTemplate && clientData && campaign.whatsappConexaoTelefoneId) {
			console.log(`[POI] [ORG: ${orgId}] [CASHBACK-ACUMULADO] Adding to immediate processing list`);
			// Checking if both whatsapp connection token and gateway session are not avaliable
			// If so, skipping the interaction
			if (!orgWhatsappConnectionToken && !orgWhatsappConnectionGatewaySessionId) continue;

			addToImmediateProcessingDataList({
				interactionId: insertedInteraction.id,
				organizationId: orgId,
				client: clientData,
				campaign: {
					autorId: campaign.autorId,
					whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
					whatsappTemplate: campaign.whatsappTemplate,
				},
				whatsappToken: orgWhatsappConnectionToken ?? undefined,
				whatsappSessionId: orgWhatsappConnectionGatewaySessionId ?? undefined,
			});
		}
	}
}

type THandleCampaignProcessingForTotalPurchaseCountParams = {
	tx: DBTransaction;
	orgId: string;
	orgWhatsappConnectionToken: string | null;
	orgWhatsappConnectionGatewaySessionId: string | null;
	campaignsForTotalPurchaseCount: TGetOrganizationCampaignsOutput["campaignsForTotalPurchaseCount"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string;
	saleValue: number;
	clientId: string;
	clientRFMTitle: string;
	clientNewTotalPurchaseCount: number;
};
async function handleCampaignProcessingForTotalPurchaseCount({
	tx,
	orgId,
	orgWhatsappConnectionToken,
	orgWhatsappConnectionGatewaySessionId,
	campaignsForTotalPurchaseCount,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientRFMTitle,
	clientNewTotalPurchaseCount,
}: THandleCampaignProcessingForTotalPurchaseCountParams) {
	if (campaignsForTotalPurchaseCount.length === 0) return;
	const applicableCampaigns = campaignsForTotalPurchaseCount.filter((campaign) => {
		// Check if the client has reached or exceeded the threshold
		const meetsThreshold =
			campaign.gatilhoQuantidadeTotalCompras !== null &&
			campaign.gatilhoQuantidadeTotalCompras !== undefined &&
			clientNewTotalPurchaseCount >= campaign.gatilhoQuantidadeTotalCompras;

		// Check segmentation match
		const meetsSegmentation = campaign.segmentacoes.length === 0 || campaign.segmentacoes.some((s) => s.segmentacao === clientRFMTitle);

		return meetsThreshold && meetsSegmentation;
	});

	if (applicableCampaigns.length > 0) {
		console.log(`[ORG: ${orgId}] [QUANTIDADE-TOTAL-COMPRAS] ${applicableCampaigns.length} applicable campaigns found for client ${clientId}.`);

		const clientData = await tx.query.clients.findFirst({
			where: (fields, { eq }) => eq(fields.id, clientId),
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
			const canSchedule = await canScheduleCampaignForClient(
				tx,
				clientId,
				campaign.id,
				campaign.permitirRecorrencia,
				campaign.frequenciaIntervaloValor,
				campaign.frequenciaIntervaloMedida,
			);

			if (!canSchedule) {
				console.log(`[ORG: ${orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${clientId} due to frequency limits.`);
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
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: `Cliente atingiu ${clientNewTotalPurchaseCount} compras totais (gatilho: ${campaign.gatilhoQuantidadeTotalCompras}).`,
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
				})
				.returning({ id: interactions.id });

			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

			if (shouldProcessImmediately && campaign.whatsappTemplate && clientData && campaign.whatsappConexaoTelefoneId) {
				// Checking if both whatsapp connection token and gateway session are not avaliable
				// If so, skipping the interaction
				if (!orgWhatsappConnectionToken && !orgWhatsappConnectionGatewaySessionId) continue;

				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: orgWhatsappConnectionToken ?? undefined,
					whatsappSessionId: orgWhatsappConnectionGatewaySessionId ?? undefined,
				});
			}

			// Generate campaign cashback if configured
			if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
				await generateCashbackForCampaign({
					tx,
					organizationId: orgId,
					clientId: clientId,
					campaignId: campaign.id,
					cashbackType: campaign.cashbackGeracaoTipo,
					cashbackValue: campaign.cashbackGeracaoValor,
					saleId: saleId,
					saleValue: saleValue,
					expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
					expirationValue: campaign.cashbackGeracaoExpiracaoValor,
				});
			}
		}
	}
}

type THandleCampaignProcessingForTotalPurchaseValueParams = {
	tx: DBTransaction;
	orgId: string;
	orgWhatsappConnectionToken: string | null;
	orgWhatsappConnectionGatewaySessionId: string | null;
	campaignsForTotalPurchaseValue: TGetOrganizationCampaignsOutput["campaignsForTotalPurchaseValue"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string;
	saleValue: number;
	clientId: string;
	clientRFMTitle: string;
	clientNewTotalPurchaseValue: number;
};

async function handleCampaignProcessingForTotalPurchaseValue({
	tx,
	orgId,
	orgWhatsappConnectionToken,
	orgWhatsappConnectionGatewaySessionId,
	campaignsForTotalPurchaseValue,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientRFMTitle,
	clientNewTotalPurchaseValue,
}: THandleCampaignProcessingForTotalPurchaseValueParams) {
	if (campaignsForTotalPurchaseValue.length === 0) return;

	const applicableCampaigns = campaignsForTotalPurchaseValue.filter((campaign) => {
		// Check if the client has reached or exceeded the threshold
		const meetsThreshold =
			campaign.gatilhoValorTotalCompras !== null &&
			campaign.gatilhoValorTotalCompras !== undefined &&
			clientNewTotalPurchaseValue >= campaign.gatilhoValorTotalCompras;

		// Check segmentation match
		const meetsSegmentation = campaign.segmentacoes.length === 0 || campaign.segmentacoes.some((s) => s.segmentacao === clientRFMTitle);

		return meetsThreshold && meetsSegmentation;
	});

	if (applicableCampaigns.length > 0) {
		console.log(`[ORG: ${orgId}] [VALOR-TOTAL-COMPRAS] ${applicableCampaigns.length} applicable campaigns found for client ${clientId}.`);

		const clientData = await tx.query.clients.findFirst({
			where: (fields, { eq }) => eq(fields.id, clientId),
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
			const canSchedule = await canScheduleCampaignForClient(
				tx,
				clientId,
				campaign.id,
				campaign.permitirRecorrencia,
				campaign.frequenciaIntervaloValor,
				campaign.frequenciaIntervaloMedida,
			);

			if (!canSchedule) {
				console.log(`[ORG: ${orgId}] [CAMPAIGN_FREQUENCY] Skipping campaign ${campaign.titulo} for client ${clientId} due to frequency limits.`);
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
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: `Cliente atingiu R$ ${clientNewTotalPurchaseValue.toFixed(2)} em compras totais (gatilho: R$ ${campaign.gatilhoValorTotalCompras?.toFixed(2)}).`,
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
				})
				.returning({ id: interactions.id });

			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

			if (shouldProcessImmediately && campaign.whatsappTemplate && clientData && campaign.whatsappConexaoTelefoneId) {
				// Checking if both whatsapp connection token and gateway session are not avaliable
				// If so, skipping the interaction
				if (!orgWhatsappConnectionToken && !orgWhatsappConnectionGatewaySessionId) continue;

				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: orgWhatsappConnectionToken ?? undefined,
					whatsappSessionId: orgWhatsappConnectionGatewaySessionId ?? undefined,
				});
			}

			// Generate campaign cashback if configured
			if (campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo && campaign.cashbackGeracaoValor) {
				await generateCashbackForCampaign({
					tx,
					organizationId: orgId,
					clientId: clientId,
					campaignId: campaign.id,
					cashbackType: campaign.cashbackGeracaoTipo,
					cashbackValue: campaign.cashbackGeracaoValor,
					saleId: saleId,
					saleValue: saleValue,
					expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
					expirationValue: campaign.cashbackGeracaoExpiracaoValor,
				});
			}
		}
	}
}
