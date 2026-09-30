"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR do link de indicação com o selo da marca no centro (correção H aguenta o recorte). */
export function useReferralQrDataUrl(link: string) {
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		QRCode.toDataURL(link, { errorCorrectionLevel: "H", margin: 0, width: 512, color: { dark: "#171717", light: "#ffffff" } })
			.then((url) => {
				if (!cancelled) setDataUrl(url);
			})
			.catch(() => setDataUrl(null));
		return () => {
			cancelled = true;
		};
	}, [link]);
	return dataUrl;
}

export function ReferralQrCode({ link, size, className }: { link: string; size: number; className?: string }) {
	const dataUrl = useReferralQrDataUrl(link);
	const badge = Math.round(size * 0.23);
	return (
		<div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
			{dataUrl ? (
				// eslint-disable-next-line @next/next/no-img-element -- data URL gerada no cliente
				<img src={dataUrl} alt="QR code do link de indicação" width={size} height={size} className="h-full w-full [image-rendering:pixelated]" />
			) : (
				<div className="h-full w-full animate-pulse rounded-[10px] bg-muted" />
			)}
			<span
				className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white bg-white"
				style={{ width: badge + 6, height: badge + 6 }}
			>
				<BrandLogo lockup="icon-badge" tone="color" width={badge} height={badge} className="rounded-full" />
			</span>
		</div>
	);
}
