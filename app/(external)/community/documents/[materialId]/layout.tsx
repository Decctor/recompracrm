import { db } from "@/services/drizzle";
import type { Metadata } from "next";

type Props = { params: Promise<{ materialId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { materialId } = await params;

	const material = await db.query.communityMaterials.findFirst({
		where: (fields, { and, eq, ne }) => and(eq(fields.id, materialId), ne(fields.tipo, "EBOOK")),
		columns: { titulo: true, descricao: true, capaUrl: true },
	});

	if (!material) {
		return { title: "Documento não encontrado" };
	}

	const images = material.capaUrl ? [{ url: material.capaUrl, alt: material.titulo }] : [];

	return {
		title: material.titulo,
		description: material.descricao ?? undefined,
		openGraph: {
			title: `${material.titulo} | RecompraCRM`,
			description: material.descricao ?? undefined,
			url: `https://recompracrm.com.br/community/documents/${materialId}`,
			images,
		},
		twitter: {
			card: "summary_large_image",
			title: `${material.titulo} | RecompraCRM`,
			description: material.descricao ?? undefined,
			images: material.capaUrl ? [material.capaUrl] : undefined,
		},
	};
}

export default function DocumentDetailLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
