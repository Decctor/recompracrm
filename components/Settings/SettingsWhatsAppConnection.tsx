"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import ViewConnectionPhone, { type TViewConnectionPhoneContext } from "@/components/Modals/WhatsappConnections/ViewConnectionPhone";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToPhone } from "@/lib/formatting";
import { disconnectInternalGateway } from "@/lib/mutations/internal-gateway";
import { deleteWhatsappConnection } from "@/lib/mutations/whatsapp-connections";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Cloud, Loader2, PlusIcon, QrCode, RefreshCw, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import ErrorComponent from "../Layouts/ErrorComponent";
import { MetaIcon, RecompraCRMIconColorful, WhatsappIcon } from "../icons";
import { LoadingButton } from "../loading-button";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { InternalGatewayQRConnect } from "./InternalGatewayQRConnect";

type TWhatsappConnection = TGetWhatsappConnectionsOutput["data"][number];
type TWhatsappConnectionPhone = TWhatsappConnection["telefones"][number];

type SettingsWhatsAppConnectionProps = {
	user: TAuthUserSession["user"];
};

export default function SettingsWhatsAppConnection({ user }: SettingsWhatsAppConnectionProps) {
	const { data: whatsappConnections, isPending, isError } = useWhatsappConnections();
	const [selectedPhoneContext, setSelectedPhoneContext] = useState<TViewConnectionPhoneContext | null>(null);

	return (
		<div className="flex h-full grow flex-col gap-3">
			{isPending ? (
				<div className="flex w-full items-center justify-center py-8">
					<Loader2 className="text-foreground/60 h-6 w-6 animate-spin" />
				</div>
			) : isError ? (
				<ErrorComponent msg="Não foi possível carregar suas conexões do WhatsApp." />
			) : (
				<div className="flex w-full flex-col gap-3">
					<IntegrationWithInternalGateway connections={whatsappConnections || []} onPhoneClick={setSelectedPhoneContext} />
					<IntegrationWithMetaCloud connections={whatsappConnections || []} onPhoneClick={setSelectedPhoneContext} />
				</div>
			)}
			{selectedPhoneContext ? <ViewConnectionPhone context={selectedPhoneContext} closeMenu={() => setSelectedPhoneContext(null)} /> : null}
		</div>
	);
}

type ConnectionStatusBadgeProps = {
	isActive: boolean;
	label?: string;
};
function ConnectionStatusBadge({ isActive, label }: ConnectionStatusBadgeProps) {
	return (
		<Badge className={cn("flex items-center gap-1", isActive ? "bg-green-200 text-green-800" : "bg-muted text-muted-foreground")}>
			{label ?? (isActive ? "ATIVA" : "INATIVA")}
		</Badge>
	);
}

type GatewayStatus = "connected" | "connecting" | "qr" | "disconnected";

type GatewayStatusBadgeProps = {
	status: GatewayStatus;
};
function GatewayStatusBadge({ status }: GatewayStatusBadgeProps) {
	switch (status) {
		case "connected":
			return (
				<Badge className="flex items-center gap-1 bg-green-200 text-green-800">
					<Wifi className="h-3 w-3" />
					<span className="text-xs font-bold">CONECTADO</span>
				</Badge>
			);
		case "qr":
			return (
				<Badge className="flex items-center gap-1 bg-yellow-200 text-yellow-800">
					<QrCode className="h-3 w-3" />
					<span className="text-xs font-bold">AGUARDANDO QR</span>
				</Badge>
			);
		case "connecting":
			return (
				<Badge className="flex items-center gap-1 bg-blue-200 text-blue-800">
					<Loader2 className="h-3 w-3 animate-spin" />
					<span className="text-xs font-bold">CONECTANDO</span>
				</Badge>
			);
		default:
			return (
				<Badge className="flex items-center gap-1 bg-red-200 text-red-800">
					<WifiOff className="h-3 w-3" />
					<span className="text-xs font-bold">DESCONECTADO</span>
				</Badge>
			);
	}
}

type ConnectionDetailRowProps = {
	icon: React.ReactNode;
	label: string;
	children: React.ReactNode;
};
function ConnectionDetailRow({ icon, label, children }: ConnectionDetailRowProps) {
	return (
		<div className="flex flex-col items-start gap-x-2 gap-y-1 lg:flex-row lg:items-center">
			<div className="flex items-center gap-2">
				{icon}
				<p className="text-foreground/80 text-xs">{label}</p>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">{children}</div>
		</div>
	);
}

