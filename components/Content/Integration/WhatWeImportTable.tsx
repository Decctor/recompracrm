import type { IntegrationImportGroup } from "@/app/_content/integration-pages";
import { Check } from "lucide-react";
import { getEntityIcon } from "./integration-icons";

type WhatWeImportTableProps = {
	name: string;
	groups: IntegrationImportGroup[];
};

// "O que o RecompraCRM importa": um cartão por grupo de dados, em linguagem de negócio — de
// propósito não é um mapeamento técnico de campos. `id="importa"` é o destino do botão do topo.
export function WhatWeImportTable({ name, groups }: WhatWeImportTableProps) {
	return (
		<section id="importa" className="scroll-mt-[110px]">
			<h2 className="m-0 max-w-[640px] text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[44px]">
				O que o RecompraCRM importa do {name}
			</h2>
			<div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 rounded-[28px] bg-[#eef2f6] p-3">
				{groups.map((group) => {
					const Icon = getEntityIcon(group.entity);
					return (
						<div key={group.entity} className="flex flex-col gap-4 rounded-[20px] bg-white p-6 sm:p-7">
							<span className="flex size-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
								<Icon className="size-5" aria-hidden />
							</span>
							<h3 className="m-0 text-[22px] font-semibold leading-[normal] tracking-[-0.02em]">{group.entity}</h3>
							<p className="m-0 text-[15px] leading-[1.6] text-[#5b6a70]">{group.summary}</p>
							<ul className="m-0 mt-auto flex list-none flex-col gap-2 border-t border-[#eef1f2] p-0 pt-4">
								{group.items.map((item) => (
									<li key={item} className="flex items-center gap-2.5 text-sm leading-[normal] text-[#2b3538]">
										<Check className="size-3.5 flex-none text-[#24549c]" aria-hidden />
										{item}
									</li>
								))}
							</ul>
						</div>
					);
				})}
			</div>
		</section>
	);
}
