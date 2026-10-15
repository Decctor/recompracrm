import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { useFiscalPreview } from "@/lib/queries/fiscal-preview";
import Link from "next/link";
import { ProductFiscalProfileQuickMenu } from "@/components/Fiscal/ProductFiscalProfileQuickMenu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { resolveAutoEmissionException, type TAutoEmissionExceptions } from "@/lib/fiscal/auto-emission-policy";
import { useProductsMissingFiscalProfile } from "@/lib/queries/products";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import {
	Building2Icon,
	Check,
	ChevronDownIcon,
	CirclePauseIcon,
	FileCheck2Icon,
	LockIcon,
	type LucideIcon,
	ReceiptTextIcon,
	ShoppingBagIcon,
	TriangleAlertIcon,
	WandSparklesIcon,
	Wrench,
} from "lucide-react";
import { type ReactNode, useState } from "react";

type FiscalEmissionSectionProps = {
	preview: ReturnType<typeof useFiscalPreview>;
	onResolveClient: () => void;
	saleState: TUseSaleState;
	organizationAutoFiscalEmission: boolean;
	organizationAutoFiscalCapable: boolean;
	autoEmissionExceptions: TAutoEmissionExceptions;
	canEmitFiscal: boolean;
	// Habilita "Cadastrar agora" para itens sem perfil fiscal (exige fiscal.configurar).
	canConfigureFiscal?: boolean;
};

type TDocumentChoice = "AUTOMATICO" | "NFE" | "NFCE";

// NF-e é a nota de empresa para empresa; NFC-e é o cupom do consumidor final.
const DOCUMENT_CHOICES: { value: TDocumentChoice; label: string; icon: LucideIcon }[] = [
	{ value: "AUTOMATICO", label: "Automático", icon: WandSparklesIcon },
	{ value: "NFCE", label: "NFC-e", icon: ShoppingBagIcon },
	{ value: "NFE", label: "NF-e", icon: Building2Icon },
];

function getDocumentLabel(tipo: string) {
	return tipo === "NFE" ? "NF-e" : tipo === "NFCE" ? "NFC-e" : tipo;
}

export default function FiscalEmissionSection({
	preview,
	onResolveClient,
	saleState,
	organizationAutoFiscalEmission,
	organizationAutoFiscalCapable,
	autoEmissionExceptions,
	canEmitFiscal,
	canConfigureFiscal = false,
}: FiscalEmissionSectionProps) {
	// Sem capacidade fiscal configurada, não há emissão automática possível: oculta o controle.
	if (!organizationAutoFiscalCapable) return null;
	return (
		<FiscalEmissionSectionContent
			preview={preview}
			onResolveClient={onResolveClient}
			saleState={saleState}
			organizationAutoFiscalEmission={organizationAutoFiscalEmission}
			autoEmissionExceptions={autoEmissionExceptions}
			canEmitFiscal={canEmitFiscal}
			canConfigureFiscal={canConfigureFiscal}
		/>
	);
}

