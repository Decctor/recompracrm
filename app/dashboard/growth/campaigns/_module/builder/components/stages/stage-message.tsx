"use client";

import ControlMessageTemplate from "@/components/Modals/MessageTemplates/ControlMessageTemplate";
import NewMessageTemplate from "@/components/Modals/MessageTemplates/NewMessageTemplate";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
	buildClonedMessageTemplateName,
	getMessageTemplateLibraryEntries,
	type TOnboardingTemplateVariant,
} from "@/config/message-template-library";
import { validateTemplateForTrigger } from "@/lib/message-templates";
import { useCashbackProgram } from "@/lib/queries/cashback-programs";
import { useMessageTemplates } from "@/lib/queries/message-templates";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import type { useMessageTemplateState } from "@/state-hooks/use-message-template-state";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Info, Library, MessageSquare, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getTriggerMeta } from "../../helpers/triggers";
import type { TStageValidationResult } from "../../helpers/validation";
import { useBuilderCampaign, useBuilderUi } from "../builder-provider";
import PhonePicker from "../message/phone-picker";
import SlidingSwap from "../message/sliding-swap";
import TemplateCard from "../message/template-card";
import TemplateLibraryPanel, { type TMessageTemplateLibraryEntry } from "../message/template-library-panel";
import { StageShell } from "../stage-shell";

/** Janela pedida ao servidor. Acima disso a busca é o caminho — ver comentário em `hasMoreThanLoaded`. */
const TEMPLATES_PAGE_SIZE = 100;

type TCreateDraftInitialState = NonNullable<Parameters<typeof useMessageTemplateState>[0]["initialState"]>;

type StageMessageProps = {
	organizationId: string;
	organizationName: string;
	organizationLogoUrl: string | null;
	validation: TStageValidationResult;
};

type TMessageTemplateListItem = NonNullable<ReturnType<typeof useMessageTemplates>["data"]>["messageTemplates"][number];

function getTemplateTriggerValidationParameters(template: TMessageTemplateListItem) {
	return template.conteudo.corpo.parametros.map((parametro) => ({
		nome: parametro.identificadorInterno,
		exemplo: parametro.exemplo,
		identificador: parametro.identificadorInterno,
	}));
}

