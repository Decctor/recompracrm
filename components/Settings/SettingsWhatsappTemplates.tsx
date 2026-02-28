import type { TGetWhatsappConnectionOutput } from "@/app/api/whatsapp-connections/route";
import type { TGetWhatsappTemplatesOutputDefault } from "@/app/api/whatsapp-templates/route";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { createWhatsappTemplatePhone, syncWhatsappTemplates } from "@/lib/mutations/whatsapp-templates";
import { useWhatsappConnection } from "@/lib/queries/whatsapp-connections";
import { useWhatsappTemplates } from "@/lib/queries/whatsapp-templates";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleGauge, Diamond, Pencil, Phone, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { BsCalendarPlus } from "react-icons/bs";
import { toast } from "sonner";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";
import ControlWhatsappTemplate from "../Modals/WhatsappTemplates/ControlWhatsappTemplate";
import NewWhatsappTemplate from "../Modals/WhatsappTemplates/NewWhatsappTemplate";
import GeneralPaginationComponent from "../Utils/Pagination";
import { LoadingButton } from "../loading-button";
import { Button } from "../ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
type SettingsWhatsappTemplatesProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function SettingsWhatsappTemplates({ user, membership }: SettingsWhatsappTemplatesProps) {
	const queryClient = useQueryClient();
	const [newWhatsappTemplateModalIsOpen, setNewWhatsappTemplateModalIsOpen] = useState(false);
	const [editWhatsappTemplateId, setEditWhatsappTemplateId] = useState<string | null>(null);

	const { data: whatsappConnection } = useWhatsappConnection();
	const {
		data: whatsappTemplatesResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		params,
		updateParams,
	} = useWhatsappTemplates({ initialParams: { search: "" } });
	const whatsappTemplates = whatsappTemplatesResult?.whatsappTemplates;
	const whatsappTemplatesShowing = whatsappTemplates ? whatsappTemplates.length : 0;
	const whatsappTemplatesMatched = whatsappTemplatesResult?.whatsappTemplatesMatched || 0;
	const totalPages = whatsappTemplatesResult?.totalPages || 0;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	const { mutate: handleSyncMutation, isPending: isSyncingMutation } = useMutation({
		mutationFn: syncWhatsappTemplates,
		onMutate: handleOnMutate,
		onSuccess: (data) => {
			toast.success(data.message, {
				description: `${data.data.summary.totalCreated} templates criados, ${data.data.summary.totalUpdated} atualizados`,
			});
		},
		onError: (error) => {
			toast.error("Erro ao sincronizar templates", {
				description: getErrorMessage(error),
			});
		},
		onSettled: handleOnSettled,
	});

	const whatsappConnectionPhones = whatsappConnection?.telefones ?? [];
	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end gap-2">
				<Button
					size="sm"
					variant="outline"
					className="flex items-center gap-2"
					onClick={() => handleSyncMutation({})}
					disabled={isSyncingMutation || isLoading}
				>
					<RefreshCw className={cn("w-4 h-4 min-w-4 min-h-4", isSyncingMutation && "animate-spin")} />
					{isSyncingMutation ? "SINCRONIZANDO..." : "SINCRONIZAR"}
				</Button>
				<Button size="sm" className="flex items-center gap-2" onClick={() => setNewWhatsappTemplateModalIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO TEMPLATE
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={params.page}
				queryLoading={isLoading}
				selectPage={(page) => updateParams({ page })}
				totalPages={totalPages || 0}
				itemsMatchedText={
					whatsappTemplatesMatched > 0 ? `${whatsappTemplatesMatched} templates encontrados.` : `${whatsappTemplatesMatched} template encontrado.`
				}
				itemsShowingText={
					whatsappTemplatesShowing > 0 ? `Mostrando ${whatsappTemplatesShowing} templates.` : `Mostrando ${whatsappTemplatesShowing} template.`
				}
			/>
			<div className="w-full flex flex-col gap-1.5">
				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
				{isSuccess && whatsappTemplates ? (
					whatsappTemplates.length > 0 ? (
						whatsappTemplates.map((whatsappTemplate, index: number) => (
							<WhatsappTemplateCard
								key={whatsappTemplate.id}
								whatsappTemplate={whatsappTemplate}
								whatsappConnectionPhones={whatsappConnectionPhones}
								onEditClick={() => setEditWhatsappTemplateId(whatsappTemplate.id)}
								callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
							/>
						))
					) : (
						<p className="w-full tracking-tight text-center">Nenhum template encontrado.</p>
					)
				) : null}
			</div>
			{newWhatsappTemplateModalIsOpen ? (
				<NewWhatsappTemplate
					organizationId={membership.organizacao.id}
					closeMenu={() => setNewWhatsappTemplateModalIsOpen(false)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
			{editWhatsappTemplateId ? (
				<ControlWhatsappTemplate
					whatsappTemplateId={editWhatsappTemplateId}
					organizationId={membership.organizacao.id}
					closeMenu={() => setEditWhatsappTemplateId(null)}
					callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
				/>
			) : null}
		</div>
	);
}

type WhatsappTemplateCardProps = {
	whatsappTemplate: TGetWhatsappTemplatesOutputDefault["whatsappTemplates"][number];
	whatsappConnectionPhones: Exclude<TGetWhatsappConnectionOutput["data"], null>["telefones"];
	onEditClick: () => void;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
function WhatsappTemplateCard({ whatsappTemplate, whatsappConnectionPhones, onEditClick, callbacks }: WhatsappTemplateCardProps) {
	const { mutate: handleCreateWhatsappTemplatePhoneMutation, isPending: isCreatingWhatsappTemplatePhone } = useMutation({
		mutationKey: ["create-whatsapp-template-phone"],
		mutationFn: createWhatsappTemplatePhone,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});
	const PhoneItemCard = useMemo(
		() =>
			({
				connectionPhone,
				handleCreateTemplatePhone,
				isCreatingWhatsappTemplatePhone,
			}: {
				connectionPhone: Exclude<TGetWhatsappConnectionOutput["data"], null>["telefones"][number];
				handleCreateTemplatePhone: (id: string) => void;
				isCreatingWhatsappTemplatePhone: boolean;
			}) => {
				const phoneTemplateData = whatsappTemplate.telefones.find((t) => t.telefone.id === connectionPhone.id);
				return (
					<div className="w-full flex items-center gap-2 justify-between">
						<div className="flex items-center gap-1.5">
							<Phone className="w-3 h-3 min-w-3 min-h-3" />
							<span className="text-xs font-medium text-primary/80">{connectionPhone.nome}</span>
						</div>
						<div className="flex items-center gap-1.5">
							{phoneTemplateData ? (
								<div className="flex items-center gap-1.5">
									<div
										className={cn("px-2 py-0.5 rounded-lg text-[0.65rem] font-bold", {
											"bg-blue-500 text-white": phoneTemplateData.status === "APROVADO",
											"bg-primary/20 text-primary": phoneTemplateData.status === "PENDENTE",
											"bg-red-500 text-white": phoneTemplateData.status === "REJEITADO",
											"bg-orange-500 text-white": phoneTemplateData.status === "PAUSADO",
											"bg-gray-500 text-white": phoneTemplateData.status === "DESABILITADO" || phoneTemplateData.status === "RASCUNHO",
										})}
									>
										{phoneTemplateData.status}
									</div>
									<div className="flex items-center gap-1">
										<CircleGauge className="w-4 h-4 min-w-4 min-h-4" />
										<p className="text-[0.65rem] font-medium text-primary/80">{phoneTemplateData.qualidade}</p>
									</div>
								</div>
							) : (
								<LoadingButton
									onClick={() => handleCreateTemplatePhone(connectionPhone.id)}
									variant="ghost"
									size="fit"
									className="flex items-center gap-1.5 text-[0.65rem] px-2 py-1 rounded-xl"
									loading={isCreatingWhatsappTemplatePhone}
								>
									ADICIONAR
								</LoadingButton>
							)}
						</div>
					</div>
				);
			},
		[whatsappTemplate.telefones, whatsappConnectionPhones],
	);
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex flex-col gap-2">
				<div className="w-full flex items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<span className={"text-sm leading-none font-bold tracking-tight font-mono"}>TEMPLATE</span>
						<p className="text-xs px-2 py-1 rounded-lg bg-primary/10">{whatsappTemplate.nome}</p>
					</div>
					<div className="flex items-center gap-2">
						{whatsappConnectionPhones.length > 0 && (
							<HoverCard>
								<HoverCardTrigger asChild>
									<div className="flex items-center gap-1 text-xs text-muted-foreground">
										<Phone className="w-3 h-3" />
										<span>
											{whatsappTemplate.telefonesAprovados}/{whatsappConnectionPhones.length}
										</span>
									</div>
								</HoverCardTrigger>
								<HoverCardContent className="flex flex-col gap-3 w-72 p-3">
									<h3 className="text-xs font-medium tracking-tight">TELEFONES CONECTADOS</h3>
									<div className="w-full flex flex-col gap-2">
										{whatsappConnectionPhones.map((telefone) => (
											<PhoneItemCard
												key={telefone.id}
												connectionPhone={telefone}
												handleCreateTemplatePhone={(phoneId) =>
													handleCreateWhatsappTemplatePhoneMutation({ whatsappTemplatePhone: { templateId: whatsappTemplate.id, telefoneId: phoneId } })
												}
												isCreatingWhatsappTemplatePhone={isCreatingWhatsappTemplatePhone}
											/>
										))}
									</div>
								</HoverCardContent>
							</HoverCard>
						)}
						<div
							className={cn("px-2 py-0.5 rounded-lg text-[0.65rem] font-bold", {
								"bg-blue-500 text-white": whatsappTemplate.statusGeral === "APROVADO",
								"bg-primary/20 text-primary": whatsappTemplate.statusGeral === "PENDENTE",
								"bg-red-500 text-white": whatsappTemplate.statusGeral === "REJEITADO",
								"bg-orange-500 text-white": whatsappTemplate.statusGeral === "PAUSADO",
								"bg-gray-500 text-white": whatsappTemplate.statusGeral === "DESABILITADO" || whatsappTemplate.statusGeral === "RASCUNHO",
							})}
						>
							{whatsappTemplate.statusGeral}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1">
						<Diamond className="w-4 h-4 min-w-4 min-h-4" />
						<p className="text-xs font-medium text-primary/80">{whatsappTemplate.categoria}</p>
					</div>
					<div className="flex items-center gap-1">
						<CircleGauge className="w-4 h-4 min-w-4 min-h-4" />
						<p className="text-xs font-medium text-primary/80">{whatsappTemplate.qualidadeGeral}</p>
					</div>
				</div>
			</div>
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<BsCalendarPlus className="w-4 h-4 min-w-4 min-h-4" />
					<p className="text-xs font-medium text-primary/80">{formatDateAsLocale(whatsappTemplate.dataInsercao)}</p>
				</div>
				{/** GENERAL TEMPLATES ARE NOT EDITABLE (THOSE WITHOUT ORGANIZATION ID) */}
				{whatsappTemplate.organizacaoId ? (
					<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={onEditClick}>
						<Pencil className="w-3 min-w-3 h-3 min-h-3" />
						EDITAR
					</Button>
				) : null}
			</div>
		</div>
	);
}
