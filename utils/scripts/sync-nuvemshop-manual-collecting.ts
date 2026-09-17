import "@/utils/scripts/load-next-env";

import { runDataCollectingV2 } from "@/lib/data-collecting-v2";
import { getScriptDataSourceIntegration } from "@/utils/scripts/get-data-source-integration";
import { connection, db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";

const SCRIPT_NAME = "SYNC-NUVEMSHOP-MANUAL-COLLECTING";

type TScriptOptions = {
	organizationId: string;
	startDate: Date;
	endDate: Date;
	processImmediateInteractions: boolean;
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
  npm run sync:nuvemshop-manual -- --org=<organizationId> --start=<ISO> --end=<ISO> [--process-immediate-interactions]

Aliases:
  --orgId, --organizationId
  --startDate
  --endDate

Exemplo:
  npm run sync:nuvemshop-manual -- --org=b75a88a2-ef7c-4ff5-a53c-4e227791cad3 --start=2026-03-21T00:00:00.000Z --end=2026-05-20T23:59:59.999Z

Observação:
  Por padrão, interações imediatas não são processadas para evitar disparos acidentais em execuções manuais.
  Use --process-immediate-interactions se quiser espelhar esse comportamento do cron.
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

function parseOptions(): TScriptOptions | null {
	if (hasFlag("help") || process.argv.includes("-h")) return null;

	const organizationId = getFirstArgValue(["org", "orgId", "organizationId"]);
	if (!organizationId) throw new Error("Informe --org=<organizationId>.");

	const startDate = parseRequiredDateArg(["start", "startDate"]);
	const endDate = parseRequiredDateArg(["end", "endDate"]);

	if (dayjs(startDate).isAfter(endDate)) {
		throw new Error("O período informado é inválido: --start deve ser anterior ou igual a --end.");
	}

	return {
		organizationId,
		startDate,
		endDate,
		processImmediateInteractions: hasFlag("process-immediate-interactions"),
	};
}

async function assertNuvemshopOrganization(organizationId: string) {
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
		columns: {
			id: true,
			nome: true,
		},
	});

	if (!organization) throw new Error(`Organização não encontrada: ${organizationId}`);
	await getScriptDataSourceIntegration({ organizationId, types: ["NUVEM-SHOP"] });

	return organization;
}

async function main() {
	const options = parseOptions();
	if (!options) {
		printHelp();
		return;
	}

	const startedAt = Date.now();
	const organization = await assertNuvemshopOrganization(options.organizationId);

	console.log(`[${SCRIPT_NAME}] Iniciando sincronização manual`, {
		organizationId: options.organizationId,
		organizationName: organization.nome,
		startDate: options.startDate.toISOString(),
		endDate: options.endDate.toISOString(),
		processImmediateInteractions: options.processImmediateInteractions,
	});

	const result = await runDataCollectingV2({
		organizationIds: [options.organizationId],
		window: {
			startDate: options.startDate,
			endDate: options.endDate,
		},
		processImmediateInteractions: options.processImmediateInteractions,
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
		console.error(`[${SCRIPT_NAME}] Falha ao sincronizar dados da Nuvem Shop.`);
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
