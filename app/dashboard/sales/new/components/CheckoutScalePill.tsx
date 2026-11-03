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

function PillHelp({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5 p-3 text-sm">
			<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
			{children}
		</div>
	);
}

/**
 * Estado da balança do caixa ao lado da busca do PDV. Conectada, mostra o peso que está no prato
 * agora — o operador confere antes de tocar no botão de pesar do produto. Desconectada, é o botão
 * que autoriza a porta (a primeira vez precisa de um clique; depois a porta reabre sozinha).
 */
export default function CheckoutScalePill({ scale }: { scale: TUseSerialScale }) {
	if (!scale.isEnabled) return null;

	if (!scale.isSupported) {
		return (
			<Popover>
				<PopoverTrigger
					render={
						<Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground">
							<Weight className="h-3.5 w-3.5" />
							BALANÇA INDISPONÍVEL
						</Button>
					}
				/>
				<PopoverContent align="end" className="w-72 p-0">
					<PillHelp title="Balança do caixa">
						<p className="text-muted-foreground">
							Este navegador não acessa a porta serial. Use o Google Chrome ou o Microsoft Edge no computador ligado à balança.
						</p>
					</PillHelp>
				</PopoverContent>
			</Popover>
		);
	}

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
				variant={scale.status === "ERROR" ? "destructive-light" : "outline"}
				size="sm"
				className="h-9 gap-1.5 text-xs"
				title={scale.error ?? undefined}
				onClick={() => void scale.connect("INTERACTIVE")}
			>
				<Weight className="h-3.5 w-3.5" />
				CONECTAR BALANÇA
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
				<PillHelp title="Balança do caixa">
					{isStale ? (
						<p className="text-muted-foreground">
							A porta está aberta, mas a balança não responde. Confira se ela está ligada, se o cabo serial está firme e se a velocidade em Configurações →
							Módulos → Balança do caixa é a mesma da balança.
						</p>
					) : (
						<p className="text-muted-foreground">
							Coloque o produto no prato e toque no botão de pesar do produto. O peso entra no carrinho quando estabiliza.
						</p>
					)}
					{scale.velocidade ? <p className="text-xs text-muted-foreground">Porta aberta a {scale.velocidade} bps.</p> : null}
					<div className="mt-1 flex flex-wrap gap-2">
						<Button type="button" variant="outline" size="sm" onClick={() => void scale.connect("CHOOSE")}>
							TROCAR PORTA
						</Button>
						<Button type="button" variant="ghost" size="sm" onClick={() => void scale.disconnect()}>
							DESCONECTAR
						</Button>
					</div>
				</PillHelp>
			</PopoverContent>
		</Popover>
	);
}
