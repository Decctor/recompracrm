import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatToMoney } from "@/lib/formatting";
import { useClientCashbackBalance } from "@/lib/queries/cashback-programs";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { DollarSign, Minus, Plus, Wallet } from "lucide-react";
import { useEffect } from "react";

type CashbackRedemptionBlockProps = {
	saleState: TUseSaleState;
	clientId: string;
	organizationCashbackProgram: TCashbackProgramEntity | null;
};

function CashbackRedemptionBlock({ saleState, clientId, organizationCashbackProgram }: CashbackRedemptionBlockProps) {
	const { data: clientCashbackBalance, isLoading: isCashbackBalanceLoading } = useClientCashbackBalance({
		clienteId: clientId,
	});

	const cashbackProgramId = organizationCashbackProgram?.id ?? clientCashbackBalance?.programaId ?? null;
	const cashbackSaldoDisponivel = clientCashbackBalance?.saldoValorDisponivel ?? 0;
	const cashbackMaxByRule = (() => {
		if (!organizationCashbackProgram?.resgateLimiteTipo || organizationCashbackProgram.resgateLimiteValor === null) {
			return Number.POSITIVE_INFINITY;
		}
		if (organizationCashbackProgram.resgateLimiteTipo === "FIXO") {
			return Math.max(0, organizationCashbackProgram.resgateLimiteValor);
		}
		return Math.max(0, (saleState.valorFinal * organizationCashbackProgram.resgateLimiteValor) / 100);
	})();
	const cashbackResgateMaximo = Math.max(0, Math.min(cashbackSaldoDisponivel, cashbackMaxByRule, saleState.valorFinal));
	const cashbackDisabledReason = !organizationCashbackProgram
		? "Programa de cashback não configurado."
		: !organizationCashbackProgram.ativo
			? "Programa de cashback inativo."
			: !organizationCashbackProgram.modalidadeDescontosPermitida
				? "Este programa não permite resgate por desconto."
				: cashbackSaldoDisponivel <= 0
					? "Cliente sem saldo de cashback disponível."
					: cashbackResgateMaximo <= 0
						? "Não há valor disponível para resgate nesta venda."
						: null;
	const isCashbackDisabled = isCashbackBalanceLoading || !!cashbackDisabledReason;

	useEffect(() => {
		saleState.setCashbackProgramaId(cashbackProgramId);
	}, [cashbackProgramId, saleState.setCashbackProgramaId]);

	useEffect(() => {
		if (isCashbackDisabled) {
			if (saleState.state.cashbackResgate !== 0) {
				saleState.setCashbackResgate(0);
			}
			return;
		}

		const nextValue = Math.min(Math.max(0, saleState.state.cashbackResgate), cashbackResgateMaximo);
		if (nextValue !== saleState.state.cashbackResgate) {
			saleState.setCashbackResgate(nextValue);
		}
	}, [isCashbackDisabled, cashbackResgateMaximo, saleState.state.cashbackResgate, saleState.setCashbackResgate]);

	return (
		<div className="w-full flex flex-col gap-1.5 rounded-lg border border-brand/35 bg-brand/20 px-2 py-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Wallet className="w-3 h-3 text-brand" />
					<span className="text-xs font-semibold text-brand">CASHBACK</span>
				</div>
				<span className="text-[11px] font-semibold text-brand">MAX: {formatToMoney(cashbackResgateMaximo)}</span>
			</div>
			<div className="flex items-center justify-between gap-2">
				<Input
					type="number"
					placeholder="Resgate"
					className="w-28 text-xs font-bold border-brand/50 text-brand"
					value={saleState.state.cashbackResgate}
					disabled={isCashbackDisabled}
					onChange={(event) => {
						const inputValue = Number(event.target.value);
						const safeValue = Number.isFinite(inputValue) ? inputValue : 0;
						saleState.setCashbackResgate(Math.min(Math.max(0, safeValue), cashbackResgateMaximo));
					}}
				/>
				<Button
					type="button"
					size="sm"
					variant="ghost-brand"
					disabled={isCashbackDisabled || cashbackResgateMaximo <= 0}
					onClick={() => saleState.setCashbackResgate(cashbackResgateMaximo)}
				>
					USAR MÁXIMO
				</Button>
			</div>
			{cashbackDisabledReason ? <p className="text-[11px] text-brand/90">{cashbackDisabledReason}</p> : null}
			{!cashbackDisabledReason && isCashbackBalanceLoading ? <p className="text-[11px] text-brand/90">Carregando saldo de cashback...</p> : null}
		</div>
	);
}

type SummarySectionProps = {
	saleState: TUseSaleState;
	organizationCashbackProgram: TCashbackProgramEntity | null;
};

export default function SummarySection({ saleState, organizationCashbackProgram }: SummarySectionProps) {
	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-2 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center gap-1.5">
				<DollarSign className="w-4 h-4 text-primary" />
				<h3 className="font-bold text-xs uppercase tracking-wide">Resumo</h3>
			</div>
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">Subtotal itens</span>
				<span>{formatToMoney(saleState.totalItens)}</span>
			</div>
			<div className="flex flex-col gap-1.5">
				{saleState.state.cliente ? (
					<CashbackRedemptionBlock saleState={saleState} clientId={saleState.state.cliente.id} organizationCashbackProgram={organizationCashbackProgram} />
				) : null}
				<div className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-red-200">
					<div className="flex items-center gap-1.5">
						<Minus className="w-3 h-3 text-red-600" />
						<span className="text-xs text-red-600">DESCONTOS</span>
					</div>
					<Input
						type="number"
						placeholder="Desconto"
						className="w-24 text-xs font-bold border border-red-600 text-red-600"
						value={saleState.state.descontoGeral}
						onChange={(event) => saleState.setDescontoGeral(Number(event.target.value) || 0)}
					/>
				</div>
				<div className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-green-200">
					<div className="flex items-center gap-1.5">
						<Plus className="w-3 h-3 text-green-600" />
						<span className="text-xs text-green-600">ACRÉSCIMOS</span>
					</div>
					<Input
						type="number"
						placeholder="Acréscimo"
						className="w-24 text-xs font-bold border border-green-600 text-green-600"
						value={saleState.state.acrescimoGeral}
						onChange={(event) => saleState.setAcrescimoGeral(Number(event.target.value) || 0)}
					/>
				</div>
			</div>
			<Input
				placeholder="Defina, se aplicável, observações da venda aqui..."
				value={saleState.state.observacoes}
				onChange={(event) => saleState.setObservacoes(event.target.value)}
			/>
			<Separator />
			<div className="flex items-center justify-between text-sm font-semibold">
				<span>TOTAL FINAL</span>
				<span>{formatToMoney(saleState.valorFinal)}</span>
			</div>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>PAGAMENTOS</span>
				<span>{formatToMoney(saleState.totalPagamentos)}</span>
			</div>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>RESTANTE</span>
				<span>{formatToMoney(saleState.valorRestante)}</span>
			</div>
		</div>
	);
}
