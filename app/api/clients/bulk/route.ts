import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatPhoneAsBase, formatStringAsOnlyDigits, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { BulkClientImportInputSchema, type TBulkClientImportInput } from "@/schemas/clients";
import { eq } from "drizzle-orm";
import { db } from "@/services/drizzle";
import { type TNewClientEntity, cashbackProgramBalances, clients } from "@/services/drizzle/schema";
import createHttpError from "http-errors";
import type z from "zod";

type PostResponse = {
	data: {
		insertedCount: number;
		updatedCount: number;
		skippedCount: number;
		errors: Array<{ row: number; message: string }>;
	};
	message: string;
};
export type TBulkCreateClientsInput = z.infer<typeof BulkClientImportInputSchema>;

function normalizeOptionalText(value: string | null | undefined) {
	const normalized = value?.trim();
	if (!normalized) return null;
	return normalized;
}

function normalizeCpfCnpj(value: string | null | undefined) {
	const digitsOnly = formatStringAsOnlyDigits(value ?? "");
	if (!digitsOnly) return "";
	return digitsOnly;
}

function mergeField<T>(currentValue: T, nextValue: T) {
	if (nextValue === null || nextValue === undefined) return currentValue;
	if (typeof nextValue === "string" && nextValue.trim() === "") return currentValue;
	return nextValue;
}

type TExistingClientLookup = {
	id: string;
	nome: string;
	cpfCnpj: string | null;
	telefone: string;
	telefoneBase: string;
	email: string | null;
	dataNascimento: Date | null;
	canalAquisicao: string | null;
	localizacaoCidade: string | null;
	localizacaoEstado: string | null;
	localizacaoBairro: string | null;
	localizacaoCep: string | null;
};

type TClientInsertPayload = {
	organizacaoId: TNewClientEntity["organizacaoId"];
	autorId: TNewClientEntity["autorId"];
	nome: TNewClientEntity["nome"];
	cpfCnpj: TNewClientEntity["cpfCnpj"];
	telefone: TNewClientEntity["telefone"];
	telefoneBase: TNewClientEntity["telefoneBase"];
	email: TNewClientEntity["email"];
	dataNascimento: TNewClientEntity["dataNascimento"];
	canalAquisicao: TNewClientEntity["canalAquisicao"];
	localizacaoCidade: TNewClientEntity["localizacaoCidade"];
	localizacaoEstado: TNewClientEntity["localizacaoEstado"];
	localizacaoBairro: TNewClientEntity["localizacaoBairro"];
	localizacaoCep: TNewClientEntity["localizacaoCep"];
	dataInsercao: TNewClientEntity["dataInsercao"];
};

type TClientUpdatePayload = {
	id: string;
	data: Partial<{
		nome: TNewClientEntity["nome"];
		cpfCnpj: TNewClientEntity["cpfCnpj"];
		telefone: TNewClientEntity["telefone"];
		telefoneBase: TNewClientEntity["telefoneBase"];
		email: TNewClientEntity["email"];
		dataNascimento: TNewClientEntity["dataNascimento"];
		canalAquisicao: TNewClientEntity["canalAquisicao"];
		localizacaoCidade: TNewClientEntity["localizacaoCidade"];
		localizacaoEstado: TNewClientEntity["localizacaoEstado"];
		localizacaoBairro: TNewClientEntity["localizacaoBairro"];
		localizacaoCep: TNewClientEntity["localizacaoCep"];
	}>;
};

