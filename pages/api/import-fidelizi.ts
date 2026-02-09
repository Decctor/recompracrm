import { apiHandler } from "@/lib/api";
import { getCardapioWebOrderHistory } from "@/lib/data-connectors/cardapio-web";
import { formatPhoneAsBase, formatToCEP, formatToPhone } from "@/lib/formatting";
import { calculateStringSimilarity } from "@/lib/utils";
import { db } from "@/services/drizzle";
import { type TNewClientEntity, clients } from "@/services/drizzle/schema";
import { cashbackProgramBalances } from "@/services/drizzle/schema/cashback-programs";
import axios, { type AxiosError, type AxiosInstance } from "axios";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import z from "zod";

// 1. Schema for the Points object (inside the wallet)
const PointSchema = z.object({
	id_cartela_cliente: z.number(),
	pontos: z.number(),
	// Note: The example date "2025-05-07 01:59:18" is a SQL timestamp, not ISO-8601.
	// We use z.string() instead of z.string().datetime() to avoid validation errors.
	data: z.string(),
	tipo: z.string(),
	data_validade: z.string(),
});

// 2. Schema for the Wallet (Carteira)
const WalletSchema = z.object({
	saldo: z.number(),
	saldo_carencia: z.number(),
	pontos_vencidos: z.array(PointSchema),
	pontos_vencendo: z.array(PointSchema),
});

// 3. Schema for the Client (the individual item in the data array)
const ClientSchema = z.object({
	id_cliente: z.number(),
	nome: z.string(),
	email: z.string().optional().nullable(),
	data_cadastro: z.string().optional().nullable(),
	celular: z.string().optional().nullable(),
	data_nascimento: z.string().optional().nullable(),
	genero: z.string().optional().nullable(),

	// Nullable fields based on the example
	cep: z.string().optional().nullable(),
	endereco: z.string().optional().nullable(),
	bairro: z.string().optional().nullable(),
	cidade: z.string().optional().nullable(),
	uf: z.string().optional().nullable(),

	carteira: WalletSchema,

	receita: z.number(),
	compras: z.number(),
	primeira_compra: z.string().optional().nullable(),
	ultima_compra: z.string().optional().nullable(),

	// Achievement Stats
	conquistados_premio_fidelidade: z.number(),
	conquistados_brinde_roleta: z.number(),
	conquistados_premio_surpresa: z.number(),
	conquistados_premio_campanha: z.number(),
	conquistados_premio_game: z.number(),

	// Pending Redemption Stats
	pendente_resgate_premio_fidelidade: z.number(),
	pendente_resgate_brinde_roleta: z.number(),
	pendente_resgate_premio_surpresa: z.number(),
	pendente_resgate_premio_campanha: z.number(),
	pendente_resgate_premio_game: z.number(),

	// Redeemed Stats
	resgatado_premio_fidelidade: z.number(),
	resgatado_brinde_roleta: z.number(),
	resgatado_premio_surpresa: z.number(),
	resgatado_premio_campanha: z.number(),
	resgatado_premio_game: z.number(),

	// Expired Stats
	expirado_premio_fidelidade: z.number(),
	expirado_brinde_roleta: z.number(),
	expirado_premio_surpresa: z.number(),
	expirado_premio_campanha: z.number(),
	expirado_premio_game: z.number(),
});

// 4. Schema for the Pagination details
const PaginationDataSchema = z.object({
	current_page: z.number(),
	data: z.array(ClientSchema),
	first_page_url: z.string(),
	from: z.number().nullable(),
	last_page: z.number(),
	last_page_url: z.string(),
	next_page_url: z.string().nullable(),
	per_page: z.number(),
	prev_page_url: z.string().nullable(),
	to: z.number().nullable(),
	total: z.number(),
});

// 5. Root API Response Schema
export const FideliziApiResponseSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	data: PaginationDataSchema,
});
export type TFideliziApiResponse = z.infer<typeof FideliziApiResponseSchema>;

