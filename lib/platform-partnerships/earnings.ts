import {
	PLATFORM_PARTNER_PAYOUT_DAY,
	PLATFORM_PARTNER_PROJECTION_INVOICES,
	PLATFORM_PARTNER_YEARLY_INVOICE_BPS,
	getPlatformPartnerCommissionBps,
} from "@/lib/platform-partnerships/constants";

/**
 * Regras de ganhos do painel do parceiro, sem acesso a banco: as rotas buscam as linhas e passam
 * para cá. Fica isolado para que início, loja e pagamento contem a mesma história e para que dê
 * para testar sem Postgres (`earnings.test.ts`).
 *
 * Calendário: São Paulo não tem horário de verão desde 2019, então o fuso da operação é UTC-3 fixo.
 * Todo "dia" e "mês" aqui é o do calendário local; as datas voltam como instantes UTC (meio-dia
 * local, para nenhum formatador empurrar a data para o dia vizinho).
 */
const OPERATION_UTC_OFFSET_HOURS = -3;

type TLocalDate = { year: number; month: number; day: number }; // month 0-11

function toLocal(date: Date): TLocalDate {
	const shifted = new Date(date.getTime() + OPERATION_UTC_OFFSET_HOURS * 3600_000);
	return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** Meio-dia local do dia informado, como instante UTC. Aceita mês fora de 0-11 (rola o ano). */
function localNoon(year: number, month: number, day: number) {
	return new Date(Date.UTC(year, month, day, 12 - OPERATION_UTC_OFFSET_HOURS));
}

/** Chave "YYYY-MM" do mês local. */
export function getLocalMonthKey(date: Date) {
	const local = toLocal(date);
	return `${local.year}-${String(local.month + 1).padStart(2, "0")}`;
}

function addLocalMonths(date: Date, months: number) {
	const local = toLocal(date);
	const target = localNoon(local.year, local.month + months, 1);
	const lastDay = toLocal(localNoon(local.year, local.month + months + 1, 0)).day;
	const targetLocal = toLocal(target);
	return localNoon(targetLocal.year, targetLocal.month, Math.min(local.day, lastDay));
}

// ---------------------------------------------------------------------------------------------
// Calendário de pagamento
// ---------------------------------------------------------------------------------------------

/** Dia de PIX que paga uma comissão elegível nesta data: dia 10 do mês seguinte ao da elegibilidade. */
export function getPayoutDateForEligibility(dataElegibilidade: Date) {
	const local = toLocal(dataElegibilidade);
	return localNoon(local.year, local.month + 1, PLATFORM_PARTNER_PAYOUT_DAY);
}

/** Próximo dia de PIX a partir de agora (o próprio dia 10 ainda conta como "próximo"). */
export function getNextPayoutDate(now: Date) {
	const local = toLocal(now);
	if (local.day <= PLATFORM_PARTNER_PAYOUT_DAY) return localNoon(local.year, local.month, PLATFORM_PARTNER_PAYOUT_DAY);
	return localNoon(local.year, local.month + 1, PLATFORM_PARTNER_PAYOUT_DAY);
}

export function getFollowingPayoutDate(payoutDate: Date) {
	const local = toLocal(payoutDate);
	return localNoon(local.year, local.month + 1, PLATFORM_PARTNER_PAYOUT_DAY);
}

/** Mês de elegibilidade que um dia de PIX paga (o mês anterior ao do PIX), como chave "YYYY-MM". */
export function getPayoutCompetenceMonthKey(payoutDate: Date) {
	const local = toLocal(payoutDate);
	return getLocalMonthKey(localNoon(local.year, local.month - 1, 1));
}

/** Início e fim (inclusive) do mês local anterior ao de `reference`, como instantes UTC. */
export function getPreviousLocalMonthRange(reference: Date) {
	const local = toLocal(reference);
	const offsetMs = OPERATION_UTC_OFFSET_HOURS * 3600_000;
	const start = new Date(Date.UTC(local.year, local.month - 1, 1) - offsetMs);
	const end = new Date(Date.UTC(local.year, local.month, 1) - offsetMs - 1);
	return { start, end };
}

// ---------------------------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------------------------

export type TEarningsCommission = {
	id: string;
	referralId: string;
	payoutId: string | null;
	numeroInvoiceAssinatura: number;
	valorInvoiceBrutoCentavos: number;
	valorBaseComissionavelCentavos: number;
	percentualComissaoBps: number;
	valorComissaoCentavos: number;
	ajusteOrigemCommissionId: string | null;
	status: "PENDENTE" | "APROVADA" | "CANCELADA" | "PAGA";
	dataElegibilidade: Date;
	dataInsercao: Date;
};

export type TEarningsPayout = {
	id: string;
	status: "RASCUNHO" | "APROVADO" | "PAGO" | "CANCELADO";
	valorTotalCentavos: number;
	dataPrevista: Date | null;
	dataPagamento: Date | null;
	competenciaInicio: Date;
	competenciaFim: Date;
	dataInsercao: Date;
};

const isOpenCommission = (commission: TEarningsCommission) => commission.status === "PENDENTE" || commission.status === "APROVADA";
// Ajustes não são fatura: entram nos valores, mas não contam na trilha de mensalidades.
const isInvoiceCommission = (commission: TEarningsCommission) => commission.ajusteOrigemCommissionId === null;

/**
 * Dia de PIX em que a comissão cai. Paga: a data do pagamento. Em aberto: a data prevista do payout
 * em que já entrou ou, sem payout, o dia 10 do mês seguinte à elegibilidade — e nunca antes do
 * próximo PIX, porque um PIX passado não paga mais nada.
 */
export function getCommissionPayoutDate({
	commission,
	payoutsById,
	nextPayoutDate,
}: {
	commission: TEarningsCommission;
	payoutsById: Map<string, TEarningsPayout>;
	nextPayoutDate: Date;
}) {
	const payout = commission.payoutId ? payoutsById.get(commission.payoutId) : undefined;
	if (commission.status === "PAGA") return payout?.dataPagamento ?? payout?.dataPrevista ?? getPayoutDateForEligibility(commission.dataElegibilidade);
	const scheduled = payout?.dataPrevista ?? getPayoutDateForEligibility(commission.dataElegibilidade);
	return scheduled.getTime() < nextPayoutDate.getTime() ? nextPayoutDate : scheduled;
}

function sumCommissions(commissions: TEarningsCommission[]) {
	return commissions.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);
}

