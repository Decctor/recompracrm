import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";

// Rodapé fixo do checkout: o valor da venda e a ação de cobrar são a mesma intenção, separados só
// por hierarquia. O total vive aqui (e não mais como clímax do Resumo) porque a coluna rola e o
// número saía de vista justamente na hora de falar o valor para o cliente no balcão.
//
// Layout horizontal (valor à esquerda, CTA à direita) e não empilhado: o PDV roda em monitores
// pequenos, e cada pixel gasto aqui é pixel roubado da lista de itens logo acima.
type TotalDockProps = {
	saleState: TUseSaleState;
	onFinalizeSale: () => void;
	isFinalizingSale?: boolean;
	isCreatingDraft?: boolean;
	// Modo edição: CTA de salvar (não existe "orçamento" para uma venda confirmada).
	editMode?: boolean;
	// Bloqueio externo ao estado do carrinho (caixa fechado, preços defasados). O texto aparece sob o
	// CTA: um botão desabilitado sem motivo faz o operador procurar o problema no lugar errado.
	finalizeBlockedReason?: string | null;
	// Checkout de um rascunho que já existe: o verbo é confirmar, não finalizar.
	hideDraftAction?: boolean;
	// Coluna em foco no desktop (640px): há espaço para o número crescer sem empurrar o CTA.
	expanded?: boolean;
};

function getActionLabel({ editMode, hideDraftAction, isFinalizingSale }: Pick<TotalDockProps, "editMode" | "hideDraftAction" | "isFinalizingSale">) {
	if (editMode) return isFinalizingSale ? "SALVANDO..." : "SALVAR ALTERAÇÕES";
	if (hideDraftAction) return isFinalizingSale ? "CONFIRMANDO..." : "CONFIRMAR VENDA";
	return isFinalizingSale ? "FINALIZANDO..." : "FINALIZAR VENDA";
}

export default function TotalDock({
	saleState,
	onFinalizeSale,
	isFinalizingSale,
	isCreatingDraft,
	editMode,
	finalizeBlockedReason,
	hideDraftAction,
	expanded,
}: TotalDockProps) {
	const finalizeDisabled = !saleState.isReadyForFinalize || isFinalizingSale || !!finalizeBlockedReason || (!editMode && !!isCreatingDraft);
	// Carrinho vazio esmaece o número, nunca esconde o dock: a altura da coluna não pode saltar
	// quando o operador bipa o primeiro item.
	const isEmpty = saleState.itemCount === 0 && !saleState.state.recompensaResgate;

	const jaRecebido = saleState.state.pagamentosEfetivadosTotal;
	// Restante só aparece quando diz algo que o total já não diz: sem nenhum pagamento lançado ele é
	// o próprio total, e repetir o mesmo número a dois centímetros de distância é o que diluía a
	// hierarquia do Resumo.
	const showRestante = saleState.troco <= 0 && saleState.valorRestante > 0.01 && Math.abs(saleState.valorRestante - saleState.valorFinal) > 0.01;

	// Linha única e rasa, acima do par valor/CTA: empilhar cada uma sob o número devolveria ao dock a
	// altura que o layout horizontal existe para economizar.
	const secondaryLines: { key: string; label: string; value: string; className: string }[] = [];
	if (jaRecebido > 0) {
		secondaryLines.push({
			key: "recebido",
			label: "JÁ RECEBIDO",
			value: `-${formatToMoney(jaRecebido)}`,
			className: "text-green-700 dark:text-green-400",
		});
	}
	if (saleState.troco > 0) {
		secondaryLines.push({ key: "troco", label: "TROCO", value: formatToMoney(saleState.troco), className: "text-amber-600 dark:text-amber-400" });
	} else if (showRestante) {
		secondaryLines.push({ key: "restante", label: "RESTANTE", value: formatToMoney(saleState.valorRestante), className: "text-muted-foreground" });
	}

	return (
		<div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_20px_-14px_rgb(0_0_0/0.45)]">
			{secondaryLines.length > 0 ? (
				<div className="flex flex-wrap items-center gap-x-3 text-[11px] font-semibold leading-none tabular-nums">
					{secondaryLines.map((line) => (
						<span key={line.key} className={line.className}>
							{line.label} {line.value}
						</span>
					))}
				</div>
			) : null}

			{/* flex-wrap + min-w-fit no CTA: em valores de seis dígitos o par não cabe na coluna
			    recolhida (420px), e o botão desce sozinho para uma segunda linha em vez de espremer o número. */}
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				{/* Rótulo e valor na mesma linha de base, e não empilhados: colapsa a coluna esquerda para
				    uma linha só e deixa a altura do dock ser ditada pelo botão. */}
				<div className="flex items-baseline gap-1.5">
					<span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Total</span>
					{/* text-xl é um passo acima do maior tipo do painel (o `text-lg` do cabeçalho): o número
					    fica sendo o maior elemento da superfície sem sair da escala do resto. O peso `black`
					    e o isolamento no dock carregam a ênfase que o tamanho sozinho não precisa carregar.
					    Com a coluna expandida (foco do checkout) o número sobe para 26px — é a hora de falar
					    o valor para o cliente — e a transição de font-size acompanha a de largura da coluna.
					    tabular-nums porque o valor muda a cada tecla nos inputs de desconto e acréscimo, e
					    dígitos de largura variável fazem o número inteiro tremer enquanto o operador digita. */}
					<span
						className={cn(
							"font-black tracking-tight tabular-nums transition-[font-size] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
							expanded ? "text-[26px]" : "text-xl",
							isEmpty ? "text-muted-foreground" : "text-foreground",
						)}
					>
						{formatToMoney(saleState.valorFinal)}
					</span>
				</div>

				<Button className={cn("min-w-fit flex-1", finalizeDisabled && "opacity-50")} onClick={onFinalizeSale} disabled={finalizeDisabled}>
					{getActionLabel({ editMode, hideDraftAction, isFinalizingSale })}
				</Button>
			</div>

			{finalizeBlockedReason ? <p className="text-[11px] leading-tight text-muted-foreground">{finalizeBlockedReason}</p> : null}
		</div>
	);
}
