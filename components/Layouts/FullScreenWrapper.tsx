import type { PropsWithChildren } from "react";

/**
 * Moldura de tela cheia usada pelo `ProvidersWrapper` — ou seja, por toda página do app.
 *
 * Não define tipografia, e é de propósito. Já definiu: carregava uma fonte própria e a aplicava
 * aqui, e como este div envolve a aplicação inteira, tudo que não reafirmasse a fonte mais abaixo
 * (landing, ajuda, blog, auth, ponto de interação, painel do parceiro, vitrine) herdava a daqui, e
 * não a do `body`. A master chegou ao mesmo problema por outro caminho e trocou a Inter pela
 * Raleway; com uma fonte só no app, o certo é não declarar fonte nenhuma neste nível — o div herda
 * do `body` e não há um segundo `next/font` para sair de sincronia. Não reintroduza `font-*` aqui.
 */
function FullScreenWrapper({ children }: PropsWithChildren) {
	return (
		<div className="flex min-h-dvh w-screen max-w-full flex-col">
			<div className="flex min-h-full grow">
				<div className="flex w-full grow flex-col">{children}</div>
			</div>
		</div>
	);
}

export default FullScreenWrapper;