// ---------------------------------------------------------------------------------------------
// Lojas indicadas
// ---------------------------------------------------------------------------------------------

export type TEarningsOrganization = {
	id: string;
	nome: string;
	assinaturaPlano: string | null;
	stripeSubscriptionStatus: string | null;
	periodoTesteFim: Date | null;
	assinaturaPeriodoPagoFim: Date | null;
};

export type TEarningsReferral = {
	id: string;
	organizacaoNomeSnapshot: string | null;
	dataInsercao: Date;
	organizacao: TEarningsOrganization | null;
	commissions: TEarningsCommission[];
};

export type TPartnerStoreSituation = "ATIVA" | "EM_TESTE" | "EM_ATRASO" | "CANCELADA" | "SEM_ASSINATURA" | "EXCLUIDA";

export function getStoreSituation({ organizacao, now }: { organizacao: TEarningsOrganization | null; now: Date }): TPartnerStoreSituation {
	if (!organizacao) return "EXCLUIDA";
	switch (organizacao.stripeSubscriptionStatus) {
		case "active":
			return "ATIVA";
		case "trialing":
			return "EM_TESTE";
		case "past_due":
		case "unpaid":
		case "incomplete":
			return "EM_ATRASO";
		case "canceled":
		case "incomplete_expired":
			return "CANCELADA";
		default:
			if (organizacao.periodoTesteFim && organizacao.periodoTesteFim.getTime() > now.getTime()) return "EM_TESTE";
			return "SEM_ASSINATURA";
	}
}

