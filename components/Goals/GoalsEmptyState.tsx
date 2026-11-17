"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { BadgeDollarSign, CheckCircle2, Plus, Sparkles, Target, Users } from "lucide-react";

type GoalsEmptyStateProps = {
	/** Ausente para quem não pode criar metas: o convite some. */
	onCreateGoal?: (() => void) | null;
};

export default function GoalsEmptyState({ onCreateGoal }: GoalsEmptyStateProps) {
	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: { staggerChildren: 0.1 },
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20 },
		visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
	};

	const features = [
		{ icon: <BadgeDollarSign className="w-3.5 h-3.5 text-foreground" />, label: "Meta de valor total vendido" },
		{ icon: <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />, label: "Meta de quantidade de vendas" },
		{ icon: <Users className="w-3.5 h-3.5 text-foreground" />, label: "Meta de novos clientes" },
		{ icon: <Target className="w-3.5 h-3.5 text-foreground" />, label: "Acompanhamento por vendedor" },
	];

	return (
		<motion.div
			className="w-full flex flex-col items-center justify-center gap-8 py-16"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div className="flex flex-col items-center gap-3 text-center max-w-md" variants={itemVariants}>
				<div className="relative w-20 h-20 mb-2">
					<div className="absolute inset-0 rounded-full bg-primary/10 blur-xl opacity-60" />
					<div className="relative w-full h-full rounded-full flex items-center justify-center border shadow-lg ring-4 ring-background bg-primary/10 border-border">
						<Target className="w-10 h-10 text-foreground" />
					</div>
					<div className="absolute -right-1 -top-1 bg-amber-400 rounded-full p-1.5 shadow-md">
						<Sparkles className="w-4 h-4 text-white fill-white" />
					</div>
				</div>
				<h1 className="text-3xl font-bold tracking-tight">Defina a primeira meta</h1>
				<p className="text-muted-foreground text-base">
					Acompanhe o desempenho do time com metas de valor, quantidade de vendas e novos clientes — por período e por vendedor.
				</p>
			</motion.div>

			<motion.div className="w-full max-w-sm" variants={itemVariants}>
				<div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-4">
					<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">O que você pode acompanhar</p>
					<div className="flex flex-col gap-2.5">
						{features.map((f, i) => (
							<div key={i.toString()} className="flex items-center gap-3 text-sm text-foreground">
								<div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">{f.icon}</div>
								<span>{f.label}</span>
							</div>
						))}
					</div>
					{onCreateGoal ? (
						<Button className="w-full gap-2 mt-1" onClick={onCreateGoal}>
							<Plus className="w-4 h-4" />
							Criar primeira meta
						</Button>
					) : null}
				</div>
			</motion.div>
		</motion.div>
	);
}
