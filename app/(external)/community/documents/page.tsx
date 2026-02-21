"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { EmptyContentPlaceholder } from "@/components/Community/EmptyContentPlaceholder";
import { FileText } from "lucide-react";

export default function DocumentsPage() {
	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader
				breadcrumbs={[
					{ label: "Início", href: "/community" },
					{ label: "Documentos" },
				]}
			/>
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-black leading-none tracking-tight md:text-2xl text-primary">Documentos</h1>
				<p className="text-sm text-muted-foreground">Documentação técnica e guias de referência.</p>
			</div>
			<EmptyContentPlaceholder
				icon={FileText}
				title="Nada por aqui por enquanto :("
				description="Em breve teremos documentos disponíveis."
			/>
		</div>
	);
}
