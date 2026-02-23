"use client";

import type { TGetWhatsappConnectionOutput } from "@/app/api/whatsapp-connections/route";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { disconnectInternalGateway } from "@/lib/mutations/internal-gateway";
import { deleteWhatsappConnection } from "@/lib/mutations/whatsapp-connections";
import { useWhatsappConnection } from "@/lib/queries/whatsapp-connections";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Calendar, Cloud, Key, Loader2, Phone, QrCode, RefreshCw, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import ErrorComponent from "../Layouts/ErrorComponent";
import { LoadingButton } from "../loading-button";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { InternalGatewayQRConnect } from "./InternalGatewayQRConnect";
import { type WhatsAppConnectionType, WhatsAppConnectionTypeSelector } from "./WhatsAppConnectionTypeSelector";

type SettingsWhatsAppConnectionProps = {
	user: TAuthUserSession["user"];
};

export default function SettingsWhatsAppConnection({ user }: SettingsWhatsAppConnectionProps) {
	const queryClient = useQueryClient();
	const { data: whatsappConnection, queryKey, isPending, isError, isSuccess } = useWhatsappConnection();

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	return (
		<div className="flex h-full grow flex-col">
			<div className="border-primary/20 flex w-full flex-col items-center justify-between border-b pb-2 lg:flex-row">
				<div className="flex flex-col">
					<h1 className="text-lg font-bold">Conexão com o WhatsApp</h1>
					<p className="text-sm text-primary/60">Gerencie a conexão do WhatsApp</p>
				</div>
			</div>
			{isPending ? <h3 className="text-sm text-primary/60 animate-pulse py-4">Carregando conexao...</h3> : null}
			{isError ? <ErrorComponent msg="Erro ao carregar conexao do WhatsApp." /> : null}
			{isSuccess ? (
				whatsappConnection ? (
					<WhatsAppConnectionBlockConnected whatsappConnection={whatsappConnection} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
				) : (
					<WhatsAppConnectionBlockUnconnected onSuccess={handleOnSettled} />
				)
			) : null}
		</div>
	);
}

type WhatsAppConnectionBlockUnconnectedProps = {
	onSuccess: () => void;
};

