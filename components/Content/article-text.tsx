import { Fragment, type ReactNode } from "react";

// Marcação mínima dos textos do blog: **negrito**, [link](url), parágrafos (\n\n) e listas
// (todas as linhas do parágrafo começando com •). Gera elementos React, não HTML em string:
// o conteúdo é nosso, mas um <a> montado à mão não ganharia rel nem estilo consistentes.
const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function formatInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let last = 0;
	for (const match of text.matchAll(INLINE)) {
		const index = match.index ?? 0;
		if (index > last) nodes.push(text.slice(last, index));
		if (match[1]) {
			nodes.push(
				<strong key={index} className="font-bold text-slate-900">
					{match[1]}
				</strong>,
			);
		} else {
			nodes.push(
				<a
					key={index}
					href={match[3]}
					target="_blank"
					rel="noopener noreferrer"
					className="font-semibold text-[#24549C] underline decoration-[#24549C]/30 underline-offset-[3px] transition-colors hover:decoration-[#24549C]"
				>
					{match[2]}
				</a>,
			);
		}
		last = index + match[0].length;
	}
	if (last < text.length) nodes.push(text.slice(last));
	return nodes;
}

export function ArticleRichText({ body, className = "text-slate-700" }: { body: string; className?: string }) {
	return (
		<>
			{body.split("\n\n").map((para, i) => {
				const lines = para.split("\n");
				if (lines.every((l) => l.trim().startsWith("•"))) {
					return (
						<ul key={i} className="space-y-2.5">
							{lines.map((line, j) => (
								<li key={j} className={`flex gap-3 leading-relaxed ${className}`}>
									<span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-[#FFB900]" />
									<span>{formatInline(line.replace(/^\s*•\s*/, ""))}</span>
								</li>
							))}
						</ul>
					);
				}
				return (
					<p key={i} className={`leading-[1.75] ${className}`}>
						{lines.map((line, j) => (
							<Fragment key={j}>
								{j > 0 && <br />}
								{formatInline(line)}
							</Fragment>
						))}
					</p>
				);
			})}
		</>
	);
}

// Âncora estável a partir do título da seção — usada pelo sumário e por links diretos.
export function headingAnchor(heading: string) {
	return heading
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 64);
}
