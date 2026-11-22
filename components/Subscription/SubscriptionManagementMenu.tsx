"use client";

import type { TGetSubscriptionAddonsOutput } from "@/app/api/organizations/subscription/addons/route";
import PlanPicker from "@/components/Subscription/PlanPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { addSubscriptionAddon, openBillingPortal, removeSubscriptionAddon } from "@/lib/mutations/subscriptions";
import { useOrganizationSubscriptionStatus } from "@/lib/queries/organizations";
import { useSubscriptionAddons } from "@/lib/queries/subscriptions";
import type { TSubscriptionAddonEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type SubscriptionManagementMenuProps = {
	closeMenu: () => void;
};

type TSubscriptionAddonsData = TGetSubscriptionAddonsOutput["data"];
type TSubscriptionAddonItem = TSubscriptionAddonsData["adicionais"][number];

const UNAVAILABLE_REASON_TEXT: Record<NonNullable<TSubscriptionAddonsData["motivoIndisponivel"]>, string> = {
	SEM_ASSINATURA: "Contrate um plano para incluir adicionais.",
	ASSINATURA_DE_DEAL: "A assinatura desta organização faz parte de um contrato. Fale com a gente para incluir ou retirar adicionais.",
	PLANO_ANTIGO: "O seu plano é de uma tabela anterior e segue como está. Fale com a gente para incluir adicionais.",
	CONTA_STRIPE_ANTIGA: "A sua assinatura é de uma tabela anterior e segue como está. Fale com a gente para incluir adicionais.",
	SEM_PERMISSAO: "Só quem administra a equipe pode alterar a assinatura da organização.",
};

// O webhook leva alguns segundos para liberar (ou retirar) o acesso depois que a assinatura muda.
const ENTITLEMENT_SYNC_DELAY_MS = 4000;

/**
 * Onde a organização vê o que assina e contrata um adicional. Quem ainda não assina (em teste, ou
 * com o acesso encerrado) vê o `PlanPicker` — é a mesma porta de entrada, com o conteúdo certo
 * para cada situação. O portal do Stripe continua a um clique, para forma de pagamento e
 * cancelamento.
 */
export default function SubscriptionManagementMenu({ closeMenu }: SubscriptionManagementMenuProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const { data: status } = useOrganizationSubscriptionStatus();
	const { data: subscription, isLoading, error } = useSubscriptionAddons();

	const isSubscriber = subscription?.assinante === true;
	const titulo = isSubscriber ? "Sua assinatura" : "Escolha seu plano";
	const descricao = isSubscriber
		? "O que está contratado e os adicionais que você pode incluir."
		: (status?.mensagem ?? "Contrate para manter o acesso à plataforma sem interrupção.");

	let content: React.ReactNode;
	if (isLoading) content = <MenuSkeleton />;
	else if (error || !subscription) content = <p className="text-sm font-medium text-destructive">{getErrorMessage(error)}</p>;
	else if (!isSubscriber) content = <PlanPicker acao={status?.acao ?? "ASSINAR"} />;
	else content = <SubscriptionOverview subscription={subscription} />;

	function handleOpenChange(open: boolean) {
		if (!open) closeMenu();
	}

	if (!isDesktop) {
		return (
			<Drawer open onOpenChange={handleOpenChange}>
				<DrawerContent className="max-h-[92vh]">
					<DrawerHeader className="text-left">
						<DrawerTitle>{titulo}</DrawerTitle>
						<DrawerDescription>{descricao}</DrawerDescription>
					</DrawerHeader>
					<div className="overflow-y-auto px-4 pb-6 scrollbar-subtle">{content}</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-3xl scrollbar-subtle">
				<DialogHeader>
					<DialogTitle>{titulo}</DialogTitle>
					<DialogDescription>{descricao}</DialogDescription>
				</DialogHeader>
				{content}
			</DialogContent>
		</Dialog>
	);
}

function SubscriptionOverview({ subscription }: { subscription: TSubscriptionAddonsData }) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const { queryKey } = useSubscriptionAddons({ enabled: false });
	const [pendingAddon, setPendingAddon] = useState<TSubscriptionAddonEnum | null>(null);

	async function handleChanged(message: string) {
		toast.success(message);
		await queryClient.invalidateQueries({ queryKey });
		// O acesso vem do webhook; recarrega a sessão quando ele já deve ter passado.
		window.setTimeout(() => router.refresh(), ENTITLEMENT_SYNC_DELAY_MS);
	}

	const addMutation = useMutation({
		mutationKey: ["add-subscription-addon"],
		mutationFn: addSubscriptionAddon,
		onMutate: (variables) => setPendingAddon(variables.addon),
		onSuccess: (data) => handleChanged(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: () => setPendingAddon(null),
	});
	const removeMutation = useMutation({
		mutationKey: ["remove-subscription-addon"],
		mutationFn: removeSubscriptionAddon,
		onMutate: (variables) => setPendingAddon(variables.addon),
		onSuccess: (data) => handleChanged(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: () => setPendingAddon(null),
	});
	const portalMutation = useMutation({
		mutationKey: ["open-billing-portal"],
		mutationFn: openBillingPortal,
		onSuccess: (data) => {
			window.location.href = data.data.portalUrl;
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const isBusy = addMutation.isPending || removeMutation.isPending;
	const cycleLabel = subscription.ciclo === "ANUAL" ? "ano" : "mês";

	return (
		<div className="brand-recompracrm flex flex-col gap-4">
			<div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
				<div className="flex flex-col gap-0.5">
					<span className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">Plano</span>
					<span className="text-base leading-tight font-extrabold tracking-tight">{subscription.planoNome ?? "Plano atual"}</span>
					{subscription.ciclo ? (
						<span className="text-[13px] leading-snug text-muted-foreground">
							{subscription.ciclo === "ANUAL" ? "Cobrança anual." : "Cobrança mensal."}
						</span>
					) : null}
				</div>
				<Button
					type="button"
					variant="outline"
					disabled={portalMutation.isPending || portalMutation.isSuccess}
					onClick={() => portalMutation.mutate()}
					className="w-full shrink-0 font-bold sm:w-auto"
				>
					{portalMutation.isPending || portalMutation.isSuccess ? (
						<Loader2 className="size-4 animate-spin" aria-hidden />
					) : (
						<CreditCard className="size-4" aria-hidden />
					)}
					Pagamento e cancelamento
				</Button>
			</div>

			<h3 className="text-sm font-bold tracking-tight text-muted-foreground">Adicionais</h3>
			{subscription.motivoIndisponivel ? (
				<p className="rounded-2xl border border-border px-4 py-3 text-[13px] leading-snug text-muted-foreground">
					{UNAVAILABLE_REASON_TEXT[subscription.motivoIndisponivel]}
				</p>
			) : null}

			<ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
				{subscription.adicionais.map((addon) => (
					<AddonItem
						key={addon.chave}
						addon={addon}
						cycleLabel={cycleLabel}
						manageable={subscription.gerenciavel}
						disabled={isBusy}
						isPending={pendingAddon === addon.chave}
						onAdd={() => addMutation.mutate({ addon: addon.chave })}
						onRemove={() => removeMutation.mutate({ addon: addon.chave })}
					/>
				))}
			</ul>
		</div>
	);
}

function AddonItem({
	addon,
	cycleLabel,
	manageable,
	disabled,
	isPending,
	onAdd,
	onRemove,
}: {
	addon: TSubscriptionAddonItem;
	cycleLabel: string;
	manageable: boolean;
	disabled: boolean;
	isPending: boolean;
	onAdd: () => void;
	onRemove: () => void;
}) {
	// Contratar cobra na hora, retirar tira o acesso na hora: as duas ações pedem um segundo clique.
	const [confirming, setConfirming] = useState(false);
	const canAdd = manageable && !addon.contratado && addon.disponivelNoCiclo && addon.preco !== null;
	const canRemove = manageable && addon.contratado;

	function handleConfirm() {
		setConfirming(false);
		if (addon.contratado) onRemove();
		else onAdd();
	}

	return (
		<li className="flex flex-col gap-3 p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm leading-tight font-bold tracking-tight">{addon.nome}</span>
						{addon.contratado ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-brand-secondary/12 px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-brand-secondary uppercase">
								<Check className="size-3" strokeWidth={3} aria-hidden />
								Contratado
							</span>
						) : null}
					</div>
					<p className="text-[13px] leading-snug text-muted-foreground">{addon.descricao}</p>
					{!addon.disponivelNoCiclo ? <p className="text-[13px] leading-snug text-muted-foreground">Disponível apenas para assinaturas mensais.</p> : null}
				</div>
				{addon.preco !== null ? (
					<span className="shrink-0 text-sm font-extrabold tracking-tight tabular-nums">
						{formatToMoney(addon.preco)}
						<span className="text-[13px] font-medium text-muted-foreground">/{cycleLabel}</span>
					</span>
				) : null}
			</div>

			{confirming ? (
				<div className="flex flex-col gap-2 rounded-xl bg-muted/70 p-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-[13px] leading-snug text-foreground">
						{addon.contratado
							? "O acesso é retirado agora. O valor do período não utilizado vira crédito na próxima cobrança."
							: "O valor proporcional ao período em curso é cobrado agora, na forma de pagamento da assinatura."}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
							Voltar
						</Button>
						<Button type="button" variant={addon.contratado ? "destructive" : "brand"} size="sm" onClick={handleConfirm} className="font-bold">
							{addon.contratado ? "Retirar adicional" : "Confirmar contratação"}
						</Button>
					</div>
				</div>
			) : canAdd || canRemove ? (
				<Button
					type="button"
					variant={canAdd ? "brand" : "outline"}
					size="sm"
					disabled={disabled}
					onClick={() => setConfirming(true)}
					className="w-full font-bold sm:w-fit"
				>
					{isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
					{canAdd ? `Incluir ${addon.nome}` : "Retirar"}
				</Button>
			) : null}
		</li>
	);
}

function MenuSkeleton() {
	return (
		<div className="flex flex-col gap-4" aria-label="Carregando assinatura" aria-busy>
			<div className="h-20 w-full animate-pulse rounded-2xl bg-muted" />
			<div className="h-5 w-32 animate-pulse rounded bg-muted" />
			<div className="h-40 w-full animate-pulse rounded-2xl bg-muted" />
		</div>
	);
}
