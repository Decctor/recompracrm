import type { TSaleAttendanceStatusEnum, TSaleFinancialDerivedStatusEnum, TSaleFiscalDerivedStatusEnum } from "@/schemas/enums";
import { isValidAttendanceTransition } from "@/lib/sales/sale-processing/attendance";
import { CircleCheck, ClipboardList, type LucideIcon, Inbox, Clock, Package, PackageCheck, PackageOpen, Store, Truck, File } from "lucide-react";

// Etapas do fluxo operacional: as unicas que sao, de fato, fila de trabalho. Sao elas que viram
// coluna, aceitam recolhimento e contam como "em atendimento".
// CANCELADO e acao (nao coluna); PARCIALMENTE_ENTREGUE e sub-estado exibido dentro de ENTREGUE.
export const PIPELINE_STATUSES = ["NAO_INICIADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA"] as const;
export type TPipelineStatus = (typeof PIPELINE_STATUSES)[number];

/**
 * ENTREGUE nao e uma etapa do fluxo: e terminal (`ALLOWED_ATTENDANCE_TRANSITIONS.ENTREGUE` e vazio),
 * entao recebe cards e nunca devolve nenhum. Continua sendo alvo de arraste e de menu de mover, mas
 * o quadro o apresenta como comprovante (ver `delivered-buffer.tsx`), nao como coluna de trabalho.
 */
export const DELIVERED_STATUS = "ENTREGUE" as const;

// Conjunto completo para rotulos e alvos de transicao — inclui a etapa terminal.
export const BOARD_STATUSES = [...PIPELINE_STATUSES, DELIVERED_STATUS] as const;
export type TBoardStatus = (typeof BOARD_STATUSES)[number];

// Geometria das colunas. A trilha recolhida tem a largura de um alvo de toque do sistema (44px), e a
// coluna expandida mantem os 300px de sempre: o conteudo interno e sempre renderizado nessa largura
// fixa e apenas recortado, entao os cards nunca sao reflowados durante a animacao de recolher.
export const BOARD_COLUMN_WIDTH_PX = 300;
export const BOARD_RAIL_WIDTH_PX = 44;
// Largura da trilha sob o cursor durante um arraste. O teto e 2 x trilha + vao (100px): acima disso,
// sair da trilha alargada a encolhe e joga a vizinha para debaixo do cursor, e as duas passam a
// disputar o foco. 96px alarga o alvo o suficiente sem entrar nessa oscilacao.
export const BOARD_RAIL_ACTIVE_WIDTH_PX = 96;

export const ATTENDANCE_COLUMN_META: Record<TBoardStatus, { label: string; icon: LucideIcon; hint: string }> = {
	NAO_INICIADO: { label: "Não iniciado", icon: Inbox, hint: "Pedidos confirmados aguardando início" },
	EM_PREPARO: { label: "Em preparo", icon: PackageOpen, hint: "Sendo preparados/separados" },
	PRONTO: { label: "Pronto", icon: PackageCheck, hint: "Prontos para retirada ou despacho" },
	EM_ENTREGA: { label: "Em entrega", icon: Truck, hint: "A caminho do cliente" },
	ENTREGUE: { label: "Entregue", icon: CircleCheck, hint: "Concluídos (baixa de estoque feita)" },
};

// Rotulo curto de todas as etapas (inclui as que ficam fora do quadro).
export const ATTENDANCE_STATUS_LABEL: Record<TSaleAttendanceStatusEnum, string> = {
	NAO_INICIADO: "Não iniciado",
	EM_PREPARO: "Em preparo",
	PRONTO: "Pronto",
	EM_ENTREGA: "Em entrega",
	ENTREGUE: "Entregue",
	PARCIALMENTE_ENTREGUE: "Parcialmente entregue",
	CANCELADO: "Cancelado",
};

// Transicoes que disparam baixa fisica de estoque, logo exigem confirmacao leve.
export function transitionNeedsConfirmation(to: TSaleAttendanceStatusEnum): boolean {
	return to === "ENTREGUE";
}

// Alvos validos (entre as colunas do quadro) para o card a partir do status atual.
export function getValidBoardTargets(from: TSaleAttendanceStatusEnum): TBoardStatus[] {
	return BOARD_STATUSES.filter((target) => isValidAttendanceTransition(from, target));
}

// Badge financeiro derivado. Apenas o estado problematico (atraso) usa enfase destrutiva.
export const FINANCIAL_BADGE_META: Record<
	TSaleFinancialDerivedStatusEnum,
	{ label: string; tone: "success" | "muted" | "neutral" | "danger"; icon?: React.ReactNode }
> = {
	NAO_GERADO: { label: "Sem financeiro", tone: "muted", icon: <Package className="w-3 h-3" /> },
	PENDENTE: { label: "A receber", tone: "neutral", icon: <Package className="w-3 h-3" /> },
	PARCIALMENTE_RECEBIDA: { label: "Parcial", tone: "neutral", icon: <PackageCheck className="w-3 h-3" /> },
	RECEBIDA: { label: "Recebida", tone: "success", icon: <CircleCheck className="w-3 h-3" /> },
	EM_ATRASO: { label: "Em atraso", tone: "danger", icon: <Clock className="w-3 h-3" /> },
};

// Badge fiscal derivado. Rejeicao/erro usam enfase destrutiva.
export const FISCAL_BADGE_META: Record<
	TSaleFiscalDerivedStatusEnum,
	{ label: string; tone: "muted" | "neutral" | "danger"; icon?: React.ReactNode }
> = {
	NAO_EMITIDO: { label: "Sem nota", tone: "muted", icon: <File className="w-3 h-3" /> },
	PENDENTE: { label: "Nota pendente", tone: "neutral", icon: <File className="w-3 h-3" /> },
	EM_PROCESSAMENTO: { label: "Processando", tone: "neutral", icon: <File className="w-3 h-3" /> },
	AUTORIZADO: { label: "Autorizada", tone: "neutral", icon: <File className="w-3 h-3" /> },
	REJEITADO: { label: "Rejeitada", tone: "danger", icon: <File className="w-3 h-3" /> },
	CANCELADO: { label: "Cancelada", tone: "muted", icon: <File className="w-3 h-3" /> },
	INUTILIZADO: { label: "Inutilizada", tone: "muted", icon: <File className="w-3 h-3" /> },
	ERRO: { label: "Erro fiscal", tone: "danger", icon: <File className="w-3 h-3" /> },
};

export const DELIVERY_MODE_META: Record<string, { label: string; icon: LucideIcon }> = {
	PRESENCIAL: { label: "Presencial", icon: Store },
	RETIRADA: { label: "Retirada", icon: Package },
	ENTREGA: { label: "Entrega", icon: Truck },
	COMANDA: { label: "Comanda", icon: ClipboardList },
};
