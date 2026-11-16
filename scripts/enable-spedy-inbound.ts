import "@/utils/scripts/load-next-env";

import { getSpedyCompanyClient, getSpedyOwnerClient } from "@/lib/fiscal/providers/spedy/client";
import { describeSpedyError } from "@/lib/fiscal/providers/spedy/errors";
import type { TSpedyCompanyResponse, TSpedyInboundSyncStatus } from "@/lib/fiscal/providers/spedy/types";
import { connection, db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { eq, sql } from "drizzle-orm";
import axios from "axios";

// node --conditions=react-server --import tsx scripts/enable-spedy-inbound.ts --org-name="Congelatte Gelateria" [--apply] [--sync]
// Dry-run por padrão. Preserva as configurações de emissão e nunca imprime credenciais.
type TCompanySettings = {
	productInvoice?: Record<string, unknown> & { inbound?: { enabled?: boolean; startDate?: string | null } };
};

function arg(name: string) {
	return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
	const organizationId = arg("org");
	const organizationName = arg("org-name");
	const apply = process.argv.includes("--apply");
	if ((!organizationId && !organizationName) || (organizationId && organizationName)) {
		throw new Error("Informe apenas --org=<id> ou --org-name=<nome exato>.");
	}
	const matches = await db.query.organizations.findMany({
		where: organizationId ? eq(organizations.id, organizationId) : eq(organizations.nome, organizationName!),
		limit: 2,
	});
	if (matches.length !== 1) throw new Error(`Esperada uma organização; encontradas ${matches.length}. Use --org para desambiguar.`);
	const organization = matches[0];
	const fiscal = organization.fiscalConfiguracao;
	const companyId = fiscal?.spedy?.companyId;
	if (organization.fiscalProvedor !== "SPEDY" || !companyId || !fiscal?.spedy?.companyApiKey) {
		throw new Error("Organização sem vínculo completo com a Spedy.");
	}
	const ownerClient = getSpedyOwnerClient();
	const companyClient = getSpedyCompanyClient(organization);
	const { data: company } = await ownerClient.get<TSpedyCompanyResponse>(`/v1/companies/${companyId}`);
	const digits = (value: string | null | undefined) => value?.replace(/\D/g, "");
	if (!digits(fiscal.cpfCnpj) || digits(company.federalTaxNumber) !== digits(fiscal.cpfCnpj)) {
		throw new Error("CNPJ da empresa na Spedy difere do CNPJ fiscal da organização.");
	}
	if (company.apiCredentials?.apiKey && !company.apiCredentials.apiKey.includes("*") && company.apiCredentials.apiKey !== fiscal.spedy.companyApiKey) {
		throw new Error("Chave local difere da chave da empresa na Spedy.");
	}
	const settingsUrl = `/v1/companies/${companyId}/settings`;
	const { data: settings } = await ownerClient.get<TCompanySettings>(settingsUrl);
	if (!settings.productInvoice || typeof settings.productInvoice !== "object") throw new Error("Configuração NF-e ausente na Spedy.");
	const inbound = {
		...settings.productInvoice.inbound,
		enabled: true,
		startDate: settings.productInvoice.inbound?.startDate ?? fiscal.dfe.dataInicio ?? null,
	};
	console.log(
		JSON.stringify(
			{
				organizacao: { id: organization.id, nome: organization.nome },
				spedyCompanyId: companyId,
				local: fiscal.dfe,
				spedyInbound: settings.productInvoice.inbound ?? null,
				proposto: inbound,
			},
			null,
			2,
		),
	);
	if (!apply) {
		console.log("DRY-RUN: nenhuma alteração. Use --apply para habilitar e --sync para testar a sincronização.");
		return;
	}
	if (!settings.productInvoice.inbound?.enabled) {
		await ownerClient.put(settingsUrl, { productInvoice: { ...settings.productInvoice, inbound } });
	}
	const { data: verified } = await ownerClient.get<TCompanySettings>(settingsUrl);
	if (verified.productInvoice?.inbound?.enabled !== true) throw new Error("A Spedy não confirmou a habilitação de NF-e recebidas.");
	console.log("NF-e recebidas habilitadas na Spedy:", JSON.stringify(verified.productInvoice.inbound));
	if (!fiscal.dfe.habilitado) {
		await db
			.update(organizations)
			.set({
				fiscalConfiguracao: sql`jsonb_set(${organizations.fiscalConfiguracao}, '{dfe,habilitado}', 'true'::jsonb)`,
			})
			.where(eq(organizations.id, organization.id));
		console.log("Recebimento habilitado também na configuração local.");
	}
	if (process.argv.includes("--sync")) {
		try {
			const response = await companyClient.post("/v1/inbound-product-invoices/sync");
			console.log("Sincronização solicitada. HTTP", response.status);
		} catch (error) {
			if (!axios.isAxiosError(error) || error.response?.status !== 429) throw error;
			console.log("Sincronização em intervalo de espera (HTTP 429).", JSON.stringify(describeSpedyError(error)));
		}
		const { data: status } = await companyClient.get<TSpedyInboundSyncStatus>("/v1/inbound-product-invoices/sync-status");
		console.log("Status da sincronização:", JSON.stringify(status, null, 2));
	}
}

main()
	.catch((error) => {
		console.error("Falha ao habilitar NF-e recebidas:", describeSpedyError(error));
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
