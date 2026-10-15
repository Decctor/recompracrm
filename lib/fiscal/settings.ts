import { handleSimpleChildRowsProcessing, isUniqueViolationError } from "@/lib/db-utils";
import { OrganizationFiscalConfigSchema, type TOrganizationFiscalConfig } from "@/schemas/fiscal";
import { db, type DB } from "@/services/drizzle";
import { fiscalOperationProfiles, fiscalSeries, fiscalTaxGroupRules, fiscalTaxGroups, organizations } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { ManualFiscalProvider } from "./providers/manual";
import { SpedyFiscalProvider } from "./providers/spedy";
import type { IFiscalProvider } from "./types";

function resolveFiscalProvider(fiscalProvedor: "MANUAL" | "SPEDY" | null | undefined): IFiscalProvider {
	return fiscalProvedor === "SPEDY" ? new SpedyFiscalProvider() : new ManualFiscalProvider();
}

export async function getFiscalSettings(organizacaoId: string) {
	const organization = await db.query.organizations.findFirst({
		where: (fields, operators) => operators.eq(fields.id, organizacaoId),
		columns: {
			id: true,
			nome: true,
			cnpj: true,
			fiscalProvedor: true,
			fiscalEmissaoAutomatica: true,
			fiscalConfiguracao: true,
		},
	});
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");
	return organization;
}

export async function updateFiscalSettings({
	organizacaoId,
	fiscalProvedor,
	fiscalEmissaoAutomatica,
	fiscalConfiguracao,
}: {
	organizacaoId: string;
	fiscalProvedor: "MANUAL" | "SPEDY";
	fiscalEmissaoAutomatica: boolean;
	fiscalConfiguracao: TOrganizationFiscalConfig;
}) {
	const parsedConfig = OrganizationFiscalConfigSchema.parse(fiscalConfiguracao);
	if (fiscalEmissaoAutomatica) {
		if (fiscalProvedor !== "SPEDY") {
			throw new createHttpError.BadRequest("Emissao fiscal automatica exige provedor Spedy.");
		}
		if (!parsedConfig.spedy?.nfce?.csc || !parsedConfig.spedy?.nfce?.tokenId) {
			throw new createHttpError.BadRequest("CSC e token da NFC-e devem estar configurados para emissao automatica.");
		}
		if (!parsedConfig.spedy?.certificado?.providerManaged && !parsedConfig.spedy?.certificado?.storagePath) {
			throw new createHttpError.BadRequest("Certificado digital deve estar configurado para emissao automatica.");
		}
		if (!parsedConfig.spedy?.companyApiKey) {
			throw new createHttpError.BadRequest("Empresa fiscal deve estar sincronizada com a Spedy antes de habilitar a emissao automatica.");
		}

		const operation = await findDefaultOperationProfileForType({
			organizacaoId,
			tipoDocumento: "NFCE",
			profileId: parsedConfig.operacaoPadraoPorTipo?.NFCE ?? null,
		});
		if (!operation) throw new createHttpError.BadRequest("Perfil de operacao NFC-e deve estar configurado para emissao automatica.");

		const series =
			operation.seriePadrao ??
			(await findActiveFiscalSeries({
				organizacaoId,
				tipoDocumento: "NFCE",
				ambiente: parsedConfig.ambiente,
			}));
		if (!series) throw new createHttpError.BadRequest("Serie NFC-e ativa deve estar configurada para emissao automatica.");
	}

	const [updated] = await db
		.update(organizations)
		.set({
			fiscalProvedor,
			fiscalEmissaoAutomatica,
			fiscalConfiguracao: parsedConfig,
		})
		.where(eq(organizations.id, organizacaoId))
		.returning({ id: organizations.id });

	if (!updated?.id) throw new createHttpError.InternalServerError("Erro ao salvar configuracao fiscal.");
	return updated;
}

export type TFiscalReadDatabase = Pick<DB, "query">;

export async function loadFiscalOrganization(organizacaoId: string, database: TFiscalReadDatabase = db) {
	const organization = await database.query.organizations.findFirst({
		where: (fields, operators) => operators.eq(fields.id, organizacaoId),
	});
	return organization ?? null;
}

export async function syncFiscalCompany(organizacaoId: string) {
	const organization = await loadFiscalOrganization(organizacaoId);
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const provider = resolveFiscalProvider(organization.fiscalProvedor);
	const result = await provider.sincronizarEmpresa(organization);
	if (organization.fiscalProvedor === "SPEDY" && organization.fiscalConfiguracao) {
		const fiscalConfiguracao = OrganizationFiscalConfigSchema.parse({
			...organization.fiscalConfiguracao,
			spedy: {
				...organization.fiscalConfiguracao.spedy,
				companyId: result.companyId ?? organization.fiscalConfiguracao.spedy.companyId ?? null,
				companyApiKey: result.companyApiKey ?? organization.fiscalConfiguracao.spedy.companyApiKey ?? null,
			},
		});
		await db.update(organizations).set({ fiscalConfiguracao }).where(eq(organizations.id, organizacaoId));
	}
	return result;
}

