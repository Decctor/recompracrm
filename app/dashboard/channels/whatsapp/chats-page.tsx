"use client";
import ChatsMain from "@/components/Chats/ChatsMain";
import type { TAuthUserSession } from "@/lib/authentication/types";

type ChatsPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function ChatsPage({ user, membership }: ChatsPageProps) {
	return (
		<div className="flex h-[calc(100dvh-7rem)] min-h-0 w-full shrink-0 flex-col overflow-hidden lg:h-[calc(100dvh-8rem)]">
			<ChatsMain
				user={user}
				organizationId={membership.organizacao.id}
				canManageAttendances={membership.permissoes.atendimentos.finalizar ?? false}
				quotePermissions={{
					criar: membership.permissoes.vendas.criar ?? false,
					// Mesmo gate da listagem de vendas para abrir o checkout de um orçamento.
					editar: membership.permissoes.vendas.editar ?? false,
					// Rascunho não tem trilha contábil: quem opera vendas pode descartar.
					cancelar: (membership.permissoes.vendas.criar || membership.permissoes.vendas.excluir) ?? false,
				}}
			/>
		</div>
	);
}
