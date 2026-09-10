"use client";

import PlanPicker from "@/components/Subscription/PlanPicker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useOrganizationSubscriptionStatus } from "@/lib/queries/organizations";

type PlanSelectionMenuProps = {
	closeMenu: () => void;
};

/**
 * Upsell não-bloqueante: teste em andamento, pagamento pendente dentro do grace, ou o lojista
 * clicando no selo do plano. Aqui o modal é o formato certo — a pessoa não está bloqueada e tirá-la
 * da página em que está seria hostil. Quem *está* bloqueado cai em `/subscription`, que usa este
 * mesmo `PlanPicker`.
 */
export default function PlanSelectionMenu({ closeMenu }: PlanSelectionMenuProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const { data } = useOrganizationSubscriptionStatus();

	const titulo = "Escolha seu plano";
	const descricao = data?.mensagem ?? "Contrate para manter o acesso à plataforma sem interrupção.";
	const picker = <PlanPicker acao={data?.acao ?? "ASSINAR"} />;

	function handleOpenChange(open: boolean) {
		if (!open) closeMenu();
	}

	if (!isDesktop) {
		return (
			<Drawer open onOpenChange={handleOpenChange}>
				<DrawerContent className="max-h-[92vh]">
					<DrawerHeader className="text-left">
						<DrawerTitle>{titulo}</DrawerTitle>
						<DrawerDescription>{descricao}</DrawerDescription>
					</DrawerHeader>
					<div className="overflow-y-auto px-4 pb-6 scrollbar-subtle">{picker}</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-3xl scrollbar-subtle">
				<DialogHeader>
					<DialogTitle>{titulo}</DialogTitle>
					<DialogDescription>{descricao}</DialogDescription>
				</DialogHeader>
				{picker}
			</DialogContent>
		</Dialog>
	);
}