export async function fetchFideliziClientsByPage(page = 1): Promise<TFideliziApiResponse["data"]["data"]> {
	console.log({
		APP_TOKEN: process.env.FIDELIZI_APP_TOKEN,
		ACCESS_TOKEN: process.env.FIDELIZI_ACCESS_TOKEN,
	});
	const { data } = await axios.get("https://integracao.fidelizii.com.br/api/v4/estabelecimentos/2952/clientes", {
		headers: {
			"app-token": process.env.FIDELIZI_APP_TOKEN,
			"access-token": process.env.FIDELIZI_ACCESS_TOKEN,
		},
	});
	const parsedData = FideliziApiResponseSchema.parse(data);
	return parsedData.data.data;
}

/**
 * Delay helper function
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate Limiter com controle de burst (requisições por segundo)
 *
 * Problema: APIs frequentemente têm dois limites:
 * - Rate limit por minuto (ex: 400/min) - documentado
 * - Burst limit por segundo (ex: 5-10/s) - não documentado
 *
 * Esta implementação garante:
 * 1. Delay mínimo entre requisições (controle de burst)
 * 2. Token bucket para controle por minuto
 * 3. Retry automático com backoff quando atingir limite
 */
class RateLimiter {
	private tokens: number;
	private readonly maxTokens: number;
	private readonly refillRate: number; // tokens per ms
	private lastRefillTime: number;
	private lastRequestTime = 0;
	private readonly minDelayBetweenRequests: number; // ms entre requisições
	private requestTimestamps: number[] = [];
	private readonly windowMs: number;

	constructor(requestsPerMinute: number, options: { safetyMargin?: number; maxRequestsPerSecond?: number } = {}) {
		const { safetyMargin = 0.7, maxRequestsPerSecond = 5 } = options;

		// Apply safety margin for per-minute limit
		const safeLimit = Math.floor(requestsPerMinute * safetyMargin);
		this.maxTokens = safeLimit;
		this.tokens = safeLimit;
		this.refillRate = safeLimit / (60 * 1000); // tokens per ms
		this.lastRefillTime = Date.now();
		this.windowMs = 60 * 1000; // 1 minute sliding window

		// Burst control: minimum delay between requests
		// maxRequestsPerSecond = 4 means 250ms minimum between requests
		this.minDelayBetweenRequests = Math.ceil(1000 / maxRequestsPerSecond);
	}

	private refillTokens(): void {
		const now = Date.now();
		const timePassed = now - this.lastRefillTime;
		const tokensToAdd = timePassed * this.refillRate;
		this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
		this.lastRefillTime = now;

		// Clean old timestamps from sliding window
		const windowStart = now - this.windowMs;
		this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);
	}

	/**
	 * Calcula quanto tempo esperar antes de poder fazer a próxima requisição
	 * Considera tanto o token bucket quanto o delay mínimo entre requisições
	 */
	getWaitTime(): number {
		this.refillTokens();
		const now = Date.now();

		// Check burst limit (minimum delay between requests)
		const timeSinceLastRequest = now - this.lastRequestTime;
		const burstWaitTime = Math.max(0, this.minDelayBetweenRequests - timeSinceLastRequest);

		// Check token bucket limit
		let tokenWaitTime = 0;
		if (this.tokens < 1) {
			const tokensNeeded = 1 - this.tokens;
			tokenWaitTime = Math.ceil(tokensNeeded / this.refillRate);
		}

		// Return the maximum of both waits
		return Math.max(burstWaitTime, tokenWaitTime);
	}

	/**
	 * Consome um token e registra a requisição
	 */
	consumeToken(): void {
		this.refillTokens();
		this.tokens = Math.max(0, this.tokens - 1);
		this.lastRequestTime = Date.now();
		this.requestTimestamps.push(this.lastRequestTime);
	}

	/**
	 * Retorna estatísticas atuais do rate limiter
	 */
	getStats(): {
		tokensAvailable: number;
		requestsInWindow: number;
		maxTokens: number;
		minDelayMs: number;
	} {
		this.refillTokens();
		return {
			tokensAvailable: Math.floor(this.tokens),
			requestsInWindow: this.requestTimestamps.length,
			maxTokens: this.maxTokens,
			minDelayMs: this.minDelayBetweenRequests,
		};
	}

	/**
	 * Aguarda até que um token esteja disponível E o delay mínimo tenha passado
	 */
	async waitForToken(): Promise<void> {
		const waitTime = this.getWaitTime();
		if (waitTime > 0) {
			await delay(waitTime);
		}
		this.consumeToken();
	}

	/**
	 * Força uma pausa quando receber 429 (baseado em Retry-After ou backoff)
	 */
	async handleRateLimitHit(retryAfterSeconds?: number): Promise<void> {
		// Reset tokens to 0 since we hit the limit
		this.tokens = 0;
		this.lastRefillTime = Date.now();

		// Use Retry-After header if available, otherwise use exponential backoff base
		const waitMs = retryAfterSeconds ? retryAfterSeconds * 1000 : 30000; // Default 30s
		console.log(`[RATE-LIMITER] Rate limit atingido! Aguardando ${waitMs / 1000}s antes de continuar...`);
		await delay(waitMs);
	}
}

