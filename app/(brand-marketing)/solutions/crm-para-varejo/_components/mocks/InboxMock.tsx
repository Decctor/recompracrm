import { cn } from "@/lib/utils";
import {
	ArrowUp,
	LayoutGrid,
	Mic,
	PanelRightOpen,
	Paperclip,
	Plus,
	Search,
	SendHorizontal,
	SlidersHorizontal,
	Sparkles,
	UserRound,
	UserRoundPlus,
} from "lucide-react";

// Caixa de entrada do WhatsApp (app/dashboard/conversations), desenhada a 1120px: a ChatSidebar
// (visões Livres / Minhas / IA / Todas, busca, filtros rápidos e ChatInboxListItem) e a ChatThread
// com o cabeçalho, as bolhas (cliente em card, IA em muted com "Assistente IA") e a AiPresenceBar.
// A conversa mostra o que o agente de IA faz de fato: consulta o saldo de cashback e o catálogo.

const VIEWS = [
	{ label: "Livres", icon: UserRoundPlus },
	{ label: "Minhas", icon: UserRound },
	{ label: "IA", icon: Sparkles, active: true },
	{ label: "Todas", icon: LayoutGrid },
];

const QUICK = [
	{ label: "Tudo", active: true },
	{ label: "Não lidas", unread: 3 },
	{ label: "Aguardando resposta", count: 4 },
	{ label: "Janela aberta", count: 9 },
];

type TResponsible = "AGENTE" | "USUARIO" | "LIVRE";
type TChat = {
	name: string;
	time: string;
	preview: string;
	outgoing?: boolean;
	unread?: number;
	responsible: TResponsible;
	agent?: string;
	typing?: boolean;
	status: { label: string; dot: string };
	priority?: boolean;
	window: "aberta" | "expirando";
	selected?: boolean;
};

const CHATS: TChat[] = [
	{
		name: "Maria Silva",
		time: "14:32",
		preview: "Tem pote de pistache hoje?",
		unread: 1,
		responsible: "AGENTE",
		typing: true,
		status: { label: "Em atendimento", dot: "bg-[#171717]" },
		window: "aberta",
		selected: true,
	},
	{
		name: "Rafael Costa",
		time: "14:20",
		preview: "Perfeito, passo aí às 18h",
		responsible: "USUARIO",
		agent: "Ana Souza",
		status: { label: "Aguardando cliente", dot: "bg-[rgba(104,122,128,0.5)]" },
		window: "aberta",
	},
	{
		name: "Juliana Prado",
		time: "13:58",
		preview: "O meu pedido ainda não chegou",
		unread: 2,
		responsible: "LIVRE",
		status: { label: "Aberto", dot: "bg-[#24549c]" },
		priority: true,
		window: "expirando",
	},
	{
		name: "Carlos Mendes",
		time: "13:41",
		preview: "Seu cashback de R$ 9,20 vence amanhã",
		outgoing: true,
		responsible: "AGENTE",
		status: { label: "Resolvido", dot: "bg-[#16a34a]" },
		window: "aberta",
	},
	{
		name: "Beatriz Lima",
		time: "ontem",
		preview: "Obrigada! 😊",
		responsible: "USUARIO",
		agent: "Lucas Martins",
		status: { label: "Resolvido", dot: "bg-[#16a34a]" },
		window: "aberta",
	},
];

const WINDOW_DOT = { aberta: "bg-[rgba(104,122,128,0.4)]", expirando: "bg-[#24549c]" } as const;

function Responsible({ chat }: { chat: TChat }) {
	if (chat.responsible === "AGENTE") {
		return (
			<span className="flex min-w-0 items-center gap-1.5">
				<span className="flex size-5 flex-none items-center justify-center rounded-full bg-[rgba(23,23,23,0.1)] text-[#171717]">
					<Sparkles className="size-3" />
				</span>
				<span className="truncate text-[12px] font-medium">Com a IA</span>
				{chat.typing ? (
					<span className="flex items-center gap-0.5">
						{[0, 1, 2].map((dot) => (
							<span key={dot} className="size-1 rounded-full bg-[#171717] opacity-60" />
						))}
					</span>
				) : null}
			</span>
		);
	}
	if (chat.responsible === "USUARIO") {
		return (
			<span className="flex min-w-0 items-center gap-1.5">
				<span className="flex size-5 flex-none items-center justify-center rounded-full bg-[#f5f5f5] text-[9px] font-semibold">
					{chat.agent
						?.split(" ")
						.map((part) => part[0])
						.join("")}
				</span>
				<span className="truncate text-[12px] text-[#687a80]">{chat.agent}</span>
			</span>
		);
	}
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<span className="flex size-5 flex-none items-center justify-center rounded-full border border-dashed border-[rgba(104,122,128,0.4)] text-[#687a80]">
				<UserRound className="size-3 opacity-60" />
			</span>
			<span className="truncate text-[12px] italic text-[rgba(104,122,128,0.8)]">Sem responsável</span>
		</span>
	);
}

