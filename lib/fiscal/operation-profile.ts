import type { TFiscalDocumentTypeEnum, TFiscalOperationFinalityEnum } from "@/schemas/enums";
import createHttpError from "http-errors";
import {
	formatMissingOperationProfileMessage,
	resolveExpectedConsumerPresenceCandidates,
	type TFiscalOperationProfileSignals,
} from "./sale-fiscal-signals";
import { findDefaultOperationProfileForType, findFiscalOperationProfileById, type TFiscalReadDatabase } from "./settings";

function assertOperationProfileMatchesDocumentType({
	profile,
	tipoDocumento,
	finalidade,
}: {
	profile: NonNullable<Awaited<ReturnType<typeof findFiscalOperationProfileById>>>;
	tipoDocumento: Extract<TFiscalDocumentTypeEnum, "NFCE" | "NFE">;
	finalidade: TFiscalOperationFinalityEnum;
}) {
	if (!profile.ativo) throw new createHttpError.BadRequest("Perfil de operacao fiscal inativo.");
	if (profile.tipoDocumento !== tipoDocumento) {
		throw new createHttpError.BadRequest(`Perfil de operacao fiscal incompativel com documento ${tipoDocumento}.`);
	}
	if (finalidade === "DEVOLUCAO" && profile.finalidade !== "DEVOLUCAO") {
		throw new createHttpError.BadRequest("Perfil de operacao fiscal deve ter finalidade DEVOLUCAO.");
	}
}

export async function resolveOperationProfileForSale({
	organizacaoId,
	tipoDocumento,
	signals,
	operationProfileId,
	operacaoPadraoPorTipoId,
	finalidade = "NORMAL",
	database,
}: {
	organizacaoId: string;
	tipoDocumento: Extract<TFiscalDocumentTypeEnum, "NFCE" | "NFE">;
	signals: TFiscalOperationProfileSignals;
	operationProfileId?: string | null;
	operacaoPadraoPorTipoId?: string | null;
	finalidade?: TFiscalOperationFinalityEnum;
	database?: TFiscalReadDatabase;
}) {
	if (operationProfileId) {
		const profile = await findFiscalOperationProfileById({
			database,
			fiscalOperationProfileId: operationProfileId,
			organizationId: organizacaoId,
		});
		if (!profile) throw new createHttpError.BadRequest("Perfil de operacao fiscal informado nao encontrado.");
		assertOperationProfileMatchesDocumentType({ profile, tipoDocumento, finalidade });
		return profile;
	}

	if (finalidade === "DEVOLUCAO") {
		const profile = await findDefaultOperationProfileForType({
			database,
			organizacaoId,
			tipoDocumento,
			finalidade: "DEVOLUCAO",
		});
		if (!profile) {
			throw new createHttpError.BadRequest("Configure um perfil de operacao fiscal de devolucao (NF-e com finalidade DEVOLUCAO).");
		}
		return profile;
	}

	const candidates = resolveExpectedConsumerPresenceCandidates({ ...signals, tipoDocumento });

	if (operacaoPadraoPorTipoId) {
		const configuredProfile = await findFiscalOperationProfileById({
			database,
			fiscalOperationProfileId: operacaoPadraoPorTipoId,
			organizationId: organizacaoId,
		});
		if (
			configuredProfile?.ativo &&
			configuredProfile.tipoDocumento === tipoDocumento &&
			configuredProfile.finalidade === finalidade &&
			candidates.includes(configuredProfile.presencaConsumidor)
		) {
			return configuredProfile;
		}
	}

	const profile = await findDefaultOperationProfileForType({
		database,
		organizacaoId,
		tipoDocumento,
		presencaConsumidor: candidates,
		finalidade,
	});
	if (!profile) {
		throw new createHttpError.BadRequest(
			formatMissingOperationProfileMessage({
				tipoDocumento,
				candidates,
				entregaModalidade: signals.entregaModalidade,
			}),
		);
	}

	return profile;
}

export { formatMissingOperationProfileMessage } from "./sale-fiscal-signals";
