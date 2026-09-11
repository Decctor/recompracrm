"use client";

import type { TGetSalesSessionsOutputDefault } from "@/app/api/pos/sales-sessions/route";
import SelectInput from "@/components/Inputs/SelectInput";
import OpenSalesSession from "@/components/Modals/Internal/SalesSessions/OpenSalesSession";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useState } from "react";

type Session = TGetSalesSessionsOutputDefault["sessions"][number];
type Props = { sessions: Session[]; activeSessionId: string | null; onSessionChange: (id: string | null) => void; requireOpeningFloat: boolean };

export default function CashSessionGate({ sessions, activeSessionId, onSessionChange, requireOpeningFloat }: Props) {
	const [isOpening, setIsOpening] = useState(false);
	const hasOpenSessions = sessions.length > 0;
	return (
		<div className="flex w-full flex-1 items-center justify-center p-4">
			<div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
				<span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-primary">
					<Wallet className="h-7 w-7" />
				</span>
				<div className="flex flex-col gap-1.5">
					<h2 className="font-black text-xl">{hasOpenSessions ? "SELECIONE O CAIXA" : "ABRA O CAIXA PARA VENDER"}</h2>
					<p className="text-sm text-muted-foreground">
						{hasOpenSessions
							? "Há mais de uma sessão aberta neste ponto. Escolha qual será usada nesta venda."
							: "Nesta organização as vendas precisam ser registradas em uma sessão de caixa."}
					</p>
				</div>
				{hasOpenSessions ? (
					<div className="w-full">
						<SelectInput
							label="CAIXA"
							value={activeSessionId}
							options={sessions.map((session) => ({
								id: session.id,
								value: session.id,
								label: `${session.politica === "VENDEDOR_UNICO" ? "VENDEDOR ÚNICO" : "MÚLTIPLOS VENDEDORES"}${session.vendedorPadrao?.nome ? ` - ${session.vendedorPadrao.nome}` : ""}`,
							}))}
							handleChange={onSessionChange}
							resetOptionLabel="Selecione o caixa"
							onReset={() => onSessionChange(null)}
							required
						/>
					</div>
				) : null}
				<Button className="w-full gap-1.5" variant={hasOpenSessions ? "outline" : "default"} onClick={() => setIsOpening(true)}>
					<Wallet className="h-4 w-4" />
					ABRIR OUTRO CAIXA
				</Button>
			</div>
			{isOpening ? <OpenSalesSession closeModal={() => setIsOpening(false)} requireOpeningFloat={requireOpeningFloat} /> : null}
		</div>
	);
}
