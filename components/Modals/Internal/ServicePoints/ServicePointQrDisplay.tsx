"use client";

import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ServicePointQrDisplayProps = {
	tokenPublico: string;
	rotulo: string;
};

// O QR fica impresso na mesa por tempo indeterminado: a URL usa o dominio canonico
// do app, nunca o dominio de onde o painel foi aberto (preview, localhost).
function getServicePointUrl(tokenPublico: string) {
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
	return `${baseUrl.replace(/\/$/, "")}/service-point/${tokenPublico}`;
}

/**
 * QR fixo do ponto: aponta para /service-point/<token> e vale ate o ponto ser
 * desativado ou o QR ser regenerado. Pode ser reexibido/reimpresso a qualquer momento.
 */
export function ServicePointQrDisplay({ tokenPublico, rotulo }: ServicePointQrDisplayProps) {
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const url = getServicePointUrl(tokenPublico);

	useEffect(() => {
		QRCode.toDataURL(url, { width: 1024, margin: 2 })
			.then(setQrDataUrl)
			.catch(() => setQrDataUrl(null));
	}, [url]);

	return (
		<div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-secondary/30 p-3">
			<p className="text-xs font-bold uppercase tracking-tight">{rotulo} — QR do ponto</p>
			{qrDataUrl ? <img src={qrDataUrl} alt={`QR Code de ${rotulo}`} className="h-44 w-44 rounded-lg bg-white p-1.5" /> : null}
			<p className="max-w-full truncate text-[0.65rem] text-muted-foreground">{url}</p>
			<div className="flex flex-wrap items-center justify-center gap-2">
				<Button
					size="sm"
					variant="outline"
					className="flex items-center gap-1.5"
					onClick={() => {
						navigator.clipboard.writeText(url);
						toast.success("Link copiado.");
					}}
				>
					<Copy className="h-3.5 w-3.5" />
					COPIAR LINK
				</Button>
				{qrDataUrl ? (
					<Button size="sm" variant="outline" className="flex items-center gap-1.5" asChild>
						<a href={qrDataUrl} download={`qr-${rotulo.trim().toLowerCase().replace(/\s+/g, "-") || "ponto"}.png`}>
							<Download className="h-3.5 w-3.5" />
							BAIXAR PNG
						</a>
					</Button>
				) : null}
			</div>
		</div>
	);
}
