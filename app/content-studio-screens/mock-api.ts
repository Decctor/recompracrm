import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

// Substitui o transporte do axios nesta rota de desenvolvimento: cada GET da tela responde com a
// fixture registrada para o caminho. Pedido sem fixture vira 404 e aparece no console, para a
// captura apontar exatamente o que falta.

type THandler = (url: URL, config: InternalAxiosRequestConfig) => unknown;
const handlers: Array<{ path: string; handler: THandler }> = [];

export function mockApi(path: string, handler: THandler) {
	handlers.push({ path, handler });
}

axios.defaults.adapter = async (config) => {
	const url = new URL(axios.getUri(config), window.location.origin);
	const match = handlers.find((h) => h.path === url.pathname);
	if (!match) {
		console.warn(`[content-studio] sem fixture: ${config.method?.toUpperCase()} ${url.pathname}${url.search}`);
		const response = { data: { message: "Sem fixture." }, status: 404, statusText: "Not Found", headers: {}, config } as AxiosResponse;
		throw new AxiosError("Sem fixture", "ERR_BAD_REQUEST", config, null, response);
	}
	return { data: match.handler(url, config), status: 200, statusText: "OK", headers: {}, config, request: {} };
};
