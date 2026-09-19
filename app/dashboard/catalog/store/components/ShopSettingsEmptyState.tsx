"use client";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { createShopSettings } from "@/lib/mutations/shop";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CreditCard, Loader2, Plus, ShoppingBag, Store, Truck } from "lucide-react";
import { toast } from "sonner";

const FEATURES = [
	{ icon: Truck, label: "Retirada e entrega com pedido mínimo e prazo" },
	{ icon: CreditCard, label: "Formas de pagamento aceitas na loja" },
	{ icon: CalendarDays, label: "Horários de funcionamento e exceções" },
	{ icon: ShoppingBag, label: "Vitrine com os produtos em destaque" },
];

/**
 * Estado vazio da página da loja: a organização ainda não tem a linha de `shop_settings`. O botão
 * cria a configuração inicial (inativa, com os padrões) — a loja só abre depois que o painel for
 * preenchido e ativado. O servidor recusa a criação se já houver uma configuração para a org.
 */
export default function ShopSettingsEmptyState() {
	const queryClient = useQueryClient();

	const { mutate: create, isPending } = useMutation({
		mutationKey: ["create-shop-settings"],
		mutationFn: createShopSettings,
		onSuccess: (response) => {
			toast.success(response.message);
			queryClient.invalidateQueries({ queryKey: ["shop-settings"] });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
			// Um 409 significa que a configuração já existe (outra aba, outro usuário): basta recarregar.
			queryClient.invalidateQueries({ queryKey: ["shop-settings"] });
		},
	});

	return (
		<div className="flex w-full flex-col items-center justify-center gap-8 py-16">
			<div className="flex max-w-md flex-col items-center gap-3 text-center">
				<div className="mb-2 flex size-20 items-center justify-center rounded-full border border-border bg-primary/10 shadow-lg ring-4 ring-background">
					<Store className="size-10 text-foreground" />
				</div>
				<h1 className="text-3xl font-bold tracking-tight">Crie sua loja digital</h1>
				<p className="text-base text-muted-foreground">
					Sua organização ainda não tem uma loja digital configurada. Crie a configuração inicial para definir atendimento, pagamento,
					horários e vitrine antes de publicar o link para os clientes.
				</p>
			</div>

			<div className="w-full max-w-sm">
				<div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
					<p className="text-label text-muted-foreground">O que você vai configurar</p>
					<div className="flex flex-col gap-2.5">
						{FEATURES.map((feature) => {
							const Icon = feature.icon;
							return (
								<div key={feature.label} className="flex items-center gap-3 text-sm text-foreground">
									<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
										<Icon className="size-3.5 text-foreground" />
									</div>
									<span>{feature.label}</span>
								</div>
							);
						})}
					</div>
					<Button className="mt-1 w-full gap-2" onClick={() => create()} disabled={isPending}>
						{isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
						CRIAR LOJA DIGITAL
					</Button>
				</div>
			</div>
		</div>
	);
}
