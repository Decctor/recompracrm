"use client";

import CancelFiscalDocument from "@/components/Modals/FiscalDocument/CancelFiscalDocument";
import CorrectFiscalDocument from "@/components/Modals/FiscalDocument/CorrectFiscalDocument";
import InutilizeFiscalDocument from "@/components/Modals/FiscalDocument/InutilizeFiscalDocument";
import ManualFiscalEmission from "@/components/Modals/FiscalDocument/ManualFiscalEmission";
import ReturnFiscalDocument from "@/components/Modals/FiscalDocument/ReturnFiscalDocument";
import { useFiscalDocumentInvalidation } from "@/components/Modals/FiscalDocument/use-fiscal-document-invalidation";
import { getErrorMessage } from "@/lib/errors";
import type { TFiscalDocumentActionKey } from "@/lib/fiscal/document-actions";
import { retryFiscalDocumentsMutation, syncFiscalDocumentMutation } from "@/lib/mutations/fiscal";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
	isFiscalDocumentClosed,
	isFiscalDocumentFailed,
	resolveFiscalDocumentActions,
	type TFiscalDocumentListItem,
	type TFiscalPermissions,
	type TResolvedFiscalActions,
} from "./fiscal-document-action-state";

type ModalKey = Extract<TFiscalDocumentActionKey, "CANCELAR" | "CARTA_CORRECAO" | "INUTILIZAR" | "DEVOLUCAO"> | "EMITIR_NOVAMENTE";

export type TFiscalDocumentActionRunner = {
	actions: TResolvedFiscalActions;
	// Executa a acao: abre o modal certo, dispara a mutacao ou baixa o arquivo.
	run: (key: TFiscalDocumentActionKey) => void;
	isPending: boolean;
	pendingAction: TFiscalDocumentActionKey | null;
	// Mensagem do ultimo reenvio que falhou (por documento), para exibir inline.
	retryFailureMessage: string | null;
	// Modais abertos pelo runner. Renderize uma vez, junto do componente que o criou.
	modals: ReactNode;
};

/**
 * Um unico lugar que sabe "o que acontece quando clico em X" para um documento fiscal. A
 * dropdown do card, a barra do modal e a secao "O que fazer agora" so chamam `run(key)`.
 */
