import { cn } from "@/lib/utils";
import { BadgePercent, CircleCheck, Gift, Minus, Plus, UsersRound } from "lucide-react";
import { MUTED, MockCard, PhoneFrame } from "./mock-parts";

// Telas do Ponto de Interação (point-of-interaction/.../{client-step,cashback-step,mode-selection-step,
// prize-card}, success-celebration) e o bloco de vendedores (sales/results/_components/sellers-block).

/** Herói do PDI: o perfil encontrado pelo telefone, com o saldo e o avanço automático. */
export function PdiProfileMock() {
	return (
		<PhoneFrame className="flex flex-col gap-4 px-5 py-6">
			<div className="flex items-center justify-center gap-1.5">
				<span className="h-1.5 w-7 rounded-full bg-[#24549c]" />
				<span className="size-1.5 rounded-full bg-[#e3e8ea]" />
				<span className="size-1.5 rounded-full bg-[#e3e8ea]" />
				<span className="size-1.5 rounded-full bg-[#e3e8ea]" />
			</div>
			<div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-[#bbf7d0] bg-[#f0fdf4] p-[22px]">
				<div className="text-center">
					<p className="m-0 mb-1 text-[12px] font-bold tracking-[0.1em] text-[#16a34a]">✓ PERFIL ENCONTRADO</p>
					<p className="m-0 text-[24px] font-black text-[#14532d] italic">MARIA SILVA</p>
					<p className="m-0 text-[15px] font-bold text-[#16a34a]">(34) 98888-7777</p>
				</div>
				<div className="w-full rounded-2xl bg-[#16a34a] p-4 text-center text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">
					<p className="m-0 text-[10px] font-bold tracking-[0.1em] opacity-80">SALDO DISPONÍVEL</p>
					<p className="m-0 mt-0.5 text-[30px] font-black">R$ 22,00</p>
				</div>
				<div className="flex w-full flex-col gap-2">
					<div className="h-2 overflow-hidden rounded-full bg-[#bbf7d0]">
						<div className="h-full w-[66%] bg-[#16a34a]" />
					</div>
					<p className="m-0 text-center text-[14px] font-medium text-[#15803d]">Avançando em 2 segundos...</p>
				</div>
				<span className="flex h-12 w-full items-center justify-center rounded-[10px] border border-[#86efac] bg-white text-[15px] font-black text-[#15803d]">
					CANCELAR
				</span>
			</div>
		</PhoneFrame>
	);
}

/** Passo do cashback no PDI: o cliente decide usar o saldo e o total cai na hora. */
export function PdiCashbackMock() {
	return (
		<PhoneFrame className="grid grid-cols-2 gap-3 overflow-hidden p-4">
			<div className="flex flex-col gap-2.5 rounded-xl border border-[#e3e8ea] p-3">
				<div className="flex items-center justify-between gap-1.5">
					<p className="m-0 text-[13px] font-extrabold">Usar cashback?</p>
					<span className="inline-flex rounded-full border border-[rgba(36,84,156,0.2)] p-0.5">
						<span className="rounded-full bg-[#24549c] px-[9px] py-[3px] text-[10px] font-extrabold text-white">SIM</span>
						<span className="px-[9px] py-[3px] text-[10px] font-extrabold text-[#24549c]">NÃO</span>
					</span>
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					<div className="rounded-lg border border-[#eef1f2] p-2">
						<p className={cn("m-0 text-[9px] font-extrabold", MUTED)}>SEU SALDO</p>
						<p className="m-0 mt-0.5 text-[15px] font-extrabold text-[#7a5117]">R$ 22,00</p>
					</div>
					<div className="rounded-lg border border-[#eef1f2] p-2">
						<p className={cn("m-0 text-[9px] font-extrabold", MUTED)}>LIMITE</p>
						<p className="m-0 mt-0.5 text-[15px] font-extrabold text-[#24549c]">R$ 27,60</p>
					</div>
				</div>
				<div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-2.5 text-center">
					<p className={cn("m-0 text-[9px] font-extrabold", MUTED)}>VALOR A RESGATAR</p>
					<p className="m-0 mt-0.5 text-[20px] font-extrabold">R$ 22,00</p>
				</div>
			</div>
			<div className="flex flex-col rounded-xl bg-[#24549c] p-3 text-white">
				<p className="m-0 text-[13px] font-extrabold">Resumo da venda</p>
				<div className="mt-auto flex flex-col gap-1.5 pt-4">
					<div className="flex justify-between text-[11px] opacity-80">
						<span>Subtotal</span>
						<span>R$ 92,00</span>
					</div>
					<div className="flex justify-between text-[11px] font-bold">
						<span>Desconto cashback</span>
						<span>− R$ 22,00</span>
					</div>
				</div>
				<div className="my-2.5 h-px bg-white/20" />
				<p className="m-0 text-[9px] font-extrabold tracking-[0.08em] opacity-80">TOTAL A PAGAR</p>
				<p className="m-0 mt-0.5 text-[26px] font-extrabold">R$ 70,00</p>
			</div>
		</PhoneFrame>
	);
}

/** Celebração de venda registrada: cashback gerado e novo saldo. */
export function PdiSuccessMock() {
	return (
		<PhoneFrame className="flex flex-col items-center gap-5 px-5 py-8 text-center">
			<span className="flex rounded-full bg-[#16a34a] p-4 text-white">
				<CircleCheck className="size-11" aria-hidden />
			</span>
			<div>
				<p className="m-0 text-[26px] font-extrabold tracking-[-0.025em] text-[#15803d]">Venda registrada!</p>
				<p className={cn("m-0 mt-1.5 text-[15px] font-medium", MUTED)}>Maria Silva acumulou cashback nesta compra.</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				<div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-[18px] py-3.5">
					<p className="m-0 mb-0.5 text-[10px] font-black tracking-[0.12em] text-[#16a34a]">CASHBACK GERADO</p>
					<p className="m-0 text-[28px] font-black text-[#15803d]">R$ 4,60</p>
				</div>
				<div className="rounded-2xl border border-[rgba(36,84,156,0.2)] bg-[rgba(36,84,156,0.05)] px-[18px] py-3.5">
					<p className="m-0 mb-0.5 text-[10px] font-black tracking-[0.12em] text-[#24549c]">NOVO SALDO</p>
					<p className="m-0 text-[28px] font-black text-[#24549c]">R$ 26,60</p>
				</div>
			</div>
			<div className="flex w-full gap-2.5">
				<span className="flex h-[46px] flex-1 items-center justify-center rounded-2xl bg-[#24549c] text-[15px] font-bold text-white">NOVA VENDA</span>
				<span className="flex h-11 flex-1 items-center justify-center rounded-2xl border border-[#e3e8ea] text-[13px] font-bold">VER PERFIL</span>
			</div>
		</PhoneFrame>
	);
}

/** Escolha de modo no quiosque: desconto ou recompensa. */
export function KioskModeMock() {
	return (
		<PhoneFrame className="flex flex-col gap-6 px-5 py-8">
			<div className="text-center">
				<p className="m-0 text-[20px] font-extrabold tracking-[-0.025em]">O que deseja fazer?</p>
				<p className={cn("m-0 mt-1.5 text-[14px]", MUTED)}>Escolha entre usar desconto ou resgatar uma recompensa.</p>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<div className="flex flex-col items-center gap-3.5 rounded-3xl border border-[#24549c] bg-[rgba(36,84,156,0.1)] px-3.5 py-6 text-center">
					<span className="flex rounded-2xl bg-[#24549c] p-3.5 text-white">
						<BadgePercent className="size-8 flex-none" aria-hidden />
					</span>
					<div>
						<p className="m-0 text-[15px] font-bold tracking-[-0.01em]">Pontuar e obter descontos</p>
						<p className={cn("m-0 mt-1 text-[12px]", MUTED)}>Registre a compra e utilize o saldo como desconto</p>
					</div>
				</div>
				<div className="flex flex-col items-center gap-3.5 rounded-3xl border border-[rgba(255,185,0,0.25)] bg-[rgba(255,185,0,0.06)] px-3.5 py-6 text-center">
					<span className="flex rounded-2xl bg-[rgba(255,185,0,0.12)] p-3.5 text-[#b38100]">
						<Gift className="size-8 flex-none" aria-hidden />
					</span>
					<div>
						<p className="m-0 text-[15px] font-bold tracking-[-0.01em]">Pontuar e resgatar recompensa</p>
						<p className={cn("m-0 mt-1 text-[12px]", MUTED)}>Use seu saldo para resgatar uma recompensa disponível</p>
					</div>
				</div>
			</div>
		</PhoneFrame>
	);
}

const SELLERS = [
	{ name: "Ana Souza", sales: 214, revenue: "R$ 18.420,00", goalPct: 102.3 },
	{ name: "Carlos Lima", sales: 187, revenue: "R$ 15.980,00", goalPct: 88.8 },
	{ name: "Juliana Prado", sales: 149, revenue: "R$ 12.310,00", goalPct: 76.9 },
	{ name: "Rafael Costa", sales: 121, revenue: "R$ 9.840,00", goalPct: 61.5 },
];

/** Resultado por vendedor: vendas, faturamento e progresso na meta do mês. */
export function SellersRankingMock() {
	return (
		<MockCard className="gap-3 px-3 py-4">
			<div className="flex items-center gap-2">
				<span className="flex size-7 items-center justify-center rounded-full bg-[#bfdbfe] text-[#2563eb]">
					<UsersRound className="size-4 flex-none" aria-hidden />
				</span>
				<span className="text-[12px] font-medium tracking-[-0.01em]">RESULTADO POR VENDEDOR</span>
			</div>
			<table className="w-full border-collapse text-[13px]">
				<thead>
					<tr className={cn("border-b border-[#e3e8ea]", MUTED)}>
						<th className="px-1.5 py-2 text-left font-medium">Vendedor</th>
						<th className="px-1.5 py-2 text-right font-medium">Vendas</th>
						<th className="px-1.5 py-2 text-right font-medium">Faturamento</th>
						<th className="px-1.5 py-2 text-right font-medium">Meta</th>
					</tr>
				</thead>
				<tbody>
					{SELLERS.map((seller) => (
						<tr key={seller.name} className="border-b border-[#e3e8ea]">
							<td className="px-1.5 py-2.5 font-medium whitespace-nowrap">{seller.name}</td>
							<td className="px-1.5 py-2.5 text-right">{seller.sales}</td>
							<td className="px-1.5 py-2.5 text-right font-medium whitespace-nowrap">{seller.revenue}</td>
							<td className="px-2 py-2.5">
								<div className="flex flex-col items-end gap-1">
									<span className="text-[11px] whitespace-nowrap">
										{seller.goalPct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
									</span>
									<span className="block h-1.5 w-16 overflow-hidden rounded-full bg-[#f2f4f4]">
										<span
											className={cn("block h-full rounded-full", seller.goalPct >= 100 ? "bg-[#16a34a]" : "bg-[#24549c]")}
											style={{ width: `${Math.min(100, seller.goalPct)}%` }}
										/>
									</span>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</MockCard>
	);
}

const PRIZES = [
	{ name: "Milkshake 400ml", description: "Qualquer sabor, com cobertura", cost: "R$ 22,00", state: "selected" },
	{ name: "Casquinha simples", description: "Uma bola, sabor à escolha", cost: "R$ 7,00", state: "available" },
	{ name: "Pote 1L", description: "Sabores da vitrine", cost: "R$ 49,90", state: "unaffordable" },
] as const;

/** Escolha de recompensas no PDI: uma selecionada, uma disponível e uma acima do saldo. */
export function PrizesMock() {
	return (
		<PhoneFrame className="flex flex-col gap-2.5 p-4">
			{PRIZES.map((prize) => (
				<div
					key={prize.name}
					className={cn(
						"flex items-center gap-3 rounded-2xl border p-2",
						prize.state === "selected" && "border-[#24549c] bg-[rgba(36,84,156,0.05)] shadow-[0_0_0_3px_rgba(36,84,156,0.25)]",
						prize.state === "available" && "border-[rgba(36,84,156,0.2)] bg-white",
						prize.state === "unaffordable" && "border-[#eef1f2] bg-[rgba(242,244,244,0.3)] opacity-50",
					)}
				>
					<span className="flex size-16 flex-none items-center justify-center rounded-xl bg-[rgba(36,84,156,0.1)] text-[#24549c]">
						<Gift className="size-6 flex-none" aria-hidden />
					</span>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<p className="m-0 truncate text-[14px] font-bold tracking-[-0.01em]">{prize.name}</p>
						<p className={cn("m-0 truncate text-[12px]", MUTED)}>{prize.description}</p>
						<p className={cn("m-0 text-[10.4px]", MUTED)}>Valor comercial: {prize.cost}</p>
						<div className="mt-0.5 flex items-center gap-2">
							<span className="text-[16px] font-black text-[#24549c]">{prize.cost}</span>
							{prize.state === "unaffordable" ? <span className="text-[9.6px] font-bold text-[#ef4444]">Saldo insuficiente</span> : null}
						</div>
					</div>
					{prize.state === "selected" ? (
						<div className="flex flex-none items-center gap-1 rounded-xl bg-[#24549c] p-1 text-white">
							<span className="flex size-9 items-center justify-center">
								<Minus className="size-[18px] flex-none" aria-hidden />
							</span>
							<span className="min-w-6 text-center text-[17px] font-black">1</span>
							<span className="flex size-9 items-center justify-center">
								<Plus className="size-[18px] flex-none" aria-hidden />
							</span>
						</div>
					) : (
						<span
							className={cn(
								"flex size-11 flex-none items-center justify-center rounded-xl",
								prize.state === "unaffordable" ? cn("bg-[#f2f4f4]", MUTED) : "bg-[rgba(36,84,156,0.1)] text-[#24549c]",
							)}
						>
							<Plus className="size-[18px] flex-none" aria-hidden />
						</span>
					)}
				</div>
			))}
		</PhoneFrame>
	);
}
