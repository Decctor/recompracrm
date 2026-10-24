import { formatInline } from "@/components/Content/article-text";
import { Check } from "lucide-react";

// Corpo dos blocos da página de funcionalidade, na mesma marcação do blog (**negrito**, [link](url),
// parágrafos por \n\n, listas por •). As listas daqui são as do design: fio entre os itens e check
// azul, em vez do ponto do artigo. Tamanho, cor e entrelinha vêm do contêiner.
export function FeatureRichText({ body }: { body: string }) {
	return (
		<>
			{body.split("\n\n").map((block, i) => {
				const lines = block.split("\n");
				if (lines.every((line) => line.trim().startsWith("•"))) {
					return (
						<ul key={i} className="m-0 flex list-none flex-col border-t border-[#e3e8ea] p-0">
							{lines.map((line, j) => (
								<li key={j} className="flex gap-3 border-b border-[#e3e8ea] py-3">
									<Check className="mt-1 size-4 flex-none text-[#24549c]" aria-hidden />
									<span>{formatInline(line.replace(/^\s*•\s*/, ""))}</span>
								</li>
							))}
						</ul>
					);
				}
				return (
					<p key={i} className="m-0 text-pretty">
						{formatInline(block)}
					</p>
				);
			})}
		</>
	);
}
