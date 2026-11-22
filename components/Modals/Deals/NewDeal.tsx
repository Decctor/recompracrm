import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { DEAL_PLAN_KEY } from "@/config";
import { getErrorMessage } from "@/lib/errors";
import { isSubscriptionBasePlanKey } from "@/lib/subscriptions/entitlements";
import { createDeal } from "@/lib/mutations/deals";
import { copyToClipboard } from "@/lib/utils";
import { useInternalDealState } from "@/state-hooks/use-internal-deal-state";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import DealGeneralBlock from "./Blocks/DealGeneralBlock";
import DealObtentorBlock from "./Blocks/DealObtentorBlock";

type NewDealProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function NewDeal({ closeModal, callbacks }: NewDealProps) {
	const { state, updateDeal } = useInternalDealState({ initialState: {} });
	// Após a criação, o modal vira a tela de entrega do link de checkout — o admin copia
	// e envia ao comprador. Fechar sem copiar não perde nada: dá para reemitir no gerenciar.
	const [generatedCheckoutUrl, setGeneratedCheckoutUrl] = useState<string | null>(null);

	const { mutate: handleCreateDealMutation, isPending } = useMutation({
		mutationKey: ["create-deal"],
		mutationFn: createDeal,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			if (data.data.checkoutUrl) setGeneratedCheckoutUrl(data.data.checkoutUrl);
			else closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO DEAL"
			menuDescription="Crie uma venda personalizada: múltiplas licenças cobertas por uma única assinatura no Stripe, com valor negociado."
			menuActionButtonText={generatedCheckoutUrl ? "CONCLUIR" : "CRIAR DEAL"}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => {
				if (generatedCheckoutUrl) return closeModal();
				// Deal novo só nasce com um plano-base vendido hoje (o estado também serve a deals antigos).
				handleCreateDealMutation({
					deal: { ...state.deal, planoBase: isSubscriptionBasePlanKey(state.deal.planoBase) ? state.deal.planoBase : DEAL_PLAN_KEY },
				});
			}}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			{generatedCheckoutUrl ? (
				<div className="flex w-full flex-col items-center gap-4 py-6">
					<CheckCircle2 className="h-10 w-10 text-emerald-500" />
					<div className="flex flex-col items-center gap-1 text-center">
						<h3 className="text-sm font-semibold tracking-tight">DEAL CRIADO COM SUCESSO</h3>
						<p className="max-w-md text-xs text-foreground/60">
							Envie o link de checkout abaixo ao comprador. Assim que o pagamento for confirmado, as licenças ficarão disponíveis para o email cadastrado.
						</p>
					</div>
					<div className="flex w-full max-w-lg items-center gap-2 rounded-md border border-border bg-input/30 px-3 py-2">
						<span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">{generatedCheckoutUrl}</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								copyToClipboard(generatedCheckoutUrl);
								toast.success("Link copiado para a área de transferência.");
							}}
						>
							<Copy className="h-3.5 w-3.5 min-w-3.5 min-h-3.5" />
							COPIAR
						</Button>
					</div>
					<a
						href={generatedCheckoutUrl}
						target="_blank"
						rel="noreferrer"
						className="flex items-center gap-1 text-xs text-foreground/60 underline-offset-2 hover:underline"
					>
						<ExternalLink className="h-3 w-3 min-w-3 min-h-3" />
						Abrir checkout em nova aba
					</a>
				</div>
			) : (
				<>
					<DealGeneralBlock deal={state.deal} updateDeal={updateDeal} />
					<DealObtentorBlock deal={state.deal} updateDeal={updateDeal} />
				</>
			)}
		</ResponsiveMenu>
	);
}
