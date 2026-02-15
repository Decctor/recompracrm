import { useCallback, useEffect, useState } from "react";

const DEFAULT_COUNTDOWN_SECONDS = 3;

type UseAutoAdvanceTimerOptions = {
	shouldStart: boolean;
	countdownSeconds?: number;
	onAdvance: () => void;
};

export function useAutoAdvanceTimer({ shouldStart, countdownSeconds = DEFAULT_COUNTDOWN_SECONDS, onAdvance }: UseAutoAdvanceTimerOptions) {
	const [countdown, setCountdown] = useState<number | null>(null);
	const [isAdvancing, setIsAdvancing] = useState(false);
	const [wasCancelled, setWasCancelled] = useState(false);

	// Start countdown when conditions are met
	useEffect(() => {
		if (shouldStart && countdown === null && !isAdvancing && !wasCancelled) {
			setCountdown(countdownSeconds);
		}
	}, [shouldStart, countdown, isAdvancing, wasCancelled, countdownSeconds]);

	// Handle countdown timer and auto-advance
	useEffect(() => {
		if (countdown === null || countdown < 0) return;

		if (countdown === 0) {
			setIsAdvancing(true);
			onAdvance();
			return;
		}

		const timer = setTimeout(() => {
			setCountdown((prev) => (prev !== null ? prev - 1 : null));
		}, 1000);

		return () => clearTimeout(timer);
	}, [countdown, onAdvance]);

	const cancel = useCallback(() => {
		setCountdown(null);
		setIsAdvancing(false);
		setWasCancelled(true);
	}, []);

	const resetCancellation = useCallback(() => {
		setWasCancelled(false);
	}, []);

	return {
		countdown,
		countdownSeconds,
		isAdvancing,
		wasCancelled,
		cancel,
		resetCancellation,
	};
}
