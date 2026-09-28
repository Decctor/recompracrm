import { DataSourceIntegrationTipoEnum, type TDataSourceIntegrationTipoEnum, type TIntegrationTipoEnum } from "@/schemas/enums";
import BlingLogo from "@/utils/images/integrations/bling-logo.png";
import ErpFlexLogo from "@/utils/images/integrations/erpflex.png";
import CardapioWebLogo from "@/utils/images/integrations/cardapio-web.png";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import NuvemshopLogo from "@/utils/images/integrations/nuvemshop-logo.png";
import OnlineSoftwareLogo from "@/utils/images/integrations/online-software-logo.png";
import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";

type TSalesIntegrationPillMeta = {
	nome: string;
	/** Sem logo no repositório ainda (Phibo): a pílula mostra só o rótulo. */
	logo: StaticImageData | null;
};

export const SALES_INTEGRATION_META: Record<TDataSourceIntegrationTipoEnum, TSalesIntegrationPillMeta> = {
	"ONLINE-SOFTWARE": { nome: "Online Software", logo: OnlineSoftwareLogo },
	"CARDAPIO-WEB": { nome: "Cardápio Web", logo: CardapioWebLogo },
	"NUVEM-SHOP": { nome: "Nuvem Shop", logo: NuvemshopLogo },
	IFOOD: { nome: "iFood", logo: IfoodLogo },
	BLING: { nome: "Bling", logo: BlingLogo },
	"ERP-FLEX": { nome: "ERPFlex", logo: ErpFlexLogo },
	PHIBO: { nome: "Phibo", logo: null },
};

/** Rótulo legível da conexão: apelido quando existe, senão o nome do provedor. */
export function getSalesIntegrationLabel({ tipo, apelido }: { tipo: TDataSourceIntegrationTipoEnum; apelido: string | null }): string {
	return apelido?.trim() || SALES_INTEGRATION_META[tipo].nome;
}

export type TSalesIntegrationPillValue =
	| {
			tipo: TIntegrationTipoEnum;
			apelido: string | null;
	  }
	| null
	| undefined;

type SalesIntegrationPillProps = {
	integracao: TSalesIntegrationPillValue;
	className?: string;
};

/**
 * Proveniência da venda em uma geometria compacta para cards densos.
 * O logo comunica o provedor de relance; o apelido identifica a conexão concreta quando há mais
 * de uma conta do mesmo provedor. Sem apelido, o nome do provedor vira o fallback legível.
 */
export function SalesIntegrationPill({ integracao, className }: SalesIntegrationPillProps) {
	if (!integracao) return null;
	if (!DataSourceIntegrationTipoEnum.options.includes(integracao.tipo as TDataSourceIntegrationTipoEnum)) return null;

	const meta = SALES_INTEGRATION_META[integracao.tipo as TDataSourceIntegrationTipoEnum];
	if (!meta) return null;

	const label = getSalesIntegrationLabel({ tipo: integracao.tipo as TDataSourceIntegrationTipoEnum, apelido: integracao.apelido });
	const accessibleLabel = integracao.apelido?.trim() ? `${meta.nome}: ${integracao.apelido.trim()}` : meta.nome;

	return (
		<span
			title={accessibleLabel}
			aria-label={`Origem: ${accessibleLabel}`}
			className={cn(
				"inline-flex min-w-0 max-w-[12rem] items-center gap-1.5 rounded-full border border-border/60 bg-secondary/70 px-2 py-0.5 text-[0.65rem] font-semibold leading-4 text-foreground/80",
				className,
			)}
		>
			{meta.logo ? (
				<span className="inline-flex h-4 w-5 shrink-0 items-center justify-center">
					<Image src={meta.logo} alt="" width={24} height={16} className="h-3.5 w-5 object-contain" />
				</span>
			) : null}
			<span className="truncate">{label}</span>
		</span>
	);
}
