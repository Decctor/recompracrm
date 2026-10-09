import type { TGetFiscalDocumentsOutputById, TGetFiscalDocumentsOutputDefault } from "@/app/api/fiscal/documents/route";
import { FISCAL_ACTION_LABELS } from "@/components/Fiscal/fiscal-problem-presentation";
import type { TFiscalDocumentAction, TFiscalDocumentActionKey } from "@/lib/fiscal/document-actions";
import type { TFiscalDocumentLifecycleStatusEnum } from "@/schemas/enums";

/**
 * Combina a matriz `acoes` da API com a permissao do usuario. A API decide o que o documento
 * aceita; aqui so entra o "voce pode?". Quando o unico bloqueio e permissao, o motivo diz isso.
 */

export type TFiscalPermissions = {
	emitir: boolean;
	cancelar: boolean;
	configurar: boolean;
};

export type TFiscalDocumentListItem = TGetFiscalDocumentsOutputDefault["documents"][number] | TGetFiscalDocumentsOutputById["document"];

export type TResolvedFiscalAction = {
	key: TFiscalDocumentActionKey;
	label: string;
	// Disponivel na API e permitido para o usuario.
	available: boolean;
	// Motivo pronto para exibir quando indisponivel; null quando disponivel.
	reason: string | null;
	// O documento aceitaria, mas o usuario nao tem permissao.
	permissionBlocked: boolean;
	deadline: Date | null;
	alternatives: TFiscalDocumentActionKey[];
};

export const FISCAL_ACTION_ORDER: TFiscalDocumentActionKey[] = [
	"SINCRONIZAR",
	"REENVIAR",
	"CARTA_CORRECAO",
	"DEVOLUCAO",
	"INUTILIZAR",
	"CANCELAR",
	"BAIXAR_XML",
	"BAIXAR_PDF",
];

const PERMISSION_VERB: Record<TFiscalDocumentActionKey, string> = {
	CANCELAR: "cancelar documentos fiscais",
	CARTA_CORRECAO: "registrar cartas de correção",
	INUTILIZAR: "inutilizar numeração fiscal",
	DEVOLUCAO: "gerar devoluções fiscais",
	REENVIAR: "reenviar documentos fiscais",
	SINCRONIZAR: "atualizar o status de documentos fiscais",
	BAIXAR_XML: "baixar o XML",
	BAIXAR_PDF: "baixar o DANFE",
};

export function hasPermissionForFiscalAction(key: TFiscalDocumentActionKey, permissions: TFiscalPermissions) {
	switch (key) {
		case "CANCELAR":
		case "INUTILIZAR":
			return permissions.cancelar;
		case "CARTA_CORRECAO":
		case "DEVOLUCAO":
		case "REENVIAR":
		case "SINCRONIZAR":
			return permissions.emitir;
		default:
			return true;
	}
}

export function resolveFiscalDocumentActionState(action: TFiscalDocumentAction, permissions: TFiscalPermissions): TResolvedFiscalAction {
	const permitted = hasPermissionForFiscalAction(action.acao, permissions);
	const permissionBlocked = action.disponivel && !permitted;
	const available = action.disponivel && permitted;
	const reason = available
		? null
		: permissionBlocked
			? `Você não tem permissão para ${PERMISSION_VERB[action.acao]}. Peça a um administrador.`
			: (action.motivoIndisponivel ?? "Ação indisponível para este documento.");
	return {
		key: action.acao,
		label: FISCAL_ACTION_LABELS[action.acao],
		available,
		reason,
		permissionBlocked,
		deadline: action.prazoLimite ? new Date(action.prazoLimite) : null,
		alternatives: action.alternativas ?? [],
	};
}

export type TResolvedFiscalActions = Partial<Record<TFiscalDocumentActionKey, TResolvedFiscalAction>>;

export function resolveFiscalDocumentActions(actions: TFiscalDocumentAction[] | undefined, permissions: TFiscalPermissions): TResolvedFiscalActions {
	const resolved: TResolvedFiscalActions = {};
	for (const action of actions ?? []) resolved[action.acao] = resolveFiscalDocumentActionState(action, permissions);
	return resolved;
}

export function isFiscalDocumentFailed(status: TFiscalDocumentLifecycleStatusEnum) {
	return status === "ERRO" || status === "REJEITADO";
}

export function isFiscalDocumentClosed(status: TFiscalDocumentLifecycleStatusEnum) {
	return status === "CANCELADO" || status === "INUTILIZADO";
}

export function formatFiscalDocumentTypeLabel(tipo: string) {
	if (tipo === "NFCE") return "NFC-e";
	if (tipo === "NFE") return "NF-e";
	if (tipo === "NFSE") return "NFS-e";
	return tipo;
}
