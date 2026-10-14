"use client";

import type { TGetPublicTabOrderSessionOutput } from "@/app/api/public/tab-order-requests/route";
import { formatToMoney } from "@/lib/formatting";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Clock3, ReceiptText } from "lucide-react";
import { PublicOrderMenu, type TPublicMenuProduct } from "./PublicOrderMenu";
import { usePublicOrderingDeviceKey } from "./use-public-ordering-device-key";

async function fetchDeviceSession({ token, deviceKey }: { token: string; deviceKey: string }) {
	const searchParams = new URLSearchParams({ token, deviceKey });
	const { data } = await axios.get<TGetPublicTabOrderSessionOutput>(`/api/public/tab-order-requests?${searchParams.toString()}`);
	return data.data;
}

type PublicServicePointExperienceProps = {
	token: string;
	products: TPublicMenuProduct[];
	/** A operacao identifica contas por codigo de comanda — em "Somente mesas" a mesa ja e a conta. */
	asksTabCode: boolean;
};

export function PublicServicePointExperience({ token, products, asksTabCode }: PublicServicePointExperienceProps) {
	const deviceKey = usePublicOrderingDeviceKey();
	const sessionQuery = useQuery({
		queryKey: ["public-tab-device-session", token, deviceKey],
		queryFn: () => fetchDeviceSession({ token, deviceKey: deviceKey as string }),
		enabled: Boolean(deviceKey),
		refetchInterval: 10_000,
		refetchIntervalInBackground: false,
	});
	const session = sessionQuery.data;

	return (
		<>
			{session && (session.tab || session.requests.length > 0) ? <DeviceAccountSection session={session} /> : null}
			<PublicOrderMenu
				token={token}
				context="PONTO"
				products={products}
				deviceKey={deviceKey}
				linkedTabCode={session?.tab?.codigo}
				asksTabCode={asksTabCode}
				onSubmitted={() => void sessionQuery.refetch()}
			/>
		</>
	);
}

function DeviceAccountSection({ session }: { session: TGetPublicTabOrderSessionOutput["data"] }) {
	const latestRequests = session.requests.slice(0, 3);

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3">
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
					<ReceiptText className="size-3.5" />
					Sua conta
				</span>
				{session.tab ? (
					<span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
						ABERTA
					</span>
				) : null}
			</div>

			{session.tab ? (
				<>
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<p className="truncate text-sm font-bold">{session.tab.codigo ? `Comanda ${session.tab.codigo}` : session.tab.servicePoint?.rotulo}</p>
							<p className="text-xs text-muted-foreground">Pedidos aprovados neste dispositivo</p>
						</div>
						<p className="shrink-0 text-base font-black tabular-nums">{formatToMoney(session.tab.consumoParcial)}</p>
					</div>

					<div className="flex flex-col gap-2 border-t border-border/60 pt-2">
						{session.tab.pedidos
							.filter((order) => order.status !== "CANCELADO")
							.map((order) => (
								<div key={order.id} className="flex flex-col gap-0.5">
									<span className="text-xs font-bold">Pedido {order.numero}</span>
									{order.itens
										.filter((item) => item.quantidadeCancelada < item.quantidade)
										.map((item) => {
											const metadata = (item.metadados ?? {}) as { nome?: string };
											return (
												<div key={item.id} className="flex items-center justify-between gap-3 text-xs">
													<span className="min-w-0 truncate">
														{item.quantidade - item.quantidadeCancelada}x {metadata.nome ?? "Item"}
													</span>
													<span className="shrink-0 font-medium tabular-nums">{formatToMoney(item.valorVendaTotalLiquido)}</span>
												</div>
											);
										})}
								</div>
							))}
					</div>
				</>
			) : (
				<p className="text-xs text-muted-foreground">Assim que o atendente aprovar seu primeiro pedido, o extrato aparecerá aqui.</p>
			)}

			{latestRequests.length > 0 ? (
				<div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
					{latestRequests.map((request) => (
						<div key={request.id} className="flex items-center justify-between gap-3 text-xs">
							<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
								<Clock3 className="size-3.5 shrink-0" />
								<span className="truncate">{request.payloadSolicitacao.itens.reduce((sum, item) => sum + item.quantidade, 0)} item(ns)</span>
							</span>
							<RequestStatus status={request.status} />
						</div>
					))}
				</div>
			) : null}
		</section>
	);
}

function RequestStatus({ status }: { status: TGetPublicTabOrderSessionOutput["data"]["requests"][number]["status"] }) {
	const labels = {
		PENDENTE: "Aguardando",
		APROVADA: "Aprovado",
		REJEITADA: "Rejeitado",
		PROCESSANDO: "Processando",
		CONCLUIDA: "Aprovado",
		ERRO: "Revisar com atendente",
	} as const;
	const tone =
		status === "CONCLUIDA" || status === "APROVADA"
			? "text-green-700 dark:text-green-300"
			: status === "REJEITADA" || status === "ERRO"
				? "text-destructive"
				: "text-amber-700 dark:text-amber-300";
	return <span className={`shrink-0 font-semibold ${tone}`}>{labels[status]}</span>;
}
