"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { WhatsappIcon } from "@/components/icons";
import PlanPicker from "@/components/Subscription/PlanPicker";
import SubscriptionOrgSwitcher from "@/components/Subscription/SubscriptionOrgSwitcher";
import { Button } from "@/components/ui/button";
import { useOrganizationSubscriptionStatus } from "@/lib/queries/organizations";
import { LogOut } from "lucide-react";
import Link from "next/link";

const SUPPORT_WHATSAPP_URL = `https://wa.me/553499480791?text=${encodeURIComponent("Olá! Preciso de ajuda com a assinatura da minha loja no RecompraCRM.")}`;

type SubscriptionPageProps = {
	/** Vem do server component: `useUserSession` bate em `/api/auth/session`, que não existe (404). */
	isPlatformAdmin: boolean;
};

/**
 * Campo cinza com um único wrapper claro no centro — a chapa branca de ponta a ponta com barra
 * de topo empurrava a oferta para baixo da dobra. Tudo aqui é dimensionado para caber numa tela
 * de notebook sem rolagem: o preço tem de estar visível junto com o motivo do bloqueio.
 */
export default function SubscriptionPage({ isPlatformAdmin }: SubscriptionPageProps) {
	const { data, isLoading, isError } = useOrganizationSubscriptionStatus();

	return (
		<div className="brand-recompracrm flex min-h-svh flex-col items-center bg-muted px-4 py-5 font-outfit sm:px-6 sm:py-6">
			<div className="flex w-full max-w-4xl flex-col gap-3">
				<div className="flex items-center justify-between gap-3 px-1">
					<BrandLogo lockup="horizontal-badge" tone="color-on-light" className="h-7 w-auto" priority />
					<div className="flex items-center gap-1.5">
						<SubscriptionOrgSwitcher isPlatformAdmin={isPlatformAdmin} />
						<Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" asChild>
							<Link href="/auth/logout" prefetch={false}>
								<LogOut className="size-4" aria-hidden />
								<span className="hidden sm:inline">Sair</span>
							</Link>
						</Button>
					</div>
				</div>

				<main className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
					{isLoading ? <StatusSkeleton /> : <StatusBand status={data?.status} mensagem={data?.mensagem} isError={isError} />}

					<div className="border-t border-border" />

					{isLoading ? <PickerSkeleton /> : <PlanPicker acao={data?.acao ?? "ASSINAR"} />}
				</main>

				<div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-1 text-center">
					<p className="text-sm text-muted-foreground">Dúvida sobre qual opção faz sentido para a sua loja?</p>
					<Button size="sm" className="bg-whatsapp font-bold text-whatsapp-foreground hover:bg-whatsapp/90" asChild>
						<a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
							<WhatsappIcon className="size-4" aria-hidden />
							Falar com a gente no WhatsApp
						</a>
					</Button>
				</div>
			</div>
		</div>
	);
}

function StatusBand({ status, mensagem, isError }: { status?: string; mensagem?: string; isError: boolean }) {
	// Sem o status da API ainda existe uma página útil: a organização está bloqueada de qualquer
	// forma (o server component já garantiu isso), só não sabemos dizer o motivo exato.
	const titulo = status ?? "Acesso suspenso";
	const texto = isError
		? "Não conseguimos carregar os detalhes da sua assinatura agora, mas você pode contratar um plano abaixo."
		: (mensagem ?? "Adquira um plano para continuar utilizando a plataforma.");

	return (
		<div className="flex flex-col gap-1.5">
			<h1 className="text-xl font-extrabold tracking-tight text-balance sm:text-2xl">{titulo}</h1>
			<p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
				{texto} <span className="font-medium text-foreground">Seus clientes e vendas continuam salvos.</span>
			</p>
		</div>
	);
}

function StatusSkeleton() {
	return (
		<div className="flex flex-col gap-1.5" aria-hidden>
			<div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
			<div className="h-5 w-full max-w-lg animate-pulse rounded bg-muted" />
			<div className="h-5 w-full max-w-sm animate-pulse rounded bg-muted" />
		</div>
	);
}

/** Espelha a moldura dividida do `PlanPicker` — um esqueleto de forma diferente da real produz um
 *  salto de layout no momento em que os dados chegam. */
function PickerSkeleton() {
	return (
		<div className="flex flex-col gap-4" aria-label="Carregando planos" aria-busy>
			<div className="flex justify-end">
				<div className="h-9 w-40 animate-pulse rounded-full bg-muted" />
			</div>
			<div className="grid divide-y divide-border overflow-hidden rounded-2xl border border-border md:grid-cols-2 md:divide-x md:divide-y-0">
				{[0, 1].map((index) => (
					<div key={index} className="flex flex-col gap-3.5 p-5">
						<div className="size-8 animate-pulse rounded-xl bg-muted" />
						<div className="flex flex-col gap-1">
							<div className="h-5 w-40 animate-pulse rounded bg-muted" />
							<div className="h-4 w-full animate-pulse rounded bg-muted" />
						</div>
						<div className="h-8 w-32 animate-pulse rounded bg-muted" />
						<div className="flex flex-col gap-2">
							{[0, 1, 2, 3, 4, 5].map((line) => (
								<div key={line} className="h-4 w-full animate-pulse rounded bg-muted" />
							))}
						</div>
						<div className="mt-auto h-9 w-full animate-pulse rounded-4xl bg-muted" />
					</div>
				))}
			</div>
		</div>
	);
}