function Bubble({ from, author, children, time }: { from: "client" | "ai"; author?: string; children: React.ReactNode; time: string }) {
	const incoming = from === "client";
	return (
		<div className={cn("flex w-full flex-col gap-0.5", incoming ? "items-start" : "items-end")}>
			{author ? (
				<span className="flex items-center gap-1 px-1 text-[11px] font-semibold text-[#687a80]">
					{from === "ai" ? <Sparkles className="size-3" /> : null}
					{author}
				</span>
			) : null}
			<div
				className={cn(
					"max-w-[72%] rounded-2xl px-3 py-2 text-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
					incoming ? "rounded-tl-lg border border-[#e3e8ea] bg-white" : "rounded-tr-lg bg-[#f5f5f5]",
				)}
			>
				{children}
				<div className="mt-1 flex justify-end text-[11px] opacity-80">{time}</div>
			</div>
		</div>
	);
}

export function InboxMock() {
	return (
		<div className="flex h-[640px] overflow-hidden rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<aside className="flex w-[360px] flex-none flex-col border-r border-[#e3e8ea]">
				<div className="flex flex-col gap-2.5 border-b border-[#e3e8ea] px-4 pt-4 pb-3">
					<div className="flex items-baseline justify-between gap-3">
						<p className="text-[16px] font-semibold tracking-tight">Caixa de entrada</p>
						<span className="text-[11px] text-[#687a80]">23 conversas</span>
					</div>
					<div className="grid grid-cols-4 gap-0.5 rounded-xl bg-[#f5f5f5] p-0.5">
						{VIEWS.map((view) => (
							<span
								key={view.label}
								className={cn(
									"flex items-center justify-center gap-1.5 rounded-[10px] py-1.5 text-[12px] font-semibold",
									view.active ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]" : "text-[#687a80]",
								)}
							>
								<view.icon className={cn("size-3.5", view.active ? "text-[#171717]" : "text-[#687a80]")} />
								{view.label}
							</span>
						))}
					</div>
					<div className="flex items-center gap-2">
						<div className="relative flex h-8 flex-1 items-center rounded-md bg-[rgba(245,245,245,0.5)] pl-8 text-[12px] text-[rgba(104,122,128,0.7)]">
							<Search className="absolute left-2.5 size-3.5 text-[#687a80]" />
							Buscar nome, telefone ou mensagem
						</div>
						<span className="flex size-8 items-center justify-center rounded-md border border-[#e3e8ea]">
							<SlidersHorizontal className="size-3.5" />
						</span>
					</div>
					<div className="flex gap-1.5 overflow-hidden">
						{QUICK.map((filter) => (
							<span
								key={filter.label}
								className={cn(
									"inline-flex h-7 flex-none items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold",
									filter.active ? "border-[rgba(23,23,23,0.3)] bg-[rgba(23,23,23,0.1)] text-[#171717]" : "border-[#e3e8ea] text-[#687a80]",
								)}
							>
								{filter.label}
								{filter.unread ? (
									<span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#171717] px-1.5 text-[10px] font-semibold text-[#fafafa]">
										{filter.unread}
									</span>
								) : filter.count ? (
									<span className="opacity-70">{filter.count}</span>
								) : null}
							</span>
						))}
					</div>
				</div>
				<div className="flex flex-col">
					{CHATS.map((chat) => (
						<div
							key={chat.name}
							className={cn(
								"relative flex flex-col gap-1 border-b border-[rgba(227,232,234,0.6)] px-4 py-2.5",
								chat.selected && "bg-[rgba(245,245,245,0.7)]",
							)}
						>
							{chat.selected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[#171717]" /> : null}
							<div className="flex items-center gap-2">
								<span className={cn("min-w-0 flex-1 truncate text-[14px]", chat.unread ? "font-semibold" : "font-medium")}>{chat.name}</span>
								<span className={cn("size-1.5 flex-none rounded-full", WINDOW_DOT[chat.window])} />
								<span className={cn("text-[11px]", chat.unread ? "font-semibold" : "text-[#687a80]")}>{chat.time}</span>
							</div>
							<div className="flex items-center gap-2">
								<span
									className={cn("flex min-w-0 flex-1 items-center gap-1 truncate text-[12px]", chat.unread ? "text-[rgba(14,18,20,0.8)]" : "text-[#687a80]")}
								>
									{chat.outgoing ? <span className="flex-none font-medium text-[#687a80]">Você:</span> : null}
									<span className="truncate">{chat.preview}</span>
								</span>
								{chat.unread ? (
									<span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#171717] px-1.5 text-[10px] font-bold text-[#fafafa]">
										{chat.unread}
									</span>
								) : null}
							</div>
							<div className="flex items-center gap-2 pt-0.5">
								<Responsible chat={chat} />
								<span className="ml-auto flex flex-none items-center gap-1.5 text-[11px] text-[#687a80]">
									{chat.priority ? (
										<span className="inline-flex items-center gap-1 rounded-full border border-[rgba(36,84,156,0.4)] bg-[rgba(36,84,156,0.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#0e1214]">
											<ArrowUp className="size-3" />
											Alta
										</span>
									) : null}
									<span className="flex items-center gap-1">
										<span className={cn("size-1.5 rounded-full", chat.status.dot)} />
										{chat.status.label}
									</span>
								</span>
							</div>
						</div>
					))}
				</div>
			</aside>

			<section className="flex min-w-0 flex-1 flex-col bg-[#fafafa]">
				<header className="flex flex-col gap-0.5 border-b border-[#e3e8ea] bg-white px-4 py-2">
					<div className="flex items-center gap-2">
						<p className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">Maria Silva</p>
						<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#e3e8ea] px-2.5 text-[12px] font-medium">
							<Plus className="size-3.5" />
							Novo orçamento
						</span>
						<span className="inline-flex h-8 items-center rounded-md bg-[#171717] px-3 text-[12px] font-medium text-[#fafafa]">Assumir</span>
						<span className="flex size-8 items-center justify-center text-[#687a80]">
							<PanelRightOpen className="size-4" />
						</span>
					</div>
					<p className="flex items-center gap-x-1.5 text-[11px] text-[#687a80]">
						<span>(34) 98888-7777</span>
						<span>·</span>
						<span>Janela aberta</span>
						<span>·</span>
						<span className="flex items-center gap-1">
							<Sparkles className="size-3" />
							Com a IA
						</span>
					</p>
				</header>

				<div className="flex flex-1 flex-col justify-end gap-3 px-6 py-5">
					<Bubble from="client" author="Maria Silva" time="14:29">
						Oi! Quanto eu tenho de cashback?
					</Bubble>
					<Bubble from="ai" author="Assistente IA" time="14:29">
						Oi, Maria! Você tem R$ 22,00 de cashback, válido até 20/11. Dá para usar em qualquer compra na loja ou no cardápio digital.
					</Bubble>
					<Bubble from="client" time="14:32">
						Tem pote de pistache hoje?
					</Bubble>
				</div>

				<div className="flex items-center gap-2 border-t border-[#e3e8ea] bg-[rgba(23,23,23,0.05)] px-4 py-1.5 text-[11px]">
					<Sparkles className="size-3 flex-none text-[#171717]" />
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<span className="truncate">Assistente IA está escrevendo</span>
						<span className="flex items-center gap-0.5">
							{[0, 1, 2].map((dot) => (
								<span key={dot} className="size-1 rounded-full bg-[#171717] opacity-60" />
							))}
						</span>
					</span>
					<span className="text-[#687a80]">a resposta em andamento será descartada</span>
					<span className="inline-flex h-6 items-center rounded-md border border-[#e3e8ea] bg-white px-2 text-[11px] font-medium">Assumir agora</span>
				</div>
				<div className="flex items-center gap-2 border-t border-[#e3e8ea] bg-white px-3 py-2.5">
					<Paperclip className="size-4 text-[#687a80]" />
					<div className="flex h-9 flex-1 items-center rounded-md border border-[#e3e8ea] px-3 text-[14px] text-[#8a979c]">Digite uma mensagem...</div>
					<Mic className="size-4 text-[#687a80]" />
					<span className="flex size-9 items-center justify-center rounded-md bg-[#171717] text-[#fafafa]">
						<SendHorizontal className="size-4" />
					</span>
				</div>
			</section>
		</div>
	);
}
