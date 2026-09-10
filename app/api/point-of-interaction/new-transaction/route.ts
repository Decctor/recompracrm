import { getCashbackRedemptionBlockReason } from "@/lib/cashback/redemption-policy";
import { appApiHandler } from "@/lib/app-api";
import { recomputeClientDuplicatesSafely } from "@/lib/clients/duplicates";
import { accumulateCashbackForClient, calculateAccumulatedCashbackValue, ensureCashbackBalanceForClient } from "@/lib/cashback/accumulation";
import { type TValidatedPrizeForRedemption, validatePrizeForRedemption } from "@/lib/cashback/prizes";
import { applyCashbackRedemptionFIFO } from "@/lib/cashback/redemption";
import { campaignAudienceHasClient, resolveCampaignAudiencesByCampaignId } from "@/lib/campaigns/filters";
import { applyCampaignBonusToInteractionMetadata, buildBasePurchaseInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { resolveExclusivePurchaseTriggerCampaigns } from "@/lib/campaigns/purchase-trigger-priority";
import { processConversionAttribution } from "@/lib/conversions/attribution";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { formatCashbackValue, formatPhoneAsBase } from "@/lib/formatting";
import { isValidCpfCnpj } from "@/lib/validation";
import { type ImmediateProcessingData, processOrganizationInteractionsBatch, processSingleInteractionImmediately } from "@/lib/interactions";
import { createCampaignWeeklyLimitCache } from "@/lib/interactions/campaign-weekly-limits";
import { evaluateCouponAgainstSaleValue } from "@/lib/coupons/engine";
import { processCouponRedemption } from "@/lib/coupons/redemption";
import { resolvePoiActorContext } from "@/lib/access/poi-actor";
import { organizationHasActiveDataSource } from "@/lib/integrations/data-sources";
import { linkPartnerToClient } from "@/lib/partners/link-partner-to-client";
import { runPoiTransactionWithIdempotency } from "@/lib/point-of-interaction/idempotency";
import {
	getPoiSaleValueForConfirmation,
	poiSaleRequiresValueConfirmation,
	saleValuesMatch,
} from "@/lib/point-of-interaction/sale-value-confirmation";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import type { TCashbackProgramTerminologyEnum, TTimeDurationUnitsEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import {
	cashbackProgramTransactions,
	cashbackPrograms,
	clients,
	couponRedemptions,
	interactions,
	partners,
	saleItems,
	sales,
} from "@/services/drizzle/schema";
import { waitUntil } from "@vercel/functions";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { attendanceStatusValues } from "@/lib/sales/sale-processing/attendance";

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

export const CreatePointOfInteractionTransactionInputSchema = z.object({
	// Opcional para dispositivos autenticados (a organização deriva do principal); obrigatório no modo legado.
	orgId: z
		.string({ invalid_type_error: "Tipo não válido para ID da organização." })
		.optional()
		.nullable()
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
			.gte(0, "Valor da transação deve ser positivo.")
			.lte(1_000_000, "Valor da transação acima do limite permitido.")
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
		partnerCode: z
			.string({
				invalid_type_error: "Tipo não válido para código de parceiro.",
			})
			.optional()
			.nullable(),
		prizeRedemption: z
			.object({
				prizeId: z.string(),
				prizeValue: z.number(),
				prizeSaleValue: z.number(),
			})
			.optional()
			.nullable(),
		coupon: z
			.object({
				cupomId: z.string({
					required_error: "ID do cupom não informado.",
					invalid_type_error: "Tipo não válido para ID do cupom.",
				}),
				// Valor do desconto informado/confirmado pelo operador (obrigatório em cupons de validação MANUAL;
				// ignorado em cupons AUTOMATICA, cujo desconto é recomputado no servidor).
				valorDesconto: z
					.number({ invalid_type_error: "Tipo não válido para o valor de desconto do cupom." })
					.positive("O valor de desconto do cupom deve ser maior que zero.")
					.optional()
					.nullable(),
			})
			.optional()
			.nullable()
			.describe("Cupom a ser resgatado na transação."),
	}),
	operatorIdentifier: z
		.string({
			required_error: "Identificador do operador não informado.",
			invalid_type_error: "Tipo não válido para identificador do operador.",
		})
		.describe("O identificador do operador que aprovou a transação."),
	operatorConfirmedSaleValue: z
		.number({ invalid_type_error: "Tipo não válido para o valor confirmado pelo operador." })
		.nonnegative("O valor confirmado pelo operador não pode ser negativo.")
		.optional()
		.nullable(),
});
export type TCreatePointOfInteractionTransactionInput = z.infer<typeof CreatePointOfInteractionTransactionInputSchema>;

// O fluxo de solicitação (cliente final anônimo) não tem principal para derivar a organização:
// aqui o orgId volta a ser obrigatório, e o payload persistido sempre o carrega.
export const CreatePointOfInteractionTransactionRequestInputSchema = CreatePointOfInteractionTransactionInputSchema.omit({
	operatorIdentifier: true,
	operatorConfirmedSaleValue: true,
}).extend({
	orgId: z
		.string({
			required_error: "ID da organização não informado.",
			invalid_type_error: "Tipo não válido para ID da organização.",
		})
		.describe("A organização a partir da qual a transação foi requisitada."),
});
export type TCreatePointOfInteractionTransactionRequestInput = z.infer<typeof CreatePointOfInteractionTransactionRequestInputSchema>;

export type TCreatePointOfInteractionTransactionOutput = {
	data: {
		saleId: string | null;
		transactionAccumulationId?: string | null;
		transactionRedemptionId?: string | null;
		transactionCouponRedemptionId?: string | null;
		clientAccumulatedCashbackValue: number;
		clientNewOverallAvailableBalance: number | null;
		visualClientAccumulatedCashbackValue: number;
		visualClientNewOverallAvailableBalance: number | null;
	};
	message: string;
};

// Internamente o orgId chega sempre resolvido (pelo principal autenticado ou pelo payload legado).
type TProcessPointOfInteractionTransactionInput =
	| (Omit<TCreatePointOfInteractionTransactionInput, "orgId"> & { orgId: string })
	| TCreatePointOfInteractionTransactionRequestInput;

type TPreparePointOfInteractionTransactionParams = {
	input: TProcessPointOfInteractionTransactionInput;
	tx: DBTransaction;
	operatorContext?: {
		operatorIdentifier?: string;
		operatorConfirmedSaleValue?: number | null;
		// Desconto do cupom MANUAL informado pelo operador na aprovação da solicitação.
		operatorCouponDiscountValue?: number | null;
		operatorSellerId?: string | null;
		operatorUserId?: string | null;
	};
};

