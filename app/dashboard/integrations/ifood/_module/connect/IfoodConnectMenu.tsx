"use client";
import { ResponsiveMenuAnimatedBody } from "@/components/Utils/ResponsiveMenuAnimatedBody";
import { LoadingButton } from "@/components/loading-button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import type { TCreateIfoodAuthorizationOutput } from "@/app/api/integrations/ifood/auth/route";
import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { useMutation } from "@tanstack/react-query";
import { copyToClipboard } from "@/lib/utils";
import { Check, Copy, LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type IfoodConnectMenuProps = {
	/** Reconexão explícita (D9): id da linha de `integrations` a reativar com as credenciais novas. */
	reconnectIntegrationId?: string | null;
	closeMenu: () => void;
};

/**
 * Fluxo de autorização distribuída do iFood: gera o userCode, o usuário autoriza o aplicativo no
 * Portal do Parceiro e cola o código de autorização para concluir. Reusa as rotas
 * `/api/integrations/ifood/auth` e `/api/integrations/ifood/auth/complete`.
 */
export function IfoodConnectMenu({ reconnectIntegrationId, closeMenu }: IfoodConnectMenuProps) {
	const [authorization, setAuthorization] = useState<TCreateIfoodAuthorizationOutput | null>(null);
	const [authorizationCode, setAuthorizationCode] = useState("");
	const [linkCopied, setLinkCopied] = useState(false);

	const verificationLink = authorization?.verificationUrlComplete ?? authorization?.verificationUrl ?? null;
	const isReconnect = !!reconnectIntegrationId;

	async function handleCopyVerificationLink() {
		if (!verificationLink) return;
		await copyToClipboard(verificationLink);
		setLinkCopied(true);
		setTimeout(() => setLinkCopied(false), 2000);
	}

	const createAuthorizationMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/integrations/ifood/auth", { method: "POST" });
			const data = await response.json();
			if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar o código de autorização do iFood.");
			return data as TCreateIfoodAuthorizationOutput;
		},
		onSuccess: (data) => {
			setAuthorization(data);
			toast.success("Código de autorização do iFood gerado com sucesso.");
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const completeAuthorizationMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/integrations/ifood/auth/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ authorizationCode, reconnectIntegrationId: reconnectIntegrationId ?? null }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error ?? "Não foi possível conectar o iFood.");
			return data;
		},
			onSuccess: () => {
			toast.success(isReconnect ? "Integração iFood reconectada com sucesso." : "Integração iFood conectada com sucesso.");
			window.location.reload();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeMenu();
			}}
		>
			<ResponsiveMenu.Content drawerClassName="max-h-[70dvh]">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>{isReconnect ? "RECONECTAR IFOOD" : "CONECTAR IFOOD"}</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>
						{isReconnect
								? "Autorize novamente a mesma conta no portal do iFood. As novas credenciais serão salvas na conexão atual."
							: "Gere o código, autorize o aplicativo no portal do iFood e cole o código de autorização para concluir."}
					</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenuAnimatedBody stateKey="content" className="overflow-x-hidden overflow-y-auto">
					<div className="flex flex-col gap-4">
						{authorization ? (
							<div className="rounded-lg border bg-muted/30 p-4">
								<p className="text-xs font-semibold text-muted-foreground">CÓDIGO IFOOD</p>
								<p className="mt-1 text-2xl font-bold tracking-wide">{authorization.userCode}</p>
								{verificationLink ? (
									<div className="mt-3 flex flex-col gap-2">
										<p className="break-all text-xs text-muted-foreground">{verificationLink}</p>
										<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
											<Button type="button" size="sm" onClick={() => window.open(verificationLink, "_blank")}>
												<LinkIcon className="h-4 w-4" />
												ABRIR PORTAL IFOOD
											</Button>
											<Button type="button" size="sm" variant="secondary" onClick={handleCopyVerificationLink}>
												{linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
												{linkCopied ? "LINK COPIADO" : "COPIAR LINK"}
											</Button>
										</div>
									</div>
								) : null}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">Clique em gerar código para iniciar a autorização distribuída do iFood.</p>
						)}

						{authorization ? (
							<TextInput
								label="CÓDIGO DE AUTORIZAÇÃO"
								value={authorizationCode}
								placeholder="Cole aqui o código recebido no portal do iFood..."
								handleChange={setAuthorizationCode}
							/>
						) : null}
					</div>
				</ResponsiveMenuAnimatedBody>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">FECHAR</ResponsiveMenu.Close>
					<LoadingButton
						loading={createAuthorizationMutation.isPending || completeAuthorizationMutation.isPending}
						onClick={() => {
							if (!authorization) return createAuthorizationMutation.mutate();
							return completeAuthorizationMutation.mutate();
						}}
					>
						{authorization ? "FINALIZAR CONEXÃO" : "GERAR CÓDIGO"}
					</LoadingButton>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}
