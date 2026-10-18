"use client";

import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useBuilder } from "./builder-provider";
import { ReadBadge } from "./builder-ui";

export default function BuilderHeader({ onBack }: { onBack: () => void }) {
	const { state, updatePurchase, readFields, clearReadField } = useBuilder();

	return (
		<header className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
			<div className="flex items-center gap-2">
				<Button type="button" variant="ghost" size="sm" className="flex items-center gap-1.5" onClick={onBack}>
					<ArrowLeft className="h-3.5 w-3.5" />
					VOLTAR
				</Button>
				<div className="flex flex-col">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nova compra</p>
					<h1 className="text-sm font-semibold tracking-tight">CONSTRUTOR DE COMPRAS</h1>
				</div>
			</div>
			<div className="flex w-full flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium tracking-tight text-foreground/80">TÍTULO DA COMPRA</span>
					<ReadBadge show={readFields.has("titulo")} label="Sugerido pela leitura" />
				</div>
				<TextInput
					label="TÍTULO DA COMPRA"
					showLabel={false}
					value={state.purchase.titulo}
					placeholder="Ex: Reposição de laticínios"
					handleChange={(value) => {
						clearReadField("titulo");
						updatePurchase({ titulo: value ?? "" });
					}}
				/>
			</div>
		</header>
	);
}
