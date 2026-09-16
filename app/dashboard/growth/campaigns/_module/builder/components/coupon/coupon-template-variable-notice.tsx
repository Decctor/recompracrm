"use client";

import { useMessageTemplates } from "@/lib/queries/message-templates";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { Info } from "lucide-react";
import { useBuilderUi } from "../builder-provider";

/** Identificador interno da variável de código de cupom (o `coupon_code` é o id externo na Meta). */
const COUPON_CODE_VARIABLE = "couponCode";

type CouponTemplateVariableNoticeProps = {
	campaign: TUseCampaignState["state"]["campaign"];
};

/**
 * Atribuir um cupom sem comunicar o código é um erro silencioso: a campanha dispara, o cliente
 * recebe a mensagem e nunca fica sabendo do cupom que ganhou. Este aviso fecha esse buraco entre
 * as etapas Mensagem e Efeitos.
 */
export default function CouponTemplateVariableNotice({ campaign }: CouponTemplateVariableNoticeProps) {
	const { setCurrentStage } = useBuilderUi();
	const { data: messageTemplatesResult } = useMessageTemplates({ initialParams: { page: 1, search: "", pageSize: 100 } });

	if (!campaign.cupomGeracaoAtivo || !campaign.whatsappTemplateId) return null;

	const selectedTemplate = (messageTemplatesResult?.messageTemplates ?? []).find((template) => template.id === campaign.whatsappTemplateId);
	if (!selectedTemplate) return null;

	const usesCouponCode = selectedTemplate.conteudo.corpo.parametros.some((parametro) => parametro.identificadorInterno === COUPON_CODE_VARIABLE);
	if (usesCouponCode) return null;

	return (
		<div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
			<Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
			<p className="text-xs leading-snug text-muted-foreground">
				O template <span className="font-semibold text-foreground">{selectedTemplate.nome}</span> ainda não usa{" "}
				<span className="font-mono text-foreground">{`{{${COUPON_CODE_VARIABLE}}}`}</span>, então o cliente não vai receber o código do cupom.{" "}
				<button type="button" onClick={() => setCurrentStage("message")} className="font-semibold text-primary hover:underline">
					Voltar para a etapa Mensagem
				</button>{" "}
				para adicionar a variável.
			</p>
		</div>
	);
}
