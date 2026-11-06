import { GLOSSARY_TERMS } from "@/app/_content/glossary";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Glossário de varejo — RecompraCRM";

export default async function GlossaryOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "Glossário de varejo",
		title: "Os termos do varejo, explicados com a conta da loja.",
		stat: String(GLOSSARY_TERMS.length),
		statLabel: "termos de varejo, explicados em poucas linhas",
		footer: "recompracrm.com.br/glossary",
	});
}
