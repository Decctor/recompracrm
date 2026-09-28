import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import { CircleCheck, CircleOff } from "lucide-react";

/**
 * `ativo` é o interruptor que todo catálogo de venda checa antes de qualquer outra coisa
 * (`isProductVisibleInChannel`): inativo, o produto some do PDV, das comandas, da loja e do iFood,
 * não importa se está vendável ou marcado como disponível em cada canal. Por isso o estado é um
 * botão com cor e ícone, e não mais um checkbox na pilha — e por isso o inativo sempre vem com a
 * explicação do que ele sobrepõe.
 */
type ProductActiveToggleProps = {
	ativo: boolean;
	onChange: (ativo: boolean) => void;
};

export function ProductActiveToggle({ ativo, onChange }: ProductActiveToggleProps) {
	const Icon = ativo ? CircleCheck : CircleOff;
	return (
		<button
			type="button"
			role="switch"
			aria-checked={ativo}
			title={ativo ? "Clique para inativar o produto" : "Clique para ativar o produto"}
			onClick={() => onChange(!ativo)}
			className={cn(
				"inline-flex h-9 w-fit items-center gap-2 rounded-full border px-4 text-xs font-bold tracking-tight",
				"transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
				"outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
				ativo
					? "border-success/30 bg-success-surface text-success-surface-foreground hover:border-success/60"
					: "border-border bg-muted text-foreground/70 hover:border-foreground/25 hover:text-foreground",
			)}
		>
			<Icon className="h-4 w-4 min-h-4 min-w-4" />
			{ativo ? "PRODUTO ATIVO" : "PRODUTO INATIVO"}
		</button>
	);
}

/** Linha curta sob o botão: o que o inativo significa, dita onde o usuário acabou de clicar. */
export function ProductInactiveHint({ className }: { className?: string }) {
	return (
		<p className={cn("max-w-md text-center text-xs text-muted-foreground text-pretty", className)}>
			Fora de <span className="font-semibold text-foreground">todos</span> os canais de venda — PDV, comandas, loja digital e iFood —, mesmo marcado
			como vendável e disponível em cada canal.
		</p>
	);
}

/**
 * Aviso na matriz de canais, que é onde a contradição aparece: as linhas dizem "disponível" e o
 * produto não é exibido em nenhuma delas. Em tom de aviso porque a configuração abaixo está sendo
 * sobreposta, não apenas descrita.
 */
export function ProductInactiveChannelsCallout() {
	return (
		<Callout.Root tone="warning">
			<Callout.Title>
				<CircleOff className="h-4 w-4 min-h-4 min-w-4" />
				PRODUTO INATIVO
			</Callout.Title>
			<Callout.Description>
				Nenhum canal abaixo exibe este produto enquanto ele estiver inativo. A disponibilidade de cada canal volta a valer quando o produto for ativado.
			</Callout.Description>
		</Callout.Root>
	);
}
