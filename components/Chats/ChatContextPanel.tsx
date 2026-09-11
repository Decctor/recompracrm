"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MetaIcon, RecompraCRMIconColorful, WhatsappIcon } from "@/components/icons";
import { getWhatsappWindowDisplay } from "@/lib/chats/whatsapp-window-status";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";
import { useChatClientContext, type TChatMessagesPage } from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import { appRoutes } from "@/lib/navigation/routes";
import {
	Activity,
	ArrowDownLeft,
	ArrowUpRight,
	ChevronDown,
	ExternalLink,
	Gift,
	Headset,
	Mail,
	MapPin,
	Package,
	Repeat2,
	Smartphone,
	Sparkles,
	Tag,
	UserRound,
} from "lucide-react";
import { ChatAssignmentActions } from "./ChatAssignmentActions";
import { ChatQuotesBlock } from "./Quotes/ChatQuotesBlock";
import type { TQuotePermissions } from "./Quotes/config";

/**
 * Contexto lateral do atendimento.
 *
 * Três abas porque são três perguntas diferentes que quem atende faz, e misturá-las numa
 * coluna só obrigaria a rolar para achar qualquer uma:
 * "quem responde e em que estado?" / "quem é esse cliente?" / "como esta conversa anda?".
 *
 * A aba Cliente carrega sob demanda: a maioria dos atendimentos nunca a abre. Ao
 * abrir, os agregados comerciais são buscados em paralelo no servidor.
 */

type ChatContextPanelProps = {
	chatId: string;
	chat: TChatMessagesPage["chat"];
	currentUserId: string;
	quotePermissions: TQuotePermissions;
	/** Ausente quando a conversa não aceita mensagem agora (sem posse ou fora da janela de 24h). */
	onInsertQuoteInConversation?: (texto: string) => void;
	className?: string;
};

const RESPONSIBLE_LABELS = {
	USUARIO: "Responsável",
	AGENTE: "Automação",
	EXTERNO: "Atendido pelo telefone",
	NAO_ATRIBUIDO: "Sem responsável",
} as const;

const WINDOW_TONE = {
	aberta: "text-muted-foreground",
	gateway: "text-muted-foreground",
	expirando: "text-brand",
	expirada: "text-destructive",
} as const;

