type ArticleOutlineProps = {
	items: { id: string; label: string }[];
};

// Sumário lateral (≥ lg). Links de âncora simples: funciona sem JavaScript e é lido por buscadores.
export function ArticleOutline({ items }: ArticleOutlineProps) {
	if (items.length < 3) return null;
	return (
		<nav aria-label="Neste artigo" className="sticky top-28">
			<p className="mb-4 text-label text-slate-400">Neste artigo</p>
			<ol className="space-y-1 border-l border-slate-200">
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm leading-snug text-slate-500 transition-colors hover:border-[#24549C] hover:text-slate-900"
						>
							{item.label}
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}
