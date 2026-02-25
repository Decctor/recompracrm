"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Integration "logos" rendered as styled text/icon badges
const INTEGRATIONS = [
	{
		name: "Online Software",
		abbr: "OS",
		color: "bg-slate-700",
		description: "ERP",
	},
	{
		name: "Cardápio Web",
		abbr: "CW",
		color: "bg-slate-600",
		description: "Pedidos",
	},
	{
		name: "WhatsApp Cloud API",
		abbr: "WA",
		color: "bg-slate-800",
		description: "Mensagens",
	},
	{
		name: "Meta Business",
		abbr: "MB",
		color: "bg-slate-700",
		description: "Anúncios",
	},
	{
		name: "ERP Genérico",
		abbr: "ERP",
		color: "bg-slate-600",
		description: "Vendas",
	},
	{
		name: "Stripe",
		abbr: "STR",
		color: "bg-slate-700",
		description: "Pagamentos",
	},
];

function IntegrationBadge({ name, abbr, description }: { name: string; abbr: string; description: string }) {
	return (
		<div className="flex flex-col items-center gap-2 group">
			<div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center grayscale group-hover:grayscale-0 transition-all duration-300 group-hover:border-[#24549C]/30 group-hover:shadow-md">
				<span className="text-xs font-black text-slate-500 tracking-tight group-hover:text-[#24549C] transition-colors">{abbr}</span>
			</div>
			<span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors text-center whitespace-nowrap">{name}</span>
		</div>
	);
}

export default function SocialProof() {
	return (
		<section className="py-14 bg-white border-y border-slate-100">
			<div className="container mx-auto max-w-7xl px-6 lg:px-8">
				<motion.p
					initial={{ opacity: 0, y: 10 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.4 }}
					className="text-center text-sm font-semibold text-slate-400 uppercase tracking-widest mb-10"
				>
					Integrado nativamente com as ferramentas que o seu varejo já usa
				</motion.p>

				<motion.div
					initial={{ opacity: 0, y: 16 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.1 }}
					className="flex flex-wrap items-center justify-center gap-10 md:gap-16"
				>
					{INTEGRATIONS.map((integration, idx) => (
						<motion.div
							key={integration.name}
							initial={{ opacity: 0, y: 10 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.3, delay: idx * 0.07 }}
						>
							<IntegrationBadge {...integration} />
						</motion.div>
					))}
				</motion.div>

				{/* Tagline row */}
				<motion.div
					initial={{ opacity: 0 }}
					whileInView={{ opacity: 1 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.5 }}
					className="mt-12 flex flex-wrap items-center justify-center gap-8"
				>
					{[
						{ value: "+200", label: "Lojas ativas" },
						{ value: "R$ 4M+", label: "Em cashback distribuído" },
						{ value: "94%", label: "Taxa de retenção" },
						{ value: "3.8x", label: "ROI médio em campanhas" },
					].map((stat) => (
						<div key={stat.label} className="text-center">
							<p className="text-2xl font-black text-[#24549C]">{stat.value}</p>
							<p className="text-xs text-slate-400 font-medium mt-0.5">{stat.label}</p>
						</div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