function formatRelative(date: Date | string | null | undefined) {
	if (!date) return "—";
	const value = new Date(date);
	const minutes = Math.floor((Date.now() - value.getTime()) / 60_000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `há ${minutes}min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `há ${hours}h`;
	return `há ${Math.floor(hours / 24)}d`;
}

/** Linha rótulo/valor. É a unidade de leitura do painel inteiro. */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3 py-1.5">
			<span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
			<span className="min-w-0 truncate text-right text-xs">{children}</span>
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{children}</h3>;
}

function getInitials(name: string) {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

function ConnectionIdentity({ type }: { type: TChatMessagesPage["chat"]["conexaoTipo"] }) {
	const isMeta = type !== "INTERNAL_GATEWAY";

	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="flex shrink-0 items-center -space-x-1.5">
				<span
					className={cn(
						"relative z-10 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background",
						isMeta ? "bg-[#0869E1] text-white" : "bg-[#24549C]",
					)}
				>
					{isMeta ? <MetaIcon className="h-3 w-3" /> : <RecompraCRMIconColorful className="h-3 w-3" />}
				</span>
				<span className="flex h-5 w-5 items-center justify-center rounded-full bg-whatsapp text-white ring-2 ring-background">
					<WhatsappIcon className="h-3 w-3 text-white" />
				</span>
			</span>
			<span>{isMeta ? "WhatsApp Business" : "Gateway interno"}</span>
		</span>
	);
}

function ProductThumbnail({ src, name }: { src: string | null; name: string }) {
	return (
		<Avatar className="size-9 shrink-0 rounded-md border border-border bg-muted">
			<AvatarImage src={src ?? undefined} alt={name} className="object-cover" />
			<AvatarFallback className="rounded-md">
				<Package className="size-4 text-muted-foreground" />
			</AvatarFallback>
		</Avatar>
	);
}

function CouponBenefit({ beneficioTipo, beneficioValor }: { beneficioTipo: string; beneficioValor: number | null }) {
	if (beneficioTipo === "DESCONTO_PERCENTUAL") return <>{beneficioValor ?? 0}% de desconto</>;
	if (beneficioTipo === "DESCONTO_FIXO") return <>{formatToMoney(beneficioValor ?? 0)} de desconto</>;
	if (beneficioTipo === "PRECO_FIXO") return <>Preço especial de {formatToMoney(beneficioValor ?? 0)}</>;
	if (beneficioTipo === "BRINDE") return <>Brinde disponível</>;
	return <>Oferta especial</>;
}

function AttendanceTab({ chatId, chat, currentUserId }: Pick<ChatContextPanelProps, "chatId" | "chat" | "currentUserId">) {
	const atendimento = chat.atendimentoAtivo;
	const janela = getWhatsappWindowDisplay({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao: chat.conexaoTipo });

	return (
		<div className="flex flex-col gap-4">
			<div>
				<SectionTitle>Ações</SectionTitle>
				<ChatAssignmentActions chatId={chatId} atendimento={atendimento} atendimentoIa={chat.atendimentoIa} currentUserId={currentUserId} />
			</div>

			<div className="border-t border-border pt-3">
				<SectionTitle>Atendimento</SectionTitle>
				<InfoRow label="Responsável">
					{atendimento?.responsavelTipo === "USUARIO" ? (
						<span className="inline-flex min-w-0 items-center gap-1.5">
							<Avatar size="sm" className="size-5">
								<AvatarImage
									src={atendimento.responsavelUsuario?.avatarUrl ?? undefined}
									alt={atendimento.responsavelUsuario?.nome ?? "Responsável pelo atendimento"}
								/>
								<AvatarFallback className="text-[9px] font-bold">{getInitials(atendimento.responsavelUsuario?.nome ?? "Atribuído")}</AvatarFallback>
							</Avatar>
							<span className="truncate">{atendimento.responsavelUsuario?.nome ?? "Atribuído"}</span>
						</span>
					) : (
						<span className="inline-flex items-center gap-1">
							{atendimento?.responsavelTipo === "AGENTE" && <Sparkles className="h-3 w-3" />}
							{atendimento?.responsavelTipo === "EXTERNO" && <Smartphone className="h-3 w-3" />}
							{RESPONSIBLE_LABELS[atendimento?.responsavelTipo ?? "NAO_ATRIBUIDO"]}
						</span>
					)}
				</InfoRow>
				<InfoRow label="Desde">{formatRelative(atendimento?.dataAtribuicao)}</InfoRow>
				{atendimento?.transferenciaMotivo && <InfoRow label="Motivo">{atendimento.transferenciaMotivo}</InfoRow>}
				{atendimento?.resumo && <div className="mt-1 rounded-lg bg-muted/60 p-2 text-xs leading-snug">{atendimento.resumo}</div>}
			</div>

			<div className="border-t border-border pt-3">
				<SectionTitle>Canal</SectionTitle>
				<InfoRow label="Conexão">
					<ConnectionIdentity type={chat.conexaoTipo} />
				</InfoRow>
				<InfoRow label="Janela">
					<span className={WINDOW_TONE[janela.variant]}>{janela.label}</span>
				</InfoRow>
				{janela.variant === "expirada" && (
					<p className="mt-1 text-[11px] leading-snug text-muted-foreground">
						A janela reabre quando o cliente responder. Até lá, só um template aprovado sai daqui.
					</p>
				)}
			</div>
		</div>
	);
}

function ClientTab({
	chatId,
	chat,
	quotePermissions,
	onInsertQuoteInConversation,
}: {
	chatId: string;
	chat: TChatMessagesPage["chat"];
	quotePermissions: TQuotePermissions;
	onInsertQuoteInConversation?: (texto: string) => void;
}) {
	const [showAllPurchases, setShowAllPurchases] = useState(false);
	const { data, isPending, isError, error } = useChatClientContext({ clienteId: chat.clienteId });

	if (isPending) return <p className="py-6 text-center text-xs text-muted-foreground">Carregando contexto do cliente...</p>;
	if (isError) return <p className="py-6 text-center text-xs text-destructive">{getErrorMessage(error)}</p>;

	const { cliente, historico, ultimasCompras, cashback, oportunidades, produtosPreferidos, cuponsDisponiveis } = data;
	const visiblePurchases = showAllPurchases ? ultimasCompras : ultimasCompras.slice(0, 3);
	const hasOpportunities = Boolean(oportunidades.produtoSugerido || oportunidades.produtoMaisComprado);

	return (
		<div className="flex flex-col gap-4">
			<div>
				<div className="flex items-start justify-between gap-2">
					<div className="flex min-w-0 flex-col">
						<span className="truncate text-sm font-bold">{cliente.nome}</span>
						{cliente.telefone && <span className="text-xs text-muted-foreground">{formatToPhone(cliente.telefone)}</span>}
					</div>
					{cliente.analiseRFMTitulo && (
						<span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
							{cliente.analiseRFMTitulo}
						</span>
					)}
				</div>
				<div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
					{cliente.email && (
						<span className="flex items-center gap-1.5 truncate">
							<Mail className="h-3 w-3 shrink-0" />
							{cliente.email}
						</span>
					)}
					{(cliente.localizacaoCidade || cliente.localizacaoEstado) && (
						<span className="flex items-center gap-1.5 truncate">
							<MapPin className="h-3 w-3 shrink-0" />
							{[cliente.localizacaoCidade, cliente.localizacaoEstado].filter(Boolean).join(" / ")}
						</span>
					)}
				</div>
				{cliente.tags.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-1">
						{cliente.tags.map((tag) => (
							<span
								key={tag.id}
								className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
								style={{ backgroundColor: tag.cor, color: tag.corForeground }}
							>
								<Tag className="size-2.5" />
								{tag.titulo}
							</span>
						))}
					</div>
				)}
			</div>

			{cliente.comunicacaoPausadaAte && new Date(cliente.comunicacaoPausadaAte) > new Date() && (
				<div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11px] leading-snug text-destructive">
					Comunicações pausadas até {formatDateAsLocale(cliente.comunicacaoPausadaAte)}.
				</div>
			)}

			{/* Antes das oportunidades: pendência acionável ganha de sugestão de cross-sell. Um orçamento
			    em aberto é dinheiro esperando resposta; o cross-sell é hipótese. */}
			<ChatQuotesBlock
				chatId={chatId}
				clientId={chat.clienteId}
				clientName={cliente.nome}
				permissions={quotePermissions}
				onInsertInConversation={onInsertQuoteInConversation}
			/>

			{hasOpportunities && (
				<div className="border-t border-border pt-3">
					<SectionTitle>Oportunidades agora</SectionTitle>
					<div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
						{oportunidades.produtoSugerido && (
							<div className="flex items-center gap-2 p-2.5">
								<ProductThumbnail src={oportunidades.produtoSugerido.imagemCapaUrl} name={oportunidades.produtoSugerido.nome} />
								<div className="min-w-0 flex-1">
									<span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-primary">
										<Sparkles className="size-3" />
										Cross-sell sugerido
									</span>
									<p className="truncate text-xs font-semibold">{oportunidades.produtoSugerido.nome}</p>
								</div>
							</div>
						)}
						{oportunidades.produtoMaisComprado && (
							<div className="flex items-center gap-2 p-2.5">
								<ProductThumbnail src={oportunidades.produtoMaisComprado.imagemCapaUrl} name={oportunidades.produtoMaisComprado.nome} />
								<div className="min-w-0 flex-1">
									<span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
										<Repeat2 className="size-3" />
										Boa opção de recompra
									</span>
									<p className="truncate text-xs font-semibold">{oportunidades.produtoMaisComprado.nome}</p>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{(cashback.saldoDisponivel > 0 || cuponsDisponiveis.length > 0) && (
				<div className="border-t border-border pt-3">
					<SectionTitle>Benefícios disponíveis</SectionTitle>
					{/* O âmbar é a cor de fidelidade do sistema; permanece reservado ao
					    crédito concreto que pode mudar a negociação deste atendimento. */}
					{cashback.saldoDisponivel > 0 && (
						<div className="mb-2 rounded-lg border border-brand/35 bg-brand/15 p-3">
							<span className="text-[11px] font-extrabold uppercase tracking-[0.08em]">Cashback</span>
							<p className="text-lg font-extrabold tabular-nums">{formatToMoney(cashback.saldoDisponivel)}</p>
							{cashback.expirandoEm30Dias > 0 && (
								<p className="mt-0.5 text-[10px] text-muted-foreground">{formatToMoney(cashback.expirandoEm30Dias)} expira nos próximos 30 dias</p>
							)}
						</div>
					)}
					{cuponsDisponiveis.length > 0 && (
						<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
							{cuponsDisponiveis.slice(0, 3).map((coupon) => (
								<li key={coupon.id} className="flex items-center gap-2 px-2.5 py-2">
									<Gift className="size-3.5 shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs font-semibold">{coupon.titulo}</p>
										<p className="text-[10px] text-muted-foreground">
											<CouponBenefit beneficioTipo={coupon.beneficioTipo} beneficioValor={coupon.beneficioValor} /> · {coupon.codigo}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			{produtosPreferidos.length > 0 && (
				<div className="border-t border-border pt-3">
					<SectionTitle>Produtos preferidos</SectionTitle>
					<ul className="flex flex-col">
						{produtosPreferidos.map((product) => (
							<li key={product.id} className="flex items-center gap-2 border-b border-border/60 py-2 last:border-0">
								<ProductThumbnail src={product.imagemCapaUrl} name={product.nome} />
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-semibold">{product.nome}</p>
									<p className="truncate text-[10px] text-muted-foreground">{product.grupo}</p>
								</div>
								<div className="shrink-0 text-right">
									<p className="text-xs font-bold tabular-nums">{product.quantidadeComprada} un.</p>
									<p className="text-[10px] text-muted-foreground tabular-nums">{formatToMoney(product.valorComprado)}</p>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="border-t border-border pt-3">
				<SectionTitle>Histórico</SectionTitle>
				<InfoRow label="Compras">
					<span className="tabular-nums">{historico.qtdeCompras}</span>
				</InfoRow>
				<InfoRow label="Total">
					<span className="tabular-nums">{formatToMoney(historico.valorTotalCompras)}</span>
				</InfoRow>
				<InfoRow label="Ticket médio">
					<span className="tabular-nums">{formatToMoney(historico.ticketMedio)}</span>
				</InfoRow>
				<InfoRow label="Última compra">{historico.ultimaCompraData ? formatDateAsLocale(historico.ultimaCompraData) : "—"}</InfoRow>
				{historico.intervaloMedioDias && <InfoRow label="Frequência">A cada {historico.intervaloMedioDias} dias</InfoRow>}
				{historico.proximaCompraEstimada && <InfoRow label="Próxima estimada">{formatDateAsLocale(historico.proximaCompraEstimada)}</InfoRow>}
			</div>

			{ultimasCompras.length > 0 && (
				<div className="border-t border-border pt-3">
					<SectionTitle>Últimas compras</SectionTitle>
					<ul className="flex flex-col gap-2">
						{visiblePurchases.map((compra) => (
							<li key={compra.id}>
								{/* Nova aba: quem abre a venda está no meio de um atendimento e
								    perder a conversa para navegar seria pior que o ganho. */}
								<a
									href={appRoutes.sales.details(compra.id)}
									target="_blank"
									rel="noopener noreferrer"
									className="flex flex-col gap-0.5 rounded-lg bg-muted/60 p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
								>
									<div className="flex items-baseline justify-between gap-2 text-xs">
										<span className="flex items-center gap-1 text-muted-foreground">
											{formatDateAsLocale(compra.dataVenda, true)}
											<ExternalLink className="h-3 w-3 shrink-0" />
											<span className="sr-only">Abrir venda em nova aba</span>
										</span>
										<span className="font-bold tabular-nums">{formatToMoney(compra.valorTotal)}</span>
									</div>
									<span className="truncate text-[11px] text-muted-foreground">{compra.itens.map((item) => item.produtoNome).join(", ") || "Sem itens"}</span>
								</a>
							</li>
						))}
					</ul>
					{ultimasCompras.length > 3 && (
						<Button
							type="button"
							variant="ghost"
							size="xs"
							className="mt-2 w-full text-muted-foreground"
							onClick={() => setShowAllPurchases((current) => !current)}
						>
							{showAllPurchases ? "Mostrar menos" : `Ver mais ${ultimasCompras.length - 3}`}
							<ChevronDown className={cn("size-3 transition-transform", showAllPurchases && "rotate-180")} />
						</Button>
					)}
				</div>
			)}

			{(cliente.anotacoes || cliente.canalAquisicao) && (
				<div className="border-t border-border pt-3">
					<SectionTitle>Contexto</SectionTitle>
					{cliente.canalAquisicao && <InfoRow label="Aquisição">{cliente.canalAquisicao}</InfoRow>}
					{cliente.anotacoes && <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">{cliente.anotacoes}</p>}
				</div>
			)}
		</div>
	);
}

function ActivityTab({ chat }: { chat: TChatMessagesPage["chat"] }) {
	const atendimento = chat.atendimentoAtivo;
	const primeiraResposta =
		atendimento?.dataUltimaEntradaCliente && atendimento?.dataPrimeiraResposta
			? Math.max(
					0,
					Math.round((new Date(atendimento.dataPrimeiraResposta).getTime() - new Date(atendimento.dataUltimaEntradaCliente).getTime()) / 60_000),
				)
			: null;

	return (
		<div className="flex flex-col gap-4">
			<div>
				<SectionTitle>Fluxo da conversa</SectionTitle>
				<InfoRow label="Não lidas">
					<span className="tabular-nums">{chat.mensagensNaoLidas ?? 0}</span>
				</InfoRow>
				<InfoRow label="Última entrada">
					<span className="inline-flex items-center gap-1">
						<ArrowDownLeft className="h-3 w-3 text-muted-foreground" />
						{formatRelative(chat.ultimaMensagemEntradaData)}
					</span>
				</InfoRow>
				<InfoRow label="Última saída">
					<span className="inline-flex items-center gap-1">
						<ArrowUpRight className="h-3 w-3 text-muted-foreground" />
						{formatRelative(chat.ultimaMensagemSaidaData)}
					</span>
				</InfoRow>
				<InfoRow label="Última leitura">{formatRelative(chat.ultimaLeituraData)}</InfoRow>
			</div>

			<div className="border-t border-border pt-3">
				<SectionTitle>Tempos do atendimento</SectionTitle>
				{/* Minutos até a primeira resposta é a métrica que o hub existe para melhorar;
				    o resto do painel é contexto, esta linha é resultado. */}
				<InfoRow label="1ª resposta">{primeiraResposta === null ? "—" : `${primeiraResposta} min`}</InfoRow>
				<InfoRow label="Última resposta">{formatRelative(atendimento?.dataUltimaResposta)}</InfoRow>
				<InfoRow label="Aberto em">{atendimento ? formatDateAsLocale(atendimento.dataAtribuicao, true) : "—"}</InfoRow>
				{atendimento?.dataResolucao && <InfoRow label="Resolvido em">{formatDateAsLocale(atendimento.dataResolucao, true)}</InfoRow>}
			</div>
		</div>
	);
}

export function ChatContextPanel({ chatId, chat, currentUserId, quotePermissions, onInsertQuoteInConversation, className }: ChatContextPanelProps) {
	return (
		<Tabs defaultValue="atendimento" className={cn("flex h-full min-h-0 flex-col", className)}>
			<div className="shrink-0 px-3 pt-3">
				<TabsList className="w-full">
					<TabsTrigger value="atendimento" className="gap-1 px-1.5 text-xs group-data-horizontal/tabs:flex-1">
						<Headset className="h-3.5 w-3.5" />
						Atendimento
					</TabsTrigger>
					<TabsTrigger value="cliente" className="gap-1 px-1.5 text-xs group-data-horizontal/tabs:flex-1">
						<UserRound className="h-3.5 w-3.5" />
						Cliente
					</TabsTrigger>
					<TabsTrigger value="atividade" className="gap-1 px-1.5 text-xs group-data-horizontal/tabs:flex-1">
						<Activity className="h-3.5 w-3.5" />
						Atividade
					</TabsTrigger>
				</TabsList>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
				<TabsContent value="atendimento" className="mt-0">
					<AttendanceTab chatId={chatId} chat={chat} currentUserId={currentUserId} />
				</TabsContent>
				<TabsContent value="cliente" className="mt-0">
					<ClientTab chatId={chatId} chat={chat} quotePermissions={quotePermissions} onInsertQuoteInConversation={onInsertQuoteInConversation} />
				</TabsContent>
				<TabsContent value="atividade" className="mt-0">
					<ActivityTab chat={chat} />
				</TabsContent>
			</div>
		</Tabs>
	);
}
