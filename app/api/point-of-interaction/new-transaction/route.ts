import { getCashbackRedemptionBlockReason } from "@/lib/cashback/redemption-policy";
import { appApiHandler } from "@/lib/app-api";
import { recomputeClientDuplicatesSafely } from "@/lib/clients/duplicates";
import { accumulateCashbackForClient, calculateAccumulatedCashbackValue, ensureCashbackBalanceForClient } from "@/lib/cashback/accumulation";
import { type TValidatedPrizeForRedemption, validatePrizeForRedemption } from "@/lib/cashback/prizes";
import { resolvePoiPrizeLines } from "@/lib/point-of-interaction/prize-lines";
import { normalizeRewardRedemptionLines } from "@/lib/sales/sale-reward-snapshot";
import { applyCashbackRedemptionFIFO } from "@/lib/cashback/redemption";
import {
	canScheduleCampaignForClient,
	createEventCampaignDispatch,
	publishEventDispatches,
	resolveTriggeredCampaigns,
	type TEventDispatchResult,
} from "@/lib/campaigns/engine";
import { resolveCampaignAudiencesByCampaignId } from "@/lib/campaigns/filters";
import { buildBasePurchaseInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { processConversionAttribution } from "@/lib/conversions/attribution";
import { formatCashbackValue, formatPhoneAsBase } from "@/lib/formatting";
import { isValidCpfCnpj } from "@/lib/validation";
import { evaluateCouponAgainstSaleValue } from "@/lib/coupons/engine";
import { processCouponRedemption } from "@/lib/coupons/redemption";
import { countPreviousConfirmedPurchases, lockClientPurchaseHistory } from "@/lib/coupons/purchase-history";
import { DeliveryModeEnum } from "@/schemas/enums";
import { resolvePoiActorContext } from "@/lib/access/poi-actor";
import { organizationHasActiveDataSource } from "@/lib/integrations/data-sources";
import { linkPartnerToClient } from "@/lib/partners/link-partner-to-client";
import { runPoiTransactionWithIdempotency } from "@/lib/point-of-interaction/idempotency";
import {
	getPoiSaleValueForConfirmation,
	poiSaleRequiresValueConfirmation,
	saleValuesMatch,
} from "@/lib/point-of-interaction/sale-value-confirmation";
import { type DBTransaction, db } from "@/services/drizzle";
import { cashbackProgramTransactions, cashbackPrograms, clients, couponRedemptions, partners, saleItems, sales } from "@/services/drizzle/schema";
import { waitUntil } from "@vercel/functions";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { attendanceStatusValues } from "@/lib/sales/sale-processing/attendance";

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
		entregaModalidade: DeliveryModeEnum.optional().nullable(),
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
		// Recompensas: uma linha por recompensa distinta, com quantidade. `prizeValue`/`prizeSaleValue`
		// são por unidade e apenas informativos — o servidor os sobrescreve pelo catálogo.
		prizeRedemptions: z
			.array(
				z.object({
					prizeId: z.string({ required_error: "ID da recompensa não informado." }),
					prizeValue: z.number({ invalid_type_error: "Tipo não válido para o valor da recompensa." }).optional().nullable(),
					prizeSaleValue: z.number({ invalid_type_error: "Tipo não válido para o valor comercial da recompensa." }).optional().nullable(),
					quantity: z.number({ invalid_type_error: "Tipo não válido para a quantidade da recompensa." }).int().min(1).optional().nullable(),
				}),
			)
			.optional()
			.nullable(),
		// Formato anterior a múltiplas recompensas (app mobile, solicitações pendentes antigas).
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
		// Primeira linha RESGATE (compat com poiTransactionRequests.transacaoResgateId); todas em `transactionRedemptionIds`.
		transactionRedemptionId?: string | null;
		transactionRedemptionIds?: string[];
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
		const prizeLines = resolvePoiPrizeLines(input.sale);
		const isPrizeRedemption = prizeLines.length > 0;
		if (isPrizeRedemption) {
			// Forma das linhas (ids únicos, quantidade inteira ≥ 1); o conteúdo é validado contra o catálogo abaixo.
			const normalizedLines = normalizeRewardRedemptionLines(prizeLines.map((line) => ({ recompensaId: line.prizeId, quantidade: line.quantity })));
			if (normalizedLines.erro !== null) throw new createHttpError.BadRequest(normalizedLines.erro);
		}
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
		if (!cashbackProgramIsActive && (requestedCashbackRedemption || isPrizeRedemption)) {
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
		// Recompensa dirige o resgate explicitamente (o kiosk também espelha o débito em `cashback`,
		// mas a regra não pode depender desse espelho).
		const transactionRequiresRedemptionProcessing =
			cashbackProgramIsActive && program.resgatePermitirViaPontoIntegracao && (requestedCashbackRedemption || isPrizeRedemption);
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

		const eventDispatches: TEventDispatchResult[] = [];

		let transactionSaleId: string | null = null;
		let transactionAccumulationId: string | null = null;
		let transactionRedemptionId: string | null = null;
		const transactionRedemptionIds: string[] = [];

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
			await lockClientPurchaseHistory(tx, input.orgId, client.id);

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
		const { organizationCampaigns, audiencesByCampaignId } = await getOrganizationCampaigns({ tx, orgId: input.orgId, clientId });
		console.log(`[POI ${input.orgId}] [CAMPAIGNS APPLICABLE]`, organizationCampaigns.length);
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

		// PRIZE VALIDATION (if prize redemption is requested): uma linha por recompensa, valores do catálogo.
		const validatedPrizes: Array<{ prize: TValidatedPrizeForRedemption; quantity: number }> = [];
		for (const line of prizeLines) {
			const prize = await validatePrizeForRedemption({
				tx,
				organizacaoId: input.orgId,
				programaId: program.id,
				recompensaId: line.prizeId,
			});
			validatedPrizes.push({ prize, quantity: line.quantity });
		}
		const prizesSaleValue = validatedPrizes.reduce((sum, entry) => sum + entry.prize.valorVenda * entry.quantity, 0);
		const prizesRedemptionValue = validatedPrizes.reduce((sum, entry) => sum + entry.prize.valor * entry.quantity, 0);
		const prizesCost = validatedPrizes.reduce((sum, entry) => sum + entry.prize.precoCusto * entry.quantity, 0);

		const effectiveSaleValue = isPrizeRedemption ? prizesSaleValue : input.sale.valor;
		const effectiveRedemptionValue = isPrizeRedemption ? prizesRedemptionValue : input.sale.cashback.aplicar ? input.sale.cashback.valor : 0;

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
				await lockClientPurchaseHistory(tx, input.orgId, clientId as string);
				const previousConfirmedPurchases = await countPreviousConfirmedPurchases({ trx: tx, organizacaoId: input.orgId, clienteId: clientId as string });
				const evaluation = evaluateCouponAgainstSaleValue({
					coupon,
					targets: coupon.alvos,
					saleValue: effectiveSaleValue,
					context: { entregaModalidade: input.sale.entregaModalidade ?? null, comprasAnterioresConfirmadas: previousConfirmedPurchases },
				});
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
				entregaModalidade: input.sale.entregaModalidade ?? null,
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

			// Um RESGATE por linha (recompensa) ou um único para o desconto em cashback. O FIFO relê e
			// persiste o saldo a cada chamada; cada linha guarda o próprio consumoFifo para a reversão.
			const redemptionLines: Array<{ value: number; prize: TValidatedPrizeForRedemption | null; quantity: number }> = isPrizeRedemption
				? validatedPrizes.map((entry) => ({ value: entry.prize.valor * entry.quantity, prize: entry.prize, quantity: entry.quantity }))
				: [{ value: effectiveRedemptionValue, prize: null, quantity: 1 }];
			for (const line of redemptionLines) {
				const redemptionResult = await applyCashbackRedemptionFIFO({
					tx,
					orgId: input.orgId,
					clientId: clientId as string,
					programId: program.id,
					redemptionValue: line.value,
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
						valor: -line.value,
						valorRestante: 0, // RESGATE transactions are fully consumed
						saldoValorAnterior: previousBalance,
						saldoValorPosterior: newBalanceAfterRedemption,
						expiracaoData: null, // RESGATE transactions do not have expiration date
						operadorId: operatorMembershipUser?.id,
						operadorVendedorId: operator.id,
						// Prize redemption fields: total da linha; unitário e quantidade em metadados.
						resgateRecompensaId: line.prize?.id ?? null,
						resgateRecompensaValor: line.prize ? line.value : null,
						metadados: {
							consumoFifo: redemptionResult.consumedFromAccumulations,
							...(line.prize ? { recompensa: { quantidade: line.quantity, valorUnitario: line.prize.valor } } : {}),
						},
					})
					.returning({ id: cashbackProgramTransactions.id });
				const insertedRedemptionTransactionId = insertedRedemptionTransactionResponse[0]?.id;
				if (!insertedRedemptionTransactionId) throw new createHttpError.InternalServerError("Oops, um erro ocorreu ao criar transação de resgate.");
				transactionRedemptionIds.push(insertedRedemptionTransactionId);
			}
			transactionRedemptionId = transactionRedemptionIds[0] ?? null;
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
					custoTotal: prizesCost,
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
					entregaModalidade: input.sale.entregaModalidade ?? null,
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
			if (transactionRedemptionIds.length > 0) {
				await tx
					.update(cashbackProgramTransactions)
					.set({
						vendaId: transactionSaleId,
					})
					.where(inArray(cashbackProgramTransactions.id, transactionRedemptionIds));
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
			if (isPrizeRedemption && validatedPrizes.length > 0 && transactionSaleId) {
				// Um item por recompensa, na quantidade da linha (regra de desconto do POI preservada).
				await tx.insert(saleItems).values(
					validatedPrizes.map(({ prize, quantity }) => {
						const grossValue = prize.valorVenda * quantity;
						const saleItemDiscountValue = Math.min(grossValue, prize.valor * quantity);
						return {
							organizacaoId: input.orgId,
							vendaId: transactionSaleId as string,
							clienteId: clientId,
							produtoId: prize.produtoId,
							produtoVarianteId: prize.produtoVarianteId ?? null,
							quantidade: quantity,
							valorVendaUnitario: prize.valorVenda,
							valorCustoUnitario: prize.precoCusto,
							valorVendaTotalBruto: grossValue,
							valorTotalDesconto: saleItemDiscountValue,
							valorVendaTotalLiquido: Math.max(0, grossValue - saleItemDiscountValue),
							valorCustoTotal: prize.precoCusto * quantity,
							metadados: {
								origem: "POI-RESGATE-RECOMPENSA",
								recompensaId: prize.id,
								quantidade: quantity,
								valorResgate: prize.valor,
								valorComercial: prize.valorVenda,
							},
						};
					}),
				);
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

			// Motor único de gatilhos (lib/campaigns/engine): a mesma decisão das integrações.
			const triggered = resolveTriggeredCampaigns({
				campaigns: organizationCampaigns,
				audiencesByCampaignId,
				sale: {
					clientId,
					isFirstPurchase: clientIsNew,
					saleValue: effectiveSaleValue,
					// clientCurrentPurchaseCount/Value já incluem a venda desta transação.
					newTotalPurchaseCount: transactionRequiresSaleProcessing ? clientCurrentPurchaseCount : null,
					previousTotalPurchaseCount: transactionRequiresSaleProcessing ? clientCurrentPurchaseCount - 1 : null,
					newTotalPurchaseValue: transactionRequiresSaleProcessing ? clientCurrentPurchaseValue : null,
					previousTotalPurchaseValue: transactionRequiresSaleProcessing ? clientCurrentPurchaseValue - effectiveSaleValue : null,
					cashbackAccumulatedValue: clientNewAccumulatedCashbackValue > 0 ? clientNewAccumulatedCashbackValue : null,
					cashbackAvailableBalance: clientCashbackAvailableBalance ?? 0,
				},
			});
			console.log(
				`[POI ${input.orgId}] [CAMPAIGNS] Campanhas disparadas`,
				triggered.map(({ campaign, grupo }) => `${grupo}:${campaign.titulo}`),
			);

			for (const { campaign, grupo } of triggered) {
				if (!(await canScheduleCampaignForClient({ executor: tx, campaign, clientId }))) {
					console.log(`[POI ${input.orgId}] [CAMPAIGN_FREQUENCY] Pulando campanha ${campaign.titulo} para o cliente ${clientId} por frequência.`);
					continue;
				}

				const contexto = {
					...buildBasePurchaseInteractionMetadata({
						terminologia: program.terminologia,
						saleValue: effectiveSaleValue,
						transactionAccumulatedCashback: clientNewAccumulatedCashbackValue,
						availableBalance: clientCashbackAvailableBalance ?? 0,
						accumulatedTotal: clientCashbackAccumulatedBalance ?? 0,
						redeemedTotal: clientCashbackRedeemedBalanceTotal ?? 0,
						sellerName: operator.nome,
						totalPurchaseCount: transactionRequiresSaleProcessing ? clientCurrentPurchaseCount : undefined,
						totalPurchaseValue: transactionRequiresSaleProcessing ? clientCurrentPurchaseValue : undefined,
					}),
					...(grupo === "CASHBACK" ? { cashbackAcumuladoValor: clientNewAccumulatedCashbackValue } : {}),
				};
				const descricao =
					campaign.gatilhoTipo === "PRIMEIRA-COMPRA"
						? "Cliente realizou sua primeira compra."
						: campaign.gatilhoTipo === "NOVA-COMPRA"
							? `Cliente se enquadrou no parâmetro de nova compra ${clientRfmTitle}.`
							: campaign.gatilhoTipo === "QUANTIDADE-TOTAL-COMPRAS"
								? `Cliente atingiu ${clientCurrentPurchaseCount} compras totais (gatilho: ${campaign.gatilhoQuantidadeTotalCompras}).`
								: campaign.gatilhoTipo === "VALOR-TOTAL-COMPRAS"
									? `Cliente atingiu R$ ${clientCurrentPurchaseValue.toFixed(2)} em compras totais (gatilho: R$ ${campaign.gatilhoValorTotalCompras?.toFixed(2)}).`
									: `Cliente acumulou R$ ${clientNewAccumulatedCashbackValue.toFixed(2)} em cashback. Total acumulado: R$ ${(clientCashbackAvailableBalance ?? 0).toFixed(2)}.`;

				// Um disparo por (campanha, transação): o reprocessamento idempotente do POI não duplica.
				const dispatch = await createEventCampaignDispatch({
					tx,
					organizationId: input.orgId,
					campaign,
					janelaReferencia: `poi:${transactionSaleId ?? transactionAccumulationId ?? transactionRedemptionId ?? crypto.randomUUID()}`,
					recipients: [{ clienteId: clientId, contexto, vendaId: transactionSaleId, descricao }],
				});
				if (dispatch.created) eventDispatches.push(dispatch);
			}
		} else {
			console.log(`[POI ${input.orgId}] [CAMPAIGNS] Nenhuma campanha de compra processada — transação sem acúmulo, resgate ou venda interna`);
		}

		return {
			transactionSaleId,
			transactionAccumulationId,
			transactionRedemptionId,
			transactionRedemptionIds,
			transactionCouponRedemptionId,
			clientAccumulatedCashbackValue: clientNewAccumulatedCashbackValue,
			clientNewOverallAvailableBalance: clientCashbackAvailableBalance,
			visualClientAccumulatedCashbackValue,
			visualClientNewOverallAvailableBalance,
			eventDispatches,
			createdClienteId: clientIsNew && clientId ? clientId : null,
		};
	})();

	const afterCommit = () => {
		// Redetecção de duplicidade pós-commit para cadastros criados nesta transação (best-effort).
		if (result.createdClienteId) {
			void recomputeClientDuplicatesSafely({ organizacaoId: input.orgId, clienteId: result.createdClienteId });
		}
		if (result.eventDispatches.length > 0) {
			// Publica os disparos imediatos depois do commit; a função só encerra quando a fila aceitou.
			waitUntil(publishEventDispatches(result.eventDispatches));
		} else {
			console.log("[POI] [CAMPAIGNS] Nenhum disparo de campanha para publicar");
		}
	};

	const response = {
		data: {
			saleId: result.transactionSaleId,
			transactionAccumulationId: result.transactionAccumulationId,
			transactionRedemptionId: result.transactionRedemptionId,
			transactionRedemptionIds: result.transactionRedemptionIds,
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

// Audiências restritas ao cliente da transação: os gatilhos só perguntam se ELE pertence a cada
// campanha, e materializar a org inteira por campanha a cada transação era egress puro.
async function getOrganizationCampaigns({ tx, orgId, clientId }: { tx: DBTransaction; orgId: string; clientId: string | null | undefined }) {
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
		with: { segmentacoes: true },
	});
	const audiencesByCampaignId = await resolveCampaignAudiencesByCampaignId({
		executor: tx,
		organizationId: orgId,
		campaigns: organizationCampaigns,
		restrictToClientIds: clientId ? [clientId] : [],
	});
	return { organizationCampaigns, audiencesByCampaignId };
}
