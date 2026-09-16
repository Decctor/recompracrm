"use client";

import { cn } from "@/lib/utils";
import { CircleCheck, Phone, PhoneOff } from "lucide-react";

export type TCampaignSenderPhone = {
	id: string;
	nome: string;
	numero: string;
	/** Estado de pagamento da conta Cloud API — o bloqueio de entrega mais comum depois da aprovação. */
	pagamentoStatus?: string | null;
};

type PhonePickerProps = {
	phones: TCampaignSenderPhone[];
	selectedPhoneId: string;
	onSelect: (phoneId: string) => void;
};

/**
 * Cartões de remetente no topo da etapa. Substitui o `SelectInput` — a escolha do número
 * passou a governar o status exibido em cada template abaixo, então ela precisa estar visível.
 */
export default function PhonePicker({ phones, selectedPhoneId, onSelect }: PhonePickerProps) {
	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<div className="flex w-fit items-center gap-2 rounded bg-primary/20 px-2 py-1">
					<Phone className="h-4 w-4" />
					<h3 className="text-xs font-medium tracking-tight">REMETENTE DO WHATSAPP</h3>
				</div>
				<span className="text-xs text-muted-foreground">
					{phones.length === 0
						? "Nenhum número conectado nesta organização"
						: phones.length === 1
							? "1 número conectado nesta organização"
							: `${phones.length} números conectados nesta organização`}
				</span>
			</div>

			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{phones.map((phone) => {
					const isSelected = selectedPhoneId === phone.id;
					return (
						<button
							key={phone.id}
							type="button"
							onClick={() => onSelect(phone.id)}
							className={cn(
								"relative flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40",
								isSelected && "ring-2 ring-primary ring-inset",
							)}
						>
							<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#25d366]/15 text-[#0a8f43]">
								<Phone className="h-[15px] w-[15px]" />
							</span>
							<span className="flex min-w-0 flex-col gap-px">
								<span className="truncate text-[13px] font-semibold tracking-tight">{phone.nome}</span>
								<span className="truncate text-[11px] text-muted-foreground">
									{phone.numero}
									{phone.pagamentoStatus && phone.pagamentoStatus !== "VERIFICADO" && phone.pagamentoStatus !== "CONFIRMADO_PELO_USUARIO"
										? " · pagamento pendente"
										: null}
								</span>
							</span>
							{isSelected ? <CircleCheck className="absolute right-2 top-2 h-4 w-4 text-primary" /> : null}
						</button>
					);
				})}

				<button
					type="button"
					onClick={() => onSelect("")}
					className={cn(
						"relative flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-transparent p-2.5 text-left transition-colors hover:border-primary/40",
						!selectedPhoneId && "ring-2 ring-primary ring-inset",
					)}
				>
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<PhoneOff className="h-[15px] w-[15px]" />
					</span>
					<span className="flex min-w-0 flex-col gap-px">
						<span className="truncate text-[13px] font-semibold tracking-tight text-muted-foreground">Sem remetente WhatsApp</span>
						<span className="truncate text-[11px] text-muted-foreground">A campanha envia só por e-mail</span>
					</span>
				</button>
			</div>
		</div>
	);
}
