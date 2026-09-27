"use client";

import { Input } from "@/components/ui/input";
import { SelectGroup, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TTemplateCategory, TTemplateStatus } from "@/app/dashboard/communication/_components/template-draft-store";
import type { TUseMessageTemplateState } from "@/state-hooks/use-message-template-state";
import { Mail } from "lucide-react";
import { MessageTemplateField } from "./MessageTemplateFields";
import { slugifyMessageTemplateSender } from "./message-template-utils";
import { MessageTemplateHeaderEditor, MessageTemplateHeaderTypeSelect } from "./MessageTemplateHeaderEditor";
import { MessageTemplateBodyEditor } from "./MessageTemplateBodyEditor";
import { MessageTemplateButtonsEditor } from "./MessageTemplateButtonsEditor";
import { MessageTemplateVariablesEditor } from "./MessageTemplateVariablesEditor";
import { formatMessageTemplateName } from "@/lib/formatting";

const categoryOptions: TTemplateCategory[] = ["MARKETING", "UTILIDADE", "AUTENTICAÇÃO"];
const statusOptions: TTemplateStatus[] = ["RASCUNHO", "ATIVO", "ARQUIVADO"];

export function MessageTemplateConfigurationSection({
	state,
	organizationName,
	updateTemplate,
	updateTemplateContent,
}: {
	state: TUseMessageTemplateState["state"];
	organizationName: string;
	updateTemplate: TUseMessageTemplateState["updateTemplate"];
	updateTemplateContent: TUseMessageTemplateState["updateTemplateContent"];
}) {
	return (
		<div className="flex flex-col gap-4">
			<MessageTemplateField label="Nome interno">
				<Input
					value={state.messageTemplate.nome}
					onChange={(event) => updateTemplate({ nome: formatMessageTemplateName(event.target.value) })}
					placeholder="cashback_expirando_7_dias"
				/>
			</MessageTemplateField>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
				<MessageTemplateField label="Status">
					<Select
						items={[...statusOptions.map((status) => ({ value: status, label: status }))]}
						value={state.messageTemplate.status}
						onValueChange={(value) => {
							if (value === null) return;
							updateTemplate({ status: value as TTemplateStatus });
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{statusOptions.map((status) => (
									<SelectItem key={status} value={status}>
										{status}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</MessageTemplateField>
				<MessageTemplateField label="Categoria">
					<Select
						items={[...categoryOptions.map((category) => ({ value: category, label: category }))]}
						value={state.messageTemplate.categoria}
						onValueChange={(value) => {
							if (value === null) return;
							updateTemplate({ categoria: value as TTemplateCategory });
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{categoryOptions.map((category) => (
									<SelectItem key={category} value={category}>
										{category}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</MessageTemplateField>
			</div>
			<div className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
				<p className="flex items-center gap-1.5 text-xs font-bold uppercase">
					<Mail className="h-3.5 w-3.5" />
					E-mail
				</p>
				<MessageTemplateField label="Assunto">
					<Input
						value={state.messageTemplate.conteudo.assunto}
						onChange={(event) => updateTemplateContent({ assunto: event.target.value })}
						placeholder="{{clientName}}, temos novidades"
					/>
				</MessageTemplateField>
				<MessageTemplateField label="Preheader">
					<Input
						value={state.messageTemplate.conteudo.preheader}
						onChange={(event) => updateTemplateContent({ preheader: event.target.value })}
						placeholder="Texto de apoio exibido na caixa de entrada."
					/>
				</MessageTemplateField>
				<p className="text-muted-foreground text-xs">
					Remetente previsto: <strong>{slugifyMessageTemplateSender(organizationName)}@recompracrm.com.br</strong>
				</p>
			</div>
		</div>
	);
}

export function MessageTemplateContentSection({
	state,
	organizationId,
	unknownVariables,
	updateTemplateContent,
	updateTemplateContentHeader,
	updateTemplateContentBody,
	updateTemplateContentBodyParameter,
	addContentButton,
	addContentPresetButton,
	appendContentButtons,
	updateContentButton,
	removeContentButton,
}: {
	state: TUseMessageTemplateState["state"];
	organizationId: string;
	unknownVariables: string[];
	updateTemplateContent: TUseMessageTemplateState["updateTemplateContent"];
	updateTemplateContentHeader: TUseMessageTemplateState["updateTemplateContentHeader"];
	updateTemplateContentBody: TUseMessageTemplateState["updateTemplateContentBody"];
	updateTemplateContentBodyParameter: TUseMessageTemplateState["updateTemplateContentBodyParameter"];
	addContentButton: TUseMessageTemplateState["addContentButton"];
	addContentPresetButton: TUseMessageTemplateState["addContentPresetButton"];
	appendContentButtons: TUseMessageTemplateState["appendContentButtons"];
	updateContentButton: TUseMessageTemplateState["updateContentButton"];
	removeContentButton: TUseMessageTemplateState["removeContentButton"];
}) {
	return (
		<div className="flex flex-col gap-4">
			<MessageTemplateHeaderTypeSelect header={state.messageTemplate.conteudo.cabecalho} updateTemplateContentHeader={updateTemplateContentHeader} />
			<MessageTemplateHeaderEditor
				organizationId={organizationId}
				header={state.messageTemplate.conteudo.cabecalho}
				updateTemplateContentHeader={updateTemplateContentHeader}
			/>

			<MessageTemplateField label="Corpo da mensagem">
				<MessageTemplateBodyEditor
					content={state.messageTemplate.conteudo.corpo.conteudo}
					onContentChange={(conteudo) => updateTemplateContentBody({ conteudo })}
					parametros={state.messageTemplate.conteudo.corpo.parametros}
					onParametrosChange={(parametros) => updateTemplateContentBody({ parametros })}
				/>
			</MessageTemplateField>

			<MessageTemplateField label="Rodapé">
				<Input
					value={state.messageTemplate.conteudo.rodape || ""}
					onChange={(event) => updateTemplateContent({ rodape: event.target.value })}
					placeholder="Mensagem automática da sua loja."
				/>
			</MessageTemplateField>

			<MessageTemplateButtonsEditor
				buttons={state.messageTemplate.conteudo.botoes}
				addContentButton={addContentButton}
				addContentPresetButton={addContentPresetButton}
				appendContentButtons={appendContentButtons}
				updateContentButton={updateContentButton}
				removeContentButton={removeContentButton}
			/>

			<MessageTemplateVariablesEditor
				parametros={state.messageTemplate.conteudo.corpo.parametros}
				unknownVariables={unknownVariables}
				updateTemplateContentBodyParameter={updateTemplateContentBodyParameter}
			/>
		</div>
	);
}
