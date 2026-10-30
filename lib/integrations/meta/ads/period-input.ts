import dayjs from "dayjs";
import { z } from "zod";
import { META_ADS_MAX_RANGE_DAYS } from "./types";

/**
 * Peças de schema compartilhadas pelas rotas de Mídia paga. Datas são dias `YYYY-MM-DD`, que a Meta
 * interpreta no fuso da conta de anúncios; o intervalo é inclusivo e limitado a 90 dias.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayParam(label: string) {
	return z
		.string({ invalid_type_error: `Tipo inválido para ${label}.` })
		.optional()
		.nullable()
		.refine((value) => !value || (ISO_DAY.test(value) && dayjs(value).isValid()), { message: `Formato inválido para ${label} (use AAAA-MM-DD).` })
		.transform((value) => value || null);
}

export const MetaAdsPeriodInputSchema = z.object({
	integrationId: z.string({ invalid_type_error: "Tipo inválido para o ID da integração." }).optional().nullable(),
	since: dayParam("a data inicial"),
	until: dayParam("a data final"),
	comparingSince: dayParam("a data inicial da comparação"),
	comparingUntil: dayParam("a data final da comparação"),
});

export type TMetaAdsPeriod = { since: string; until: string };

function assertRange(range: TMetaAdsPeriod, label: string, ctx: z.RefinementCtx) {
	if (range.since > range.until) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: `A data inicial ${label} é posterior à final.` });
		return;
	}
	if (dayjs(range.until).diff(dayjs(range.since), "day") + 1 > META_ADS_MAX_RANGE_DAYS) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: `O intervalo ${label} pode ter no máximo ${META_ADS_MAX_RANGE_DAYS} dias.` });
	}
}

/**
 * Resolve período e comparação. Sem datas: últimos 30 dias. Comparação só existe com as duas pontas;
 * meia comparação é tratada como ausente.
 */
export function resolveMetaAdsPeriods<T extends z.infer<typeof MetaAdsPeriodInputSchema>>(input: T, ctx: z.RefinementCtx) {
	const current: TMetaAdsPeriod = {
		since: input.since ?? dayjs().subtract(29, "day").format("YYYY-MM-DD"),
		until: input.until ?? dayjs().format("YYYY-MM-DD"),
	};
	assertRange(current, "do período", ctx);
	const comparing: TMetaAdsPeriod | null =
		input.comparingSince && input.comparingUntil ? { since: input.comparingSince, until: input.comparingUntil } : null;
	if (comparing) assertRange(comparing, "da comparação", ctx);
	return { ...input, period: current, comparing };
}

/** Lê os parâmetros de período de uma URL, como strings cruas. */
export function readMetaAdsPeriodParams(searchParams: URLSearchParams) {
	return {
		integrationId: searchParams.get("integrationId"),
		since: searchParams.get("since"),
		until: searchParams.get("until"),
		comparingSince: searchParams.get("comparingSince"),
		comparingUntil: searchParams.get("comparingUntil"),
	};
}
