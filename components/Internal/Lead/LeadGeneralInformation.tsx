import type { TGetLeadsOutputById, TUpdateLeadInput } from "@/app/api/admin/crm/leads/route";
import ControlLead from "@/components/Modals/Internal/Leads/ControlLead";
import { Button } from "@/components/ui/button";
import SectionWrapper from "@/components/ui/section-wrapper";
import { formatToMoney } from "@/lib/formatting";
import { getProbabilityTier } from "@/utils/select-options";
import { BriefcaseBusiness, Building2, DollarSign, Funnel, Globe, IdCard, Mail, Pencil, Percent, Phone, TextIcon, User } from "lucide-react";
import { useMemo, useState } from "react";

type LeadGeneralInformationProps = {
	lead: TGetLeadsOutputById;
	updateCallbacks?: {
		onMutate?: (variables: TUpdateLeadInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function LeadGeneralInformation({ lead, updateCallbacks }: LeadGeneralInformationProps) {
	const [editLeadModalOpen, setEditLeadModalOpen] = useState(false);
	const probabilityTier = useMemo(() => getProbabilityTier(lead.probabilidade), [lead.probabilidade]);
	return (
		<SectionWrapper
			title="INFORMAÇÕES DO LEAD"
			icon={<Funnel className="w-4 h-4" />}
			actions={
				<Button variant="ghost" size="xs" onClick={() => setEditLeadModalOpen(true)} className="flex items-center gap-1">
					<Pencil className="w-4 h-4 min-w-4 min-h-4" />
					EDITAR
				</Button>
			}
		>
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
							<Percent className="w-4 h-4 min-w-4 min-h-4 shrink-0" />
							<h3 className="text-sm font-semibold tracking-tighter text-primary/80 shrink-0">PROBABILIDADE</h3>
							{probabilityTier ? (
								<span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${probabilityTier.className}`}>
									<span>{probabilityTier.label}</span>
									<span className="opacity-90">({lead.probabilidade}%)</span>
								</span>
							) : (
								<span className="text-sm font-semibold tracking-tight text-muted-foreground">—</span>
							)}
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
			{editLeadModalOpen && <ControlLead leadId={lead.id} closeModal={() => setEditLeadModalOpen(false)} callbacks={updateCallbacks} />}
		</SectionWrapper>
	);
}
