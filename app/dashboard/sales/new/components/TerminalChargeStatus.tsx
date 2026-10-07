"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { cancelSalePaymentAttempt, reassignSalePaymentAttempt } from "@/lib/mutations/payment-terminals";
import { appRoutes } from "@/lib/navigation/routes";
import {
	type TSalePaymentAttemptView,
	getPendingTerminalChargesQueryKey,
	getSalePaymentAttemptQueryKey,
	usePaymentTerminals,
	useSalePaymentAttempt,
} from "@/lib/queries/payment-terminals";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Loader2, PencilLine, Smartphone, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { TerminalOnlineDot } from "./checkout/TerminalPicker";

type TerminalChargeStatusProps = {
	saleId: string;
	// Snapshot da confirmação, mostrado até o primeiro polling responder.
	dispositivoNome: string;
	// Visual compacto para a pill; completo para a tela de sucesso.
	compact?: boolean;
};

type TChargeTone = "waiting" | "approved" | "declined" | "uncertain";

// A interface traduz `nextAction`/status; nunca inventa um estado. Incerteza interrompe com
// orientação concreta e sem oferecer recobrança (princípios de design do POS).
export function describeTerminalCharge(attempt: TSalePaymentAttemptView): { tone: TChargeTone; title: string; detail: string; canAct: boolean } {
	switch (attempt.status) {
		case "CRIADA":
			return { tone: "waiting", title: `Aguardando a maquininha "${attempt.dispositivoNome}"`, detail: "A cobrança já aparece no terminal. Peça para o operador executá-la.", canAct: true };
		case "PROCESSANDO":
			return {
				tone: attempt.nextAction === "RECUPERAR_NO_TERMINAL" ? "uncertain" : "waiting",
				title: "Cobrança em andamento no terminal",
				detail:
					attempt.nextAction === "RECUPERAR_NO_TERMINAL"
						? "O terminal iniciou a cobrança e não reportou o resultado. Confira na maquininha antes de qualquer nova cobrança."
						: "O cliente está pagando. O resultado chega automaticamente.",
				canAct: false,
			};
		case "APROVADA_EFETIVACAO_PENDENTE":
			return { tone: "waiting", title: "Pagamento aprovado, efetivando", detail: "A maquininha aprovou. O financeiro será efetivado em instantes.", canAct: false };
		case "CONSUMIDA":
			return {
				tone: "approved",
				title: "Pagamento aprovado na maquininha",
				detail: [attempt.bandeira, attempt.panMascarado, attempt.codigoAutorizacao ? `aut. ${attempt.codigoAutorizacao}` : null].filter(Boolean).join(" · ") || "Transação efetivada.",
				canAct: false,
			};
		case "NAO_APROVADA": {
			const reason = attempt.motivo === "RECUSADA" ? "recusado pela adquirente" : attempt.motivo === "CANCELADA" ? "cancelado" : "falhou no terminal";
			return {
				tone: "declined",
				title: `Pagamento ${reason}`,
				detail: `${attempt.erroMensagem ? `${attempt.erroMensagem}. ` : ""}A venda continua confirmada com o pagamento pendente: edite o pagamento para outro método ou cancele a venda.`,
				canAct: false,
			};
		}
		case "RESULTADO_INCERTO":
			return {
				tone: "uncertain",
				title: "Resultado incerto. Não cobre novamente.",
				detail: "A maquininha pode ter cobrado sem confirmar. Confira o comprovante no terminal e acione o suporte para conciliar.",
				canAct: false,
			};
	}
}

const TONE_CLASSES: Record<TChargeTone, string> = {
	waiting: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
	approved: "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400",
	declined: "border-destructive/30 bg-destructive/10 text-destructive",
	uncertain: "border-destructive/40 bg-destructive/10 text-destructive",
};

function ToneIcon({ tone, className }: { tone: TChargeTone; className?: string }) {
	if (tone === "approved") return <Check className={className} aria-hidden="true" />;
	if (tone === "declined") return <X className={className} aria-hidden="true" />;
	if (tone === "uncertain") return <TriangleAlert className={className} aria-hidden="true" />;
	return <Loader2 className={cn(className, "animate-spin")} aria-hidden="true" />;
}

/**
 * Bloco de acompanhamento da cobrança na maquininha após a confirmação. "NOVA VENDA" não é
 * bloqueada pela pendência (decisão 5 de docs/10): este bloco informa e oferece as saídas —
 * reatribuir a outro terminal ou cancelar a cobrança — enquanto a tentativa ainda está CRIADA.
 */
