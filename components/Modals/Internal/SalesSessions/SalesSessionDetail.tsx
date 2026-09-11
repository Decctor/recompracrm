import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { formatSessionDifference, sessionDifferenceClass } from "@/components/Modals/Internal/SalesSessions/Blocks/session-difference";
import { SessionDrawerComposition } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionDrawerComposition";
import { SessionFiscalPendingAlert } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionFiscalPendingAlert";
import { SessionMetaRow } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionMetaRow";
import { SessionSectionLabel } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionSectionLabel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { reviewSalesSession } from "@/lib/mutations/sales-sessions";
import { useSalesSessionById } from "@/lib/queries/sales-sessions";
import { buildSessionMethodLines, isCashDrawerMethod, MONEY_TOLERANCE, sumMoney } from "@/lib/sales-sessions/session-method-lines";
import { summarizeSessionSalesBySeller } from "@/lib/sales-sessions/summarize-session-sales-by-seller";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { SalePaymentMethodsOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertTriangle, CheckCircle2, ChevronDown, Wallet } from "lucide-react";
import { toast } from "sonner";

const paymentLabels = new Map(SalePaymentMethodsOptions.map((option) => [option.value, option.label]));
function paymentLabel(metodo: TPaymentMethodEnum) {
	return paymentLabels.get(metodo) ?? metodo.replaceAll("_", " ");
}

function formatDateTime(value: string | Date | null | undefined) {
	return value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—";
}

type SalesSessionDetailProps = {
	sessionId: string;
	closeModal: () => void;
	/** Gestor pode conferir (aprovar a conferência de) uma sessão FECHADA. */
	canReview?: boolean;
};

