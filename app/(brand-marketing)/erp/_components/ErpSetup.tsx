const STEPS = [
	{ n: "01", title: "Canal inicial", text: "Balcão, loja digital ou mesas e comandas." },
	{ n: "02", title: "Produtos", text: "Cadastro com nome, preço e grupo. Cinco produtos já liberam a prévia." },
	{ n: "03", title: "Atendimento", text: "Balcão, mesas ou loja digital, com retirada, entrega e pagamento." },
	{ n: "04", title: "Prévia guiada", text: "Uma compra simulada do começo ao fim, sem cobrança ou estoque." },
	{ n: "05", title: "Lançamento", text: "Com o checklist do canal completo, você começa a vender." },
];

export function ErpSetup() {
	return (
		<section id="implantacao" className="bg-white py-36 max-md:py-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-x-16 gap-y-8">
					<div>
						<p className="mb-4 text-[13px] font-semibold text-[#24549c]">04 · Implantação</p>
						<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
							Do cadastro à primeira venda, com o nosso time.
						</h2>
					</div>
					<p className="text-pretty text-[17px] leading-[1.6] text-[#5b6a70]">
						A configuração é guiada por etapas e acompanhada pela equipe RecompraCRM. Você só começa a vender quando o checklist do canal estiver completo.
					</p>
				</div>
				<ol className="mt-16 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-x-6 gap-y-8 p-0">
					{STEPS.map((step) => (
						<li key={step.n} className="border-t border-[#0e1214] pt-5">
							<span className="text-[13px] font-semibold text-[#687a80]">{step.n}</span>
							<p className="mt-3 text-[18px] font-semibold tracking-[-0.01em]">{step.title}</p>
							<p className="mt-2 text-[14px] leading-[1.55] text-[#5b6a70]">{step.text}</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
