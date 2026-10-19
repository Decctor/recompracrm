import { type DBTransaction, db } from "@/services/drizzle";
import { paymentAttempts } from "@/services/drizzle/schema";
import type { TPaymentAttemptNotApprovedReasonEnum, TPaymentAttemptStatusEnum } from "@/schemas/enums";
import { and, desc, eq } from "drizzle-orm";

// Pendências de cobrança na maquininha dentro de um turno de caixa (P9 de
// recompracrm-pos-android/docs/11). Uma cobrança pendente na maquininha entra no esperado do método
// assim que a venda é confirmada, mas só vira dinheiro quando o terminal aprova — fechar o caixa
// com ela em aberto congelaria um recebível que pode virar recusa ou troca de método.

export type TPaymentTerminalPendencyKind = "EM_ANDAMENTO" | "INCERTA" | "NAO_APROVADA_PENDENTE";

export type TPaymentTerminalPendency = {
	tentativaId: string;
	vendaId: string;
	status: TPaymentAttemptStatusEnum;
	motivo: TPaymentAttemptNotApprovedReasonEnum | null;
	valor: number;
	dispositivoNome: string;
	clienteNome: string | null;
	tipo: TPaymentTerminalPendencyKind;
	/** Em andamento bloqueia o fechamento: o resultado chega em minutos. Incerta/não aprovada só avisam. */
	bloqueiaFechamento: boolean;
};

export const REVERSED_TRANSACTION_STATUSES = ["CANCELADO", "ESTORNADO"] as const;

// Pura, para teste: decide se a última tentativa de uma venda ainda é pendência do turno.
export function classifyPaymentTerminalPendency({
	status,
	transacaoPendente,
}: {
	status: TPaymentAttemptStatusEnum;
	// A transação vinculada ainda está sem efetivação e não foi cancelada/estornada.
	transacaoPendente: boolean;
}): { tipo: TPaymentTerminalPendencyKind; bloqueiaFechamento: boolean } | null {
	switch (status) {
		case "CRIADA":
		case "PROCESSANDO":
		case "APROVADA_EFETIVACAO_PENDENTE":
			return { tipo: "EM_ANDAMENTO", bloqueiaFechamento: true };
		case "RESULTADO_INCERTO":
			return { tipo: "INCERTA", bloqueiaFechamento: false };
		case "NAO_APROVADA":
			// Recusa/cancelamento com a transação ainda pendente: a venda espera outro método ou
			// cancelamento. Avisa, não bloqueia — resolver pode levar mais que o turno.
			return transacaoPendente ? { tipo: "NAO_APROVADA_PENDENTE", bloqueiaFechamento: false } : null;
		case "CONSUMIDA":
			return null;
	}
}

export async function listSessionPaymentTerminalPendencies({
	orgId,
	sessaoVendaId,
	trx,
}: {
	orgId: string;
	sessaoVendaId: string;
	trx?: DBTransaction;
}): Promise<TPaymentTerminalPendency[]> {
	const database = trx ?? db;
	// Vendas do turno (a venda carimba a sessão; a tentativa herda e não muda).
	const rows = await database.query.paymentAttempts.findMany({
		where: and(eq(paymentAttempts.organizacaoId, orgId), eq(paymentAttempts.sessaoVendaId, sessaoVendaId)),
		orderBy: desc(paymentAttempts.dataInsercao),
		with: {
			dispositivo: { columns: { nome: true } },
			venda: { columns: { id: true, statusVenda: true }, with: { cliente: { columns: { nome: true } } } },
			transacaoFinanceira: { columns: { dataEfetivacao: true, provedorStatus: true } },
		},
	});

	// Só a última tentativa de cada venda conta: as anteriores foram canceladas pela reatribuição.
	const latestBySale = new Map<string, (typeof rows)[number]>();
	for (const row of rows) if (!latestBySale.has(row.vendaId)) latestBySale.set(row.vendaId, row);

	const pendencies: TPaymentTerminalPendency[] = [];
	for (const row of latestBySale.values()) {
		if (row.venda.statusVenda === "CANCELADA") continue;
		const transaction = row.transacaoFinanceira;
		const transacaoPendente =
			!!transaction && !transaction.dataEfetivacao && !(REVERSED_TRANSACTION_STATUSES as readonly string[]).includes(transaction.provedorStatus ?? "");
		const classification = classifyPaymentTerminalPendency({ status: row.status, transacaoPendente });
		if (!classification) continue;
		pendencies.push({
			tentativaId: row.id,
			vendaId: row.vendaId,
			status: row.status,
			motivo: row.motivoNaoAprovacao,
			valor: row.valor,
			dispositivoNome: row.dispositivo.nome,
			clienteNome: row.venda.cliente?.nome ?? null,
			...classification,
		});
	}
	return pendencies;
}
