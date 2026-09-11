import type { PropsWithChildren } from "react";

/**
 * Moldura de tela cheia usada pelo `ProvidersWrapper` — ou seja, por toda página do app.
 *
 * Não define tipografia, e é de propósito. Já definiu: carregava a Inter e a aplicava aqui, e como
 * este div envolve a aplicação inteira, tudo que não reafirmasse a fonte mais abaixo (landing,
 * ajuda, blog, auth, ponto de interação, painel do parceiro, vitrine) renderizava em Inter —
 * enquanto o DESIGN.md dizia que o sistema tinha uma fonte só. Sem a classe, o div herda a fonte do
 * `body` e o app inteiro fica coerente de verdade. Não reintroduza `font-*` aqui.
 */
function FullScreenWrapper({ children }: PropsWithChildren) {
	return (
		<div className="flex min-h-screen w-screen max-w-full flex-col xl:min-h-screen">
			<div className="flex min-h-full grow">
				<div className="flex w-full grow flex-col">{children}</div>
			</div>
		</div>
	);
}

export default FullScreenWrapper;
