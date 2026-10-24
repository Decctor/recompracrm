import { BLOG_POSTS } from "@/app/_content/blog-posts";
import { FEATURE_PAGES } from "@/app/_content/feature-pages";
import { INTEGRATION_PAGES } from "@/app/_content/integration-pages";
import { SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { HELP_ARTICLES } from "@/app/_content/help-articles";
import { LANDING_CASES } from "@/app/_content/cases";
import { db } from "@/services/drizzle";
import type { MetadataRoute } from "next";

const BASE_URL = "https://www.recompracrm.com.br";

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

	const blogRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
		...BLOG_POSTS.map((post) => ({
			url: `${BASE_URL}/blog/${post.slug}`,
			lastModified: new Date(post.publishedAt),
			changeFrequency: "monthly" as const,
			priority: 0.8,
		})),
	];

	const segmentRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/segments`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
		...SEGMENT_PAGES.map((page) => ({
			url: `${BASE_URL}/segments/${page.slug}`,
			lastModified: new Date(page.updatedAt),
			changeFrequency: "monthly" as const,
			priority: 0.85,
		})),
	];

	const featureRoutes: MetadataRoute.Sitemap = FEATURE_PAGES.map((page) => ({
		url: `${BASE_URL}/features/${page.slug}`,
		lastModified: new Date(),
		changeFrequency: "monthly" as const,
		priority: 0.85,
	}));

	const integrationRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/integrations`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.85 },
		...INTEGRATION_PAGES.map((page) => ({
			url: `${BASE_URL}/integrations/${page.slug}`,
			lastModified: new Date(page.updatedAt),
			changeFrequency: "monthly" as const,
			priority: 0.8,
		})),
	];

	const helpRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/help`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
		...HELP_ARTICLES.map((article) => ({
			url: `${BASE_URL}/help/${article.slug}`,
			lastModified: new Date(article.updatedAt),
			changeFrequency: "monthly" as const,
			priority: 0.75,
		})),
	];

	const caseRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/cases`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.85 },
		...LANDING_CASES.map((item) => ({
			url: `${BASE_URL}/cases/${item.id}`,
			lastModified: new Date(),
			changeFrequency: "monthly" as const,
			priority: 0.8,
		})),
	];

	const toolRoutes: MetadataRoute.Sitemap = [
		{ url: `${BASE_URL}/tools/cashback-calculator`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.85 },
		{ url: `${BASE_URL}/tools/whatsapp-cost`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.85 },
	];

	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
		{ url: `${BASE_URL}/erp`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.95 },
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

	return [
		...segmentRoutes,
		...blogRoutes,
		...featureRoutes,
		...integrationRoutes,
		...helpRoutes,
		...caseRoutes,
		...toolRoutes,
		...staticRoutes,
		...courseRoutes,
		...ebookRoutes,
		...documentRoutes,
	];
}