export default function TerminalChargeStatus({ saleId, dispositivoNome, compact }: TerminalChargeStatusProps) {
	const queryClient = useQueryClient();
	const { data, isError, error } = useSalePaymentAttempt({ saleId });
	const attempt = data?.attempt ?? null;
	const canAct = attempt?.status === "CRIADA";
	const { data: terminals = [] } = usePaymentTerminals({ enabled: canAct });

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: getSalePaymentAttemptQueryKey(saleId) });
		void queryClient.invalidateQueries({ queryKey: getPendingTerminalChargesQueryKey() });
	};
	const { mutate: cancelCharge, isPending: isCancelling } = useMutation({
		mutationKey: ["cancel-sale-payment-attempt", saleId],
		mutationFn: cancelSalePaymentAttempt,
		onSuccess: (result) => {
			toast.success(result.message);
			invalidate();
		},
		onError: (mutationError) => {
			toast.error(getErrorMessage(mutationError));
			invalidate();
		},
	});
	const { mutate: reassign, isPending: isReassigning } = useMutation({
		mutationKey: ["reassign-sale-payment-attempt", saleId],
		mutationFn: reassignSalePaymentAttempt,
		onSuccess: (result) => {
			toast.success(result.message);
			invalidate();
		},
		onError: (mutationError) => {
			toast.error(getErrorMessage(mutationError));
			invalidate();
		},
	});

	const description = attempt
		? describeTerminalCharge(attempt)
		: isError
			? { tone: "uncertain" as const, title: "Não foi possível consultar a cobrança", detail: getErrorMessage(error), canAct: false }
			: { tone: "waiting" as const, title: `Aguardando a maquininha "${dispositivoNome}"`, detail: "Consultando o andamento da cobrança…", canAct: false };
	const busy = isCancelling || isReassigning;

	return (
		<div className={cn("flex flex-col gap-2 rounded-xl border p-3 text-sm", TONE_CLASSES[description.tone])} role="status" aria-live="polite">
			<div className="flex items-start gap-2.5">
				<ToneIcon tone={description.tone} className="mt-0.5 h-4 w-4 shrink-0" />
				<div className="min-w-0 flex-1">
					<p className="font-bold">{description.title}</p>
					<p className={cn("mt-0.5 text-xs", description.tone === "waiting" ? "text-amber-700/90 dark:text-amber-200/80" : "opacity-90")}>{description.detail}</p>
					{attempt && !compact ? (
						<p className="mt-1 text-xs opacity-80">
							{formatToMoney(attempt.valor)}
							{attempt.totalParcelas > 1 ? ` em ${attempt.totalParcelas}x` : ""} · terminal {attempt.dispositivoNome}
						</p>
					) : null}
				</div>
			</div>
			{!compact && attempt ? (
				<div className="flex flex-wrap items-center gap-2 pl-6">
					{canAct ? (
						<>
							<DropdownMenu>
								<DropdownMenuTrigger
									render={
										<Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || terminals.length < 2}>
											<Smartphone className="h-3.5 w-3.5" />
											REATRIBUIR TERMINAL
										</Button>
									}
								/>
								<DropdownMenuContent align="start" className="min-w-56">
									<DropdownMenuGroup>
										<DropdownMenuLabel>ENVIAR PARA</DropdownMenuLabel>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										{terminals
											.filter((terminal) => terminal.id !== attempt.dispositivoId)
											.map((terminal) => (
												<DropdownMenuItem key={terminal.id} onClick={() => reassign({ saleId, dispositivoId: terminal.id })}>
													<div className="flex items-center gap-2">
														<TerminalOnlineDot online={terminal.online} />
														{terminal.nome}
													</div>
												</DropdownMenuItem>
											))}
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
							<Button type="button" variant="ghost-destructive" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => cancelCharge({ saleId })}>
								{isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
								CANCELAR COBRANÇA
							</Button>
						</>
					) : null}
					{attempt.status === "NAO_APROVADA" ? (
						<Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
							<Link href={appRoutes.sales.edit(saleId)}>
								<PencilLine className="h-3.5 w-3.5" />
								TROCAR O PAGAMENTO
							</Link>
						</Button>
					) : null}
					{description.tone === "uncertain" ? (
						<span className="inline-flex items-center gap-1 text-xs font-semibold">
							<CircleAlert className="h-3.5 w-3.5" /> Não realize uma nova cobrança.
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
}
