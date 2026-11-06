import { GLOSSARY_CATEGORY_LABELS, GLOSSARY_TERMS, getGlossaryTerm } from "@/app/_content/glossary";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Glossário de varejo — RecompraCRM";

export function generateStaticParams() {
	return GLOSSARY_TERMS.map((term) => ({ slug: term.slug }));
}

// O painel mostra o termo (ou a sigla) e, embaixo, o nome por extenso ou a categoria.
export default async function GlossaryTermOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const term = getGlossaryTerm((await params).slug);
	return renderStatOgImage({
		eyebrow: "Glossário de varejo",
		title: term?.question ?? "Glossário de varejo",
		stat: term?.term ?? "Glossário",
		statLabel: term ? (term.fullName ?? GLOSSARY_CATEGORY_LABELS[term.category]) : "Os termos do varejo, explicados",
		statSource: term?.formula ? "Com fórmula e exemplo de cálculo" : null,
		footer: "recompracrm.com.br/glossary",
	});
}
