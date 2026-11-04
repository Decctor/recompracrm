"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type TUseSerialScale, useSerialScaleLiveReading } from "@/lib/hooks/use-serial-scale";
import { formatScaleWeight, type TScaleFrame } from "@/lib/pos/serial-scale-protocol";
import { Loader2, Weight } from "lucide-react";
import { useEffect, useState } from "react";

/** Sem quadro há mais que isso, o peso na tela deixa de valer: a balança desligou ou o cabo soltou. */
const STALE_AFTER_MS = 2_000;

function describeFrame(frame: TScaleFrame) {
	switch (frame.kind) {
		case "STABLE":
			return formatScaleWeight(frame.weightKg);
		case "UNSTABLE":
			return "ESTABILIZANDO";
		case "NEGATIVE":
			return "NEGATIVO";
		case "OVERLOAD":
			return "SOBRECARGA";
	}
}

function useNow(intervalMs: number) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}

/**
 * Estado da balança do caixa ao lado da busca do PDV. Só existe no computador que tem balança
 * pareada (Configurações → Módulos → Balança do caixa): nos outros computadores da mesma loja — e em
 * navegadores sem porta serial — a tela fica igual à de quem não usa balança.
 *
 * Conectada, mostra o peso que está no prato agora — o operador confere antes de tocar no botão de
 * pesar do produto. Com problema, diz qual e oferece a reconexão.
 */
export default function CheckoutScalePill({ scale }: { scale: TUseSerialScale }) {
	if (!scale.isActive || !scale.isPaired) return null;

	if (scale.status === "CONNECTING") {
		return (
			<Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs" disabled>
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				BALANÇA
			</Button>
		);
	}

	if (scale.status !== "CONNECTED") {
		return (
			<Button
				type="button"
				variant="warning-light"
				size="sm"
				className="h-9 gap-1.5 text-xs"
				title={scale.error ?? "A balança deste computador está desconectada."}
				onClick={() => void scale.reconnect()}
			>
				<Weight className="h-3.5 w-3.5" />
				RECONECTAR BALANÇA
			</Button>
		);
	}

	return <ConnectedScalePill scale={scale} />;
}

function ConnectedScalePill({ scale }: { scale: TUseSerialScale }) {
	const live = useSerialScaleLiveReading();
	const now = useNow(1_000);
	const isStale = live.receivedAt === null || now - live.receivedAt > STALE_AFTER_MS;
	const label = isStale || !live.frame ? "SEM RESPOSTA" : describeFrame(live.frame);
	const isProblem = isStale || live.frame?.kind === "NEGATIVE" || live.frame?.kind === "OVERLOAD";

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant={isProblem ? "warning-light" : "outline"}
						size="sm"
						className="h-9 min-w-28 justify-start gap-1.5 text-xs tabular-nums"
						aria-label={`Balança do caixa: ${label}`}
					>
						<Weight className="h-3.5 w-3.5" />
						{label}
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex flex-col gap-1.5 p-3 text-sm">
					<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Balança do caixa</p>
					{isStale ? (
						<p className="text-muted-foreground">
							A porta está aberta, mas a balança não responde. Confira se ela está ligada e se o cabo está firme. Se a balança foi trocada, detecte de novo
							em Configurações → Módulos → Balança do caixa.
						</p>
					) : (
						<p className="text-muted-foreground">
							Coloque o produto no prato e toque no botão de pesar do produto. O peso entra no carrinho quando estabiliza.
						</p>
					)}
					<div className="mt-1 flex flex-wrap gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={() => void scale.disconnect()}>
							DESCONECTAR
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
