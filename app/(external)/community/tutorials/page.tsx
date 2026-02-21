"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { EmptyContentPlaceholder } from "@/components/Community/EmptyContentPlaceholder";
import { GraduationCap } from "lucide-react";

export default function TutorialsPage() {
	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader
				breadcrumbs={[
					{ label: "Início", href: "/community" },
					{ label: "Tutoriais" },
				]}
			/>
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-black leading-none tracking-tight md:text-2xl text-primary">Tutoriais</h1>
				<p className="text-sm text-muted-foreground">Tutoriais passo a passo para aprender na prática.</p>
			</div>
			<EmptyContentPlaceholder
				icon={GraduationCap}
				title="Nada por aqui por enquanto :("
				description="Em breve teremos tutoriais disponíveis."
			/>
		</div>
	);
}
