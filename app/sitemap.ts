import { db } from "@/services/drizzle";
import type { MetadataRoute } from "next";

const BASE_URL = "https://recompracrm.com.br";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const [courses, materials] = await Promise.all([
		db.query.communityCourses.findMany({
			where: (fields, { eq }) => eq(fields.status, "PUBLICADO"),
			columns: { id: true, dataInsercao: true },
		}),
		db.query.communityMaterials.findMany({
			where: (fields, { eq }) => eq(fields.status, "PUBLICADO"),
			columns: { id: true, tipo: true, dataInsercao: true },
		}),
	]);

	const ebooks = materials.filter((m) => m.tipo === "EBOOK");
	const documents = materials.filter((m) => m.tipo !== "EBOOK");

	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/presentation`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
		{ url: `${BASE_URL}/community`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
		{ url: `${BASE_URL}/community/courses`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
		{ url: `${BASE_URL}/community/ebooks`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
		{ url: `${BASE_URL}/community/documents`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
		{ url: `${BASE_URL}/community/tutorials`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
	];

	const courseRoutes: MetadataRoute.Sitemap = courses.map((c) => ({
		url: `${BASE_URL}/community/courses/${c.id}`,
		lastModified: c.dataInsercao,
		changeFrequency: "monthly",
		priority: 0.7,
	}));

	const ebookRoutes: MetadataRoute.Sitemap = ebooks.map((m) => ({
		url: `${BASE_URL}/community/ebooks/${m.id}`,
		lastModified: m.dataInsercao,
		changeFrequency: "monthly",
		priority: 0.6,
	}));

	const documentRoutes: MetadataRoute.Sitemap = documents.map((m) => ({
		url: `${BASE_URL}/community/documents/${m.id}`,
		lastModified: m.dataInsercao,
		changeFrequency: "monthly",
		priority: 0.6,
	}));

	return [...staticRoutes, ...courseRoutes, ...ebookRoutes, ...documentRoutes];
}
