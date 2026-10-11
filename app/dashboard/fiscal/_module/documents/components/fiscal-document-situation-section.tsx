"use client";

import type { TGetFiscalDocumentsOutputById } from "@/app/api/fiscal/documents/route";
import { FiscalProblemCta } from "@/components/Fiscal/FiscalProblemCta";
import { FISCAL_PROBLEM_CATEGORY_LABELS, FISCAL_PROBLEM_TARGET_LABELS } from "@/components/Fiscal/fiscal-problem-presentation";
import { useFiscalDeadline } from "@/components/Modals/FiscalDocument/use-fiscal-deadline";
import { useCopyToClipboard } from "@/components/ui/copy-button";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { FISCAL_DEADLINES } from "@/lib/fiscal/constants";
import type { TFiscalDocumentActionKey } from "@/lib/fiscal/document-actions";
import type { TFiscalProblem } from "@/lib/fiscal/problems";
import { formatDateAsLocale } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import {
	AlertTriangle,
	ArrowLeftRight,
	Check,
	CircleCheck,
	CircleX,
	Clock,
	Copy,
	PencilIcon,
	ReceiptText,
	RefreshCcw,
	Send,
	Zap,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
	formatFiscalDocumentTypeLabel,
	isFiscalDocumentFailed,
	type TFiscalPermissions,
	type TResolvedFiscalAction,
} from "../helpers/fiscal-document-action-state";
import { FISCAL_DOCUMENT_STATUS_CHIP_CLASSNAME, resolveFiscalDocumentStatusChip } from "../helpers/fiscal-document-status-chip";
import type { TFiscalDocumentActionRunner } from "../helpers/use-fiscal-document-action-runner";

type TFiscalDocument = TGetFiscalDocumentsOutputById["document"];
type TFiscalDocumentEvents = TGetFiscalDocumentsOutputById["events"];

// Botão compacto das linhas de ação: o mesmo tamanho do `FiscalProblemCta`, para que a CTA de um
// problema e "Reenviar" não pareçam de famílias diferentes.
const COMPACT_BUTTON_CLASSNAME = "h-7 gap-1.5 px-2.5 text-[0.65rem] font-bold tracking-tight uppercase [&_svg]:size-3.5";
const DESTRUCTIVE_OUTLINE_CLASSNAME = "border-destructive/40 bg-card text-destructive hover:text-destructive";

type FiscalDocumentSituationSectionProps = {
	document: TFiscalDocument;
	events: TFiscalDocumentEvents;
	runner: TFiscalDocumentActionRunner;
	permissions: TFiscalPermissions;
	onChanged: () => void;
};

/**
 * "Situação": o primeiro cartão da página. Diz em que pé a nota está e coloca a próxima ação ao
 * lado da frase que a justifica — problemas com a CTA que os resolve, o prazo de cancelamento com
 * o botão de cancelar, a escolha entre devolução e carta de correção quando o prazo fechou.
 * Ação que o documento não aceita simplesmente não aparece; a que o usuário não pode executar
 * aparece desabilitada, com o motivo no `title`.
 */
export function FiscalDocumentSituationSection({ document, events, runner, permissions, onChanged }: FiscalDocumentSituationSectionProps) {
	const chip = resolveFiscalDocumentStatusChip(document.statusInterno);
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ReceiptText />
				</Section.Icon>
				<Section.Title>Situação</Section.Title>
				<Section.Actions>
					<span className={cn(FISCAL_DOCUMENT_STATUS_CHIP_CLASSNAME, chip.className)}>{chip.label}</span>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<SituationContent document={document} events={events} runner={runner} permissions={permissions} onChanged={onChanged} />
			</Section.Body>
		</Section.Root>
	);
}

function SituationContent({ document, events, runner, permissions, onChanged }: FiscalDocumentSituationSectionProps) {
	const status = document.statusInterno;
	if (isFiscalDocumentFailed(status)) return <FailedSituation document={document} runner={runner} permissions={permissions} onChanged={onChanged} />;
	if (status === "AUTORIZADO") return <AuthorizedSituation document={document} runner={runner} />;
	if (status === "EM_PROCESSAMENTO" || status === "PRONTO_PARA_ENVIO" || status === "RASCUNHO")
		return <ProcessingSituation document={document} runner={runner} />;
	if (status === "CANCELAMENTO_PENDENTE") {
		return (
			<StatusLine
				icon={Clock}
				action={<ActionButton action={runner.actions.SINCRONIZAR} runner={runner} icon={RefreshCcw} label="Atualizar status" variant="outline" />}
			>
				Cancelamento solicitado. Aguardando a confirmação da SEFAZ.
			</StatusLine>
		);
	}
	return <ClosedSituation document={document} events={events} runner={runner} />;
}

