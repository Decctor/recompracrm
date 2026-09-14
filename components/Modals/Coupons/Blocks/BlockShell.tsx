import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { PropsWithChildren, ReactNode } from "react";

type CouponBlockShellProps = PropsWithChildren & {
	title: string;
	icon: ReactNode;
	action?: ReactNode;
	/**
	 * Fora do modal a moldura vem de quem hospeda o bloco — a `Section` da aba de cadastro, com o
	 * próprio cabeçalho e a barra de aplicar. Repetir o cabeçalho do modal ali dentro daria dois
	 * títulos para a mesma seção, então o bloco entrega só o formulário.
	 */
	embedded?: boolean;
};

/** Moldura de um bloco de formulário do cupom: cabeçalho de modal, ou nada quando embutido. */
export default function CouponBlockShell({ title, icon, action, embedded = false, children }: CouponBlockShellProps) {
	if (embedded) return <div className="flex w-full flex-col gap-3">{children}</div>;

	return (
		<ResponsiveMenuSection title={title} icon={icon} action={action}>
			{children}
		</ResponsiveMenuSection>
	);
}
