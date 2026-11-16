"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCcw } from "lucide-react";
import { useEffect, useId, useState } from "react";

const cooldownFormatter = new Intl.DateTimeFormat("pt-BR", {
	timeZone: "America/Sao_Paulo",
	day: "2-digit",
	month: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

export default function InboundSyncButton({
	nextAllowedSyncAt,
	pending,
	unavailable,
	onSync,
}: {
	nextAllowedSyncAt: string | null;
	pending: boolean;
	unavailable: boolean;
	onSync: () => void;
}) {
	const descriptionId = useId();
	const [now, setNow] = useState(Date.now);
	const nextAllowedAt = nextAllowedSyncAt ? Date.parse(nextAllowedSyncAt) : 0;
	const coolingDown = Number.isFinite(nextAllowedAt) && nextAllowedAt > now;

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		function refresh() {
			clearTimeout(timer);
			const current = Date.now();
			setNow(current);
			if (nextAllowedAt > current) timer = setTimeout(refresh, Math.min(nextAllowedAt - current + 50, 2_147_483_647));
		}
		refresh();
		// Uma aba suspensa pode atrasar timers; recalcular assim que voltar ao foco.
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", refresh);
		};
	}, [nextAllowedAt]);

	return (
		<div className="flex w-full flex-col items-center gap-1 lg:w-fit lg:items-end">
			<Button
				variant="outline"
				size="sm"
				className="flex w-full items-center gap-2 lg:w-fit"
				disabled={pending || unavailable || coolingDown}
				onClick={onSync}
				aria-describedby={coolingDown ? descriptionId : undefined}
				aria-busy={pending}
			>
				<RefreshCcw className={cn("size-3.5", pending && "animate-spin")} aria-hidden="true" />
				{pending ? "SOLICITANDO..." : "SINCRONIZAR AGORA"}
			</Button>
			{coolingDown ? (
				<p id={descriptionId} role="status" className="text-muted-foreground text-center text-xs lg:text-right">
					Próxima consulta: {cooldownFormatter.format(nextAllowedAt)} (Brasília).
				</p>
			) : null}
		</div>
	);
}