export async function syncFiscalCompanyCertificate({
	organizacaoId,
	certificate,
	fileName,
	password,
}: {
	organizacaoId: string;
	certificate: ArrayBuffer;
	fileName: string;
	password: string;
}) {
	const organization = await loadFiscalOrganization(organizacaoId);
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");
	if (!organization.fiscalConfiguracao) throw new createHttpError.BadRequest("Configuracao fiscal nao encontrada.");

	const provider = resolveFiscalProvider(organization.fiscalProvedor);
	const result = await provider.sincronizarCertificadoEmpresa(organization, { certificate, fileName, password });
	const fiscalConfiguracao = OrganizationFiscalConfigSchema.parse({
		...organization.fiscalConfiguracao,
		spedy: {
			...organization.fiscalConfiguracao.spedy,
			certificado: result.certificado,
		},
	});

	await db.update(organizations).set({ fiscalConfiguracao }).where(eq(organizations.id, organizacaoId));

	return result;
}

export async function findActiveFiscalSeries({
	organizacaoId,
	tipoDocumento,
	ambiente,
	database = db,
}: {
	organizacaoId: string;
	tipoDocumento: typeof fiscalSeries.$inferSelect.tipoDocumento;
	ambiente: typeof fiscalSeries.$inferSelect.ambiente;
	database?: TFiscalReadDatabase;
}) {
	return database.query.fiscalSeries.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizacaoId),
				operators.eq(fields.tipoDocumento, tipoDocumento),
				operators.eq(fields.ambiente, ambiente),
				operators.eq(fields.ativo, true),
			),
		orderBy: (fields, operators) => operators.asc(fields.serie),
	});
}

export async function listFiscalSeries(organizacaoId: string) {
	return db.query.fiscalSeries.findMany({
		where: (fields, operators) => operators.eq(fields.organizacaoId, organizacaoId),
		orderBy: (fields, operators) => [operators.asc(fields.tipoDocumento), operators.asc(fields.ambiente), operators.asc(fields.serie)],
	});
}

type FindFiscalSeriesByIdParams = {
	seriesId: string;
	organizationId: string;
};
export async function findFiscalSeriesById({ seriesId, organizationId }: FindFiscalSeriesByIdParams) {
	return db.query.fiscalSeries.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, seriesId), operators.eq(fields.organizacaoId, organizationId)),
	});
}

export async function upsertFiscalSeries(input: typeof fiscalSeries.$inferInsert) {
	try {
		if (input.id) {
			const [updated] = await db
				.update(fiscalSeries)
				.set({
					...input,
					// O contador so avanca: regredir geraria numeracao duplicada (rejeicoes 204/539),
					// e um valor obsoleto carregado na tela nao pode desfazer reservas concorrentes.
					proximoNumero: input.proximoNumero != null ? sql`GREATEST(${fiscalSeries.proximoNumero}, ${input.proximoNumero})` : undefined,
				})
				.where(and(eq(fiscalSeries.id, input.id), eq(fiscalSeries.organizacaoId, input.organizacaoId)))
				.returning();
			return updated;
		}
		const [created] = await db.insert(fiscalSeries).values(input).returning();
		return created;
	} catch (error) {
		if (isUniqueViolationError(error)) {
			throw new createHttpError.Conflict("Ja existe uma serie fiscal com este numero para o mesmo tipo de documento e ambiente.");
		}
		throw error;
	}
}

export async function consumeFiscalSeriesNumber(seriesId: string) {
	const [updated] = await db
		.update(fiscalSeries)
		.set({
			proximoNumero: sql`${fiscalSeries.proximoNumero} + 1`,
		})
		.where(eq(fiscalSeries.id, seriesId))
		.returning();
	return updated ?? null;
}

export async function reserveFiscalSeriesNumber(seriesId: string) {
	const [updated] = await db
		.update(fiscalSeries)
		.set({
			proximoNumero: sql`${fiscalSeries.proximoNumero} + 1`,
		})
		.where(eq(fiscalSeries.id, seriesId))
		.returning({ nextNumber: fiscalSeries.proximoNumero });

	if (!updated?.nextNumber) throw new createHttpError.InternalServerError("Erro ao reservar numero da serie fiscal.");
	return updated.nextNumber - 1;
}

export async function listFiscalOperationProfiles(organizacaoId: string) {
	return db.query.fiscalOperationProfiles.findMany({
		where: (fields, operators) => operators.eq(fields.organizacaoId, organizacaoId),
		with: {
			seriePadrao: true,
		},
		orderBy: (fields, operators) => operators.asc(fields.nome),
	});
}

type FindFiscalOperationProfileByIdParams = {
	database?: TFiscalReadDatabase;
	fiscalOperationProfileId: string;
	organizationId: string;
};

