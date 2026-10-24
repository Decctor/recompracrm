import { HELP_ARTICLES, getHelpArticle } from "@/app/_content/help-articles";
import { ConnectorMark } from "@/components/Brand/ConnectorMark";
import { CopyableCode } from "@/components/Help/CopyableCode";
import { AlertCircle, ArrowLeft, Check, Clock3, ExternalLink, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

const MCP_URL = "https://www.recompracrm.com.br/api/mcp";

export function generateStaticParams() {
	return HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const article = getHelpArticle((await params).slug);
	if (!article) return {};
	const url = `https://www.recompracrm.com.br/help/${article.slug}`;
	return {
		title: article.title,
		description: article.description,
		alternates: { canonical: url },
		openGraph: { title: article.title, description: article.description, url, type: "article", modifiedTime: article.updatedAt },
		twitter: { card: "summary", title: article.title, description: article.description },
	};
}

export default async function HelpArticlePage({ params }: Props) {
	const article = getHelpArticle((await params).slug);
	if (!article) notFound();

	const url = `https://www.recompracrm.com.br/help/${article.slug}`;
	const howToJsonLd = {
		"@context": "https://schema.org",
		"@type": "HowTo",
		name: article.title,
		description: article.description,
		totalTime: "PT2M",
		step: article.steps.map((step) => ({
			"@type": "HowToStep",
			position: step.number,
			name: step.title,
			text: step.description,
			image: `https://www.recompracrm.com.br${step.image.src}`,
			url: `${url}#passo-${step.number}`,
		})),
	};
	const faqJsonLd = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: article.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
	};

	return (
		<main className="pt-24 pb-24">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

			<section className="border-b border-slate-100 bg-[radial-gradient(circle_at_75%_0%,rgba(217,119,87,0.13),transparent_40%)] px-6 py-14 sm:py-18">
				<div className="mx-auto max-w-4xl">
					<Link href="/help" className="inline-flex items-center gap-2 text-sm font-bold text-[#24549C] transition hover:text-[#1a3d7a]">
						<ArrowLeft className="size-4" /> Central de Ajuda
					</Link>
					<div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
						<div className="flex size-18 shrink-0 items-center justify-center rounded-[1.4rem] bg-[#D97757]/10">
							<ConnectorMark connectorCode={article.connectorCode} className="size-10" />
						</div>
						<div>
							<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#D97757]">{article.categoryLabel}</p>
							<h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-0.025em] text-slate-950 sm:text-5xl">{article.title}</h1>
							<p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{article.description}</p>
							<div className="mt-6 flex flex-wrap gap-3 text-xs font-bold text-slate-500">
								<span className="rounded-full bg-white px-3 py-2 ring-1 ring-slate-200">{article.stepCount} passos</span>
								<span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-slate-200">
									<Clock3 className="size-3.5" /> {article.readingTime}
								</span>
								<span className="rounded-full bg-white px-3 py-2 ring-1 ring-slate-200">
									Atualizado em {new Date(`${article.updatedAt}T12:00:00`).toLocaleDateString("pt-BR")}
								</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			<div className="mx-auto max-w-4xl px-6 pt-12">
				<section className="grid gap-6 rounded-[1.6rem] bg-slate-950 p-6 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:p-8">
					<div>
						<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#FFB900]">Antes de começar</p>
						<h2 className="mt-2 text-xl font-extrabold">Tenha estes acessos em mãos</h2>
						<ul className="mt-5 grid gap-2.5 text-sm text-slate-300">
							{article.requirements.map((requirement) => (
								<li key={requirement} className="flex items-center gap-2">
									<Check className="size-4 text-[#FFB900]" /> {requirement}
								</li>
							))}
						</ul>
					</div>
					<CopyableCode label="Endereço MCP" value={MCP_URL} />
				</section>

				<div className="mt-16 space-y-20">
					{article.steps.map((step) => (
						<section key={step.number} id={`passo-${step.number}`} className="scroll-mt-28">
							<div className="grid gap-5 sm:grid-cols-[3.25rem_1fr]">
								<div className="flex size-13 items-center justify-center rounded-2xl bg-[#24549C] text-lg font-extrabold text-white shadow-[0_10px_25px_-14px_rgba(36,84,156,0.8)]">
									{step.number}
								</div>
								<div>
									<h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{step.title}</h2>
									<p className="mt-3 max-w-3xl leading-relaxed text-slate-600">{step.description}</p>
									{step.note ? (
										<p className="mt-4 flex max-w-2xl items-start gap-2 rounded-xl bg-[#FFB900]/14 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-800">
											<AlertCircle className="mt-0.5 size-4 shrink-0 text-[#9a691e]" /> {step.note}
										</p>
									) : null}
								</div>
							</div>

							<a
								href={step.image.src}
								target="_blank"
								rel="noreferrer"
								className="group relative mt-7 block overflow-hidden rounded-[1.5rem] border border-slate-200 bg-[#eef2f7] p-3 shadow-[0_20px_60px_-38px_rgba(36,84,156,0.6)] sm:p-5"
							>
								<Image
									src={step.image.src}
									alt={step.image.alt}
									width={step.image.width}
									height={step.image.height}
									className="mx-auto max-h-[46rem] w-auto max-w-full rounded-xl object-contain"
									sizes="(max-width: 768px) 100vw, 850px"
								/>
								<span className="absolute right-6 bottom-6 flex items-center gap-1.5 rounded-full bg-slate-950/88 px-3 py-2 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
									<ExternalLink className="size-3.5" /> Ampliar
								</span>
							</a>
						</section>
					))}
				</div>

				<section className="mt-20 overflow-hidden rounded-[1.8rem] bg-[#1a3d7a] px-6 py-10 text-white sm:px-10">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-[#FFB900] text-[#1a3d7a]">
						<ShieldCheck className="size-6" />
					</div>
					<h2 className="mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">Seu Claude já pode trabalhar com o CRM</h2>
					<p className="mt-3 max-w-2xl leading-relaxed text-blue-100">
						Abra uma nova conversa e experimente uma pergunta. O Claude pedirá aprovação sempre que uma ação puder alterar sua operação.
					</p>
					<div className="mt-7 grid gap-3">
						{[
							"Quais foram os resultados comerciais deste mês?",
							"Quais clientes estão há mais tempo sem comprar?",
							"Quais produtos tiveram melhor desempenho no período?",
						].map((prompt) => (
							<div key={prompt} className="rounded-xl bg-white/9 px-4 py-3 text-sm font-semibold ring-1 ring-white/10">
								“{prompt}”
							</div>
						))}
					</div>
				</section>

				<section className="mt-20">
					<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#24549C]">Solução de problemas</p>
					<h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Dúvidas frequentes</h2>
					<div className="mt-7 divide-y divide-slate-200 border-y border-slate-200">
						{article.faqs.map((faq) => (
							<details key={faq.question} className="group py-5">
								<summary className="cursor-pointer list-none pr-8 font-bold text-slate-900 marker:hidden">{faq.question}</summary>
								<p className="mt-3 max-w-3xl leading-relaxed text-slate-600">{faq.answer}</p>
							</details>
						))}
					</div>
				</section>
			</div>
		</main>
	);
}
