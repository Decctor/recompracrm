import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import { cn } from "@/lib/utils";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import type { TPaymentMethodEnum, TSqlViewsClientPhoneFieldEnum, TSqlViewsPaymentTranslationEnum } from "@/schemas/enums";
import type { TSaleIntegrationMetadata } from "@/schemas/sales";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import { AlertTriangle, Database, FileText } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Detalhe da origem de uma venda integrada, lido de `sales.integracaoMetadados`: o que o canal (ou
 * o ERP) disse da venda e não cabe nas colunas. Um renderizador por `canal`; canal sem renderizador
 * não tem detalhe (a pílula de integração segue sem hover).
 *
 * - `compact`: hover/popover da pílula na listagem — o essencial em poucas linhas.
 * - `full`: seção "Origem" da página da venda — tudo o que o registro guarda.
 */
type TSaleOriginVariant = "compact" | "full";

const CHANNELS_WITH_DETAILS = new Set(["IFOOD", "SQL_VIEWS", "PHIBO"]);

export function hasSaleOriginDetails(metadados: TSaleIntegrationMetadata | null | undefined): metadados is TSaleIntegrationMetadata {
	return !!metadados && CHANNELS_WITH_DETAILS.has(metadados.canal);
}

export function SaleOriginDetails({ metadados, variant }: { metadados: TSaleIntegrationMetadata; variant: TSaleOriginVariant }) {
	if (metadados.canal === "IFOOD") return <IfoodOriginDetails metadados={metadados} variant={variant} />;
	if (metadados.canal === "SQL_VIEWS" && metadados.sqlViews) return <SqlViewsOriginDetails metadados={metadados} variant={variant} />;
	if (metadados.canal === "PHIBO" && metadados.phibo) return <PhiboOriginDetails metadados={metadados} variant={variant} />;
	return null;
}

function paymentMethodLabel(metodo: string) {
	return PAYMENT_METHOD_LABELS[metodo as TPaymentMethodEnum] ?? metodo;
}

// ---------------------------------------------------------------------------------------------
// Blocos de layout
// ---------------------------------------------------------------------------------------------

function OriginHeader({
	icon,
	title,
	subtitle,
	variant,
	className,
}: {
	icon: ReactNode;
	title: string;
	subtitle?: string | null;
	variant: TSaleOriginVariant;
	className?: string;
}) {
	return (
		<div className={cn("flex items-center gap-2 border-b px-4 py-3", className)}>
			<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/70">{icon}</div>
			<div className="flex min-w-0 flex-col">
				{/* Na página da venda o título "Origem da venda" já é o da seção. */}
				{variant === "compact" ? <span className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Origem da venda</span> : null}
				<span className="truncate text-sm font-semibold leading-tight">{title}</span>
				{subtitle ? <span className="truncate text-[0.65rem] text-muted-foreground">{subtitle}</span> : null}
			</div>
		</div>
	);
}

function OriginGroup({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
			<div className="flex flex-col gap-1">{children}</div>
		</div>
	);
}

function OriginRow({ label, value, hint, tone }: { label: ReactNode; value?: ReactNode; hint?: ReactNode; tone?: "default" | "muted" }) {
	return (
		<div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
			<div className="flex min-w-0 flex-col">
				<span className={cn("truncate font-medium", tone === "muted" && "text-muted-foreground")}>{label}</span>
				{hint ? <span className="text-[0.65rem] text-muted-foreground">{hint}</span> : null}
			</div>
			{value !== undefined ? <span className="shrink-0 font-semibold tabular-nums">{value}</span> : null}
		</div>
	);
}

function OriginTag({ children, tone }: { children: ReactNode; tone: "positive" | "warning" | "neutral" }) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded px-1.5 py-0.5 text-[0.6rem] font-bold uppercase leading-none",
				tone === "positive" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
				tone === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
				tone === "neutral" && "bg-secondary text-foreground/70",
			)}
		>
			{children}
		</span>
	);
}

/** Na página da venda os grupos dividem duas colunas; avisos ocupam a linha inteira (`lg:col-span-2`). */
function OriginBody({ variant, children }: { variant: TSaleOriginVariant; children: ReactNode }) {
	return <div className={cn("flex flex-col gap-3 p-4", variant === "full" && "lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-4")}>{children}</div>;
}

// ---------------------------------------------------------------------------------------------
// iFood
// ---------------------------------------------------------------------------------------------

const IFOOD_DELIVERY_LABELS: Record<"LOJA" | "CANAL", string> = {
	LOJA: "Entrega própria",
	CANAL: "Entregador iFood",
};

