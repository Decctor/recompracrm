import { formatPhoneAsBase } from "@/lib/formatting";
import type { DBTransaction } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

type LinkPartnerToClientParams = {
	tx: DBTransaction;
	orgId: string;
	partner: {
		nome?: string | null;
		cpfCnpj?: string | null;
		telefone?: string | null;
		telefoneBase?: string | null;
	};
	manualClientId?: string | null;
	createClientIfNotFound?: boolean;
};

type LinkPartnerToClientResult = {
	clientId: string | null;
	source: "MANUAL" | "CPF_CNPJ" | "PHONE" | "NAME" | "CREATED" | "UNRESOLVED";
};

function normalizeDocument(value?: string | null) {
	return (value ?? "").replace(/\D/g, "").trim();
}

function normalizeName(value?: string | null) {
	return (value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeNullableString(value?: string | null) {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

export async function linkPartnerToClient({
	tx,
	orgId,
	partner,
	manualClientId,
	createClientIfNotFound = false,
}: LinkPartnerToClientParams): Promise<LinkPartnerToClientResult> {
	const normalizedManualClientId = normalizeNullableString(manualClientId);
	if (normalizedManualClientId) {
		const manualClient = await tx.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, normalizedManualClientId), eq(fields.organizacaoId, orgId)),
			columns: { id: true },
		});

		if (!manualClient) {
			throw new Error("Cliente informado para vínculo manual não foi encontrado na organização.");
		}

		return { clientId: manualClient.id, source: "MANUAL" };
	}

	const normalizedCpfCnpj = normalizeDocument(partner.cpfCnpj);
	if (normalizedCpfCnpj) {
		const matchedByDocument = await tx.query.clients.findFirst({
			where: and(
				eq(clients.organizacaoId, orgId),
				sql`regexp_replace(coalesce(${clients.cpfCnpj}, ''), '\D', '', 'g') = ${normalizedCpfCnpj}`,
			),
			columns: { id: true },
		});

		if (matchedByDocument?.id) {
			return { clientId: matchedByDocument.id, source: "CPF_CNPJ" };
		}
	}

	const normalizedPhoneBase = normalizeNullableString(partner.telefoneBase) ?? formatPhoneAsBase(partner.telefone ?? "");
	if (normalizedPhoneBase) {
		const matchedByPhone = await tx.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.telefoneBase, normalizedPhoneBase)),
			columns: { id: true },
		});

		if (matchedByPhone?.id) {
			return { clientId: matchedByPhone.id, source: "PHONE" };
		}
	}

	const normalizedPartnerName = normalizeName(partner.nome);
	if (normalizedPartnerName) {
		const matchedByName = await tx.query.clients.findFirst({
			where: and(
				eq(clients.organizacaoId, orgId),
				sql`regexp_replace(lower(trim(coalesce(${clients.nome}, ''))), '\s+', ' ', 'g') = ${normalizedPartnerName}`,
			),
			columns: { id: true },
		});

		if (matchedByName?.id) {
			return { clientId: matchedByName.id, source: "NAME" };
		}
	}

	if (!createClientIfNotFound) {
		return { clientId: null, source: "UNRESOLVED" };
	}

	const insertedClient = await tx
		.insert(clients)
		.values({
			organizacaoId: orgId,
			nome: normalizeNullableString(partner.nome) ?? "PARCEIRO NÃO IDENTIFICADO",
			cpfCnpj: normalizeNullableString(partner.cpfCnpj),
			telefone: normalizeNullableString(partner.telefone) ?? "",
			telefoneBase: normalizedPhoneBase ?? "",
			canalAquisicao: "PARCEIRO",
		})
		.returning({ id: clients.id });

	return { clientId: insertedClient[0]?.id ?? null, source: "CREATED" };
}
