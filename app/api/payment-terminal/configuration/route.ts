import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { PAYMENT_TERMINAL_METHODS, paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { getOrganizationPaymentMethodsConfig, getPaymentInstallmentsOptions } from "@/lib/payments/defaults";
import { db } from "@/services/drizzle";
import { accessPrincipals, organizations, salesSessions, sellers } from "@/services/drizzle/schema";
import { and, asc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// Configuração do terminal (scope payment-terminal:configuration:read). O que o app precisa para
// montar uma venda no Fluxo A sem adivinhar: vendedores ativos, caixas abertos e a política de
// sessão, métodos de cartão e parcelamento permitidos pela organização. Organização e dispositivo
// vêm da credencial.
async function getPaymentTerminalConfiguration({ organizationId, deviceId }: { organizationId: string; deviceId: string }) {
	const [organization, device, activeSellers, openSessions] = await Promise.all([
		db.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { id: true, nome: true, configuracao: true } }),
		db.query.accessPrincipals.findFirst({ where: eq(accessPrincipals.id, deviceId), columns: { id: true, nome: true } }),
		db.select({ id: sellers.id, nome: sellers.nome }).from(sellers).where(and(eq(sellers.organizacaoId, organizationId), eq(sellers.ativo, true))).orderBy(asc(sellers.nome)),
		db.query.salesSessions.findMany({
			where: and(eq(salesSessions.organizacaoId, organizationId), eq(salesSessions.status, "ABERTA")),
			columns: { id: true, dataAbertura: true, politica: true, vendedorPadraoId: true },
			with: { vendedorPadrao: { columns: { id: true, nome: true } } },
			orderBy: asc(salesSessions.dataAbertura),
		}),
	]);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const methodsConfig = getOrganizationPaymentMethodsConfig(organization.configuracao);
	const metodos = PAYMENT_TERMINAL_METHODS.filter((metodo) => methodsConfig[metodo]?.suportado).map((metodo) => ({
		metodo,
		// Débito nunca parcela; crédito segue o teto da organização (1 quando não há parcelamento).
		maxParcelas: metodo === "CARTAO_CREDITO" ? Math.max(1, ...getPaymentInstallmentsOptions(methodsConfig[metodo])) : 1,
	}));
	const sessoesVenda = organization.configuracao.preferencias.sessoesVenda;

	return {
		data: {
			organizacao: { id: organization.id, nome: organization.nome },
			terminal: { id: device?.id ?? deviceId, nome: device?.nome ?? "Terminal" },
			vendedores: activeSellers,
			sessoesVenda: {
				habilitado: sessoesVenda?.habilitado ?? false,
				obrigatorio: sessoesVenda?.obrigatorio ?? false,
				abertas: openSessions.map((session) => ({
					id: session.id,
					dataAbertura: session.dataAbertura,
					politica: session.politica,
					vendedorPadrao: session.vendedorPadrao ? { id: session.vendedorPadrao.id, nome: session.vendedorPadrao.nome } : null,
				})),
			},
			pagamentos: { metodos },
			// Reservado para o rollout: o app compara e exige atualização quando abaixo (docs/08).
			appVersaoMinima: null as string | null,
		},
		message: "Configuração do terminal carregada com sucesso.",
	};
}
export type TGetPaymentTerminalConfigurationOutput = Awaited<ReturnType<typeof getPaymentTerminalConfiguration>>;

async function getPaymentTerminalConfigurationRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:configuration:read");
	return NextResponse.json(await getPaymentTerminalConfiguration({ organizationId: actor.organizationId, deviceId: actor.principalId }));
}

export const GET = paymentTerminalApiHandler({ GET: getPaymentTerminalConfigurationRoute });
