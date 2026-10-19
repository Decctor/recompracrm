"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { Badge } from "@/components/ui/badge";
import { formatLocation, formatToMoney, formatToPhone } from "@/lib/formatting";
import { Clock3, MapPin, Package, Truck } from "lucide-react";
import Image from "next/image";
import { useShopData } from "./ShopProvider";
import WhatsappIcon from "./WhatsappIcon";

export default function ShopHeader() {
	const { catalog, availability } = useShopData();
	const { organization, shopSettings } = catalog;
	const config = shopSettings.configuracoes;
	const appearance = config.aparencia;
	const service = config.atendimento;
	const { colors, getPrimaryGradientStyle } = useOrgColors();
	const showCoverImage = Boolean(appearance.headerCoverUrl && appearance.headerCoverTipo === "IMAGEM");
	const showCoverVideo = Boolean(appearance.headerCoverUrl && appearance.headerCoverTipo === "VIDEO");

	const formattedLocation = formatLocation({
		location: {
			cep: organization.localizacaoCep,
			uf: organization.localizacaoEstado ?? "",
			cidade: organization.localizacaoCidade ?? "",
			bairro: organization.localizacaoBairro,
			endereco: organization.localizacaoLogradouro,
			numeroOuIdentificador: organization.localizacaoNumero,
			complemento: organization.localizacaoComplemento,
		},
		includeCity: true,
		includeUf: true,
		includeCEP: true,
	});
	const phoneDisplay = organization.telefone ? formatToPhone(organization.telefone) : null;
	const phoneDigits = organization.telefone ? organization.telefone.replace(/\D/g, "") : null;
	// wa.me requires the country code; local numbers (10-11 digits) get Brazil's 55.
	const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits.length <= 11 ? `55${phoneDigits}` : phoneDigits}` : null;

	return (
		<header className="relative flex w-full flex-col bg-background pb-2">
			<div className="relative h-[14rem] w-full overflow-hidden sm:h-64">
				{(showCoverImage || showCoverVideo) && appearance.headerCoverUrl ? (
					<>
						{showCoverVideo ? (
							<video src={appearance.headerCoverUrl} className="size-full object-cover" autoPlay muted loop playsInline preload="metadata">
								<track kind="captions" srcLang="pt-BR" label="Sem legendas disponíveis" />
							</video>
						) : (
							<Image src={appearance.headerCoverUrl} alt={organization.nome} fill className="object-cover" priority sizes="100vw" />
						)}
						<div className="absolute inset-0 bg-linear-to-b from-black/25 via-transparent to-black/50" />
					</>
				) : (
					<div className="absolute inset-0" style={getPrimaryGradientStyle()}>
						<div
							className="absolute inset-0 opacity-[0.12]"
							style={{
								backgroundImage: `radial-gradient(circle, ${colors.primaryForeground} 1px, transparent 1px)`,
								backgroundSize: "18px 18px",
							}}
						/>
						<div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/35" />
					</div>
				)}
			</div>

			<div className="relative z-10 -mt-12 px-3 sm:-mt-14 sm:px-4">
				<div className="relative rounded-t-[1.75rem] rounded-b-2xl border border-border/60 bg-card px-4 pt-12 pb-4 text-card-foreground shadow-lg sm:pt-14">
					<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
						{organization.logoUrl ? (
							<div className="relative size-18 overflow-hidden rounded-full border-[3px] border-background bg-background shadow-lg ring-1 ring-black/5 dark:ring-white/10 sm:size-20">
								<Image src={organization.logoUrl} alt={organization.nome} fill className="object-cover" sizes="80px" />
							</div>
						) : (
							<div className="flex size-18 items-center justify-center rounded-full border-[3px] border-background bg-brand text-brand-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10 sm:size-20">
								<span className="text-2xl font-black">{organization.nome.charAt(0).toUpperCase()}</span>
							</div>
						)}
					</div>

					<h1 className="truncate pt-1 text-center text-lg leading-tight font-black text-foreground sm:text-xl">{organization.nome}</h1>
					<div className="my-4 h-px bg-border" />

					<div className="mb-3 flex justify-center">
						<Badge
							variant={null}
							className={
								availability.status === "ABERTA"
									? "gap-1.5 rounded-full bg-green-100 px-3 py-1 font-semibold text-green-800 dark:bg-green-950 dark:text-green-300"
									: "gap-1.5 rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground"
							}
						>
							<Clock3 className="size-3.5" />
							{availability.status === "ABERTA" ? "ABERTA AGORA" : "FECHADA AGORA"}
						</Badge>
					</div>

					<ShopHeaderLocationPhoneInformations formattedPhone={phoneDisplay} whatsappHref={whatsappHref} formattedLocation={formattedLocation} />
					<div className="mt-4 flex flex-wrap items-center justify-center gap-2">
						{service.retirada.ativo ? (
							<Badge variant={null} className="gap-1 rounded-full bg-brand-secondary px-3 py-1 font-semibold text-brand-secondary-foreground">
								<Package className="size-3.5" />
								RETIRADA DISPONÍVEL
							</Badge>
						) : null}
						{service.entrega.ativo ? (
							<Badge variant={null} className="gap-1 rounded-full bg-brand-secondary px-3 py-1 font-semibold text-brand-secondary-foreground">
								<Truck className="size-3.5" />
								ENTREGA EM ATÉ {service.entrega.prazoMinutos} MIN
							</Badge>
						) : null}
						{service.entrega.ativo && service.entrega.pedidoMinimo > 0 ? (
							<p className="w-full text-center text-xs font-medium text-muted-foreground">
								Pedido mínimo para entrega: {formatToMoney(service.entrega.pedidoMinimo)}
							</p>
						) : null}
					</div>

					<p className="mt-3 px-1 text-center text-xs leading-relaxed text-muted-foreground">Valores e formas de pagamento ao finalizar no carrinho.</p>
				</div>
			</div>
		</header>
	);
}

function ShopHeaderLocationPhoneInformations({
	formattedPhone,
	whatsappHref,
	formattedLocation,
}: {
	formattedPhone: string | null;
	whatsappHref: string | null;
	formattedLocation: string | null;
}) {
	if (!formattedPhone && !formattedLocation) return null;
	return (
		<div className="flex flex-col gap-2.5">
			{formattedPhone && whatsappHref ? (
				<a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
						<WhatsappIcon className="size-4" />
					</div>
					<span className="text-xs font-medium tracking-tight sm:text-sm">{formattedPhone}</span>
				</a>
			) : null}
			{formattedLocation ? (
				<div className="flex items-center gap-3 text-sm">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
						<MapPin className="size-4" />
					</div>
					<p className="text-xs font-medium tracking-tight sm:text-sm">{formattedLocation}</p>
				</div>
			) : null}
		</div>
	);
}
