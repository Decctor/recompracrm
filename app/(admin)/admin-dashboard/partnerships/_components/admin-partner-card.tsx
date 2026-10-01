"use client";

import type { TGetAdminPlatformPartnersOutputDefault } from "@/app/api/admin/platform-partners/route";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Chip } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { DataList } from "@/components/ui/data-list";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { getStoreInitials } from "@/lib/platform-partnerships/earnings";
import { cn } from "@/lib/utils";
import { ArrowRight, Banknote, FileText, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import type { ReactNode } from "react";

export type TAdminPlatformPartner = TGetAdminPlatformPartnersOutputDefault["partners"][number];

const STATUS_CHIP: Record<TAdminPlatformPartner["status"], { label: string; variant: "warning" | "success" | "destructive" | "muted" }> = {
	PENDENTE_APROVACAO: { label: "Em análise", variant: "warning" },
	ATIVO: { label: "Ativo", variant: "success" },
	SUSPENSO: { label: "Suspenso", variant: "muted" },
	REJEITADO: { label: "Rejeitado", variant: "destructive" },
};

const PIX_TYPE_LABEL: Record<string, string> = { CPF: "CPF", CNPJ: "CNPJ", EMAIL: "Email", TELEFONE: "Telefone", ALEATORIA: "Aleatória" };

const centsToMoney = (value: number) => formatToMoney(value / 100);

type AdminPartnerCardProps = {
	partner: TAdminPlatformPartner;
	onApprove: () => void;
	isApproving: boolean;
	onReject: () => void;
	onGeneratePayout: () => void;
	isGeneratingPayout: boolean;
	onApproveChange: () => void;
	isApprovingChange: boolean;
	onRefuseChange: () => void;
	onOpenDocument: (tipo: "cpf" | "cnpj", pedido: boolean) => void;
};

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<p className="text-label text-muted-foreground">{title}</p>
			<DataList.Root>{children}</DataList.Root>
		</div>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<DataList.Item className="items-center py-1">
			<DataList.Label>{label}</DataList.Label>
			{/* Linha centralizada: o botão de copiar (24px) desalinhava rótulo e valor quando ancorados no topo. */}
			<DataList.Value className="items-center">{children}</DataList.Value>
		</DataList.Item>
	);
}

/**
 * Cartão do parceiro no admin. A pergunta que o financeiro traz para esta lista é "quem precisa de
 * mim?": cadastro em análise, pedido de alteração, dinheiro aprovado esperando payout. Então o que
 * pede ação vem primeiro e com tom (chip de status, callouts), e os dados ficam em grupos
 * escaneáveis, com a chave PIX copiável, em vez de uma linha de texto separada por hífens.
 */
