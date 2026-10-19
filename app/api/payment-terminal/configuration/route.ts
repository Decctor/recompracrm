import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { listTerminalPaymentMethods, loadTerminalDeliveryRules, paymentTerminalApiHandler, toTerminalDiscountLimit } from "@/lib/payment-attempts";
import { DEVICE_DISCOUNT_AUTHORITY, resolveDiscountAuthority } from "@/lib/permissions/discounts";
import { db } from "@/services/drizzle";
import { accessPrincipals, organizationMembers, organizations, salesSessions, sellers } from "@/services/drizzle/schema";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// Configuração do terminal (scope payment-terminal:configuration:read). O que o app precisa para
// montar uma venda no Fluxo A sem adivinhar: vendedores ativos, caixas abertos e a política de
// sessão, e os métodos de pagamento que o terminal oferece — com o que cada um exige (cliente no
// fiado), permite (troco no dinheiro) e quem o executa (a maquininha, no cartão), e o teto de
// desconto de cada vendedor (o de quem não tem membership, e o da venda sem vendedor, é zero) para
// o app avisar antes de cobrar que o desconto vai precisar de aprovação. Organização e dispositivo
// vêm da credencial.
async function getPaymentTerminalConfiguration({ organizationId, deviceId }: { organizationId: string; deviceId: string }) {
	const [organization, device, activeSellers, openSessions, sellerMemberships, deliveryRules] = await Promise.all([
		db.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { id: true, nome: true, configuracao: true } }),
		db.query.accessPrincipals.findFirst({ where: eq(accessPrincipals.id, deviceId), columns: { id: true, nome: true } }),
		db
			.select({ id: sellers.id, nome: sellers.nome })
			.from(sellers)
			.where(and(eq(sellers.organizacaoId, organizationId), eq(sellers.ativo, true)))
			.orderBy(asc(sellers.nome)),
		db.query.salesSessions.findMany({
			where: and(eq(salesSessions.organizacaoId, organizationId), eq(salesSessions.status, "ABERTA")),
			columns: { id: true, dataAbertura: true, politica: true, vendedorPadraoId: true },
			with: { vendedorPadrao: { columns: { id: true, nome: true } } },
			orderBy: asc(salesSessions.dataAbertura),
		}),
		db
			.select({ vendedorId: organizationMembers.usuarioVendedorId, permissoes: organizationMembers.permissoes })
			.from(organizationMembers)
			.where(and(eq(organizationMembers.organizacaoId, organizationId), isNotNull(organizationMembers.usuarioVendedorId))),
		loadTerminalDeliveryRules(organizationId),
	]);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const metodos = listTerminalPaymentMethods(organization.configuracao);
	const sessoesVenda = organization.configuracao.preferencias.sessoesVenda;

	return {
		data: {
			organizacao: { id: organization.id, nome: organization.nome },
			terminal: { id: device?.id ?? deviceId, nome: device?.nome ?? "Terminal" },
			vendedores: activeSellers.map((seller) => {
				const membership = sellerMemberships.find((member) => member.vendedorId === seller.id);
				return {
					...seller,
					descontoLimite: toTerminalDiscountLimit(membership ? resolveDiscountAuthority(membership.permissoes) : DEVICE_DISCOUNT_AUTHORITY),
				};
			}),
			descontoLimitePadrao: toTerminalDiscountLimit(DEVICE_DISCOUNT_AUTHORITY),
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
			// Taxa de entrega da loja (a mesma do PDV web e da loja digital); o servidor recalcula na venda.
			entrega: deliveryRules,
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
