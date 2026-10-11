import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { getTabMenuProducts, hashPublicToken, resolveServiceSettings } from "@/lib/tabs";
import { db } from "@/services/drizzle";
import { PublicShell } from "../../_components/PublicShell";
import { PublicServicePointExperience } from "../../_components/PublicServicePointExperience";

// ============================================================================
// QR do PONTO (duravel, impresso na mesa): identifica o servicePoint, abre o
// cardapio e permite SOLICITAR pedido conforme a politica da organizacao.
// Por privacidade, NUNCA exibe itens/total de tabs abertas — uma foto antiga
// do QR da mesa nao da acesso ao consumo atual.
// ============================================================================

export default async function ServicePointPublicPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const tokenHash = hashPublicToken(token);

	const servicePoint = await db.query.servicePoints.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.tokenPublicoHash, tokenHash), eq(fields.ativo, true)),
		columns: { id: true, rotulo: true, grupo: true, organizacaoId: true },
		with: {
			organizacao: {
				columns: {
					id: true,
					nome: true,
					logoUrl: true,
					corPrimaria: true,
					corPrimariaForeground: true,
					corSecundaria: true,
					corSecundariaForeground: true,
				},
			},
		},
	});

	if (!servicePoint) {
		return (
			<PublicShell title="QR Code inválido">
				<div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
					<p className="text-sm text-muted-foreground">Este QR Code não é válido ou foi desativado. Chame um atendente.</p>
				</div>
			</PublicShell>
		);
	}

	const settings = await resolveServiceSettings({ orgId: servicePoint.organizacaoId });
	const orderingEnabled = settings.pedidosCliente !== "DESABILITADO";

	const products = orderingEnabled ? await getTabMenuProducts({ orgId: servicePoint.organizacaoId }) : [];

	return (
		<OrgColorsProvider
			scoped
			corPrimaria={servicePoint.organizacao?.corPrimaria}
			corPrimariaForeground={servicePoint.organizacao?.corPrimariaForeground}
			corSecundaria={servicePoint.organizacao?.corSecundaria}
			corSecundariaForeground={servicePoint.organizacao?.corSecundariaForeground}
		>
			<PublicShell
				title={servicePoint.organizacao?.nome ?? "Cardápio"}
				subtitle={`${servicePoint.rotulo}${servicePoint.grupo ? ` · ${servicePoint.grupo}` : ""}`}
				logoUrl={servicePoint.organizacao?.logoUrl}
			>
				{orderingEnabled ? (
					<PublicServicePointExperience token={token} products={products} />
				) : (
					<div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
						<p className="text-sm text-muted-foreground">
							Pedidos pelo celular não estão habilitados neste estabelecimento. Chame um atendente para fazer seu pedido.
						</p>
					</div>
				)}
			</PublicShell>
		</OrgColorsProvider>
	);
}
