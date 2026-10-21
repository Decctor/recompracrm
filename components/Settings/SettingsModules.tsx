"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Switch } from "@/components/ui/switch";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { type PropsWithChildren, useEffect, useState } from "react";
import { DEFAULT_SCALE_BARCODE_CONFIG } from "@/lib/pos/scale-barcode";
import { useOrganizationSectionForm } from "./Organization/use-organization-section-form";
import SettingsScaleBarcode from "./SettingsScaleBarcode";
import SettingsSectionActions from "./SettingsSectionActions";

type TPreferences = TOrganizationConfiguration["preferencias"];
type TModulesDraft = Pick<TPreferences, "carteirasClientes" | "rastreamentoEstoque" | "sessoesVenda" | "contasAtendimento" | "balanca">;

const EMPTY_SESSOES_VENDA = {
	habilitado: false,
	obrigatorio: false,
	exigirFundoTroco: false,
	conferenciaCega: false,
	bloquearFechamentoComPendenciaFiscal: false,
} satisfies NonNullable<TPreferences["sessoesVenda"]>;

function toModulesDraft(preferencias: TPreferences): TModulesDraft {
	return {
		carteirasClientes: preferencias.carteirasClientes ?? { habilitado: false },
		rastreamentoEstoque: preferencias.rastreamentoEstoque,
		sessoesVenda: preferencias.sessoesVenda ?? EMPTY_SESSOES_VENDA,
		contasAtendimento: preferencias.contasAtendimento ?? { habilitado: false },
		balanca: preferencias.balanca ?? DEFAULT_SCALE_BARCODE_CONFIG,
	};
}

type ModuleCardProps = PropsWithChildren<{
	title: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	editable: boolean;
}>;

/**
 * Um módulo é um container só: o interruptor de habilitação no topo e, quando ligado, as regras
 * internas na mesma moldura — abrir um segundo card ao lado quebrava a relação de posse.
 */
function ModuleCard({ title, description, checked, onCheckedChange, editable, children }: ModuleCardProps) {
	return (
		<div className="border-border bg-card rounded-xl border shadow-xs">
			<div className="flex items-center justify-between gap-4 px-4 py-3">
				<div className="flex flex-col gap-0.5">
					<span className="text-sm font-medium tracking-tight">{title}</span>
					<span className="text-muted-foreground text-xs">{description}</span>
				</div>
				<Switch checked={checked} onCheckedChange={(value) => editable && onCheckedChange(value)} disabled={!editable} />
			</div>
			{checked && children ? <div className="border-border divide-border flex flex-col divide-y border-t px-4">{children}</div> : null}
		</div>
	);
}

type ModuleRuleProps = {
	title: string;
	description: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	editable: boolean;
};

/** Regra interna de um módulo ligado: linha com divisor, sem moldura própria. */
function ModuleRule({ title, description, checked, onCheckedChange, editable }: ModuleRuleProps) {
	return (
		<div className="flex items-center justify-between gap-4 py-3">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium tracking-tight">{title}</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</div>
			<Switch checked={checked} onCheckedChange={(value) => editable && onCheckedChange(value)} disabled={!editable} />
		</div>
	);
}

type SettingsModulesProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function SettingsModules({ membership }: SettingsModulesProps) {
	const { organization, isLoading, isError, isSuccess, error, save, isSaving } = useOrganizationSectionForm();
	const [draft, setDraft] = useState<TModulesDraft | null>(null);

	useEffect(() => {
		if (organization) setDraft(toModulesDraft(organization.configuracao.preferencias));
	}, [organization]);

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!isSuccess || !organization || !draft) return null;

	const canEdit = membership.permissoes.empresa.editar;
	// A capability do plano, não a permissão do usuário: sem ERP esses módulos não existem para a org.
	const hasErpAccess = organization.configuracao.recursos.erp.acesso;
	const sessoesVenda = draft.sessoesVenda ?? EMPTY_SESSOES_VENDA;

	const balanca = draft.balanca ?? DEFAULT_SCALE_BARCODE_CONFIG;
	function updateBalanca(partial: Partial<TPreferences["balanca"]>) {
		setDraft((current) => (current ? { ...current, balanca: { ...(current.balanca ?? DEFAULT_SCALE_BARCODE_CONFIG), ...partial } } : current));
	}

	function updateSessoesVenda(partial: Partial<NonNullable<TPreferences["sessoesVenda"]>>) {
		setDraft((current) => (current ? { ...current, sessoesVenda: { ...(current.sessoesVenda ?? EMPTY_SESSOES_VENDA), ...partial } } : current));
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<ModuleCard
				title="CARTEIRA DE CLIENTES"
				description="Fila diária de atendimentos e follow-ups por vendedor."
				checked={draft.carteirasClientes?.habilitado ?? false}
				onCheckedChange={(checked) => setDraft((current) => (current ? { ...current, carteirasClientes: { habilitado: checked } } : current))}
				editable={canEdit}
			/>

			{hasErpAccess ? (
				<>
					<ModuleCard
						title="RASTREAMENTO DE ESTOQUE"
						description="Controle e rastreamento de estoque para os produtos da organização."
						checked={draft.rastreamentoEstoque}
						onCheckedChange={(checked) => setDraft((current) => (current ? { ...current, rastreamentoEstoque: checked } : current))}
						editable={canEdit}
					/>

					<ModuleCard
						title="SESSÕES DE VENDA"
						description="Abertura, movimentação e fechamento de caixa no balcão. Cada caixa define sua política de vendedores ao abrir."
						checked={sessoesVenda.habilitado}
						onCheckedChange={(checked) => updateSessoesVenda({ habilitado: checked })}
						editable={canEdit}
					>
						<ModuleRule
							title="CAIXA OBRIGATÓRIO"
							description="Bloqueia novas vendas até que o vendedor abra uma sessão de caixa."
							checked={sessoesVenda.obrigatorio}
							onCheckedChange={(checked) => updateSessoesVenda({ obrigatorio: checked })}
							editable={canEdit}
						/>
						<ModuleRule
							title="EXIGIR FUNDO DE TROCO"
							description="Solicita saldo inicial ao abrir o caixa."
							checked={sessoesVenda.exigirFundoTroco}
							onCheckedChange={(checked) => updateSessoesVenda({ exigirFundoTroco: checked })}
							editable={canEdit}
						/>
						<ModuleRule
							title="CONFERÊNCIA CEGA"
							description="Oculta os valores esperados até o operador informar a contagem do caixa."
							checked={sessoesVenda.conferenciaCega}
							onCheckedChange={(checked) => updateSessoesVenda({ conferenciaCega: checked })}
							editable={canEdit}
						/>
						<ModuleRule
							title="BLOQUEAR FECHAMENTO COM PENDÊNCIA FISCAL"
							description="Impede fechar o caixa enquanto houver notas fiscais pendentes no turno."
							checked={sessoesVenda.bloquearFechamentoComPendenciaFiscal}
							onCheckedChange={(checked) => updateSessoesVenda({ bloquearFechamentoComPendenciaFiscal: checked })}
							editable={canEdit}
						/>
					</ModuleCard>

					<ModuleCard
						title="CONTAS DE ATENDIMENTO"
						description="Mesas, comandas e quartos com pedidos acumulados e fechamento único. O modo de operação e os pedidos via QR Code são configurados dentro do módulo."
						checked={draft.contasAtendimento?.habilitado ?? false}
						onCheckedChange={(checked) => setDraft((current) => (current ? { ...current, contasAtendimento: { habilitado: checked } } : current))}
						editable={canEdit}
					/>

					<ModuleCard
						title="ETIQUETAS DE BALANÇA"
						description="Lê no PDV as etiquetas impressas pela balança e lança o item pesado com a quantidade calculada pelo preço do sistema."
						checked={balanca.habilitado}
						onCheckedChange={(checked) => updateBalanca({ habilitado: checked })}
						editable={canEdit}
					>
						<SettingsScaleBarcode balanca={balanca} updateBalanca={updateBalanca} editable={canEdit} />
					</ModuleCard>
				</>
			) : null}

			{canEdit ? (
				<div className="border-border border-t pt-3">
					<SettingsSectionActions
						isSaving={isSaving}
						onReset={() => setDraft(toModulesDraft(organization.configuracao.preferencias))}
						onSave={() => save({ configuracao: { preferencias: draft } })}
					/>
				</div>
			) : null}
		</div>
	);
}
