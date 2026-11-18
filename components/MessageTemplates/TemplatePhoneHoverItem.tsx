"use client";

import type { ReactNode } from "react";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TMessageTemplatePhoneQualityEnum, TMessageTemplatePhoneStatusEnum } from "@/schemas/enums";
import { CircleGauge, Eye, Phone, Plus } from "lucide-react";

type TemplatePhoneHoverItemProps = {
	phoneLabel: string;
	templatePhone: {
		id: string;
		status: TMessageTemplatePhoneStatusEnum;
		qualidade: TMessageTemplatePhoneQualityEnum;
	} | null;
	/** Ausente quando o membro não pode enviar o template à Meta (comunicacao.publicar). */
	onAdd?: () => void;
	onView: (id: string) => void;
	isAdding?: boolean;
};

function statusBadgeClass(status: TMessageTemplatePhoneStatusEnum) {
	return cn("rounded-md px-2 py-0.5 text-[0.65rem] font-bold", {
		"bg-blue-500 text-white": status === "APROVADO",
		"bg-primary/20 text-foreground": status === "PENDENTE",
		"bg-red-500 text-white": status === "REJEITADO",
		"bg-orange-500 text-white": status === "PAUSADO",
		"bg-gray-500 text-white": status === "DESABILITADO" || status === "RASCUNHO",
	});
}

function TemplatePhoneDataRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex w-full flex-col gap-1">
			<span className="text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}

export function TemplatePhoneHoverItem({ phoneLabel, templatePhone, onAdd, onView, isAdding = false }: TemplatePhoneHoverItemProps) {
	return (
		<div className="flex w-full flex-col gap-2.5 rounded-lg border border-border/80 bg-muted/30 p-2.5">
			<TemplatePhoneDataRow label="Número">
				<div className="flex min-w-0 items-center gap-1.5">
					<Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<span className="truncate text-xs font-medium text-foreground">{phoneLabel}</span>
				</div>
			</TemplatePhoneDataRow>

			<TemplatePhoneDataRow label="Status do template">
				{templatePhone ? (
					<div className="flex w-full items-center justify-between gap-2">
						<div className="flex min-w-0 flex-wrap items-center gap-1.5">
							<span className={statusBadgeClass(templatePhone.status)}>{templatePhone.status}</span>
							<div className="flex items-center gap-1 text-muted-foreground">
								<CircleGauge className="h-3.5 w-3.5 shrink-0" />
								<span className="text-[0.65rem] font-medium text-foreground/80">{templatePhone.qualidade}</span>
							</div>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="fit"
							className="shrink-0 rounded-lg px-2 py-1 text-[0.65rem]"
							onClick={() => onView(templatePhone.id)}
						>
							<Eye className="h-3.5 w-3.5" />
							<span className="sr-only">Ver detalhes</span>
						</Button>
					</div>
				) : !onAdd ? (
					<span className="text-[0.65rem] font-medium text-muted-foreground">NÃO ENVIADO</span>
				) : (
					<LoadingButton type="button" onClick={onAdd} variant="outline" size="xs" className="flex items-center gap-1.5 text-xs" loading={isAdding}>
						<Plus className="h-3 w-3" />
						ADICIONAR
					</LoadingButton>
				)}
			</TemplatePhoneDataRow>
		</div>
	);
}
