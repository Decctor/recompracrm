"use client";

import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { type TKitSaveStatus, useKitBuilder } from "./kit-builder-context";

const SAVE_STATUS: Record<TKitSaveStatus, { label: string; className: string; icon: typeof CircleCheck }> = {
	NEW: { label: "Rascunho", className: "bg-muted text-muted-foreground", icon: CircleDashed },
	PENDING: { label: "Alterações não salvas", className: "bg-muted text-muted-foreground", icon: CircleDashed },
	SAVING: { label: "Salvando", className: "bg-brand/10 text-brand", icon: LoaderCircle },
	SAVED: { label: "Rascunho salvo", className: "bg-green-500/15 text-green-600 dark:text-green-400", icon: CircleCheck },
	ERROR: { label: "Erro ao salvar", className: "bg-destructive/10 text-destructive", icon: CircleAlert },
};

export default function KitBuilderHeader() {
	const { kitId, state, updateKit, saveStatus, saveNow } = useKitBuilder();
	const status = SAVE_STATUS[saveStatus];
	const StatusIcon = status.icon;

	return (
		<header className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
			<div className="flex w-full flex-col items-start justify-between gap-3 lg:flex-row">
				<div className="flex items-center gap-2">
					<Button type="button" variant="ghost" size="sm" className="flex items-center gap-1.5" asChild>
						<Link href={appRoutes.channels.visualKits()}>
							<ArrowLeft className="h-3.5 w-3.5" />
							VOLTAR
						</Link>
					</Button>
					<div className="flex flex-col">
						<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{kitId ? "Kit" : "Novo kit"}</p>
						<h1 className="text-sm font-semibold tracking-tight">CONSTRUTOR DE KITS</h1>
					</div>
				</div>
				<button
					type="button"
					onClick={() => (saveStatus === "ERROR" ? void saveNow() : undefined)}
					className={cn(
						"flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide",
						status.className,
						saveStatus !== "ERROR" && "cursor-default",
					)}
					title={saveStatus === "ERROR" ? "Tentar salvar de novo" : undefined}
				>
					<StatusIcon className={cn("h-3.5 w-3.5", saveStatus === "SAVING" && "animate-spin")} />
					{status.label}
				</button>
			</div>
			<TextInput label="NOME DO KIT" value={state.kit.nome} placeholder="Ex.: Oferta da semana · outubro" handleChange={(nome) => updateKit({ nome })} />
		</header>
	);
}
