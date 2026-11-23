import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { registerSalesSessionMovement } from "@/lib/mutations/sales-sessions";
import { useSalesSessionById, useSalesSessionMovementOptions } from "@/lib/queries/sales-sessions";
import { cn } from "@/lib/utils";
import type { TSalesSessionMovementTypeEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, Landmark, Lock, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type RegisterMovementProps = {
	sessionId: string;
	closeModal: () => void;
	callbacks?: { onSuccess?: () => void };
};

type Direction = "SAIDA" | "SUPRIMENTO";

function OptionCard({
	active,
	onClick,
	icon: Icon,
	title,
	hint,
}: {
	active: boolean;
	onClick: () => void;
	icon: typeof Lock;
	title: string;
	hint: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
				active ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
			)}
		>
			<div className="flex items-center gap-1.5">
				<Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
				<span className="font-bold text-xs tracking-wide">{title}</span>
			</div>
			<span className="text-[11px] text-muted-foreground">{hint}</span>
		</button>
	);
}

function AccountOption({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint?: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
				active ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
			)}
		>
			<span className="flex min-w-0 items-center gap-2">
				<Landmark className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-semibold text-xs">{title}</span>
					{hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
				</span>
			</span>
			<span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border", active ? "border-4 border-primary" : "border-border")} aria-hidden />
		</button>
	);
}

const ACCOUNT_TYPE_HINT: Record<string, string> = {
	CAIXA: "Conta do tipo caixa",
	BANCO: "Depósito no banco",
	CARTEIRA_DIGITAL: "Carteira digital",
	INVESTIMENTO: "Investimento",
	OUTRO: "Outra conta",
};

