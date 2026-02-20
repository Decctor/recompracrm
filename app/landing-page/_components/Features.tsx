"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart3, Bot, Gift, Send } from "lucide-react";

// ════════════════════════════════════════════════════════════════
// ─── MINIATURE UI COMPONENTS ───
// ════════════════════════════════════════════════════════════════

function PDVMiniature() {
	return (
		<div className="pointer-events-none select-none w-full h-full flex items-center justify-center p-3">
			{/* Tablet frame */}
			<div className="w-full max-w-[280px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
					<div className="w-5 h-5 rounded-full bg-[#24549C] flex items-center justify-center">
						<span className="text-[7px] font-black text-white">R</span>
					</div>
					<span className="text-[10px] font-bold text-slate-700 tracking-tight">Loja Exemplo</span>
					<div className="ml-auto flex items-center gap-1 bg-[#FFB900]/10 border border-[#FFB900]/20 rounded-full px-1.5 py-0.5">
						<Gift className="w-2.5 h-2.5 text-[#FFB900]" />
						<span className="text-[7px] font-bold text-[#FFB900]">CASHBACK</span>
					</div>
				</div>

				{/* Action buttons grid */}
				<div className="p-2.5 grid grid-cols-2 gap-2">
					<div className="bg-green-500 rounded-lg p-2 flex flex-col items-center justify-center gap-1">
						<div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
							<Gift className="w-3 h-3 text-white" />
						</div>
						<span className="text-[7px] font-bold text-white uppercase leading-tight text-center">Resgate Cashback</span>
					</div>
					<div className="border border-slate-200 rounded-lg p-2 flex flex-col items-center justify-center gap-1 bg-white">
						<div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
							<span className="text-[8px] font-bold text-slate-600">$</span>
						</div>
						<span className="text-[7px] font-bold text-slate-600 uppercase leading-tight text-center">Meu Saldo</span>
					</div>
				</div>

				{/* Client card */}
				<div className="mx-2.5 mb-2.5 bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
					<div className="w-7 h-7 rounded-full bg-green-200 flex items-center justify-center shrink-0">
						<span className="text-[8px] font-bold text-green-700">MS</span>
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[9px] font-bold text-green-900 uppercase">Maria Silva</div>
						<div className="text-[8px] text-green-600">(34) 99876-5432</div>
					</div>
					<div className="bg-green-600 rounded-md px-1.5 py-0.5 shrink-0">
						<span className="text-[8px] font-bold text-white">R$ 25,00</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function CampaignMiniature() {
	return (
		<div className="pointer-events-none select-none w-full h-full flex items-center justify-center p-3">
			<div className="w-full max-w-[280px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
					<span className="text-[10px] font-bold text-slate-800">Campanhas Ativas</span>
					<span className="bg-[#24549C] text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">3</span>
				</div>

				{/* Campaign card */}
				<div className="mx-2.5 mt-2.5 border border-slate-200 rounded-lg p-2">
					<div className="flex items-center gap-1.5 mb-2">
						<div className="w-2 h-2 rounded-full bg-green-500" />
						<span className="text-[9px] font-bold text-slate-800">Reativação 45d</span>
						<span className="ml-auto bg-amber-100 text-amber-700 text-[7px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">Em Risco</span>
					</div>
					<div className="flex items-center gap-1 text-[7px] text-slate-400">
						<Send className="w-2.5 h-2.5" />
						<span>WhatsApp + Cashback R$ 25</span>
					</div>
				</div>

				{/* Funnel */}
				<div className="px-2.5 py-3">
					<div className="flex items-center gap-1">
						{/* Step 1 */}
						<div className="flex-1 flex flex-col items-center">
							<div className="w-full h-5 bg-[#24549C]/10 rounded flex items-center justify-center">
								<motion.span
									className="text-[9px] font-bold text-[#24549C]"
									initial={{ opacity: 0 }}
									whileInView={{ opacity: 1 }}
									viewport={{ once: true }}
									transition={{ duration: 0.5, delay: 0.2 }}
								>
									245
								</motion.span>
							</div>
							<span className="text-[7px] text-slate-500 mt-0.5">Enviados</span>
						</div>
						<div className="text-[8px] text-slate-300">›</div>
						{/* Step 2 */}
						<div className="flex-1 flex flex-col items-center">
							<div className="w-full h-5 bg-[#FFB900]/10 rounded flex items-center justify-center">
								<motion.span
									className="text-[9px] font-bold text-[#FFB900]"
									initial={{ opacity: 0 }}
									whileInView={{ opacity: 1 }}
									viewport={{ once: true }}
									transition={{ duration: 0.5, delay: 0.4 }}
								>
									189
								</motion.span>
							</div>
							<span className="text-[7px] text-slate-500 mt-0.5">Lidos</span>
						</div>
						<div className="text-[8px] text-slate-300">›</div>
						{/* Step 3 */}
						<div className="flex-1 flex flex-col items-center">
							<div className="w-full h-5 bg-green-500/10 rounded flex items-center justify-center">
								<motion.span
									className="text-[9px] font-bold text-green-600"
									initial={{ opacity: 0 }}
									whileInView={{ opacity: 1 }}
									viewport={{ once: true }}
									transition={{ duration: 0.5, delay: 0.6 }}
								>
									42
								</motion.span>
							</div>
							<span className="text-[7px] text-slate-500 mt-0.5">Convertidos</span>
						</div>
					</div>
					{/* Conversion rate */}
					<div className="mt-2 flex items-center justify-center gap-1">
						<span className="text-[8px] text-slate-400">Taxa:</span>
						<span className="text-[9px] font-bold text-green-600">17,1%</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function ChatMiniature() {
	return (
		<div className="pointer-events-none select-none w-full h-full flex items-center justify-center p-3">
			<div className="w-full max-w-[300px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex h-[190px]">
				{/* Left panel — chat list */}
				<div className="w-[90px] border-r border-slate-100 flex flex-col shrink-0">
					<div className="px-2 py-1.5 border-b border-slate-100">
						<span className="text-[8px] font-bold text-slate-500 uppercase">Chats</span>
					</div>
					<div className="flex-1 flex flex-col gap-0.5 p-1">
						{/* Chat item 1 — active/unread */}
						<div className="flex items-center gap-1.5 p-1.5 rounded-md bg-[#24549C]/5">
							<div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
								<span className="text-[7px] font-bold text-blue-600">MS</span>
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-[8px] font-bold text-slate-800 truncate">Maria S.</div>
								<div className="text-[7px] text-slate-400 truncate">Qual o preço...</div>
							</div>
							<div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shrink-0">
								<span className="text-[6px] font-bold text-white">2</span>
							</div>
						</div>
						{/* Chat item 2 */}
						<div className="flex items-center gap-1.5 p-1.5 rounded-md">
							<div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
								<span className="text-[7px] font-bold text-purple-600">JC</span>
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-[8px] font-bold text-slate-600 truncate">João C.</div>
								<div className="text-[7px] text-slate-400 truncate">Obrigado!</div>
							</div>
						</div>
						{/* Chat item 3 */}
						<div className="flex items-center gap-1.5 p-1.5 rounded-md">
							<div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
								<span className="text-[7px] font-bold text-amber-600">AL</span>
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-[8px] font-bold text-slate-600 truncate">Ana L.</div>
								<div className="text-[7px] text-slate-400 truncate">Voltagem?</div>
							</div>
						</div>
					</div>
				</div>

				{/* Right panel — chat */}
				<div className="flex-1 flex flex-col">
					{/* Chat header */}
					<div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100">
						<div className="flex items-center gap-1.5">
							<div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
								<span className="text-[7px] font-bold text-blue-600">MS</span>
							</div>
							<span className="text-[9px] font-bold text-slate-800">Maria S.</span>
						</div>
						<div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">
							<Bot className="w-2.5 h-2.5 text-green-600" />
							<span className="text-[7px] font-bold text-green-700">IA</span>
						</div>
					</div>

					{/* Messages */}
					<div className="flex-1 flex flex-col justify-end gap-1.5 p-2">
						{/* Received */}
						<div className="bg-slate-100 rounded-lg rounded-tl-sm px-2 py-1 max-w-[80%] self-start">
							<p className="text-[8px] text-slate-700">Qual o preço do kit?</p>
						</div>
						{/* Sent (AI) */}
						<div className="bg-[#24549C] rounded-lg rounded-tr-sm px-2 py-1 max-w-[80%] self-end">
							<p className="text-[8px] text-white">O Kit Premium sai por R$ 189,90!</p>
						</div>
						{/* Received */}
						<div className="bg-slate-100 rounded-lg rounded-tl-sm px-2 py-1 max-w-[80%] self-start">
							<p className="text-[8px] text-slate-700">Quero comprar</p>
						</div>
						{/* Typing indicator */}
						<div className="bg-slate-100 rounded-lg rounded-tl-sm px-2.5 py-1.5 self-start flex items-center gap-0.5">
							<motion.span
								className="w-1 h-1 bg-slate-400 rounded-full"
								animate={{ opacity: [0.3, 1, 0.3] }}
								transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, delay: 0 }}
							/>
							<motion.span
								className="w-1 h-1 bg-slate-400 rounded-full"
								animate={{ opacity: [0.3, 1, 0.3] }}
								transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, delay: 0.2 }}
							/>
							<motion.span
								className="w-1 h-1 bg-slate-400 rounded-full"
								animate={{ opacity: [0.3, 1, 0.3] }}
								transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, delay: 0.4 }}
							/>
						</div>
					</div>

					{/* Input bar */}
					<div className="flex items-center gap-1 px-2 py-1.5 border-t border-slate-100">
						<div className="flex-1 bg-slate-50 rounded-full h-5 px-2 flex items-center">
							<span className="text-[7px] text-slate-400">Digite uma mensagem...</span>
						</div>
						<div className="w-5 h-5 rounded-full bg-[#24549C] flex items-center justify-center shrink-0">
							<Send className="w-2.5 h-2.5 text-white" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function AnalyticsMiniature() {
	const segments = [
		{ label: "Campeões", count: "128", bg: "bg-green-50", border: "border-green-200", text: "text-green-700", countBg: "bg-green-100" },
		{ label: "Leais", count: "450", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", countBg: "bg-blue-100" },
		{ label: "Em Risco", count: "89", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", countBg: "bg-amber-100" },
		{ label: "Novos", count: "312", bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", countBg: "bg-purple-100" },
	];

	return (
		<div className="pointer-events-none select-none w-full h-full flex items-center justify-center p-3">
			<div className="w-full max-w-[280px] bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
					<span className="text-[10px] font-bold text-slate-800">Dashboard</span>
					<div className="flex items-center gap-1">
						<BarChart3 className="w-3 h-3 text-[#24549C]" />
						<span className="text-[8px] text-slate-400">Tempo real</span>
					</div>
				</div>

				{/* KPI row */}
				<div className="grid grid-cols-3 gap-1.5 px-2.5 py-2">
					{[
						{ label: "Vendas", value: "R$ 42k", color: "text-green-600" },
						{ label: "Ticket", value: "R$ 287", color: "text-[#24549C]" },
						{ label: "Clientes", value: "979", color: "text-purple-600" },
					].map((kpi) => (
						<div key={kpi.label} className="bg-slate-50 rounded-md px-2 py-1.5 text-center">
							<div className="text-[7px] text-slate-400 uppercase font-medium">{kpi.label}</div>
							<motion.div
								className={cn("text-[10px] font-bold", kpi.color)}
								initial={{ opacity: 0, y: 5 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ duration: 0.4 }}
							>
								{kpi.value}
							</motion.div>
						</div>
					))}
				</div>

				{/* RFM Segments grid */}
				<div className="px-2.5 pb-2.5">
					<div className="text-[8px] font-bold text-slate-500 uppercase mb-1.5">Segmentos RFM</div>
					<div className="grid grid-cols-2 gap-1.5">
						{segments.map((seg, idx) => (
							<motion.div
								key={seg.label}
								className={cn("rounded-md px-2 py-1.5 border flex items-center justify-between", seg.bg, seg.border)}
								initial={{ opacity: 0, scale: 0.9 }}
								whileInView={{ opacity: 1, scale: 1 }}
								viewport={{ once: true }}
								transition={{ duration: 0.3, delay: idx * 0.1 }}
							>
								<span className={cn("text-[8px] font-semibold", seg.text)}>{seg.label}</span>
								<span className={cn("text-[9px] font-bold rounded-full px-1.5 py-0.5", seg.countBg, seg.text)}>{seg.count}</span>
							</motion.div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════════════════════════
// ─── FEATURES DATA ───
// ════════════════════════════════════════════════════════════════

const FEATURES = [
	{
		icon: Gift,
		title: "Cashback & PDV",
		description: "Tablet no balcão para acumular e resgatar cashback. Sem integração obrigatória.",
		color: "bg-[#FFB900]/10 text-[#FFB900]",
		miniature: PDVMiniature,
	},
	{
		icon: Send,
		title: "Campanhas Automáticas",
		description: "Segmentação RFM identifica inativos e dispara cashback via WhatsApp automaticamente.",
		color: "bg-[#24549C]/10 text-[#24549C]",
		miniature: CampaignMiniature,
	},
	{
		icon: Bot,
		title: "WhatsApp Hub",
		description: "IA responde dúvidas 24/7 e transfere para o vendedor na hora certa.",
		color: "bg-green-500/10 text-green-600",
		miniature: ChatMiniature,
	},
	{
		icon: BarChart3,
		title: "Analytics & RFM",
		description: "Dashboards em tempo real, segmentação de clientes e ranking de vendedores.",
		color: "bg-purple-500/10 text-purple-600",
		miniature: AnalyticsMiniature,
	},
];

// ════════════════════════════════════════════════════════════════
// ─── FEATURES SECTION ───
// ════════════════════════════════════════════════════════════════

export default function Features() {
	return (
		<section
			id="funcionalidades"
			className="py-20 lg:py-24 bg-gradient-to-b from-white to-slate-50/50"
		>
			<div className="container mx-auto max-w-7xl px-6 lg:px-8">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-14"
				>
					<h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mb-4">
						Tudo que você precisa em um só lugar
					</h2>
					<p className="text-lg text-slate-600 max-w-2xl mx-auto">
						Do cashback no balcão até a reativação automática por WhatsApp.
					</p>
				</motion.div>

				{/* 2×2 Bento Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{FEATURES.map((feature, idx) => (
						<motion.div
							key={feature.title}
							initial={{ opacity: 0, y: 30 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.4, delay: idx * 0.1 }}
							className="group bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden"
						>
							{/* Showcase area */}
							<div className="bg-slate-50/80 h-[220px] border-b border-slate-100">
								<feature.miniature />
							</div>

							{/* Text area */}
							<div className="p-6">
								<div className="flex items-center gap-3 mb-3">
									<div
										className={cn(
											"w-10 h-10 rounded-xl flex items-center justify-center",
											feature.color,
										)}
									>
										<feature.icon className="w-5 h-5" />
									</div>
									<h3 className="text-lg font-bold text-slate-900">
										{feature.title}
									</h3>
								</div>
								<p className="text-sm text-slate-600 leading-relaxed">
									{feature.description}
								</p>
							</div>
						</motion.div>
					))}
				</div>
			</div>
		</section>
	);
}