async function bulkCreateClients({ input, sessionUser }: { input: TBulkCreateClientsInput; sessionUser: TAuthUserSession }) {
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const existingClients = await db.query.clients.findMany({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
		columns: {
			id: true,
			nome: true,
			cpfCnpj: true,
			telefone: true,
			telefoneBase: true,
			email: true,
			dataNascimento: true,
			canalAquisicao: true,
			localizacaoCidade: true,
			localizacaoEstado: true,
			localizacaoBairro: true,
			localizacaoCep: true,
		},
	});

	const existingById = new Map<string, TExistingClientLookup>();
	const existingByCpfCnpj = new Map<string, string>();
	const existingByPhoneBase = new Map<string, string>();

	for (const existingClient of existingClients) {
		const clientLookup: TExistingClientLookup = {
			id: existingClient.id,
			nome: existingClient.nome,
			cpfCnpj: existingClient.cpfCnpj,
			telefone: existingClient.telefone,
			telefoneBase: existingClient.telefoneBase,
			email: existingClient.email,
			dataNascimento: existingClient.dataNascimento,
			canalAquisicao: existingClient.canalAquisicao,
			localizacaoCidade: existingClient.localizacaoCidade,
			localizacaoEstado: existingClient.localizacaoEstado,
			localizacaoBairro: existingClient.localizacaoBairro,
			localizacaoCep: existingClient.localizacaoCep,
		};
		existingById.set(existingClient.id, clientLookup);

		const cpfKey = normalizeCpfCnpj(existingClient.cpfCnpj);
		if (cpfKey && !existingByCpfCnpj.has(cpfKey)) existingByCpfCnpj.set(cpfKey, existingClient.id);

		const phoneKey = normalizeOptionalText(existingClient.telefoneBase) ?? "";
		if (phoneKey && !existingByPhoneBase.has(phoneKey)) existingByPhoneBase.set(phoneKey, existingClient.id);
	}

	const seenCpfCnpjInSheet = new Map<string, number>();
	const seenPhoneInSheet = new Map<string, number>();

	const clientsToInsert: TClientInsertPayload[] = [];
	const clientsToUpdate: TClientUpdatePayload[] = [];
	const errors: Array<{ row: number; message: string }> = [];
	let skippedCount = 0;

	for (let i = 0; i < input.clients.length; i++) {
		const client = input.clients[i];
		const rowNumber = i + 2; // +2 because row 1 is header, and array is 0-indexed

		// Skip if nome is empty or just whitespace
		const nome = normalizeOptionalText(client.nome);
		if (!nome) {
			errors.push({ row: rowNumber, message: "Nome é obrigatório" });
			skippedCount++;
			continue;
		}

		const cpfCnpjDigits = normalizeCpfCnpj(client.cpfCnpj ?? null);
		const cpfCnpj = cpfCnpjDigits ? formatToCPForCNPJ(cpfCnpjDigits) : null;
		const telefone = formatToPhone(normalizeOptionalText(client.telefone ?? null) ?? "");
		const telefoneBase = formatPhoneAsBase(telefone ?? "");
		const email = normalizeOptionalText(client.email ?? null);
		const canalAquisicao = normalizeOptionalText(client.canalAquisicao ?? null);
		const localizacaoCidade = normalizeOptionalText(client.localizacaoCidade ?? null);
		const localizacaoEstado = normalizeOptionalText(client.localizacaoEstado ?? null);
		const localizacaoBairro = normalizeOptionalText(client.localizacaoBairro ?? null);
		const localizacaoCep = normalizeOptionalText(client.localizacaoCep ?? null);

		if (cpfCnpjDigits) {
			const duplicateCpfRow = seenCpfCnpjInSheet.get(cpfCnpjDigits);
			if (duplicateCpfRow) {
				errors.push({
					row: rowNumber,
					message: `CPF/CNPJ duplicado na planilha (linha ${duplicateCpfRow}): ${cpfCnpj}`,
				});
				skippedCount++;
				continue;
			}
		}

		if (telefoneBase) {
			const duplicatePhoneRow = seenPhoneInSheet.get(telefoneBase);
			if (duplicatePhoneRow) {
				errors.push({
					row: rowNumber,
					message: `Telefone duplicado na planilha (linha ${duplicatePhoneRow}): ${telefone}`,
				});
				skippedCount++;
				continue;
			}
		}

		const matchedByCpfId = cpfCnpjDigits ? existingByCpfCnpj.get(cpfCnpjDigits) : undefined;
		const matchedByPhoneId = telefoneBase ? existingByPhoneBase.get(telefoneBase) : undefined;

		if (matchedByCpfId && matchedByPhoneId && matchedByCpfId !== matchedByPhoneId) {
			console.log(`Conflict of identity: CPF/CNPJ and phone point to different clients. Row ${rowNumber}`, {
				cpfCnpjDigits,
				telefoneBase,
				matchedByCpfId,
				matchedByPhoneId,
			});
			errors.push({
				row: rowNumber,
				message: "Conflito de identidade: CPF/CNPJ e telefone apontam para clientes diferentes.",
			});
			skippedCount++;
			continue;
		}

		const matchedClientId = matchedByCpfId ?? matchedByPhoneId;

		if (!matchedClientId) {
			clientsToInsert.push({
				organizacaoId: userOrgId,
				autorId: sessionUser.user.id,
				nome,
				cpfCnpj,
				telefone: telefone,
				telefoneBase,
				email,
				dataNascimento: client.dataNascimento ?? null,
				canalAquisicao,
				localizacaoCidade,
				localizacaoEstado,
				localizacaoBairro,
				localizacaoCep,
				dataInsercao: new Date(),
			});
			if (cpfCnpjDigits) seenCpfCnpjInSheet.set(cpfCnpjDigits, rowNumber);
			if (telefoneBase) seenPhoneInSheet.set(telefoneBase, rowNumber);
			continue;
		}

		const existingClient = existingById.get(matchedClientId);
		if (!existingClient) {
			errors.push({ row: rowNumber, message: "Cliente para atualização não encontrado no cache interno." });
			skippedCount++;
			continue;
		}

		const mergedCpf = mergeField(existingClient.cpfCnpj, cpfCnpj);
		const mergedTelefone = mergeField(existingClient.telefone, telefone) ?? existingClient.telefone;
		const mergedTelefoneBase = formatPhoneAsBase(mergedTelefone ?? "");

		clientsToUpdate.push({
			id: existingClient.id,
			data: {
				nome: mergeField(existingClient.nome, nome),
				cpfCnpj: mergedCpf,
				telefone: mergedTelefone,
				telefoneBase: mergedTelefoneBase,
				email: mergeField(existingClient.email, email),
				dataNascimento: mergeField(existingClient.dataNascimento, client.dataNascimento ?? null),
				canalAquisicao: mergeField(existingClient.canalAquisicao, canalAquisicao),
				localizacaoCidade: mergeField(existingClient.localizacaoCidade, localizacaoCidade),
				localizacaoEstado: mergeField(existingClient.localizacaoEstado, localizacaoEstado),
				localizacaoBairro: mergeField(existingClient.localizacaoBairro, localizacaoBairro),
				localizacaoCep: mergeField(existingClient.localizacaoCep, localizacaoCep),
			},
		});

		const mergedCpfDigits = normalizeCpfCnpj(mergedCpf);
		if (mergedCpfDigits) seenCpfCnpjInSheet.set(mergedCpfDigits, rowNumber);
		if (mergedTelefoneBase) seenPhoneInSheet.set(mergedTelefoneBase, rowNumber);
	}

	let insertedCount = 0;
	let updatedCount = 0;
	if (clientsToInsert.length > 0 || clientsToUpdate.length > 0) {
		await db.transaction(async (tx) => {
			// Check if a cashback program exists for this organization
			const existingCashbackProgram = await tx.query.cashbackPrograms.findFirst({
				where: (fields, { eq }) => eq(fields.organizacaoId, userOrgId),
				columns: { id: true },
			});

			// Insert clients in batches of 100 to avoid database limits
			const BATCH_SIZE = 100;
			const insertedClientIds: string[] = [];

			for (let i = 0; i < clientsToInsert.length; i += BATCH_SIZE) {
				const batch = clientsToInsert.slice(i, i + BATCH_SIZE);
				const inserted = await tx.insert(clients).values(batch).returning({ id: clients.id });
				insertedClientIds.push(...inserted.map((c) => c.id));
				insertedCount += batch.length;
			}

			for (const clientUpdate of clientsToUpdate) {
				const updated = await tx.update(clients).set(clientUpdate.data).where(eq(clients.id, clientUpdate.id)).returning({ id: clients.id });
				if (updated.length > 0) updatedCount += 1;
			}

			// If a cashback program exists, create balances for all newly inserted clients
			if (existingCashbackProgram && insertedClientIds.length > 0) {
				const balancesToInsert = insertedClientIds.map((clientId) => ({
					organizacaoId: userOrgId,
					clienteId: clientId,
					programaId: existingCashbackProgram.id,
				}));

				for (let i = 0; i < balancesToInsert.length; i += BATCH_SIZE) {
					const batch = balancesToInsert.slice(i, i + BATCH_SIZE);
					await tx.insert(cashbackProgramBalances).values(batch);
				}
			}
		});
	}

	return {
		data: {
			insertedCount,
			updatedCount,
			skippedCount,
			errors,
		},
		message: (() => {
			if (insertedCount === 0 && updatedCount === 0) return "Nenhum cliente foi processado.";

			const parts = [];
			if (insertedCount > 0) parts.push(`${insertedCount} cliente(s) importado(s)`);
			if (updatedCount > 0) parts.push(`${updatedCount} cliente(s) atualizado(s)`);

			return `${parts.join(" e ")} com sucesso.${skippedCount > 0 ? ` ${skippedCount} registro(s) ignorado(s).` : ""}`;
		})(),
	};
}
export type TBulkCreateClientsOutput = Awaited<ReturnType<typeof bulkCreateClients>>;
const bulkCreateClientsRoute: PagesRouteHandler<PostResponse> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	assertCanManageClientBase(sessionUser);

	const input = BulkClientImportInputSchema.parse(req.body) as TBulkClientImportInput;

	const response = await bulkCreateClients({ input, sessionUser });

	return res.status(201).json(response);
};

const routeHandlers = {
	POST: bulkCreateClientsRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
