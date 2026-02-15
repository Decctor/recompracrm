"use client";

import { Button } from "@/components/ui/button";
import { useDismissHint, useHintFeedback } from "@/lib/queries/ai-hints";
import { cn } from "@/lib/utils";
import type { TAIHint } from "@/schemas/ai-hints";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronUp, Lightbulb, Sparkles, Target, ThumbsDown, ThumbsUp, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type AIHintCardProps = {
	hint: TAIHint;
	isOpened: boolean;
	onClick?: () => void;
};

const HINT_ICONS: Record<string, React.ReactNode> = {
	"campaign-suggestion": <Target className="w-4 h-4" />,
	"campaign-optimization": <TrendingUp className="w-4 h-4" />,
	"rfm-action": <Users className="w-4 h-4" />,
	"client-reactivation": <Users className="w-4 h-4" />,
	"sales-trend": <TrendingUp className="w-4 h-4" />,
	"product-insight": <Lightbulb className="w-4 h-4" />,
	"seller-performance": <Users className="w-4 h-4" />,
	general: <Sparkles className="w-4 h-4" />,
};

const URGENCY_STYLES: Record<string, string> = {
	critica: "border-l-4 border-l-red-500 bg-red-50/50",
	alta: "border-l-4 border-l-orange-500 bg-orange-50/50",
	media: "border-l-4 border-l-yellow-500 bg-yellow-50/50",
	baixa: "border-l-4 border-l-blue-500 bg-blue-50/50",
};

const TREND_ICONS: Record<string, React.ReactNode> = {
	crescimento: <TrendingUp className="w-4 h-4 text-green-500" />,
	queda: <TrendingDown className="w-4 h-4 text-red-500" />,
	estavel: <TrendingUp className="w-4 h-4 text-gray-500" />,
};

function getUrgencyFromHint(hint: TAIHint): string | null {
	if (hint.conteudo.tipo === "rfm-action") {
		return hint.conteudo.dados.urgencia;
	}
	if (hint.conteudo.tipo === "general") {
		return hint.conteudo.dados.prioridade;
	}
	if (hint.conteudo.tipo === "sales-trend" && hint.conteudo.dados.tendencia === "queda") {
		return "alta";
	}
	return null;
}

export function AIHintCard({ hint, isOpened, onClick }: AIHintCardProps) {
	const [feedbackGiven, setFeedbackGiven] = useState<"like" | "dislike" | null>(null);
	const { mutate: dismiss, isPending: isDismissing } = useDismissHint();
	const { mutate: submitFeedback, isPending: isFeedbackPending } = useHintFeedback();

	const handleDismiss = (e: React.MouseEvent) => {
		e.stopPropagation();
		dismiss(hint.id);
	};

	const handleFeedback = (tipo: "like" | "dislike") => (e: React.MouseEvent) => {
		e.stopPropagation();
		setFeedbackGiven(tipo);
		submitFeedback({ hintId: hint.id, tipo });
	};

	const icon = HINT_ICONS[hint.tipo] || <Sparkles className="w-4 h-4" />;
	const urgency = getUrgencyFromHint(hint);
	const urgencyStyle = urgency ? URGENCY_STYLES[urgency] : "";

	const trendIcon = hint.conteudo.tipo === "sales-trend" ? TREND_ICONS[hint.conteudo.dados.tendencia] : null;

	return (
		<div
			className={cn(
				"group flex items-start gap-3 p-3 transition-all duration-300 rounded-xl border border-transparent cursor-pointer",
				isOpened && "bg-secondary/40 border-border/40",
				!isOpened && "opacity-70 hover:opacity-100",
				urgencyStyle,
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick?.();
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Icon */}
			<div className="flex-shrink-0">
				<div className={cn("h-8 w-8 rounded-full flex items-center justify-center", isOpened ? "bg-brand text-brand-foreground" : "bg-secondary text-muted-foreground")}>
					{trendIcon || icon}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<div className="flex items-start justify-between gap-2">
					<p className={cn("text-sm font-semibold leading-tight", isOpened ? "text-foreground" : "text-foreground/80")}>{hint.conteudo.titulo}</p>
					<div className="flex items-center gap-1 flex-shrink-0">
						{isOpened ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
					</div>
				</div>

				<AnimatePresence initial={false}>
					{isOpened && (
						<motion.div
							initial={{ height: 0, opacity: 0, marginTop: 0 }}
							animate={{ height: "auto", opacity: 1, marginTop: 12 }}
							exit={{ height: 0, opacity: 0, marginTop: 0 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
							className="overflow-hidden"
						>
							<div className="space-y-3">
								<p className="text-xs text-muted-foreground leading-relaxed">{hint.conteudo.descricao}</p>

								{/* Action Button */}
								{hint.conteudo.acaoSugerida && hint.conteudo.urlAcao && (
									<Button
										asChild
										size="sm"
										variant="default"
										className="h-8 px-4 text-xs font-semibold rounded-full bg-brand text-brand-foreground hover:bg-brand/90 hover:shadow-md transition-all"
										onClick={(e) => e.stopPropagation()}
									>
										<Link href={hint.conteudo.urlAcao} className="flex items-center gap-1.5">
											{hint.conteudo.acaoSugerida}
											<ArrowRight className="w-3 h-3" />
										</Link>
									</Button>
								)}

								{/* Feedback & Dismiss Row */}
								<div className="flex items-center justify-between pt-2 border-t border-border/50">
									<div className="flex items-center gap-1">
										<span className="text-[10px] text-muted-foreground mr-1">Foi útil?</span>
										<Button
											variant="ghost"
											size="icon"
											className={cn("h-7 w-7 rounded-full", feedbackGiven === "like" && "bg-green-100 text-green-600")}
											onClick={handleFeedback("like")}
											disabled={isFeedbackPending}
										>
											<ThumbsUp className="w-3.5 h-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className={cn("h-7 w-7 rounded-full", feedbackGiven === "dislike" && "bg-red-100 text-red-600")}
											onClick={handleFeedback("dislike")}
											disabled={isFeedbackPending}
										>
											<ThumbsDown className="w-3.5 h-3.5" />
										</Button>
									</div>
									<Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={handleDismiss} disabled={isDismissing}>
										<X className="w-3.5 h-3.5 mr-1" />
										Descartar
									</Button>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
