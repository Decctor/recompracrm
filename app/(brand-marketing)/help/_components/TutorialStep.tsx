import type { THelpArticleStep } from "@/app/_content/help-articles";
import { CircleAlert, ExternalLink } from "lucide-react";
import Image from "next/image";

// Um passo do tutorial: número, título, texto, observação opcional e a captura de tela, que abre
// em tamanho real numa nova aba. `id="passo-N"` é a âncora usada no JSON-LD HowTo.
export function TutorialStep({ step, priority = false }: { step: THelpArticleStep; priority?: boolean }) {
	return (
		<section id={`passo-${step.number}`} aria-labelledby={`passo-${step.number}-titulo`} className="scroll-mt-[110px]">
			<div className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-6">
				<span className="flex size-11 items-center justify-center rounded-[14px] bg-[#24549c] text-lg font-semibold leading-[normal] text-white shadow-[0_12px_28px_-16px_rgba(36,84,156,0.9)] sm:size-14 sm:rounded-[18px] sm:text-xl">
					{step.number}
				</span>
				<div className="min-w-0">
					<h2 id={`passo-${step.number}-titulo`} className="m-0 text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-balance sm:text-[32px]">
						{step.title}
					</h2>
					<p className="m-0 mt-3 max-w-[680px] text-base leading-[1.65] text-[#5b6a70] sm:text-[17px]">{step.description}</p>
					{step.note ? (
						<p className="m-0 mt-4 flex max-w-[620px] items-start gap-2.5 rounded-[14px] bg-[#fff7e5] px-4 py-3.5 text-[15px] font-medium leading-[1.55] text-[#4a3412]">
							<CircleAlert className="mt-[3px] size-4 flex-none text-[#9a691e]" aria-hidden />
							{step.note}
						</p>
					) : null}
				</div>
			</div>

			<a
				href={step.image.src}
				target="_blank"
				rel="noreferrer"
				className="group relative mt-6 block rounded-[20px] bg-[#eef2f6] p-2.5 transition-colors hover:bg-[#e6ebf1] sm:mt-8 sm:rounded-[28px] sm:p-5"
			>
				<Image
					src={step.image.src}
					alt={step.image.alt}
					width={step.image.width}
					height={step.image.height}
					priority={priority}
					sizes="(max-width: 960px) 100vw, 912px"
					className="mx-auto block h-auto max-h-[720px] w-auto max-w-full rounded-[10px] object-contain shadow-[0_30px_70px_-40px_rgba(16,24,40,0.45)] sm:rounded-[14px]"
				/>
				<span className="absolute right-5 bottom-5 inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgba(11,22,40,0.88)] px-3 text-xs font-semibold leading-[normal] text-white sm:right-8 sm:bottom-8">
					<ExternalLink className="size-[13px]" aria-hidden />
					Ampliar
				</span>
			</a>
		</section>
	);
}
