type ArticleSourcesProps = {
	sources: { label: string; url: string }[];
};

// Fontes de todo número citado no artigo. Ficam no fim, numeradas, com o domínio à vista para o
// leitor saber de onde vem cada dado antes de clicar.
export function ArticleSources({ sources }: ArticleSourcesProps) {
	if (sources.length === 0) return null;
	return (
		<section className="mt-14 border-t border-[#0e1214] pt-8">
			<h2 className="m-0 mb-4 text-[13px] font-semibold text-[#687a80]">Fontes</h2>
			<ol className="m-0 flex list-none flex-col gap-3 p-0 text-numeric">
				{sources.map((source, i) => (
					<li key={source.url} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-sm leading-[1.55]">
						<span className="font-semibold text-[#8a979c]">{i + 1}.</span>
						<span className="min-w-0">
							<a
								href={source.url}
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-[#2b3538] transition-colors hover:text-[#24549c] hover:underline"
							>
								{source.label}
							</a>
							<span className="ml-2 break-all text-[#8a979c]">{new URL(source.url).hostname.replace(/^www\./, "")}</span>
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}
