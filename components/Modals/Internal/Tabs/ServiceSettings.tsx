import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { updateServiceSettings } from "@/lib/mutations/tabs";
import { useServiceSettings } from "@/lib/queries/tabs";
import { cn } from "@/lib/utils";
import {
	DEFAULT_SERVICE_SETTINGS_CONFIGURATION,
	SERVICE_SETTINGS_PRESETS,
	type TServiceSettingsConfiguration,
	type TServiceSettingsPreset,
} from "@/schemas/service-settings";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, NotebookTabs, QrCode, Store, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// A UI oferece presets; persistimos as POLITICAS resultantes (modos nao sao entidades).
const PRESET_OPTIONS: { preset: TServiceSettingsPreset; title: string; description: string; icon: ReactNode }[] = [
	{ preset: "BALCAO", title: "Balcão", description: "Sem mesas nem comandas — venda avulsa pelo fluxo normal.", icon: <Store className="w-4 h-4" /> },
	{
		preset: "SOMENTE_MESAS",
		title: "Somente mesas",
		description: "Operador escolhe a mesa; a conta é aberta/reusada automaticamente.",
		icon: <LayoutGrid className="w-4 h-4" />,
	},
	{
		preset: "SOMENTE_COMANDAS",
		title: "Somente comandas",
		description: "Operador informa o código da comanda física; sem mesas.",
		icon: <NotebookTabs className="w-4 h-4" />,
	},
	{
		preset: "MESAS_E_COMANDAS",
		title: "Mesas + comandas",
		description: "Várias comandas por mesa, cada uma com código próprio.",
		icon: <UtensilsCrossed className="w-4 h-4" />,
	},
];

function matchesPreset(configuration: TServiceSettingsConfiguration, preset: TServiceSettingsPreset) {
	const target = SERVICE_SETTINGS_PRESETS[preset];
	// Compara apenas a forma de operação; as políticas de QR são independentes do preset.
	return (
		JSON.stringify({ pontos: target.pontos, contas: target.contas }) === JSON.stringify({ pontos: configuration.pontos, contas: configuration.contas })
	);
}

type ServiceSettingsProps = {
	closeModal: () => void;
};

export function ServiceSettings({ closeModal }: ServiceSettingsProps) {
	const queryClient = useQueryClient();
	const { data: persisted, isLoading, isError, error, queryKey } = useServiceSettings();
	const [configuration, setConfiguration] = useState<TServiceSettingsConfiguration>(DEFAULT_SERVICE_SETTINGS_CONFIGURATION);

	// Hidrata o estado local quando a configuração persistida chega.
	useEffect(() => {
		if (persisted) setConfiguration(persisted);
	}, [persisted]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-service-settings"],
		mutationFn: updateServiceSettings,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey });
			closeModal();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const contasHabilitadas = configuration.contas.habilitadas;
	// SOLICITACAO = operador aprova no inbox; DIRETO = lançado na hora (com teto por dispositivo e
	// fallback para o inbox quando o QR do ponto não identifica a comanda sozinho).
	const pedidosQrAtivos = configuration.pedidosCliente !== "DESABILITADO";
	const aprovacaoAutomatica = configuration.pedidosCliente === "DIRETO";

	return (
		<ResponsiveMenu
			menuTitle="MODO DE ATENDIMENTO"
			menuDescription="Escolha como sua operação trabalha com mesas e comandas."
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ configuracoes: configuration })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<div className="flex flex-col gap-2">
					{PRESET_OPTIONS.map((option) => (
						<button
							key={option.preset}
							type="button"
							onClick={() =>
								setConfiguration((prev) => ({
									...prev,
									// Preset define a FORMA de operar; as políticas de QR são preservadas.
									pontos: SERVICE_SETTINGS_PRESETS[option.preset].pontos,
									contas: SERVICE_SETTINGS_PRESETS[option.preset].contas,
								}))
							}
							className={cn(
								"flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
								matchesPreset(configuration, option.preset) ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
							)}
						>
							<div className="mt-0.5">{option.icon}</div>
							<div className="flex flex-col">
								<span className="text-sm font-bold tracking-tight">{option.title}</span>
								<span className="text-xs text-muted-foreground">{option.description}</span>
							</div>
						</button>
					))}
				</div>

				{contasHabilitadas ? (
					<div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
						<div className="flex items-center justify-between gap-3">
							<div className="flex flex-col gap-0.5">
								<span className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
									<QrCode className="h-3.5 w-3.5" />
									PEDIDOS PELO QR CODE
								</span>
								<span className="text-xs text-muted-foreground">O cliente monta o pedido pelo celular a partir do QR da mesa ou da comanda.</span>
							</div>
							<Switch
								checked={pedidosQrAtivos}
								onCheckedChange={(checked) =>
									setConfiguration((prev) => ({
										...prev,
										pedidosCliente: checked ? "SOLICITACAO" : "DESABILITADO",
										// Abertura pública acompanha o pedido via QR nesta versão.
										aberturaPublica: checked ? "SOLICITACAO" : "DESABILITADA",
									}))
								}
							/>
						</div>
						{pedidosQrAtivos ? (
							<>
								<div className="flex items-center justify-between gap-3 border-t border-border pt-2">
									<div className="flex flex-col gap-0.5">
										<span className="text-sm font-bold tracking-tight">LANÇAR SEM APROVAÇÃO</span>
										<span className="text-xs text-muted-foreground">
											{aprovacaoAutomatica
												? "O pedido entra na conta (e na cozinha) na hora. Quando o QR do ponto não identifica a comanda, ou após muitos pedidos seguidos do mesmo celular, ele cai no inbox para aprovação."
												: "Cada pedido entra como solicitação e só é lançado quando o operador aprovar no inbox."}
										</span>
									</div>
									<Switch
										checked={aprovacaoAutomatica}
										onCheckedChange={(checked) => setConfiguration((prev) => ({ ...prev, pedidosCliente: checked ? "DIRETO" : "SOLICITACAO" }))}
									/>
								</div>
								<p className="text-[0.7rem] text-muted-foreground">Imprima o QR de cada ponto (gerado ao criar ou regenerar o ponto) e cole na mesa.</p>
							</>
						) : null}
					</div>
				) : null}
			</div>
		</ResponsiveMenu>
	);
}
