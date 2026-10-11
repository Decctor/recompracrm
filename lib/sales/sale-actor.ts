import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveSaleFiscalEmissionOverride } from "@/lib/sales/sale-fiscal-emission-override";
import createHttpError from "http-errors";

/**
 * Quem vende no balcão (lib/sales/create-and-confirm-sale.ts): o operador logado no PDV web ou a
 * maquininha, que vende com a credencial do dispositivo e sem sessão humana. Módulo puro, sem
 * banco: as regras que dependem só do ator são testáveis isoladas.
 */
export type TSaleActor =
	| { kind: "USER"; session: TAuthUserSession }
	| { kind: "DEVICE"; organizationId: string; deviceId: string; deviceName: string };

export function getSaleActorOrganizationId(actor: TSaleActor) {
	if (actor.kind === "DEVICE") return actor.organizationId;
	const organizationId = actor.session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return organizationId;
}

/** Override fiscal por venda. O dispositivo não tem a permissão fiscal: herda o padrão, e pedir outra coisa é recusado. */
export function resolveActorFiscalEmission({
	actor,
	requested,
	organizationDefault,
}: {
	actor: TSaleActor;
	requested: boolean | null | undefined;
	organizationDefault: boolean;
}): boolean | null {
	if (actor.kind === "USER") return resolveSaleFiscalEmissionOverride({ requested, organizationDefault, session: actor.session });
	if (requested == null || requested === organizationDefault) return null;
	throw new createHttpError.Forbidden("O terminal não altera a emissão fiscal da venda.");
}