export async function findFiscalOperationProfileById({
	fiscalOperationProfileId,
	organizationId,
	database = db,
}: FindFiscalOperationProfileByIdParams) {
	return database.query.fiscalOperationProfiles.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, fiscalOperationProfileId), operators.eq(fields.organizacaoId, organizationId)),
		with: {
			seriePadrao: true,
		},
	});
}

export async function findDefaultOperationProfileForType({
	organizacaoId,
	tipoDocumento,
	profileId,
	presencaConsumidor,
	finalidade,
	database = db,
}: {
	organizacaoId: string;
	tipoDocumento: typeof fiscalOperationProfiles.$inferSelect.tipoDocumento;
	profileId?: string | null;
	presencaConsumidor?:
		| typeof fiscalOperationProfiles.$inferSelect.presencaConsumidor
		| Array<typeof fiscalOperationProfiles.$inferSelect.presencaConsumidor>;
	finalidade?: typeof fiscalOperationProfiles.$inferSelect.finalidade;
	database?: TFiscalReadDatabase;
}) {
	if (profileId) return findFiscalOperationProfileById({ fiscalOperationProfileId: profileId, organizationId: organizacaoId, database });

	const presencaCandidates = presencaConsumidor ? (Array.isArray(presencaConsumidor) ? presencaConsumidor : [presencaConsumidor]) : null;

	if (presencaCandidates?.length) {
		for (const presenca of presencaCandidates) {
			const profile = await database.query.fiscalOperationProfiles.findFirst({
				where: (fields, operators) =>
					operators.and(
						operators.eq(fields.organizacaoId, organizacaoId),
						operators.eq(fields.tipoDocumento, tipoDocumento),
						operators.eq(fields.ativo, true),
						operators.eq(fields.presencaConsumidor, presenca),
						...(finalidade ? [operators.eq(fields.finalidade, finalidade)] : []),
					),
				with: {
					seriePadrao: true,
				},
				orderBy: (fields, operators) => operators.asc(fields.nome),
			});
			if (profile) return profile;
		}

		return null;
	}

	return database.query.fiscalOperationProfiles.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizacaoId),
				operators.eq(fields.tipoDocumento, tipoDocumento),
				operators.eq(fields.ativo, true),
				...(finalidade ? [operators.eq(fields.finalidade, finalidade)] : []),
			),
		with: {
			seriePadrao: true,
		},
		orderBy: (fields, operators) => operators.asc(fields.nome),
	});
}

export async function upsertFiscalOperationProfile(input: typeof fiscalOperationProfiles.$inferInsert) {
	if (input.id) {
		const [updated] = await db
			.update(fiscalOperationProfiles)
			.set(input)
			.where(and(eq(fiscalOperationProfiles.id, input.id), eq(fiscalOperationProfiles.organizacaoId, input.organizacaoId)))
			.returning();
		return updated;
	}
	const [created] = await db.insert(fiscalOperationProfiles).values(input).returning();
	return created;
}

export async function listFiscalTaxGroups(organizacaoId: string) {
	return db.query.fiscalTaxGroups.findMany({
		where: (fields, operators) => operators.eq(fields.organizacaoId, organizacaoId),
		with: { regras: true },
		orderBy: (fields, operators) => operators.asc(fields.nome),
	});
}

type FindFiscalTaxGroupByIdParams = { fiscalTaxGroupId: string; organizationId: string };
export async function findFiscalTaxGroupById({ fiscalTaxGroupId, organizationId }: FindFiscalTaxGroupByIdParams) {
	return db.query.fiscalTaxGroups.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, fiscalTaxGroupId), operators.eq(fields.organizacaoId, organizationId)),
		with: { regras: true },
	});
}

type TFiscalTaxGroupRuleChild = Partial<typeof fiscalTaxGroupRules.$inferInsert> & { id?: string | null; deletar?: boolean | null };
type UpsertFiscalTaxGroupParams = {
	group: typeof fiscalTaxGroups.$inferInsert;
	regras: TFiscalTaxGroupRuleChild[];
};
export async function upsertFiscalTaxGroup({ group, regras }: UpsertFiscalTaxGroupParams) {
	return db.transaction(async (tx) => {
		let saved: typeof fiscalTaxGroups.$inferSelect;
		if (group.id) {
			[saved] = await tx
				.update(fiscalTaxGroups)
				.set(group)
				.where(and(eq(fiscalTaxGroups.id, group.id), eq(fiscalTaxGroups.organizacaoId, group.organizacaoId)))
				.returning();
		} else {
			[saved] = await tx.insert(fiscalTaxGroups).values(group).returning();
		}

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: fiscalTaxGroupRules,
			entities: regras,
			fatherEntityKey: "grupoTributarioId",
			fatherEntityId: saved.id,
			organizacaoId: group.organizacaoId,
		});

		return saved;
	});
}