function FailedSituation({
	document,
	runner,
	permissions,
	onChanged,
}: {
	document: TFiscalDocument;
	runner: TFiscalDocumentActionRunner;
	permissions: TFiscalPermissions;
	onChanged: () => void;
}) {
	const { actions } = runner;
	const problems = document.problemas ?? [];
	const pendingProblems = problems.filter((problem) => !problem.resolvidoAutomaticamente).length;
	const inutilizeDeadline = useFiscalDeadline(actions.INUTILIZAR?.deadline ?? null, 60_000);
	const inutilizeUntil = actions.INUTILIZAR?.available && inutilizeDeadline.deadline ? formatDateAsLocale(inutilizeDeadline.deadline, true) : null;

	return (
		<>
			<p className="text-xs font-bold text-destructive">
				{document.codigoRejeicao ? `Rejeição SEFAZ ${document.codigoRejeicao}` : "Emissão não concluída"}
				{pendingProblems > 0 ? (
					<span className="font-medium text-muted-foreground">
						{" "}
						· {pendingProblems} {pendingProblems === 1 ? "problema" : "problemas"} para corrigir antes de reenviar
					</span>
				) : null}
			</p>
			<div className="flex flex-col gap-2">
				{problems.length === 0 ? (
					<p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
						A emissão falhou sem detalhe registrado. Reenvie o documento ou confira o retorno do provedor em Suporte.
					</p>
				) : null}
				{problems.map((problem, index) => (
					<ProblemRow
						key={`${problem.codigo}-${index}`}
						problem={problem}
						index={index}
						vendaId={document.vendaId}
						canConfigureFiscal={permissions.configurar}
						onResolved={onChanged}
					/>
				))}
			</div>
			{runner.retryFailureMessage ? (
				<p className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
					<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
					{runner.retryFailureMessage}
				</p>
			) : null}
			<div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
				<span className="min-w-[200px] flex-1 text-xs text-muted-foreground">
					Depois de corrigir, reenvie.
					{inutilizeUntil && document.numero ? ` A numeração ${document.numero} pode ser inutilizada até ${inutilizeUntil}.` : null}
				</span>
				<div className="flex items-center gap-1.5">
					<ActionButton action={actions.INUTILIZAR} runner={runner} icon={CircleX} label="Inutilizar" variant="destructive-outline" />
					<ActionButton action={actions.REENVIAR} runner={runner} icon={Send} label="Reenviar" variant="default" showWhenBlocked />
				</div>
			</div>
		</>
	);
}

function describeProblemTarget(problem: TFiscalProblem) {
	if (problem.alvo.tipo === "NENHUM") return null;
	const label = FISCAL_PROBLEM_TARGET_LABELS[problem.alvo.tipo];
	return problem.alvo.rotulo ? `${label} · ${problem.alvo.rotulo}` : label;
}

function ProblemRow({
	problem,
	index,
	vendaId,
	canConfigureFiscal,
	onResolved,
}: {
	problem: TFiscalProblem;
	index: number;
	vendaId: string | null;
	canConfigureFiscal: boolean;
	onResolved: () => void;
}) {
	const target = describeProblemTarget(problem);
	const auto = problem.resolvidoAutomaticamente;
	return (
		<div className={cn("flex flex-wrap items-start justify-between gap-2 rounded-md px-2.5 py-2", auto ? "bg-secondary/60" : "bg-destructive/10")}>
			<div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
				<span className={cn("text-xs font-bold", auto ? "text-foreground/80" : "text-destructive")}>
					{index + 1}. {FISCAL_PROBLEM_CATEGORY_LABELS[problem.categoria]}
					{target ? ` · ${target}` : null}
				</span>
				<span className={cn("text-xs", auto ? "text-foreground/80" : "text-destructive/90")}>{problem.mensagem}</span>
				<span className="text-micro font-normal text-muted-foreground">
					{auto ? "Retentativa automática em andamento. Nenhuma ação necessária." : problem.acaoSugerida}
				</span>
			</div>
			{!auto ? <FiscalProblemCta problem={problem} vendaId={vendaId} canConfigureFiscal={canConfigureFiscal} onResolved={onResolved} /> : null}
		</div>
	);
}