async function preparePointOfInteractionTransaction({ input, operatorContext, tx }: TPreparePointOfInteractionTransactionParams) {
	console.log(`[POI ${input.orgId}] [NEW_TRANSACTION]`, input);
	const result = await (async () => {
		const program = await tx.query.cashbackPrograms.findFirst({
			where: eq(cashbackPrograms.organizacaoId, input.orgId),
			with: {
				organizacao: {
					columns: {
						id: true,
						poiConfiguracao: true,
						poiConfirmacaoValorObrigatoria: true,
					},
				},
			},
		});

		if (!program) {
			throw new createHttpError.NotFound("Programa de cashback não encontrado.");
		}

		if (poiSaleRequiresValueConfirmation(program.organizacao.poiConfirmacaoValorObrigatoria, input.sale)) {
			const operatorConfirmedSaleValue =
				operatorContext?.operatorConfirmedSaleValue ?? ("operatorConfirmedSaleValue" in input ? input.operatorConfirmedSaleValue : null);
			if (operatorConfirmedSaleValue == null) {
				throw new createHttpError.BadRequest("Confirmação do valor final da venda não informada.");
			}
			if (!saleValuesMatch(operatorConfirmedSaleValue, getPoiSaleValueForConfirmation(input.sale))) {
				throw new createHttpError.BadRequest("O valor confirmado não corresponde ao valor da venda.");
			}
		}

		const cashbackProgramIsActive = program.ativo;
		const prizeRedemption = input.sale.prizeRedemption;
		const isPrizeRedemption = !!prizeRedemption;
		// Prize redemptions do not generate cashback, even when accumulation via POI is enabled.
		const transactionRequiresAccumulationProcessing = cashbackProgramIsActive && program.acumuloPermitirViaPontoIntegracao && !isPrizeRedemption;
		// Registro de vendas do POI é config EXPLÍCITA (D8), não derivação do estado das
		// integrações — org com fonte de dados ativa pode manter o POI coletando balcão.
		// Fallback para org criada entre o deploy e o backfill (poiConfiguracao nula): comportamento
		// legado — registra quando não há fonte de dados ativa. Removível na fase de limpeza.
		const transactionRequiresSaleProcessing =
			program.organizacao.poiConfiguracao?.vendas.registroAtivo ??
			!(await organizationHasActiveDataSource({ executor: tx, organizationId: input.orgId }));
		// Transactions only require redemption processing when cashback is applied and has a positive value
		const requestedCashbackRedemption = input.sale.cashback.aplicar && input.sale.cashback.valor > 0;
		if (!cashbackProgramIsActive && requestedCashbackRedemption) {
			throw new createHttpError.BadRequest("Programa de cashback inativo. Resgates não estão disponíveis.");
		}
		// Resgate pelo POI é config explícita do programa (superfície PONTO_INTERACAO da política
		// em lib/cashback/redemption-policy). Quando desligada, qualquer resgate PEDIDO no payload —
		// desconto em cashback ou recompensa — falha alto: pular em silêncio cobraria o preço cheio
		// de um cliente que espera o desconto.
		const redemptionSurfaceBlockReason = getCashbackRedemptionBlockReason({ program, surface: "PONTO_INTERACAO" });
		if (redemptionSurfaceBlockReason && (requestedCashbackRedemption || isPrizeRedemption)) {
			throw new createHttpError.Forbidden(redemptionSurfaceBlockReason);
		}
		const transactionRequiresRedemptionProcessing = cashbackProgramIsActive && program.resgatePermitirViaPontoIntegracao && requestedCashbackRedemption;
		console.log("[POI] [TRANSACTION_FLAGS]", {
			transactionRequiresAccumulationProcessing,
			transactionRequiresSaleProcessing,
			transactionRequiresRedemptionProcessing,
			poiRegistroVendasConfigurado: program.organizacao.poiConfiguracao?.vendas.registroAtivo ?? null,
		});
		// FIRST STEP: Identifying the transaction operator
		const operatorIdentifier = operatorContext?.operatorIdentifier ?? ("operatorIdentifier" in input ? input.operatorIdentifier : undefined);
		const operatorSellerId = operatorContext?.operatorSellerId;
		const operator = await tx.query.sellers.findFirst({
			where: (fields, { and, eq }) => {
				if (operatorSellerId) {
					return and(eq(fields.id, operatorSellerId), eq(fields.organizacaoId, input.orgId));
				}

				if (operatorIdentifier) {
					return and(eq(fields.senhaOperador, operatorIdentifier), eq(fields.organizacaoId, input.orgId));
				}

				throw new createHttpError.Unauthorized("Operador não informado.");
			},
		});
		if (!operator) throw new createHttpError.Unauthorized("Operador não encontrado.");

		const operatorMembership = await tx.query.organizationMembers.findFirst({
			where: (fields, { and, eq }) => {
				const conditions = [eq(fields.usuarioVendedorId, operator.id), eq(fields.organizacaoId, input.orgId)];
				if (operatorContext?.operatorUserId) {
					conditions.push(eq(fields.usuarioId, operatorContext.operatorUserId));
				}
				return and(...conditions);
			},
			with: {
				usuario: true,
			},
		});
		const operatorMembershipUser = operatorMembership?.usuario;

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
			console.log("[INFO] No client ID provided. Creating new client.");
			// Client's current all-time purchase value (from metadata)

			// Create new client
			const clientPhoneAsBase = formatPhoneAsBase(input.client.telefone);

			const existingClientForPhone = await tx.query.clients.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.telefoneBase, clientPhoneAsBase), eq(fields.organizacaoId, input.orgId)),
			});

			if (existingClientForPhone) throw new createHttpError.BadRequest("Cliente já existe para este telefone.");

			if (input.client.cpfCnpj && !isValidCpfCnpj(input.client.cpfCnpj)) throw new createHttpError.BadRequest("CPF/CNPJ inválido.");

			const insertedClientResponse = await tx
				.insert(clients)
				.values({
					organizacaoId: input.orgId,
					autorId: operatorMembershipUser?.id ?? null,
					autorVendedorId: operator.id,
					nome: input.client.nome,
					cpfCnpj: input.client.cpfCnpj ?? null,
					telefone: input.client.telefone,
					telefoneBase: clientPhoneAsBase,
					canalAquisicao: "PONTO DE INTERAÇÃO",
					analiseRFMTitulo: "CLIENTES RECENTES",
				})
				.returning({ id: clients.id });

			const insertedClientId = insertedClientResponse[0]?.id;
			if (!insertedClientId) {
				throw new createHttpError.InternalServerError("Erro ao criar cliente.");
			}

			clientId = insertedClientId;
			clientIsNew = true;
			clientRfmTitle = "CLIENTES RECENTES";

			const ensuredBalance = await ensureCashbackBalanceForClient({
				tx,
				orgId: input.orgId,
				clientId: insertedClientId,
				programId: program.id,
			});
			clientCashbackAvailableBalance = ensuredBalance.saldoValorDisponivel;
			clientCashbackAccumulatedBalance = ensuredBalance.saldoValorAcumuladoTotal;
			clientCashbackRedeemedBalanceTotal = ensuredBalance.saldoValorResgatadoTotal;
		} else {
			console.log("[INFO] Client ID provided. Finding existing client.");
			const client = await tx.query.clients.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, clientId as string), eq(fields.organizacaoId, input.orgId)),
			});
			if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");

			const ensuredBalance = await ensureCashbackBalanceForClient({
				tx,
				orgId: input.orgId,
				clientId: clientId as string,
				programId: program.id,
			});
			clientCashbackAvailableBalance = ensuredBalance.saldoValorDisponivel;
			clientCashbackAccumulatedBalance = ensuredBalance.saldoValorAcumuladoTotal;
			clientCashbackRedeemedBalanceTotal = ensuredBalance.saldoValorResgatadoTotal;
			clientFirstSaleId = client.primeiraCompraId;
			clientFirstSaleDate = client.primeiraCompraData;
			clientRfmTitle = client.analiseRFMTitulo ?? "CLIENTES RECENTES";
			// Store current metadata for trigger evaluation
			clientCurrentPurchaseCount = client.metadataTotalCompras ?? 0;
			clientCurrentPurchaseValue = client.metadataValorTotalCompras ?? 0;

			if (clientCurrentPurchaseCount === 0) {
				clientIsNew = true;
				clientRfmTitle = "CLIENTES RECENTES";
			}
		}

		console.log("[INFO] Client metadata:", {
			clientId,
			clientFirstSaleId,
			clientFirstSaleDate,
			clientIsNew,
			clientRfmTitle,
			clientCurrentPurchaseCount,
			clientCurrentPurchaseValue,
		});
		const {
			campaignsForNewPurchase,
			campaignsForFirstPurchase,
			campaignsForCashbackAccumulation,
			campaignsForTotalPurchaseCount,
			campaignsForTotalPurchaseValue,
			audiencesByCampaignId,
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
		let salePartnerId: string | null = null;
		let salePartnerClientId: string | null = null;
		const normalizedPartnerCode = input.sale.partnerCode?.trim().toUpperCase() || null;
		if (normalizedPartnerCode) {
			const matchedPartner = await tx.query.partners.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.organizacaoId, input.orgId), eq(fields.codigoAfiliacao, normalizedPartnerCode)),
			});

			if (!matchedPartner) {
				throw new createHttpError.BadRequest("Código de parceiro não encontrado.");
			}

			salePartnerId = matchedPartner.id;
			salePartnerClientId = matchedPartner.clienteId;

			if (!salePartnerClientId) {
				const linkage = await linkPartnerToClient({
					tx,
					orgId: input.orgId,
					partner: {
						nome: matchedPartner.nome,
						cpfCnpj: matchedPartner.cpfCnpj,
						telefone: matchedPartner.telefone,
						telefoneBase: matchedPartner.telefoneBase,
					},
					createClientIfNotFound: true,
					authorship: { autorId: operatorMembershipUser?.id ?? null, autorVendedorId: operator.id },
				});

				salePartnerClientId = linkage.clientId;

				if (salePartnerClientId) {
					await tx
						.update(partners)
						.set({ clienteId: salePartnerClientId })
						.where(and(eq(partners.organizacaoId, input.orgId), eq(partners.id, matchedPartner.id)));
				}
			}
		}

		// PRIZE VALIDATION (if prize redemption is requested)
		let validatedPrize: TValidatedPrizeForRedemption | null = null;
		if (isPrizeRedemption && prizeRedemption) {
			validatedPrize = await validatePrizeForRedemption({
				tx,
				organizacaoId: input.orgId,
				programaId: program.id,
				recompensaId: prizeRedemption.prizeId,
			});
		}

		const effectiveSaleValue = validatedPrize?.valorVenda ?? input.sale.valor;
		const effectiveRedemptionValue = validatedPrize?.valor ?? (input.sale.cashback.aplicar ? input.sale.cashback.valor : 0);

		// COUPON VALIDATION + REDEMPTION (if requested)
		// Fase 1: 1 cupom por transação, não combinável com resgate de recompensa.
		const requestedCoupon = input.sale.coupon;
		let couponDiscountValue = 0;
		let transactionCouponRedemptionId: string | null = null;
		if (requestedCoupon) {
			if (isPrizeRedemption) throw new createHttpError.BadRequest("Cupons não podem ser combinados com resgate de recompensa.");

			const coupon = await tx.query.coupons.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, requestedCoupon.cupomId), eq(fields.organizacaoId, input.orgId)),
				with: { alvos: true },
			});
			if (!coupon) throw new createHttpError.NotFound("Cupom não encontrado.");

			if (coupon.validacaoModo === "AUTOMATICA") {
				const evaluation = evaluateCouponAgainstSaleValue({ coupon, targets: coupon.alvos, saleValue: effectiveSaleValue });
				if (!evaluation.elegivel) throw new createHttpError.BadRequest(`Cupom não elegível: ${evaluation.motivo}`);
				couponDiscountValue = evaluation.valorDesconto;
			} else {
				// MANUAL: o operador valida as condições (condicoesTexto) e informa o valor do desconto
				// (na confirmação do totem, ou na aprovação da solicitação via operatorContext).
				couponDiscountValue = operatorContext?.operatorCouponDiscountValue ?? requestedCoupon.valorDesconto ?? 0;
				if (couponDiscountValue <= 0) throw new createHttpError.BadRequest("Informe o valor do desconto do cupom de validação manual.");
				if (couponDiscountValue > effectiveSaleValue) {
					throw new createHttpError.BadRequest("O desconto do cupom não pode superar o valor da venda.");
				}
			}

			const couponRedemptionOutcome = await processCouponRedemption({
				trx: tx,
				organizacaoId: input.orgId,
				cupomId: coupon.id,
				clienteId: clientId as string,
				surface: "PONTO_INTERACAO",
				valorDesconto: couponDiscountValue,
				vendaId: null, // vinculado após a criação da venda, quando aplicável
				vendaValor: effectiveSaleValue,
				operadorId: operatorMembershipUser?.id ?? null,
				operadorVendedorId: operator.id,
			});
			transactionCouponRedemptionId = couponRedemptionOutcome.redemptionId;
		}

		const effectiveSaleFinalValue = Math.max(0, effectiveSaleValue - effectiveRedemptionValue - couponDiscountValue);

		// Visual-only tracking values for UX (no persistence writes).
		// They simulate redemption/accumulation computation even when accumulation is handled by external integration.
		visualClientNewOverallAvailableBalance = clientCashbackAvailableBalance ?? 0;
		if (transactionRequiresRedemptionProcessing) {
			visualClientNewOverallAvailableBalance -= effectiveRedemptionValue;
		}
		visualClientAccumulatedCashbackValue = cashbackProgramIsActive
			? calculateAccumulatedCashbackValue({
					accumulationType: program.acumuloTipo,
					accumulationValue: program.acumuloValor,
					minimumSaleValue: program.acumuloRegraValorMinimo,
					saleValue: effectiveSaleValue,
				})
			: 0;
		visualClientNewOverallAvailableBalance += visualClientAccumulatedCashbackValue;

		// THIRD STEP: Processing cashback redemption (if applicable)
		if (transactionRequiresRedemptionProcessing) {
			// Skip redemption limit checks for prize redemptions (limits only apply to cash discounts)
			if (!isPrizeRedemption) {
				if (program.resgateLimiteTipo && program.resgateLimiteValor !== null) {
					let maxAllowedRedemption: number;

					if (program.resgateLimiteTipo === "FIXO") {
						maxAllowedRedemption = program.resgateLimiteValor;
					} else if (program.resgateLimiteTipo === "PERCENTUAL") {
						maxAllowedRedemption = (effectiveSaleValue * program.resgateLimiteValor) / 100;
					} else {
						maxAllowedRedemption = Number.MAX_SAFE_INTEGER;
					}
					if (effectiveRedemptionValue > maxAllowedRedemption) {
						throw new createHttpError.BadRequest(
							`Valor de resgate excede o limite permitido. Máximo: ${formatCashbackValue(maxAllowedRedemption, program.terminologia)}`,
						);
					}
				}
			}
			if (clientCashbackAvailableBalance < effectiveRedemptionValue) {
				throw new createHttpError.BadRequest("Saldo insuficiente.");
			}

			const redemptionResult = await applyCashbackRedemptionFIFO({
				tx,
				orgId: input.orgId,
				clientId: clientId as string,
				programId: program.id,
				redemptionValue: effectiveRedemptionValue,
			});

			const previousBalance = redemptionResult.previousBalance;
			const newBalanceAfterRedemption = redemptionResult.newBalance;
			clientCashbackAvailableBalance = newBalanceAfterRedemption;
			clientCashbackRedeemedBalanceTotal = redemptionResult.newResgatadoTotal;

			// Inserting a new transaction for RESGATE
			const insertedRedemptionTransactionResponse = await tx
				.insert(cashbackProgramTransactions)
				.values({
					organizacaoId: input.orgId,
					clienteId: clientId,
					vendaId: null, // No associated sale (yet ?)
					vendaValor: effectiveSaleValue,
					programaId: program.id,
					tipo: "RESGATE",
					status: "ATIVO",
					valor: -effectiveRedemptionValue,
					valorRestante: 0, // RESGATE transactions are fully consumed
					saldoValorAnterior: previousBalance,
					saldoValorPosterior: newBalanceAfterRedemption,
					expiracaoData: null, // RESGATE transactions do not have expiration date
					operadorId: operatorMembershipUser?.id,
					operadorVendedorId: operator.id,
					// Prize redemption fields
					resgateRecompensaId: validatedPrize?.id ?? null,
					resgateRecompensaValor: validatedPrize?.valor ?? null,
					metadados: {
						consumoFifo: redemptionResult.consumedFromAccumulations,
					},
				})
				.returning({ id: cashbackProgramTransactions.id });
			const insertedRedemptionTransactionId = insertedRedemptionTransactionResponse[0]?.id;
			if (!insertedRedemptionTransactionId) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar transação de resgate.");
			transactionRedemptionId = insertedRedemptionTransactionId;
		}
		// FOURTH STEP: Processing cashback accumulation (if applicable)
		if (transactionRequiresAccumulationProcessing) {
			const clientAccumulationResult = await accumulateCashbackForClient({
				tx,
				orgId: input.orgId,
				clientId: clientId as string,
				saleId: null, // associated after sale insertion if applicable
				saleValue: effectiveSaleValue,
				operatorId: operatorMembershipUser?.id,
				operatorSellerId: operator.id,
				program,
				metadata: {
					ator: "CLIENTE",
					origem: "POI",
					parceiroId: salePartnerId,
					codigoParceiro: normalizedPartnerCode,
				},
			});
			clientNewAccumulatedCashbackValue = clientAccumulationResult.accumulatedValue;
			clientCashbackAvailableBalance = clientAccumulationResult.newAvailableBalance;
			clientCashbackAccumulatedBalance = clientAccumulationResult.newAccumulatedBalance;
			transactionAccumulationId = clientAccumulationResult.transactionId;

			if (salePartnerClientId) {
				await accumulateCashbackForClient({
					tx,
					orgId: input.orgId,
					clientId: salePartnerClientId,
					saleId: null, // associated after sale insertion if applicable
					saleValue: effectiveSaleValue,
					operatorId: operatorMembershipUser?.id,
					operatorSellerId: operator.id,
					program,
					accumulationValueOverride: program.acumuloValorParceiro,
					metadata: {
						ator: "PARCEIRO",
						origem: "POI",
						parceiroId: salePartnerId,
						codigoParceiro: normalizedPartnerCode,
						clienteCompradorId: clientId,
					},
				});
			}

			// TODO: Handle campaign proccesing for CASHBACK-ACUMULADO
			await handleCampaignProcessingForCashbackAccumulation({
				tx,
				orgId: input.orgId,
				cashbackAccumulationCampaigns: campaignsForCashbackAccumulation,
				audiencesByCampaignId,
				addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
				clientId: clientId,
				clientCashbackToAccumulate: clientNewAccumulatedCashbackValue,
				clientCashbackAvailableBalance: clientCashbackAvailableBalance,
				saleValue: effectiveSaleValue,
				sellerName: operator.nome,
				clientCashbackAccumulatedBalance: clientCashbackAccumulatedBalance ?? 0,
				clientCashbackRedeemedBalanceTotal: clientCashbackRedeemedBalanceTotal ?? 0,
				organizationCashbackTerminology: program.terminologia,
			});
		}

		// FIFTH STEP: Processing sale processing (if applicable)
		if (transactionRequiresSaleProcessing) {
			const saleDate = new Date();
			const insertedSaleResponse = await tx
				.insert(sales)
				.values({
					organizacaoId: input.orgId,
					clienteId: clientId,
					idExterno: `POI-${Date.now()}-${Math.random().toString(36).substring(7)}`,
					valorTotal: effectiveSaleFinalValue,
					descontosTotal: (transactionRequiresRedemptionProcessing ? Math.min(effectiveSaleValue, effectiveRedemptionValue) : 0) + couponDiscountValue,
					custoTotal: validatedPrize?.precoCusto ?? 0,
					vendedorNome: operator.nome,
					vendedorId: operator.id,
					parceiro: normalizedPartnerCode ?? "N/A",
					parceiroId: salePartnerId,
					chave: "N/A",
					documento: "N/A",
					modelo: "DV",
					movimento: "RECEITAS",
					natureza: "SN01",
					serie: "0",
					situacao: "00",
					tipo: "Venda de produtos",
					processamentoOrigem: "INTERNO",
					// Venda de balcão já concluída: sem CONFIRMADA ela fica invisível para
					// getValidSaleConditions e o cron enrich-clients zera os contadores do cliente.
					statusVenda: "CONFIRMADA",
					...attendanceStatusValues("ENTREGUE", { at: saleDate }),
					dataVenda: saleDate,
				})
				.returning({ id: sales.id });
			const insertedSaleId = insertedSaleResponse[0]?.id;
			if (!insertedSaleId) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar venda.");
			transactionSaleId = insertedSaleId;

			if (transactionSaleId && effectiveSaleFinalValue > 0) {
				await processConversionAttribution(tx, {
					vendaId: transactionSaleId,
					clienteId: clientId,
					organizacaoId: input.orgId,
					valorVenda: effectiveSaleFinalValue,
					dataVenda: saleDate,
				});
			}

			// Updating clients metadata
			const isClientsFirstPurchase = !clientFirstSaleId && !clientFirstSaleDate;
			if (isClientsFirstPurchase) {
				clientFirstSaleId = insertedSaleId;
				clientFirstSaleDate = new Date();
			}
			clientCurrentPurchaseCount++;
			clientCurrentPurchaseValue += effectiveSaleValue;

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
			if (transactionCouponRedemptionId) {
				await tx
					.update(couponRedemptions)
					.set({
						vendaId: transactionSaleId,
					})
					.where(eq(couponRedemptions.id, transactionCouponRedemptionId));
			}

			// Insert saleItem if this is a prize redemption (produtoId sempre resolvido pelo validador,
			// inclusive para prêmios vinculados apenas a variante).
			if (isPrizeRedemption && validatedPrize && transactionSaleId) {
				const saleItemDiscountValue = Math.min(validatedPrize.valorVenda, validatedPrize.valor);
				await tx.insert(saleItems).values({
					organizacaoId: input.orgId,
					vendaId: transactionSaleId,
					clienteId: clientId,
					produtoId: validatedPrize.produtoId,
					produtoVarianteId: validatedPrize.produtoVarianteId ?? null,
					quantidade: 1,
					valorVendaUnitario: validatedPrize.valorVenda,
					valorCustoUnitario: validatedPrize.precoCusto,
					valorVendaTotalBruto: validatedPrize.valorVenda,
					valorTotalDesconto: saleItemDiscountValue,
					valorVendaTotalLiquido: Math.max(0, validatedPrize.valorVenda - saleItemDiscountValue),
					valorCustoTotal: validatedPrize.precoCusto,
					metadados: {
						origem: "POI-RESGATE-RECOMPENSA",
						valorResgate: validatedPrize.valor,
						valorComercial: validatedPrize.valorVenda,
					},
				});
			}
		}

		const shouldProcessPurchaseCampaigns =
			transactionRequiresSaleProcessing || transactionRequiresAccumulationProcessing || transactionRequiresRedemptionProcessing;

		if (shouldProcessPurchaseCampaigns) {
			console.log(`[POI ${input.orgId}] [CAMPAIGNS] Iniciando processamento de campanhas de compra`, {
				transactionRequiresSaleProcessing,
				transactionRequiresAccumulationProcessing,
				transactionRequiresRedemptionProcessing,
				transactionSaleId,
				effectiveSaleValue,
				clientId,
			});

			const exclusivePurchaseCampaigns = resolveExclusivePurchaseTriggerCampaigns({
				campaigns: [
					...campaignsForFirstPurchase,
					...(transactionRequiresSaleProcessing ? campaignsForTotalPurchaseCount : []),
					...campaignsForNewPurchase,
				],
				audiencesByCampaignId,
				clientId,
				isFirstPurchase: clientIsNew,
				saleValue: effectiveSaleValue,
				// clientCurrentPurchaseCount was already incremented by this transaction's sale.
				totalPurchaseCount: transactionRequiresSaleProcessing ? clientCurrentPurchaseCount : null,
				previousTotalPurchaseCount: transactionRequiresSaleProcessing ? clientCurrentPurchaseCount - 1 : null,
				allowNewPurchaseOnFirstPurchase: true,
			});
			const exclusivePurchaseTrigger = exclusivePurchaseCampaigns[0]?.gatilhoTipo ?? null;

			console.log(`[POI ${input.orgId}] [CAMPAIGNS] Gatilho exclusivo de compra selecionado`, {
				exclusivePurchaseTrigger,
				exclusiveCampaignsCount: exclusivePurchaseCampaigns.length,
			});

			// Processing PRIMEIRA-COMPRA campaign for new clients
			if (exclusivePurchaseTrigger === "PRIMEIRA-COMPRA")
				await handleCampaignProcessingForFirstPurchase({
					tx,
					orgId: input.orgId,
					campaignsForFirstPurchase: exclusivePurchaseCampaigns,
					audiencesByCampaignId,
					addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
					saleId: transactionSaleId,
					saleValue: effectiveSaleValue,
					clientId: clientId,
					sellerName: operator.nome,
					transactionAccumulatedCashback: clientNewAccumulatedCashbackValue,
					clientCashbackAvailableBalance: clientCashbackAvailableBalance ?? 0,
					clientCashbackAccumulatedBalance: clientCashbackAccumulatedBalance ?? 0,
					clientCashbackRedeemedBalanceTotal: clientCashbackRedeemedBalanceTotal ?? 0,
					organizationCashbackTerminology: program.terminologia,
				});

			const wouldCauseDoubleInteraction = clientIsNew && campaignsForFirstPurchase.length > 0 && campaignsForNewPurchase.length > 0;
			if (wouldCauseDoubleInteraction && exclusivePurchaseTrigger === "PRIMEIRA-COMPRA") {
				console.log(`[POI ${input.orgId}] [NOVA-COMPRA] Pulando campanhas de nova compra para evitar interação duplicada com primeira compra`);
			}

			// Processing NOVA-COMPRA campaign for existing clients or new clients (if no double interaction would occur)
			if (exclusivePurchaseTrigger === "NOVA-COMPRA")
				await handleCampaignProcessingForNewPurchase({
					tx,
					orgId: input.orgId,
					campaignsForNewPurchase: exclusivePurchaseCampaigns,
					audiencesByCampaignId,
					addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
					saleId: transactionSaleId,
					saleValue: effectiveSaleValue,
					clientId: clientId,
					clientRFMTitle: clientRfmTitle,
					sellerName: operator.nome,
					transactionAccumulatedCashback: clientNewAccumulatedCashbackValue,
					clientCashbackAvailableBalance: clientCashbackAvailableBalance ?? 0,
					clientCashbackAccumulatedBalance: clientCashbackAccumulatedBalance ?? 0,
					clientCashbackRedeemedBalanceTotal: clientCashbackRedeemedBalanceTotal ?? 0,
					terminologia: program.terminologia,
				});

			// QUANTIDADE/VALOR dependem de metadata de compra atualizada — só quando a venda é criada internamente
			if (transactionRequiresSaleProcessing) {
				if (exclusivePurchaseTrigger === "QUANTIDADE-TOTAL-COMPRAS") {
					await handleCampaignProcessingForTotalPurchaseCount({
						tx,
						orgId: input.orgId,
						campaignsForTotalPurchaseCount: exclusivePurchaseCampaigns,
						audiencesByCampaignId,
						addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
						saleId: transactionSaleId,
						saleValue: effectiveSaleValue,
						clientId: clientId,
						clientNewTotalPurchaseCount: clientCurrentPurchaseCount,
						sellerName: operator.nome,
						transactionAccumulatedCashback: clientNewAccumulatedCashbackValue,
						clientCashbackAvailableBalance: clientCashbackAvailableBalance ?? 0,
						clientCashbackAccumulatedBalance: clientCashbackAccumulatedBalance ?? 0,
						clientCashbackRedeemedBalanceTotal: clientCashbackRedeemedBalanceTotal ?? 0,
						organizationCashbackTerminology: program.terminologia,
					});
				}

				await handleCampaignProcessingForTotalPurchaseValue({
					tx,
					orgId: input.orgId,
					campaignsForTotalPurchaseValue: campaignsForTotalPurchaseValue,
					audiencesByCampaignId,
					addToImmediateProcessingDataList: (data: ImmediateProcessingData) => immediateProcessingDataList.push(data),
					saleId: transactionSaleId,
					saleValue: effectiveSaleValue,
					clientId: clientId,
					clientNewTotalPurchaseValue: clientCurrentPurchaseValue,
					sellerName: operator.nome,
					transactionAccumulatedCashback: clientNewAccumulatedCashbackValue,
					clientCashbackAvailableBalance: clientCashbackAvailableBalance ?? 0,
					clientCashbackAccumulatedBalance: clientCashbackAccumulatedBalance ?? 0,
					clientCashbackRedeemedBalanceTotal: clientCashbackRedeemedBalanceTotal ?? 0,
					organizationCashbackTerminology: program.terminologia,
				});
			} else {
				console.log(
					`[POI ${input.orgId}] [CAMPAIGNS] Pulando campanhas de quantidade/valor total — venda não criada internamente (registro de vendas do POI desativado)`,
				);
			}
		} else {
			console.log(`[POI ${input.orgId}] [CAMPAIGNS] Nenhuma campanha de compra processada — transação sem acúmulo, resgate ou venda interna`);
		}

		return {
			transactionSaleId,
			transactionAccumulationId,
			transactionRedemptionId,
			transactionCouponRedemptionId,
			clientAccumulatedCashbackValue: clientNewAccumulatedCashbackValue,
			clientNewOverallAvailableBalance: clientCashbackAvailableBalance,
			visualClientAccumulatedCashbackValue,
			visualClientNewOverallAvailableBalance,
			immediateProcessingDataList,
			createdClienteId: clientIsNew && clientId ? clientId : null,
		};
	})();

	const afterCommit = () => {
		// Redetecção de duplicidade pós-commit para cadastros criados nesta transação (best-effort).
		if (result.createdClienteId) {
			void recomputeClientDuplicatesSafely({ organizacaoId: input.orgId, clienteId: result.createdClienteId });
		}
		if (result.immediateProcessingDataList && result.immediateProcessingDataList.length > 0) {
			const weeklyLimitCache = createCampaignWeeklyLimitCache();

			const processingPromises =
				result.immediateProcessingDataList.length === 1
					? result.immediateProcessingDataList.map(async (processingData) => {
							try {
								await processSingleInteractionImmediately({
									...processingData,
									weeklyLimitCache,
								});
							} catch (err) {
								console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${processingData.interactionId}:`, err);
							}
						})
					: [
							processOrganizationInteractionsBatch({
								organizationId: input.orgId,
								interactions: result.immediateProcessingDataList,
								weeklyLimitCache,
							}).then((batchResult) => {
								if (batchResult.failed > 0) {
									for (const failedResult of batchResult.results.filter((itemResult) => !itemResult.success)) {
										console.error(`[IMMEDIATE_PROCESS] Failed to process interaction ${failedResult.interactionId}:`, failedResult.error);
									}
								}
							}),
						];

			// Use waitUntil to keep the function alive until all processing is complete
			// This allows us to return the response immediately while ensuring the background work finishes
			waitUntil(Promise.all(processingPromises));
		} else {
			console.log("[POI] [IMMEDIATE_PROCESS] Nenhuma interação para processar imediatamente");
		}
	};

	const response = {
		data: {
			saleId: result.transactionSaleId,
			transactionAccumulationId: result.transactionAccumulationId,
			transactionRedemptionId: result.transactionRedemptionId,
			transactionCouponRedemptionId: result.transactionCouponRedemptionId,
			clientAccumulatedCashbackValue: result.clientAccumulatedCashbackValue,
			clientNewOverallAvailableBalance: result.clientNewOverallAvailableBalance,
			visualClientAccumulatedCashbackValue: result.visualClientAccumulatedCashbackValue,
			visualClientNewOverallAvailableBalance: result.visualClientNewOverallAvailableBalance,
		},
		message: "Transação processada com sucesso.",
	};

	return { result: response, afterCommit };
}

type TProcessPointOfInteractionTransactionParams = Omit<TPreparePointOfInteractionTransactionParams, "tx">;

export async function processPointOfInteractionTransaction(params: TProcessPointOfInteractionTransactionParams) {
	const execution = await db.transaction((tx) => preparePointOfInteractionTransaction({ ...params, tx }));
	await execution.afterCommit();
	return execution.result;
}

export type TProcessPointOfInteractionTransactionOutput = Awaited<ReturnType<typeof processPointOfInteractionTransaction>>;

async function handleNewTransaction(req: NextRequest): Promise<NextResponse<TCreatePointOfInteractionTransactionOutput>> {
	const body = await req.json();
	const parsedInput = CreatePointOfInteractionTransactionInputSchema.parse(body);

	// Dual-mode (plano §9.10): dispositivo autenticado deriva a organização do principal e exige
	// scope; modo legado segue aceitando o orgId do payload, com telemetria em access_events.
	const resolution = await resolvePoiActorContext({ request: req, requiredScope: "poi:transactions:create", payloadOrgId: parsedInput.orgId });
	const input = { ...parsedInput, orgId: resolution.organizationId };

	// Idempotência (plano §11): com a chave presente, repetições devolvem a resposta original.
	const idempotencyKey = req.headers.get("idempotency-key");
	const result = idempotencyKey
		? await runPoiTransactionWithIdempotency({
				organizacaoId: resolution.organizationId,
				principalId: resolution.actor?.principalId ?? null,
				idempotencyKey,
				payload: input,
				execute: (tx) => preparePointOfInteractionTransaction({ input, tx }),
			})
		: await processPointOfInteractionTransaction({ input });

	return NextResponse.json(result, { status: 201 });
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
			whatsappConexaoTelefone: {
				columns: {
					id: true,
				},
				with: {
					conexao: { columns: { token: true, gatewaySessaoId: true } },
				},
			},
		},
	});

	const campaignsForNewPurchase = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "NOVA-COMPRA");
	const campaignsForFirstPurchase = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "PRIMEIRA-COMPRA");
	const campaignsForCashbackAccumulation = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "CASHBACK-ACUMULADO");
	const campaignsForTotalPurchaseCount = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "QUANTIDADE-TOTAL-COMPRAS");
	const campaignsForTotalPurchaseValue = organizationCampaigns.filter((campaign) => campaign.gatilhoTipo === "VALOR-TOTAL-COMPRAS");
	const audiencesByCampaignId = await resolveCampaignAudiencesByCampaignId({
		executor: tx,
		organizationId: orgId,
		campaigns: organizationCampaigns,
	});

	return {
		campaignsForNewPurchase,
		campaignsForFirstPurchase,
		campaignsForCashbackAccumulation,
		campaignsForTotalPurchaseCount,
		campaignsForTotalPurchaseValue,
		audiencesByCampaignId,
	};
}
type TGetOrganizationCampaignsOutput = Awaited<ReturnType<typeof getOrganizationCampaigns>>;

type THandleCampaignProcessingForNewPurchaseParams = {
	tx: DBTransaction;
	orgId: string;
	campaignsForNewPurchase: TGetOrganizationCampaignsOutput["campaignsForNewPurchase"];
	audiencesByCampaignId: TGetOrganizationCampaignsOutput["audiencesByCampaignId"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string | null;
	saleValue: number;
	clientId: string;
	clientRFMTitle: string;
	sellerName: string;
	transactionAccumulatedCashback: number;
	clientCashbackAvailableBalance: number;
	clientCashbackAccumulatedBalance: number;
	clientCashbackRedeemedBalanceTotal: number;
	terminologia: TCashbackProgramTerminologyEnum;
};

async function handleCampaignProcessingForNewPurchase({
	tx,
	orgId,
	campaignsForNewPurchase,
	audiencesByCampaignId,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientRFMTitle,
	sellerName,
	transactionAccumulatedCashback,
	clientCashbackAvailableBalance,
	clientCashbackAccumulatedBalance,
	clientCashbackRedeemedBalanceTotal,
	terminologia,
}: THandleCampaignProcessingForNewPurchaseParams) {
	console.log("");
	if (campaignsForNewPurchase.length === 0) {
		console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Nenhuma campanha ativa com gatilho NOVA-COMPRA`);
		return;
	}

	console.log(
		`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Avaliando ${campaignsForNewPurchase.length} campanha(s) para cliente ${clientId} com saleValue=${saleValue}`,
	);

	const applicableCampaigns = campaignsForNewPurchase.filter((campaign) => {
		// Validate campaign trigger for new purchase
		const meetsNewPurchaseValueTrigger =
			campaign.gatilhoNovaCompraValorMinimo === null ||
			campaign.gatilhoNovaCompraValorMinimo === undefined ||
			saleValue >= campaign.gatilhoNovaCompraValorMinimo;

		const meetsSegmentationTrigger = campaignAudienceHasClient(audiencesByCampaignId, campaign.id, clientId);
		const audienceSize = audiencesByCampaignId.get(campaign.id)?.size ?? 0;

		console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Campanha "${campaign.titulo}" (${campaign.id}):`, {
			meetsNewPurchaseValueTrigger,
			meetsSegmentationTrigger,
			gatilhoNovaCompraValorMinimo: campaign.gatilhoNovaCompraValorMinimo,
			saleValue,
			audienceSize,
			execucaoAgendadaValor: campaign.execucaoAgendadaValor,
			hasWhatsappTemplate: !!campaign.whatsappTemplate,
			hasWhatsappConnection: !!campaign.whatsappConexaoTelefone?.conexao,
		});

		return meetsNewPurchaseValueTrigger && meetsSegmentationTrigger;
	});

	console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] ${applicableCampaigns.length} campanha(s) aplicável(is) após filtros`);

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
				metadataProdutoSugeridoId: true,
			},
		});

		if (!clientData) {
			throw new createHttpError.NotFound("Cliente não encontrado.");
		}

		console.log(
			`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Client data for immediate processing: ${clientData ? `found (telefone: ${clientData.telefone})` : "NOT FOUND"}`,
		);

		let runningAvailableBalance = clientCashbackAvailableBalance;
		let runningAccumulatedTotal = clientCashbackAccumulatedBalance;

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

			const interactionId = crypto.randomUUID();
			const bonusResult = await applyCampaignBonusToInteractionMetadata({
				tx,
				baseMetadata: buildBasePurchaseInteractionMetadata({
					terminologia,
					saleValue,
					transactionAccumulatedCashback,
					availableBalance: runningAvailableBalance,
					accumulatedTotal: runningAccumulatedTotal,
					redeemedTotal: clientCashbackRedeemedBalanceTotal,
					sellerName,
				}),
				campaign,
				organizationId: orgId,
				clientId,
				saleId,
				saleValue,
				interactionId,
			});
			const interactionContextMetadados = bonusResult.metadata;
			runningAvailableBalance = bonusResult.runningAvailableBalance;
			runningAccumulatedTotal = bonusResult.runningAccumulatedTotal;

			const interactionScheduleDate = getPostponedDateFromReferenceDate({
				date: dayjs().toDate(),
				unit: campaign.execucaoAgendadaMedida,
				value: campaign.execucaoAgendadaValor,
			});

			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Creating interaction with schedule date: ${dayjs(interactionScheduleDate).format("YYYY-MM-DD")}`);

			const [insertedInteraction] = await tx
				.insert(interactions)
				.values({
					id: interactionId,
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: `Cliente se enquadrou no parâmetro de nova compra ${clientRFMTitle}.`,
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
					metadados: interactionContextMetadados,
				})
				.returning({ id: interactions.id });

			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] Interaction created: ${insertedInteraction.id}`);

			// Check for immediate processing (execucaoAgendadaValor === 0 or null/undefined means immediate)
			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

			console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] SHOULD PROCESS IMMEDIATELY PARAMS:`, {
				SHOULD_PROCESS_IMMEDIATELY: shouldProcessImmediately,
				HAS_MESSAGE_TEMPLATE: !!campaign.whatsappTemplate,
				HAS_WHATSAPP_CONNECTION: !!campaign.whatsappConexaoTelefone?.conexao,
				HAS_CLIENT_DATA: !!clientData,
			});
			if (shouldProcessImmediately && campaign.whatsappTemplate && clientData) {
				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
					whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
					contextMetadados: interactionContextMetadados,
				});
			} else {
				console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] NOT adding to immediate processing - conditions not met`);
			}
		}
	} else {
		console.log(`[POI] [ORG: ${orgId}] [NOVA-COMPRA] No applicable campaigns found after filtering`);
	}
}

