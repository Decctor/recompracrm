"use client";

import { Button } from "@/components/ui/button";
import { formatDecimalPlaces } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

const PRESETS = [300, 500, 1000];
const STEP = 50;
const DEFAULT_LIMIT = 500;

export type TWeeklySendUsage = {
	/** Envios da campanha na semana corrente (o ledger de contadores). */
	campaignUsed: number;
	organizationWeeklyLimit: number | null;
	organizationDailyLimit: number | null;
};

type WeeklySendLimitFieldProps = {
	value: number | null;
	onChange: (value: number | null) => void;
	/** Uso desta semana. Ausente na criação, quando a campanha ainda não enviou nada. */
	usage?: TWeeklySendUsage | null;
};

/**
 * Teto de envios por semana da campanha. A campanha nunca passa do teto da organização: o envio
 * só sai quando todos os limites (campanha e organização, semana e dia) têm saldo.
 */
export function WeeklySendLimitField({ value, onChange, usage }: WeeklySendLimitFieldProps) {
	const limited = value !== null;
	const used = usage?.campaignUsed ?? 0;
	const remaining = limited ? Math.max(value - used, 0) : null;
	const usedShare = limited && value > 0 ? Math.min(used / value, 1) : 0;

	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="text-sm font-medium tracking-tight text-foreground/80">LIMITE DE ENVIOS POR SEMANA</h3>
				<div className="flex items-center gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Limite de envios">
					<button
						type="button"
						aria-pressed={!limited}
						onClick={() => onChange(null)}
						className={cn("rounded-md px-2.5 py-1 text-[0.7rem] font-bold", !limited ? "bg-card shadow-xs" : "text-muted-foreground")}
					>
						SEM LIMITE
					</button>
					<button
						type="button"
						aria-pressed={limited}
						onClick={() => onChange(limited ? value : DEFAULT_LIMIT)}
						className={cn("rounded-md px-2.5 py-1 text-[0.7rem] font-bold", limited ? "bg-card shadow-xs" : "text-muted-foreground")}
					>
						LIMITAR
					</button>
				</div>
			</div>
			{limited ? (
				<div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<div className="flex items-center overflow-hidden rounded-lg border border-border bg-card">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="rounded-none"
									aria-label="Diminuir limite"
									onClick={() => onChange(Math.max(value - STEP, STEP))}
								>
									<Minus className="size-4" />
								</Button>
								<input
									type="number"
									inputMode="numeric"
									min={1}
									value={value}
									aria-label="Limite de envios por semana"
									onChange={(event) => {
										const next = Number(event.target.value);
										if (Number.isFinite(next) && next > 0) onChange(Math.round(next));
									}}
									className="h-9 w-20 border-x border-border bg-transparent text-center text-sm font-bold tabular-nums outline-none"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="rounded-none"
									aria-label="Aumentar limite"
									onClick={() => onChange(value + STEP)}
								>
									<Plus className="size-4" />
								</Button>
							</div>
							<span className="text-xs text-muted-foreground">por semana</span>
						</div>
						<div className="flex items-center gap-1">
							{PRESETS.map((preset) => (
								<button
									key={preset}
									type="button"
									aria-pressed={value === preset}
									onClick={() => onChange(preset)}
									className={cn(
										"rounded-full border px-2.5 py-1 text-[0.7rem] font-bold tabular-nums",
										value === preset ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
									)}
								>
									{formatDecimalPlaces(preset)}
								</button>
							))}
						</div>
					</div>
					{usage ? (
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between gap-2 text-[0.7rem]">
								<span className="text-muted-foreground">
									<strong className="text-foreground tabular-nums">{formatDecimalPlaces(used)}</strong> usados nesta semana
								</span>
								<span className={cn("font-semibold tabular-nums", remaining === 0 ? "text-red-600 dark:text-red-400" : "text-primary")}>
									{formatDecimalPlaces(remaining ?? 0)} disponíveis
								</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div className={cn("h-full rounded-full", usedShare >= 1 ? "bg-red-500" : "bg-primary")} style={{ width: `${usedShare * 100}%` }} />
							</div>
						</div>
					) : null}
					{usage && (usage.organizationWeeklyLimit != null || usage.organizationDailyLimit != null) ? (
						<p className="text-[0.7rem] text-muted-foreground">
							Teto da organização:{" "}
							{[
								usage.organizationWeeklyLimit != null ? `${formatDecimalPlaces(usage.organizationWeeklyLimit)} por semana` : null,
								usage.organizationDailyLimit != null ? `${formatDecimalPlaces(usage.organizationDailyLimit)} por dia` : null,
							]
								.filter(Boolean)
								.join(" · ")}
							. O envio só sai quando todos os limites têm saldo.
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}
