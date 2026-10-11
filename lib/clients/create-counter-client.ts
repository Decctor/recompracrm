import { ensureCashbackBalanceForClient } from "@/lib/cashback/accumulation";
import { formatPhoneAsBase, formatStringAsOnlyDigits, formatToPhone } from "@/lib/formatting";
import type { DBTransaction } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

export type TCounterClientInput = {
	nome: string;
	telefone: string;
	/** Aceite explícito de marketing (LGPD). Só `true` grava a data; ausente não é recusa, é falta de aceite. */
	marketingConsent?: boolean | null;
};

/**
 * Cadastro rápido de cliente no balcão: nome, telefone e o aceite de marketing, como o
 * autocadastro do ponto de interação. O telefone é a chave (`telefoneBase`): um segundo cadastro
 * para o mesmo número é recusado — quem chama decide se busca de novo. Havendo programa de
 * cashback ativo, o saldo nasce junto, para a primeira venda já acumular.
 */
export async function createCounterClient({
	tx,
	organizacaoId,
	canalAquisicao,
	client,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	canalAquisicao: string;
	client: TCounterClientInput;
}) {
	const nome = client.nome.trim();
	if (nome.length < 2) throw new createHttpError.BadRequest("Informe o nome do cliente.");
	const digits = formatStringAsOnlyDigits(client.telefone);
	const telefoneBase = formatPhoneAsBase(client.telefone);
	if (!telefoneBase || digits.length < 10) throw new createHttpError.BadRequest("Telefone inválido. Informe DDD e número.");

	const existing = await tx.query.clients.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.telefoneBase, telefoneBase)),
		columns: { id: true },
	});
	if (existing) throw new createHttpError.Conflict("Um cadastro já existe para este telefone.");

	const [inserted] = await tx
		.insert(clients)
		.values({
			organizacaoId,
			nome,
			telefone: formatToPhone(digits),
			telefoneBase,
			consentimentoMarketingData: client.marketingConsent === true ? new Date() : null,
			canalAquisicao,
			analiseRFMTitulo: "CLIENTES RECENTES",
		})
		.returning({ id: clients.id, nome: clients.nome, telefone: clients.telefone });
	if (!inserted) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar cliente.");

	const program = await tx.query.cashbackPrograms.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, organizacaoId), eq(fields.ativo, true)),
		columns: { id: true },
	});
	if (program) await ensureCashbackBalanceForClient({ tx, orgId: organizacaoId, clientId: inserted.id, programId: program.id });

	return inserted;
}
