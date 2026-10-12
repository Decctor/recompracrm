import { getTabMenuProducts, hashPublicToken, resolveServiceSettings } from "@/lib/tabs";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { PublicOrderMenu } from "../../_components/PublicOrderMenu";
import { PublicShell } from "../../_components/PublicShell";
import { PublicTabStatement } from "../../_components/PublicTabStatement";

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

	return (
		<OrgColorsProvider
			scoped
			corPrimaria={tab.organizacao?.corPrimaria}
			corPrimariaForeground={tab.organizacao?.corPrimariaForeground}
			corSecundaria={tab.organizacao?.corSecundaria}
			corSecundariaForeground={tab.organizacao?.corSecundariaForeground}
		>
			<PublicShell title={tab.organizacao?.nome ?? "Sua conta"} subtitle={etiqueta} logoUrl={tab.organizacao?.logoUrl}>
				<PublicTabStatement status={tab.status} pedidos={tab.pedidos} consumoParcial={draftSale?.valorTotal ?? 0} />

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
