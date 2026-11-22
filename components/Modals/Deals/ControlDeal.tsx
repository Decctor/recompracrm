import type { TGetDealsOutputById } from "@/app/api/admin/deals/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import SelectInput from "@/components/Inputs/SelectInput";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { updateDeal } from "@/lib/mutations/deals";
import { useAdminDealById } from "@/lib/queries/deals";
import { useOrganizations } from "@/lib/queries/admin";
import { cn, copyToClipboard } from "@/lib/utils";
import type { TDeal } from "@/schemas/deals";
import { useInternalDealState } from "@/state-hooks/use-internal-deal-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, CreditCard, Link2, Unlink, XCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import DealGeneralBlock from "./Blocks/DealGeneralBlock";
import DealObtentorBlock from "./Blocks/DealObtentorBlock";
import DealOnboardingBlock from "./Blocks/DealOnboardingBlock";

const DEAL_STATUS_PILLS: Record<TGetDealsOutputById["status"], { label: string; className: string }> = {
	PENDENTE: { label: "AGUARDANDO PAGAMENTO", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
	ATIVO: { label: "ATIVO", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
	INADIMPLENTE: { label: "INADIMPLENTE", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
	CANCELADO: { label: "CANCELADO", className: "bg-muted text-foreground/60" },
};

function DealStatusPill({ status }: { status: TGetDealsOutputById["status"] }) {
	const pill = DEAL_STATUS_PILLS[status];
	return (
		<span
			className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-tight", pill.className)}
		>
			{pill.label}
		</span>
	);
}

type ControlDealProps = {
	dealId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function ControlDeal({ dealId, closeModal, callbacks }: ControlDealProps) {
	const queryClient = useQueryClient();
	const { data: deal, isLoading, error, queryKey } = useAdminDealById({ dealId });
	const { state, updateDeal: updateDealState, redefineState } = useInternalDealState({ initialState: {} });

	const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
	const [reissuedCheckoutUrl, setReissuedCheckoutUrl] = useState<string | null>(null);
	const [emittedFormUrl, setEmittedFormUrl] = useState<string | null>(null);
	const [cancelConfirmation, setCancelConfirmation] = useState(false);

	// Organizações candidatas ao vínculo: sem deal e sem assinatura própria em estado cobrável.
	const { data: organizationsData } = useOrganizations();
	const linkableOrganizations =
		organizationsData?.organizations.filter(
			(org) => !org.dealId && !(org.stripeSubscriptionStatus && ["active", "trialing", "past_due"].includes(org.stripeSubscriptionStatus)),
		) ?? [];

	useEffect(() => {
		if (!deal) return;
		redefineState({
			deal: {
				nome: deal.nome,
				descricao: deal.descricao,
				usuarioObtentorId: deal.usuarioObtentorId,
				nomeObtentor: deal.nomeObtentor,
				emailObtentor: deal.emailObtentor,
				telefoneObtentor: deal.telefoneObtentor,
				planoBase: deal.planoBase as TDeal["planoBase"],
				adicionais: deal.adicionais ?? [],
				quantidadeLicencas: deal.quantidadeLicencas,
				valorUnitarioCentavos: deal.valorUnitarioCentavos,
				intervalo: deal.intervalo,
			},
		});
	}, [deal, redefineState]);

	const { mutate: handleUpdateDealMutation, isPending } = useMutation({
		mutationKey: ["update-deal", dealId],
		mutationFn: updateDeal,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			await queryClient.cancelQueries({ queryKey });
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			if (data.data.checkoutUrl) setReissuedCheckoutUrl(data.data.checkoutUrl);
			if (data.data.formularioUrl) setEmittedFormUrl(data.data.formularioUrl);
			setSelectedOrganizationId(null);
			setCancelConfirmation(false);
			return toast.success(data.message);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	const licencasUtilizadas = deal?.organizacoes.length ?? 0;
	const dealIsCancelled = deal?.status === "CANCELADO";
	const dealHasActiveSubscription = Boolean(
		deal?.stripeSubscriptionStatus && ["active", "trialing", "past_due", "unpaid"].includes(deal.stripeSubscriptionStatus),
	);

	return (
		<ResponsiveMenu
			menuTitle="GERENCIAR DEAL"
			menuDescription="Acompanhe o status da assinatura, gerencie as licenças e as organizações vinculadas ao deal."
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="FECHAR"
			actionFunction={() =>
				handleUpdateDealMutation({
					action: "ATUALIZAR",
					dealId,
					deal: {
						nome: state.deal.nome,
						descricao: state.deal.descricao,
						nomeObtentor: state.deal.nomeObtentor,
						emailObtentor: state.deal.emailObtentor,
						telefoneObtentor: state.deal.telefoneObtentor,
					},
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="lg"
			drawerVariant="xl"
		>
			{deal ? (
				<>
					{/* Status da assinatura */}
					<ResponsiveMenuSection title="ASSINATURA" icon={<CreditCard className="h-3 w-3 min-w-3 min-h-3" />}>
						<div className="flex w-full flex-wrap items-center gap-1.5">
							<DealStatusPill status={deal.status} />
							<span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-input/30 px-2 py-0.5 text-[0.65rem] font-semibold tracking-tight text-foreground/70">
								{deal.planoBase}
							</span>
							<span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-input/30 px-2 py-0.5 text-[0.65rem] font-semibold tracking-tight text-foreground/70">
								{formatToMoney(deal.valorUnitarioCentavos / 100)} × {deal.quantidadeLicencas} /{deal.intervalo === "ANUAL" ? "ano" : "mês"}
							</span>
							<span className="text-xs text-foreground/60">Criado em {formatDateAsLocale(deal.dataInsercao)}</span>
						</div>
						<div className="flex w-full flex-wrap items-center gap-1.5">
							{deal.stripeSubscriptionId ? (
								<button
									type="button"
									title={`Copiar ID da assinatura Stripe: ${deal.stripeSubscriptionId}`}
									onClick={() => copyToClipboard(deal.stripeSubscriptionId as string)}
									className="inline-flex max-w-[220px] cursor-pointer items-center gap-1 rounded-full border border-border bg-input/30 px-2 py-0.5 font-mono text-[0.65rem] text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
								>
									<Copy className="h-3 w-3 min-w-3 min-h-3" />
									<span className="truncate">{deal.stripeSubscriptionId}</span>
								</button>
							) : null}
							{deal.stripeCustomerId ? (
								<button
									type="button"
									title={`Copiar ID do cliente Stripe: ${deal.stripeCustomerId}`}
									onClick={() => copyToClipboard(deal.stripeCustomerId as string)}
									className="inline-flex max-w-[220px] cursor-pointer items-center gap-1 rounded-full border border-border bg-input/30 px-2 py-0.5 font-mono text-[0.65rem] text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
								>
									<Copy className="h-3 w-3 min-w-3 min-h-3" />
									<span className="truncate">{deal.stripeCustomerId}</span>
								</button>
							) : null}
						</div>
						{!dealHasActiveSubscription && !dealIsCancelled ? (
							<div className="flex w-full flex-col gap-2">
								{reissuedCheckoutUrl ? (
									<div className="flex w-full items-center gap-2 rounded-md border border-border bg-input/30 px-3 py-2">
										<span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">{reissuedCheckoutUrl}</span>
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												copyToClipboard(reissuedCheckoutUrl);
												toast.success("Link copiado para a área de transferência.");
											}}
										>
											<Copy className="h-3.5 w-3.5 min-w-3.5 min-h-3.5" />
											COPIAR
										</Button>
									</div>
								) : null}
								<LoadingButton variant="outline" loading={isPending} onClick={() => handleUpdateDealMutation({ action: "REEMITIR_CHECKOUT", dealId })}>
									<Link2 className="h-4 w-4 min-w-4 min-h-4" />
									{reissuedCheckoutUrl ? "GERAR NOVO LINK DE CHECKOUT" : "GERAR LINK DE CHECKOUT"}
								</LoadingButton>
							</div>
						) : null}
					</ResponsiveMenuSection>

					{/* Organizações vinculadas (licenças) */}
					<ResponsiveMenuSection
						title={`LICENÇAS (${licencasUtilizadas} DE ${deal.quantidadeLicencas} UTILIZADAS)`}
						icon={<Building2 className="h-3 w-3 min-w-3 min-h-3" />}
					>
						{deal.organizacoes.length > 0 ? (
							<div className="flex w-full flex-col gap-2">
								{deal.organizacoes.map((org) => (
									<div key={org.id} className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-input/30 px-3 py-2">
										<div className="flex min-w-0 items-center gap-2">
											<div className="relative flex h-8 w-8 min-w-8 min-h-8 items-center justify-center overflow-hidden rounded-md bg-primary/10">
												{org.logoUrl ? (
													<Image src={org.logoUrl} alt={org.nome} fill className="object-cover" />
												) : (
													<Building2 className="h-4 w-4 text-foreground/40" />
												)}
											</div>
											<div className="flex min-w-0 flex-col">
												<span className="truncate text-xs font-semibold tracking-tight">{org.nome}</span>
												<span className="truncate text-[0.65rem] text-foreground/60">{org.cnpj}</span>
											</div>
										</div>
										<LoadingButton
											variant="ghost"
											size="sm"
											loading={isPending}
											onClick={() => handleUpdateDealMutation({ action: "DESVINCULAR_ORGANIZACAO", dealId, organizacaoId: org.id })}
											title="Desvincular organização (ela voltará ao fluxo convencional de assinatura)"
										>
											<Unlink className="h-3.5 w-3.5 min-w-3.5 min-h-3.5" />
										</LoadingButton>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-foreground/60">
								Nenhuma organização vinculada ainda. As licenças são consumidas automaticamente quando o obtentor cria organizações, ou podem ser vinculadas
								manualmente abaixo.
							</p>
						)}
						{!dealIsCancelled && licencasUtilizadas < deal.quantidadeLicencas ? (
							<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
								<div className="min-w-0 flex-1">
									<SelectInput
										label="VINCULAR ORGANIZAÇÃO EXISTENTE"
										value={selectedOrganizationId}
										options={linkableOrganizations.map((org, index) => ({
											id: index,
											value: org.id,
											label: org.nome,
										}))}
										resetOptionLabel="SELECIONE UMA ORGANIZAÇÃO"
										handleChange={(value) => setSelectedOrganizationId(value)}
										onReset={() => setSelectedOrganizationId(null)}
									/>
								</div>
								<LoadingButton
									variant="outline"
									loading={isPending}
									disabled={!selectedOrganizationId}
									onClick={() => {
										if (!selectedOrganizationId) return;
										handleUpdateDealMutation({ action: "VINCULAR_ORGANIZACAO", dealId, organizacaoId: selectedOrganizationId });
									}}
								>
									<Link2 className="h-4 w-4 min-w-4 min-h-4" />
									VINCULAR
								</LoadingButton>
							</div>
						) : null}
					</ResponsiveMenuSection>

					{/* Formulário público de onboarding */}
					<DealOnboardingBlock
						deal={deal}
						isPending={isPending}
						emittedFormUrl={emittedFormUrl}
						onEmit={(dataExpiracao) => handleUpdateDealMutation({ action: "EMITIR_FORMULARIO", dealId, dataExpiracao })}
						onRevoke={() => handleUpdateDealMutation({ action: "REVOGAR_FORMULARIO", dealId })}
					/>

					{/* Dados editáveis */}
					<DealGeneralBlock deal={state.deal} updateDeal={updateDealState} commercialTermsEditable={false} />
					<DealObtentorBlock deal={state.deal} updateDeal={updateDealState} />

					{/* Cancelamento */}
					{!dealIsCancelled ? (
						<ResponsiveMenuSection title="ZONA DE PERIGO" icon={<XCircle className="h-3 w-3 min-w-3 min-h-3" />}>
							<p className="text-xs text-foreground/60">
								Cancelar o deal encerra a assinatura no Stripe imediatamente e remove o acesso de todas as organizações vinculadas.
							</p>
							<LoadingButton
								variant={cancelConfirmation ? "destructive" : "outline"}
								loading={isPending}
								onClick={() => {
									if (!cancelConfirmation) return setCancelConfirmation(true);
									handleUpdateDealMutation({ action: "CANCELAR", dealId });
								}}
							>
								<XCircle className="h-4 w-4 min-w-4 min-h-4" />
								{cancelConfirmation ? "CLIQUE NOVAMENTE PARA CONFIRMAR O CANCELAMENTO" : "CANCELAR DEAL"}
							</LoadingButton>
						</ResponsiveMenuSection>
					) : null}
				</>
			) : null}
		</ResponsiveMenu>
	);
}
