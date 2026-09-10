import { cn } from "@/lib/utils";
import { getRFMConfigByLabel } from "@/utils/rfm";

// Pill do título RFM com as cores canônicas de utils/rfm.ts: o mesmo verde de "CLIENTES LEAIS"
// que o operador vê no módulo de clientes precisa aparecer aqui, ou o título vira só texto.
export default function RFMBadge({ titulo, className }: { titulo: string; className?: string }) {
	const config = getRFMConfigByLabel(titulo);
	return (
		<span
			className={cn(
				"shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase leading-none tracking-wide",
				config.backgroundCollor,
				config.textCollor,
				config.borderCollor,
				className,
			)}
		>
			{titulo}
		</span>
	);
}
