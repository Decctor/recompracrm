"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { motion } from "framer-motion";
import { ArrowRight, Cable, Lock, ShoppingCart, Sparkles, Store, Zap } from "lucide-react";
import Link from "next/link";
import { FaWhatsapp } from "react-icons/fa6";

type SalesEmptyStateProps = {
	organizationId: string;
	organizationConfig: TOrganizationConfiguration | null;
};

export default function SalesEmptyState({ organizationId, organizationConfig }: SalesEmptyStateProps) {
	const hasIntegrationAccess = organizationConfig?.recursos?.integracoes?.acesso ?? false;

	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.1,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
	};

	return (
		<motion.div
			className="w-full h-full flex flex-col items-center justify-center gap-8 py-12"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div className="flex flex-col items-center gap-3 text-center max-w-lg" variants={itemVariants}>
				<div className="relative w-20 h-20 mb-2">
					<div className="absolute inset-0 rounded-full blur-xl opacity-50" style={{ backgroundColor: "#24549C40" }} />
					<div className="relative w-full h-full rounded-full flex items-center justify-center border shadow-lg ring-4 ring-background bg-[#24549C10] border-[#24549C20]">
						<ShoppingCart className="w-10 h-10 text-[#24549C]" />
					</div>
					<div className="absolute -right-1 -top-1 bg-[#FFB900] rounded-full p-1.5 shadow-md">
						<Sparkles className="w-4 h-4 text-white fill-white" />
					</div>
				</div>
				<h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
					Registre sua primeira venda
				</h1>
				<p className="text-muted-foreground text-lg">
					Escolha uma das opções abaixo para começar a registrar suas vendas e acompanhar o desempenho do seu negócio.
				</p>
			</motion.div>

			<motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4" variants={itemVariants}>
				{/* Integration Option */}
				<motion.div whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300 }}>
					<Card
						className={`h-full border-muted/60 shadow-lg shadow-muted/5 overflow-hidden relative group ${!hasIntegrationAccess ? "opacity-75 grayscale-[0.5]" : "hover:border-[#24549C]/50 hover:shadow-[#24549C]/10 transition-all duration-300"}`}
					>
						{!hasIntegrationAccess && (
							<div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center p-6 text-center">
								<div className="bg-background/90 p-4 rounded-xl shadow-xl border border-muted max-w-xs">
									<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
										<Lock className="w-5 h-5 text-muted-foreground" />
									</div>
									<h3 className="font-semibold mb-1">Recurso Bloqueado</h3>
									<p className="text-sm text-muted-foreground mb-4">Faça upgrade do seu plano para automatizar suas vendas.</p>
									<Button variant="outline" size="sm" className="w-full gap-2" asChild>
										<Link href="/dashboard/settings?view=subscription">
											Ver planos <ArrowRight className="w-3 h-3" />
										</Link>
									</Button>
								</div>
							</div>
						)}

						<CardHeader>
							<div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 bg-[#24549C]/10 group-hover:bg-[#24549C]/20 transition-colors">
								<Cable className="w-7 h-7 text-[#24549C]" />
							</div>
							<CardTitle className="text-xl">Configurar Integração</CardTitle>
							<CardDescription className="text-base">Conecte seu sistema de vendas (ERP, PDV) para sincronizar automaticamente.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-3">
								{["Utilize o que você já tem", "Sincronização automática", "Atualização em tempo real", "Importação de histórico"].map((item, i) => (
									<div key={i.toString()} className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
										<div className="w-6 h-6 rounded-full bg-[#FFB900]/10 flex items-center justify-center shrink-0">
											<Zap className="w-3.5 h-3.5 text-[#FFB900] fill-[#FFB900]" />
										</div>
										<span>{item}</span>
									</div>
								))}
							</div>
							<Button
								className="w-full gap-2 h-11 text-base shadow-lg shadow-[#24549C]/20 hover:shadow-[#24549C]/40 transition-all text-white hover:text-white"
								style={{ backgroundColor: "#24549C" }}
								asChild
								disabled={!hasIntegrationAccess}
							>
								<Link href="/dashboard/settings?view=integration">
									Configurar integração
									<ArrowRight className="w-4 h-4 ml-1" />
								</Link>
							</Button>
						</CardContent>

						{/* Decorator */}
						<div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-[#24549C]/10 to-transparent rounded-full blur-2xl group-hover:from-[#24549C]/20 transition-all duration-500" />
					</Card>
				</motion.div>

				{/* Manual Sales / Point of Interaction Option */}
				<motion.div whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300 }}>
					<Card className="h-full border-muted/60 shadow-lg shadow-muted/5 overflow-hidden relative group hover:border-[#24549C]/50 hover:shadow-[#24549C]/10 transition-all duration-300">
						<CardHeader>
							<div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 bg-[#FFB900]/10 group-hover:bg-[#FFB900]/20 transition-colors">
								<Store className="w-7 h-7 text-[#FFB900]" />
							</div>
							<CardTitle className="text-xl">Ponto de Interação (POI)</CardTitle>
							<CardDescription className="text-base">Interaja com seus clientes num ambiente amigável e gamificado.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-3">
								{["Interface simples e intuitiva", "Compatível com Tablets e Totens", "Busca e cadastro de clientes", "Gamificação automática"].map(
									(item, i) => (
										<div key={i.toString()} className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
											<div className="w-6 h-6 rounded-full bg-[#24549C]/10 flex items-center justify-center shrink-0">
												<Zap className="w-3.5 h-3.5 text-[#24549C] fill-[#24549C]" />
											</div>
											<span>{item}</span>
										</div>
									),
								)}
							</div>
							<Button
								className="w-full gap-2 h-11 text-base shadow-lg shadow-[#24549C]/20 hover:shadow-[#24549C]/40 transition-all text-white hover:text-white"
								style={{ backgroundColor: "#24549C" }}
								asChild
							>
								<Link href={`/point-of-interaction/${organizationId}/new-sale?filledOperatorPassword=00000`}>
									Fazer nova venda
									<ArrowRight className="w-4 h-4 ml-1" />
								</Link>
							</Button>
						</CardContent>

						{/* Decorator */}
						<div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-[#FFB900]/10 to-transparent rounded-full blur-2xl group-hover:from-[#FFB900]/20 transition-all duration-500" />
					</Card>
				</motion.div>
			</motion.div>

			<motion.div className="flex items-center gap-2 text-center w-fit self-center px-4 py-2 rounded-lg bg-green-50" variants={itemVariants}>
				<FaWhatsapp className="w-4 h-4" />
				<p className="text-sm">
					Precisa de ajuda para começar?{" "}
					<a
						href="https://wa.me/5534996626855?text=Gostaria%20de%20receber%20suporte%20direto%20no%20WhatsApp."
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium hover:underline transition-colors"
						style={{ color: "#24549C" }}
					>
						Fale conosco no WhatsApp
					</a>
				</p>
			</motion.div>
		</motion.div>
	);
}