function WhatsAppConnectionBlockUnconnected({ onSuccess }: WhatsAppConnectionBlockUnconnectedProps) {
	const [selectedType, setSelectedType] = useState<WhatsAppConnectionType | null>(null);
	const [showQRConnect, setShowQRConnect] = useState(false);

	// Show QR connect flow for Internal Gateway
	if (selectedType === "INTERNAL_GATEWAY" && showQRConnect) {
		return (
			<div className="py-4">
				<InternalGatewayQRConnect
					onBack={() => {
						setShowQRConnect(false);
						setSelectedType(null);
					}}
					onSuccess={onSuccess}
				/>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-4 py-4">
			<p className="text-sm text-primary/60">Voce ainda nao possui uma conexão com o WhatsApp configurada.</p>

			<WhatsAppConnectionTypeSelector selectedType={selectedType} onSelectType={setSelectedType} />

			{selectedType && (
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={() => setSelectedType(null)}>
						Cancelar
					</Button>
					{selectedType === "META_CLOUD_API" ? (
						<Link href="/api/integrations/whatsapp/auth">
							<Button>
								<Cloud className="h-4 w-4 mr-2" />
								Conectar com Meta
							</Button>
						</Link>
					) : (
						<Button onClick={() => setShowQRConnect(true)}>
							<QrCode className="h-4 w-4 mr-2" />
							Continuar com QR Code
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

type WhatsAppConnectionBlockConnectedProps = {
	whatsappConnection: Exclude<TGetWhatsappConnectionOutput["data"], null>;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

function WhatsAppConnectionBlockConnected({ whatsappConnection, callbacks }: WhatsAppConnectionBlockConnectedProps) {
	const connectionType = whatsappConnection.tipoConexao || "META_CLOUD_API";

	// Render appropriate details based on connection type
	if (connectionType === "INTERNAL_GATEWAY") {
		return <InternalGatewayConnectionDetails whatsappConnection={whatsappConnection} callbacks={callbacks} />;
	}

	return <MetaCloudAPIConnectionDetails whatsappConnection={whatsappConnection} callbacks={callbacks} />;
}

// Meta Cloud API connection details
function MetaCloudAPIConnectionDetails({ whatsappConnection, callbacks }: WhatsAppConnectionBlockConnectedProps) {
	const PERMISSION_LABELS_MAP = {
		email: "Email",
		public_profile: "Perfil Publico",
		whatsapp_business_management: "Gerenciamento de WhatsApp Business",
		whatsapp_business_messaging: "Mensagens de WhatsApp Business",
	};

	const { mutate: handleDeleteWhatsappConnectionMutation, isPending } = useMutation({
		mutationKey: ["delete-whatsapp-connection", whatsappConnection.id],
		mutationFn: deleteWhatsappConnection,
		onMutate: () => {
			if (callbacks.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: (data) => {
			if (callbacks.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: (error) => {
			if (callbacks.onError) callbacks.onError(error);
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (callbacks.onSettled) callbacks.onSettled();
			return;
		},
	});

	return (
		<div className="flex w-full flex-col gap-2 py-2">
			<div className="w-full flex items-center justify-between gap-2 flex-col lg:flex-row">
				<div className="flex items-center gap-2">
					<Badge className="flex items-center gap-1 bg-green-200 text-green-800">
						<BadgeCheck className="w-4 h-4 min-w-4 min-h-4" />
						<span className="text-sm font-bold">Conectado</span>
					</Badge>
					<Badge variant="outline" className="flex items-center gap-1">
						<Cloud className="w-3 h-3" />
						<span className="text-xs">Meta Cloud API</span>
					</Badge>
				</div>
				<LoadingButton
					variant="ghost"
					size="sm"
					className="w-fit hover:bg-destructive/10 hover:text-destructive"
					loading={isPending}
					onClick={() => handleDeleteWhatsappConnectionMutation(whatsappConnection.id)}
				>
					DESCONECTAR
				</LoadingButton>
			</div>

			<div className="w-full flex flex-col gap-1.5">
				<p className="text-sm text-primary/80">Detalhes da sua Conexao:</p>
				<div className="w-full flex flex-col gap-3">
					{whatsappConnection.dataExpiracao && (
						<div className="flex items-start lg:items-center gap-x-2 gap-y-1 flex-col lg:flex-row">
							<div className="flex items-center gap-2">
								<Calendar className="w-4 h-4 min-w-4 min-h-4" />
								<p className="text-sm text-primary/80">Data de expiracao do token:</p>
							</div>
							<p className="text-sm font-bold">{formatDateAsLocale(new Date(whatsappConnection.dataExpiracao), true) || "N/A"}</p>
						</div>
					)}
					{whatsappConnection.metaEscopo && (
						<div className="flex items-start lg:items-center gap-x-2 gap-y-1 flex-col lg:flex-row">
							<div className="flex items-center gap-2">
								<Key className="w-4 h-4 min-w-4 min-h-4" />
								<p className="text-sm text-primary/80">Permissoes que voce concedeu:</p>
							</div>
							<div className="flex items-center gap-2 flex-wrap">
								{whatsappConnection.metaEscopo.split(",").map((scope) => (
									<Badge key={scope} className="text-xs text-primary/80 bg-primary/10 rounded-md px-2 py-1">
										{PERMISSION_LABELS_MAP[scope as keyof typeof PERMISSION_LABELS_MAP]}
									</Badge>
								))}
							</div>
						</div>
					)}
					<div className="flex items-start lg:items-center gap-x-2 gap-y-1 flex-col lg:flex-row">
						<div className="flex items-center gap-2">
							<Phone className="w-4 h-4 min-w-4 min-h-4" />
							<p className="text-sm text-primary/80">Telefones conectados:</p>
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							{whatsappConnection.telefones.map((telefone) => (
								<Badge key={telefone.numero} className="text-xs text-primary/80 bg-primary/10 rounded-md px-2 py-1">
									{telefone.nome}: <strong>{telefone.numero}</strong>
								</Badge>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// Internal Gateway connection details
function InternalGatewayConnectionDetails({ whatsappConnection, callbacks }: WhatsAppConnectionBlockConnectedProps) {
	const queryClient = useQueryClient();

	const { mutate: handleDisconnectMutation, isPending: isDisconnecting } = useMutation({
		mutationKey: ["disconnect-internal-gateway", whatsappConnection.id],
		mutationFn: () => disconnectInternalGateway(whatsappConnection.id),
		onMutate: () => {
			if (callbacks.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: (data) => {
			if (callbacks.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: (error) => {
			if (callbacks.onError) callbacks.onError(error);
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (callbacks.onSettled) callbacks.onSettled();
			return;
		},
	});

	const gatewayStatus = whatsappConnection.gatewayStatus || "disconnected";

	const getStatusBadge = () => {
		switch (gatewayStatus) {
			case "connected":
				return (
					<Badge className="flex items-center gap-1 bg-green-200 text-green-800">
						<Wifi className="w-3 h-3" />
						<span className="text-sm font-bold">Conectado</span>
					</Badge>
				);
			case "qr":
				return (
					<Badge className="flex items-center gap-1 bg-yellow-200 text-yellow-800">
						<QrCode className="w-3 h-3" />
						<span className="text-sm font-bold">Aguardando QR</span>
					</Badge>
				);
			case "connecting":
				return (
					<Badge className="flex items-center gap-1 bg-blue-200 text-blue-800">
						<Loader2 className="w-3 h-3 animate-spin" />
						<span className="text-sm font-bold">Conectando</span>
					</Badge>
				);
			default:
				return (
					<Badge className="flex items-center gap-1 bg-red-200 text-red-800">
						<WifiOff className="w-3 h-3" />
						<span className="text-sm font-bold">Desconectado</span>
					</Badge>
				);
		}
	};

	return (
		<div className="flex w-full flex-col gap-2 py-2">
			<div className="w-full flex items-center justify-between gap-2 flex-col lg:flex-row">
				<div className="flex items-center gap-2">
					{getStatusBadge()}
					<Badge variant="outline" className="flex items-center gap-1">
						<QrCode className="w-3 h-3" />
						<span className="text-xs">Gateway Interno</span>
					</Badge>
				</div>
				<div className="flex items-center gap-2">
					{gatewayStatus !== "connected" && (
						<Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] })}>
							<RefreshCw className="w-4 h-4 mr-1" />
							Atualizar Status
						</Button>
					)}
					<LoadingButton
						variant="ghost"
						size="sm"
						className="w-fit hover:bg-destructive/10 hover:text-destructive"
						loading={isDisconnecting}
						onClick={() => handleDisconnectMutation()}
					>
						DESCONECTAR
					</LoadingButton>
				</div>
			</div>

			<div className="w-full flex flex-col gap-1.5">
				<p className="text-sm text-primary/80">Detalhes da sua Conexao:</p>
				<div className="w-full flex flex-col gap-3">
					{whatsappConnection.gatewayUltimaConexao && (
						<div className="flex items-start lg:items-center gap-x-2 gap-y-1 flex-col lg:flex-row">
							<div className="flex items-center gap-2">
								<Calendar className="w-4 h-4 min-w-4 min-h-4" />
								<p className="text-sm text-primary/80">Ultima conexao:</p>
							</div>
							<p className="text-sm font-bold">{formatDateAsLocale(new Date(whatsappConnection.gatewayUltimaConexao), true) || "N/A"}</p>
						</div>
					)}
					<div className="flex items-start lg:items-center gap-x-2 gap-y-1 flex-col lg:flex-row">
						<div className="flex items-center gap-2">
							<Phone className="w-4 h-4 min-w-4 min-h-4" />
							<p className="text-sm text-primary/80">Telefones conectados:</p>
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							{whatsappConnection.telefones.map((telefone) => (
								<Badge key={telefone.numero} className="text-xs text-primary/80 bg-primary/10 rounded-md px-2 py-1">
									{telefone.nome}: <strong>{telefone.numero}</strong>
								</Badge>
							))}
						</div>
					</div>
				</div>
			</div>

			{gatewayStatus !== "connected" && (
				<div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
					<p className="text-sm text-yellow-800">
						<strong>Atencao:</strong> Sua conexao com o WhatsApp esta inativa. Para continuar enviando e recebendo mensagens, reconecte escaneando um novo
						QR Code.
					</p>
				</div>
			)}
		</div>
	);
}
