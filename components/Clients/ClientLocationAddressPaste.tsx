"use client";

import TextareaInput from "@/components/Inputs/TextareaInput";
import { Button } from "@/components/ui/button";
import type { TUseClientLocationAutofill } from "@/lib/hooks/use-client-location-autofill";
import { cn } from "@/lib/utils";
import { CircleAlert, CircleCheck, Loader2, WandSparkles } from "lucide-react";
import { useState } from "react";

type ClientLocationAddressPasteProps = {
	autofill: TUseClientLocationAutofill;
};

/**
 * Campo para colar um endereço inteiro (mensagem de WhatsApp, endereço copiado do Maps, etiqueta) e
 * preencher os campos abaixo dele. Colar já dispara o preenchimento; o botão serve para quem digitou.
 * A linha de status também mostra a busca por CEP, que vive no mesmo hook.
 */
export default function ClientLocationAddressPaste({ autofill }: ClientLocationAddressPasteProps) {
	const [text, setText] = useState("");
	const { status } = autofill;
	const isLoading = status.kind === "LOADING";

	return (
		<div className="flex w-full flex-col gap-1.5">
			<TextareaInput
				label="COLAR ENDEREÇO"
				placeholder="Cole o endereço completo. Ex.: Rua XV de Novembro, 512 - Centro, Ponta Grossa - PR"
				value={text}
				handleChange={setText}
				onPaste={(event) => {
					const pasted = event.clipboardData.getData("text");
					// Com o campo vazio, o que foi colado é o texto inteiro; com texto, o botão decide.
					if (pasted.trim() && !text.trim()) void autofill.fillFromText(pasted);
				}}
			/>
			<div className="flex w-full items-center justify-between gap-2">
				<p
					role="status"
					className={cn("flex min-w-0 items-center gap-1.5 text-xs", status.kind === "ERROR" ? "text-destructive" : "text-muted-foreground")}
				>
					{status.kind === "LOADING" ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
					{status.kind === "SUCCESS" ? <CircleCheck className="h-3 w-3 shrink-0" /> : null}
					{status.kind === "ERROR" ? <CircleAlert className="h-3 w-3 shrink-0" /> : null}
					{status.kind === "IDLE" ? "Ou preencha os campos abaixo." : status.message}
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="gap-1.5"
					disabled={!text.trim() || isLoading}
					onClick={() => void autofill.fillFromText(text)}
				>
					{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
					PREENCHER
				</Button>
			</div>
		</div>
	);
}