// Global rate limiter instances for CardapioWeb
let fideliziClientsRateLimiter: RateLimiter | null = null;

/**
 * Rate limiter para o endpoint de clientes (60 req/min)
 */
function getFiDeliziClientsRateLimiter(): RateLimiter {
	if (!fideliziClientsRateLimiter) {
		fideliziClientsRateLimiter = new RateLimiter(60, {
			safetyMargin: 1.0, // Sem margem - já é super baixo (5 req/min)
			maxRequestsPerSecond: 1, // Max 1 req/s para evitar burst
		});
	}
	return fideliziClientsRateLimiter;
}

function createFideliziClient(): AxiosInstance {
	return axios.create({
		baseURL: "https://integracao.fidelizii.com.br",
		headers: {
			"app-token": process.env.FIDELIZI_APP_TOKEN,
			"access-token": process.env.FIDELIZI_ACCESS_TOKEN,
			Accept: "application/json",
		},
	});
}

async function executeWithRateLimitAndRetry<T>(fn: () => Promise<T>, rateLimiter: RateLimiter, maxRetries = 3, context = "request"): Promise<T> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Wait for rate limiter before making request
			await rateLimiter.waitForToken();

			return await fn();
		} catch (error) {
			lastError = error as Error;
			const axiosError = error as AxiosError;

			if (axiosError.response?.status === 429) {
				// Rate limit hit - extract Retry-After if available
				const retryAfter = axiosError.response.headers["retry-after"];
				const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter as string, 10) : undefined;

				console.warn(`[FIDELIZI] 429 Too Many Requests no ${context} (tentativa ${attempt}/${maxRetries})`);

				if (attempt < maxRetries) {
					// Apply exponential backoff on top of Retry-After
					const backoffMultiplier = 2 ** (attempt - 1);
					const baseWait = retryAfterSeconds || 30;
					await rateLimiter.handleRateLimitHit(baseWait * backoffMultiplier);
					continue;
				}
			} else if (axiosError.response?.status && axiosError.response.status >= 500) {
				// Server error - retry with backoff
				console.warn(`[FIDELIZI] Erro ${axiosError.response.status} no ${context} (tentativa ${attempt}/${maxRetries})`);

				if (attempt < maxRetries) {
					const backoffMs = 2 ** attempt * 1000; // 2s, 4s, 8s
					await delay(backoffMs);
					continue;
				}
			}

			// For other errors or max retries reached, throw
			throw error;
		}
	}

	throw lastError;
}

async function getFideliziClients(client: AxiosInstance, page = 1) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", page.toString());
	searchParams.set("itens_por_pagina", "200");
	return executeWithRateLimitAndRetry(
		async () => {
			try {
				const { data } = await client.get<TFideliziApiResponse>(`/api/v4/estabelecimentos/2952/clientes?${searchParams.toString()}`);
				return FideliziApiResponseSchema.parse(data);
			} catch (error) {
				console.error(`[FIDELIZI] Erro ao buscar clientes na página ${page}:`, error);
				throw error;
			}
		},
		getFiDeliziClientsRateLimiter(), // Rate limiter específico para clients
		3,
		`clients page ${page}`,
	);
}

