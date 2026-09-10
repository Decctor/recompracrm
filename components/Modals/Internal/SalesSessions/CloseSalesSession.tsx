import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useInternalSalesSessionCloseState } from "@/state-hooks/use-internal-sales-session-close-state";
import { SalePaymentMethodsOptions } from "@/utils/select-options";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { formatSessionDifference, sessionDifferenceClass } from "@/components/Modals/Internal/SalesSessions/Blocks/session-difference";
import { SessionDrawerComposition } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionDrawerComposition";
import { SessionFiscalPendingAlert } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionFiscalPendingAlert";
import { SessionMetaRow } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionMetaRow";
import { SessionSectionLabel } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionSectionLabel";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { closeSalesSession } from "@/lib/mutations/sales-sessions";
import { useSalesSessionById } from "@/lib/queries/sales-sessions";
import { isCashDrawerMethod } from "@/lib/sales-sessions/session-method-lines";
import { summarizeSessionSalesBySeller } from "@/lib/sales-sessions/summarize-session-sales-by-seller";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { toast } from "sonner";
const paymentLabels = new Map(SalePaymentMethodsOptions.map((option) => [option.value, option.label]));
type CloseSalesSessionProps = {
	sessionId: string;
	closeModal: () => void;
	conferenciaCega?: boolean;
	callbacks?: {
		onSuccess?: () => void;
		onSettled?: () => void;
	};
};
export default function CloseSalesSession({ sessionId, closeModal, conferenciaCega, callbacks }: CloseSalesSessionProps) {
	const queryClient = useQueryClient();
	const { data: session, isLoading, isError, error } = useSalesSessionById({ sessionId });
	const { state, valorInformado, updateCount, updateNotes, confirmDifference } = useInternalSalesSessionCloseState();
	const { observacoes, confirmarDiferenca } = state;
	const hasCount = valorInformado !== null && valorInformado >= 0;
	const { mutate, isPending } = useMutation({
		mutationKey: ["close-sales-session", sessionId],
		mutationFn: closeSalesSession,
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["sales-sessions"] });
			queryClient.invalidateQueries({ queryKey: ["open-sales-sessions"] });
			closeModal();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
		onSettled: () => callbacks?.onSettled?.(),
	});
	const resumo = session?.resumoEsperado ?? [];
	const pendenciasFiscais = session?.pendenciasFiscais ?? [];
	const gavetaLinhas = resumo.filter((linha) => isCashDrawerMethod(linha.metodo));
	const recebivelLinhas = resumo.filter((linha) => !isCashDrawerMethod(linha.metodo));
	const totalEsperadoGaveta = gavetaLinhas.reduce((acc, linha) => acc + linha.valorEsperado, 0);
	const totalInformadoGaveta = valorInformado ?? 0;
	const diferencaGaveta = (Math.round(totalInformadoGaveta * 100) - Math.round(totalEsperadoGaveta * 100)) / 100;
	const temDiferencaGaveta = !conferenciaCega && hasCount && gavetaLinhas.length > 0 && diferencaGaveta !== 0;
	const vendas = session?.vendas ?? [];
	const totalVendas = vendas.reduce((acc, venda) => acc + venda.valorTotal, 0);
	const vendasPorVendedor = summarizeSessionSalesBySeller(vendas);
	function handleSubmit() {
		if (!session || session.status !== "ABERTA" || !hasCount || isPending) return;
		if (temDiferencaGaveta && !confirmarDiferenca) {
			confirmDifference();
			return;
		}
		const conferencias = gavetaLinhas.map((linha) => ({ metodo: linha.metodo, valorInformado: Math.round(totalInformadoGaveta * 100) / 100 }));
		mutate({ sessaoVendaId: sessionId, conferencias, observacoesFechamento: observacoes || null });
	}
	const actionButtonText = confirmarDiferenca && temDiferencaGaveta ? "CONFIRMAR DIFERENÇA E FECHAR" : "FECHAR CAIXA";
	return (
		<ResponsiveMenu
			menuTitle="FECHAR CAIXA"
			menuDescription="Conte as notas e moedas da gaveta, incluindo o fundo de troco."
			menuActionButtonDisabled={!hasCount || !session || session.status !== "ABERTA"}
			menuActionButtonText={actionButtonText}
			menuActionButtonClassName={confirmarDiferenca && temDiferencaGaveta ? "bg-warning text-warning-foreground hover:bg-warning/90" : undefined}
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			{!session ? (
				<ErrorComponent msg="Sessão de venda não encontrada." />
			) : (
				<div className="flex w-full flex-col gap-5">
					<SessionFiscalPendingAlert
						quantidade={pendenciasFiscais.length}
						description="Notas não autorizadas neste turno. Conforme a configuração, o fechamento pode ser bloqueado até a regularização."
					/>
					<div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3">
						<SessionMetaRow label="POLÍTICA" value={session.politica === "VENDEDOR_UNICO" ? "Vendedor único" : "Vendedores múltiplos"} />
						<SessionMetaRow label="VENDEDOR PADRÃO" value={session.vendedorPadrao?.nome ?? "—"} />
						<SessionMetaRow label="ABERTURA" value={formatDateAsLocale(session.dataAbertura, true) as string} />
						<SessionMetaRow label="VENDAS DO TURNO" value={`${vendas.length} · ${formatToMoney(totalVendas)}`} />
					</div>
					{vendasPorVendedor.length > 0 ? (
						<div className="flex flex-col gap-2">
							<SessionSectionLabel>VENDAS POR VENDEDOR</SessionSectionLabel>
							{vendasPorVendedor.map((item) => (
								<div key={item.vendedorId ?? "sem-vendedor"} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
									<span>
										{item.vendedorNome} <span className="text-xs text-muted-foreground">({item.quantidadeVendas})</span>
									</span>
									<span className="font-semibold tabular-nums">{formatToMoney(item.valorTotal)}</span>
								</div>
							))}
						</div>
					) : null}
					{confirmarDiferenca && temDiferencaGaveta ? (
						<div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-surface p-3">
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-surface-foreground" aria-hidden />
							<p className="text-xs leading-relaxed text-muted-foreground">
								A contagem da gaveta difere do esperado em{" "}
								<span className={cn("font-bold tabular-nums", sessionDifferenceClass(diferencaGaveta))}>{formatSessionDifference(diferencaGaveta)}</span>.
								Confirme para registrar o fechamento com essa diferença ou ajuste a contagem.
							</p>
						</div>
					) : null}
					<div className="w-full flex flex-col gap-3">
						{gavetaLinhas.length > 0 ? (
							<section className="flex flex-col gap-2">
								<SessionSectionLabel>CONTAGEM FÍSICA DA GAVETA</SessionSectionLabel>
								<div className="flex flex-col overflow-hidden rounded-xl bg-muted/50">
									{gavetaLinhas.map((linha, index) => {
										const informado = valorInformado;
										const diferenca = diferencaGaveta;
										const mostrarEsperado = !conferenciaCega;
										return (
											<div key={linha.metodo} className={cn("flex flex-col gap-2 px-3 py-3", index < gavetaLinhas.length - 1 && "border-b border-border/60")}>
												<div className="flex items-center justify-between gap-2">
													<span className="font-bold text-sm">{paymentLabels.get(linha.metodo) ?? linha.metodo.replaceAll("_", " ")}</span>
													{mostrarEsperado ? (
														<span className="text-[11px] text-muted-foreground">
															ESPERADO <span className="font-semibold tabular-nums">{formatToMoney(linha.valorEsperado)}</span>
														</span>
													) : (
														<span className="text-[11px] text-muted-foreground/70">CONTAGEM CEGA</span>
													)}
												</div>
												{mostrarEsperado ? (
													<SessionDrawerComposition
														composicao={{
															saldoInicial: session.saldoInicial,
															entradas: linha.entradas,
															troco: linha.troco,
															outrasSaidas: linha.outrasSaidas,
														}}
														metodo={linha.metodo}
														movimentos={session.movimentos}
													/>
												) : null}
												<Field data-invalid={informado !== null && informado < 0}>
													<FieldLabel htmlFor="session-cash-count">Dinheiro contado (R$)</FieldLabel>
													<Input
														id="session-cash-count"
														inputMode="decimal"
														autoComplete="off"
														value={state.contagem}
														onChange={(event) => updateCount(event.target.value)}
														placeholder="Informe o valor contado"
														disabled={isPending}
														aria-invalid={informado !== null && informado < 0}
														aria-describedby="session-cash-count-help"
													/>
													<FieldDescription id="session-cash-count-help">
														{informado !== null && informado < 0
															? "O valor contado não pode ser negativo."
															: "Inclua todas as notas e moedas. Se a gaveta estiver vazia, informe 0."}
													</FieldDescription>
												</Field>
												{mostrarEsperado && hasCount ? (
													<span className={cn("text-xs font-semibold", sessionDifferenceClass(diferenca))}>
														{diferenca === 0
															? "Sem diferença"
															: diferenca > 0
																? `Sobra ${formatToMoney(diferenca)}`
																: `Falta ${formatToMoney(Math.abs(diferenca))}`}
													</span>
												) : null}
											</div>
										);
									})}
									<div className="flex flex-col gap-1 border-t border-border/60 bg-muted/80 px-3 py-3">
										{!conferenciaCega ? (
											<div className="flex items-center justify-between text-xs">
												<span className="text-muted-foreground">ESPERADO EM GAVETA</span>
												<span className="font-semibold tabular-nums">{formatToMoney(totalEsperadoGaveta)}</span>
											</div>
										) : null}
										<div className="flex items-center justify-between text-xs">
											<span className="text-muted-foreground">CONTADO</span>
											<span className="font-semibold tabular-nums">{hasCount ? formatToMoney(totalInformadoGaveta) : "Aguardando contagem"}</span>
										</div>
										{!conferenciaCega && hasCount ? (
											<div className="flex items-center justify-between pt-1 text-sm" aria-live="polite">
												<span className="font-bold">DIFERENÇA</span>
												<span className={cn("font-black tabular-nums", sessionDifferenceClass(diferencaGaveta))}>{formatSessionDifference(diferencaGaveta)}</span>
											</div>
										) : null}
									</div>
								</div>
							</section>
						) : null}
						{recebivelLinhas.length > 0 ? (
							<section className="flex flex-col gap-2">
								<SessionSectionLabel>RECEBÍVEIS DO TURNO</SessionSectionLabel>
								<p className="text-xs text-muted-foreground">Valores por forma de pagamento. Não entram na contagem de notas e moedas.</p>
								<div className="flex flex-col gap-0.5 px-1">
									{recebivelLinhas.map((linha) => (
										<div key={linha.metodo} className="flex items-center justify-between gap-3 py-1.5">
											<span className="text-sm text-muted-foreground">{paymentLabels.get(linha.metodo) ?? linha.metodo.replaceAll("_", " ")}</span>
											<span className="font-semibold text-xs tabular-nums">{formatToMoney(linha.valorEsperado)}</span>
										</div>
									))}
								</div>
							</section>
						) : null}
					</div>
					{gavetaLinhas.length === 0 && recebivelLinhas.length === 0 ? (
						<p className="text-xs text-muted-foreground">Nenhum movimento registrado nesta sessão.</p>
					) : null}
					{vendas.length > 0 ? (
						<Collapsible className="flex flex-col gap-2">
							<CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40">
								<div className="flex flex-col gap-0.5">
									<SessionSectionLabel>VENDAS DO TURNO</SessionSectionLabel>
									<span className="text-xs text-muted-foreground">
										{vendas.length} {vendas.length === 1 ? "venda" : "vendas"} · {formatToMoney(totalVendas)}
									</span>
								</div>
								<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
							</CollapsibleTrigger>
							<CollapsibleContent>
								<div className="mt-1 flex flex-col gap-1 rounded-xl bg-muted/40 px-3 py-2">
									{vendas.map((venda) => (
										<div
											key={venda.id}
											className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-1.5 text-xs [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/40"
										>
											<span className="truncate font-medium text-foreground">{venda.cliente?.nome || "AO CONSUMIDOR"}</span>
											<span className="text-right font-semibold tabular-nums">{formatToMoney(venda.valorTotal)}</span>
											<span className="col-span-2 text-[11px] text-muted-foreground">{formatDateAsLocale(venda.dataVenda, true)}</span>
										</div>
									))}
								</div>
							</CollapsibleContent>
						</Collapsible>
					) : null}
					<TextareaInput
						label="OBSERVAÇÕES DO FECHAMENTO"
						value={observacoes}
						handleChange={updateNotes}
						placeholder="Observações do fechamento (opcional)..."
					/>
				</div>
			)}
		</ResponsiveMenu>
	);
}
