import { cn } from "@/lib/utils";

/**
 * Três pontos pulsando, como a bolha de "digitando…" do WhatsApp. Compartilhado entre a thread
 * do hub (IA respondendo) e o playground do agente.
 */
export function TypingIndicator({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden>
			{[0, 1, 2].map((index) => (
				<span
					key={index}
					className="h-1.5 w-1.5 rounded-full bg-current opacity-40 motion-safe:animate-bounce"
					style={{ animationDelay: `${index * 150}ms`, animationDuration: "900ms" }}
				/>
			))}
		</span>
	);
}