function IfoodOriginDetails({ metadados, variant }: { metadados: TSaleIntegrationMetadata; variant: TSaleOriginVariant }) {
	const full = variant === "full";
	const pagamentos = metadados.pagamentos;
	const patrocinados = metadados.descontos.patrocinados.filter((desconto) => desconto.valor > 0);
	const taxas = metadados.taxasCanal.filter((taxa) => taxa.valor > 0);

	return (
		<div className="flex flex-col">
			<OriginHeader
				variant={variant}
				// Vermelho da marca iFood só no cabeçalho: o corpo segue os tokens do tema.
				className="border-[#EA1D2C]/15 bg-[#EA1D2C]/10"
				icon={<Image src={IfoodLogo} alt="" width={24} height={16} className="h-4 w-5 object-contain" />}
				title="iFood"
				subtitle={metadados.entrega.realizadaPor ? IFOOD_DELIVERY_LABELS[metadados.entrega.realizadaPor] : null}
			/>
			<OriginBody variant={variant}>
				{metadados.disputaAberta ? (
					<div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 lg:col-span-2 dark:text-amber-300">
						<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<span>
							Disputa aberta
							{metadados.disputaAberta.expiraEm ? ` — responder até ${formatDateAsLocale(metadados.disputaAberta.expiraEm, true)}` : ""}
						</span>
					</div>
				) : metadados.cancelamentoSolicitado ? (
					<div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 lg:col-span-2 dark:text-amber-300">
						<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<span>Cancelamento solicitado{metadados.cancelamentoSolicitado.motivo ? `: ${metadados.cancelamentoSolicitado.motivo}` : ""}</span>
					</div>
				) : null}

				{pagamentos && pagamentos.metodos.length > 0 ? (
					<OriginGroup title="Pagamentos">
						{pagamentos.metodos.map((pagamento, index) => (
							<OriginRow
								key={`${pagamento.metodo}-${index}`}
								label={
									<span className="inline-flex items-center gap-1.5">
										{paymentMethodLabel(pagamento.metodo)}
										<OriginTag tone={pagamento.pagoOnline ? "positive" : "warning"}>{pagamento.pagoOnline ? "Pago online" : "Cobrar"}</OriginTag>
									</span>
								}
								hint={
									[full ? pagamento.descricao : null, pagamento.trocoPara ? `Troco para ${formatToMoney(pagamento.trocoPara)}` : null]
										.filter(Boolean)
										.join(" · ") || undefined
								}
								value={formatToMoney(pagamento.valor)}
							/>
						))}
					</OriginGroup>
				) : null}

				<OriginGroup title="Entrega e descontos">
					<OriginRow
						label="Frete"
						hint={metadados.entrega.realizadaPor === "CANAL" ? "Cobrado pelo iFood, fora da nota" : undefined}
						value={formatToMoney(metadados.entrega.valorFrete)}
					/>
					{full && metadados.entrega.referencia ? <OriginRow label="Referência" hint={metadados.entrega.referencia} /> : null}
					{metadados.descontos.loja > 0 ? <OriginRow label="Desconto da loja" value={`-${formatToMoney(metadados.descontos.loja)}`} /> : null}
					{patrocinados.map((desconto) => (
						<OriginRow
							key={desconto.patrocinador}
							label={`Desconto ${desconto.patrocinador}`}
							hint="Bancado pelo patrocinador"
							value={formatToMoney(desconto.valor)}
						/>
					))}
				</OriginGroup>

				{taxas.length > 0 && full ? (
					<OriginGroup title="Taxas do canal">
						{taxas.map((taxa, index) => (
							<OriginRow key={`${taxa.tipo}-${index}`} label={taxa.tipo} tone="muted" value={formatToMoney(taxa.valor)} />
						))}
					</OriginGroup>
				) : null}

				{full && metadados.contatoTemporario ? (
					<OriginGroup title="Contato temporário">
						<OriginRow
							label={metadados.contatoTemporario.telefone ?? "Telefone do iFood"}
							hint={[
								`Localizador ${metadados.contatoTemporario.localizador}`,
								metadados.contatoTemporario.expiraEm ? `expira ${formatDateAsLocale(metadados.contatoTemporario.expiraEm, true)}` : null,
							]
								.filter(Boolean)
								.join(" · ")}
						/>
					</OriginGroup>
				) : null}
			</OriginBody>
		</div>
	);
}

// ---------------------------------------------------------------------------------------------
// ERP via views (SQL-VIEWS)
// ---------------------------------------------------------------------------------------------

const PHONE_FIELD_LABELS: Record<TSqlViewsClientPhoneFieldEnum, string> = {
	TELEFONE: "Telefone do cadastro",
	TELEFONE_SECUNDARIO: "Telefone secundário do cadastro",
	CLIENTE_TELEFONE: "Telefone da venda",
};

