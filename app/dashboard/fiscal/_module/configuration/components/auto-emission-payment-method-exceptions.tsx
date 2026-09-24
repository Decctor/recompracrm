"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { TUseInternalFiscalSettingsState } from "@/state-hooks/use-internal-fiscal-settings-state";
import {
	Banknote,
	Barcode,
	CircleEllipsis,
	CreditCard,
	Gift,
	HelpCircle,
	Landmark,
	NotebookPen,
	QrCode,
	Ticket,
	type LucideIcon,
} from "lucide-react";

const AUTO_EMISSION_PAYMENT_METHOD_OPTIONS: Array<{
	value: TPaymentMethodEnum;
	label: string;
	icon: LucideIcon;
}> = [
	{ value: "DINHEIRO", label: "Dinheiro", icon: Banknote },
	{ value: "PIX", label: "PIX", icon: QrCode },
	{ value: "CARTAO_CREDITO", label: "Cartão de crédito", icon: CreditCard },
	{ value: "CARTAO_DEBITO", label: "Cartão de débito", icon: CreditCard },
	{ value: "BOLETO", label: "Boleto", icon: Barcode },
	{ value: "TRANSFERENCIA", label: "Transferência", icon: Landmark },
	{ value: "CASHBACK", label: "Cashback", icon: Gift },
	{ value: "VALE", label: "Vale", icon: Ticket },
	{ value: "A_DEFINIR", label: "A definir", icon: HelpCircle },
	{ value: "FIADO_NOTA", label: "Fiado (nota)", icon: NotebookPen },
	{ value: "OUTRO", label: "Outro", icon: CircleEllipsis },
];

type AutoEmissionPaymentMethodExceptionsProps = {
	fiscalConfig: TUseInternalFiscalSettingsState["state"]["fiscalConfiguracao"];
	updateFiscalConfig: TUseInternalFiscalSettingsState["updateFiscalConfig"];
};

export function AutoEmissionPaymentMethodExceptions({ fiscalConfig, updateFiscalConfig }: AutoEmissionPaymentMethodExceptionsProps) {
	const pagamentoExclusivo = fiscalConfig.emissaoAutomatica.excecoes.pagamentoExclusivo;

	const toggleMethod = (metodo: TPaymentMethodEnum, emitir: boolean) => {
		const next = emitir ? pagamentoExclusivo.filter((item) => item !== metodo) : [...new Set([...pagamentoExclusivo, metodo])];
		// Espalha o objeto atual: `normalizeFiscalConfig` substitui `emissaoAutomatica` inteiro pelo
		// patch, e sem isto o atraso configurado voltaria ao padrão a cada toggle.
		updateFiscalConfig({
			emissaoAutomatica: { ...fiscalConfig.emissaoAutomatica, excecoes: { ...fiscalConfig.emissaoAutomatica.excecoes, pagamentoExclusivo: next } },
		});
	};

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div>
				<Label>EMISSÃO POR MÉTODO DE PAGAMENTO</Label>
				<p className="text-sm text-muted-foreground">
					A emissão automática é pausada quando a venda for paga <span className="font-semibold">somente</span> com métodos desativados abaixo — um mix com
					qualquer método ativo emite normalmente.
				</p>
			</div>
			<div className="divide-y rounded-lg border">
				{AUTO_EMISSION_PAYMENT_METHOD_OPTIONS.map((method) => {
					const Icon = method.icon;
					const emitir = !pagamentoExclusivo.includes(method.value);
					return (
						<div key={method.value} className="flex items-center justify-between gap-3 px-3 py-2.5">
							<div className="flex items-center gap-3">
								<span className="flex size-8 items-center justify-center rounded-lg bg-muted">
									<Icon className="size-4" />
								</span>
								<div>
									<p className="text-sm font-semibold">{method.label}</p>
									{!emitir ? <p className="text-xs text-muted-foreground">Não emite quando for a única forma de pagamento.</p> : null}
								</div>
							</div>
							<Switch checked={emitir} onCheckedChange={(checked) => toggleMethod(method.value, checked)} />
						</div>
					);
				})}
			</div>
		</div>
	);
}
