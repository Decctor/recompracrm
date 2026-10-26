import { Briefcase, Calculator, Megaphone, Users } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const PROFILES = [
	{
		icon: Briefcase,
		title: "Consultores de varejo",
		text: "Você já entra nas lojas pra melhorar resultado. Indique a ferramenta que sustenta o que você recomenda.",
	},
	{
		icon: Megaphone,
		title: "Agências e gestores de tráfego",
		text: "Some uma receita recorrente à sua carteira sem precisar entregar mais um serviço operacional.",
	},
	{
		icon: Users,
		title: "Especialistas e criadores",
		text: "Tem audiência de lojistas? Transforme a sua recomendação de confiança em comissão recorrente.",
	},
	{
		icon: Calculator,
		title: "Contadores e parceiros de ERP",
		text: "Você fala com dezenas de comércios todo mês. Indique e acompanhe cada cliente pelo painel.",
	},
];

export function PartnersForWho() {
	return (
		<section id="para-quem" className="scroll-mt-[60px] py-36 max-md:py-24">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-x-20 gap-y-12 px-6 max-md:gap-y-10 max-md:px-4">
				<div>
					<SectionHeading eyebrow="04 · Para quem é" title="Feito pra quem" muted="já vive de varejo." />
					<p className="mt-5 max-w-[42ch] text-[17px] leading-[1.6] text-[#5b6a70] max-md:text-[16px]">
						Se a sua relação com o lojista já existe, o programa só transforma essa confiança em receita que se acumula.
					</p>
				</div>
				<ul className="border-b border-[#e3e8ea]">
					{PROFILES.map((profile, index) => (
						<li
							key={profile.title}
							className="grid grid-cols-[32px_44px_minmax(0,1fr)] items-start gap-4 border-t border-[#e3e8ea] py-6 max-[400px]:grid-cols-[44px_minmax(0,1fr)]"
						>
							<span className="pt-3 text-[13px] font-semibold text-[#8a979c] max-[400px]:hidden">{String(index + 1).padStart(2, "0")}</span>
							<span className="flex size-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
								<profile.icon className="size-5" aria-hidden />
							</span>
							<div>
								<h3 className="text-[19px] font-semibold tracking-[-0.015em]">{profile.title}</h3>
								<p className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.6] text-[#5b6a70]">{profile.text}</p>
							</div>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
