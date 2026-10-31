import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * JWT de Realtime da organização ativa. Fica só na memória do browser.
 *
 * O cliente do supabase-js 2.57 liga o Realtime a um callback `accessToken` e o heartbeat
 * (~25s) chama `setAuth()` sem argumento, o que relê esse callback. `setAuth(token)` sozinho
 * seria substituído pela anon key no próximo batimento. O callback abaixo é passado só em
 * `realtime`, então o `fetch` do Storage continua com a anon key (`_getAccessToken`).
 */
let realtimeAccessToken: string | null = null;

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
	realtime: {
		accessToken: async () => realtimeAccessToken,
	},
});

let realtimeTokenGeneration = 0;
let realtimeTokenQueue: Promise<unknown> = Promise.resolve();

/**
 * Entrega o JWT ao socket. `null` esvazia o callback até a próxima sessão.
 * Chamadas seguem em fila: um `setAuth` antigo não pode gravar por cima de um token mais novo
 * (troca de organização). O heartbeat ainda lê o callback, então o valor corrente permanece lá.
 */
export function applyRealtimeAccessToken(token: string | null) {
	realtimeAccessToken = token;
	const generation = ++realtimeTokenGeneration;
	const run = realtimeTokenQueue.then(async () => {
		if (generation !== realtimeTokenGeneration) return;
		if (realtimeAccessToken) {
			await supabaseClient.realtime.setAuth(realtimeAccessToken);
			return;
		}
		await supabaseClient.realtime.setAuth();
	});
	realtimeTokenQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

let realtimeChannelSequence = 0;

/**
 * Cria um canal de realtime com nome único por inscrição.
 *
 * `supabaseClient.channel(nome)` devolve o canal **existente** quando já há um com o mesmo nome, e
 * `subscribe()` só entra de fato quando esse canal está `closed`. Já `removeChannel()` deixa o
 * canal em `leaving` e só o tira da lista quando o servidor confirma a saída. Logo, desmontar e
 * montar de novo com o mesmo nome dentro dessa janela (StrictMode, troca rápida de conversa, uma
 * dependência instável no efeito) devolvia o canal moribundo, o `subscribe()` virava um no-op
 * silencioso e a tela ficava sem realtime — a lista atualizava e a conversa aberta não.
 * O sufixo garante que cada inscrição tenha o seu canal, independente do ciclo do anterior.
 */
export function createRealtimeChannel(name: string) {
	realtimeChannelSequence += 1;
	return supabaseClient.channel(`${name}-${realtimeChannelSequence}`);
}