function AuthorizedSituation({ document, runner }: { document: TFiscalDocument; runner: TFiscalDocumentActionRunner }) {
	const { actions } = runner;
	const cancelar = actions.CANCELAR;
	const cancelDeadline = useFiscalDeadline(cancelar?.deadline ?? null);
	const authorizedAt = document.dataAutorizacao ? formatDateAsLocale(document.dataAutorizacao, true) : null;
	const authorizedLine = (
		<p className="flex items-center gap-2 rounded-md bg-success/10 px-2.5 py-2 text-xs font-semibold text-success-strong">
			<CircleCheck className="size-4 shrink-0" />
			{authorizedAt ? `Autorizada pela SEFAZ em ${authorizedAt}.` : "Autorizada pela SEFAZ."} Nada pendente.
		</p>
	);

	// Cancelamento aberto (ou bloqueado só por permissão): a janela legal é a informação da vez.
	if (cancelar && (cancelar.available || cancelar.permissionBlocked)) {
		const remaining = cancelDeadline.label?.replace(/ restantes?$/, "");
		const until = cancelDeadline.deadline ? formatDateAsLocale(cancelDeadline.deadline, true) : null;
		return (
			<>
				{authorizedLine}
				<StatusLine
					icon={Clock}
					action={
						<ActionButton
							action={cancelar}
							runner={runner}
							icon={CircleX}
							label="Cancelar nota"
							variant={cancelDeadline.urgent ? "destructive" : "destructive-outline"}
						/>
					}
				>
					{remaining ? (
						<>
							Cancelamento disponível por mais <strong>{remaining}</strong>
							{until ? `, até ${until}` : null}.
						</>
					) : (
						"Cancelamento disponível."
					)}
				</StatusLine>
				<p className="text-micro font-normal text-muted-foreground">Depois do prazo, a saída passa a ser a NF-e de devolução.</p>
			</>
		);
	}

	// Prazo encerrado: a nota continua válida, e a pergunta passa a ser o que aconteceu com a venda.
	if (cancelar && !cancelar.available) {
		return <CancelClosedChoices document={document} runner={runner} reason={cancelar.reason} />;
	}

	return authorizedLine;
}

function CancelClosedChoices({
	document,
	runner,
	reason,
}: {
	document: TFiscalDocument;
	runner: TFiscalDocumentActionRunner;
	reason: string | null;
}) {
	const { actions } = runner;
	const devolucao = actions.DEVOLUCAO;
	const carta = actions.CARTA_CORRECAO;
	const { copied, copy } = useCopyToClipboard();
	const devolucaoNeedsProfile = !!devolucao && !devolucao.available && !devolucao.permissionBlocked && !!devolucao.reason?.includes("perfil");

	return (
		<>
			<p className="text-xs text-muted-foreground">{reason ? `${reason} ` : null}A nota continua válida na SEFAZ.</p>
			<p className="text-xs font-bold tracking-tight uppercase">O que aconteceu com a venda?</p>
			<div className="flex flex-col gap-2">
				{devolucao ? (
					<ChoiceRow
						title="Foi desfeita ou o cliente devolveu"
						description="NF-e de devolução referenciando esta nota."
						blockedReason={devolucao.available ? null : devolucao.reason}
						blockedLink={
							devolucaoNeedsProfile ? (
								<Link href={appRoutes.fiscal.configuration("operation-profiles")} className="underline">
									Configurar perfil de devolução
								</Link>
							) : null
						}
						action={<ActionButton action={devolucao} runner={runner} icon={ArrowLeftRight} label="Gerar devolução" variant="default" showWhenBlocked />}
					/>
				) : null}
				{document.tipo === "NFE" && carta ? (
					<ChoiceRow
						title="Só um dado descritivo está errado"
						description="Carta de correção. Não altera valores, quantidades, datas nem partes."
						blockedReason={carta.available ? null : carta.reason}
						action={<ActionButton action={carta} runner={runner} icon={PencilIcon} label="Carta de correção" variant="outline" showWhenBlocked />}
					/>
				) : null}
				<ChoiceRow
					title="A nota não deveria existir"
					description="Só pelo portal da SEFAZ, com o contador. Leve a chave e o XML."
					action={
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!document.chaveAcesso}
							onClick={() => document.chaveAcesso && void copy(document.chaveAcesso)}
							className={cn(COMPACT_BUTTON_CLASSNAME, "bg-card")}
						>
							{copied ? <Check /> : <Copy />}
							{copied ? "Copiada" : "Copiar chave"}
						</Button>
					}
				/>
			</div>
		</>
	);
}

function ChoiceRow({
	title,
	description,
	blockedReason,
	blockedLink,
	action,
}: {
	title: string;
	description: string;
	blockedReason?: string | null;
	blockedLink?: ReactNode;
	action: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-secondary/60 px-3 py-2.5">
			<div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
				<span className="text-sm font-semibold tracking-tight">{title}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
				{blockedReason ? (
					<span className="text-xs text-warning-surface-foreground">
						{blockedReason} {blockedLink}
					</span>
				) : null}
			</div>
			{action}
		</div>
	);
}

