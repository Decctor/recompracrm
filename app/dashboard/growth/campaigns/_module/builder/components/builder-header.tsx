"use client";

import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, CircleCheck, CircleDashed } from "lucide-react";
import { CAMPAIGN_ACTIVATION_DENIED_HINT, useCampaignPermissions } from "@/app/dashboard/growth/campaigns/_module/shared/campaign-permissions";
import { useBuilderCampaign } from "./builder-provider";
import Link from "next/link";
type BuilderHeaderProps = {
	backToUrl: string;
};
export default function BuilderHeader({ backToUrl }: BuilderHeaderProps) {
	const { state, updateCampaign } = useBuilderCampaign();
	const { campaign } = state;
	const campaignPermissions = useCampaignPermissions();

	return (
		<header className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
			<div className="flex w-full items-start justify-between gap-3 flex-col lg:flex-row">
				<div className="flex items-center gap-2">
					<Button type="button" variant="ghost" size="sm" className="flex items-center gap-1.5" asChild>
						<Link href={backToUrl}>
							<ArrowLeft className="h-3.5 w-3.5" />
							VOLTAR
						</Link>
					</Button>
					<div className="flex flex-col">
						<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nova campanha</p>
						<h1 className="text-sm font-semibold tracking-tight">CONSTRUTOR DE CAMPANHAS</h1>
					</div>
				</div>
				<button
					type="button"
					onClick={() => updateCampaign({ ativo: !campaign.ativo })}
					disabled={!campaignPermissions.ativar}
					title={campaignPermissions.ativar ? undefined : CAMPAIGN_ACTIVATION_DENIED_HINT}
					className={cn(
						"flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-70",
						campaign.ativo
							? "bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400"
							: "bg-muted text-muted-foreground hover:bg-muted/80",
					)}
					aria-pressed={campaign.ativo}
				>
					{campaign.ativo ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
					{campaign.ativo ? "Ativa" : "Rascunho"}
				</button>
			</div>
			<div className="w-full">
				<TextInput
					label="TÍTULO DA CAMPANHA"
					value={campaign.titulo}
					placeholder="Ex: Reativação de clientes em risco"
					handleChange={(value) => updateCampaign({ titulo: value })}
				/>
			</div>
		</header>
	);
}
