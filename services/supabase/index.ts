import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

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