export default function StageMessage({ organizationId, organizationName, organizationLogoUrl, validation }: StageMessageProps) {
	const { back, next } = useBuilderUi();
	const { state, updateCampaign } = useBuilderCampaign();
	const { campaign } = state;

	const [showLibrary, setShowLibrary] = useState(false);
	const [createDraft, setCreateDraft] = useState<{ initialState?: TCreateDraftInitialState } | null>(null);
	const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const { data: whatsappConnections } = useWhatsappConnections();
	// A variante da biblioteca segue o programa da organização: sem cashback ativo, os modelos
	// entram na cópia que não promete saldo nenhum.
	const { data: cashbackProgram } = useCashbackProgram();
	const cashbackAtivo = !!cashbackProgram?.ativo;
	const {
		data: messageTemplatesResult,
		queryKey,
		params,
		updateParams,
	} = useMessageTemplates({ initialParams: { page: 1, search: "", pageSize: TEMPLATES_PAGE_SIZE }, searchDebounceMs: 400 });

	const senderPhones = useMemo(
		() =>
			whatsappConnections
				?.flatMap((connection) => connection.telefones)
				.map((phone) => ({
					id: phone.id,
					nome: phone.nome,
					numero: phone.numero,
					pagamentoStatus: phone.metadados?.pagamento?.status ?? null,
				})) ?? [],
		[whatsappConnections],
	);

	const allTemplates = useMemo(() => messageTemplatesResult?.messageTemplates ?? [], [messageTemplatesResult]);
	const matchedCount = messageTemplatesResult?.messageTemplatesMatched ?? 0;
	// A compatibilidade com o gatilho é avaliada no cliente (depende das variáveis de cada corpo),
	// então só sabemos classificar o que foi carregado. Acima da janela, avisamos em vez de mentir.
	const hasMoreThanLoaded = matchedCount > allTemplates.length;

	const { compatibleTemplates, hiddenTemplates } = useMemo(() => {
		if (!campaign.gatilhoTipo) return { compatibleTemplates: allTemplates, hiddenTemplates: [] };

		const compatible: TMessageTemplateListItem[] = [];
		const hidden: { id: string; nome: string; incompatibleVariables: string[] }[] = [];

		for (const template of allTemplates) {
			const templateValidation = validateTemplateForTrigger(getTemplateTriggerValidationParameters(template), campaign.gatilhoTipo);
			if (templateValidation.valid) {
				compatible.push(template);
				continue;
			}
			hidden.push({ id: template.id, nome: template.nome, incompatibleVariables: templateValidation.incompatibleVariables });
		}

		return { compatibleTemplates: compatible, hiddenTemplates: hidden };
	}, [allTemplates, campaign.gatilhoTipo]);

	const libraryEntries = useMemo(() => {
		const variant: TOnboardingTemplateVariant = cashbackAtivo ? "COM_CASHBACK" : "SEM_CASHBACK";
		const entries = getMessageTemplateLibraryEntries(variant);
		if (!campaign.gatilhoTipo) return entries;
		return entries.filter(
			(entry) =>
				validateTemplateForTrigger(
					entry.variables.map((variable) => ({ nome: variable, identificador: variable })),
					campaign.gatilhoTipo,
				).valid,
		);
	}, [cashbackAtivo, campaign.gatilhoTipo]);

	// Mesma guarda do bloco antigo: trocar o gatilho pode invalidar o template já escolhido.
	useEffect(() => {
		if (!campaign.whatsappTemplateId || !campaign.gatilhoTipo || allTemplates.length === 0) return;
		const selectedTemplate = allTemplates.find((template) => template.id === campaign.whatsappTemplateId);
		if (!selectedTemplate) return;
		const templateValidation = validateTemplateForTrigger(getTemplateTriggerValidationParameters(selectedTemplate), campaign.gatilhoTipo);
		if (!templateValidation.valid) {
			updateCampaign({ whatsappTemplateId: "" });
			toast.warning("Template desmarcado: as variáveis dele não são compatíveis com o novo tipo de gatilho.");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [campaign.gatilhoTipo]);

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	function handleCloneFromLibrary(entry: TMessageTemplateLibraryEntry) {
		// O índice único (organizacaoId, nome) rejeita clonar com o nome do catálogo quando a
		// organização já passou pelo onboarding, então buscamos um nome livre antes de abrir.
		const nome = buildClonedMessageTemplateName(
			entry.nome,
			allTemplates.map((template) => template.nome),
		);
		setCreateDraft({
			initialState: {
				messageTemplate: {
					nome,
					status: "RASCUNHO",
					linguagem: "pt_BR",
					categoria: "MARKETING",
					metadados: { porNumeroTelefone: {} },
					conteudo: entry.conteudo,
				},
			},
		});
		setShowLibrary(false);
	}

	const templateListPane = (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex w-fit items-center gap-2 rounded bg-primary/20 px-2 py-1">
					<FileText className="h-4 w-4" />
					<h3 className="text-xs font-medium tracking-tight">TEMPLATE DE MENSAGEM</h3>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{compatibleTemplates.length === 1 ? "1 compatível com este gatilho" : `${compatibleTemplates.length} compatíveis com este gatilho`}
					</span>
					<Button type="button" size="sm" onClick={() => setCreateDraft({})} className="flex items-center gap-1.5 rounded-full">
						<Plus className="h-3.5 w-3.5" />
						CRIAR TEMPLATE
					</Button>
				</div>
			</div>

			<label className="flex h-9 w-full items-center gap-2 rounded-full border border-input bg-input/30 px-3">
				<Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
				<input
					value={params.search ?? ""}
					onChange={(event) => updateParams({ search: event.target.value })}
					placeholder="Buscar por nome, texto da mensagem ou variável..."
					className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</label>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
				{compatibleTemplates.map((template) => (
					<TemplateCard
						key={template.id}
						template={template}
						selectedPhoneId={campaign.whatsappConexaoTelefoneId ?? ""}
						isSelected={campaign.whatsappTemplateId === template.id}
						onSelect={() => updateCampaign({ whatsappTemplateId: template.id })}
						onEdit={() => setEditTemplateId(template.id)}
					/>
				))}

				<button
					type="button"
					onClick={() => setCreateDraft({})}
					className="flex min-h-[240px] flex-col items-start justify-center gap-2.5 rounded-xl border border-dashed border-primary/45 bg-primary/[0.04] p-4 text-left transition-colors hover:bg-primary/10"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<Plus className="h-4 w-4" />
					</span>
					<span className="flex flex-col gap-1">
						<span className="text-sm font-semibold tracking-tight">Criar template para esta campanha</span>
						<span className="text-xs leading-relaxed text-muted-foreground">
							Abre o construtor de templates, já com as variáveis que este gatilho preenche. Ao salvar, o template entra para aprovação da Meta e
							fica selecionado aqui.
						</span>
					</span>
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5">
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
					<Library className="h-4 w-4" />
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-px">
					<p className="text-[13px] font-semibold tracking-tight">Biblioteca RecompraCRM</p>
					<p className="text-xs text-muted-foreground">
						{libraryEntries.length === 0
							? "Nenhum modelo pronto serve para este gatilho."
							: `${libraryEntries.length} ${libraryEntries.length === 1 ? "modelo pronto" : "modelos prontos"} para clonar e editar.`}
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => setShowLibrary(true)}
					className="flex shrink-0 items-center gap-1.5 rounded-full"
				>
					VER BIBLIOTECA
				</Button>
			</div>

			{hiddenTemplates.length > 0 ? (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger
							delay={150}
							render={
								<div className="flex cursor-help items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-snug text-muted-foreground transition-colors hover:bg-muted/60">
									<Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
									<span>
										{hiddenTemplates.length === 1
											? "Mais um template não aparece aqui porque usa variáveis que este tipo de gatilho não fornece."
											: `Mais ${hiddenTemplates.length} templates não aparecem aqui porque usam variáveis que este tipo de gatilho não fornece.`}{" "}
										Passe o cursor para ver o nome de cada um e quais variáveis são.
									</span>
								</div>
							}
						/>
						<TooltipContent side="top" align="start" className="w-[360px] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
							<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex max-h-72 flex-col gap-3 overflow-y-auto overscroll-y-contain pr-1">
								<p className="text-xs font-semibold uppercase tracking-wide text-foreground">Templates fora da lista</p>
								<div className="flex flex-col gap-2">
									{hiddenTemplates.map((template) => (
										<div key={template.id} className="rounded-lg border border-border/60 bg-muted/35 px-2.5 py-2">
											<p className="text-xs font-semibold text-foreground">{template.nome}</p>
											<p className="mt-1 text-xs leading-snug text-muted-foreground">
												Variáveis que este gatilho não preenche: {template.incompatibleVariables.join(", ")}.
											</p>
										</div>
									))}
								</div>
							</div>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			) : null}

			{hasMoreThanLoaded ? (
				<p className="text-xs leading-snug text-muted-foreground">
					Mostrando {allTemplates.length} de {matchedCount} templates da organização. Use a busca para encontrar os demais.
				</p>
			) : null}
		</div>
	);

	return (
		<>
			{createDraft ? (
				<NewMessageTemplate
					organizationId={organizationId}
					organizationName={organizationName}
					organizationLogoUrl={organizationLogoUrl}
					initialState={createDraft.initialState}
					closeModal={() => setCreateDraft(null)}
					callbacks={{
						onMutate: handleOnMutate,
						onSuccess: (response) => {
							// Selecionar o template recém-criado é o ponto do fluxo inline: o usuário
							// veio criar PARA esta campanha, não para a biblioteca de comunicação.
							const insertedId = response.data.insertedId;
							if (insertedId) updateCampaign({ whatsappTemplateId: insertedId });
							handleOnSettled();
							setCreateDraft(null);
						},
						onSettled: handleOnSettled,
					}}
				/>
			) : null}

			{editTemplateId ? (
				<ControlMessageTemplate
					messageTemplateId={editTemplateId}
					organizationId={organizationId}
					organizationName={organizationName}
					organizationLogoUrl={organizationLogoUrl}
					closeModal={() => setEditTemplateId(null)}
					callbacks={{
						onMutate: handleOnMutate,
						onSuccess: () => {
							handleOnSettled();
							setEditTemplateId(null);
						},
						onSettled: handleOnSettled,
					}}
				/>
			) : null}

			<StageShell>
				<StageShell.Title
					icon={MessageSquare}
					label="Mensagem"
					description="Escolha o remetente do WhatsApp e o template que será enviado quando o gatilho disparar."
					rightSlot={
						campaign.gatilhoTipo ? (
							<div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
								<Sparkles className="h-3 w-3" />
								Gatilho: {getTriggerMeta(campaign.gatilhoTipo)?.label ?? campaign.gatilhoTipo}
							</div>
						) : null
					}
				/>
				<StageShell.Body>
					<PhonePicker
						phones={senderPhones}
						selectedPhoneId={campaign.whatsappConexaoTelefoneId ?? ""}
						onSelect={(phoneId) => updateCampaign({ whatsappConexaoTelefoneId: phoneId })}
					/>

					<SlidingSwap
						showSecondary={showLibrary}
						primary={templateListPane}
						secondary={
							<TemplateLibraryPanel
								entries={libraryEntries}
								onBack={() => setShowLibrary(false)}
								onClone={handleCloneFromLibrary}
								onCreateBlank={() => {
									setShowLibrary(false);
									setCreateDraft({});
								}}
							/>
						}
					/>
				</StageShell.Body>
				<StageShell.Footer onBack={back} onNext={next} nextDisabled={!validation.valid} nextDisabledReason={validation.reason} />
			</StageShell>
		</>
	);
}
