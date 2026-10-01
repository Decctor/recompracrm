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
	resolveAdminPlatformPartnerChangeRequest,
	updateAdminPlatformPartner,
	updateAdminPlatformPartnerCommission,
} from "@/lib/mutations/platform-partnerships";
import {
	fetchAdminPlatformPartnerDocumentUrl,
	fetchAdminPlatformPartnerPayoutReceiptUrl,
	useAdminPlatformPartnerCommissions,
	useAdminPlatformPartnerPayouts,
	useAdminPlatformPartnerReferrals,
	useAdminPlatformPartners,
} from "@/lib/queries/platform-partnerships";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Building2, CheckCircle2, FileText, ReceiptText, Search, Users } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { ControlAdminPlatformPartnerPayout } from "@/components/Modals/Internal/PlatformPartners/ControlAdminPlatformPartnerPayout";
import { AdminPartnerCard } from "./_components/admin-partner-card";
import { RejectAdminPlatformPartner } from "@/components/Modals/Internal/PlatformPartners/RejectAdminPlatformPartner";
import { RefuseAdminPlatformPartnerChangeRequest } from "@/components/Modals/Internal/PlatformPartners/RefuseAdminPlatformPartnerChangeRequest";
import { toast } from "sonner";

function centsToMoney(value: number) {
	return formatToMoney(value / 100);
}

async function openSignedUrl(getUrl: () => Promise<string>) {
	// Abre a aba no clique (antes do await) para o navegador não bloquear o pop-up.
	const tab = window.open("", "_blank");
	try {
		const url = await getUrl();
		if (tab) tab.location.href = url;
		else window.location.href = url;
	} catch (error) {
		tab?.close();
		toast.error(getErrorMessage(error));
	}
}

