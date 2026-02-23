import { cn } from "@/lib/utils";
import type { TUseOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { Building2, Check, Globe, LayoutDashboard, ShoppingBag, Store, Truck } from "lucide-react";

type ActuationStageProps = {
	state: TUseOrganizationOnboardingState["state"];
	updateOrganization: TUseOrganizationOnboardingState["updateOrganization"];
};

const BASE_SIZE_OPTIONS = [
	{ value: 50, label: "Até 50" },
	{ value: 100, label: "50 - 100" },
	{ value: 250, label: "100 - 250" },
	{ value: 500, label: "250 - 500" },
	{ value: 1000, label: "500 - 1000" },
	{ value: 2000, label: "+ 1000" },
];

const ERP_OPTIONS = [
	{ id: "online-software", label: "Online Software", value: "ONLINE_SOFTWARE" },
	{ id: "cardapio-web", label: "Cardápio Web", value: "CARDAPIO_WEB" },
	{ id: "bling", label: "Bling", value: "BLING" },
	{ id: "tiny", label: "Tiny", value: "TINY" },
	{ id: "omie", label: "Omie", value: "OMIE" },
	{ id: "contaazul", label: "Conta Azul", value: "CONTAAZUL" },
	{ id: "totvs", label: "TOTVS", value: "TOTVS" },
	{ id: "sankhya", label: "Sankhya", value: "SANKHYA" },
	{ id: "outro", label: "Outro", value: "OUTRO" },
];

const CHANNEL_OPTIONS = [
	{ id: "fisica", label: "Loja Física", value: "LOJA_FISICA", icon: <Store /> },
	{ id: "ecommerce", label: "E-commerce", value: "ECOMMERCE", icon: <Globe /> },
	{ id: "whatsapp", label: "WhatsApp", value: "WHATSAPP", icon: <ShoppingBag /> }, // Using ShoppingBag as a proxy or MessageCircle
	{ id: "marketplace", label: "Marketplace", value: "MARKETPLACE", icon: <LayoutDashboard /> },
	{ id: "delivery", label: "Delivery/Apps", value: "DELIVERY", icon: <Truck /> },
	{ id: "b2b", label: "B2B / Corporativo", value: "B2B", icon: <Building2 /> },
];

export function ActuationStage({ state, updateOrganization }: ActuationStageProps) {
	const handleMultiSelect = (field: "plataformasUtilizadas" | "atuacaoCanais", value: string) => {
		const currentString = state.organization[field] || "";
		const currentList = currentString ? currentString.split(",").filter(Boolean) : [];

		let newList: string[];
		if (currentList.includes(value)) {
			newList = currentList.filter((item) => item !== value);
		} else {
			newList = [...currentList, value];
		}

		updateOrganization({ [field]: newList.join(",") });
	};

	const isSelected = (field: "plataformasUtilizadas" | "atuacaoCanais", value: string) => {
		const currentString = state.organization[field] || "";
		const currentList = currentString ? currentString.split(",") : [];
		return currentList.includes(value);
	};

	return (
		<div className="w-full flex flex-col gap-6">
			{/* Base Size - Vertical Radio List Pattern */}
			<div className="w-full flex flex-col gap-4">
				<h3 className="text-lg font-medium tracking-tight">Qual o tamanho da sua base de clientes?</h3>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{BASE_SIZE_OPTIONS.map((option) => {
						const isSelected = state.organization.tamanhoBaseClientes === option.value;
						return (
							<button
								type="button"
								key={option.value}
								onClick={() => updateOrganization({ tamanhoBaseClientes: option.value })}
								className={cn(
									"flex items-center justify-between p-4 rounded-xl border transition-all duration-200 outline-none focus:ring-1 focus:ring-blue-500",
									isSelected ? "border-blue-600 bg-blue-50/50 shadow-sm z-10" : "border-gray-200 bg-white hover:bg-gray-50 hover:border-blue-200",
								)}
							>
								<div className="flex flex-col items-start text-left">
									<span className={cn("text-sm font-medium", isSelected ? "text-blue-900" : "text-gray-900")}>{option.label}</span>
									<span className="text-xs text-muted-foreground">clientes ativos</span>
								</div>
								<div
									className={cn(
										"h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
										isSelected ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-transparent",
									)}
								>
									{isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{/* ERPs - Compact Logo Grid */}
			<div className="w-full flex flex-col gap-4">
				<h3 className="text-lg font-medium tracking-tight">Quais sistemas (ERPs) vocês utilizam?</h3>
				<div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
					{ERP_OPTIONS.map((option) => {
						const selected = isSelected("plataformasUtilizadas", option.value);
						return (
							<button
								type="button"
								key={option.id}
								onClick={() => handleMultiSelect("plataformasUtilizadas", option.value)}
								className={cn(
									"group flex flex-col items-center justify-center gap-2 aspect-square rounded-xl border transition-all duration-200 p-2 outline-none focus:ring-1 focus:ring-[#FFB900]",
									selected ? "border-[#FFB900] bg-[#FFB900]/5 shadow-sm" : "border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm",
								)}
							>
								<div
									className={cn(
										"flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold bg-gray-50 text-gray-400 group-hover:scale-105 transition-transform",
										selected && "bg-[#FFB900] text-white",
									)}
								>
									{option.label.substring(0, 2).toUpperCase()}
								</div>
								<span className={cn("text-xs font-medium text-center truncate w-full", selected ? "text-[#B38000]" : "text-gray-600")}>{option.label}</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Channels - Checkbox List Tiles */}
			<div className="w-full flex flex-col gap-4">
				<h3 className="text-lg font-medium tracking-tight">Quais são seus canais de venda?</h3>
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
					{CHANNEL_OPTIONS.map((option) => {
						const selected = isSelected("atuacaoCanais", option.value);
						return (
							<button
								type="button"
								key={option.id}
								onClick={() => handleMultiSelect("atuacaoCanais", option.value)}
								className={cn(
									"flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 outline-none text-left focus:ring-1 focus:ring-blue-500",
									selected ? "border-blue-500 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50",
								)}
							>
								<div
									className={cn(
										"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors border",
										selected ? "bg-blue-500 border-blue-500 text-white" : "bg-white border-gray-200 text-gray-400",
									)}
								>
									{selected ? <Check className="h-4 w-4" /> : option.icon}
								</div>
								<span className={cn("text-sm font-medium", selected ? "text-blue-700" : "text-gray-700")}>{option.label}</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
