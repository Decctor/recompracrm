"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { EmptyContentPlaceholder } from "@/components/Community/EmptyContentPlaceholder";
import { BookText } from "lucide-react";

export default function EbooksPage() {
	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader
				breadcrumbs={[
					{ label: "Início", href: "/community" },
					{ label: "eBooks" },
				]}
			/>
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-black leading-none tracking-tight md:text-2xl text-primary">eBooks</h1>
				<p className="text-sm text-muted-foreground">Materiais de leitura exclusivos para aprofundar seu conhecimento.</p>
			</div>
			<EmptyContentPlaceholder
				icon={BookText}
				title="Nada por aqui por enquanto :("
				description="Em breve teremos eBooks disponíveis."
			/>
		</div>
	);
}
