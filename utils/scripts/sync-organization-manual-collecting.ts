import "@/utils/scripts/load-next-env";

import { runDataCollectingV2, type TDataCollectingV2EffectsOptions } from "@/lib/data-collecting-v2";
import { getActiveDataSourceIntegrations } from "@/lib/integrations/data-sources";
import { connection, db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";

const SCRIPT_NAME = "SYNC-ORGANIZATION-MANUAL-COLLECTING";

type TScriptOptions = {
	organizationId: string;
	startDate: Date;
	endDate: Date;
	processImmediateInteractions: boolean;
	effects: TDataCollectingV2EffectsOptions;
};

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function printHelp() {
	console.log(`
Uso:
  npm run sync:organization-manual -- --org=<organizationId> --start=<ISO> --end=<ISO> --cashback=<process|skip> --campaigns=<process|skip> --conversion-attribution=<process|skip> [--process-immediate-interactions]

Aliases:
  --orgId, --organizationId
  --startDate
  --endDate

Exemplo para importar vendas antigas sem efeitos colaterais comerciais:
  npm run sync:organization-manual -- --org=c0af84e7-4882-4aac-8d6e-f28ee3541d0b --start=2026-01-01T00:00:00.000Z --end=2026-05-05T23:59:59.999Z --cashback=skip --campaigns=skip --conversion-attribution=skip

Observações:
  As decisões sobre cashback, campanhas e atribuição de conversão são obrigatórias em execuções manuais.
  Por padrão, interações imediatas não são processadas para evitar disparos acidentais.
  Use --process-immediate-interactions apenas com --campaigns=process se quiser espelhar o comportamento do cron.
`);
}

function getFirstArgValue(names: string[]) {
	for (const name of names) {
		const value = getArgValue(name);
		if (value) return value;
	}

	return null;
}

function parseRequiredDateArg(names: string[]) {
	const value = getFirstArgValue(names);
	if (!value) throw new Error(`Informe --${names[0]}=<ISO>.`);

	const parsed = dayjs(value);
	if (!parsed.isValid()) throw new Error(`Data inválida em --${names[0]}: ${value}`);
	return parsed.toDate();
}

function parseRequiredEffectArg(name: string) {
	const value = getArgValue(name);
	if (value === "process") return true;
	if (value === "skip") return false;
	throw new Error(`Informe --${name}=<process|skip>.`);
}

function parseOptions(): TScriptOptions | null {
	if (hasFlag("help") || process.argv.includes("-h")) return null;

	const organizationId = getFirstArgValue(["org", "orgId", "organizationId"]);
	if (!organizationId) throw new Error("Informe --org=<organizationId>.");

	const startDate = parseRequiredDateArg(["start", "startDate"]);
	const endDate = parseRequiredDateArg(["end", "endDate"]);
	if (dayjs(startDate).isAfter(endDate)) {
		throw new Error("O período informado é inválido: --start deve ser anterior ou igual a --end.");
	}

	const processCampaigns = parseRequiredEffectArg("campaigns");
	const processImmediateInteractions = hasFlag("process-immediate-interactions");
	if (processImmediateInteractions && !processCampaigns) {
		throw new Error("--process-immediate-interactions só pode ser usado com --campaigns=process.");
	}

	return {
		organizationId,
		startDate,
		endDate,
		processImmediateInteractions,
		effects: {
			processCashback: parseRequiredEffectArg("cashback"),
			processCampaigns,
			processConversionAttribution: parseRequiredEffectArg("conversion-attribution"),
		},
	};
}

async function assertOrganizationIntegration(organizationId: string) {
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
		columns: {
			id: true,
			nome: true,
		},
	});

	if (!organization) throw new Error(`Organização não encontrada: ${organizationId}`);

	const activeIntegrations = await getActiveDataSourceIntegrations({ executor: db, organizationId });
	if (activeIntegrations.length === 0) {
		throw new Error(`Organização sem fonte de dados ativa em integrations: ${organizationId}`);
	}

	return { ...organization, integracoes: activeIntegrations };
}

async function main() {
	const options = parseOptions();
	if (!options) {
		printHelp();
		return;
	}

	const startedAt = Date.now();
	const organization = await assertOrganizationIntegration(options.organizationId);

	console.log(`[${SCRIPT_NAME}] Iniciando sincronização manual`, {
		organizationId: options.organizationId,
		organizationName: organization.nome,
		integrationTypes: organization.integracoes.map((integration) => `${integration.tipo} (${integration.id})`),
		startDate: options.startDate.toISOString(),
		endDate: options.endDate.toISOString(),
		processImmediateInteractions: options.processImmediateInteractions,
		effects: options.effects,
	});

	const result = await runDataCollectingV2({
		organizationIds: [options.organizationId],
		window: {
			startDate: options.startDate,
			endDate: options.endDate,
		},
		processImmediateInteractions: options.processImmediateInteractions,
		effects: options.effects,
	});

	const elapsedMs = Date.now() - startedAt;
	console.log(`[${SCRIPT_NAME}] Sincronização concluída em ${elapsedMs}ms.`);
	console.log(`[${SCRIPT_NAME}] Resultado`, {
		summaries: result.summaries,
		errors: result.errors,
		eventDispatches: result.eventDispatches.length,
	});

	if (result.errors.length > 0) {
		process.exitCode = 1;
	}
}

void main()
	.then(() => {
		process.exitCode = process.exitCode ?? 0;
	})
	.catch((error) => {
		console.error(`[${SCRIPT_NAME}] Falha ao sincronizar dados da organização.`);
		if (error?.isAxiosError) {
			console.error({
				message: error.message,
				status: error.response?.status,
				data: error.response?.data,
				url: error.config?.url,
				params: error.config?.params,
			});
		} else {
			console.error(
				error instanceof Error
					? {
							type: error.name,
							message: error.message,
							stack: error.stack,
						}
					: String(error),
			);
		}
		process.exit(1);
	})
	.finally(async () => {
		await connection.end().catch((error) => {
			console.error(`[${SCRIPT_NAME}] Erro ao fechar conexão com o banco:`, error instanceof Error ? error.message : String(error));
		});

		process.exit(process.exitCode ?? 0);
	});
