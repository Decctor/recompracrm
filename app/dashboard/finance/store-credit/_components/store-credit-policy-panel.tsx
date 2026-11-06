"use client";

import { ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { ControlStoreCreditPolicy } from "@/components/Modals/Finances/ControlStoreCreditPolicy";
import { Section } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { useStoreCreditPolicy } from "@/lib/queries/store-credit";

/**
 * Política de fiado da organização, numa linha: a exigência de liberação está ligada ou não.
 *
 * O switch não grava sozinho — abre a confirmação, porque ligar muda o balcão na hora e vem junto
 * com a pré-liberação de quem já compra fiado. Quem não pode alterar só vê a linha quando a regra
 * está ligada: uma configuração desligada que ninguém ali pode mudar é ruído.
 */
export function StoreCreditPolicyPanel() {
	const switchId = useId();
	const descriptionId = useId();
	const [target, setTarget] = useState<boolean | null>(null);
	const { data } = useStoreCreditPolicy();

	if (!data) return null;
	const { exigeLiberacao, preApproval, canManage } = data;
	if (!canManage && !exigeLiberacao) return null;

	return (
		<>
			<Section.Root className="gap-0 py-3">
				<Section.Header className="flex-nowrap items-start">
					<Section.Icon className="mt-0.5">
						<ShieldCheck />
					</Section.Icon>
					<div className="flex min-w-0 grow flex-col gap-0.5">
						<label htmlFor={switchId} className="text-xs font-bold tracking-tight uppercase">
							Liberação de fiado
						</label>
						<p id={descriptionId} className="text-xs text-muted-foreground">
							{exigeLiberacao
								? "Ligada: só clientes liberados compram fiado, até o limite de cada um. Fora disso, a venda pede aprovação de um gestor."
								: "Desligada: qualquer cliente identificado pode comprar fiado."}
						</p>
					</div>
					<Switch
						id={switchId}
						checked={exigeLiberacao}
						disabled={!canManage}
						onCheckedChange={(checked) => setTarget(checked)}
						aria-describedby={descriptionId}
						className="mt-0.5"
					/>
				</Section.Header>
			</Section.Root>

			{target !== null ? <ControlStoreCreditPolicy exigeLiberacao={target} preApproval={preApproval} closeModal={() => setTarget(null)} /> : null}
		</>
	);
}
