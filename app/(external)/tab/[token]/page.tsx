import { formatToMoney } from "@/lib/formatting";
import { getTabMenuProducts, hashPublicToken, resolveServiceSettings } from "@/lib/tabs";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { ReceiptText } from "lucide-react";
import { PublicOrderMenu } from "../../_components/PublicOrderMenu";
import { PublicShell } from "../../_components/PublicShell";

// ============================================================================
// QR da TAB (efemero — papel/pulseira/cartao): identifica uma conta especifica,
// mostra o extrato do consumo e pode iniciar uma solicitacao de nova rodada.
// Revogado naturalmente ao fechar a conta (status != ABERTA).
// ============================================================================

export default async function TabPublicPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const tokenHash = hashPublicToken(token);

	const tab = await db.query.tabs.findFirst({
		where: (fields, { eq }) => eq(fields.tokenPublicoHash, tokenHash),
		columns: { id: true, codigo: true, status: true, organizacaoId: true, dataAbertura: true },
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
			servicePoint: { columns: { rotulo: true } },
			pedidos: {
				orderBy: (fields, { asc }) => asc(fields.numero),
				columns: { id: true, numero: true, status: true, observacoes: true },
				with: {
					itens: {
						columns: { id: true, quantidade: true, quantidadeCancelada: true, valorVendaTotalLiquido: true, metadados: true },
					},
				},
			},
		},
	});

	if (!tab) {
		return (
			<PublicShell title="QR Code inválido">
				<div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
					<p className="text-sm text-muted-foreground">Este QR Code não é válido. Chame um atendente.</p>
				</div>
			</PublicShell>
		);
	}

	// QR efemero: fechar/cancelar a conta revoga a LEITURA do extrato — uma foto
	// do QR nao pode dar acesso permanente ao consumo (privacidade do design doc).
	if (tab.status !== "ABERTA") {
		return (
			<OrgColorsProvider
				scoped
				corPrimaria={tab.organizacao?.corPrimaria}
				corPrimariaForeground={tab.organizacao?.corPrimariaForeground}
				corSecundaria={tab.organizacao?.corSecundaria}
				corSecundariaForeground={tab.organizacao?.corSecundariaForeground}
			>
				<PublicShell title={tab.organizacao?.nome ?? "Conta"} logoUrl={tab.organizacao?.logoUrl}>
					<div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
						<p className="text-sm text-muted-foreground">Esta conta ja foi encerrada. Obrigado pela visita!</p>
					</div>
				</PublicShell>
			</OrgColorsProvider>
		);
	}

	const [draftSale, settings] = await Promise.all([
		db.query.sales.findFirst({
			where: and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")),
			columns: { valorTotal: true },
		}),
		resolveServiceSettings({ orgId: tab.organizacaoId }),
	]);

	const isOpen = tab.status === "ABERTA";
	const orderingEnabled = isOpen && settings.pedidosCliente !== "DESABILITADO";

	const products = orderingEnabled ? await getTabMenuProducts({ orgId: tab.organizacaoId }) : [];

	const etiqueta = tab.servicePoint?.rotulo ?? (tab.codigo ? `Comanda ${tab.codigo}` : "Conta");
	const activeOrders = tab.pedidos.filter((order) => order.status !== "CANCELADO");

	return (
		<OrgColorsProvider
			scoped
			corPrimaria={tab.organizacao?.corPrimaria}
			corPrimariaForeground={tab.organizacao?.corPrimariaForeground}
			corSecundaria={tab.organizacao?.corSecundaria}
			corSecundariaForeground={tab.organizacao?.corSecundariaForeground}
		>
			<PublicShell title={tab.organizacao?.nome ?? "Sua conta"} subtitle={etiqueta} logoUrl={tab.organizacao?.logoUrl}>
				<section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3">
					<div className="flex items-center justify-between">
						<span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
							<ReceiptText className="h-3.5 w-3.5" />
							Extrato da conta
						</span>
						<span
							className={
								isOpen
									? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300"
									: "rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							}
						>
							{isOpen ? "ABERTA" : tab.status}
						</span>
					</div>

					{activeOrders.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">Nenhum pedido lançado ainda.</p> : null}
					{activeOrders.map((order) => (
						<div key={order.id} className="flex flex-col gap-0.5 border-t border-border/50 pt-2">
							<span className="text-xs font-bold">Pedido {order.numero}</span>
							{order.itens
								.filter((item) => item.quantidadeCancelada < item.quantidade)
								.map((item) => {
									const metadata = (item.metadados ?? {}) as { nome?: string };
									return (
										<div key={item.id} className="flex items-center justify-between text-xs">
											<span>
												{item.quantidade}x {metadata.nome ?? "Item"}
											</span>
											<span className="font-medium">{formatToMoney(item.valorVendaTotalLiquido)}</span>
										</div>
									);
								})}
						</div>
					))}

					<div className="flex items-center justify-between border-t border-border pt-2">
						<span className="text-sm font-bold uppercase">Total parcial</span>
						<span className="text-base font-bold">{formatToMoney(draftSale?.valorTotal ?? 0)}</span>
					</div>
					<p className="text-[0.65rem] text-muted-foreground">O pagamento acontece no fechamento da conta com o atendente.</p>
				</section>

				{orderingEnabled ? (
					<section className="flex flex-col gap-2">
						<h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pedir mais</h2>
						<PublicOrderMenu token={token} context="TAB" products={products} />
					</section>
				) : null}
			</PublicShell>
		</OrgColorsProvider>
	);
}