async function fetchAllFideliziClients() {
	const allClients: TFideliziApiResponse["data"]["data"] = [];
	let currentPage = 1;
	let totalPages = 1;
	const rateLimiter = getFiDeliziClientsRateLimiter();
	const startTime = Date.now();

	do {
		const response = await getFideliziClients(createFideliziClient(), currentPage);

		allClients.push(...response.data.data);
		totalPages = response.data.last_page;

		const stats = rateLimiter.getStats();
		const elapsed = Math.round((Date.now() - startTime) / 1000);
		const avgTimePerPage = elapsed / currentPage;
		const remainingPages = totalPages - currentPage;
		const estimatedRemaining = Math.round(avgTimePerPage * remainingPages);

		console.log(
			`[FIDELIZI] Página ${currentPage}/${totalPages} ` +
				`(${response.data.data.length} clientes) | ${elapsed}s elapsed | ~${estimatedRemaining}s restante | ` +
				`Rate: ${stats.requestsInWindow}/${stats.maxTokens} req/min (CLIENTS endpoint)`,
		);

		currentPage++;
	} while (currentPage <= totalPages);

	return allClients
		.map((c) => {
			const phoneWithoutCountryCode = c.celular ? c.celular.replace("+55", "") : null;
			const phoneFormatted = phoneWithoutCountryCode ? formatToPhone(phoneWithoutCountryCode) : null;
			const phoneFormattedAsBase = phoneWithoutCountryCode ? formatPhoneAsBase(phoneWithoutCountryCode) : null;
			// Getting the birthday date fixed (it comes in YYYY-MM-DD format, we gotta convert it to Date object)
			const birthdayDate = c.data_nascimento ? dayjs(c.data_nascimento).add(3, "hour").toDate() : null;

			return {
				idExterno: c.id_cliente.toString(),
				nome: c.nome,
				email: c.email,
				telefone: phoneFormatted,
				telefoneBase: phoneFormattedAsBase,
				dataNascimento: birthdayDate,
				localizacaoCep: c.cep ? formatToCEP(c.cep) : null,
				localizacaoEstado: c.uf,
				localizacaoCidade: c.cidade,
				localizacaoBairro: c.bairro,
				localizacaoLogradouro: c.endereco,
				saldo: c.carteira.saldo,
			};
		})
		.filter((c) => c.email !== "atendimento@fidelizi.com.br");
}