const TRANSLATION_LABELS: Record<TSqlViewsPaymentTranslationEnum, { label: string; tone: "positive" | "neutral" | "warning" }> = {
	MAPEAMENTO_INTEGRACAO: { label: "Mapeado", tone: "positive" },
	FONTE: { label: "Da fonte", tone: "neutral" },
	PADRAO_OUTRO: { label: "Sem tradução", tone: "warning" },
};

function SqlViewsOriginDetails({ metadados, variant }: { metadados: TSaleIntegrationMetadata; variant: TSaleOriginVariant }) {
	const sqlViews = metadados.sqlViews;
	if (!sqlViews) return null;
	const full = variant === "full";
	// `pagamentos.metodos` e `formasPagamento` saem da mesma lista da view, na mesma ordem.
	const valores = metadados.pagamentos?.metodos ?? [];
	const status =
		sqlViews.statusOriginal && sqlViews.statusOriginal !== sqlViews.statusCodigo
			? `${sqlViews.statusOriginal} → ${sqlViews.statusCodigo ?? "—"}`
			: sqlViews.statusCodigo;

	return (
		<div className="flex flex-col">
			<OriginHeader
				variant={variant}
				className="bg-secondary/60"
				icon={<Database className="h-4 w-4 text-foreground/70" />}
				title={sqlViews.sistema ?? "ERP (banco de dados)"}
				subtitle={[sqlViews.lojaId ? `Loja ${sqlViews.lojaId}` : null, full && sqlViews.contratoVersao ? `contrato ${sqlViews.contratoVersao}` : null]
					.filter(Boolean)
					.join(" · ")}
			/>
			<OriginBody variant={variant}>
				<OriginGroup title="Venda e cliente">
					<OriginRow label="Status no ERP" value={status ?? "—"} />
					<OriginRow
						label={sqlViews.clienteId ? `Cliente ${sqlViews.clienteId}` : "Sem cliente na venda"}
						hint={sqlViews.clienteId ? (sqlViews.telefoneCampo ? PHONE_FIELD_LABELS[sqlViews.telefoneCampo] : "Sem telefone aproveitável") : undefined}
					/>
				</OriginGroup>

				<OriginGroup title="Formas de pagamento">
					{sqlViews.formasPagamento === null ? (
						<OriginRow label="O ERP não informa pagamentos" hint="O cashback considera o total da venda" tone="muted" />
					) : sqlViews.formasPagamento.length === 0 ? (
						<OriginRow label="Nenhum pagamento na view" tone="muted" />
					) : (
						sqlViews.formasPagamento.map((forma, index) => {
							const translation = TRANSLATION_LABELS[forma.traducao];
							const valor = valores[index]?.valor;
							return (
								<OriginRow
									key={`${forma.original}-${index}`}
									label={
										<span className="inline-flex items-center gap-1.5">
											<span className="truncate">
												{forma.original ?? "—"} → {paymentMethodLabel(forma.metodo)}
											</span>
											<OriginTag tone={translation.tone}>{translation.label}</OriginTag>
										</span>
									}
									hint={full && valores[index]?.trocoPara ? `Troco para ${formatToMoney(valores[index].trocoPara ?? 0)}` : undefined}
									value={valor !== undefined ? formatToMoney(valor) : undefined}
								/>
							);
						})
					)}
				</OriginGroup>
			</OriginBody>
		</div>
	);
}

// ---------------------------------------------------------------------------------------------
// Phibo (histórico importado)
// ---------------------------------------------------------------------------------------------

function PhiboOriginDetails({ metadados, variant }: { metadados: TSaleIntegrationMetadata; variant: TSaleOriginVariant }) {
	const phibo = metadados.phibo;
	if (!phibo) return null;
	const full = variant === "full";

	return (
		<div className="flex flex-col">
			<OriginHeader
				variant={variant}
				className="bg-secondary/60"
				icon={<FileText className="h-4 w-4 text-foreground/70" />}
				title="Phibo"
				subtitle={`NFC-e ${phibo.nfeNumero}${full && phibo.cupomTrocaId ? ` · cupom de troca ${phibo.cupomTrocaId}` : ""}`}
			/>
			<OriginBody variant={variant}>
				<OriginGroup title="Formas de pagamento">
					{phibo.formasPagamento.length === 0 ? <OriginRow label="Nenhuma forma registrada" tone="muted" /> : null}
					{phibo.formasPagamento.map((forma, index) => (
						<OriginRow
							key={`${forma.descricao}-${index}`}
							label={forma.descricao}
							hint={full && forma.parcelas.length > 1 ? `${forma.parcelas.length} parcelas` : undefined}
							value={formatToMoney(forma.parcelas.reduce((total, parcela) => total + parcela.valorParcela, 0))}
						/>
					))}
				</OriginGroup>
			</OriginBody>
		</div>
	);
}
