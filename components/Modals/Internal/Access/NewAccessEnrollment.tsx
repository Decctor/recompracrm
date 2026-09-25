import type { TCreateEnrollmentChallengeInput, TCreateEnrollmentChallengeOutput } from "@/app/api/access/enrollments/route";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createAccessEnrollmentChallenge } from "@/lib/mutations/access";
import type { TAccessPrincipalListItem } from "@/lib/queries/access";
import { copyToClipboard } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AppWindow, Check, Copy, Monitor, TabletSmartphone, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ENROLLABLE_CLIENTS = [
	{
		codigo: "RECOMPRA_POI_MOBILE",
		titulo: "Aplicativo no tablet",
		descricao: "Tablet Android com o aplicativo POI instalado via APK.",
		permissoesDescricao: "apenas as permissões do fluxo de Ponto de Interação",
		icon: TabletSmartphone,
	},
	{
		codigo: "RECOMPRA_POI_WEB",
		titulo: "Kiosk no navegador",
		descricao: "Computador ou tablet operando o POI direto no navegador.",
		permissoesDescricao: "apenas as permissões do fluxo de Ponto de Interação",
		icon: AppWindow,
	},
	{
		codigo: "RECOMPRA_LOCAL_AGENT",
		titulo: "Agente desktop",
		descricao: "Aplicativo desktop para controle de periféricos da loja (impressoras etc.).",
		permissoesDescricao: "apenas as permissões do agente desktop (periféricos)",
		icon: Monitor,
	},
] as const;

type NewAccessEnrollmentProps = {
	closeModal: () => void;
	principals: TAccessPrincipalListItem[];
	initialAccessClientCodigo: string;
	callbacks?: {
		onMutate?: (variables: TCreateEnrollmentChallengeInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function NewAccessEnrollment({ closeModal, principals, initialAccessClientCodigo, callbacks }: NewAccessEnrollmentProps) {
	const [accessClientCodigo, setAccessClientCodigo] = useState(initialAccessClientCodigo);
	const [nomeSugerido, setNomeSugerido] = useState("");
	const [challenge, setChallenge] = useState<TCreateEnrollmentChallengeOutput["data"] | null>(null);
	const [existingPrincipalIds, setExistingPrincipalIds] = useState<string[]>([]);
	const connectedPrincipal = challenge
		? principals.find(
				(principal) =>
					!existingPrincipalIds.includes(principal.id) &&
					principal.tipo === (challenge.accessClientCodigo === "RECOMPRA_LOCAL_AGENT" ? "AGENTE_DESKTOP" : "DISPOSITIVO"),
			)
		: null;

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-access-enrollment-challenge"],
		mutationFn: createAccessEnrollmentChallenge,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			setExistingPrincipalIds(principals.map((principal) => principal.id));
			callbacks?.onSuccess?.();
			toast.success(data.message);
			setChallenge(data.data);
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	if (challenge) {
		return (
			<ResponsiveMenu
				menuTitle={connectedPrincipal ? "DISPOSITIVO ATIVADO" : "CÓDIGO DE ATIVAÇÃO"}
				menuDescription={
					connectedPrincipal ? "O dispositivo já aparece na sua organização." : "Digite este código no dispositivo para concluir a ativação."
				}
				mode="read-only"
				menuCancelButtonText="FECHAR"
				stateIsLoading={false}
				stateError={null}
				closeMenu={closeModal}
			>
				<div className="flex w-full flex-col items-center gap-4 py-4">
					{connectedPrincipal ? <p className="text-sm font-semibold text-primary">{connectedPrincipal.nome} ativado com sucesso.</p> : null}
					{!connectedPrincipal ? (
						<div className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-8">
							<span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Código de ativação</span>
							<span className="select-all text-center text-3xl font-extrabold tracking-[0.18em] text-primary lg:text-4xl">{challenge.code}</span>
							<Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => copyToClipboard(challenge.code)}>
								<Copy className="h-4 w-4 min-h-4 min-w-4" />
								COPIAR CÓDIGO
							</Button>
						</div>
					) : null}
					{!connectedPrincipal ? (
						<div className="flex w-full flex-col gap-1.5 text-center">
							<p className="text-sm text-muted-foreground">
								Válido até <span className="font-semibold text-foreground">{dayjs(challenge.expiraEm).format("HH:mm")}</span>. Abra o dispositivo, acesse a
								tela de ativação e informe o código.
							</p>
							<p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground">
								<TriangleAlert className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
								Este código não será exibido novamente.
							</p>
						</div>
					) : null}
				</div>
			</ResponsiveMenu>
		);
	}

	return (
		<ResponsiveMenu
			menuTitle="ATIVAR DISPOSITIVO"
			menuDescription="Gere um código de ativação de uso único para vincular um novo dispositivo à sua organização."
			menuActionButtonText="GERAR CÓDIGO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ accessClientCodigo, nomeSugerido: nomeSugerido.trim() || null })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex w-full flex-col gap-4">
				<div className="flex w-full flex-col gap-2">
					<span className="text-sm font-medium tracking-tight text-foreground/80">Tipo de dispositivo</span>
					<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
						{ENROLLABLE_CLIENTS.map((client) => {
							const isSelected = accessClientCodigo === client.codigo;
							return (
								<button
									key={client.codigo}
									type="button"
									aria-pressed={isSelected}
									onClick={() => setAccessClientCodigo(client.codigo)}
									className={cn(
										"flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
										isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent",
									)}
								>
									<div className="flex w-full items-center justify-between gap-2">
										<client.icon className={cn("h-5 w-5 min-h-5 min-w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
										{isSelected ? <Check className="h-4 w-4 min-h-4 min-w-4 text-primary" /> : null}
									</div>
									<div className="flex flex-col gap-0.5">
										<span className="text-sm font-semibold">{client.titulo}</span>
										<span className="text-xs text-muted-foreground">{client.descricao}</span>
									</div>
								</button>
							);
						})}
					</div>
				</div>
				<TextInput
					label="NOME DO DISPOSITIVO"
					value={nomeSugerido}
					placeholder="Ex: Tablet do balcão principal"
					handleChange={(value) => setNomeSugerido(value)}
				/>
				<p className="text-xs text-muted-foreground">
					O código expira em 15 minutos e vale para uma única ativação. O dispositivo receberá{" "}
					{ENROLLABLE_CLIENTS.find((client) => client.codigo === accessClientCodigo)?.permissoesDescricao ??
						"apenas as permissões previstas para este tipo de dispositivo"}
					.
				</p>
			</div>
		</ResponsiveMenu>
	);
}

export default NewAccessEnrollment;