export function getStoreInitials(nome: string) {
	const words = nome
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((word) => word.length > 0 && !["de", "da", "do", "dos", "das", "e"].includes(word.toLowerCase()));
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	// Duas primeiras palavras, sem acento: "Ótica Visão Clara" → "OV".
	return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export type TPartnerInstallmentSituation = "PAGA" | "PROXIMA" | "EM_ATRASO" | "FUTURA";

export type TPartnerStoreInstallment = {
	numero: number;
	percentualComissaoBps: number;
	situacao: TPartnerInstallmentSituation;
	/** Valor real da comissão (paga/lançada) ou projetado a partir da base da loja. `null` sem base conhecida. */
	valorComissaoCentavos: number | null;
	valorFaturaCentavos: number | null;
	/** Data da fatura: real (lançamento da comissão) ou prevista. */
	dataFatura: Date | null;
	/** Dia de PIX em que a comissão desta mensalidade cai (ou caiu). */
	dataPix: Date | null;
	comissaoId: string | null;
	comissaoStatus: TEarningsCommission["status"] | null;
};

export type TPartnerStore = {
	id: string;
	nome: string;
	iniciais: string;
	plano: string | null;
	periodicidade: "MENSAL" | "ANUAL" | null;
	situacao: TPartnerStoreSituation;
	testeFim: Date | null;
	dataEntrada: Date;
	faturasPagas: number;
	valorGanhoCentavos: number;
	valorProjetado12MesesCentavos: number | null;
	proximaMensalidade: TPartnerStoreInstallment | null;
};

/**
 * Monta a loja e sua trilha de mensalidades. `fallbackBaseCentavos` é o preço mensal do plano da
 * loja: vale para projetar enquanto ela não tem nenhuma fatura (em teste). Depois da primeira, a
 * base é a da última fatura — é ela que reflete desconto, cupom e troca de plano.
 */
export function buildPartnerStore({
	referral,
	fallbackBaseCentavos,
	payoutsById,
	now,
	trackLength = 6,
}: {
	referral: TEarningsReferral;
	fallbackBaseCentavos: number | null;
	payoutsById: Map<string, TEarningsPayout>;
	now: Date;
	trackLength?: number;
}): TPartnerStore & { trilha: TPartnerStoreInstallment[] } {
	const nextPayoutDate = getNextPayoutDate(now);
	const situacao = getStoreSituation({ organizacao: referral.organizacao, now });
	const valid = referral.commissions.filter((commission) => commission.status !== "CANCELADA");
	const invoices = valid.filter(isInvoiceCommission).sort((a, b) => a.numeroInvoiceAssinatura - b.numeroInvoiceAssinatura);
	const lastInvoice = invoices.at(-1) ?? null;
	const anual = invoices.some((commission) => commission.percentualComissaoBps === PLATFORM_PARTNER_YEARLY_INVOICE_BPS);
	const periodicidade: TPartnerStore["periodicidade"] = invoices.length === 0 ? null : anual ? "ANUAL" : "MENSAL";
	const baseCentavos = lastInvoice?.valorBaseComissionavelCentavos ?? fallbackBaseCentavos;
	const faturasPagas = lastInvoice?.numeroInvoiceAssinatura ?? 0;
	const acceptsNewInvoices = situacao === "ATIVA" || situacao === "EM_TESTE" || situacao === "EM_ATRASO";

	// Próxima fatura: fim do período pago (ativa/atraso) ou fim do teste. Dali em diante, mês a mês.
	const nextInvoiceDate =
		situacao === "EM_TESTE"
			? (referral.organizacao?.periodoTesteFim ?? null)
			: acceptsNewInvoices
				? (referral.organizacao?.assinaturaPeriodoPagoFim ?? null)
				: null;

	const byNumber = new Map(invoices.map((commission) => [commission.numeroInvoiceAssinatura, commission]));
	const buildInstallment = (numero: number): TPartnerStoreInstallment => {
		const commission = byNumber.get(numero);
		const percentualComissaoBps = commission?.percentualComissaoBps ?? getPlatformPartnerCommissionBps({ numeroInvoiceAssinatura: numero, anual });
		if (commission) {
			return {
				numero,
				percentualComissaoBps,
				situacao: "PAGA",
				valorComissaoCentavos: commission.valorComissaoCentavos,
				valorFaturaCentavos: commission.valorInvoiceBrutoCentavos,
				dataFatura: commission.dataInsercao,
				dataPix: getCommissionPayoutDate({ commission, payoutsById, nextPayoutDate }),
				comissaoId: commission.id,
				comissaoStatus: commission.status,
			};
		}
		const monthsAhead = numero - faturasPagas - 1;
		const dataFatura = nextInvoiceDate && monthsAhead >= 0 ? addLocalMonths(nextInvoiceDate, anual ? monthsAhead * 12 : monthsAhead) : null;
		const isNext = numero === faturasPagas + 1 && acceptsNewInvoices;
		return {
			numero,
			percentualComissaoBps,
			situacao: isNext ? (situacao === "EM_ATRASO" ? "EM_ATRASO" : "PROXIMA") : "FUTURA",
			valorComissaoCentavos: baseCentavos === null ? null : Math.round((baseCentavos * percentualComissaoBps) / 10000),
			valorFaturaCentavos: baseCentavos,
			dataFatura,
			// Comissão fica elegível 30 dias depois da fatura.
			dataPix: dataFatura ? getPayoutDateForEligibility(new Date(dataFatura.getTime() + 30 * 86400_000)) : null,
			comissaoId: null,
			comissaoStatus: null,
		};
	};

	// Janela da trilha: começa até três mensalidades antes da próxima, para a próxima ficar no meio.
	const trackStart = Math.max(1, faturasPagas + 1 - 3);
	const trilha = Array.from({ length: trackLength }, (_, index) => buildInstallment(trackStart + index));

	const projectionCount = anual ? 1 : PLATFORM_PARTNER_PROJECTION_INVOICES;
	let valorProjetado12MesesCentavos: number | null = 0;
	for (let numero = 1; numero <= projectionCount; numero++) {
		const installment = buildInstallment(numero);
		if (installment.valorComissaoCentavos === null) {
			valorProjetado12MesesCentavos = null;
			break;
		}
		valorProjetado12MesesCentavos += installment.valorComissaoCentavos;
	}

	const nome = referral.organizacao?.nome ?? referral.organizacaoNomeSnapshot ?? "Loja excluída";
	return {
		id: referral.id,
		nome,
		iniciais: getStoreInitials(nome),
		plano: referral.organizacao?.assinaturaPlano ?? null,
		periodicidade,
		situacao,
		testeFim: referral.organizacao?.periodoTesteFim ?? null,
		dataEntrada: referral.dataInsercao,
		faturasPagas,
		valorGanhoCentavos: sumCommissions(valid),
		valorProjetado12MesesCentavos: acceptsNewInvoices || faturasPagas >= projectionCount ? valorProjetado12MesesCentavos : null,
		proximaMensalidade: acceptsNewInvoices ? buildInstallment(faturasPagas + 1) : null,
		trilha,
	};
}

// ---------------------------------------------------------------------------------------------
// Resumo do início
// ---------------------------------------------------------------------------------------------

export type TPartnerMonthEarnings = {
	/** Mês de elegibilidade ("YYYY-MM"). */
	mes: string;
	valorCentavos: number;
	/** PAGO: tudo do mês já saiu; A_RECEBER: mês fechado, aguardando o PIX; EM_APURACAO: mês corrente. */
	situacao: "PAGO" | "A_RECEBER" | "EM_APURACAO";
	dataPix: Date;
};

export function buildPartnerEarningsSummary({
	commissions,
	payouts,
	stores,
	now,
	months = 6,
}: {
	commissions: TEarningsCommission[];
	payouts: TEarningsPayout[];
	stores: TPartnerStore[];
	now: Date;
	months?: number;
}) {
	const payoutsById = new Map(payouts.map((payout) => [payout.id, payout]));
	const nextPayoutDate = getNextPayoutDate(now);
	const followingPayoutDate = getFollowingPayoutDate(nextPayoutDate);
	const valid = commissions.filter((commission) => commission.status !== "CANCELADA");
	const open = valid.filter(isOpenCommission);
	const payoutDateOf = (commission: TEarningsCommission) => getCommissionPayoutDate({ commission, payoutsById, nextPayoutDate }).getTime();

	const proximoPix = sumCommissions(open.filter((commission) => payoutDateOf(commission) === nextPayoutDate.getTime()));

	// Previsão do PIX seguinte: o que já está lançado e cai nele + as faturas previstas das lojas
	// que ainda não viraram comissão. Só o lançado é "garantido".
	const garantidoCentavos = sumCommissions(open.filter((commission) => payoutDateOf(commission) === followingPayoutDate.getTime()));
	const projetadoCentavos = stores
		.map((store) => store.proximaMensalidade)
		.filter((installment): installment is TPartnerStoreInstallment => !!installment && installment.situacao === "PROXIMA")
		.filter((installment) => installment.dataPix?.getTime() === followingPayoutDate.getTime())
		.reduce((total, installment) => total + (installment.valorComissaoCentavos ?? 0), 0);

	// Destaque sutil: a próxima 3ª mensalidade (bônus de 100%) entre as lojas.
	const bonus = stores
		.filter((store) => store.proximaMensalidade?.situacao === "PROXIMA" && store.periodicidade !== "ANUAL")
		.filter((store) => store.proximaMensalidade?.numero === 3 && store.proximaMensalidade.dataFatura)
		.sort((a, b) => (a.proximaMensalidade?.dataFatura?.getTime() ?? 0) - (b.proximaMensalidade?.dataFatura?.getTime() ?? 0))[0];

	const currentMonthKey = getLocalMonthKey(now);
	const localNow = toLocal(now);
	const monthKeys = Array.from({ length: months }, (_, index) => getLocalMonthKey(localNoon(localNow.year, localNow.month - (months - 1 - index), 1)));
	const byMonth = new Map<string, TEarningsCommission[]>();
	for (const commission of valid) {
		const key = getLocalMonthKey(commission.dataElegibilidade);
		byMonth.set(key, [...(byMonth.get(key) ?? []), commission]);
	}
	const ganhosPorMes: TPartnerMonthEarnings[] = monthKeys.map((mes) => {
		const monthCommissions = byMonth.get(mes) ?? [];
		const [year, month] = mes.split("-").map(Number);
		const scheduledPix = localNoon(year, month, PLATFORM_PARTNER_PAYOUT_DAY);
		const allPaid = monthCommissions.length > 0 && monthCommissions.every((commission) => commission.status === "PAGA");
		const paidDates = monthCommissions.map((commission) => getCommissionPayoutDate({ commission, payoutsById, nextPayoutDate }).getTime());
		return {
			mes,
			valorCentavos: sumCommissions(monthCommissions),
			situacao: mes === currentMonthKey ? "EM_APURACAO" : allPaid ? "PAGO" : "A_RECEBER",
			dataPix: allPaid ? new Date(Math.max(...paidDates)) : scheduledPix.getTime() < nextPayoutDate.getTime() ? nextPayoutDate : scheduledPix,
		};
	});
	const firstMonth = [...byMonth.keys()].sort()[0] ?? null;

	return {
		proximoPix: { valorCentavos: proximoPix, data: nextPayoutDate },
		previsao: {
			mes: getPayoutCompetenceMonthKey(followingPayoutDate),
			data: followingPayoutDate,
			garantidoCentavos,
			projetadoCentavos,
		},
		bonusTerceiraMensalidade: bonus?.proximaMensalidade
			? {
					lojaId: bonus.id,
					lojaNome: bonus.nome,
					dataFatura: bonus.proximaMensalidade.dataFatura,
					valorComissaoCentavos: bonus.proximaMensalidade.valorComissaoCentavos,
				}
			: null,
		valorRecebidoCentavos: sumCommissions(valid.filter((commission) => commission.status === "PAGA")),
		valorTotalCentavos: sumCommissions(valid),
		ganhosPorMes,
		primeiroMes: firstMonth,
		lojasPagantes: stores.filter((store) => store.faturasPagas > 0 && (store.situacao === "ATIVA" || store.situacao === "EM_ATRASO")).length,
		lojasIndicadas: stores.length,
	};
}

// ---------------------------------------------------------------------------------------------
// PIX
// ---------------------------------------------------------------------------------------------

export function maskPixKey(chavePix: string, tipo: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | null) {
	const digits = chavePix.replace(/\D/g, "");
	if (tipo === "CPF" || (!tipo && digits.length === 11 && !chavePix.includes("@"))) {
		return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
	}
	if (tipo === "CNPJ" || (!tipo && digits.length === 14)) {
		return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-**`;
	}
	if (tipo === "EMAIL" || chavePix.includes("@")) {
		const [user, domain] = chavePix.split("@");
		return `${user.slice(0, 2)}***@${domain ?? ""}`;
	}
	if (tipo === "TELEFONE") return `(**) *****-${digits.slice(-4)}`;
	return `${chavePix.slice(0, 4)}…${chavePix.slice(-4)}`;
}

/** Tipo provável da chave PIX a partir do valor digitado. Telefone só com DDD (10-11 dígitos) e sem ambiguidade com CPF. */
export function detectPixKeyType(chavePix: string): "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | null {
	const value = chavePix.trim();
	if (!value) return null;
	if (value.includes("@")) return "EMAIL";
	if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return "ALEATORIA";
	const digits = value.replace(/\D/g, "");
	if (value.startsWith("+") || value.includes("(")) return "TELEFONE";
	if (digits.length === 14) return "CNPJ";
	if (digits.length === 11) return "CPF";
	if (digits.length === 10) return "TELEFONE";
	return null;
}

// ---------------------------------------------------------------------------------------------
// Formatação (calendário local da operação, no servidor e no navegador)
// ---------------------------------------------------------------------------------------------

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "DD/MM/YYYY" (ou "DD/MM" com `short`) no calendário de São Paulo. */
export function formatPartnerDate(date: Date | string | null | undefined, { short = false }: { short?: boolean } = {}) {
	if (!date) return "—";
	const local = toLocal(new Date(date));
	const dayMonth = `${String(local.day).padStart(2, "0")}/${String(local.month + 1).padStart(2, "0")}`;
	return short ? dayMonth : `${dayMonth}/${local.year}`;
}

/** Nome do mês ("setembro") a partir da chave "YYYY-MM". */
export function formatPartnerMonthName(monthKey: string) {
	const month = Number(monthKey.split("-")[1]);
	return MONTH_NAMES[month - 1] ?? monthKey;
}

/** Dias corridos de `now` até `date`, no calendário local (0 = hoje, negativo = passou). */
export function getLocalDaysUntil(date: Date | string, now: Date) {
	const target = toLocal(new Date(date));
	const today = toLocal(now);
	return Math.round((Date.UTC(target.year, target.month, target.day) - Date.UTC(today.year, today.month, today.day)) / 86400_000);
}

export function formatCentavos(valorCentavos: number) {
	return `R$ ${(valorCentavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCommissionPercent(percentualComissaoBps: number) {
	return `${(percentualComissaoBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
