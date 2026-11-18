import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { useRFMConfigQuery } from "@/lib/queries/configs";
import { cn } from "@/lib/utils";
import type { TRFMConfig } from "@/utils/rfm";
import { Clock, Edit, Plus, Settings2, ShoppingCart } from "lucide-react";
import { useState } from "react";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";
import EditRFMConfig from "../Modals/RFMConfig/EditRFMConfig";
import NewRFMConfig from "../Modals/RFMConfig/NewRFMConfig";
import { Button } from "../ui/button";

type SettingsSegmentsProps = {
	user: TAuthUserSession["user"];
	/** clientes.gerenciarBase: definir e editar a matriz RFM. Sem ela a configuração é só leitura. */
	canManageClientBase: boolean;
};

export default function SettingsSegments({ user, canManageClientBase }: SettingsSegmentsProps) {
	const { data, isLoading, isError, isSuccess, error } = useRFMConfigQuery();
	const [editRFMConfigMenuIsOpen, setEditRFMConfigMenuIsOpen] = useState(false);
	const [newRFMConfigMenuIsOpen, setNewRFMConfigMenuIsOpen] = useState(false);

	const hasRFMConfigDefined = isSuccess && data;
	const hasNoRFMConfigDefined = isSuccess && !data;
	return (
		<div className={cn("flex w-full flex-col gap-6")}>
			{hasRFMConfigDefined ? (
				<div className="w-full flex flex-col gap-6">
					<div className="flex items-center justify-end border-b pb-4">
						<Button size="sm" className="flex items-center gap-2" disabled={!canManageClientBase} onClick={() => setEditRFMConfigMenuIsOpen(true)}>
							<Edit className="h-4 w-4" />
							EDITAR MATRIZ
						</Button>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{/* Frequência Card */}
						<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
							<div className="flex items-center justify-between">
								<h1 className="text-xs font-medium tracking-tight uppercase">FREQUÊNCIA</h1>
								<div className="flex items-center gap-2">
									<div className="flex items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full bg-orange-200 text-orange-700">
										<ShoppingCart className="h-3 min-h-3 w-3 min-w-3" />
									</div>
								</div>
							</div>
							<div className="flex w-full flex-col gap-1.5">
								{([5, 4, 3, 2, 1] as const).map((score) => (
									<div key={score} className="flex items-center justify-between px-2 py-1 rounded-lg bg-orange-100 border border-orange-100">
										<span className="font-bold text-orange-700">NOTA {score}</span>
										<span className="text-sm font-medium">
											{data?.frequencia[score].min} a {data?.frequencia[score].max} pedidos
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Recência Card */}
						<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
							<div className="flex items-center justify-between">
								<h1 className="text-xs font-medium tracking-tight uppercase">RECÊNCIA</h1>
								<div className="flex items-center gap-2">
									<div className="flex items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full bg-blue-200 text-blue-700">
										<Clock className="h-3 min-h-3 w-3 min-w-3" />
									</div>
								</div>
							</div>
							<div className="flex w-full flex-col gap-1.5">
								{([5, 4, 3, 2, 1] as const).map((score) => (
									<div key={score} className="flex items-center justify-between px-2 py-1 rounded-lg bg-blue-100 border border-blue-100">
										<span className="font-bold text-blue-700">NOTA {score}</span>
										<span className="text-sm font-medium">
											{data?.recencia[score].min} a {data?.recencia[score].max} dias
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Monetário Card */}
						<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs")}>
							<div className="flex items-center justify-between">
								<h1 className="text-xs font-medium tracking-tight uppercase">MONETÁRIO</h1>
								<div className="flex items-center gap-2">
									<div className="flex items-center justify-center w-5 h-5 min-w-5 min-h-5 rounded-full bg-green-200 text-green-700">
										<Settings2 className="h-3 min-h-3 w-3 min-w-3" />
									</div>
								</div>
							</div>
							<div className="flex w-full flex-col gap-1.5">
								{([5, 4, 3, 2, 1] as const).map((score) => (
									<div key={score} className="flex items-center justify-between px-2 py-1 rounded-lg bg-green-100 border border-green-100">
										<span className="font-bold text-green-700">NOTA {score}</span>
										<span className="text-sm font-medium">
											R$ {data?.monetario[score].min.toLocaleString()} a R$ {data?.monetario[score].max.toLocaleString()}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>

					{editRFMConfigMenuIsOpen && <EditRFMConfig user={user} rfmConfig={data} closeModal={() => setEditRFMConfigMenuIsOpen(false)} />}
				</div>
			) : null}
			{hasNoRFMConfigDefined ? (
				<div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-6 rounded-2xl border-2 border-dashed bg-muted/30">
					<div className="p-4 rounded-full bg-primary/10 text-foreground">
						<Settings2 className="h-12 w-12" />
					</div>
					<div className="flex flex-col gap-2 max-w-md">
						<h2 className="text-2xl font-bold tracking-tight">Nenhuma configuração encontrada</h2>
						<p className="text-muted-foreground">
							Sua organização ainda não possui uma matriz RFM definida. Configure-a para começar a segmentar seus clientes de forma inteligente.
						</p>
					</div>
					<Button onClick={() => setNewRFMConfigMenuIsOpen(true)} size="lg" className="gap-2 px-8" disabled={!canManageClientBase}>
						<Plus className="h-5 w-5" />
						DEFINIR CONFIGURAÇÃO RFM
					</Button>

					{newRFMConfigMenuIsOpen && <NewRFMConfig user={user} closeModal={() => setNewRFMConfigMenuIsOpen(false)} />}
				</div>
			) : null}
		</div>
	);
}
