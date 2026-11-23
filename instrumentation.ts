/**
 * Hook de instrumentação do Next: roda uma vez por instância do servidor (em cada cold start na
 * Vercel), antes de qualquer rota. É o único lugar que alcança todas as chamadas ao AI SDK — o
 * agente, o processamento de mídia e as extrações de documento — sem depender de cada módulo
 * importar um efeito colateral.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		// Local mode: the server may only open connections to this machine. Installed before anything
		// else so no stub key ever reaches a real service. See docs/dev/local-environment.md.
		if (process.env.LOCAL_DEV === "1") {
			const { assertLocalDatabase } = await import("./lib/local-dev/guard");
			const { installLocalNetworkGuard } = await import("./lib/local-dev/network-guard");
			assertLocalDatabase();
			installLocalNetworkGuard();
		}
		const { registerAiSdkWarningLogger } = await import("./lib/ai/providers/warnings");
		registerAiSdkWarningLogger();
	}
}
