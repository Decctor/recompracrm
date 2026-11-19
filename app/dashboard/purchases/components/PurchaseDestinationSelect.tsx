"use client";

import type { TGetPurchaseDestinationAccountsOutput } from "@/app/api/purchases/destination-accounts/route";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TAccountChartNatureEnum } from "@/schemas/enums";
import { ChevronDown, Package, Receipt } from "lucide-react";

export type TPurchaseDestinationAccounts = TGetPurchaseDestinationAccountsOutput["data"];

const STOCK_VALUE = "ESTOQUE";

const NATURE_GROUPS: { natureza: TAccountChartNatureEnum; label: string }[] = [
	{ natureza: "DESPESA", label: "Despesas" },
	{ natureza: "ATIVO", label: "Ativos (imobilizado)" },
	{ natureza: "CUSTO", label: "Custos" },
];

/** Nome do destino para exibir: "Estoque" quando o item entra no estoque, senão o nome da conta. */
export function getPurchaseDestinationLabel(contaContabilId: string | null | undefined, accounts: TPurchaseDestinationAccounts | undefined) {
	if (!contaContabilId || contaContabilId === accounts?.contaEstoqueId) return "Estoque";
	return accounts?.contas.find((account) => account.id === contaContabilId)?.nome ?? "Outra conta";
}

type PurchaseDestinationSelectProps = {
	/** Nulo = estoque (o padrão de compras da organização). */
	value: string | null | undefined;
	onChange: (contaContabilId: string | null) => void;
	accounts: TPurchaseDestinationAccounts | undefined;
	disabled?: boolean;
	/** Item recebido fora do estoque: só pode trocar entre contas próprias, nunca voltar ao estoque. */
	allowStock?: boolean;
	/** Texto do botão quando mais de um destino está em jogo (ex.: "Vários destinos" no topo da nota). */
	placeholder?: string;
	size?: "xs" | "sm";
	className?: string;
	/** Restringe as naturezas oferecidas (ex.: só custo e despesa para a perda de um cancelamento). */
	natures?: TAccountChartNatureEnum[];
};

/**
 * Escolhe para onde vai o custo de um item de compra. "Estoque" é o padrão: o item entra no saldo e
 * no custo médio. Qualquer outra conta tira o item do estoque e debita o custo direto nela
 * (manutenção, reforma, uso e consumo). Ver lib/purchase/destination.ts.
 */
export function PurchaseDestinationSelect({
	value,
	onChange,
	accounts,
	disabled,
	allowStock = true,
	placeholder,
	size = "xs",
	className,
	natures,
}: PurchaseDestinationSelectProps) {
	const entersStock = !value || value === accounts?.contaEstoqueId;
	const label = placeholder ?? getPurchaseDestinationLabel(value, accounts);
	const selectable = (accounts?.contas ?? []).filter((account) => account.id !== accounts?.contaEstoqueId);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={
					<Button
						type="button"
						variant="outline"
						size={size}
						className={cn("flex max-w-full min-w-0 items-center gap-1.5", !entersStock && !placeholder && "border-brand/40 bg-brand/5", className)}
						aria-label="Destino do custo"
					>
						{entersStock && !placeholder ? <Package className="h-3.5 w-3.5 shrink-0" /> : <Receipt className="h-3.5 w-3.5 shrink-0" />}
						<span className="truncate">{label}</span>
						<ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				<DropdownMenuRadioGroup
					value={placeholder ? undefined : entersStock ? STOCK_VALUE : (value ?? STOCK_VALUE)}
					onValueChange={(next) => onChange(next === STOCK_VALUE ? null : String(next))}
				>
					{allowStock ? (
						<>
							<DropdownMenuRadioItem value={STOCK_VALUE}>
								<span className="flex flex-col">
									<span>Estoque</span>
									<span className="text-[0.7rem] text-muted-foreground">Entra no saldo e no custo médio</span>
								</span>
							</DropdownMenuRadioItem>
							<DropdownMenuSeparator />
						</>
					) : null}
					{NATURE_GROUPS.filter((group) => !natures || natures.includes(group.natureza)).map((group) => {
						const options = selectable.filter((account) => account.natureza === group.natureza);
						if (options.length === 0) return null;
						return (
							<DropdownMenuGroup key={group.natureza}>
								<DropdownMenuLabel>{group.label}</DropdownMenuLabel>
								{options.map((account) => (
									<DropdownMenuRadioItem key={account.id} value={account.id}>
										{account.codigo ? <span className="text-muted-foreground tabular-nums">{account.codigo}</span> : null}
										{account.nome}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuGroup>
						);
					})}
					{selectable.length === 0 ? (
						<p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma conta de despesa ou ativo no plano de contas.</p>
					) : null}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
