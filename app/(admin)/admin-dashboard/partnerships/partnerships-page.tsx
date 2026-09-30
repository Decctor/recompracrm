"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import {
	createAdminPlatformPartnerPayout,
	updateAdminPlatformPartner,
	updateAdminPlatformPartnerCommission,
} from "@/lib/mutations/platform-partnerships";
import {
	fetchAdminPlatformPartnerDocumentUrl,
	useAdminPlatformPartnerCommissions,
	useAdminPlatformPartnerPayouts,
	useAdminPlatformPartnerReferrals,
	useAdminPlatformPartners,
} from "@/lib/queries/platform-partnerships";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Building2, CheckCircle2, FileText, Handshake, ReceiptText, Search, ShieldCheck, ShieldX, Users } from "lucide-react";
import type React from "react";
import { toast } from "sonner";

function centsToMoney(value: number) {
	return formatToMoney(value / 100);
}

const PERSON_TYPE_LABEL: Record<string, string> = { PESSOA_FISICA: "PF", PESSOA_JURIDICA: "PJ" };

async function openPartnerDocument(partnerId: string, tipo: "cpf" | "cnpj") {
	// Abre a aba no clique (antes do await) para o navegador não bloquear o pop-up.
	const tab = window.open("", "_blank");
	try {
		const url = await fetchAdminPlatformPartnerDocumentUrl({ partnerId, tipo });
		if (tab) tab.location.href = url;
		else window.location.href = url;
	} catch (error) {
		tab?.close();
		toast.error(getErrorMessage(error));
	}
}

