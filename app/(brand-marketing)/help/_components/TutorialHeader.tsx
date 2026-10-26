import type { THelpArticle } from "@/app/_content/help-articles";
import { ConnectorMark } from "@/components/Brand/ConnectorMark";
import { CopyableCode } from "@/components/Help/CopyableCode";
import { ArrowLeft, Check, Clock3 } from "lucide-react";
import Link from "next/link";

const CHIP =
	"inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e3e8ea] px-3.5 text-[13px] font-medium leading-[normal] text-[#4b585d]";

// Cabeçalho do tutorial: volta para a central, marca e categoria, título, metadados e o painel
// escuro "Antes de começar" com os pré-requisitos e o valor para copiar.
export function TutorialHeader({ article }: { article: THelpArticle }) {
	const updatedAt = new Date(`${article.updatedAt}T12:00:00`).toLocaleDateString("pt-BR");

	return (
		<header id="top" className="pt-[120px] sm:pt-[152px]">
			<div className="mx-auto max-w-[960px] px-6">
				<Link href="/help" className="inline-flex items-center gap-2 text-sm font-medium leading-[normal] text-[#0e1214] hover:text-[#24549c]">
					<ArrowLeft className="size-4" aria-hidden />
					Central de Ajuda
				</Link>

				<div className="mt-10 flex items-center gap-3.5 sm:mt-12">
					<span className="flex size-14 flex-none items-center justify-center rounded-[18px] bg-[rgba(217,119,87,0.12)]">
						<ConnectorMark connectorCode={article.connectorCode} className="size-[26px]" />
					</span>
					<span className="text-sm font-semibold leading-[normal] text-[#c2603f]">{article.categoryLabel}</span>
				</div>

				<h1 className="m-0 mt-6 text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-balance sm:text-[48px] lg:text-[58px] lg:leading-[1.03]">
					{article.title}
				</h1>
				<p className="m-0 mt-5 max-w-[680px] text-lg leading-[1.55] text-[#5b6a70] text-pretty sm:text-xl">{article.description}</p>

				<div className="mt-7 flex flex-wrap gap-2">
					<span className={CHIP}>{article.stepCount} passos</span>
					<span className={CHIP}>
						<Clock3 className="size-3.5" aria-hidden />
						{article.readingTime}
					</span>
					<span className={CHIP}>
						Atualizado em&nbsp;<time dateTime={article.updatedAt}>{updatedAt}</time>
					</span>
				</div>

				<section
					data-dock="dark"
					aria-labelledby="antes-de-comecar"
					className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-end gap-x-12 gap-y-7 rounded-[28px] bg-[#0b1628] p-6 text-white sm:p-9"
				>
					<div>
						<p className="m-0 text-[13px] font-semibold leading-[normal] text-[#ffb900]">Antes de começar</p>
						<h2 id="antes-de-comecar" className="m-0 mt-2 text-2xl font-semibold leading-[normal] tracking-[-0.02em]">
							Tenha estes acessos em mãos
						</h2>
						<ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0">
							{article.requirements.map((requirement) => (
								<li key={requirement} className="flex items-center gap-2.5 text-[15px] leading-[1.4] text-white/80">
									<Check className="size-4 flex-none text-[#ffb900]" aria-hidden />
									{requirement}
								</li>
							))}
						</ul>
					</div>
					{article.connection ? <CopyableCode label={article.connection.label} value={article.connection.value} /> : null}
				</section>
			</div>
		</header>
	);
}
