import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import { type TPosAvailableReward, usePosAvailableRewards } from "@/lib/queries/cashback-programs";
import { MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE } from "@/lib/sales/sale-reward-snapshot";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import type { TSaleRewardRedemption, TUseSaleState } from "@/state-hooks/use-sale-state";
import { ChevronDown, ChevronUp, Gift, Minus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Busca tolerante a acentos e caixa, no mesmo idioma dos normalizadores da casa. */
function normalizeForSearch(value: string) {
	return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

type RewardRedemptionSectionProps = {
	saleState: TUseSaleState;
	clientId: string;
};

/**
 * Resgate de recompensas (prêmios) via saldo de cashback no PDV. Cada recompensa sai
 * integralmente de graça (o servidor constrói o item com 100% de desconto) e o saldo é debitado
 * pelo valor do prêmio em moeda cashback. Várias recompensas por venda, com quantidade; a
 * elegibilidade de "mais uma" é sempre contra o saldo RESTANTE (saldo − já selecionadas), não
 * contra o saldo cheio que o servidor devolve. Exclusivas com cupom e com desconto em cashback.
 */
export default function RewardRedemptionSection({ saleState, clientId }: RewardRedemptionSectionProps) {
	const [isListOpen, setIsListOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");
	const { data: rewardsData, isLoading } = usePosAvailableRewards({ clienteId: clientId });

	const appliedRewards = saleState.state.recompensasResgate;
	const program = rewardsData?.program ?? null;
	const terminologia: TCashbackProgramTerminologyEnum = program?.terminologia ?? "DINHEIRO";
	const saldoDisponivel = rewardsData?.saldoValorDisponivel ?? 0;
	const saldoRestante = saldoDisponivel - saleState.recompensasResgateTotal;
	const rewards = useMemo(() => rewardsData?.rewards ?? [], [rewardsData?.rewards]);

	// Catálogo de prêmios chega inteiro do servidor: o filtro é local, sem round-trip por tecla.
	const filteredRewards = useMemo(() => {
		const term = normalizeForSearch(searchValue);
		if (!term) return rewards;
		return rewards.filter((reward) =>
			[reward.titulo, reward.descricao, reward.grupo].some((field) => (field ? normalizeForSearch(field).includes(term) : false)),
		);
	}, [rewards, searchValue]);

	// Revalida as recompensas aplicadas contra o servidor: prêmio desativado remove a linha; valores
	// alterados no catálogo atualizam a linha. O saldo é conferido sobre o conjunto, não por linha
	// (`elegivel` do servidor é "cabe sozinha", que não diz nada sobre a cesta).
	const { updateRecompensaResgate, removeRecompensaResgate, clearRecompensasResgate } = saleState;
	useEffect(() => {
		if (appliedRewards.length === 0 || !rewardsData) return;
		let removed = false;
		for (const applied of appliedRewards) {
			const freshReward = rewardsData.rewards.find((reward) => reward.id === applied.recompensaId);
			if (!freshReward) {
				removeRecompensaResgate(applied.recompensaId);
				removed = true;
				continue;
			}
			if (Math.abs(freshReward.valor - applied.valor) > 0.01 || Math.abs(freshReward.valorVenda - applied.valorVenda) > 0.01) {
				updateRecompensaResgate(applied.recompensaId, { valor: freshReward.valor, valorVenda: freshReward.valorVenda });
			}
		}
		if (removed) {
			toast.warning("Uma recompensa selecionada deixou de estar disponível e foi removida.");
			return;
		}
		const total = appliedRewards.reduce((sum, applied) => sum + applied.valor * applied.quantidade, 0);
		if (total > rewardsData.saldoValorDisponivel + 0.01) {
			clearRecompensasResgate();
			toast.warning("O saldo do cliente não cobre mais as recompensas selecionadas; a seleção foi removida.");
		}
	}, [appliedRewards, rewardsData, updateRecompensaResgate, removeRecompensaResgate, clearRecompensasResgate]);

	// A modalidade já é conferida pelo SummarySection (que monta ou não este bloco); aqui resta
	// o caso de organização com a modalidade ligada mas nenhum prêmio ativo cadastrado.
	if (appliedRewards.length === 0 && !isLoading && (!program?.modalidadeRecompensasPermitida || rewards.length === 0)) return null;

	const eligibleCount = rewards.filter((reward) => reward.valor <= saldoRestante + 0.0001).length;

	// Fechar o painel limpa a busca: reabrir sempre parte do catálogo inteiro.
	function toggleList() {
		setIsListOpen((prev) => !prev);
		setSearchValue("");
	}

	return (
		<div className="w-full flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-2">
			{appliedRewards.length > 0 ? (
				<div className="w-full flex flex-col gap-1.5">
					{appliedRewards.map((applied) => (
						<AppliedRewardRow
							key={applied.recompensaId}
							applied={applied}
							terminologia={terminologia}
							saldoRestante={saldoRestante}
							onIncrement={() => saleState.setRecompensaQuantidade(applied.recompensaId, applied.quantidade + 1)}
							onDecrement={() => saleState.setRecompensaQuantidade(applied.recompensaId, applied.quantidade - 1)}
							onRemove={() => saleState.removeRecompensaResgate(applied.recompensaId)}
						/>
					))}
					<div className="flex items-center justify-between text-[11px] text-amber-700">
						<span>
							Total debitado: <span className="font-bold">{formatCashbackValue(saleState.recompensasResgateTotal, terminologia)}</span>
						</span>
						<span>Não combinável com cupom ou desconto em cashback.</span>
					</div>
				</div>
			) : null}
			<button type="button" className="flex items-center justify-between cursor-pointer" onClick={toggleList}>
				<div className="flex items-center gap-1.5">
					<Gift className="w-3 h-3 text-amber-600" />
					<span className="text-xs font-semibold text-amber-600">
						{isLoading
							? "BUSCANDO RECOMPENSAS..."
							: appliedRewards.length > 0
								? eligibleCount > 0
									? `ADICIONAR OUTRA (${eligibleCount} ${eligibleCount === 1 ? "CABE NO SALDO" : "CABEM NO SALDO"})`
									: "SALDO RESTANTE NÃO COBRE OUTRA RECOMPENSA"
								: eligibleCount > 0
									? `${eligibleCount} ${eligibleCount === 1 ? "RECOMPENSA RESGATÁVEL" : "RECOMPENSAS RESGATÁVEIS"}`
									: "NENHUMA RECOMPENSA RESGATÁVEL"}
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-[11px] font-semibold text-amber-600">
						{appliedRewards.length > 0 ? "RESTANTE" : "SALDO"}: {formatCashbackValue(Math.max(0, saldoRestante), terminologia)}
					</span>
					{rewards.length > 0 ? isListOpen ? <ChevronUp className="w-3 h-3 text-amber-600" /> : <ChevronDown className="w-3 h-3 text-amber-600" /> : null}
				</div>
			</button>
			{isListOpen && program ? (
				<div className="w-full flex flex-col gap-1.5">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-amber-600/70" />
						<Input
							value={searchValue}
							onChange={(event) => setSearchValue(event.target.value)}
							placeholder="Buscar recompensa..."
							className="pl-8 h-8 text-xs border-amber-500/40"
						/>
					</div>
					{filteredRewards.length === 0 ? (
						<p className="text-[11px] text-amber-700 py-1">Nenhuma recompensa encontrada para a busca.</p>
					) : (
						filteredRewards.map((reward) => (
							<AvailableRewardCard
								key={reward.id}
								reward={reward}
								terminologia={terminologia}
								programaId={program.id}
								saleState={saleState}
								appliedQuantity={appliedRewards.find((applied) => applied.recompensaId === reward.id)?.quantidade ?? 0}
								saldoRestante={saldoRestante}
							/>
						))
					)}
				</div>
			) : null}
		</div>
	);
}

function AppliedRewardRow({
	applied,
	terminologia,
	saldoRestante,
	onIncrement,
	onDecrement,
	onRemove,
}: {
	applied: TSaleRewardRedemption;
	terminologia: TCashbackProgramTerminologyEnum;
	saldoRestante: number;
	onIncrement: () => void;
	onDecrement: () => void;
	onRemove: () => void;
}) {
	const canIncrement = applied.valor <= saldoRestante + 0.0001 && applied.quantidade < MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE;
	return (
		<div className="w-full flex flex-col gap-1 rounded-lg border border-amber-500/40 bg-card px-2 py-1.5">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<Gift className="w-3 h-3 text-amber-600 shrink-0" />
					<span className="text-xs font-semibold text-amber-600 truncate">RECOMPENSA — {applied.titulo.toUpperCase()}</span>
				</div>
				<span className="text-xs font-bold text-amber-600 shrink-0">-{formatCashbackValue(applied.valor * applied.quantidade, terminologia)}</span>
			</div>
			<div className="flex items-center justify-between gap-2 text-[11px] text-amber-700">
				<span>
					Valor comercial: <span className="line-through">{formatToMoney(applied.valorVenda * applied.quantidade)}</span> → GRÁTIS
				</span>
				<div className="flex items-center gap-1">
					<Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onDecrement} aria-label="Diminuir quantidade">
						<Minus className="w-3 h-3" />
					</Button>
					<span className="text-xs font-bold tabular-nums w-5 text-center">{applied.quantidade}</span>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="h-6 w-6"
						disabled={!canIncrement}
						onClick={onIncrement}
						aria-label="Aumentar quantidade"
					>
						<Plus className="w-3 h-3" />
					</Button>
					<Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove} aria-label="Remover recompensa">
						<X className="w-3 h-3" />
					</Button>
				</div>
			</div>
		</div>
	);
}

function AvailableRewardCard({
	reward,
	terminologia,
	programaId,
	saleState,
	appliedQuantity,
	saldoRestante,
}: {
	reward: TPosAvailableReward;
	terminologia: TCashbackProgramTerminologyEnum;
	programaId: string;
	saleState: TUseSaleState;
	appliedQuantity: number;
	saldoRestante: number;
}) {
	// "Cabe" é contra o saldo restante: o `elegivel` do servidor só sabe do saldo cheio.
	const fitsRemaining = reward.valor <= saldoRestante + 0.0001;
	const canApply = fitsRemaining && appliedQuantity < MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE;
	const reason = !reward.elegivel && reward.motivo ? reward.motivo : !fitsRemaining ? "Saldo restante insuficiente." : null;

	function handleApply() {
		if (!canApply) return;
		if (saleState.state.cupomResgate || saleState.state.cashbackResgate > 0) {
			toast.warning("Cupom e desconto em cashback foram removidos: não são combináveis com resgate de recompensa.");
		}
		saleState.addRecompensaResgate({
			recompensaId: reward.id,
			programaId,
			titulo: reward.titulo,
			valor: reward.valor,
			valorVenda: reward.valorVenda,
			imagemCapaUrl: reward.imagemCapaUrl,
		});
	}

	return (
		<div
			className={`w-full flex flex-col gap-1 rounded-lg border bg-card px-2 py-1.5 ${appliedQuantity > 0 ? "border-amber-500/60" : "border-border"}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					{reward.imagemCapaUrl ? (
						<img src={reward.imagemCapaUrl} alt={reward.titulo} className="h-9 w-9 rounded-md object-cover shrink-0" />
					) : (
						<div className="h-9 w-9 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
							<Gift className="w-4 h-4 text-amber-600" />
						</div>
					)}
					<div className="flex flex-col min-w-0">
						<span className="text-xs font-bold uppercase truncate">
							{reward.titulo}
							{appliedQuantity > 0 ? <span className="text-amber-600"> ×{appliedQuantity}</span> : null}
						</span>
						<span className="text-[11px] text-muted-foreground uppercase">VALOR COMERCIAL: {formatToMoney(reward.valorVenda)}</span>
					</div>
				</div>
				<span className="text-xs font-bold text-amber-600 shrink-0">{formatCashbackValue(reward.valor, terminologia)}</span>
			</div>
			{reason ? <p className="text-[11px] text-muted-foreground">{reason}</p> : null}
			<Button type="button" size="sm" variant="ghost" className="self-end" disabled={!canApply} onClick={handleApply}>
				{appliedQuantity > 0 ? "ADICIONAR MAIS UMA" : "RESGATAR RECOMPENSA"}
			</Button>
		</div>
	);
}