export default apiHandler({
	GET: async (req, res) => {
		const organizationId = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
		const organizationCashbackProgram = await db.query.cashbackPrograms.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
		});
		if (!organizationCashbackProgram) {
			return res.status(404).json({ error: "Programa de cashback não encontrado" });
		}

		const ensureCashbackBalanceForClient = async (clientId: string, saldo: number, logKey: string, clientLabel: string) => {
			try {
				const existingBalance = await db.query.cashbackProgramBalances.findFirst({
					where: (fields, { and, eq }) =>
						and(eq(fields.organizacaoId, organizationId), eq(fields.clienteId, clientId), eq(fields.programaId, organizationCashbackProgram.id)),
				});

				if (existingBalance) {
					await db
						.update(cashbackProgramBalances)
						.set({
							saldoValorDisponivel: saldo,
							saldoValorAcumuladoTotal: saldo,
						})
						.where(eq(cashbackProgramBalances.id, existingBalance.id));
					return;
				}

				await db.insert(cashbackProgramBalances).values({
					clienteId: clientId,
					programaId: organizationCashbackProgram.id,
					organizacaoId: organizationId,
					saldoValorDisponivel: saldo,
					saldoValorAcumuladoTotal: saldo,
					saldoValorResgatadoTotal: 0,
				});
			} catch (error) {
				console.error(`[${logKey}] Error syncing cashback balance for ${clientLabel}:`, error);
				throw error;
			}
		};

		const clientsInFidelizi = await fetchAllFideliziClients();
		console.log("FIDELIZI CLIENTS COUNT:", clientsInFidelizi.length);
		const clientsInDb = await db.query.clients.findMany({
			where: (fields, { eq }) => eq(fields.organizacaoId, "27817d9a-cb04-4704-a1f4-15b81a3610d3"),
		});
		console.log("DB CLIENTS COUNT:", clientsInDb.length);
		let identifiedClientsCount = 0;
		let notIdentifiedClientsCount = 0;
		const matches: {
			nameInFidelizi: string;
			nameInDb: string;
			birthday: string | null;
			phoneInFidelizi: string | null;
			phoneInDb: string | null;
			similarity: number;
		}[] = [];
		const nonMatches: string[] = [];
		for (const [index, fideliziClient] of clientsInFidelizi.entries()) {
			const logKey = `${index + 1}/${clientsInFidelizi.length}`;
			const equivalentClientInDb = clientsInDb.find(
				(c) => c.telefoneBase === fideliziClient.telefoneBase || calculateStringSimilarity(c.nome.toUpperCase(), fideliziClient.nome.toUpperCase()) > 80,
			);
			if (equivalentClientInDb) {
				identifiedClientsCount++;
				matches.push({
					nameInFidelizi: fideliziClient.nome,
					nameInDb: equivalentClientInDb.nome,
					birthday: fideliziClient.dataNascimento ? fideliziClient.dataNascimento.toISOString() : null,
					phoneInFidelizi: fideliziClient.telefone,
					phoneInDb: equivalentClientInDb.telefone,
					similarity: calculateStringSimilarity(fideliziClient.nome.toUpperCase(), equivalentClientInDb.nome.toUpperCase()),
				});
				console.log(`[${logKey}] Updating client ${equivalentClientInDb.nome} - ${equivalentClientInDb.telefone}`);
				try {
					await db
						.update(clients)
						.set({
							telefone: fideliziClient.telefone || equivalentClientInDb.telefone || "",
							telefoneBase: fideliziClient.telefoneBase || equivalentClientInDb.telefoneBase || "",
							email: fideliziClient.email,
							dataNascimento: fideliziClient.dataNascimento || equivalentClientInDb.dataNascimento || null,
							localizacaoCep: fideliziClient.localizacaoCep || equivalentClientInDb.localizacaoCep || "",
							localizacaoEstado: fideliziClient.localizacaoEstado || equivalentClientInDb.localizacaoEstado || "",
							localizacaoCidade: fideliziClient.localizacaoCidade || equivalentClientInDb.localizacaoCidade || "",
							localizacaoBairro: fideliziClient.localizacaoBairro || equivalentClientInDb.localizacaoBairro || "",
							localizacaoLogradouro: fideliziClient.localizacaoLogradouro || equivalentClientInDb.localizacaoLogradouro || "",
						})
						.where(eq(clients.id, equivalentClientInDb.id));
					// await ensureCashbackBalanceForClient(equivalentClientInDb.id, fideliziClient.saldo, logKey, equivalentClientInDb.nome);
				} catch (error) {
					console.error(`[${logKey}] Error updating client ${equivalentClientInDb.nome} - ${equivalentClientInDb.telefone}:`, error);
					throw error;
				}
			} else {
				console.log(`[${logKey}] Creating new client ${fideliziClient.nome} - ${fideliziClient.telefone}`);
				const newClient: TNewClientEntity = {
					organizacaoId: "27817d9a-cb04-4704-a1f4-15b81a3610d3",
					nome: fideliziClient.nome,
					email: fideliziClient.email ?? null,
					dataNascimento: fideliziClient.dataNascimento ?? null,
					telefone: fideliziClient.telefone ?? "",
					telefoneBase: fideliziClient.telefoneBase ?? "",
					localizacaoCep: fideliziClient.localizacaoCep ?? null,
					localizacaoEstado: fideliziClient.localizacaoEstado ?? null,
					localizacaoCidade: fideliziClient.localizacaoCidade ?? null,
					localizacaoBairro: fideliziClient.localizacaoBairro ?? null,
					localizacaoLogradouro: fideliziClient.localizacaoLogradouro ?? null,
				};
				try {
					const insertedClientResponse = await db.insert(clients).values(newClient).returning({ id: clients.id });
					const insertedClientId = insertedClientResponse[0]?.id;
					if (!insertedClientId) {
						throw new Error("Erro ao inserir cliente e retornar ID.");
					}
					// await ensureCashbackBalanceForClient(insertedClientId, fideliziClient.saldo, logKey, fideliziClient.nome);
				} catch (error) {
					console.error(`[${logKey}] Error creating new client ${fideliziClient.nome} - ${fideliziClient.telefone}:`, error);
					throw error;
				}
				nonMatches.push(`${fideliziClient.nome} - ${fideliziClient.telefone}`);
				notIdentifiedClientsCount++;
			}
		}

		return res.status(200).json({
			identifiedClientsCount,
			notIdentifiedClientsCount,
			matches,
			nonMatches,
		});
	},
});