export default function PlatformPartnershipsAdminPage() {
	const queryClient = useQueryClient();
	const partnersQuery = useAdminPlatformPartners({ initialParams: { page: 1, search: "", status: null } });
	const referralsQuery = useAdminPlatformPartnerReferrals({});
	const commissionsQuery = useAdminPlatformPartnerCommissions({});
	const payoutsQuery = useAdminPlatformPartnerPayouts({});

	const invalidateAll = async () => {
		await queryClient.invalidateQueries({ queryKey: partnersQuery.queryKey });
		await queryClient.invalidateQueries({ queryKey: referralsQuery.queryKey });
		await queryClient.invalidateQueries({ queryKey: commissionsQuery.queryKey });
		await queryClient.invalidateQueries({ queryKey: payoutsQuery.queryKey });
	};

	const updatePartnerMutation = useMutation({
		mutationFn: updateAdminPlatformPartner,
		onSuccess: async (data) => {
			toast.success(data.message);
			await invalidateAll();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const updateCommissionMutation = useMutation({
		mutationFn: updateAdminPlatformPartnerCommission,
		onSuccess: async (data) => {
			toast.success(data.message);
			await invalidateAll();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const createPayoutMutation = useMutation({
		mutationFn: createAdminPlatformPartnerPayout,
		onSuccess: async (data) => {
			toast.success(data.message);
			await invalidateAll();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	if (partnersQuery.isLoading || referralsQuery.isLoading || commissionsQuery.isLoading || payoutsQuery.isLoading) return <LoadingComponent />;
	if (partnersQuery.isError) return <ErrorComponent msg={getErrorMessage(partnersQuery.error)} />;

	const partners = partnersQuery.data?.default?.partners ?? [];
	const referrals = referralsQuery.data ?? [];
	const commissions = commissionsQuery.data ?? [];
	const payouts = payoutsQuery.data ?? [];
	const totalPendingCommission = commissions
		.filter((commission) => commission.status === "PENDENTE" || commission.status === "APROVADA")
		.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);
	const totalPaidCommission = commissions
		.filter((commission) => commission.status === "PAGA")
		.reduce((total, commission) => total + commission.valorComissaoCentavos, 0);

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex flex-col gap-1">
				<p className="text-xs font-semibold uppercase text-muted-foreground">Programa de Parcerias</p>
				<h1 className="text-2xl font-bold tracking-tight">Parcerias</h1>
			</div>

			<div className="grid gap-3 md:grid-cols-4">
				<StatUnitCard title="PARCEIROS" icon={<Users className="h-4 w-4" />} current={{ value: partners.length, format: (value) => value.toString() }} />
				<StatUnitCard
					title="ORGANIZACOES"
					icon={<Building2 className="h-4 w-4" />}
					current={{ value: referrals.length, format: (value) => value.toString() }}
				/>
				<StatUnitCard title="A PAGAR" icon={<ReceiptText className="h-4 w-4" />} current={{ value: totalPendingCommission, format: centsToMoney }} />
				<StatUnitCard title="PAGO" icon={<Banknote className="h-4 w-4" />} current={{ value: totalPaidCommission, format: centsToMoney }} />
			</div>

			<Tabs defaultValue="partners">
				<TabsList variant="page">
					<TabsTrigger value="partners">
						<Users className="h-4 w-4 min-h-4 min-w-4" />
						Parceiros
					</TabsTrigger>
					<TabsTrigger value="referrals">
						<Building2 className="h-4 w-4 min-h-4 min-w-4" />
						Organizações
					</TabsTrigger>
					<TabsTrigger value="commissions">
						<ReceiptText className="h-4 w-4 min-h-4 min-w-4" />
						Comissões
					</TabsTrigger>
					<TabsTrigger value="payouts">
						<Banknote className="h-4 w-4 min-h-4 min-w-4" />
						Payouts
					</TabsTrigger>
				</TabsList>

				<TabsContent value="partners" className="mt-4 flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<div className="relative grow">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={partnersQuery.queryParams.search ?? ""}
								onChange={(event) => partnersQuery.updateQueryParams({ search: event.target.value, page: 1 })}
								placeholder="Pesquisar parceiro..."
								className="pl-9"
							/>
						</div>
					</div>
					<GeneralPaginationComponent
						activePage={partnersQuery.queryParams.page}
						queryLoading={partnersQuery.isLoading}
						selectPage={(page) => partnersQuery.updateQueryParams({ page })}
						totalPages={partnersQuery.data?.default?.totalPages ?? 0}
						itemsMatchedText={`${partnersQuery.data?.default?.partnersMatched ?? 0} parceiros encontrados.`}
						itemsShowingText={`Mostrando ${partners.length} parceiros.`}
					/>
					<div className="flex flex-col gap-2">
						{partners.map((partner) => (
							<div key={partner.id} className="rounded-lg border bg-card p-4">
								<div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
									<div className="flex items-start gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
											<Handshake className="h-5 w-5" />
										</div>
										<div>
											<div className="flex items-center gap-2">
												<p className="font-semibold">{partner.nome}</p>
												<Badge variant="outline">{partner.status}</Badge>
											</div>
											<p className="text-sm text-muted-foreground">
												{partner.codigo} - {partner.email} - {partner.telefone}
											</p>
											<p className="text-sm text-muted-foreground">
												{partner.tipoPessoa ? `${PERSON_TYPE_LABEL[partner.tipoPessoa]} · ` : ""}
												{partner.cpfCnpj} - PIX {partner.chavePixTipo ? `(${partner.chavePixTipo}) ` : ""}
												{partner.chavePix}
												{partner.dataConfirmacaoTitularPix ? ` · titular confirmado em ${formatDateAsLocale(partner.dataConfirmacaoTitularPix)}` : ""}
											</p>
											<p className="text-xs text-muted-foreground">
												{partner.referrals.length} organizacoes, {partner.commissions.length} comissoes, {partner.payouts.length} payouts
											</p>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{(["cpf", "cnpj"] as const)
											.filter((tipo) => partner.arquivos[tipo])
											.map((tipo) => (
												<Button key={tipo} size="sm" variant="outline" className="gap-2" onClick={() => openPartnerDocument(partner.id, tipo)}>
													<FileText className="h-4 w-4" />
													Documento {tipo.toUpperCase()}
												</Button>
											))}
										{partner.status !== "ATIVO" ? (
											<Button size="sm" className="gap-2" onClick={() => updatePartnerMutation.mutate({ partnerId: partner.id, partner: { status: "ATIVO" } })}>
												<ShieldCheck className="h-4 w-4" />
												Aprovar
											</Button>
										) : null}
										{partner.status === "PENDENTE_APROVACAO" ? (
											<Button
												size="sm"
												variant="outline"
												className="gap-2"
												onClick={() => updatePartnerMutation.mutate({ partnerId: partner.id, partner: { status: "REJEITADO" } })}
											>
												<ShieldX className="h-4 w-4" />
												Rejeitar
											</Button>
										) : null}
										<Button
											size="sm"
											variant="outline"
											onClick={() => createPayoutMutation.mutate({ partnerId: partner.id, competenciaInicio: null, competenciaFim: null, dataPrevista: null })}
										>
											Gerar payout
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				</TabsContent>

				<TabsContent value="referrals" className="mt-4">
					<ListShell empty={referrals.length === 0} emptyText="Nenhuma organizacao indicada.">
						{referrals.map((referral) => (
							<Row key={referral.id}>
								<div>
									<p className="font-medium">{referral.organizacao?.nome ?? referral.organizacaoNomeSnapshot ?? "Organizacao excluida"}</p>
									<p className="text-xs text-muted-foreground">
										{referral.partner.nome} - {formatDateAsLocale(referral.dataOnboarding)}
									</p>
								</div>
								<Badge variant="outline">{referral.organizacao?.assinaturaPlano ?? "SEM PLANO"}</Badge>
								<Badge>{referral.status}</Badge>
								<p className="text-sm font-semibold">
									{centsToMoney(referral.commissions.reduce((total, commission) => total + commission.valorComissaoCentavos, 0))}
								</p>
							</Row>
						))}
					</ListShell>
				</TabsContent>

				<TabsContent value="commissions" className="mt-4">
					<ListShell empty={commissions.length === 0} emptyText="Nenhuma comissao.">
						{commissions.map((commission) => (
							<Row key={commission.id}>
								<div>
									<p className="font-medium">{commission.partner.nome}</p>
									<p className="text-xs text-muted-foreground">
										{commission.organizacao?.nome ?? "Organizacao excluida"} - invoice #{commission.numeroInvoiceAssinatura}
									</p>
								</div>
								<Badge variant="outline">{commission.status}</Badge>
								<p className="text-sm font-semibold">{centsToMoney(commission.valorComissaoCentavos)}</p>
								<div className="flex justify-end gap-2">
									{commission.status === "PENDENTE" ? (
										<Button
											size="sm"
											variant="outline"
											className="gap-2"
											onClick={() => updateCommissionMutation.mutate({ commissionId: commission.id, status: "APROVADA" })}
										>
											<CheckCircle2 className="h-4 w-4" />
											Aprovar
										</Button>
									) : null}
									{commission.status !== "PAGA" ? (
										<Button size="sm" variant="ghost" onClick={() => updateCommissionMutation.mutate({ commissionId: commission.id, status: "CANCELADA" })}>
											Cancelar
										</Button>
									) : null}
								</div>
							</Row>
						))}
					</ListShell>
				</TabsContent>

				<TabsContent value="payouts" className="mt-4">
					<ListShell empty={payouts.length === 0} emptyText="Nenhum payout.">
						{payouts.map((payout) => (
							<Row key={payout.id}>
								<div>
									<p className="font-medium">{payout.partner.nome}</p>
									<p className="text-xs text-muted-foreground">
										{formatDateAsLocale(payout.competenciaInicio)} - {formatDateAsLocale(payout.competenciaFim)}
									</p>
								</div>
								<Badge variant="outline">{payout.status}</Badge>
								<p className="text-sm font-semibold">{centsToMoney(payout.valorTotalCentavos)}</p>
								<p className="text-sm text-muted-foreground">{payout.chavePixSnapshot}</p>
							</Row>
						))}
					</ListShell>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function ListShell({ children, empty, emptyText }: { children: React.ReactNode; empty: boolean; emptyText: string }) {
	if (empty) return <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">{emptyText}</div>;
	return <div className="overflow-hidden rounded-lg border bg-card">{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
	return <div className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-4 md:items-center">{children}</div>;
}
