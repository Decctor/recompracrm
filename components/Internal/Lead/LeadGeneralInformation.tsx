import type { TGetLeadsOutputById } from "@/app/api/admin/crm/leads/route";
import SectionWrapper from "@/components/ui/section-wrapper";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { BriefcaseBusiness, Building2, DollarSign, Funnel, Globe, IdCard, Mail, Percent, Phone, TextIcon, User } from "lucide-react";

type LeadGeneralInformationProps = {
	lead: TGetLeadsOutputById;
};
export default function LeadGeneralInformation({ lead }: LeadGeneralInformationProps) {
	return (
		<SectionWrapper title="INFORMAÇÕES DO LEAD" icon={<Funnel className="w-4 h-4" />}>
			<div className="flex w-full grow flex-col gap-4">
				<div className="w-full flex flex-col gap-2">
					<h1 className="text-xs leading-none tracking-tight">INFORMAÇÕES GERAIS</h1>
					<div className="w-full flex flex-col gap-1.5">
						<div className="w-full flex items-center gap-1.5">
							<Funnel className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">TÍTULO</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.titulo}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<TextIcon className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">DESCRIÇÃO</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.descricao}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<DollarSign className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">VALOR</h3>
							<h3 className="text-sm font-semibold tracking-tight">{formatToMoney(lead.valor || 0)}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Percent className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">PROBABILIDADE</h3>
							<h3 className="text-sm font-semibold tracking-tight">{formatDecimalPlaces(lead.probabilidade || 0, 1)}%</h3>
						</div>
					</div>
				</div>
				<div className="w-full flex flex-col gap-2">
					<h1 className="text-xs leading-none tracking-tight">INFORMAÇÕES DA EMPRESA</h1>
					<div className="w-full flex flex-col gap-1.5">
						<div className="w-full flex items-center gap-1.5">
							<Building2 className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">NOME</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.organizacaoNome}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<IdCard className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">CNPJ</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.organizacaoCnpj}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Phone className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">TELEFONE</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.organizacaoTelefone || "NÃO INFORMADO"}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Mail className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">EMAIL</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.organizacaoEmail || "NÃO INFORMADO"}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Globe className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">SITE</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.organizacaoSite || "NÃO INFORMADO"}</h3>
						</div>
					</div>
				</div>
				<div className="w-full flex flex-col gap-2">
					<h1 className="text-xs leading-none tracking-tight">INFORMAÇÕES DO CONTATO</h1>
					<div className="w-full flex flex-col gap-1.5">
						<div className="w-full flex items-center gap-1.5">
							<User className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">NOME</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.contatoNome}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<BriefcaseBusiness className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">CARGO</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.contatoCargo || "NÃO INFORMADO"}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Phone className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">TELEFONE</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.contatoTelefone || "NÃO INFORMADO"}</h3>
						</div>
						<div className="w-full flex items-center gap-1.5">
							<Mail className="w-4 h-4" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80">EMAIL</h3>
							<h3 className="text-sm font-semibold tracking-tight">{lead.contatoEmail || "NÃO INFORMADO"}</h3>
						</div>
					</div>
				</div>
			</div>
		</SectionWrapper>
	);
}
