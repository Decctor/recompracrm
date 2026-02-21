"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useOnboardingQuality } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FaWhatsapp } from "react-icons/fa6";
import { OnboardingQualityStep } from "./OnboardingQualityStep";

const DISMISS_KEY = "onboarding-quality-dismissed-at";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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

export function OnboardingQualityBubble() {
	const { data, isLoading } = useOnboardingQuality();
	const [isOpen, setIsOpen] = useState(false);
	const [isDismissed, setIsDismissed] = useState(true);

	useEffect(() => {
		const dismissedAt = getDismissedAt();
		if (!dismissedAt) {
			setIsDismissed(false);
			// Auto-open on first visit if not dismissed? Maybe too intrusive, let's keep it closed by default or open if very important.
			// Let's open it if it's the very first time (no dismissedAt record ever... actually we can't track 'ever' easily without another key)
			// For now, respect the logic: if not currently dismissed, show the bubble (but maybe not auto-open the popover).
			setIsOpen(true); // Let's try auto-opening it to be helpful like the reference
			return;
		}

		const now = Date.now();
		if (now - dismissedAt >= DISMISS_DURATION_MS) {
			clearDismissedAt();
			setIsDismissed(false);
			setIsOpen(true);
		} else {
			setIsDismissed(true);
		}
	}, []);

	const handleDismiss = (e?: React.MouseEvent) => {
		e?.stopPropagation();
		setDismissedAt(Date.now());
		setIsDismissed(true);
		setIsOpen(false);
	};

	const handleActionClick = () => {
		setIsOpen(false);
	};

	// Determine the active step (first incomplete step)
	const activeStepIndex = useMemo(() => {
		if (!data?.steps) return -1;
		return data.steps.findIndex((step) => !step.completed);
	}, [data?.steps]);

	// User-controllable opened step - initializes with active step
	const [openedStepIndex, setOpenedStepIndex] = useState<number | null>(null);

	// Sync openedStepIndex with activeStepIndex when it changes (e.g., on initial load)
	useEffect(() => {
		if (activeStepIndex !== -1 && openedStepIndex === null) {
			setOpenedStepIndex(activeStepIndex);
		}
	}, [activeStepIndex, openedStepIndex]);

	const handleStepClick = (index: number) => {
		setOpenedStepIndex((prev) => (prev === index ? null : index));
	};

	if (isLoading || isDismissed || data?.allCompleted) {
		return null;
	}

	const { completedCount, totalApplicable, percentComplete, steps } = data ?? {
		completedCount: 0,
		totalApplicable: 0,
		percentComplete: 0,
		steps: [],
	};

	return (
		<div className="fixed bottom-6 right-6 z-50 font-sans">
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
								<Sparkles className="h-6 w-6 animate-pulse-slow" />
								<span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white shadow-sm">
									{totalApplicable - completedCount}
								</span>
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
					<div className="p-5 pb-2 shrink-0">
						<div className="flex items-start justify-between mb-4">
							<div>
								<h3 className="text-lg font-bold text-foreground flex items-center gap-2">
									PRIMEIROS PASSOS
									<span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
										{completedCount} de {totalApplicable}
									</span>
								</h3>
								<p className="text-xs text-muted-foreground mt-1">Complete esses passos para aproveitar ao máximo.</p>
							</div>
							<div className="flex gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6 rounded-full hover:bg-secondary text-muted-foreground"
									onClick={() => setIsOpen(false)}
								>
									<ChevronDown className="h-4 w-4" />
								</Button>
								<Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-secondary text-muted-foreground" onClick={handleDismiss}>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</div>

						{/* Progress Bar */}
						<div className="relative pt-1 pb-2">
							<Progress
								value={percentComplete}
								className="h-2.5 bg-secondary rounded-full"
								indicatorClassName="bg-brand transition-all duration-700 ease-out"
							/>
						</div>
					</div>

					{/* Steps List */}
					<div className="flex flex-col gap-1 px-2 pb-4 flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
						{steps.map((step, index) => (
							<OnboardingQualityStep
								key={step.id}
								step={step}
								isActive={index === activeStepIndex}
								isOpened={index === openedStepIndex}
								onClick={() => handleStepClick(index)}
								onActionClick={handleActionClick}
							/>
						))}
					</div>
					<div className="w-full flex items-center justify-center bg-green-50 px-4 py-3">
						<a
							href="https://wa.me/5534996626855?text=Gostaria%20de%20receber%20suporte%20direto%20no%20WhatsApp."
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5"
						>
							<FaWhatsapp className="w-6 h-6 text-green-500" />
							<p className="text-sm text-black">Alguma dúvida? Receba suporte direto no WhatsApp.</p>
						</a>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
