"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { EmptyContentPlaceholder } from "@/components/Community/EmptyContentPlaceholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateAsLocale } from "@/lib/formatting";
import { usePublicCommunityMaterials } from "@/lib/queries/community";
import { Calendar, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function DocumentsPage() {
	const [search, setSearch] = useState("");
	const { data: allMaterials = [], isLoading } = usePublicCommunityMaterials({ search });
	const materials = useMemo(() => allMaterials.filter((material) => material.tipo !== "EBOOK"), [allMaterials]);

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

			<div className="w-full max-w-md relative">
				<div className="flex items-center bg-background rounded-xl border border-primary/20 shadow-2xs">
					<Search className="ml-3 h-4 w-4 min-w-4 min-h-4 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Buscar documentos..."
						className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			</div>

			{isLoading ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={`document-skeleton-${i.toString()}`} className="space-y-3">
							<div className="aspect-4/3 w-full rounded-xl bg-muted animate-pulse" />
							<div className="space-y-2">
								<div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
								<div className="h-4 w-full bg-muted rounded animate-pulse" />
							</div>
						</div>
					))}
				</div>
			) : null}

			{!isLoading && materials.length === 0 ? (
				<EmptyContentPlaceholder
					icon={FileText}
					title={search ? "Nenhum documento encontrado" : "Nada por aqui por enquanto :("}
					description={search ? "Tente buscar por outros termos." : "Em breve teremos documentos disponíveis."}
				/>
			) : null}

			{!isLoading && materials.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{materials.map((material) => (
						<div
							key={material.id}
							className="group rounded-xl border border-primary/15 bg-card p-4 shadow-2xs hover:border-primary/40 hover:shadow-md transition-all"
						>
							<div className="flex items-center justify-between gap-2 mb-2">
								<Badge variant="secondary" className="text-[10px]">
									{material.tipo}
								</Badge>
								<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
									<Calendar className="w-3 h-3 min-w-3 min-h-3" />
									{formatDateAsLocale(material.dataInsercao)}
								</span>
							</div>
							<h3 className="text-sm font-bold tracking-tight line-clamp-2">{material.titulo}</h3>
							<p className="mt-1 text-xs text-muted-foreground line-clamp-3">{material.descricao}</p>
							<div className="mt-4 flex items-center justify-end">
								<Button asChild size="sm" className="rounded-full px-4">
									<Link href={`/community/documents/${material.id}`}>Ver detalhes</Link>
								</Button>
							</div>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
