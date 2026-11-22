"use client";
import { RecompraCRMIcon } from "@/components/icons";
import PlanSelectionMenu from "@/components/Subscription/PlanSelectionMenu";
import SubscriptionManagementMenu from "@/components/Subscription/SubscriptionManagementMenu";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppSubscriptionPlans, type TAppSubscriptionPlanKey } from "@/config";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { Sparkles } from "lucide-react";
import { useState } from "react";

const TRIAL_BADGE_COLOR = "hsl(0 0% 0%)";
const TRIAL_BADGE_FOREGROUND = "hsl(0 0% 100%)";

type TSubscriptionBadgeProps = {
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
};

export default function SubscriptionBadge({ organization }: TSubscriptionBadgeProps) {
	const { open } = useSidebar();
	const [showPlansMenu, setShowPlansMenu] = useState(false);
	const [showManagementMenu, setShowManagementMenu] = useState(false);

	const isPaying = organization.assinaturaAtiva && !!organization.assinaturaPlano;
	const isOnTrial = organization.assinaturaAtiva && !organization.assinaturaPlano;

	// Com plano gravado → clicar abre o menu da assinatura: o plano, os adicionais que dá para
	// incluir e o atalho para o portal do Stripe. O menu decide o que mostrar pela assinatura real
	// (quem está em teste também tem `assinaturaPlano`, e lá vê as opções de contratação).
	if (isPaying) {
		const planKey = organization.assinaturaPlano as TAppSubscriptionPlanKey;
		const plan = AppSubscriptionPlans[planKey] ?? null;
		const displayName = plan?.name ?? "Plano";
		const planColor = plan?.color ?? "#24549C";

		const badgeContent = (
			<SidebarMenuButton
				onClick={() => setShowManagementMenu(true)}
				className="h-10 flex items-center gap-2 justify-center transition-all duration-200 hover:opacity-90 rounded-4xl border-0"
				style={{
					background: `linear-gradient(135deg, ${planColor} 0%, ${planColor}D9 100%)`,
					color: "#FFFFFF",
					boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
				}}
			>
				<RecompraCRMIcon className="h-4 w-4 shrink-0 text-white" />
				{open && <span className="truncate font-bold text-xs tracking-wide text-white drop-shadow-sm">PLANO {displayName}</span>}
			</SidebarMenuButton>
		);

		return (
			<>
				<SidebarMenuItem>
					{open ? (
						badgeContent
					) : (
						<Tooltip>
							<TooltipTrigger render={badgeContent} />
							<TooltipContent side="right" sideOffset={8}>
								Gerenciar assinatura
							</TooltipContent>
						</Tooltip>
					)}
				</SidebarMenuItem>
				{showManagementMenu && <SubscriptionManagementMenu closeMenu={() => setShowManagementMenu(false)} />}
			</>
		);
	}

	// Em teste → clicar abre o menu de planos para assinar.
	if (isOnTrial) {
		const trialContent = (
			<SidebarMenuButton
				onClick={() => setShowPlansMenu(true)}
				className="h-10 flex items-center gap-2 justify-center transition-all duration-200 hover:opacity-90 rounded-4xl border-0"
				style={{
					background: TRIAL_BADGE_COLOR,
					color: TRIAL_BADGE_FOREGROUND,
					boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
				}}
			>
				<RecompraCRMIcon className="h-4 w-4 shrink-0 text-white" />
				{open && <span className="truncate font-bold text-xs tracking-wide text-white drop-shadow-sm">PLANO EM TESTES</span>}
			</SidebarMenuButton>
		);

		return (
			<>
				<SidebarMenuItem>
					{open ? (
						trialContent
					) : (
						<Tooltip>
							<TooltipTrigger render={trialContent} />
							<TooltipContent side="right" sideOffset={8}>
								Você está em período de testes — escolha um plano
							</TooltipContent>
						</Tooltip>
					)}
				</SidebarMenuItem>
				{showPlansMenu && <PlanSelectionMenu closeMenu={() => setShowPlansMenu(false)} />}
			</>
		);
	}

	// Sem assinatura ativa → botão de adquirir plano, que abre o menu de planos.
	const acquireContent = (
		<SidebarMenuButton
			onClick={() => setShowPlansMenu(true)}
			className="h-10 flex items-center gap-2 justify-center transition-all duration-200 bg-linear-to-r from-[#ffb900] to-[#ffb900]/90 text-white hover:text-white hover:from-[#ffb900]/80 hover:to-[#ffb900]/90 rounded-4xl shadow-md border-0"
		>
			<Sparkles className="h-4 w-4 shrink-0" />
			{open && <span className="truncate font-bold text-xs tracking-wide">ADQUIRIR PLANO</span>}
		</SidebarMenuButton>
	);

	return (
		<>
			<SidebarMenuItem>
				{open ? (
					acquireContent
				) : (
					<Tooltip>
						<TooltipTrigger render={acquireContent} />
						<TooltipContent side="right" sideOffset={8}>
							Adquirir Plano
						</TooltipContent>
					</Tooltip>
				)}
			</SidebarMenuItem>
			{showPlansMenu && <PlanSelectionMenu closeMenu={() => setShowPlansMenu(false)} />}
		</>
	);
}