export function AdminPartnerCard({
	partner,
	onApprove,
	isApproving,
	onReject,
	onGeneratePayout,
	isGeneratingPayout,
	onApproveChange,
	isApprovingChange,
	onRefuseChange,
	onOpenDocument,
}: AdminPartnerCardProps) {
	const status = STATUS_CHIP[partner.status];
	const pessoaJuridica = partner.tipoPessoa === "PESSOA_JURIDICA";
	const change = partner.alteracaoSolicitada && !partner.alteracaoSolicitada.motivoRecusa ? partner.alteracaoSolicitada : null;

	const validCommissions = partner.commissions.filter((commission) => commission.status !== "CANCELADA");
	const approvedForPayout = validCommissions
		.filter((commission) => commission.status === "APROVADA" && !commission.payoutId)
		.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);
	const pendingReview = validCommissions
		.filter((commission) => commission.status === "PENDENTE")
		.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);
	const paid = validCommissions
		.filter((commission) => commission.status === "PAGA")
		.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);
	const documents = (["cpf", "cnpj"] as const).filter((tipo) => partner.arquivos[tipo]);

	return (
		<article className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-numeric">
			<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
						{getStoreInitials(partner.nome)}
					</span>
					<div className="flex min-w-0 flex-col gap-1">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<h3 className="truncate font-semibold">{partner.nome}</h3>
							<Chip.Root variant={status.variant} shape="pill">
								<Chip.Label weight="semibold">{status.label}</Chip.Label>
							</Chip.Root>
						</div>
						<p className="text-xs text-muted-foreground">
							Cadastro em {formatDateAsLocale(partner.dataInsercao)}
							{partner.dataAprovacao ? ` · aprovado em ${formatDateAsLocale(partner.dataAprovacao)}` : ""}
						</p>
					</div>
				</div>

				<div className="flex shrink-0 flex-wrap gap-2">
					{partner.status === "PENDENTE_APROVACAO" ? (
						<Button size="sm" variant="outline" onClick={onReject} disabled={isApproving}>
							<ShieldX />
							Rejeitar
						</Button>
					) : null}
					{partner.status !== "ATIVO" ? (
						<Button size="sm" variant={partner.status === "PENDENTE_APROVACAO" ? "default" : "outline"} onClick={onApprove} disabled={isApproving}>
							{isApproving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
							{partner.status === "SUSPENSO" ? "Reativar" : "Aprovar"}
						</Button>
					) : (
						<Button
							size="sm"
							variant={approvedForPayout > 0 ? "default" : "outline"}
							onClick={onGeneratePayout}
							disabled={approvedForPayout === 0 || isGeneratingPayout}
							title={approvedForPayout === 0 ? "Nenhuma comissão aprovada fora de payout." : undefined}
						>
							{isGeneratingPayout ? <Loader2 className="animate-spin" /> : <Banknote />}
							{approvedForPayout > 0 ? `Gerar payout · ${centsToMoney(approvedForPayout)}` : "Sem valor para payout"}
						</Button>
					)}
				</div>
			</header>

			{change ? (
				<Callout.Root tone="warning">
					<Callout.Title>
						Pedido de alteração de dados
						{partner.dataSolicitacaoAlteracao ? ` · ${formatDateAsLocale(partner.dataSolicitacaoAlteracao)}` : ""}
					</Callout.Title>
					<Callout.Body>
						<DataList.Root>
							{change.chavePix ? (
								<Row label="Chave PIX">
									<span className="flex flex-wrap items-center justify-end gap-1">
										<span className="text-muted-foreground line-through">{partner.chavePix}</span>
										<ArrowRight className="size-3 shrink-0" />
										{change.chavePix} ({PIX_TYPE_LABEL[change.chavePixTipo ?? ""] ?? "—"})
									</span>
								</Row>
							) : null}
							{change.email ? (
								<Row label="Email">
									<span className="text-muted-foreground line-through">{partner.email}</span> <ArrowRight className="size-3 shrink-0" /> {change.email}
								</Row>
							) : null}
							{change.telefone ? (
								<Row label="Telefone">
									<span className="text-muted-foreground line-through">{partner.telefone}</span> <ArrowRight className="size-3 shrink-0" /> {change.telefone}
								</Row>
							) : null}
							{change.arquivos ? <Row label="Documento">Novo arquivo enviado</Row> : null}
						</DataList.Root>
					</Callout.Body>
					{change.motivo ? <Callout.Note>Parceiro: “{change.motivo}”</Callout.Note> : null}
					{change.chavePix ? <Callout.Note>A titularidade da nova chave foi autodeclarada; confira no documento antes de aprovar.</Callout.Note> : null}
					<Callout.Actions>
						<Button size="sm" onClick={onApproveChange} disabled={isApprovingChange}>
							{isApprovingChange ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
							Aprovar alteração
						</Button>
						<Button size="sm" variant="outline" onClick={onRefuseChange} disabled={isApprovingChange}>
							Recusar
						</Button>
						{(["cpf", "cnpj"] as const)
							.filter((tipo) => change.arquivos?.[tipo])
							.map((tipo) => (
								<Button key={tipo} size="sm" variant="ghost" onClick={() => onOpenDocument(tipo, true)}>
									<FileText />
									Ver novo documento
								</Button>
							))}
					</Callout.Actions>
				</Callout.Root>
			) : null}

			{partner.status === "REJEITADO" && partner.motivoRejeicao ? (
				<Callout.Root tone="danger">
					<Callout.Title>Motivo enviado ao parceiro</Callout.Title>
					<Callout.Description>{partner.motivoRejeicao}</Callout.Description>
				</Callout.Root>
			) : null}

			<div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
				<Group title="Contato">
					<Row label="Código">
						{partner.codigo}
						<CopyButton value={partner.codigo} label="Copiar código" className="-my-1" />
					</Row>
					<Row label="Email">{partner.email}</Row>
					<Row label="Telefone">{partner.telefone}</Row>
				</Group>
				<Group title={pessoaJuridica ? "Pessoa jurídica" : partner.tipoPessoa ? "Pessoa física" : "Documento"}>
					<Row label={pessoaJuridica ? "CNPJ" : "CPF"}>{partner.cpfCnpj}</Row>
					<Row label="Arquivo">
						{documents.length > 0
							? documents.map((tipo) => (
									<Button key={tipo} size="xs" variant="ghost" className="-my-1 -mr-2 text-primary" onClick={() => onOpenDocument(tipo, false)}>
										<FileText />
										Ver {tipo.toUpperCase()}
									</Button>
								))
							: null}
					</Row>
				</Group>
				<Group title="Recebimento">
					<Row label={`Chave PIX${partner.chavePixTipo ? ` (${PIX_TYPE_LABEL[partner.chavePixTipo]})` : ""}`}>
						{partner.chavePix}
						<CopyButton value={partner.chavePix} label="Copiar chave PIX" className="-my-1" />
					</Row>
					<Row label="Titular">{partner.dataConfirmacaoTitularPix ? `Confirmado em ${formatDateAsLocale(partner.dataConfirmacaoTitularPix)}` : null}</Row>
				</Group>
			</div>

			<footer className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
				<span>
					<b className="font-bold text-foreground">{partner.referrals.length}</b> {partner.referrals.length === 1 ? "loja indicada" : "lojas indicadas"}
				</span>
				<span>
					Pendente <b className="font-bold text-foreground">{centsToMoney(pendingReview)}</b>
				</span>
				<span>
					Aprovado <b className={cn("font-bold", approvedForPayout > 0 ? "text-primary" : "text-foreground")}>{centsToMoney(approvedForPayout)}</b>
				</span>
				<span>
					Pago <b className="font-bold text-foreground">{centsToMoney(paid)}</b>
				</span>
			</footer>
		</article>
	);
}
