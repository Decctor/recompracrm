"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Retorno do `/r/[código]`: avisa quem chegou por um link de indicação. O link inválido era
 * silencioso — a pessoa achava que estava indicada e o parceiro perdia a loja.
 */
export default function ReferralLinkNotice() {
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("indicacao") === "invalida") {
			toast.warning("Este link de indicação não está ativo.", {
				description: "Se alguém te indicou, informe o código de indicação no cadastro da sua loja.",
				duration: 8000,
			});
			return;
		}
		const ref = params.get("ref")?.trim();
		if (ref) {
			toast.success(`Indicação ${ref.toUpperCase()} aplicada.`, {
				description: "Crie sua conta e teste grátis: a indicação já fica registrada no seu cadastro.",
				duration: 6000,
			});
		}
	}, []);
	return null;
}
