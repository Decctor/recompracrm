import type satoriType from "satori";

/**
 * Carrega o satori só quando uma imagem é de fato renderizada.
 *
 * Desde a 0.33 o satori importa o `harfbuzzjs`, cujo `index.js` começa a carregar o `hb.wasm`
 * no próprio `require` e devolve uma promessa que só é aguardada na primeira renderização. Com
 * import estático, todo route cujo grafo alcança um renderizador (o webhook do WhatsApp chega
 * aqui via handoff para humano) carregava o wasm na subida; quando o arquivo faltava, a
 * rejeição não tratada derrubava o processo ao fim de cada request — toda invocação virava cold
 * start. O satori também é `serverExternalPackages` (next.config.mjs) para o `__dirname` do
 * harfbuzzjs apontar para o node_modules real, com o `hb.wasm` incluído no trace.
 */
let satoriPromise: Promise<typeof satoriType> | null = null;

export function loadSatori(): Promise<typeof satoriType> {
	satoriPromise ??= import("satori").then((module) => module.default);
	// Falha de carga não fica em cache: a próxima renderização tenta de novo.
	satoriPromise.catch(() => {
		satoriPromise = null;
	});
	return satoriPromise;
}
