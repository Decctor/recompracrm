"use client";

import {
	ArrowLeft,
	ArrowRight,
	Award,
	Banknote,
	Calendar,
	Clock,
	History,
	ShoppingBag,
	ShoppingCart,
	TrendingDown,
	TrendingUp,
	UserRound,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema/cashback-programs";

// --- Tipagens ---

type Transaction = {
	id: string;
	tipo: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO";
	status: "ATIVO" | "CONSUMIDO" | "EXPIRADO";
	valor: number;
	dataInsercao: Date;
	saldoValorPosterior: number;
};

type ClientProfileContentProps = {
	orgId: string;
	cashbackProgram: TCashbackProgramEntity;
	client: {
		id: string;
		nome: string;
		telefone: string;
		email: string | null;
		dataInsercao: Date | null;
		metadataTotalCompras: number | null;
		metadataValorTotalCompras: number | null;
		ultimaCompraData: Date | null;
	};
	balance: {
		saldoValorDisponivel: number;
		saldoValorAcumuladoTotal: number;
		saldoValorResgatadoTotal: number;
	};
	rankingPosition: number;
	transactions: Transaction[];
};

export default function ClientProfileContent({ orgId, cashbackProgram, client, balance, rankingPosition, transactions }: ClientProfileContentProps) {
	const router = useRouter();

	const allowAccumulation = cashbackProgram.acumuloPermitirViaPontoIntegracao;

	const clientHasNoAvailableBalance = balance.saldoValorDisponivel <= 0;

	const daysSinceCreation = client.dataInsercao
		? Math.floor((new Date().getTime() - new Date(client.dataInsercao).getTime()) / (1000 * 60 * 60 * 24))
		: 0;

	const daysSinceLastPurchase = client.ultimaCompraData
		? Math.floor((new Date().getTime() - new Date(client.ultimaCompraData).getTime()) / (1000 * 60 * 60 * 24))
		: null;

	const formatRecency = (days: number | null) => {
		if (days === null) return <span className="text-sm short:text-[0.5rem] text-muted-foreground font-bold italic">Nunca comprou</span>;
		if (days === 0) return "Hoje";
		if (days === 1) return "Ontem";
		if (days < 30) return `${days} dias`;
		if (days < 60) return "1 mês";
		if (days < 365) return `${Math.floor(days / 30)} meses`;
		if (days < 730) return "1 ano";
		return `${Math.floor(days / 365)} anos`;
	};

	return (
		<div className="h-full bg-slate-50 p-4 md:p-6 short:p-2 flex flex-col items-center overflow-hidden">
			<div className="w-full max-w-6xl flex flex-col gap-4 short:gap-2 h-full min-h-0">
				{/* 1. HEADER: Informações e Status */}
				<header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 short:gap-2 bg-white p-4 short:p-2.5 rounded-4xl short:rounded-2xl shadow-sm border border-slate-100 shrink-0">
					<div className="flex items-center gap-3 short:gap-1.5">
						<Button variant="ghost" size="fit" asChild className="rounded-full hover:bg-brand/10 flex items-center gap-1 px-2 py-2 short:px-1.5 short:py-1">
							<Link href={`/point-of-interaction/${orgId}`} className="flex items-center gap-1">
								<ArrowLeft className="w-5 h-5 short:w-3.5 short:h-3.5" />
								<span className="short:text-xs">VOLTAR</span>
							</Link>
						</Button>
						<div>
							<h1 className="text-xl short:text-base font-black text-black uppercase italic leading-none">{client.nome}</h1>
							<p className="text-xs short:text-[0.6rem] font-bold text-muted-foreground mt-0.5">{formatToPhone(client.telefone)}</p>
						</div>
					</div>

					{/* Badge de Saldo e Ranking em estilo "Pílula" */}
					<div className="flex items-center bg-brand/5 border-2 short:border border-brand/10 rounded-full px-6 short:px-3 py-2 short:py-1.5 gap-6 short:gap-3 shadow-inner">
						<div className="flex flex-col items-center border-r-2 short:border-r border-brand/10 pr-6 short:pr-3">
							<span className="text-[0.6rem] short:text-[0.5rem] font-black text-black uppercase tracking-widest">Saldo Disponível</span>
							<span className="text-xl short:text-base font-black text-brand">{formatToMoney(balance.saldoValorDisponivel)}</span>
						</div>
						<div className="flex flex-col items-center">
							<span className="text-[0.6rem] short:text-[0.5rem] font-black text-black uppercase tracking-widest">Ranking</span>
							<div className="flex items-center gap-1">
								<Award className="w-4 h-4 short:w-3 short:h-3 text-amber-500" />
								<span className="text-xl short:text-base font-black text-brand">#{rankingPosition}</span>
							</div>
						</div>
					</div>
				</header>

				{/* 2. BOTÃO CENTRAL: Ação de Nova Compra */}
				<Button
					onClick={() => router.push(`/point-of-interaction/${orgId}/new-sale?clientId=${client.id}`)}
					className="w-full h-16 short:h-10 rounded-2xl short:rounded-xl shadow-lg shadow-brand/20 group transition-all border-none bg-brand text-brand-foreground hover:bg-brand/90 shrink-0"
				>
					<div className="flex items-center gap-3 short:gap-2 text-left">
						<div className="bg-brand-foreground p-2 short:p-1.5 rounded-xl short:rounded-lg group-hover:scale-110 transition-transform">
							<ShoppingCart className="w-6 h-6 short:w-4 short:h-4 text-brand" />
						</div>
						<div>
							<span className="block text-xl short:text-sm font-black text-brand-foreground italic leading-none uppercase">Nova Compra</span>
							<span className="text-[0.65rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-widest short:hidden">
								Registre pontos e acumule cashback
							</span>
						</div>
					</div>
					<ArrowRight className="ml-auto mr-3 short:mr-1 w-6 h-6 short:w-4 short:h-4 text-brand-foreground opacity-50 group-hover:translate-x-2 transition-transform" />
				</Button>

				{/* Banner de saldo zerado */}
				{clientHasNoAvailableBalance && (
					<div className="mb-6 short:mb-2 p-5 short:p-2.5 bg-linear-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl short:rounded-xl shadow-sm shrink-0 relative overflow-hidden">
						{/* Decorative background circle */}
						<div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-200/20 rounded-full blur-2xl short:hidden" />

						<div className="flex items-center gap-4 short:gap-2 relative z-10">
							<div className="p-3 short:p-1.5 bg-white rounded-xl short:rounded-lg shadow-sm text-amber-500 shrink-0">
								<Wallet className="w-6 h-6 short:w-4 short:h-4" />
							</div>
							<div>
								<h4 className="text-base short:text-xs font-bold text-amber-900 leading-tight">Seu saldo ainda está decolando! 🚀</h4>
								<p className="text-sm short:text-[0.6rem] text-amber-700/80 mt-1 short:mt-0">
									Identifique-se em suas compras para acumular pontos e resgatar prêmios incríveis.
								</p>
							</div>
						</div>
					</div>
				)}

				{/* 3. GRID INFERIOR: Resgates e Histórico */}
				<div className="grid grid-cols-1 md:grid-cols-12 gap-4 short:gap-2 items-stretch flex-1 min-h-0">
					{/* Seção de Resumo (Lado Esquerdo) */}
					<section className="md:col-span-5 bg-white rounded-4xl short:rounded-2xl p-6 short:p-3 shadow-sm border border-slate-100 flex flex-col min-h-0 overflow-hidden">
						<div className="flex items-center gap-3 short:gap-1.5 mb-6 short:mb-2 shrink-0">
							<div className="p-2 short:p-1 bg-brand/5 rounded-lg short:rounded text-brand">
								<UserRound className="w-5 h-5 short:w-3.5 short:h-3.5" />
							</div>
							<h2 className="text-lg short:text-sm font-black text-black uppercase italic">SOBRE VOCÊ</h2>
						</div>

						<div className="grid grid-cols-2 gap-4 short:gap-1.5 overflow-y-auto overscroll-y-auto p-2 short:p-0.5 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
							{/* Card 1: Total Acumulado */}
							<div className="p-4 short:p-2 rounded-2xl short:rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1 short:gap-0">
								<div className="flex items-center gap-2 short:gap-1 mb-1 short:mb-0">
									<div className="p-1.5 short:p-1 rounded-md short:rounded bg-green-100 text-green-700">
										<TrendingUp className="w-3.5 h-3.5 short:w-2.5 short:h-2.5" />
									</div>
									<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-wider">Total Acumulado</span>
								</div>
								<span className="text-xl short:text-sm font-black text-green-700">{formatToMoney(balance.saldoValorAcumuladoTotal)}</span>
							</div>

							{/* Card 2: Total Resgatado */}
							<div className="p-4 short:p-2 rounded-2xl short:rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1 short:gap-0">
								<div className="flex items-center gap-2 short:gap-1 mb-1 short:mb-0">
									<div className="p-1.5 short:p-1 rounded-md short:rounded bg-orange-100 text-orange-700">
										<TrendingDown className="w-3.5 h-3.5 short:w-2.5 short:h-2.5" />
									</div>
									<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-wider">Total Utilizado</span>
								</div>
								<span className="text-xl short:text-sm font-black text-orange-700">{formatToMoney(balance.saldoValorResgatadoTotal)}</span>
							</div>

							{/* Card 3: Total Compras */}
							<div className="p-4 short:p-2 rounded-2xl short:rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1 short:gap-0">
								<div className="flex items-center gap-2 short:gap-1 mb-1 short:mb-0">
									<div className="p-1.5 short:p-1 rounded-md short:rounded bg-blue-100 text-blue-700">
										<ShoppingBag className="w-3.5 h-3.5 short:w-2.5 short:h-2.5" />
									</div>
									<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-wider">Total Compras</span>
								</div>
								<span className="text-xl short:text-sm font-black text-slate-800">{client.metadataTotalCompras ?? 0}</span>
							</div>

							{/* Card 4: Total Investido (LTV) */}
							<div className="p-4 short:p-2 rounded-2xl short:rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1 short:gap-0">
								<div className="flex items-center gap-2 short:gap-1 mb-1 short:mb-0">
									<div className="p-1.5 short:p-1 rounded-md short:rounded bg-emerald-100 text-emerald-700">
										<Banknote className="w-3.5 h-3.5 short:w-2.5 short:h-2.5" />
									</div>
									<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-wider">Total Investido</span>
								</div>
								<span className="text-xl short:text-sm font-black text-emerald-700">{formatToMoney(client.metadataValorTotalCompras ?? 0)}</span>
							</div>

							{/* Card 5: Última Compra (Recência) */}
							<div className="p-4 short:p-2 rounded-2xl short:rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1 short:gap-0">
								<div className="flex items-center gap-2 short:gap-1 mb-1 short:mb-0">
									<div className="p-1.5 short:p-1 rounded-md short:rounded bg-amber-100 text-amber-700">
										<Clock className="w-3.5 h-3.5 short:w-2.5 short:h-2.5" />
									</div>
									<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-wider">Última Compra</span>
								</div>
								<span className="text-xl short:text-sm font-black text-slate-800">{formatRecency(daysSinceLastPurchase)}</span>
							</div>

							{/* Card 6: Dias como membro */}
							<div className="p-4 short:p-2 rounded-2xl short:rounded-lg bg-slate-50 border border-slate-100 flex flex-col gap-1 short:gap-0">
								<div className="flex items-center gap-2 short:gap-1 mb-1 short:mb-0">
									<div className="p-1.5 short:p-1 rounded-md short:rounded bg-purple-100 text-purple-700">
										<Calendar className="w-3.5 h-3.5 short:w-2.5 short:h-2.5" />
									</div>
									<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground uppercase tracking-wider">Fidelidade</span>
								</div>
								<span className="text-xl short:text-sm font-black text-slate-800">
									{daysSinceCreation} <span className="text-xs short:text-[0.5rem] font-bold text-muted-foreground">dias</span>
								</span>
							</div>
						</div>

						<div className="mt-auto pt-6 short:pt-2 short:hidden">
							<div className="p-4 short:p-2 bg-brand/5 rounded-2xl short:rounded-lg border border-brand/10">
								<p className="text-xs short:text-[0.55rem] text-center font-medium text-muted-foreground leading-relaxed">
									Você já faz parte do programa há <span className="font-bold text-brand">{daysSinceCreation} dias</span> e já realizou{" "}
									<span className="font-bold text-brand">{client.metadataTotalCompras ?? 0} compras</span> conosco.
								</p>
							</div>
						</div>
					</section>

					{/* Seção de Histórico (Lado Direito) */}
					<section className="md:col-span-7 bg-card rounded-4xl short:rounded-2xl p-6 short:p-3 shadow-sm border border-brand/20 flex flex-col min-h-0 overflow-hidden">
						<div className="flex items-center justify-between mb-4 short:mb-2 shrink-0">
							<div className="flex items-center gap-3 short:gap-1.5">
								<div className="p-2 short:p-1 bg-brand/5 rounded-lg short:rounded text-muted-foreground">
									<History className="w-5 h-5 short:w-3.5 short:h-3.5" />
								</div>
								<h2 className="text-lg short:text-sm font-black text-black uppercase italic">Histórico</h2>
							</div>
						</div>

						<div className="flex flex-col gap-2 short:gap-1 overflow-y-auto overscroll-y-auto p-2 short:p-0.5 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex-1 min-h-0 pr-1">
							{transactions.length === 0 ? (
								<div className="flex flex-col items-center justify-center flex-1 text-muted-foreground italic font-bold short:text-sm">
									<History className="w-10 h-10 short:w-6 short:h-6 mb-3 short:mb-1 opacity-10" />
									Nenhuma movimentação recente.
								</div>
							) : (
								transactions.map((t) => (
									<div
										key={t.id}
										className="flex items-center justify-between p-3 short:p-2 rounded-xl short:rounded-lg border border-brand/20 bg-brand/5 hover:bg-brand/10 transition-colors shrink-0"
									>
										<div className="flex flex-col">
											<span
												className={cn(
													"text-[0.65rem] short:text-[0.55rem] font-black uppercase tracking-widest",
													t.tipo === "ACÚMULO" ? "text-green-600" : "text-red-500",
												)}
											>
												{t.tipo}
											</span>
											<span className="text-[0.6rem] short:text-[0.5rem] font-bold text-muted-foreground">{formatDateAsLocale(t.dataInsercao, true)}</span>
										</div>
										<div className="text-right">
											<p className={cn("text-lg short:text-sm font-black leading-none", t.tipo === "ACÚMULO" ? "text-green-600" : "text-red-500")}>
												{t.tipo === "ACÚMULO" ? "+" : "-"} {formatToMoney(t.valor)}
											</p>
											<p className="text-[0.55rem] short:text-[0.45rem] font-bold text-muted-foreground mt-0.5 uppercase">
												Saldo Final: {formatToMoney(t.saldoValorPosterior)}
											</p>
										</div>
									</div>
								))
							)}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
