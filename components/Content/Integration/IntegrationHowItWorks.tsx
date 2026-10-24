import type { IntegrationStep } from "@/app/_content/integration-pages";

type IntegrationHowItWorksProps = {
	steps: IntegrationStep[];
};

// "Como funciona a conexão": faixa escura com os passos numerados lado a lado. `data-dock="dark"`
// escurece o Dock enquanto ele passa por cima.
export function IntegrationHowItWorks({ steps }: IntegrationHowItWorksProps) {
	return (
		<section
			id="como-conecta"
			data-dock="dark"
			className="scroll-mt-[110px] rounded-[28px] bg-[#0b1628] px-6 py-14 text-white sm:-mx-6 sm:px-12 sm:py-24"
		>
			<h2 className="m-0 max-w-[640px] text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[44px]">
				Como funciona a conexão
			</h2>
			<ol className="m-0 mt-10 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-px overflow-hidden rounded-[20px] border border-white/8 bg-white/8 p-0 sm:mt-14">
				{steps.map((step, i) => (
					<li key={step.title} className="flex flex-col gap-3 bg-[#0b1628] p-6 sm:min-h-[260px] sm:p-7">
						<span className="text-[13px] font-semibold leading-[normal] text-[#ffb900]">{String(i + 1).padStart(2, "0")}</span>
						<h3 className="m-0 mt-3 text-[19px] font-semibold leading-[normal] tracking-[-0.015em] sm:mt-6">{step.title}</h3>
						<p className="m-0 text-sm leading-[1.6] text-white/65">{step.body}</p>
					</li>
				))}
			</ol>
		</section>
	);
}
