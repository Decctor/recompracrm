"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type CommunityHeroProps = {
	searchQuery: string;
	onSearchChange: (query: string) => void;
};

export function CommunityHero({ searchQuery, onSearchChange }: CommunityHeroProps) {
	return (
		<div className="relative overflow-hidden rounded-2xl bg-brand px-6 py-10 sm:px-10 sm:py-14">
			<div className="absolute inset-0 bg-gradient-to-br from-brand/90 to-brand" />
			<div className="relative flex flex-col gap-4">
				<h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-brand-foreground">Explore a comunidade do RecompraFLIX</h1>
				<p className="text-sm sm:text-base text-brand-foreground/80 max-w-lg">
					Acesse cursos, documentos e materiais exclusivos para impulsionar seu conhecimento.
				</p>
				<div className="mt-2 w-full max-w-md relative group">
					<div className="absolute -inset-0.5 bg-white/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-200" />
					<div className="relative flex items-center bg-background rounded-lg border border-transparent shadow-sm">
						<Search className="ml-3 h-4 w-4 min-w-4 min-h-4 text-muted-foreground" />
						<Input
							type="text"
							placeholder="Buscar recursos, documentos..."
							className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent py-5"
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
