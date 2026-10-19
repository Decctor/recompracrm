import { getClientLocationAddressByCEP } from "@/lib/clients/locations";
import { normalizeShopSettingsConfiguration, resolveShopDeliveryFee } from "@/lib/shop/config";
import { db } from "@/services/drizzle";
import { type TClientLocationEntity, clientLocations, clients } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";
import { roundCents } from "./terminal-cart-item";

// Modalidades de entrega na venda do terminal, com as regras do checkout web: ENTREGA exige
// cliente identificado, leva um endereço dele e a taxa da loja (`resolveShopDeliveryFee`, a mesma
// da loja digital e do PDV); COMANDA leva o número da comanda; PRESENCIAL e RETIRADA não levam nada.

/** Regra da taxa de entrega como o app a lê na configuração, para mostrar a taxa antes de cobrar. */
export type TTerminalDeliveryRules = { ativo: boolean; taxa: number; gratisAcima: number | null };

export async function loadTerminalDeliveryRules(organizationId: string): Promise<TTerminalDeliveryRules> {
	const settings = await db.query.shopSettings.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
		columns: { configuracoes: true },
	});
	if (!settings) return { ativo: false, taxa: 0, gratisAcima: null };
	const entrega = normalizeShopSettingsConfiguration(settings.configuracoes).atendimento.entrega;
	return { ativo: entrega.ativo, taxa: roundCents(Math.max(0, entrega.taxa)), gratisAcima: entrega.gratisAcima ?? null };
}

/** Taxa desta venda: só na ENTREGA, pela regra da loja sobre o subtotal dos itens. */
export async function resolveTerminalDeliveryFee({
	organizationId,
	entregaModalidade,
	subtotalItens,
}: {
	organizationId: string;
	entregaModalidade: string | null;
	subtotalItens: number;
}) {
	if (entregaModalidade !== "ENTREGA") return 0;
	const settings = await db.query.shopSettings.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
		columns: { configuracoes: true },
	});
	if (!settings) return 0;
	return resolveShopDeliveryFee({ configuracoes: normalizeShopSettingsConfiguration(settings.configuracoes), modalidade: "ENTREGA", subtotalItens });
}

export function buildTerminalAddressView(location: TClientLocationEntity) {
	const linha1 = [location.localizacaoLogradouro, location.localizacaoNumero].filter(Boolean).join(", ");
	const linha2 = [location.localizacaoBairro, [location.localizacaoCidade, location.localizacaoEstado].filter(Boolean).join("/")]
		.filter(Boolean)
		.join(" · ");
	return {
		id: location.id,
		titulo: location.titulo,
		localizacaoCep: location.localizacaoCep,
		localizacaoLogradouro: location.localizacaoLogradouro,
		localizacaoNumero: location.localizacaoNumero,
		localizacaoComplemento: location.localizacaoComplemento,
		localizacaoBairro: location.localizacaoBairro,
		localizacaoCidade: location.localizacaoCidade,
		localizacaoEstado: location.localizacaoEstado,
		// Pronto para a linha do app: "Rua das Flores, 120 · ap 32" / "Centro · Campinas/SP".
		resumo: [linha1 || location.titulo, location.localizacaoComplemento].filter(Boolean).join(" · "),
		detalhe: linha2 || null,
	};
}
export type TTerminalAddressView = ReturnType<typeof buildTerminalAddressView>;

async function requireClient(organizationId: string, clienteId: string) {
	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, clienteId), eq(clients.organizacaoId, organizationId)),
		columns: { id: true },
	});
	if (!client) throw new PaymentTerminalError(404, "NOT_FOUND", "Cliente não encontrado nesta organização.");
	return client;
}

export async function listTerminalClientAddresses({ organizationId, clienteId }: { organizationId: string; clienteId: string }) {
	await requireClient(organizationId, clienteId);
	const locations = await db.query.clientLocations.findMany({
		where: and(eq(clientLocations.organizacaoId, organizationId), eq(clientLocations.clienteId, clienteId)),
		orderBy: desc(clientLocations.dataInsercao),
		limit: 20,
	});
	return locations.map(buildTerminalAddressView);
}

/** Endereço de um CEP (ViaCEP), para o app preencher rua e bairro antes de cadastrar. */
export async function lookupTerminalCep(cep: string) {
	const digits = cep.replace(/\D/g, "");
	if (digits.length !== 8) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "CEP inválido: informe os 8 dígitos.");
	const address = await getClientLocationAddressByCEP(digits);
	if (!address) throw new PaymentTerminalError(404, "NOT_FOUND", "CEP não encontrado. Confira os números.");
	return address;
}

export type TTerminalAddressInput = {
	titulo?: string | null;
	localizacaoCep: string;
	localizacaoLogradouro: string;
	localizacaoNumero: string;
	localizacaoComplemento?: string | null;
	localizacaoBairro?: string | null;
};

/**
 * Cadastra um endereço do cliente no balcão. Cidade e estado vêm do CEP (o app não digita), rua e
 * bairro do que o operador confirmou — CEP de cidade pequena não tem rua no ViaCEP.
 */
export async function createTerminalClientAddress({
	organizationId,
	clienteId,
	input,
}: {
	organizationId: string;
	clienteId: string;
	input: TTerminalAddressInput;
}) {
	await requireClient(organizationId, clienteId);
	const byCep = await lookupTerminalCep(input.localizacaoCep);
	const logradouro = input.localizacaoLogradouro.trim() || byCep.localizacaoLogradouro;
	if (!logradouro) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Informe a rua do endereço.");
	if (!input.localizacaoNumero.trim()) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Informe o número do endereço.");
	const [location] = await db
		.insert(clientLocations)
		.values({
			organizacaoId: organizationId,
			clienteId,
			titulo: input.titulo?.trim() || "Endereço",
			localizacaoCep: byCep.localizacaoCep,
			localizacaoLogradouro: logradouro,
			localizacaoNumero: input.localizacaoNumero.trim(),
			localizacaoComplemento: input.localizacaoComplemento?.trim() || null,
			localizacaoBairro: input.localizacaoBairro?.trim() || byCep.localizacaoBairro,
			localizacaoCidade: byCep.localizacaoCidade,
			localizacaoEstado: byCep.localizacaoEstado,
		})
		.returning();
	if (!location) throw new createHttpError.InternalServerError("Erro ao cadastrar o endereço.");
	return buildTerminalAddressView(location);
}

/** Endereço informado na venda: precisa ser do cliente da venda. */
export async function requireTerminalSaleAddress({
	organizationId,
	clienteId,
	entregaLocalizacaoId,
}: {
	organizationId: string;
	clienteId: string;
	entregaLocalizacaoId: string;
}) {
	const location = await db.query.clientLocations.findFirst({
		where: and(
			eq(clientLocations.id, entregaLocalizacaoId),
			eq(clientLocations.organizacaoId, organizationId),
			eq(clientLocations.clienteId, clienteId),
		),
		columns: { id: true },
	});
	if (!location) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "O endereço de entrega não é deste cliente.");
	return location.id;
}
