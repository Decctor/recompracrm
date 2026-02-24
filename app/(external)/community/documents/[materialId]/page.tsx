"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { Button } from "@/components/ui/button";
import { formatDateAsLocale } from "@/lib/formatting";
import { usePublicCommunityMaterialById } from "@/lib/queries/community";
import { handleDownload } from "@/lib/files-storage";
import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

export default function DocumentDetailPage({ params }: { params: Promise<{ materialId: string }> }) {
	const { materialId } = use(params);
	const { data: material, isLoading, error } = usePublicCommunityMaterialById(materialId);
	const [isDownloading, setIsDownloading] = useState(false);

	async function handleDownloadMaterial() {
		if (!material?.asset?.storageUrl) {
			toast.error("Arquivo indisponível para download.");
			return;
		}

		try {
			setIsDownloading(true);
			await handleDownload({
				fileName: material.titulo,
				fileUrl: material.asset.storageUrl,
			});
		} catch {
			toast.error("Não foi possível baixar o material.");
		} finally {
			setIsDownloading(false);
		}
	}

	if (isLoading) {
		return (
			<div className="w-full h-full flex flex-col gap-6 p-6">
				<div className="animate-pulse space-y-4">
					<div className="h-4 w-48 bg-muted rounded" />
					<div className="h-8 w-1/2 bg-muted rounded" />
					<div className="h-4 w-full bg-muted rounded" />
					<div className="h-4 w-3/4 bg-muted rounded" />
					<div className="h-10 w-40 bg-muted rounded-full" />
				</div>
			</div>
		);
	}

	if (error || !material || material.tipo === "EBOOK") {
		return (
			<div className="w-full h-full flex items-center justify-center p-6">
				<div className="text-center">
					<div className="rounded-full bg-primary/10 p-5 w-fit mx-auto mb-4">
						<FileText className="w-10 h-10 text-primary/50" />
					</div>
					<h2 className="text-lg font-semibold mb-2">Documento não encontrado</h2>
					<p className="text-sm text-muted-foreground mb-4">Este conteúdo não está disponível ou não existe.</p>
					<Button variant="outline" asChild size="sm">
						<Link href="/community/documents">Voltar para documentos</Link>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader
				breadcrumbs={[
					{ label: "Início", href: "/community" },
					{ label: "Documentos", href: "/community/documents" },
					{ label: material.titulo },
				]}
			/>

			<div className="w-full flex flex-col lg:flex-row gap-6">
				<div className="w-full lg:w-[360px] rounded-xl border border-primary/10 bg-primary/5 p-6 flex items-center justify-center">
					<FileText className="w-20 h-20 text-primary/30" />
				</div>
				<div className="flex-1 flex flex-col gap-3">
					<h1 className="text-xl md:text-2xl font-black tracking-tight">{material.titulo}</h1>
					<p className="text-sm text-muted-foreground">{material.descricao}</p>
					<div className="text-xs text-muted-foreground">Publicado em {formatDateAsLocale(material.dataInsercao)}</div>
					<div className="text-xs text-muted-foreground">Tipo: {material.tipo}</div>
					<div className="flex items-center gap-2 mt-2">
						<Button className="rounded-full px-6" onClick={handleDownloadMaterial} disabled={isDownloading || !material.asset?.storageUrl}>
							<Download className="mr-2 w-4 h-4 min-w-4 min-h-4" />
							{isDownloading ? "Baixando..." : "Baixar documento"}
						</Button>
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-primary/10 bg-card p-4">
				<h2 className="text-sm font-bold mb-2">Resumo</h2>
				<p className="text-sm text-muted-foreground whitespace-pre-line">{material.resumo || "Sem resumo disponível."}</p>
				{material.asset?.storageUrl ? (
					<p className="mt-3 text-xs text-muted-foreground">Arquivo disponível para download.</p>
				) : (
					<p className="mt-3 text-xs text-destructive">Este material ainda não possui arquivo para download.</p>
				)}
			</div>
		</div>
	);
}