export default function RegisterMovement({ sessionId, closeModal, callbacks }: RegisterMovementProps) {
	const queryClient = useQueryClient();
	const { data: options, isLoading: optionsLoading, isError: optionsError, error } = useSalesSessionMovementOptions({ sessionId });
	const { data: session } = useSalesSessionById({ sessionId });

	const [direction, setDirection] = useState<Direction>("SAIDA");
	const [outflowKind, setOutflowKind] = useState<"SANGRIA" | "DESPESA">("SANGRIA");
	// undefined = ainda não escolhido (usa a primeira conta); null = escolheu não informar.
	const [contaFinanceiraId, setContaFinanceiraId] = useState<string | null | undefined>(undefined);
	const [categoriaContaId, setCategoriaContaId] = useState<string | null>(null);
	const [valor, setValor] = useState<number>(0);
	const [observacoes, setObservacoes] = useState<string>("");

	const tipo: TSalesSessionMovementTypeEnum = direction === "SUPRIMENTO" ? "SUPRIMENTO" : outflowKind;
	const contas = options?.contas ?? [];
	const categorias = options?.categoriasDespesa ?? [];
	// Sangria leva a primeira conta por padrão (o destino é o que torna a sangria rastreável);
	// suprimento começa sem origem, porque o troco muitas vezes vem do bolso do dono.
	const selectedAccountId = contaFinanceiraId === undefined ? (tipo === "SANGRIA" ? (contas[0]?.id ?? null) : null) : contaFinanceiraId;

	const esperadoAgora = session?.resumoEsperado.find((linha) => linha.metodo === "DINHEIRO")?.valorEsperado ?? null;
	const esperadoDepois =
		esperadoAgora === null ? null : (Math.round(esperadoAgora * 100) + (tipo === "SUPRIMENTO" ? 1 : -1) * Math.round(valor * 100)) / 100;

	const { mutate, isPending } = useMutation({
		mutationKey: ["register-sales-session-movement", sessionId],
		mutationFn: registerSalesSessionMovement,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["sales-session-by-id", sessionId] });
			queryClient.invalidateQueries({ queryKey: ["open-sales-sessions"] });
			callbacks?.onSuccess?.();
			closeModal();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	function handleSubmit() {
		if (valor <= 0) return toast.error("Informe um valor maior que zero.");
		if (tipo === "DESPESA" && !categoriaContaId) return toast.error("Escolha a categoria da despesa.");
		mutate({
			sessaoVendaId: sessionId,
			tipo,
			valor,
			observacoes: observacoes || null,
			contaFinanceiraId: tipo === "DESPESA" ? null : selectedAccountId,
			categoriaContaId: tipo === "DESPESA" ? categoriaContaId : null,
		});
	}

	function changeDirection(next: Direction) {
		setDirection(next);
		setContaFinanceiraId(undefined);
	}

	return (
		<ResponsiveMenu
			menuTitle="MOVIMENTO DE CAIXA"
			menuDescription="Registre dinheiro que sai ou entra na gaveta fora de uma venda."
			menuActionButtonText="REGISTRAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={optionsLoading}
			stateError={optionsError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="sm"
		>
			<div className="flex w-full flex-col gap-4">
				<div className="grid grid-cols-2 gap-2">
					<OptionCard
						active={direction === "SAIDA"}
						onClick={() => changeDirection("SAIDA")}
						icon={ArrowUpRight}
						title="SAÍDA"
						hint="Tira dinheiro da gaveta"
					/>
					<OptionCard
						active={direction === "SUPRIMENTO"}
						onClick={() => changeDirection("SUPRIMENTO")}
						icon={ArrowDownLeft}
						title="SUPRIMENTO"
						hint="Põe troco na gaveta"
					/>
				</div>

				{direction === "SAIDA" ? (
					<div className="flex flex-col gap-2">
						<span className="font-semibold text-xs">PARA QUE É ESSE DINHEIRO?</span>
						<div className="grid grid-cols-2 gap-2">
							<OptionCard
								active={outflowKind === "SANGRIA"}
								onClick={() => setOutflowKind("SANGRIA")}
								icon={Lock}
								title="SANGRIA"
								hint="Guardar no cofre ou levar ao banco"
							/>
							<OptionCard
								active={outflowKind === "DESPESA"}
								onClick={() => setOutflowKind("DESPESA")}
								icon={Receipt}
								title="DESPESA"
								hint="Pagar entrega, compra, fornecedor"
							/>
						</div>
					</div>
				) : null}

				{tipo === "DESPESA" ? (
					<div className="flex flex-col gap-1.5">
						<SelectInput
							label="CATEGORIA DA DESPESA"
							value={categoriaContaId}
							resetOptionLabel="Escolha a categoria"
							options={categorias.map((categoria) => ({
								id: categoria.id,
								value: categoria.id,
								label: categoria.codigo ? `${categoria.codigo} · ${categoria.nome}` : categoria.nome,
							}))}
							handleChange={(value) => setCategoriaContaId(value)}
							onReset={() => setCategoriaContaId(null)}
						/>
						<span className="text-[11px] text-muted-foreground">
							{categorias.length === 0
								? "Nenhuma categoria de despesa no plano de contas. Cadastre uma no Financeiro para registrar despesas pelo caixa."
								: "Entra no Financeiro como despesa paga em dinheiro, nesta categoria."}
						</span>
					</div>
				) : contas.length > 0 ? (
					<div className="flex flex-col gap-1.5">
						<span className="text-[11px] text-muted-foreground">{tipo === "SANGRIA" ? "Vai para" : "Vem de"}</span>
						{contas.map((conta) => (
							<AccountOption
								key={conta.id}
								active={selectedAccountId === conta.id}
								onClick={() => setContaFinanceiraId(conta.id)}
								title={conta.nome}
								hint={ACCOUNT_TYPE_HINT[conta.tipo]}
							/>
						))}
						<AccountOption
							active={selectedAccountId === null}
							onClick={() => setContaFinanceiraId(null)}
							title={tipo === "SANGRIA" ? "Não informar o destino" : "Não informar a origem"}
							hint={tipo === "SANGRIA" ? "O dinheiro sai do caixa sem entrar em outra conta" : "Ex.: troco trazido pelo dono"}
						/>
					</div>
				) : null}

				<NumberInput label="VALOR" value={valor} handleChange={(value) => setValor(value)} placeholder="0,00" />

				{esperadoAgora !== null ? (
					<div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
						<span className="text-muted-foreground">Gaveta esperada</span>
						<span className="flex items-center gap-1.5 font-semibold tabular-nums">
							{formatToMoney(esperadoAgora)}
							<ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
							<span className={cn(esperadoDepois !== null && esperadoDepois < 0 && "text-destructive")}>{formatToMoney(esperadoDepois ?? 0)}</span>
						</span>
					</div>
				) : null}

				{options && !options.contaGaveta ? (
					<div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-surface p-2.5">
						<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-surface-foreground" aria-hidden />
						<p className="text-[11px] leading-relaxed text-foreground/80">
							Este caixa não tem conta financeira e o dinheiro não tem conta padrão: o movimento entra na gaveta, mas não aparece no saldo do Financeiro.
						</p>
					</div>
				) : null}

				<TextareaInput
					label="OBSERVAÇÕES DO MOVIMENTO"
					value={observacoes}
					handleChange={(value) => setObservacoes(value)}
					placeholder={tipo === "DESPESA" ? "Ex.: motoboy do sábado" : "Observações do movimento (opcional)..."}
				/>
			</div>
		</ResponsiveMenu>
	);
}
