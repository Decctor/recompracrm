import { OrganizationNicheOptions } from "@/config/onboarding";
import { cn } from "@/lib/utils";
import type { TUseOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { Check, HelpCircle } from "lucide-react";
import { FaGoogle, FaInstagram, FaLinkedin, FaUserGroup, FaYoutube } from "react-icons/fa6";

type NicheOriginStageProps = {
	state: TUseOrganizationOnboardingState["state"];
	updateOrganization: TUseOrganizationOnboardingState["updateOrganization"];
};

const ORIGIN_OPTIONS = [
	{ id: "instagram", label: "INSTAGRAM", icon: <FaInstagram /> },
	{ id: "linkedin", label: "LinkedIn", icon: <FaLinkedin /> },
	{ id: "youtube", label: "YouTube", icon: <FaYoutube /> },
	{ id: "google", label: "Google", icon: <FaGoogle /> },
	{ id: "indicacao", label: "Indicação", icon: <FaUserGroup /> },
	{ id: "outro", label: "Outro", icon: <HelpCircle /> },
];

export function NicheOriginStage({ state, updateOrganization }: NicheOriginStageProps) {
	return (
		<div className="w-full flex flex-col gap-6">
			<div className="w-full flex flex-col gap-4">
				<h3 className="text-lg font-medium tracking-tight">Qual o nicho de atuação da sua empresa?</h3>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{OrganizationNicheOptions.map((niche) => {
						const isSelected = state.organization.atuacaoNicho === niche.value;
						return (
							<button
								type="button"
								key={niche.id}
								onClick={() => updateOrganization({ atuacaoNicho: niche.value })}
								className={cn(
									"flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left outline-none focus:ring-1 focus:ring-[#FFB900]",
									isSelected ? "border-[#FFB900] bg-[#FFB900]/5 shadow-sm" : "border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50",
								)}
							>
								<div
									className={cn(
										"flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
										isSelected ? "bg-[#FFB900] text-white" : "bg-gray-100 text-gray-500",
									)}
								>
									{niche.renderIcon("h-6 w-6") || <HelpCircle className="h-6 w-6" />}
								</div>
								<div className="flex flex-col">
									<span className={cn("font-bold text-sm", isSelected ? "text-[#B38000]" : "text-gray-900")}>{niche.label}</span>
									<span className="text-xs text-gray-500 font-normal">Selecionar este nicho</span>
								</div>
								{isSelected && (
									<div className="ml-auto">
										<div className="h-6 w-6 rounded-full bg-[#FFB900] text-white flex items-center justify-center">
											<Check className="h-4 w-4 stroke-[3]" />
										</div>
									</div>
								)}
							</button>
						);
					})}
				</div>
			</div>

			<div className="w-full flex flex-col gap-4">
				<h3 className="text-lg font-medium tracking-tight">Como você conheceu a RecompraCRM?</h3>
				<div className="flex flex-wrap gap-3">
					{ORIGIN_OPTIONS.map((origin) => {
						const isSelected = state.organization.origemLead === origin.label.toUpperCase();
						return (
							<button
								type="button"
								key={origin.id}
								onClick={() => updateOrganization({ origemLead: origin.label.toUpperCase() })}
								className={cn(
									"flex items-center gap-2 px-4 py-2.5 rounded-full border transition-all duration-200 outline-none focus:ring-1 focus:ring-blue-500",
									isSelected
										? "border-blue-600 bg-blue-50 text-blue-700 font-semibold shadow-sm"
										: "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-gray-50",
								)}
							>
								<span className={cn("text-lg", isSelected ? "text-blue-600" : "text-gray-400")}>{origin.icon}</span>
								<span className="text-sm">{origin.label}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