type THandleCampaignProcessingForFirstPurchaseParams = {
	tx: DBTransaction;
	orgId: string;
	campaignsForFirstPurchase: TGetOrganizationCampaignsOutput["campaignsForFirstPurchase"];
	audiencesByCampaignId: TGetOrganizationCampaignsOutput["audiencesByCampaignId"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string | null;
	saleValue: number;
	clientId: string;
	sellerName: string;
	transactionAccumulatedCashback: number;
	clientCashbackAvailableBalance: number;
	clientCashbackAccumulatedBalance: number;
	clientCashbackRedeemedBalanceTotal: number;
	organizationCashbackTerminology: TCashbackProgramTerminologyEnum;
};
async function handleCampaignProcessingForFirstPurchase({
	tx,
	orgId,
	campaignsForFirstPurchase,
	audiencesByCampaignId,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	sellerName,
	transactionAccumulatedCashback,
	clientCashbackAvailableBalance,
	clientCashbackAccumulatedBalance,
	clientCashbackRedeemedBalanceTotal,
	organizationCashbackTerminology,
}: THandleCampaignProcessingForFirstPurchaseParams) {
	if (campaignsForFirstPurchase.length === 0) return;
	console.log("[INFO] Campaigns for first purchase:", campaignsForFirstPurchase);
	const applicableCampaigns = campaignsForFirstPurchase.filter((campaign) => campaignAudienceHasClient(audiencesByCampaignId, campaign.id, clientId));

	console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] ${applicableCampaigns.length} applicable campaigns after filtering`);

	if (applicableCampaigns.length > 0) {
		console.log(`[ORG: ${orgId}] ${applicableCampaigns.length} campanhas de primeira compra aplicáveis encontradas para o cliente ${clientId}.`);

		let runningAvailableBalance = clientCashbackAvailableBalance;
		let runningAccumulatedTotal = clientCashbackAccumulatedBalance;

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

			const interactionId = crypto.randomUUID();
			const bonusResult = await applyCampaignBonusToInteractionMetadata({
				tx,
				baseMetadata: buildBasePurchaseInteractionMetadata({
					terminologia: organizationCashbackTerminology,
					saleValue,
					transactionAccumulatedCashback,
					availableBalance: runningAvailableBalance,
					accumulatedTotal: runningAccumulatedTotal,
					redeemedTotal: clientCashbackRedeemedBalanceTotal,
					sellerName,
				}),
				campaign,
				organizationId: orgId,
				clientId,
				saleId,
				saleValue,
				interactionId,
			});
			const interactionContextMetadados = bonusResult.metadata;
			runningAvailableBalance = bonusResult.runningAvailableBalance;
			runningAccumulatedTotal = bonusResult.runningAccumulatedTotal;

			const interactionScheduleDate = getPostponedDateFromReferenceDate({
				date: dayjs().toDate(),
				unit: campaign.execucaoAgendadaMedida,
				value: campaign.execucaoAgendadaValor,
			});

			const [insertedInteraction] = await tx
				.insert(interactions)
				.values({
					id: interactionId,
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: "Cliente realizou sua primeira compra.",
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
					metadados: interactionContextMetadados,
				})
				.returning({ id: interactions.id });

			console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] Interaction created: ${insertedInteraction.id}`);

			// Check for immediate processing (execucaoAgendadaValor === 0 or null/undefined means immediate)
			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;
			console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] SHOULD PROCESS IMMEDIATELY PARAMS:`, {
				SHOULD_PROCESS_IMMEDIATELY: shouldProcessImmediately,
				HAS_MESSAGE_TEMPLATE: !!campaign.whatsappTemplate,
				HAS_WHATSAPP_CONNECTION: !!campaign.whatsappConexaoTelefone?.conexao,
			});
			if (shouldProcessImmediately && campaign.whatsappTemplate) {
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
						metadataProdutoSugeridoId: true,
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
					whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
					whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
					contextMetadados: interactionContextMetadados,
				});
			} else {
				console.log(`[POI] [ORG: ${orgId}] [PRIMEIRA-COMPRA] NOT adding to immediate processing - conditions not met`);
			}
		}
	}
}

type THandleCampaignProcessingForCashbackAccumulationParams = {
	tx: DBTransaction;
	orgId: string;
	cashbackAccumulationCampaigns: TGetOrganizationCampaignsOutput["campaignsForCashbackAccumulation"];
	audiencesByCampaignId: TGetOrganizationCampaignsOutput["audiencesByCampaignId"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	clientId: string;
	clientCashbackToAccumulate: number;
	clientCashbackAvailableBalance: number;
	saleValue: number;
	sellerName: string;
	clientCashbackAccumulatedBalance: number;
	clientCashbackRedeemedBalanceTotal: number;
	organizationCashbackTerminology: TCashbackProgramTerminologyEnum;
};
async function handleCampaignProcessingForCashbackAccumulation({
	tx,
	orgId,
	cashbackAccumulationCampaigns,
	audiencesByCampaignId,
	addToImmediateProcessingDataList,
	clientId,
	clientCashbackToAccumulate,
	clientCashbackAvailableBalance,
	saleValue,
	sellerName,
	clientCashbackAccumulatedBalance,
	clientCashbackRedeemedBalanceTotal,
	organizationCashbackTerminology,
}: THandleCampaignProcessingForCashbackAccumulationParams) {
	if (cashbackAccumulationCampaigns.length === 0) return;
	if (clientCashbackToAccumulate <= 0) return;

	const applicableCampaigns = cashbackAccumulationCampaigns.filter((campaign) => {
		if (!campaignAudienceHasClient(audiencesByCampaignId, campaign.id, clientId)) return false;

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

	const interactionContextMetadados: TInteractionContextMetadados = {
		terminologia: organizationCashbackTerminology,
		compraValor: saleValue,
		compraCashbackAcumulado: clientCashbackToAccumulate,
		compraCashbackNovoSaldo: clientCashbackAvailableBalance,
		compraVendedorNome: sellerName,
		cashbackSaldoDisponivel: clientCashbackAvailableBalance,
		cashbackTotalAcumuladoVida: clientCashbackAccumulatedBalance,
		cashbackTotalResgatadoVida: clientCashbackRedeemedBalanceTotal,
	};

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
			metadataProdutoSugeridoId: true,
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
				descricao: `Cliente acumulou R$ ${clientCashbackToAccumulate.toFixed(2)} em cashback. Total acumulado: R$ ${clientCashbackAvailableBalance.toFixed(2)}.`,
				agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
				agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
				metadados: interactionContextMetadados,
			})
			.returning({ id: interactions.id });

		// Check for immediate processing (execucaoAgendadaValor === 0 or null/undefined means immediate)
		const shouldProcessImmediately =
			campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

		console.log(`[POI] [ORG: ${orgId}] [CASHBACK-ACUMULADO] SHOULD PROCESS IMMEDIATELY PARAMS:`, {
			SHOULD_PROCESS_IMMEDIATELY: shouldProcessImmediately,
			HAS_MESSAGE_TEMPLATE: !!campaign.whatsappTemplate,
			HAS_WHATSAPP_CONNECTION: !!campaign.whatsappConexaoTelefone?.conexao,
			HAS_CLIENT_DATA: !!clientData,
		});
		if (shouldProcessImmediately && campaign.whatsappTemplate && clientData) {
			console.log(`[POI] [ORG: ${orgId}] [CASHBACK-ACUMULADO] Adding to immediate processing list`);
			addToImmediateProcessingDataList({
				interactionId: insertedInteraction.id,
				organizationId: orgId,
				client: clientData,
				campaign: {
					autorId: campaign.autorId,
					whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
					whatsappTemplate: campaign.whatsappTemplate,
				},
				whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
				whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
				contextMetadados: interactionContextMetadados,
			});
		}
	}
}

type THandleCampaignProcessingForTotalPurchaseCountParams = {
	tx: DBTransaction;
	orgId: string;
	campaignsForTotalPurchaseCount: TGetOrganizationCampaignsOutput["campaignsForTotalPurchaseCount"];
	audiencesByCampaignId: TGetOrganizationCampaignsOutput["audiencesByCampaignId"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string | null;
	saleValue: number;
	clientId: string;
	clientNewTotalPurchaseCount: number;
	sellerName: string;
	transactionAccumulatedCashback: number;
	clientCashbackAvailableBalance: number;
	clientCashbackAccumulatedBalance: number;
	clientCashbackRedeemedBalanceTotal: number;
	organizationCashbackTerminology: TCashbackProgramTerminologyEnum;
};
async function handleCampaignProcessingForTotalPurchaseCount({
	tx,
	orgId,
	campaignsForTotalPurchaseCount,
	audiencesByCampaignId,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientNewTotalPurchaseCount,
	sellerName,
	transactionAccumulatedCashback,
	clientCashbackAvailableBalance,
	clientCashbackAccumulatedBalance,
	clientCashbackRedeemedBalanceTotal,
	organizationCashbackTerminology,
}: THandleCampaignProcessingForTotalPurchaseCountParams) {
	if (campaignsForTotalPurchaseCount.length === 0) return;
	const applicableCampaigns = campaignsForTotalPurchaseCount.filter((campaign) => {
		// Crossing semantics: fires when this sale makes the client cross the threshold.
		const meetsThreshold =
			campaign.gatilhoQuantidadeTotalCompras !== null &&
			campaign.gatilhoQuantidadeTotalCompras !== undefined &&
			clientNewTotalPurchaseCount >= campaign.gatilhoQuantidadeTotalCompras &&
			clientNewTotalPurchaseCount - 1 < campaign.gatilhoQuantidadeTotalCompras;

		// Check segmentation match
		const meetsSegmentation = campaignAudienceHasClient(audiencesByCampaignId, campaign.id, clientId);

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
				metadataProdutoSugeridoId: true,
			},
		});

		let runningAvailableBalance = clientCashbackAvailableBalance;
		let runningAccumulatedTotal = clientCashbackAccumulatedBalance;

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

			const interactionId = crypto.randomUUID();
			const bonusResult = await applyCampaignBonusToInteractionMetadata({
				tx,
				baseMetadata: buildBasePurchaseInteractionMetadata({
					terminologia: organizationCashbackTerminology,
					saleValue,
					transactionAccumulatedCashback,
					availableBalance: runningAvailableBalance,
					accumulatedTotal: runningAccumulatedTotal,
					redeemedTotal: clientCashbackRedeemedBalanceTotal,
					sellerName,
				}),
				campaign,
				organizationId: orgId,
				clientId,
				saleId,
				saleValue,
				interactionId,
			});
			const interactionContextMetadados = bonusResult.metadata;
			runningAvailableBalance = bonusResult.runningAvailableBalance;
			runningAccumulatedTotal = bonusResult.runningAccumulatedTotal;

			const interactionScheduleDate = getPostponedDateFromReferenceDate({
				date: dayjs().toDate(),
				unit: campaign.execucaoAgendadaMedida,
				value: campaign.execucaoAgendadaValor,
			});

			const [insertedInteraction] = await tx
				.insert(interactions)
				.values({
					id: interactionId,
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: `Cliente atingiu ${clientNewTotalPurchaseCount} compras totais (gatilho: ${campaign.gatilhoQuantidadeTotalCompras}).`,
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
					metadados: interactionContextMetadados,
				})
				.returning({ id: interactions.id });

			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

			if (shouldProcessImmediately && campaign.whatsappTemplate && clientData) {
				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
					whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
					contextMetadados: interactionContextMetadados,
				});
			}
		}
	}
}

type THandleCampaignProcessingForTotalPurchaseValueParams = {
	tx: DBTransaction;
	orgId: string;
	campaignsForTotalPurchaseValue: TGetOrganizationCampaignsOutput["campaignsForTotalPurchaseValue"];
	audiencesByCampaignId: TGetOrganizationCampaignsOutput["audiencesByCampaignId"];
	addToImmediateProcessingDataList: (data: ImmediateProcessingData) => void;
	saleId: string | null;
	saleValue: number;
	clientId: string;
	clientNewTotalPurchaseValue: number;
	sellerName: string;
	transactionAccumulatedCashback: number;
	clientCashbackAvailableBalance: number;
	clientCashbackAccumulatedBalance: number;
	clientCashbackRedeemedBalanceTotal: number;
	organizationCashbackTerminology: TCashbackProgramTerminologyEnum;
};

async function handleCampaignProcessingForTotalPurchaseValue({
	tx,
	orgId,
	campaignsForTotalPurchaseValue,
	audiencesByCampaignId,
	addToImmediateProcessingDataList,
	saleId,
	saleValue,
	clientId,
	clientNewTotalPurchaseValue,
	sellerName,
	transactionAccumulatedCashback,
	clientCashbackAvailableBalance,
	clientCashbackAccumulatedBalance,
	clientCashbackRedeemedBalanceTotal,
	organizationCashbackTerminology,
}: THandleCampaignProcessingForTotalPurchaseValueParams) {
	if (campaignsForTotalPurchaseValue.length === 0) return;

	const applicableCampaigns = campaignsForTotalPurchaseValue.filter((campaign) => {
		// Crossing semantics: fires when this sale crosses the threshold, instead of the old float
		// equality that missed any sale jumping past the exact configured value.
		const meetsThreshold =
			campaign.gatilhoValorTotalCompras !== null &&
			campaign.gatilhoValorTotalCompras !== undefined &&
			clientNewTotalPurchaseValue >= campaign.gatilhoValorTotalCompras &&
			clientNewTotalPurchaseValue - saleValue < campaign.gatilhoValorTotalCompras;

		// Check segmentation match
		const meetsSegmentation = campaignAudienceHasClient(audiencesByCampaignId, campaign.id, clientId);

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
				metadataProdutoSugeridoId: true,
			},
		});

		let runningAvailableBalance = clientCashbackAvailableBalance;
		let runningAccumulatedTotal = clientCashbackAccumulatedBalance;

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

			const interactionId = crypto.randomUUID();
			const bonusResult = await applyCampaignBonusToInteractionMetadata({
				tx,
				baseMetadata: buildBasePurchaseInteractionMetadata({
					terminologia: organizationCashbackTerminology,
					saleValue,
					transactionAccumulatedCashback,
					availableBalance: runningAvailableBalance,
					accumulatedTotal: runningAccumulatedTotal,
					redeemedTotal: clientCashbackRedeemedBalanceTotal,
					sellerName,
				}),
				campaign,
				organizationId: orgId,
				clientId,
				saleId,
				saleValue,
				interactionId,
			});
			const interactionContextMetadados = bonusResult.metadata;
			runningAvailableBalance = bonusResult.runningAvailableBalance;
			runningAccumulatedTotal = bonusResult.runningAccumulatedTotal;

			const interactionScheduleDate = getPostponedDateFromReferenceDate({
				date: dayjs().toDate(),
				unit: campaign.execucaoAgendadaMedida,
				value: campaign.execucaoAgendadaValor,
			});

			const [insertedInteraction] = await tx
				.insert(interactions)
				.values({
					id: interactionId,
					clienteId: clientId,
					campanhaId: campaign.id,
					organizacaoId: orgId,
					titulo: `Envio de mensagem automática via campanha ${campaign.titulo}`,
					tipo: "ENVIO-MENSAGEM",
					descricao: `Cliente atingiu R$ ${clientNewTotalPurchaseValue.toFixed(2)} em compras totais (gatilho: R$ ${campaign.gatilhoValorTotalCompras?.toFixed(2)}).`,
					agendamentoDataReferencia: dayjs(interactionScheduleDate).format("YYYY-MM-DD"),
					agendamentoBlocoReferencia: campaign.execucaoAgendadaBloco,
					metadados: interactionContextMetadados,
				})
				.returning({ id: interactions.id });

			const shouldProcessImmediately =
				campaign.execucaoAgendadaValor === 0 || campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined;

			if (shouldProcessImmediately && campaign.whatsappTemplate && clientData) {
				addToImmediateProcessingDataList({
					interactionId: insertedInteraction.id,
					organizationId: orgId,
					client: clientData,
					campaign: {
						autorId: campaign.autorId,
						whatsappConexaoTelefoneId: campaign.whatsappConexaoTelefoneId,
						whatsappTemplate: campaign.whatsappTemplate,
					},
					whatsappToken: campaign.whatsappConexaoTelefone?.conexao?.token ?? undefined,
					whatsappSessionId: campaign.whatsappConexaoTelefone?.conexao?.gatewaySessaoId ?? undefined,
					contextMetadados: interactionContextMetadados,
				});
			}
		}
	}
}
