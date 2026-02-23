import type { TGetWhatsappTemplatesOutputDefault } from "@/app/api/whatsapp-templates/route";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { syncWhatsappTemplates } from "@/lib/mutations/whatsapp-templates";
import { useWhatsappTemplates } from "@/lib/queries/whatsapp-templates";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleGauge, Diamond, Pencil, Phone, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BsCalendarPlus } from "react-icons/bs";
import { toast } from "sonner";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";
import ControlWhatsappTemplate from "../Modals/WhatsappTemplates/ControlWhatsappTemplate";
import NewWhatsappTemplate from "../Modals/WhatsappTemplates/NewWhatsappTemplate";
import GeneralPaginationComponent from "../Utils/Pagination";
import { Button } from "../ui/button";
type SettingsWhatsappTemplatesProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};
export default function SettingsWhatsappTemplates({ user, membership }: SettingsWhatsappTemplatesProps) {
	const queryClient = useQueryClient();
	const [newWhatsappTemplateModalIsOpen, setNewWhatsappTemplateModalIsOpen] = useState(false);
	const [editWhatsappTemplateId, setEditWhatsappTemplateId] = useState<string | null>(null);
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
								onEditClick={() => setEditWhatsappTemplateId(whatsappTemplate.id)}
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
	onEditClick: () => void;
};
function WhatsappTemplateCard({ whatsappTemplate, onEditClick }: WhatsappTemplateCardProps) {
	return (
		<div className={cn("bg-card border-primary/20 flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex flex-col gap-2">
				<div className="w-full flex items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<span className={"text-sm leading-none font-bold tracking-tight font-mono"}>TEMPLATE</span>
						<p className="text-xs px-2 py-1 rounded-lg bg-primary/10">{whatsappTemplate.nome}</p>
					</div>
					<div className="flex items-center gap-2">
						{whatsappTemplate.telefonesTotal > 0 && (
							<div className="flex items-center gap-1 text-xs text-muted-foreground">
								<Phone className="w-3 h-3" />
								<span>
									{whatsappTemplate.telefonesAprovados}/{whatsappTemplate.telefonesTotal}
								</span>
							</div>
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
