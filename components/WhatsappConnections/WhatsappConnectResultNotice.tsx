"use client";

import { Callout } from "@/components/ui/callout";
import { readWhatsappConnectReturn, stripWhatsappConnectParams, type TWhatsappConnectReturn } from "@/lib/whatsapp/meta-connect";
import { CircleAlert, CircleCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * O que aconteceu na volta do fluxo da Meta, numa tela nossa. Lê os parâmetros uma vez e os tira da
 * URL, para a mensagem não reaparecer num recarregamento; ela fica na tela até a pessoa fechar.
 */
export function WhatsappConnectResultNotice({ onConnected }: { onConnected?: () => void }) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const [result, setResult] = useState<TWhatsappConnectReturn | null>(null);

	useEffect(() => {
		const read = readWhatsappConnectReturn(searchParams);
		if (!read.sucesso && !read.codigoErro) return;
		setResult(read);
		if (read.sucesso) onConnected?.();
		router.replace(`${pathname}${stripWhatsappConnectParams(searchParams.toString())}`, { scroll: false });
		// Só a primeira leitura importa; os parâmetros saem da URL logo depois.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!result) return null;

	if (result.sucesso) {
		return (
			<Callout.Root tone="success">
				<Callout.Title>
					<CircleCheck className="size-4" />
					{result.sucesso === "reconectado" ? "WhatsApp reconectado" : result.numeros > 1 ? `${result.numeros} números conectados` : "WhatsApp conectado"}
				</Callout.Title>
				<Callout.Description>
					{result.sucesso === "reconectado"
						? "O acesso foi renovado e os envios seguem normalmente."
						: "Enviamos os modelos de mensagem para a Meta revisar, o que costuma levar de alguns minutos a algumas horas. Enquanto isso, confira os passos abaixo."}
				</Callout.Description>
			</Callout.Root>
		);
	}

	return (
		<Callout.Root tone={result.codigoErro === "cancelado" ? "neutral" : "warning"}>
			<Callout.Title>
				<CircleAlert className="size-4" />
				{result.codigoErro === "cancelado" ? "Conexão não concluída" : "Não deu para conectar"}
			</Callout.Title>
			<Callout.Description>{result.erro}</Callout.Description>
		</Callout.Root>
	);
}