export default function SalesSessionDetail({ sessionId, closeModal, canReview = false }: SalesSessionDetailProps) {
	const queryClient = useQueryClient();
	const { data: session, isLoading, isError, error, queryKey } = useSalesSessionById({ sessionId });

	const { mutate: review, isPending: isReviewing } = useMutation({
		mutationKey: ["review-sales-session", sessionId],
		mutationFn: reviewSalesSession,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey });
			queryClient.invalidateQueries({ queryKey: ["sales-sessions"] });
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const isOpen = session?.status === "ABERTA";
	const canReviewThisSession = canReview && session?.status === "FECHADA";

	const linhas = buildSessionMethodLines({
		saldoInicial: session?.saldoInicial ?? 0,
		resumoEsperado: session?.resumoEsperado ?? [],
		conferencias: session?.conferencias ?? [],
	});
	const gavetaLinhas = linhas.filter((linha) => isCashDrawerMethod(linha.metodo));
	const recebivelLinhas = linhas.filter((linha) => !isCashDrawerMethod(linha.metodo));
	const esperadoGaveta = sumMoney(gavetaLinhas.map((linha) => linha.valorEsperado));
	const contadoGaveta = sumMoney(gavetaLinhas.map((linha) => linha.valorInformado ?? 0));
	const diferencaGaveta = sumMoney(gavetaLinhas.map((linha) => linha.diferenca ?? 0));
	const totalRecebiveis = sumMoney(recebivelLinhas.map((linha) => linha.valorEsperado));
	const temContagem = gavetaLinhas.some((linha) => linha.valorInformado !== null);

	const vendas = session?.vendas ?? [];
	const totalVendas = sumMoney(vendas.map((venda) => venda.valorTotal));
	const vendasPorVendedor = summarizeSessionSalesBySeller(vendas);

	// O snapshot do fechamento é a diferença oficial. A conta esperado/contado só aparece embaixo dela
	// quando a gaveta explica a diferença inteira — senão seria uma subtração que não fecha na tela.
	const diferencaTotal = session?.diferencaTotal ?? null;
	const gavetaExplicaDiferenca = diferencaTotal !== null && temContagem && Math.abs(diferencaGaveta - diferencaTotal) < MONEY_TOLERANCE;

	return (
		<ResponsiveMenu
			menuTitle="DETALHES DO CAIXA"
			menuDescription="Resumo do turno, composição da gaveta e conferência por método de pagamento."
			menuActionButtonText={canReviewThisSession ? "CONFERIR CAIXA" : "FECHAR"}
			menuCancelButtonText="VOLTAR"
			actionFunction={canReviewThisSession ? () => review({ sessaoVendaId: sessionId }) : closeModal}
			actionIsLoading={isReviewing}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			{!session ? (
				<ErrorComponent msg="Sessão de venda não encontrada." />
			) : (
				<div className="flex w-full flex-col gap-5">
					{isOpen ? (
						<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-3">
							<div className="flex items-center gap-2">
								<Wallet className="h-4 w-4 shrink-0 text-primary" aria-hidden />
								<div className="flex flex-col gap-0.5">
									<span className="font-bold text-sm">Caixa aberto</span>
									<span className="text-[11px] text-muted-foreground">Ainda não há conferência: os valores abaixo são o esperado até agora.</span>
								</div>
							</div>
							<div className="flex flex-col items-end">
								<span className="text-[11px] text-muted-foreground">ESPERADO EM GAVETA</span>
								<span className="font-black text-lg tabular-nums">{formatToMoney(esperadoGaveta)}</span>
							</div>
						</div>
					) : diferencaTotal !== null ? (
						<div
							className={cn(
								"flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3",
								diferencaTotal === 0
									? "border-success/30 bg-success-surface"
									: diferencaTotal > 0
										? "border-warning/40 bg-warning-surface"
										: "border-destructive/30 bg-destructive/5",
							)}
						>
							<div className="flex items-center gap-2">
								{diferencaTotal === 0 ? (
									<CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
								) : (
									<AlertTriangle className={cn("h-4 w-4 shrink-0", sessionDifferenceClass(diferencaTotal))} aria-hidden />
								)}
								<div className="flex flex-col gap-0.5">
									<span className="font-bold text-sm">
										{diferencaTotal === 0 ? "Caixa fechado sem diferença" : diferencaTotal > 0 ? "Sobra no caixa" : "Falta no caixa"}
									</span>
									{gavetaExplicaDiferenca ? (
										<span className="text-[11px] text-foreground/75 tabular-nums">
											Contado {formatToMoney(contadoGaveta)} contra {formatToMoney(esperadoGaveta)} esperados na gaveta
										</span>
									) : null}
								</div>
							</div>
							<span className={cn("font-black text-lg tabular-nums", sessionDifferenceClass(diferencaTotal))}>
								{formatSessionDifference(diferencaTotal)}
							</span>
						</div>
					) : (
						<div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-3">
							<AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
							<div className="flex flex-col gap-0.5">
								<span className="font-bold text-sm">Sem conferência registrada</span>
								<span className="text-[11px] text-muted-foreground">
									Este caixa foi marcado como {session.status.toLowerCase()} sem passar pelo fechamento.
								</span>
							</div>
						</div>
					)}

					<SessionFiscalPendingAlert
						quantidade={session.pendenciasFiscais.length}
						description="Notas não autorizadas neste turno. Regularize-as para o fechamento refletir o fiscal do dia."
					/>

					<div className="grid gap-x-8 gap-y-1.5 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
						<SessionMetaRow label="POLÍTICA" value={session.politica === "VENDEDOR_UNICO" ? "Vendedor único" : "Vendedores múltiplos"} />
						<SessionMetaRow label="VENDEDOR PADRÃO" value={session.vendedorPadrao?.nome ?? "—"} />
						<SessionMetaRow label="ABERTURA" value={formatDateTime(session.dataAbertura)} />
						<SessionMetaRow label="FECHAMENTO" value={formatDateTime(session.dataFechamento)} />
						<SessionMetaRow label="FUNDO DE TROCO" value={formatToMoney(session.saldoInicial)} />
						<SessionMetaRow label="ABERTO POR" value={session.abertaPorUsuario?.nome ?? "—"} />
						{session.dataFechamento ? <SessionMetaRow label="FECHADO POR" value={session.fechadaPorUsuario?.nome ?? "—"} /> : null}
						{session.status === "CONFERIDA" ? <SessionMetaRow label="CONFERIDA POR" value={session.conferidaPorUsuario?.nome ?? "—"} /> : null}
					</div>

					{gavetaLinhas.length > 0 ? (
						<section className="flex flex-col gap-2">
							<SessionSectionLabel>{isOpen ? "GAVETA DO TURNO" : "CONFERÊNCIA DA GAVETA"}</SessionSectionLabel>
							<div className="flex flex-col overflow-hidden rounded-xl bg-muted/50">
								{gavetaLinhas.map((linha, index) => (
									<div key={linha.metodo} className={cn("flex flex-col gap-1 px-3 py-3", index < gavetaLinhas.length - 1 && "border-b border-border/60")}>
										<div className="flex items-center justify-between gap-2">
											<span className="font-bold text-sm">{paymentLabel(linha.metodo)}</span>
											<span className="text-[11px] text-muted-foreground">
												ESPERADO <span className="font-semibold tabular-nums">{formatToMoney(linha.valorEsperado)}</span>
											</span>
										</div>
										{linha.composicao ? <SessionDrawerComposition composicao={linha.composicao} metodo={linha.metodo} movimentos={session.movimentos} /> : null}
										{linha.valorInformado === null ? (
											<span className="text-xs text-muted-foreground">Contagem física registrada apenas no fechamento do caixa.</span>
										) : (
											<div className="flex flex-col gap-1 border-t border-border/60 pt-2">
												<div className="flex items-center justify-between text-xs">
													<span className="text-muted-foreground">CONTADO</span>
													<span className="font-semibold tabular-nums">{formatToMoney(linha.valorInformado)}</span>
												</div>
												{linha.diferenca !== null ? (
													<div className="flex items-center justify-between text-sm">
														<span className="font-bold">DIFERENÇA</span>
														<span className={cn("font-black tabular-nums", sessionDifferenceClass(linha.diferenca))}>
															{formatSessionDifference(linha.diferenca)}
														</span>
													</div>
												) : null}
											</div>
										)}
									</div>
								))}
							</div>
						</section>
					) : null}

					{recebivelLinhas.length > 0 ? (
						<section className="flex flex-col gap-2">
							<SessionSectionLabel>RECEBÍVEIS DO TURNO</SessionSectionLabel>
							<p className="text-xs text-muted-foreground">Valores por forma de pagamento. Não entram na contagem de notas e moedas.</p>
							<div className="flex flex-col px-1">
								{recebivelLinhas.map((linha) => {
									const saidas = linha.composicao ? linha.composicao.troco + linha.composicao.outrasSaidas : 0;
									return (
										<div key={linha.metodo} className="flex flex-col gap-0.5 py-1.5">
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm text-muted-foreground">{paymentLabel(linha.metodo)}</span>
												<span className="font-semibold text-xs tabular-nums">{formatToMoney(linha.valorEsperado)}</span>
											</div>
											{linha.composicao && saidas > 0 ? (
												<span className="text-[11px] text-muted-foreground tabular-nums">
													Entradas {formatToMoney(linha.composicao.entradas)} · Saídas {formatToMoney(saidas)}
												</span>
											) : null}
										</div>
									);
								})}
								<div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-2">
									<span className="font-bold text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Total em recebíveis</span>
									<span className="font-bold text-sm tabular-nums">{formatToMoney(totalRecebiveis)}</span>
								</div>
							</div>
						</section>
					) : null}

					{gavetaLinhas.length === 0 && recebivelLinhas.length === 0 ? (
						<p className="text-xs text-muted-foreground">Nenhum movimento registrado nesta sessão.</p>
					) : null}

					{vendas.length > 0 ? (
						<section className="flex flex-col gap-2">
							<div className="flex flex-col gap-0.5">
								<SessionSectionLabel>VENDAS DO TURNO</SessionSectionLabel>
								<span className="text-xs text-muted-foreground">
									{vendas.length} {vendas.length === 1 ? "venda" : "vendas"} · {formatToMoney(totalVendas)}
								</span>
							</div>
							{vendasPorVendedor.length > 0 ? (
								<div className="flex flex-col gap-1">
									{vendasPorVendedor.map((item) => (
										<div
											key={item.vendedorId ?? "sem-vendedor"}
											className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
										>
											<span>
												{item.vendedorNome} <span className="text-xs text-muted-foreground">({item.quantidadeVendas})</span>
											</span>
											<span className="font-semibold tabular-nums">{formatToMoney(item.valorTotal)}</span>
										</div>
									))}
								</div>
							) : null}
							<Collapsible className="flex flex-col gap-1">
								<CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left font-semibold text-muted-foreground text-xs transition-colors hover:bg-muted/40">
									DETALHAR VENDAS
									<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
								</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="flex flex-col gap-1 rounded-xl bg-muted/40 px-3 py-2">
										{vendas.map((venda) => (
											<div
												key={venda.id}
												className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-1.5 text-xs [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/40"
											>
												<span className="truncate font-medium text-foreground">{venda.cliente?.nome || "AO CONSUMIDOR"}</span>
												<span className="text-right font-semibold tabular-nums">{formatToMoney(venda.valorTotal)}</span>
												<span className="col-span-2 text-[11px] text-muted-foreground">{formatDateTime(venda.dataVenda)}</span>
											</div>
										))}
									</div>
								</CollapsibleContent>
							</Collapsible>
						</section>
					) : (
						<p className="text-xs text-muted-foreground">Nenhuma venda registrada neste turno.</p>
					)}

					{session.observacoesAbertura || session.observacoesFechamento ? (
						<section className="flex flex-col gap-2">
							<SessionSectionLabel>OBSERVAÇÕES</SessionSectionLabel>
							<div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
								{session.observacoesAbertura ? (
									<div className="flex flex-col gap-0.5">
										<span className="font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Abertura</span>
										<p className="whitespace-pre-line text-xs leading-relaxed">{session.observacoesAbertura}</p>
									</div>
								) : null}
								{session.observacoesFechamento ? (
									<div className="flex flex-col gap-0.5">
										<span className="font-semibold text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Fechamento</span>
										<p className="whitespace-pre-line text-xs leading-relaxed">{session.observacoesFechamento}</p>
									</div>
								) : null}
							</div>
						</section>
					) : null}
				</div>
			)}
		</ResponsiveMenu>
	);
}
