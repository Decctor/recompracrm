import { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import { formatToPhone } from "@/lib/formatting";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import { PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { AnimatedSpinner, MetaIcon, RecompraCRMIconColorful, WhatsappIcon } from "../icons";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

function getConnectionPhones(connections: TGetWhatsappConnectionsOutput["data"]) {
	return (
		connections
			.map((c) =>
				c.telefones.map((t) => ({
					phoneId: t.id,
					phoneName: t.nome,
					phoneNumber: t.numero,
					connectionType: c.tipoConexao,
				})),
			)
			.flat() || []
	);
}
type TConnectionPhone = ReturnType<typeof getConnectionPhones>[number];

export default function WhatsappConnectionsPills() {
	const { data: whatsappConnections, isPending, isError, isSuccess } = useWhatsappConnections();

	const connectionPhones = getConnectionPhones(whatsappConnections || []);
	return (
		<div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
			{isPending ? (
				<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
					<AnimatedSpinner className="w-4 h-4 min-w-4 min-h-4" />
					Buscando conexões...
				</span>
			) : null}
			{isError ? (
				<span className="flex items-center gap-1.5 text-sm text-destructive">
					<XIcon className="w-4 h-4 min-w-4 min-h-4" />
					Erro ao buscar conexões
				</span>
			) : null}
			{isSuccess ? (
				<>
					{connectionPhones.map((connection) => (
						<ConnectionPill key={connection.phoneId} connection={connection} />
					))}
					<Button variant={connectionPhones.length > 0 ? "secondary" : "default"} size="sm" className="shrink-0 gap-1.5 px-2.5 sm:px-3" asChild>
						<Link href="/api/integrations/whatsapp/auth" prefetch={false} aria-label="Adicionar número">
							<PlusIcon className="h-4 w-4 shrink-0" />
							<span className="hidden text-xs font-bold sm:inline">ADICIONAR NÚMERO</span>
						</Link>
					</Button>
				</>
			) : null}
		</div>
	);
}

type ConnectionPillProps = {
	connection: TConnectionPhone;
};
function ConnectionPill({ connection }: ConnectionPillProps) {
	const formattedPhone = formatToPhone(connection.phoneNumber);

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<div className="flex max-w-full shrink-0 cursor-default items-center gap-1.5 rounded-lg bg-secondary px-2 py-1.5 sm:max-w-none">
						<div className="flex shrink-0 items-center -space-x-3 overflow-visible">
							{connection.connectionType === "META_CLOUD_API" ? (
								<div className="ring-background flex h-6 min-h-6 w-6 min-w-6 items-center justify-center rounded-full bg-[#0869E1] text-white ring-2">
									<MetaIcon className="h-4 w-4" />
								</div>
							) : (
								<div className="ring-background z-10 flex h-6 min-h-6 w-6 min-w-6 items-center justify-center rounded-full bg-[#24549C] ring-2">
									<RecompraCRMIconColorful className="h-4 w-4" />
								</div>
							)}
							<div className="ring-background flex h-6 min-h-6 w-6 min-w-6 items-center justify-center rounded-full bg-whatsapp text-white ring-2">
								<WhatsappIcon className="h-4 w-4 text-white" />
							</div>
						</div>

						<span className="hidden min-w-0 max-w-32 truncate text-xs font-medium sm:inline">{connection.phoneName}</span>
					</div>
				}
			/>
			<TooltipContent side="bottom" className="flex flex-col gap-0.5 px-3 py-2">
				<span className="font-semibold">{connection.phoneName}</span>
				<span>{formattedPhone}</span>
			</TooltipContent>
		</Tooltip>
	);
}
