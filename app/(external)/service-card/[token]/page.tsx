import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { getTabMenuProducts, hashPublicToken, resolveServiceSettings } from "@/lib/tabs";
import { db } from "@/services/drizzle";
import { getTabPaidAmount } from "@/lib/tabs/utils";
import { sales } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { IdCard } from "lucide-react";
import { PublicOrderMenu } from "../../_components/PublicOrderMenu";
import { PublicShell } from "../../_components/PublicShell";
import { PublicTabStatement } from "../../_components/PublicTabStatement";

// ============================================================================
// QR da COMANDA FIXA (cartao reutilizavel, impresso por grafica). Com conta
// aberta no cartao: extrato + pedido direto na conta. Cartao livre: cardapio e
// pedido que o atendente aprova abrindo a conta. Mostrar o consumo a quem tem o
// cartao em maos e risco aceito (docs/tabs/service-cards.md); cartao
// comprometido se resolve regenerando o QR.
// ============================================================================

export default async function ServiceCardPublicPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const tokenHash = hashPublicToken(token);

	const card = await db.query.serviceCards.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.tokenPublicoHash, tokenHash), eq(fields.ativo, true)),
		columns: { id: true, codigo: true, organizacaoId: true },
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

	if (!card) {
		return (
			<PublicShell title="QR Code inválido">
				<div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
					<p className="text-sm text-muted-foreground">Este QR Code não é válido ou foi desativado. Chame um atendente.</p>
				</div>
			</PublicShell>
		);
	}

	const [settings, tab] = await Promise.all([
		resolveServiceSettings({ orgId: card.organizacaoId }),
		db.query.tabs.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, card.organizacaoId), eq(fields.serviceCardId, card.id), eq(fields.status, "ABERTA")),
			columns: { id: true, status: true },
			with: {
				servicePoint: { columns: { rotulo: true } },
				pedidos: {
					orderBy: (fields, { asc }) => asc(fields.numero),
					columns: { id: true, numero: true, status: true },
					with: {
						itens: {
							columns: { id: true, quantidade: true, quantidadeCancelada: true, valorVendaTotalLiquido: true, metadados: true },
						},
					},
				},
			},
		}),
	]);

	const [draftSale, valorPago] = tab
		? await Promise.all([
				db.query.sales.findFirst({
					where: and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")),
					columns: { valorTotal: true },
				}),
				getTabPaidAmount({ tabId: tab.id }),
			])
		: [null, 0];

	// Cartao livre so recebe pedido quando a organizacao aceita abertura a partir do QR.
	const orderingEnabled = settings.pedidosCliente !== "DESABILITADO" && (!!tab || settings.aberturaPublica !== "DESABILITADA");
	const products = orderingEnabled ? await getTabMenuProducts({ orgId: card.organizacaoId }) : [];

	const subtitle = `Comanda ${card.codigo}${tab?.servicePoint?.rotulo ? ` · ${tab.servicePoint.rotulo}` : ""}`;

	return (
		<OrgColorsProvider
			scoped
			corPrimaria={card.organizacao?.corPrimaria}
			corPrimariaForeground={card.organizacao?.corPrimariaForeground}
			corSecundaria={card.organizacao?.corSecundaria}
			corSecundariaForeground={card.organizacao?.corSecundariaForeground}
		>
			<PublicShell title={card.organizacao?.nome ?? "Sua comanda"} subtitle={subtitle} logoUrl={card.organizacao?.logoUrl}>
				{tab ? (
					<PublicTabStatement status={tab.status} pedidos={tab.pedidos} consumoParcial={draftSale?.valorTotal ?? 0} valorPago={valorPago} />
				) : (
					<section className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-4 py-6 text-center">
						<IdCard className="h-6 w-6 text-muted-foreground" />
						<p className="text-sm font-semibold">Comanda {card.codigo} disponível</p>
						<p className="text-xs text-muted-foreground">
							{orderingEnabled
								? "Faça seu pedido abaixo: o atendente abre a sua conta e envia o pedido para a cozinha."
								: "Apresente este cartão ao atendente para abrir a sua conta."}
						</p>
					</section>
				)}

				{orderingEnabled ? (
					<section className="flex flex-col gap-2">
						<h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{tab ? "Pedir mais" : "Fazer pedido"}</h2>
						<PublicOrderMenu token={token} context="COMANDA" products={products} />
					</section>
				) : !tab ? null : (
					<div className="rounded-2xl border border-border bg-card px-4 py-4 text-center">
						<p className="text-xs text-muted-foreground">Pedidos pelo celular não estão habilitados. Chame um atendente para pedir mais.</p>
					</div>
				)}
			</PublicShell>
		</OrgColorsProvider>
	);
}