export function useFiscalDocumentActionRunner({
	document,
	permissions,
	exceptionalPresenceEnabled,
	onChanged,
}: {
	document: TFiscalDocumentListItem;
	permissions: TFiscalPermissions;
	exceptionalPresenceEnabled: boolean;
	onChanged?: () => void;
}): TFiscalDocumentActionRunner {
	const invalidate = useFiscalDocumentInvalidation(document.id);
	const [openModal, setOpenModal] = useState<ModalKey | null>(null);
	const [retryFailureMessage, setRetryFailureMessage] = useState<string | null>(null);
	const actions = useMemo(() => resolveFiscalDocumentActions(document.acoes, permissions), [document.acoes, permissions]);

	const { mutate: syncDocument, isPending: isSyncing } = useMutation({
		mutationKey: ["sync-fiscal-document", document.id],
		mutationFn: syncFiscalDocumentMutation,
		onSuccess: async (data) => {
			toast.success(data.message);
			await invalidate();
			onChanged?.();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: retryDocument, isPending: isRetrying } = useMutation({
		mutationKey: ["retry-fiscal-document", document.id],
		mutationFn: retryFiscalDocumentsMutation,
		onSuccess: async (data) => {
			const outcome = data.data.resultados.find((item) => item.documentoId === document.id) ?? data.data.resultados[0];
			if (outcome && !outcome.sucesso) {
				setRetryFailureMessage(outcome.mensagem);
				toast.error(outcome.mensagem);
			} else {
				setRetryFailureMessage(null);
				toast.success(outcome?.mensagem ?? data.message);
			}
			await invalidate();
			onChanged?.();
		},
		onError: (error) => {
			const message = getErrorMessage(error);
			setRetryFailureMessage(message);
			toast.error(message);
		},
	});

	const openAsset = useCallback(
		(asset: "xml" | "pdf") => {
			window.open(`/api/fiscal/document-assets?documentId=${document.id}&asset=${asset}`, "_blank", "noopener,noreferrer");
		},
		[document.id],
	);

	const run = useCallback(
		(key: TFiscalDocumentActionKey) => {
			const action = actions[key];
			if (action && !action.available) {
				toast.error(action.reason ?? "Ação indisponível para este documento.");
				return;
			}
			switch (key) {
				case "CANCELAR":
				case "CARTA_CORRECAO":
				case "INUTILIZAR":
				case "DEVOLUCAO":
					setOpenModal(key);
					return;
				case "REENVIAR":
					// Documento encerrado: nova emissao para a venda (com as opcoes de presenca). Documento
					// com falha: o mesmo documento volta para a fila.
					if (isFiscalDocumentClosed(document.statusInterno) || document.revisaoCreditoIcms) setOpenModal("EMITIR_NOVAMENTE");
					else retryDocument({ documentIds: [document.id] });
					return;
				case "SINCRONIZAR":
					syncDocument({ documentId: document.id });
					return;
				case "BAIXAR_XML":
					openAsset("xml");
					return;
				case "BAIXAR_PDF":
					openAsset("pdf");
					return;
			}
		},
		[actions, document.id, document.statusInterno, document.revisaoCreditoIcms, openAsset, retryDocument, syncDocument],
	);

	const closeModal = useCallback(() => setOpenModal(null), []);
	const handleSuccess = useCallback(() => {
		setRetryFailureMessage(null);
		onChanged?.();
	}, [onChanged]);

	const modals: ReactNode = (() => {
		if (openModal === "CANCELAR") {
			return (
				<CancelFiscalDocument
					document={{ id: document.id, tipo: document.tipo, numero: document.numero }}
					prazoLimite={actions.CANCELAR?.deadline ?? null}
					closeMenu={closeModal}
					onSuccess={handleSuccess}
				/>
			);
		}
		if (openModal === "CARTA_CORRECAO") {
			return <CorrectFiscalDocument document={{ id: document.id, numero: document.numero }} closeMenu={closeModal} onSuccess={handleSuccess} />;
		}
		if (openModal === "INUTILIZAR") {
			return (
				<InutilizeFiscalDocument
					document={{ id: document.id, tipo: document.tipo, serie: document.serie, numero: document.numero }}
					prazoLimite={actions.INUTILIZAR?.deadline ?? null}
					closeMenu={closeModal}
					onSuccess={handleSuccess}
				/>
			);
		}
		if (openModal === "DEVOLUCAO") {
			return (
				<ReturnFiscalDocument
					document={{ id: document.id, tipo: document.tipo, numero: document.numero, chaveAcesso: document.chaveAcesso }}
					closeMenu={closeModal}
					onSuccess={handleSuccess}
				/>
			);
		}
		if (openModal === "EMITIR_NOVAMENTE" && document.vendaId && (document.tipo === "NFCE" || document.tipo === "NFE")) {
			return (
				<ManualFiscalEmission
					saleId={document.vendaId}
					tipo={document.tipo}
					entregaModalidade={document.venda?.entregaModalidade}
					exceptionalPresenceEnabled={exceptionalPresenceEnabled}
					// Calculado no servidor com a configuração viva: só NF-e de venda com o recurso ligado.
					resaleCreditEnabled={!!document.revisaoCreditoIcms}
					canConfigureFiscal={permissions.configurar}
					closeMenu={closeModal}
				/>
			);
		}
		return null;
	})();

	const pendingAction: TFiscalDocumentActionKey | null = isSyncing ? "SINCRONIZAR" : isRetrying ? "REENVIAR" : null;

	return {
		actions,
		run,
		isPending: isSyncing || isRetrying,
		pendingAction,
		retryFailureMessage: isFiscalDocumentFailed(document.statusInterno) ? retryFailureMessage : null,
		modals,
	};
}
