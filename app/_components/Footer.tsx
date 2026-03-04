"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { motion } from "framer-motion";
import { ArrowRight, Lock, MessageCircle, Shield } from "lucide-react";
import Link from "next/link";

export default function FooterV2() {
	return (
		<>
			{/* Final CTA Section */}
			<section id="contato" className="py-24 bg-gradient-to-br from-[#24549C] to-[#1a3d7a] relative overflow-hidden">
				{/* Background decoration */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<motion.div
						className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full border-[48px] border-white/5"
						animate={{ rotate: 360 }}
						transition={{ duration: 120, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
					/>
					<motion.div
						className="absolute -bottom-24 -left-24 w-[300px] h-[300px] rounded-full bg-white/3"
						animate={{ scale: [1, 1.1, 1] }}
						transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
					/>
					<div
						className="absolute inset-0 opacity-[0.03]"
						style={{
							backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
							backgroundSize: "60px 60px",
						}}
					/>
				</div>

				<div className="container mx-auto max-w-5xl px-6 lg:px-8 relative z-10 text-center">
					<motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
						<div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-8">
							<div className="w-2 h-2 rounded-full bg-[#FFB900]" />
							<span className="text-sm font-bold text-white/90">Pronto para modernizar o seu varejo?</span>
						</div>

						<h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight tracking-tight">
							Junte-se às lojas que estão <span className="text-[#FFB900]">escalando o faturamento</span>
						</h2>

						<p className="text-lg text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed">
							Retendo clientes e aumentando a recompra sem aumentar o custo de aquisição. Configure hoje e veja os primeiros resultados em menos de 30 dias.
						</p>

						{/* CTAs */}
						<div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
							<motion.a
								whileHover={{ scale: 1.03 }}
								whileTap={{ scale: 0.97 }}
								href="https://wa.me/553499480791?text=Olá, gostaria de falar com um especialista do RecompraCRM."
								target="_blank"
								rel="noopener noreferrer"
								onClick={() =>
									captureClientEvent({
										event: "landing_cta_clicked",
										properties: {
											cta_id: "footer_falar_com_especialista",
											location: "footer",
										},
									})
								}
								className="group bg-[#FFB900] hover:bg-[#e6a800] text-[#1a2f5a] px-10 py-4 rounded-2xl font-black text-base shadow-2xl shadow-black/30 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
							>
								Falar com um Especialista
								<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
							</motion.a>
							<motion.a
								whileHover={{ scale: 1.03 }}
								whileTap={{ scale: 0.97 }}
								href="#planos"
								onClick={() =>
									captureClientEvent({
										event: "landing_cta_clicked",
										properties: {
											cta_id: "footer_ver_planos",
											location: "footer",
										},
									})
								}
								className="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-10 py-4 rounded-2xl font-bold text-base transition-all duration-300"
							>
								Ver Planos e Preços
							</motion.a>
						</div>

						{/* Trust row */}
						<div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/60 font-medium">
							<span>✓ 15 dias grátis</span>
							<span>✓ Sem cartão necessário</span>
							<span>✓ Cancele quando quiser</span>
							<span>✓ Suporte incluso</span>
						</div>
					</motion.div>
				</div>
			</section>

			{/* Footer */}
			<footer className="bg-slate-50 border-t border-slate-200">
				<div className="container mx-auto max-w-7xl px-6 lg:px-8 py-12">
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
						{/* Brand */}
						<div className="md:col-span-1">
							<h3 className="font-black text-lg text-slate-900 mb-3">RecompraCRM</h3>
							<p className="text-sm text-slate-500 leading-relaxed mb-4">
								Plataforma de retenção para varejo físico. Cashback, campanhas automáticas e inteligência de dados em um só lugar.
							</p>
						</div>

						{/* Produto */}
						<div>
							<h4 className="font-bold text-slate-900 mb-3 text-sm">Produto</h4>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>
									<a href="#funcionalidades" className="hover:text-[#24549C] transition-colors">
										Funcionalidades
									</a>
								</li>
								<li>
									<a href="#plataforma" className="hover:text-[#24549C] transition-colors">
										Ponto de Interação
									</a>
								</li>
								<li>
									<a href="#campanhas" className="hover:text-[#24549C] transition-colors">
										Campanhas
									</a>
								</li>
								<li>
									<span>Planos & Preços</span>
								</li>
							</ul>
						</div>

						{/* Recursos */}
						<div>
							<h4 className="font-bold text-slate-900 mb-3 text-sm">Recursos</h4>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>Cashback e Pontos</li>
								<li>Campanhas Automáticas</li>
								<li>WhatsApp Hub</li>
								<li>Business Intelligence</li>
							</ul>
						</div>

						{/* Legal */}
						<div>
							<h4 className="font-bold text-slate-900 mb-3 text-sm">Contato & Legal</h4>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>
									<Link href="/legal" className="hover:text-[#24549C] transition-colors">
										Termos de Uso
									</Link>
								</li>
								<li>
									<Link href="/legal" className="hover:text-[#24549C] transition-colors">
										Política de Privacidade
									</Link>
								</li>
								<li>Contato</li>
								<li>
									<Link href="/auth/signin" className="hover:text-[#24549C] transition-colors">
										Login da Organização
									</Link>
								</li>
							</ul>
						</div>
					</div>

					{/* Trust Indicators */}
					<div className="flex flex-wrap items-center justify-center gap-6 py-6 border-t border-slate-200 mb-6">
						<div className="flex items-center gap-2 text-sm text-slate-500">
							<Lock className="w-4 h-4" />
							<span>Dados protegidos (LGPD)</span>
						</div>
						<div className="flex items-center gap-2 text-sm text-slate-500">
							<Shield className="w-4 h-4" />
							<span>Pagamento seguro (Stripe)</span>
						</div>
						<div className="flex items-center gap-2 text-sm text-slate-500">
							<MessageCircle className="w-4 h-4" />
							<span>Suporte em horário comercial</span>
						</div>
					</div>

					{/* Copyright */}
					<div className="pt-6 border-t border-slate-200 text-center text-sm text-slate-400">
						© {new Date().getFullYear()} RecompraCRM. Todos os direitos reservados.
					</div>
				</div>
			</footer>
		</>
	);
}
