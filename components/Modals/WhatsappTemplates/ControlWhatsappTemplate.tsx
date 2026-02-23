import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { updateWhatsappTemplate } from "@/lib/mutations/whatsapp-templates";
import { useWhatsappTemplateById } from "@/lib/queries/whatsapp-templates";
import { useWhatsappTemplateState } from "@/state-hooks/use-whatsapp-template-state";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import TemplateBodyEditor from "./Blocks/TemplateBodyEditor";
import TemplateButtonsConfig from "./Blocks/TemplateButtonsConfig";
import TemplateFooterConfig from "./Blocks/TemplateFooterConfig";
import TemplateGeneral from "./Blocks/TemplateGeneral";
import TemplateHeaderConfig from "./Blocks/TemplateHeaderConfig";
import TemplatePreview from "./Blocks/TemplatePreview";
type ControlWhatsappTemplateProps = {
	whatsappTemplateId: string;
	organizationId: string;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
	closeMenu: () => void;
	triggerContext?: TCampaignTriggerTypeEnum;
};

function ControlWhatsappTemplate({ whatsappTemplateId, organizationId, closeMenu, callbacks, triggerContext }: ControlWhatsappTemplateProps) {
	const { state, updateTemplate, updateComponents, updateBodyParameters, resetState, redefineState } = useWhatsappTemplateState({
		initialState: {},
	});

	const { data: whatsappTemplate, queryKey, isLoading, isError, isSuccess, error } = useWhatsappTemplateById({ id: whatsappTemplateId });
	const { mutate: handleUpdateWhatsappTemplateMutation, isPending } = useMutation({
		mutationKey: ["update-whatsapp-template"],
		mutationFn: updateWhatsappTemplate,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});

	useEffect(() => {
		if (whatsappTemplate) redefineState({ whatsappTemplate: whatsappTemplate });
	}, [whatsappTemplate, redefineState]);
	return (
		<ResponsiveMenu
			menuTitle="EDITAR TEMPLATE WHATSAPP"
			menuDescription="Edite o template de mensagem para WhatsApp Business."
			menuActionButtonText="ATUALIZAR TEMPLATE"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleUpdateWhatsappTemplateMutation({ whatsappTemplateId: whatsappTemplateId, whatsappTemplate: state.whatsappTemplate })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeMenu}
			dialogVariant="xl"
		>
			<div className="w-full flex items-start gap-2 flex-col lg:flex-row lg:max-h-full lg:h-full">
				<div className="w-full lg:w-2/3 flex flex-col gap-3 p-2 rounded-lg border border-primary/30 shadow-sm overflow-y-auto lg:h-full scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
					{/* Basic Information */}
					<TemplateGeneral template={state.whatsappTemplate} updateTemplate={updateTemplate} whatsappTemplateId={null} />
					<TemplateHeaderConfig
						header={state.whatsappTemplate.componentes.cabecalho ?? null}
						onHeaderChange={(header) => updateComponents({ cabecalho: header })}
						organizationId={organizationId}
					/>

					<TemplateBodyEditor
						content={state.whatsappTemplate.componentes.corpo.conteudo}
						contentChangeCallback={(content) =>
							updateComponents({
								corpo: {
									...state.whatsappTemplate.componentes.corpo,
									conteudo: content,
								},
							})
						}
						parametros={state.whatsappTemplate.componentes.corpo.parametros}
						onParametrosChange={updateBodyParameters}
						triggerContext={triggerContext}
					/>
				</div>
				<div className="w-full lg:w-1/3 p-2 rounded-lg border border-primary/30 shadow-sm flex flex-col lg:h-full lg:sticky lg:top-0">
					<TemplatePreview components={state.whatsappTemplate.componentes} />
				</div>
			</div>
		</ResponsiveMenu>
	);
}

export default ControlWhatsappTemplate;
