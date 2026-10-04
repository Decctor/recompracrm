type ArticleSourcesProps = {
	sources: { label: string; url: string }[];
};

// Fontes de todo número citado no artigo. Ficam no fim, numeradas, com o domínio à vista para o
// leitor saber de onde vem cada dado antes de clicar.
export function ArticleSources({ sources }: ArticleSourcesProps) {
	if (sources.length === 0) return null;
	return (
		<section className="mt-14 border-t border-slate-200 pt-10">
			<h2 className="mb-5 text-label text-slate-500">Fontes</h2>
			<ol className="text-numeric space-y-3">
				{sources.map((source, i) => (
					<li key={source.url} className="flex gap-3 text-sm leading-relaxed">
						<span className="w-5 shrink-0 font-bold text-slate-400">{i + 1}.</span>
						<span className="min-w-0">
							<a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 hover:text-[#24549C] hover:underline">
								{source.label}
							</a>
							<span className="ml-2 break-all text-slate-400">{new URL(source.url).hostname.replace(/^www\./, "")}</span>
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}
