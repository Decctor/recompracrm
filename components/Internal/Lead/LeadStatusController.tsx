import type { TUpdateLeadInput } from "@/app/api/admin/crm/leads/route";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { updateInternalLead } from "@/lib/mutations/crm";
import { cn } from "@/lib/utils";
import type { TInternalLeadStatusCRMEnum } from "@/schemas/enums";
import { InternalLeadStatusCRMOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Funnel } from "lucide-react";
import { toast } from "sonner";

type LeadStatusControllerProps = {
	leadId: string;
	leadStatus: TInternalLeadStatusCRMEnum;
	callbacks?: {
		onMutate?: (variables: TUpdateLeadInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function LeadStatusController({ leadId, leadStatus, callbacks }: LeadStatusControllerProps) {
	const { mutate: updateLeadStatus } = useMutation({
		mutationKey: ["update-internal-lead-status"],
		mutationFn: updateInternalLead,
		onMutate: (variables) => {
			if (callbacks?.onMutate) callbacks.onMutate(variables);
		},
		onSuccess: (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});
	return (
		<div className="w-full flex flex-col gap-1 w-full px-3 py-2 rounded-xl md:rounded-full bg-secondary">
			<div className="flex items-center gap-1 ml-4">
				<Funnel className="w-4 h-4" />
				<h3 className="text-xs font-semibold tracking-tight">ESTÁGIO DO LEAD</h3>
			</div>
			<div className="w-full flex flex-row flex-wrap items-center gap-1.5 ">
				{InternalLeadStatusCRMOptions.map((status) => (
					<Button
						key={status.id}
						variant="ghost"
						size="xs"
						className={cn("text-xs w-1/2 md:w-auto flex-1 rounded-full py-4 hover:bg-primary/80 hover:text-primary-foreground", {
							"bg-primary text-primary-foreground": leadStatus === status.value,
							"bg-secondary text-secondary-foreground": leadStatus !== status.value,
						})}
						onClick={() => updateLeadStatus({ leadId, lead: { statusCRM: status.value } })}
					>
						{status.label}
					</Button>
				))}
			</div>
		</div>
	);
}
