import { useEffect, useRef, useState } from "react";

export function useDebounceMemo<T extends object>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const previousValueRef = useRef<T>(value);

	useEffect(() => {
		// Compare objects deeply
		const hasChanged = JSON.stringify(previousValueRef.current) !== JSON.stringify(value);

		if (hasChanged) {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			timeoutRef.current = setTimeout(() => {
				setDebouncedValue(value);
				previousValueRef.current = value;
			}, delay);
		}

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [value, delay]);

	return debouncedValue;
}
