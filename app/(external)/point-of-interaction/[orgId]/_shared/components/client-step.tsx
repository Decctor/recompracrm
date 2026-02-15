"use client";

import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { formatToCPForCNPJ, formatToMoney, formatToPhone } from "@/lib/formatting";
import { useAutoScrollOnFocus } from "@/lib/hooks/use-auto-scroll-on-focus";
import { Loader2, UserPlus } from "lucide-react";
import React from "react";
import { useAutoAdvanceTimer } from "../hooks/use-auto-advance-timer";
import { usePoiSounds } from "../hooks/use-poi-sounds";
import type { TClientData, TNewClientFormData } from "../types";

type NewClientAction = {
	label: string;
	loadingLabel: string;
	onSubmit: () => void;
	isPending: boolean;
};

type ClientStepProps = {
	client: TClientData;
	phone: string;
	onPhoneChange: (phone: string) => void;
	newClientData: TNewClientFormData;
	onNewClientChange: (data: Partial<TNewClientFormData>) => void;
	isLoadingClient: boolean;
	isSuccessClient: boolean;
	onSubmit: () => void;
	onCancelSearch: () => void;
	newClientAction?: NewClientAction | null;
};

export function ClientStep({
	client,
	phone,
	onPhoneChange,
	newClientData,
	onNewClientChange,
	isLoadingClient,
	isSuccessClient,
	onSubmit,
	onCancelSearch,
	newClientAction,
}: ClientStepProps) {
	const handleScrollOnFocus = useAutoScrollOnFocus(300);
	const { playAction } = usePoiSounds();

	const { countdown, countdownSeconds, isAdvancing, wasCancelled, cancel, resetCancellation } = useAutoAdvanceTimer({
		shouldStart: isSuccessClient && !!client,
		onAdvance: onSubmit,
	});

	// Reset cancellation when user starts typing a new phone number
	React.useEffect(() => {
		if (phone && wasCancelled) {
			resetCancellation();
		}
	}, [phone, wasCancelled, resetCancellation]);

	// Play sound when client is found
	React.useEffect(() => {
		if (isSuccessClient && client && !wasCancelled) {
			playAction();
		}
	}, [isSuccessClient, client, wasCancelled, playAction]);

	// Keep phone in sync with lookup
	React.useEffect(() => {
		if (phone && phone !== newClientData.telefone) {
			onNewClientChange({ telefone: phone });
		}
	}, [phone, newClientData.telefone, onNewClientChange]);

	function handleCancelAdvance() {
		cancel();
		onCancelSearch();
	}

	const showFoundClientCard = isSuccessClient && client && !isAdvancing && !wasCancelled;
	const showInput = !showFoundClientCard && !isAdvancing;
	const isNewClient = isSuccessClient && !client;

	const handleFormSubmit = () => {
		if (isNewClient && newClientAction) {
			if (!newClientData.nome || !newClientData.telefone) {
				return;
			}
			newClientAction.onSubmit();
		} else {
			onSubmit();
		}
	};

	return (
		<form
			className="space-y-8 short:space-y-2 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				handleFormSubmit();
			}}
		>
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-black uppercase tracking-tight">Quem é o cliente?</h2>
				<p className="text-muted-foreground short:text-xs">Digite o número de telefone para localizar o perfil.</p>
			</div>

			{showInput ? (
				<>
					<div className="max-w-md mx-auto">
						<TextInput
							label="TELEFONE"
							inputType="tel"
							placeholder="(00) 00000-0000"
							value={phone}
							handleChange={onPhoneChange}
							onFocus={handleScrollOnFocus}
						/>
					</div>
					{isLoadingClient ? (
						<div className="w-full flex items-center justify-center gap-1.5">
							<Loader2 className="w-4 h-4 short:w-3 short:h-3 animate-spin" />
							<p className="text-sm short:text-xs text-muted-foreground">Buscando registros...</p>
						</div>
					) : null}
				</>
			) : null}

			{showFoundClientCard && client ? (
				<div className="bg-green-50 border-2 short:border border-green-200 rounded-3xl short:rounded-xl p-6 short:p-2.5 flex flex-col items-center gap-4 short:gap-2 animate-in zoom-in">
					<div className="text-center">
						<p className="text-xs short:text-[0.65rem] font-bold text-green-600 uppercase tracking-widest mb-1 short:mb-0">
							✓ Perfil Encontrado
						</p>
						<p className="text-green-900 font-black text-2xl short:text-base uppercase italic">{client.nome}</p>
						<p className="text-green-600 font-bold short:text-xs">{formatToPhone(client.telefone)}</p>
					</div>
					<div className="bg-green-600 w-full rounded-2xl short:rounded-lg p-4 short:p-2 text-center text-white shadow-md">
						<p className="text-[0.6rem] short:text-[0.6rem] font-bold opacity-80 uppercase tracking-widest">Saldo Disponível</p>
						<p className="text-3xl short:text-xl font-black">{formatToMoney(client.saldos[0]?.saldoValorDisponivel ?? 0)}</p>
					</div>

					{/* Progress bar and countdown */}
					<div className="w-full flex flex-col gap-2 short:gap-0.5">
						<div className="w-full h-2 short:h-1 bg-green-200 rounded-full overflow-hidden">
							<div
								className="h-full bg-green-600 transition-all duration-1000 ease-linear"
								style={{ width: `${((countdown ?? 0) / countdownSeconds) * 100}%` }}
							/>
						</div>
						<p className="text-sm short:text-[0.6rem] text-green-700 text-center font-medium">
							Avançando em {countdown} segundo{countdown !== 1 ? "s" : ""}...
						</p>
					</div>

					<Button
						type="button"
						variant="outline"
						size="fit"
						className="w-full p-4 short:p-2.5 font-black border-green-300 text-green-700 hover:bg-green-100 short:text-sm"
						onClick={handleCancelAdvance}
					>
						CANCELAR
					</Button>
				</div>
			) : null}

			{isAdvancing ? (
				<div className="w-full flex flex-col items-center justify-center gap-3 short:gap-1 py-8 short:py-2">
					<Loader2 className="w-8 h-8 short:w-5 short:h-5 text-green-600 animate-spin" />
					<p className="text-sm short:text-xs text-muted-foreground font-medium">Avançando...</p>
				</div>
			) : null}

			{isNewClient && showInput ? (
				<div className="bg-blue-50 border-2 short:border border-blue-200 rounded-3xl short:rounded-xl p-6 short:p-2.5 animate-in zoom-in">
					<div className="flex items-center gap-3 short:gap-1.5 mb-4 short:mb-2">
						<div className="p-2 short:p-1 bg-blue-600 rounded-lg short:rounded text-white">
							<UserPlus className="w-5 h-5 short:w-3.5 short:h-3.5" />
						</div>
						<div>
							<h3 className="font-black uppercase text-blue-900 short:text-xs">NOVO CLIENTE</h3>
							<p className="text-xs short:text-[0.65rem] text-blue-600">Complete os dados para criar o seu cadastro!</p>
						</div>
					</div>
					<div className="w-full flex flex-col gap-1.5 short:gap-0.5">
						<TextInput
							label="NOME COMPLETO"
							placeholder="Digite o nome do cliente"
							value={newClientData.nome}
							handleChange={(value) => onNewClientChange({ nome: value })}
							onFocus={handleScrollOnFocus}
							width="100%"
						/>
						<TextInput
							label="CPF/CNPJ"
							inputType="tel"
							placeholder="Digite o CPF/CNPJ do cliente"
							value={newClientData.cpfCnpj || ""}
							handleChange={(value) => onNewClientChange({ cpfCnpj: formatToCPForCNPJ(value) })}
							onFocus={handleScrollOnFocus}
							width="100%"
						/>
					</div>
					{newClientAction ? (
						<Button
							type="submit"
							size="lg"
							disabled={newClientAction.isPending || !newClientData.nome || !newClientData.telefone}
							className="w-full mt-4 short:mt-2 rounded-2xl short:rounded-lg h-16 short:h-11 text-lg short:text-base font-bold shadow-lg shadow-blue-600/20 bg-blue-600 hover:bg-blue-700 uppercase tracking-widest"
						>
							{newClientAction.isPending ? (
								<>
									<Loader2 className="w-5 h-5 short:w-4 short:h-4 mr-2 animate-spin" />
									{newClientAction.loadingLabel}
								</>
							) : (
								<>
									<UserPlus className="w-5 h-5 short:w-4 short:h-4 mr-2" />
									{newClientAction.label}
								</>
							)}
						</Button>
					) : null}
				</div>
			) : null}
		</form>
	);
}
