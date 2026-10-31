"use client";

import { fetchRealtimeAccessToken } from "@/lib/queries/realtime-auth";
import { REALTIME_JWT_REFRESH_SKEW_MS } from "@/lib/supabase/realtime-jwt-constants";
import { applyRealtimeAccessToken } from "@/services/supabase";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

export type TSupabaseRealtimeAuthState = {
	organizacaoId: string | null;
	ready: boolean;
	failed: boolean;
};

const IDLE_AUTH: TSupabaseRealtimeAuthState = { organizacaoId: null, ready: false, failed: false };

const SupabaseRealtimeAuthContext = createContext<TSupabaseRealtimeAuthState>(IDLE_AUTH);

export function useSupabaseRealtimeAuth() {
	return use(SupabaseRealtimeAuthContext);
}

type SupabaseRealtimeAuthProviderProps = {
	organizacaoId: string;
	children: ReactNode;
};

/**
 * Pede um JWT curto da organização ativa e entrega ao Realtime.
 * A troca de organização (prop nova, inclusive depois do reload do switcher) busca outro token
 * antes de qualquer inscrição. A renovação acontece antes do `exp` e ao voltar para a aba.
 */
export function SupabaseRealtimeAuthProvider({ organizacaoId, children }: SupabaseRealtimeAuthProviderProps) {
	const [authState, setAuthState] = useState<TSupabaseRealtimeAuthState>({ organizacaoId, ready: false, failed: false });
	if (authState.organizacaoId !== organizacaoId) {
		setAuthState({ organizacaoId, ready: false, failed: false });
	}

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let expiresAtMs = 0;
		let attempt = 0;

		const schedule = (delayMs: number, reason: "initial" | "refresh") => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				void authorize(reason);
			}, delayMs);
		};

		async function authorize(reason: "initial" | "refresh") {
			try {
				const result = await fetchRealtimeAccessToken();
				if (cancelled || result.organizacaoId !== organizacaoId) return;
				await applyRealtimeAccessToken(result.token);
				if (cancelled) return;
				attempt = 0;
				expiresAtMs = new Date(result.expiresAt).getTime();
				setAuthState((current) =>
					current.ready && !current.failed && current.organizacaoId === organizacaoId ? current : { organizacaoId, ready: true, failed: false },
				);
				const refreshIn = Math.max(expiresAtMs - Date.now() - REALTIME_JWT_REFRESH_SKEW_MS, 15_000);
				schedule(refreshIn, "refresh");
			} catch (error) {
				if (cancelled) return;
				attempt += 1;
				console.error("[REALTIME] Falha ao obter o token da organização.", error instanceof Error ? error.message : "erro desconhecido");
				if (reason === "initial") setAuthState({ organizacaoId, ready: false, failed: true });
				const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
				schedule(delay, reason === "refresh" ? "refresh" : "initial");
			}
		}

		void applyRealtimeAccessToken(null).finally(() => {
			if (!cancelled) void authorize("initial");
		});

		const onVisibility = () => {
			if (document.visibilityState !== "visible" || !expiresAtMs) return;
			if (expiresAtMs - Date.now() > REALTIME_JWT_REFRESH_SKEW_MS) return;
			void authorize("refresh");
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [organizacaoId]);

	return <SupabaseRealtimeAuthContext value={authState}>{children}</SupabaseRealtimeAuthContext>;
}