type ConnectionPhonePillsProps = {
	phones: Array<{ phone: TWhatsappConnectionPhone; connection: TWhatsappConnection }>;
	onPhoneClick: (context: TViewConnectionPhoneContext) => void;
	tone?: "meta" | "gateway";
};
function ConnectionPhonePills({ phones, onPhoneClick, tone = "meta" }: ConnectionPhonePillsProps) {
	if (!phones.length) return <span className="text-foreground/50 text-xs italic">Nenhum telefone vinculado</span>;

	return (
		<>
			{phones.map(({ phone, connection }) => (
				<button
					key={phone.id}
					type="button"
					onClick={() =>
						onPhoneClick({
							phone,
							connection,
							totalPhonesInConnection: connection.telefones.length,
						})
					}
					className={cn(
						"flex items-center gap-1.5 rounded-lg px-2 py-1 transition-transform hover:scale-[1.01] active:scale-[0.96]",
						tone === "meta" && "bg-whatsapp/15 text-[#1a9e4a] hover:bg-whatsapp/20",
						tone === "gateway" && "bg-[#24549C]/10 text-[#24549C] hover:bg-[#24549C]/15",
					)}
				>
					<span className="max-w-32 truncate text-xs font-bold tracking-tight">{phone.nome}</span>
					<span className="text-xs font-medium tracking-tight opacity-80">{formatToPhone(phone.numero)}</span>
				</button>
			))}
		</>
	);
}

type IntegrationWithMetaCloudProps = {
	connections: TGetWhatsappConnectionsOutput["data"];
	onPhoneClick: (context: TViewConnectionPhoneContext) => void;
};
function IntegrationWithMetaCloud({ connections, onPhoneClick }: IntegrationWithMetaCloudProps) {
	const metaConnections = connections.filter((c) => c.tipoConexao === "META_CLOUD_API");
	const primaryConnection = metaConnections[0] ?? null;
	const isConnected = metaConnections.length > 0;
	const connectionPhones = metaConnections.flatMap((connection) =>
		connection.telefones.map((phone) => ({
			phone,
			connection,
		})),
	);

	const queryClient = useQueryClient();
	const { mutate: handleDisconnect, isPending: isDisconnecting } = useMutation({
		mutationKey: ["delete-whatsapp-connection", primaryConnection?.id],
		mutationFn: deleteWhatsappConnection,
		onMutate: () => queryClient.cancelQueries({ queryKey: ["whatsapp-connection"] }),
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] }),
	});

	return (
		<div className="border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full items-start gap-3">
				<div className="flex shrink-0 items-center -space-x-3 overflow-visible">
					<div className="ring-background z-10 flex h-16 min-h-16 w-16 min-w-16 items-center justify-center rounded-full bg-[#0869E1] ring-2">
						<MetaIcon className="h-8 w-8 text-white" />
					</div>
					<div className="ring-background flex h-16 min-h-16 w-16 min-w-16 items-center justify-center rounded-full bg-whatsapp ring-2">
						<WhatsappIcon className="h-8 w-8 text-white" />
					</div>
				</div>
				<div className="flex grow flex-col gap-1.5 pt-1">
					<div className="w-full flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<h1 className="text-xs font-bold tracking-tight lg:text-sm">WhatsApp Cloud API</h1>
							<ConnectionStatusBadge isActive={isConnected} />
						</div>
						{isConnected && metaConnections.length === 1 && primaryConnection ? (
							<LoadingButton
								variant="ghost"
								size="xs"
								className="hover:bg-destructive/10 hover:text-destructive w-fit"
								loading={isDisconnecting}
								onClick={() => handleDisconnect(primaryConnection.id)}
							>
								DESCONECTAR
							</LoadingButton>
						) : !isConnected ? (
							<Link href="/api/integrations/whatsapp/auth">
								<Button size="xs" className="flex items-center gap-1">
									<Cloud className="h-4 w-4" />
									CONECTAR COM META
								</Button>
							</Link>
						) : null}
					</div>
					<p className="text-foreground/70 text-xs font-medium tracking-tight">Conecte seu WhatsApp Cloud API para enviar e receber mensagens.</p>
					<div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
						{isConnected ? (
							<>
								<ConnectionPhonePills phones={connectionPhones} onPhoneClick={onPhoneClick} tone="meta" />
								<Button variant="ghost" size="xs" className="flex items-center gap-1" asChild>
									<Link href="/api/integrations/whatsapp/auth">
										<PlusIcon className="h-4 w-4" />
										ADICIONAR NOVO
									</Link>
								</Button>
							</>
						) : null}
					</div>
				</div>
			</div>

			{isConnected && metaConnections.length === 1 && primaryConnection?.dataExpiracao ? (
				<ConnectionDetailRow icon={<Calendar className="h-4 w-4" />} label="EXPIRAÇÃO DO TOKEN:">
					<p className="text-xs font-bold">{formatDateAsLocale(new Date(primaryConnection.dataExpiracao), true) || "N/A"}</p>
				</ConnectionDetailRow>
			) : null}
		</div>
	);
}

