/** Rótulo de seção dentro dos modais de caixa. É um heading para quem navega por leitor de tela. */
export function SessionSectionLabel({ children }: { children: string }) {
	return <h3 className="font-bold text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>;
}
