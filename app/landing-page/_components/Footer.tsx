import { Lock, MessageCircle, Shield } from "lucide-react";
import Link from "next/link";

export default function Footer() {
	return (
		<footer className="bg-slate-50 border-t border-slate-200">
			<div className="container mx-auto max-w-7xl px-6 lg:px-8 py-12">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
					{/* Brand */}
					<div>
						<h3 className="font-bold text-lg text-slate-900 mb-3">
							RecompraCRM
						</h3>
						<p className="text-sm text-slate-500 leading-relaxed">
							Plataforma de recompra para varejo físico. Cashback, campanhas
							automáticas e inteligência de dados em um só lugar.
						</p>
					</div>

					{/* Products */}
					<div>
						<h4 className="font-semibold text-slate-900 mb-3">Produtos</h4>
						<ul className="space-y-2 text-sm text-slate-500">
							<li>Cashback e Pontos</li>
							<li>Campanhas Automáticas</li>
							<li>WhatsApp Hub</li>
							<li>Business Intelligence</li>
						</ul>
					</div>

					{/* About / Legal */}
					<div>
						<h4 className="font-semibold text-slate-900 mb-3">Sobre</h4>
						<ul className="space-y-2 text-sm text-slate-500">
							<li>
								<Link
									href="/legal"
									className="hover:text-[#24549C] transition-colors"
								>
									Termos e Políticas
								</Link>
							</li>
							<li>Privacidade</li>
							<li>Contato</li>
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
					© {new Date().getFullYear()} RecompraCRM. Todos os direitos
					reservados.
				</div>
			</div>
		</footer>
	);
}