export default function PlatformPartnershipsAdminPage() {
	const queryClient = useQueryClient();
	const [rejectingPartner, setRejectingPartner] = useState<{ id: string; nome: string } | null>(null);
	const [controlledPayoutId, setControlledPayoutId] = useState<string | null>(null);
	const [refusingChangePartner, setRefusingChangePartner] = useState<{ id: string; nome: string } | null>(null);
	const [commissionFilter, setCommissionFilter] = useState<"PENDENTE" | "APROVADA" | "TODAS">("PENDENTE");
	const [selectedCommissionIds, setSelectedCommissionIds] = useState<string[]>([]);
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

	const approveChangeRequestMutation = useMutation({
		mutationFn: resolveAdminPlatformPartnerChangeRequest,
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
			setSelectedCommissionIds([]);
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
							<AdminPartnerCard
								key={partner.id}
								partner={partner}
								onApprove={() => updatePartnerMutation.mutate({ partnerId: partner.id, partner: { status: "ATIVO" } })}
								isApproving={updatePartnerMutation.isPending && updatePartnerMutation.variables?.partnerId === partner.id}
								onReject={() => setRejectingPartner({ id: partner.id, nome: partner.nome })}
								onGeneratePayout={() =>
									createPayoutMutation.mutate({ partnerId: partner.id, competenciaInicio: null, competenciaFim: null, dataPrevista: null })
								}
								isGeneratingPayout={createPayoutMutation.isPending && createPayoutMutation.variables?.partnerId === partner.id}
								onApproveChange={() => approveChangeRequestMutation.mutate({ partnerId: partner.id, aprovar: true })}
								isApprovingChange={approveChangeRequestMutation.isPending && approveChangeRequestMutation.variables?.partnerId === partner.id}
								onRefuseChange={() => setRefusingChangePartner({ id: partner.id, nome: partner.nome })}
								onOpenDocument={(tipo, pedido) => openSignedUrl(() => fetchAdminPlatformPartnerDocumentUrl({ partnerId: partner.id, tipo, pedido }))}
							/>
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

				<TabsContent value="commissions" className="mt-4 flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{(["PENDENTE", "APROVADA", "TODAS"] as const).map((filter) => (
							<Button
								key={filter}
								size="sm"
								variant={commissionFilter === filter ? "default" : "outline"}
								onClick={() => {
									setCommissionFilter(filter);
									setSelectedCommissionIds([]);
								}}
							>
								{filter === "PENDENTE" ? "Pendentes" : filter === "APROVADA" ? "Aprovadas" : "Todas"} (
								{filter === "TODAS" ? commissions.length : commissions.filter((commission) => commission.status === filter).length})
							</Button>
						))}
						{selectedCommissionIds.length > 0 ? (
							<div className="ml-auto flex gap-2">
								<Button
									size="sm"
									className="gap-2"
									disabled={updateCommissionMutation.isPending}
									onClick={() => updateCommissionMutation.mutate({ commissionIds: selectedCommissionIds, status: "APROVADA" })}
								>
									<CheckCircle2 className="h-4 w-4" />
									Aprovar {selectedCommissionIds.length}
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setSelectedCommissionIds([])}>
									Limpar seleção
								</Button>
							</div>
						) : null}
					</div>
					{(() => {
						const visibleCommissions = commissions.filter((commission) => commissionFilter === "TODAS" || commission.status === commissionFilter);
						const selectable = visibleCommissions.filter((commission) => commission.status === "PENDENTE");
						const allSelected = selectable.length > 0 && selectable.every((commission) => selectedCommissionIds.includes(commission.id));
						return (
							<ListShell empty={visibleCommissions.length === 0} emptyText="Nenhuma comissao neste filtro.">
								{selectable.length > 0 ? (
									<label className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
										<Checkbox
											checked={allSelected}
											onCheckedChange={(checked) => setSelectedCommissionIds(checked === true ? selectable.map((commission) => commission.id) : [])}
										/>
										Selecionar todas as pendentes ({selectable.length})
									</label>
								) : null}
								{visibleCommissions.map((commission) => (
									<Row key={commission.id}>
										<div className="flex items-start gap-3">
											{commission.status === "PENDENTE" ? (
												<Checkbox
													className="mt-1"
													checked={selectedCommissionIds.includes(commission.id)}
													onCheckedChange={(checked) =>
														setSelectedCommissionIds((previous) =>
															checked === true ? [...previous, commission.id] : previous.filter((id) => id !== commission.id),
														)
													}
												/>
											) : null}
											<div>
												<p className="font-medium">{commission.partner.nome}</p>
												<p className="text-xs text-muted-foreground">
													{commission.organizacao?.nome ?? "Organizacao excluida"} - invoice #{commission.numeroInvoiceAssinatura} - elegível em{" "}
													{formatDateAsLocale(commission.dataElegibilidade)}
												</p>
											</div>
										</div>
										<Badge variant="outline">{commission.status}</Badge>
										<p className="text-sm font-semibold">{centsToMoney(commission.valorComissaoCentavos)}</p>
										<div className="flex justify-end gap-2">
											{commission.status === "PENDENTE" ? (
												<Button
													size="sm"
													variant="outline"
													className="gap-2"
													onClick={() => updateCommissionMutation.mutate({ commissionIds: [commission.id], status: "APROVADA" })}
												>
													<CheckCircle2 className="h-4 w-4" />
													Aprovar
												</Button>
											) : null}
											{commission.status !== "PAGA" && commission.status !== "CANCELADA" ? (
												<Button
													size="sm"
													variant="ghost"
													onClick={() => updateCommissionMutation.mutate({ commissionIds: [commission.id], status: "CANCELADA" })}
												>
													Cancelar
												</Button>
											) : null}
										</div>
									</Row>
								))}
							</ListShell>
						);
					})()}
				</TabsContent>

				<TabsContent value="payouts" className="mt-4">
					<ListShell empty={payouts.length === 0} emptyText="Nenhum payout.">
						{payouts.map((payout) => (
							<Row key={payout.id}>
								<div>
									<p className="font-medium">{payout.partner.nome}</p>
									<p className="text-xs text-muted-foreground">
										{formatDateAsLocale(payout.competenciaInicio)} - {formatDateAsLocale(payout.competenciaFim)}
										{payout.dataPrevista ? ` · previsto ${formatDateAsLocale(payout.dataPrevista)}` : ""}
										{payout.dataPagamento ? ` · pago ${formatDateAsLocale(payout.dataPagamento)}` : ""}
									</p>
									<p className="text-xs text-muted-foreground">PIX {payout.chavePixSnapshot ?? "—"}</p>
								</div>
								<Badge variant="outline">{payout.status}</Badge>
								<p className="text-sm font-semibold">{centsToMoney(payout.valorTotalCentavos)}</p>
								<div className="flex flex-wrap justify-end gap-2">
									{payout.comprovanteUrl ? (
										<Button
											size="sm"
											variant="outline"
											className="gap-2"
											onClick={() => openSignedUrl(() => fetchAdminPlatformPartnerPayoutReceiptUrl({ payoutId: payout.id }))}
										>
											<FileText className="h-4 w-4" />
											Ver comprovante
										</Button>
									) : null}
									{payout.status === "APROVADO" ? (
										<Button size="sm" className="gap-2" onClick={() => setControlledPayoutId(payout.id)}>
											<Banknote className="h-4 w-4" />
											Marcar como pago
										</Button>
									) : payout.status === "PAGO" ? (
										<Button size="sm" variant="ghost" onClick={() => setControlledPayoutId(payout.id)}>
											{payout.comprovanteUrl ? "Trocar comprovante" : "Anexar comprovante"}
										</Button>
									) : null}
								</div>
							</Row>
						))}
					</ListShell>
				</TabsContent>
			</Tabs>

			{refusingChangePartner ? (
				<RefuseAdminPlatformPartnerChangeRequest
					partner={refusingChangePartner}
					closeModal={() => setRefusingChangePartner(null)}
					callbacks={{ onSuccess: invalidateAll }}
				/>
			) : null}
			{rejectingPartner ? (
				<RejectAdminPlatformPartner partner={rejectingPartner} closeModal={() => setRejectingPartner(null)} callbacks={{ onSuccess: invalidateAll }} />
			) : null}
			{(() => {
				const payout = payouts.find((item) => item.id === controlledPayoutId);
				return payout ? (
					<ControlAdminPlatformPartnerPayout payout={payout} closeModal={() => setControlledPayoutId(null)} callbacks={{ onSuccess: invalidateAll }} />
				) : null;
			})()}
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
