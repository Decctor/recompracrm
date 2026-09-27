"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { SelectGroup, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { canManageIntegrations } from "@/lib/integrations/mask";
import { deleteIfoodCategory, upgradeIfoodCatalog } from "@/lib/mutations/ifood";
import { type TCatalogLink, useCatalogLinks } from "@/lib/queries/catalog-links";
import { useIfoodCatalogs, useIfoodCategories, useIfoodMerchants } from "@/lib/queries/ifood";
import { useIfoodCatalogEditor } from "@/state-hooks/use-ifood-catalog-editor";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Plus, Store, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IfoodSectionEmpty } from "../_module/shared/IfoodSectionEmpty";
import { IfoodSectionLoading } from "../_module/shared/IfoodSectionLoading";
import { IfoodOptionGroupsSection } from "../_module/catalog/IfoodOptionGroupsSection";
import { NewIfoodCategory } from "../_module/catalog/NewIfoodCategory";
import { NewIfoodProduct } from "../_module/catalog/NewIfoodProduct";
import { BatchProgressBar } from "./_components/BatchProgressBar";
import { CategoryHeader, CategoryItemsTable } from "./_components/CategoryItemsTable";

type IfoodCatalogPageProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
	initialMerchantId: string | null;
};

export default function IfoodCatalogPage({ membership, initialMerchantId }: IfoodCatalogPageProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const canManage = canManageIntegrations(membership.permissoes);
	// A conexão vive em `integrations` (uma linha por conta conectada). Os campos inline antigos
	// (`integracaoTipo`) saíram da sessão — ler deles fazia esta página gritar "conecte sua loja"
	// mesmo com o iFood conectado.
	const isConnected = membership.organizacao.integracoes.some((integracao) => integracao.tipo === "IFOOD" && integracao.ativo);

	const merchantsQuery = useIfoodMerchants({ enabled: isConnected });
	const merchants = merchantsQuery.data ?? [];
	const [merchantId, setMerchantId] = useState<string | null>(initialMerchantId);

	// A loja vive na URL para que o link de volta do detalhe do item preserve o contexto.
	useEffect(() => {
		if (!merchantId && merchants.length > 0) setMerchantId(merchants[0].id);
	}, [merchants, merchantId]);
	useEffect(() => {
		if (merchantId && merchantId !== initialMerchantId) {
			router.replace(`/dashboard/integrations/ifood/catalog?merchantId=${merchantId}`);
		}
	}, [merchantId, initialMerchantId, router]);

	// Vínculos com o cadastro interno: a tabela mostra a que produto cada item está preso. Os
	// DESVINCULADO saem — um item solto não é "vinculado a" nada.
	const linksQuery = useCatalogLinks({ merchantId });
	const linksByItemId = useMemo(() => {
		const map = new Map<string, TCatalogLink>();
		for (const link of linksQuery.data ?? []) {
			if (link.externoItemId && link.status !== "DESVINCULADO") map.set(link.externoItemId, link);
		}
		return map;
	}, [linksQuery.data]);

	const catalogsQuery = useIfoodCatalogs({ merchantId });
	const catalogos = catalogsQuery.data?.catalogos ?? [];
	const versao = catalogsQuery.data?.versao ?? null;
	const isV1 = versao === "V1";
	const [catalogId, setCatalogId] = useState<string | null>(null);
	useEffect(() => {
		if (!catalogId && catalogos.length > 0) setCatalogId(catalogos[0].id);
	}, [catalogos, catalogId]);

	const categoriesQuery = useIfoodCategories({ merchantId, catalogId: isV1 ? null : catalogId });
	const categorias = categoriesQuery.data ?? [];

	const editor = useIfoodCatalogEditor({
		merchantId: merchantId ?? "",
		catalogId,
		categorias,
		onApplied: () => queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey }),
	});

	const [newCategoryIsOpen, setNewCategoryIsOpen] = useState(false);
	const [newProductCategoryId, setNewProductCategoryId] = useState<string | null>(null);
	const [newProductIsOpen, setNewProductIsOpen] = useState(false);

	const { mutate: upgradeCatalog, isPending: upgradeIsPending } = useMutation({
		mutationKey: ["upgrade-ifood-catalog", merchantId],
		mutationFn: upgradeIfoodCatalog,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: catalogsQuery.queryKey });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function invalidateCategories() {
		queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey });
	}

	// Exclusão fica fora do rascunho de propósito: apagar categoria leva os itens junto, e uma ação
	// destrutiva escondida atrás de "aplicar alterações" é fácil demais de disparar sem perceber.
	const { mutate: removeCategory, isPending: deleteIsPending } = useMutation({
		mutationKey: ["delete-ifood-category", merchantId],
		mutationFn: deleteIfoodCategory,
		onSuccess: (data) => {
			toast.success(data.message);
			invalidateCategories();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleDeleteCategory(categoria: (typeof categorias)[number]) {
		const nome = categoria.nome ?? "esta categoria";
		const aviso =
			categoria.itens.length > 0
				? `Remover "${nome}" do iFood? Os ${categoria.itens.length} itens dela saem do cardápio junto.`
				: `Remover "${nome}" do iFood?`;
		if (confirm(aviso) && merchantId) removeCategory({ merchantId, categoryId: categoria.id });
	}

	if (!isConnected) {
		return (
			<div className="flex h-full w-full flex-col gap-4 p-2 lg:p-4">
				<ErrorComponent msg="Conecte sua loja iFood para gerenciar o catálogo." />
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col gap-4 p-2 lg:p-4">
			<div className="flex w-full flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<Button variant="ghost" size="icon-sm" asChild>
						<Link href="/dashboard/integrations/ifood" aria-label="Voltar para a integração">
							<ArrowLeft className="h-4 w-4" />
						</Link>
					</Button>
					<div className="min-w-0 space-y-0.5">
						<h1 className="text-xl font-semibold tracking-tight">Catálogo do iFood</h1>
						<p className="text-sm text-muted-foreground">Edite preços, disponibilidade e complementos direto na tabela.</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{merchants.length > 1 ? (
						<Select
							items={[...merchants.map((merchant) => ({ value: merchant.id, label: merchant.nome ?? merchant.id }))]}
							value={merchantId ?? null}
							onValueChange={(value) => {
								if (value !== null) setMerchantId(value);
							}}
						>
							<SelectTrigger className="w-[220px]">
								<SelectValue placeholder="Selecione a loja" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{merchants.map((merchant) => (
										<SelectItem key={merchant.id} value={merchant.id}>
											{merchant.nome ?? merchant.id}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					) : null}
					{canManage && !isV1 && catalogId ? (
						<Button variant="ghost" size="sm" onClick={() => setNewCategoryIsOpen(true)}>
							<Plus className="h-4 w-4" />
							NOVA CATEGORIA
						</Button>
					) : null}
				</div>
			</div>

			{merchantsQuery.isLoading ? (
				<LoadingComponent />
			) : !merchantId ? (
				<IfoodSectionEmpty icon={Store} message="Selecione uma loja para gerenciar o catálogo." />
			) : catalogsQuery.isLoading ? (
				<IfoodSectionLoading rows={4} />
			) : catalogsQuery.isError ? (
				<ErrorComponent msg={catalogsQuery.error instanceof Error ? catalogsQuery.error.message : "Erro ao carregar o catálogo."} />
			) : (
				<div className="flex w-full flex-col gap-4">
					<BatchProgressBar watch={editor.batchWatch} onDismiss={editor.dismissBatchWatch} />

					{isV1 ? (
						<div className="flex w-full flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-start gap-2">
								<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
								<div className="flex flex-col gap-0.5">
									<p className="text-sm font-medium text-foreground">Catálogo na versão 1</p>
									<p className="text-xs text-muted-foreground">
										A gestão de catálogo pela API exige a versão 2. O upgrade é definitivo e passa a valer também no Portal do Parceiro.
									</p>
								</div>
							</div>
							{canManage ? (
								<Button
									variant="outline"
									size="sm"
									disabled={upgradeIsPending}
									onClick={() => {
										if (confirm("Atualizar o catálogo desta loja para a versão 2? Essa ação não pode ser desfeita.")) {
											upgradeCatalog({ merchantId, acao: "UPGRADE" });
										}
									}}
								>
									{upgradeIsPending ? "ATUALIZANDO..." : "ATUALIZAR PARA V2"}
								</Button>
							) : null}
						</div>
					) : null}

					{catalogos.length === 0 ? (
						<IfoodSectionEmpty icon={BookOpen} message="Nenhum catálogo encontrado para esta loja." />
					) : isV1 ? null : (
						<>
							{catalogos.length > 1 ? (
								<Select
									items={[
										...catalogos.map((catalogo) => ({ value: catalogo.id, label: catalogo.contextos.length ? catalogo.contextos.join(", ") : catalogo.id })),
									]}
									value={catalogId ?? null}
									onValueChange={(value) => {
										if (value !== null) setCatalogId(value);
									}}
								>
									<SelectTrigger className="w-full sm:w-[280px]">
										<SelectValue placeholder="Selecione o catálogo" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{catalogos.map((catalogo) => (
												<SelectItem key={catalogo.id} value={catalogo.id}>
													{catalogo.contextos.length ? catalogo.contextos.join(", ") : catalogo.id}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							) : null}

							{categoriesQuery.isLoading ? (
								<IfoodSectionLoading rows={4} />
							) : categoriesQuery.isError ? (
								<ErrorComponent msg={categoriesQuery.error instanceof Error ? categoriesQuery.error.message : "Erro ao carregar as categorias."} />
							) : categorias.length === 0 ? (
								<div className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-10 text-center">
									<BookOpen className="h-6 w-6 text-muted-foreground" />
									<div className="flex flex-col gap-1">
										<p className="text-sm font-semibold text-foreground">Cardápio vazio</p>
										<p className="max-w-[46ch] text-xs text-muted-foreground">
											Categorias agrupam os itens do cardápio — lanches, bebidas, sobremesas. Crie a primeira para começar a cadastrar itens.
										</p>
									</div>
									{canManage ? (
										<Button type="button" variant="outline" size="sm" onClick={() => setNewCategoryIsOpen(true)}>
											<Plus className="h-4 w-4" />
											CRIAR PRIMEIRA CATEGORIA
										</Button>
									) : null}
								</div>
							) : (
								<div className="flex w-full flex-col gap-4 pb-2">
									{categorias.map((categoria) => (
										<div key={categoria.id} className="flex w-full flex-col gap-3 rounded-lg border border-border px-3 py-3">
											<CategoryHeader
												category={categoria}
												canManage={canManage}
												editor={editor}
												onAddProduct={() => {
													setNewProductCategoryId(categoria.id);
													setNewProductIsOpen(true);
												}}
												onDelete={() => handleDeleteCategory(categoria)}
												isDeleting={deleteIsPending}
											/>
											<CategoryItemsTable
												merchantId={merchantId}
												category={categoria}
												canManage={canManage}
												editor={editor}
												linksByItemId={linksByItemId}
												onAddProduct={() => {
													setNewProductCategoryId(categoria.id);
													setNewProductIsOpen(true);
												}}
											/>
										</div>
									))}
								</div>
							)}
						</>
					)}

					{/* Visão da loja inteira: o editor por item só mostra os grupos daquele item, e pausar
					    um complemento em todos os itens de uma vez continua sendo um pedido real. */}
					{!isV1 ? <IfoodOptionGroupsSection merchantId={merchantId} canManage={canManage} /> : null}
				</div>
			)}

			{canManage ? <SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} /> : null}

			{newCategoryIsOpen && merchantId && catalogId ? (
				<NewIfoodCategory
					merchantId={merchantId}
					catalogId={catalogId}
					closeModal={() => setNewCategoryIsOpen(false)}
					callbacks={{ onSuccess: invalidateCategories }}
				/>
			) : null}

			{newProductIsOpen && merchantId ? (
				<NewIfoodProduct
					merchantId={merchantId}
					categories={categorias}
					initialCategoryId={newProductCategoryId}
					closeModal={() => setNewProductIsOpen(false)}
					callbacks={{ onSuccess: invalidateCategories }}
				/>
			) : null}
		</div>
	);
}
