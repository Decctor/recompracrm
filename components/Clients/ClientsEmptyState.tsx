"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, FileSpreadsheet, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { FaWhatsapp } from "react-icons/fa6";
import { appRoutes } from "@/lib/navigation/routes";

/** `canImport`: clientes.gerenciarBase. Sem ela o botão de importação some (a rota recusa). */
export default function ClientsEmptyState({ canImport }: { canImport: boolean }) {
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
						<Users className="w-10 h-10 text-[#24549C]" />
					</div>
					<div className="absolute -right-1 -top-1 bg-[#FFB900] rounded-full p-1.5 shadow-md">
						<Sparkles className="w-4 h-4 text-white fill-white" />
					</div>
				</div>
				<h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-br from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
					Cadastre seus primeiros clientes
				</h1>
				<p className="text-muted-foreground text-lg">
					Comece importando sua base por planilha para liberar análises, segmentações e ações comerciais no CRM.
				</p>
			</motion.div>

			<motion.div className="w-full max-w-xl px-4" variants={itemVariants}>
				<Card className="h-full border-muted/60 shadow-lg shadow-muted/5 overflow-hidden relative group hover:border-[#24549C]/50 hover:shadow-[#24549C]/10 transition-all duration-300">
					<CardHeader>
						<div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 bg-[#24549C]/10 group-hover:bg-[#24549C]/20 transition-colors">
							<FileSpreadsheet className="w-7 h-7 text-[#24549C]" />
						</div>
						<CardTitle className="text-xl">Importar clientes por planilha</CardTitle>
						<CardDescription className="text-base">Faça upload de arquivos Excel/CSV com mapeamento inteligente e validação automática.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-3">
							{["Mapeamento assistido", "Validação de dados", "Importação em lote", "Fluxo guiado em etapas"].map((item, index) => (
								<div key={index.toString()} className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
									<div className="w-6 h-6 rounded-full bg-[#FFB900]/10 flex items-center justify-center shrink-0">
										<CheckCircle2 className="w-3.5 h-3.5 text-[#FFB900]" />
									</div>
									<span>{item}</span>
								</div>
							))}
						</div>
						{canImport ? (
							<Button
								className="w-full gap-2 h-11 text-base shadow-lg shadow-[#24549C]/20 hover:shadow-[#24549C]/40 transition-all text-white hover:text-white"
								style={{ backgroundColor: "#24549C" }}
								asChild
							>
								<Link href={appRoutes.customers.import()}>
									Ir para importação
									<ArrowRight className="w-4 h-4 ml-1" />
								</Link>
							</Button>
						) : (
							<p className="text-sm text-muted-foreground">Peça a quem administra a empresa para importar a base de clientes.</p>
						)}
					</CardContent>

					<div className="absolute -top-12 -right-12 w-32 h-32 bg-linear-to-br from-[#24549C]/10 to-transparent rounded-full blur-2xl group-hover:from-[#24549C]/20 transition-all duration-500" />
				</Card>
			</motion.div>

			<motion.div className="flex items-center gap-2 text-center w-fit self-center px-4 py-2 rounded-lg bg-green-50" variants={itemVariants}>
				<FaWhatsapp className="w-4 h-4 text-black" />
				<p className="text-sm text-black">
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
