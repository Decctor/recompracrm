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
							Sua loja já tem clientes. <br />
							<span className="text-[#FFB900]">Agora, faça eles voltarem.</span>
						</h2>

						<p className="text-lg text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed">
							Faça seus clientes voltarem e aumente o seu faturamento. <br /> Configure hoje e veja os primeiros resultados em menos de 30 dias.
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
							<span className="tracking-tight">✓ Teste grátis de 15 dias</span>
							<span className="tracking-tight">✓ Sem cartão de crédito necessário</span>
							<span className="tracking-tight">✓ Cancele quando quiser</span>
							<span className="tracking-tight">✓ Suporte incluso</span>
						</div>
					</motion.div>
				</div>
			</section>

			{/* Footer */}
			<footer className="bg-slate-50 border-t border-slate-200">
				<div className="container mx-auto max-w-7xl px-6 lg:px-8 py-12">
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-8 mb-10">
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

						{/* Funcionalidades */}
						<div>
							<h4 className="font-bold text-slate-900 mb-3 text-sm">Funcionalidades</h4>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>
									<Link href="/features/programa-de-cashback" className="hover:text-[#24549C] transition-colors">
										Cashback e Pontos
									</Link>
								</li>
								<li>
									<Link href="/features/campanhas-whatsapp" className="hover:text-[#24549C] transition-colors">
										Campanhas WhatsApp
									</Link>
								</li>
								<li>
									<Link href="/features/ponto-de-interacao" className="hover:text-[#24549C] transition-colors">
										Ponto de Interação
									</Link>
								</li>
								<li>
									<Link href="/features/business-intelligence" className="hover:text-[#24549C] transition-colors">
										Business Intelligence
									</Link>
								</li>
							</ul>
						</div>

						{/* Integrações */}
						<div>
							<h4 className="font-bold text-slate-900 mb-3 text-sm">Integrações</h4>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>
									<Link href="/integrations" className="hover:text-[#24549C] transition-colors">
										Todas as Integrações
									</Link>
								</li>
								<li>
									<Link href="/integrations/bling" className="hover:text-[#24549C] transition-colors">
										Bling
									</Link>
								</li>
								<li>
									<Link href="/integrations/ifood" className="hover:text-[#24549C] transition-colors">
										iFood
									</Link>
								</li>
								<li>
									<Link href="/integrations/nuvem-shop" className="hover:text-[#24549C] transition-colors">
										Nuvem Shop
									</Link>
								</li>
							</ul>
						</div>

						{/* Conteúdo */}
						<div>
							<h4 className="font-bold text-slate-900 mb-3 text-sm">Conteúdo</h4>
							<ul className="space-y-2 text-sm text-slate-500">
								<li>
									<Link href="/blog" className="hover:text-[#24549C] transition-colors">
										Blog
									</Link>
								</li>
								<li>
									<Link href="/segments" className="hover:text-[#24549C] transition-colors">
										Todos os Segmentos
									</Link>
								</li>
								<li>
									<Link href="/segments/restaurantes" className="hover:text-[#24549C] transition-colors">
										Restaurantes
									</Link>
								</li>
								<li>
									<Link href="/segments/pet-shop" className="hover:text-[#24549C] transition-colors">
										Pet Shops
									</Link>
								</li>
								<li>
									<Link href="/segments/loja-de-roupas" className="hover:text-[#24549C] transition-colors">
										Lojas de Roupas
									</Link>
								</li>
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
