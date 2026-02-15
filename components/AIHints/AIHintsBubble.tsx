"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAllActiveHints, useGenerateHints } from "@/lib/queries/ai-hints";
import { cn } from "@/lib/utils";
import { ChevronDown, Lightbulb, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AIHintCard } from "./AIHintCard";

const DISMISS_KEY = "ai-hints-dismissed-at";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getDismissedAt(): number | null {
	if (typeof window === "undefined") return null;
	const stored = localStorage.getItem(DISMISS_KEY);
	if (!stored) return null;
	const timestamp = Number.parseInt(stored, 10);
	return Number.isNaN(timestamp) ? null : timestamp;
}

function setDismissedAt(timestamp: number) {
	if (typeof window === "undefined") return;
	localStorage.setItem(DISMISS_KEY, timestamp.toString());
}

function clearDismissedAt() {
	if (typeof window === "undefined") return;
	localStorage.removeItem(DISMISS_KEY);
}

export function AIHintsBubble() {
	const { data: hints, isLoading, isError } = useAllActiveHints();
	const { mutate: generateHints, isPending: isGenerating } = useGenerateHints();

	const [isOpen, setIsOpen] = useState(false);
	const [isDismissed, setIsDismissed] = useState(true);
	const [openedHintIndex, setOpenedHintIndex] = useState<number | null>(null);

	useEffect(() => {
		const dismissedAt = getDismissedAt();
		if (!dismissedAt) {
			setIsDismissed(false);
			return;
		}

		const now = Date.now();
		if (now - dismissedAt >= DISMISS_DURATION_MS) {
			clearDismissedAt();
			setIsDismissed(false);
		} else {
			setIsDismissed(true);
		}
	}, []);

	// Auto-open first hint when hints load
	useEffect(() => {
		if (hints && hints.length > 0 && openedHintIndex === null) {
			setOpenedHintIndex(0);
		}
	}, [hints, openedHintIndex]);

	const handleDismiss = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		setDismissedAt(Date.now());
		setIsDismissed(true);
		setIsOpen(false);
	};

	const handleHintClick = (index: number) => {
		setOpenedHintIndex((prev) => (prev === index ? null : index));
	};

	const handleRefresh = () => {
		// Generate hints for dashboard (default)
		generateHints({ assunto: "dashboard" });
	};

	// Don't render if:
	// - User dismissed the bubble
	// - Still loading
	// - API error (likely feature not enabled or auth issue)
	if (isDismissed || isLoading || isError) {
		return null;
	}

	const activeHints = hints ?? [];
	const hintsCount = activeHints.length;

	// If no hints and not generating, still show the bubble but with generate option
	const showEmptyState = hintsCount === 0;

	return (
		<div className="fixed bottom-6 right-24 z-50 font-sans">
			<Popover open={isOpen} onOpenChange={setIsOpen}>
				<PopoverTrigger asChild>
					<Button
						size="icon"
						className={cn(
							"rounded-full h-14 w-14 shadow-2xl transition-all duration-300 relative border-2 border-white/20",
							isOpen ? "bg-card text-foreground hover:bg-card/90" : "bg-brand text-brand-foreground hover:bg-brand/90",
						)}
					>
						{isOpen ? (
							<ChevronDown className="h-6 w-6" />
						) : (
							<>
								<Lightbulb className="h-6 w-6" />
								{hintsCount > 0 && (
									<span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white shadow-sm">
										{hintsCount}
									</span>
								)}
							</>
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					side="top"
					className="w-[380px] max-h-[calc(100dvh-120px)] p-0 border-0 shadow-2xl rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 flex flex-col"
					sideOffset={16}
				>
					{/* Header Section */}
					<div className="p-5 pb-3 flex-shrink-0 border-b border-border/50">
						<div className="flex items-start justify-between">
							<div>
								<h3 className="text-lg font-bold text-foreground flex items-center gap-2">
									<Sparkles className="w-5 h-5 text-brand" />
									DICAS DA IA
									{hintsCount > 0 && <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{hintsCount}</span>}
								</h3>
								<p className="text-xs text-muted-foreground mt-1">Insights personalizados para seu negócio</p>
							</div>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 rounded-full hover:bg-secondary text-muted-foreground"
									onClick={handleRefresh}
									disabled={isGenerating}
								>
									<RefreshCw className={cn("h-4 w-4", isGenerating && "animate-spin")} />
								</Button>
								<Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-secondary text-muted-foreground" onClick={() => setIsOpen(false)}>
									<ChevronDown className="h-4 w-4" />
								</Button>
								<Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-secondary text-muted-foreground" onClick={handleDismiss}>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</div>

					{/* Hints List */}
					<div className="flex flex-col gap-1 px-2 py-3 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
						{showEmptyState ? (
							<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
								<Lightbulb className="h-10 w-10 text-muted-foreground/50 mb-3" />
								<p className="text-sm text-muted-foreground mb-4">Nenhuma dica disponível no momento.</p>
								<Button variant="outline" size="sm" onClick={handleRefresh} disabled={isGenerating} className="rounded-full">
									{isGenerating ? (
										<>
											<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
											Gerando...
										</>
									) : (
										<>
											<Sparkles className="h-4 w-4 mr-2" />
											Gerar dicas
										</>
									)}
								</Button>
							</div>
						) : (
							activeHints.map((hint, index) => (
								<AIHintCard key={hint.id} hint={hint} isOpened={index === openedHintIndex} onClick={() => handleHintClick(index)} />
							))
						)}
					</div>

					{/* Footer */}
					{hintsCount > 0 && (
						<div className="w-full flex items-center justify-center bg-secondary/50 px-4 py-2.5 border-t border-border/50">
							<p className="text-[10px] text-muted-foreground">Dicas geradas por IA com base nos dados do seu negócio</p>
						</div>
					)}
				</PopoverContent>
			</Popover>
		</div>
	);
}
