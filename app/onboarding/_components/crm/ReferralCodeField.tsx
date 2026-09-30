"use client";

import { usePlatformPartnerCodeValidation } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import { BadgeCheck, CircleAlert, Handshake, Loader2 } from "lucide-react";
import { useState } from "react";

type ReferralCodeFieldProps = {
	/** Código que veio do link de indicação (cookie). Só exibido: o servidor já o usa como fallback. */
	cookieCode: string | null;
	/** Código digitado pelo lojista. Vai no payload e tem prioridade sobre o link. */
	value: string;
	onChange: (value: string) => void;
};

function firstName(nome: string) {
	return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * Código de indicação no cadastro da loja. O protótipo do parceiro diz "teste grátis com o código
 * MARINA24", então o lojista precisa ter onde digitar — antes o código só chegava pelo cookie do
 * link. Quem chegou pelo link vê o parceiro reconhecido e pode trocar.
 */
export function ReferralCodeField({ cookieCode, value, onChange }: ReferralCodeFieldProps) {
	const [open, setOpen] = useState(value.length > 0);
	const typed = value.trim().toUpperCase();
	const activeCode = typed || (open ? "" : (cookieCode ?? ""));
	const { data, isFetching, isDebouncing } = usePlatformPartnerCodeValidation({ codigo: activeCode });
	const checking = activeCode.length >= 3 && (isFetching || isDebouncing);
	const matched = !checking && data?.codigo === activeCode ? data : null;

	if (!open && cookieCode) {
		return (
			<div className="flex items-center gap-3 rounded-xl border border-border p-4">
				<Handshake className="size-4 shrink-0 text-primary" />
				<p className="flex-1 text-sm text-muted-foreground">
					{matched?.valid && matched.partner ? (
						<>
							Você chegou pela indicação de <b className="font-bold text-foreground">{firstName(matched.partner.nome)}</b> ({matched.codigo}).
						</>
					) : (
						<>
							Código de indicação <b className="font-bold text-foreground">{cookieCode}</b>
						</>
					)}
				</p>
				<button type="button" onClick={() => setOpen(true)} className="shrink-0 text-sm font-semibold text-primary hover:underline">
					Usar outro código
				</button>
			</div>
		);
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex items-center gap-2 self-start text-sm font-semibold text-primary hover:underline"
			>
				<Handshake className="size-4" />
				Tenho um código de indicação
			</button>
		);
	}

	const invalid = typed.length >= 3 && matched && !matched.valid;
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor="onboarding-referral-code" className="text-sm font-medium tracking-tight text-foreground/80">
				Código de indicação
			</label>
			<div className="relative">
				<input
					id="onboarding-referral-code"
					value={value}
					onChange={(event) => onChange(event.target.value.toUpperCase().replace(/\s+/g, ""))}
					placeholder="Ex.: MARINA24"
					autoComplete="off"
					className={cn(
						"h-10 w-full rounded-lg border bg-transparent px-3 pr-9 text-sm font-semibold tracking-[0.08em] uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
						invalid ? "border-destructive" : "border-input focus-visible:border-ring",
					)}
					aria-invalid={invalid || undefined}
					aria-describedby="onboarding-referral-code-feedback"
				/>
				<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
					{checking ? (
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
					) : matched?.valid ? (
						<BadgeCheck className="size-4 text-success" />
					) : invalid ? (
						<CircleAlert className="size-4 text-destructive" />
					) : null}
				</span>
			</div>
			<p id="onboarding-referral-code-feedback" className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
				{matched?.valid && matched.partner
					? `Indicação de ${firstName(matched.partner.nome)} reconhecida.`
					: invalid
						? "Código não encontrado. Confira com quem te indicou ou deixe em branco."
						: cookieCode && !typed
							? `Em branco, vale a indicação do link (${cookieCode}).`
							: "Opcional. Quem te indicou recebe pelo seu cadastro."}
			</p>
		</div>
	);
}
