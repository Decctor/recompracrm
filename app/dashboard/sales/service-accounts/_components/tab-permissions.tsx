"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * Permissões que mudam o que o quadro de contas mostra. Operar contas (abrir, lançar, receber,
 * transferir, fechar) já é condição para entrar na página (capability `serviceAccounts` exige
 * `vendas.criar`); cancelar conta/pedido e estornar recebimento exigem `vendas.excluir`, a mesma
 * regra do cancelamento de venda no PDV. Configurar mesas, comandas físicas e o modo de atendimento
 * exige `vendas.configurar`. As rotas de /api/tabs e /api/service-* aplicam as mesmas checagens.
 */
type TTabPermissions = {
	canCancel: boolean;
	// Mesas, comandas físicas e modo de atendimento: `vendas.configurar` (canConfigureSales).
	canConfigure: boolean;
};

const TabPermissionsContext = createContext<TTabPermissions>({ canCancel: false, canConfigure: false });

export function TabPermissionsProvider({ canCancel, canConfigure, children }: TTabPermissions & { children: ReactNode }) {
	return <TabPermissionsContext.Provider value={{ canCancel, canConfigure }}>{children}</TabPermissionsContext.Provider>;
}

export function useTabPermissions() {
	return useContext(TabPermissionsContext);
}
