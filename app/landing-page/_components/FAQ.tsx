"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const FAQ_ITEMS = [
	{
		question: "Preciso de integração com meu sistema?",
		answer:
			"Não. O RecompraCRM funciona de forma independente. Você pode começar hoje mesmo usando nosso Ponto de Interação (tablet no balcão). Se quiser, integramos com seu ERP depois — mas não é obrigatório.",
	},
	{
		question: "Quanto tempo leva pra ver resultado?",
		answer:
			"Depende do seu volume. Lojas que cadastram vendas diariamente costumam ver os primeiros clientes reativados em 2-3 semanas. O cashback funciona como gatilho: o cliente volta pra usar o saldo.",
	},
	{
		question: "E se eu já tiver um programa de cashback?",
		answer:
			"Você pode migrar ou rodar os dois em paralelo. O diferencial do RecompraCRM é a automação: identificamos inativos e enviamos cashback pelo WhatsApp automaticamente. Não é só um sistema de pontos.",
	},
	{
		question: "Funciona pra qual tipo de loja?",
		answer:
			"Varejo físico com vendas recorrentes: cosméticos, pet shops, materiais de construção, farmácias, óticas. Se você tem clientes que deveriam voltar mas não voltam, o RecompraCRM ajuda.",
	},
	{
		question: "E se eu não gostar?",
		answer:
			"15 dias grátis para testar. Sem cartão de crédito. Se não fizer sentido pro seu negócio, você cancela sem burocracia.",
	},
];

export default function FAQ() {
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	return (
		<section id="perguntas" className="py-20 lg:py-24 bg-white">
			<div className="container mx-auto max-w-3xl px-6 lg:px-8">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-14"
				>
					<h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mb-4">
						Perguntas Frequentes
					</h2>
					<p className="text-lg text-slate-600">
						Tire suas dúvidas antes de começar.
					</p>
				</motion.div>

				{/* Accordion */}
				<div className="space-y-3">
					{FAQ_ITEMS.map((faq, idx) => {
						const isOpen = openIndex === idx;
						return (
							<motion.div
								key={idx.toString()}
								initial={{ opacity: 0, y: 15 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ duration: 0.3, delay: idx * 0.05 }}
								className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
							>
								<button
									type="button"
									onClick={() => setOpenIndex(isOpen ? null : idx)}
									className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
								>
									<span className="font-semibold text-slate-900 pr-4">
										{faq.question}
									</span>
									<ChevronDown
										className={cn(
											"w-5 h-5 text-slate-400 transition-transform duration-300 flex-shrink-0",
											isOpen && "rotate-180",
										)}
									/>
								</button>
								<AnimatePresence initial={false}>
									{isOpen && (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ duration: 0.3, ease: "easeInOut" }}
											className="overflow-hidden"
										>
											<div className="px-5 pb-5">
												<p className="text-slate-600 leading-relaxed">
													{faq.answer}
												</p>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</motion.div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