type IntegrationWithInternalGatewayProps = {
	connections: TGetWhatsappConnectionsOutput["data"];
	onPhoneClick: (context: TViewConnectionPhoneContext) => void;
};
function IntegrationWithInternalGateway({ connections, onPhoneClick }: IntegrationWithInternalGatewayProps) {
	const queryClient = useQueryClient();
	const [showQRConnect, setShowQRConnect] = useState(false);

	const internalGatewayConnections = connections.filter((c) => c.tipoConexao === "INTERNAL_GATEWAY");
	const connectionPhones = internalGatewayConnections.flatMap((connection) =>
		connection.telefones.map((phone) => ({
			phone,
			connection,
		})),
	);
	const primaryConnection = internalGatewayConnections[0] ?? null;
	const gatewayStatus = (primaryConnection?.gatewayStatus as GatewayStatus | null) ?? "disconnected";
	const isConnected = internalGatewayConnections.length > 0;
	const isActive = internalGatewayConnections.some((connection) => connection.gatewayStatus === "connected");

	const { mutate: handleDisconnect, isPending: isDisconnecting } = useMutation({
		mutationKey: ["disconnect-internal-gateway", primaryConnection?.id],
		mutationFn: (id: string) => disconnectInternalGateway(id),
		onMutate: () => queryClient.cancelQueries({ queryKey: ["whatsapp-connection"] }),
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] }),
	});

	return (
		<>
			{showQRConnect ? (
				<InternalGatewayQRConnect
					onBack={() => setShowQRConnect(false)}
					onSuccess={() => {
						setShowQRConnect(false);
						queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
					}}
				/>
			) : null}
			<div className="border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex w-full items-start gap-3">
					<div className="flex shrink-0 items-center -space-x-3 overflow-visible">
						<div className="ring-background z-10 flex h-16 min-h-16 w-16 min-w-16 items-center justify-center rounded-full bg-[#24549C] ring-2">
							<RecompraCRMIconColorful className="h-8 w-8" />
						</div>
						<div className="ring-background flex h-16 min-h-16 w-16 min-w-16 items-center justify-center rounded-full bg-whatsapp ring-2">
							<WhatsappIcon className="h-8 w-8 text-white" />
						</div>
					</div>
					<div className="flex grow flex-col gap-1.5 pt-1">
						<div className="w-full flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<h1 className="text-xs font-bold tracking-tight lg:text-sm">WhatsApp Gateway do Recompra CRM</h1>
								<ConnectionStatusBadge isActive={isActive} />
								{isConnected && <GatewayStatusBadge status={gatewayStatus} />}
							</div>
							{isConnected ? (
								<>
									{gatewayStatus !== "connected" ? (
										<Button
											variant="outline"
											size="xs"
											className="flex items-center gap-1"
											onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] })}
										>
											<RefreshCw className="h-4 w-4" />
											ATUALIZAR STATUS
										</Button>
									) : null}
									{internalGatewayConnections.length === 1 && primaryConnection ? (
										<LoadingButton
											variant="ghost"
											size="xs"
											className="hover:bg-destructive/10 hover:text-destructive w-fit"
											loading={isDisconnecting}
											onClick={() => handleDisconnect(primaryConnection.id)}
										>
											DESCONECTAR
										</LoadingButton>
									) : null}
								</>
							) : (
								<Button size="xs" className="flex items-center gap-1" onClick={() => setShowQRConnect(true)}>
									<QrCode className="h-4 w-4" />
									CONECTAR VIA QR CODE
								</Button>
							)}
						</div>
						<p className="text-foreground/70 text-xs font-medium tracking-tight">
							Conecte seu WhatsApp para uso não-oficial através do gateway do Recompra CRM para enviar e receber mensagens.
						</p>
						<div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
							{isConnected ? (
								<>
									<ConnectionPhonePills phones={connectionPhones} onPhoneClick={onPhoneClick} tone="gateway" />
									<Button variant="ghost" size="xs" className="flex items-center gap-1" onClick={() => setShowQRConnect(true)}>
										<PlusIcon className="h-4 w-4" />
										ADICIONAR NOVO
									</Button>
								</>
							) : null}
						</div>
					</div>
				</div>

				{isConnected && !isActive ? (
					<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
						<p className="text-xs text-yellow-800">
							<strong>Atenção:</strong> Sua conexão com o WhatsApp está inativa. Para continuar enviando e recebendo mensagens, reconecte escaneando um novo QR
							Code.
						</p>
					</div>
				) : null}
			</div>
		</>
	);
}
