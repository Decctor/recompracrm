"use client";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import { LoadingButton } from "@/components/loading-button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { deleteMessageTemplatePhone, syncMessageTemplatePhone } from "@/lib/mutations/message-templates";
import { useMessageTemplateById } from "@/lib/queries/message-templates";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Phone, Settings } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

type ViewMessageTemplatePhoneProps = {
	messageTemplateId: string;
	telefoneId: string;
	closeMenu: () => void;
	/** comunicacao.publicar: sincronizar e excluir o vínculo falam com a Meta. Sem ela, a seção de ações some. */
	canPublish: boolean;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export function ViewMessageTemplatePhone({ messageTemplateId, telefoneId, closeMenu, canPublish, callbacks }: ViewMessageTemplatePhoneProps) {
	const {
		data: template,
		isLoading: isTemplateLoading,
		isSuccess: isTemplateSuccess,
		error: templateError,
	} = useMessageTemplateById({ id: messageTemplateId });
	const { data: whatsappConnections, isLoading: isConnectionsLoading } = useWhatsappConnections();

	const phoneMetadata = template?.metadados?.porNumeroTelefone?.[telefoneId] ?? null;
	const phoneInfo = useMemo(() => {
		for (const connection of whatsappConnections ?? []) {
			const phone = connection.telefones.find((item) => item.id === telefoneId);
			if (phone) return phone;
		}
		return null;
	}, [whatsappConnections, telefoneId]);

	const isLoading = isTemplateLoading || isConnectionsLoading;
	const stateError = templateError
		? getErrorMessage(templateError)
		: isTemplateSuccess && !phoneMetadata
			? "Vínculo do template com este telefone não encontrado."
			: null;

	const { mutate: handleSync, isPending: isSyncing } = useMutation({
		mutationKey: ["sync-message-template-phone", messageTemplateId, telefoneId],
		mutationFn: syncMessageTemplatePhone,
		onMutate: () => {
			callbacks?.onMutate?.();
		},
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			callbacks?.onSettled?.();
		},
	});

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationKey: ["delete-message-template-phone", messageTemplateId, telefoneId],
		mutationFn: deleteMessageTemplatePhone,
		onMutate: () => {
			callbacks?.onMutate?.();
		},
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeMenu();
		},
		onError: (error) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			callbacks?.onSettled?.();
		},
	});

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeMenu();
			}}
		>
			<ResponsiveMenu.Content dialogClassName="h-[60%] min-h-[60%] w-[40%] min-w-[40%] max-w-[40%]" drawerClassName="max-h-[70dvh]">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>VER TELEFONE DO TEMPLATE</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>Veja os detalhes do telefone do template</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenu.Body>
					{isLoading ? (
						<LoadingComponent />
					) : stateError ? (
						<ErrorComponent msg={stateError} />
					) : (
						<>
							{isTemplateSuccess && phoneMetadata ? (
								<div className="flex w-full flex-col gap-2">
									<ResponsiveMenuSection title="DETALHES DO TELEFONE" icon={<Phone size={15} />}>
										{phoneMetadata.idExterno ? (
											<div className="flex w-full items-center justify-between gap-2">
												<span className="text-sm font-medium">TEMPLATE ID (META)</span>
												<span className="text-sm font-medium">{phoneMetadata.idExterno}</span>
											</div>
										) : null}
										{phoneInfo?.nome ? (
											<div className="flex w-full items-center justify-between gap-2">
												<span className="text-sm font-medium">NOME</span>
												<span className="text-sm font-medium">{phoneInfo.nome}</span>
											</div>
										) : null}
										<div className="flex w-full items-center justify-between gap-2">
											<span className="text-sm font-medium">NÚMERO</span>
											<span className="text-sm font-medium">{phoneInfo?.numero ?? "NÃO ENCONTRADO"}</span>
										</div>
										<div className="flex w-full items-center justify-between gap-2">
											<span className="text-sm font-medium">STATUS</span>
											<div
												className={cn("rounded-lg px-2 py-0.5 text-[0.65rem] font-bold", {
													"bg-blue-500 text-white": phoneMetadata.status === "APROVADO",
													"bg-primary/20 text-foreground": phoneMetadata.status === "PENDENTE",
													"bg-red-500 text-white": phoneMetadata.status === "REJEITADO",
													"bg-orange-500 text-white": phoneMetadata.status === "PAUSADO",
													"bg-gray-500 text-white": phoneMetadata.status === "DESABILITADO" || phoneMetadata.status === "RASCUNHO",
												})}
											>
												{phoneMetadata.status}
											</div>
										</div>
										<div className="flex w-full items-center justify-between gap-2">
											<span className="text-sm font-medium">QUALIDADE</span>
											<div
												className={cn("rounded-lg px-2 py-0.5 text-[0.65rem] font-bold", {
													"bg-green-500 text-white": phoneMetadata.qualidade === "ALTA",
													"bg-yellow-500 text-white": phoneMetadata.qualidade === "MEDIA",
													"bg-red-500 text-white": phoneMetadata.qualidade === "BAIXA",
													"bg-primary/20 text-foreground": phoneMetadata.qualidade === "PENDENTE",
												})}
											>
												{phoneMetadata.qualidade}
											</div>
										</div>
									</ResponsiveMenuSection>

									<TemplatePreview content={template.conteudo} />

									{canPublish ? (
										<ResponsiveMenuSection title="AÇÕES" icon={<Settings size={15} />}>
											<div className="flex w-full flex-col items-center justify-center gap-x-3 gap-y-3 lg:flex-row">
												{phoneMetadata.idExterno ? (
													<LoadingButton
														onClick={() => handleSync({ messageTemplateId, telefoneId })}
														variant="ghost-brand"
														size="sm"
														loading={isSyncing}
														disabled={isSyncing}
													>
														SINCRONIZAR TEMPLATE
													</LoadingButton>
												) : null}

												<LoadingButton
													onClick={() => handleDelete({ messageTemplateId, telefoneId, deleteFromMeta: true })}
													variant="destructive"
													size="sm"
													loading={isDeleting}
													disabled={isDeleting}
												>
													EXCLUIR VÍNCULO
												</LoadingButton>
											</div>
										</ResponsiveMenuSection>
									) : null}
								</div>
							) : null}
						</>
					)}
				</ResponsiveMenu.Body>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">FECHAR</ResponsiveMenu.Close>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}