function FiscalEmissionSectionContent({
	preview,
	onResolveClient,
	saleState,
	organizationAutoFiscalEmission,
	autoEmissionExceptions,
	canEmitFiscal,
	canConfigureFiscal,
}: Omit<FiscalEmissionSectionProps, "organizationAutoFiscalCapable"> & { canConfigureFiscal: boolean }) {
	const [profileMenuProductId, setProfileMenuProductId] = useState<string | null>(null);

	// Mesma regra do servidor: exceções só valem quando a venda herda a preferência da organização.
	const exception = resolveAutoEmissionException({
		metodos: saleState.state.pagamentos.filter((payment) => payment.valor > 0).map((payment) => payment.metodo),
		excecoes: autoEmissionExceptions,
	});

	// null = herda a preferência da organização; boolean = decisão explícita desta venda.
	const efetivo = saleState.state.emissaoFiscalAutomatica ?? (organizationAutoFiscalEmission && !exception);
	const suprimidoPorExcecao = saleState.state.emissaoFiscalAutomatica == null && organizationAutoFiscalEmission && !!exception;

	const choice: TDocumentChoice = saleState.state.emissaoFiscalDocumento ?? "AUTOMATICO";
	const locked = !canEmitFiscal || preview.data?.podeAlterar === false || !!preview.data?.documentoExistente;
	const selectedOption = preview.data?.opcoes.find((option) => option.tipo === preview.data?.tipo);
	// Disponibilidade por modelo vem da prévia: credenciais, série e destinatário (NF-e exige cliente
	// vinculado com CPF/CNPJ válido e endereço completo). Sem os dois modelos possíveis não há escolha a
	// fazer e o seletor nem aparece; uma escolha explícita continua visível para poder ser desfeita.
	const isAvailable = (tipo: "NFE" | "NFCE") => !!preview.data?.opcoes.find((option) => option.tipo === tipo)?.disponivel;
	const showChooser = !locked && (choice !== "AUTOMATICO" || (isAvailable("NFE") && isAvailable("NFCE")));

	// Prevencao: com a emissao ligada, um item sem perfil fiscal e uma nota que vai falhar. Avisa
	// antes de confirmar e abre o cadastro daqui mesmo.
	const { missingProductIds } = useProductsMissingFiscalProfile({
		productIds: saleState.state.itens.map((item) => item.produtoId),
		enabled: efetivo,
	});
	const missingItems = saleState.state.itens.filter(
		(item, index, all) => missingProductIds.includes(item.produtoId) && all.findIndex((other) => other.produtoId === item.produtoId) === index,
	);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					<ReceiptTextIcon className="w-4 h-4 text-foreground" />
					<h3 className="font-bold text-xs tracking-wide">NOTA FISCAL</h3>
				</div>
				<div className="flex items-center gap-1.5">
					{efetivo && showChooser && preview.data ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="ghost" size="sm" className={cn("flex items-center gap-1.5 text-xs", preview.isFetching && "opacity-60")}>
										{(() => {
											const ResolvedIcon = preview.data.tipo === "NFE" ? Building2Icon : ShoppingBagIcon;
											return <ResolvedIcon className="w-4 h-4" />;
										})()}
										{getDocumentLabel(preview.data.tipo)}
										<ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									<DropdownMenuLabel>MODELO</DropdownMenuLabel>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									{DOCUMENT_CHOICES.map((option) => (
										<DropdownMenuItem
											key={option.value}
											disabled={option.value !== "AUTOMATICO" && !isAvailable(option.value)}
											onClick={() => saleState.setEmissaoFiscalDocumento(option.value === "AUTOMATICO" ? null : option.value)}
										>
											<div className="flex items-center gap-2 w-full justify-between">
												<div className="flex items-center gap-2">
													<option.icon className="w-4 h-4" />
													{option.label}
												</div>
												{option.value === choice ? <Check className="w-4 h-4" /> : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					<Switch
						aria-label="Emitir nota fiscal"
						checked={efetivo}
						disabled={locked}
						onCheckedChange={(checked) => saleState.setEmissaoFiscalAutomatica(checked)}
					/>
				</div>
			</div>

			{efetivo && preview.isError ? (
				<p role="status" className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
					<TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" />
					Não foi possível verificar a nota.
					<button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => void preview.refetch()}>
						Tentar novamente
					</button>
				</p>
			) : null}
			{efetivo && preview.data?.documentoExistente ? (
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<FileCheck2Icon className="size-3.5 shrink-0 text-success" />
					{getDocumentLabel(preview.data.documentoExistente.tipo)} já vinculada a esta venda.
				</p>
			) : null}
			{suprimidoPorExcecao ? (
				<p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
					<CirclePauseIcon className="mt-0.5 size-3.5 shrink-0" />
					Pausada pelos métodos de pagamento desta venda. Ative para emitir mesmo assim.
				</p>
			) : null}

			{efetivo && preview.data && !preview.data.documentoExistente && preview.data.problemas.length > 0 ? (
				<FiscalWarning
					title={preview.data.problemas.length === 1 ? preview.data.problemas[0] : `A ${getDocumentLabel(preview.data.tipo)} não pode ser emitida`}
				>
					{preview.data.problemas.length > 1 ? (
						<ul className="list-inside list-disc">
							{preview.data.problemas.map((problem) => (
								<li key={problem}>{problem}</li>
							))}
						</ul>
					) : null}
					{selectedOption?.problemasCliente.length || (canConfigureFiscal && selectedOption && !selectedOption.configurado) ? (
						<div className="flex flex-wrap gap-1.5">
							{selectedOption?.problemasCliente.length ? (
								<Button type="button" variant="outline" size="sm" onClick={onResolveClient}>
									{saleState.state.cliente ? "Completar cadastro do cliente" : "Vincular cliente"}
								</Button>
							) : null}
							{canConfigureFiscal && selectedOption && !selectedOption.configurado ? (
								<Button variant="outline" size="sm" asChild>
									<Link href="/dashboard/fiscal?view=configuration" target="_blank" rel="noreferrer">
										Abrir configuração fiscal
									</Link>
								</Button>
							) : null}
						</div>
					) : null}
				</FiscalWarning>
			) : null}

			{efetivo && missingItems.length > 0 ? (
				<FiscalWarning
					title={`${missingItems.length === 1 ? "1 item sem perfil fiscal" : `${missingItems.length} itens sem perfil fiscal`}. A nota vai falhar na emissão.`}
				>
					<p className="truncate">{missingItems.map((item) => item.nome).join(", ")}</p>
					{canConfigureFiscal ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="w-fit gap-1.5"
							onClick={() => setProfileMenuProductId(missingItems[0]?.produtoId ?? null)}
						>
							<Wrench className="size-3.5" />
							Cadastrar agora
						</Button>
					) : (
						<p>Peça a quem configura o fiscal para cadastrar os perfis, ou desligue a emissão desta venda.</p>
					)}
				</FiscalWarning>
			) : null}

			{!canEmitFiscal ? (
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<LockIcon className="size-3 shrink-0" />
					Segue a configuração da organização. Você não tem permissão para alterar.
				</p>
			) : null}

			{profileMenuProductId ? (
				<ProductFiscalProfileQuickMenu
					productId={profileMenuProductId}
					closeMenu={() => setProfileMenuProductId(null)}
					onSaved={() => {
						// Passa para o proximo item sem perfil, se houver.
						const next = missingItems.find((item) => item.produtoId !== profileMenuProductId);
						setProfileMenuProductId(next?.produtoId ?? null);
					}}
				/>
			) : null}
		</div>
	);
}

function FiscalWarning({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<div className="flex gap-2 rounded-lg bg-warning-surface px-2.5 py-2 text-xs text-warning-surface-foreground">
			<TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<p className="font-semibold leading-snug">{title}</p>
				{children}
			</div>
		</div>
	);
}