function ProcessingSituation({ document, runner }: { document: TFiscalDocument; runner: TFiscalDocumentActionRunner }) {
	const status = document.statusInterno;
	const typeLabel = formatFiscalDocumentTypeLabel(document.tipo);
	const waitingMinutes = Math.max(0, Math.floor((Date.now() - new Date(document.dataInsercao).getTime()) / 60_000));
	const stuck = status === "EM_PROCESSAMENTO" && waitingMinutes >= FISCAL_DEADLINES.processingAlertMinutes;
	return (
		<>
			<StatusLine
				icon={Clock}
				tone={stuck ? "warning" : "neutral"}
				action={<ActionButton action={runner.actions.SINCRONIZAR} runner={runner} icon={RefreshCcw} label="Atualizar status" variant="outline" />}
			>
				{status === "EM_PROCESSAMENTO" ? (
					<>
						{typeLabel} enviada ao provedor há <strong>{waitingMinutes} min</strong>. Aguardando a SEFAZ.
					</>
				) : (
					"Na fila de envio. O envio acontece automaticamente em até 2 minutos."
				)}
			</StatusLine>
			<p className="text-micro font-normal text-muted-foreground">
				{stuck
					? "Está demorando mais que o normal. Atualize o status e, se persistir, confira o histórico."
					: `Cancelar, reenviar e inutilizar ficam disponíveis depois do retorno. Se passar de ${FISCAL_DEADLINES.processingAlertMinutes} min, atualize o status e confira o histórico.`}
			</p>
		</>
	);
}

function ClosedSituation({
	document,
	events,
	runner,
}: {
	document: TFiscalDocument;
	events: TFiscalDocumentEvents;
	runner: TFiscalDocumentActionRunner;
}) {
	const isCancelled = document.statusInterno === "CANCELADO";
	const closingEvent = events.find((event) => event.tipo === (isCancelled ? "CANCELADO" : "INUTILIZACAO"));
	const closedAt = document.dataCancelamento ?? closingEvent?.dataInsercao ?? null;
	const author = closingEvent?.autor?.nome;
	const verb = isCancelled ? "Cancelada" : "Numeração inutilizada";
	return (
		<>
			<p className="flex items-center gap-2 rounded-md bg-secondary/60 px-2.5 py-2 text-xs font-semibold text-foreground/80">
				<CircleX className="size-3.5 shrink-0 text-muted-foreground" />
				{verb}
				{closedAt ? ` em ${formatDateAsLocale(closedAt, true)}` : null}
				{author ? ` por ${author}` : null}.
			</p>
			{runner.actions.REENVIAR ? (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="min-w-[200px] flex-1 text-xs text-muted-foreground">
						A venda continua sem nota válida. Se ela segue de pé, emita um novo documento.
					</span>
					<ActionButton action={runner.actions.REENVIAR} runner={runner} icon={Zap} label="Emitir novamente" variant="default" />
				</div>
			) : null}
		</>
	);
}

/** Linha cinza com ícone, frase e um botão — a frase quebra sozinha antes de espremer o resto. */
function StatusLine({
	icon: Icon,
	tone = "neutral",
	action,
	children,
}: {
	icon: LucideIcon;
	tone?: "neutral" | "warning";
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex items-center gap-2 rounded-md px-2.5 py-2", tone === "warning" ? "bg-warning-surface" : "bg-secondary/60")}>
			<Icon className={cn("size-3.5 shrink-0", tone === "warning" ? "text-warning-surface-foreground" : "text-muted-foreground")} />
			<p className="min-w-0 flex-1 text-xs text-pretty text-foreground/80">{children}</p>
			{action}
		</div>
	);
}

type ActionButtonVariant = "default" | "outline" | "destructive" | "destructive-outline";

/**
 * Botão compacto ligado ao runner. Some quando o documento não aceita a ação; quando só falta
 * permissão (ou `showWhenBlocked`), aparece desabilitado com o motivo no `title`.
 */
function ActionButton({
	action,
	runner,
	icon: Icon,
	label,
	variant,
	showWhenBlocked = false,
}: {
	action: TResolvedFiscalAction | undefined;
	runner: TFiscalDocumentActionRunner;
	icon: LucideIcon;
	label: string;
	variant: ActionButtonVariant;
	showWhenBlocked?: boolean;
}) {
	if (!action) return null;
	if (!action.available && !action.permissionBlocked && !showWhenBlocked) return null;
	const key: TFiscalDocumentActionKey = action.key;
	const isRunning = runner.pendingAction === key;
	return (
		<Button
			type="button"
			size="sm"
			variant={variant === "destructive-outline" ? "outline" : variant}
			disabled={!action.available || runner.isPending}
			title={action.reason ?? undefined}
			onClick={() => runner.run(key)}
			className={cn(COMPACT_BUTTON_CLASSNAME, variant === "outline" && "bg-card", variant === "destructive-outline" && DESTRUCTIVE_OUTLINE_CLASSNAME)}
		>
			<Icon className={cn(isRunning && "animate-spin")} />
			{label}
		</Button>
	);
}
