import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { PropsWithChildren, ReactNode } from "react";

type CashbackProgramBlockShellProps = PropsWithChildren & {
	title: string;
	icon: ReactNode;
	/**
	 * Fora do modal a moldura vem de quem hospeda o bloco: a `Section` da aba Meu Programa, com o
	 * próprio cabeçalho e a barra de aplicar. Mesmo contrato do `CouponBlockShell`.
	 */
	embedded?: boolean;
};

/** Moldura de um bloco de formulário do programa de cashback: cabeçalho de modal, ou nada quando embutido. */
export default function CashbackProgramBlockShell({ title, icon, embedded = false, children }: CashbackProgramBlockShellProps) {
	if (embedded) return <div className="flex w-full flex-col gap-3">{children}</div>;

	return (
		<ResponsiveMenuSection title={title} icon={icon}>
			{children}
		</ResponsiveMenuSection>
	);
}
