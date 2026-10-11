"use client";
import { Button } from "@/components/ui/button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { NewServicePoint } from "@/components/Modals/Internal/ServicePoints/NewServicePoint";
import { ServiceSettings } from "@/components/Modals/Internal/Tabs/ServiceSettings";
import type { TAuthUserSession } from "@/lib/authentication/types";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import { ERP_CHANNELS } from "@/lib/onboarding/erp-channels";
import { ChoiceList } from "../shared/ChoiceList";
import type { useInternalOnboardingErpState } from "@/state-hooks/use-internal-onboarding-erp-state";
import { useShopSettings } from "@/lib/queries/shop";
import { updateShopSettings } from "@/lib/mutations/shop";
import { DEFAULT_SHOP_SETTINGS_CONFIGURATION } from "@/schemas/shop";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
// `loading` não é opcional: sem ele o next/dynamic não cria Suspense próprio e, com o chunk ainda
// não baixado, a suspensão sobe até o loading.tsx da rota — a tela inteira vira loading.
const NewProduct = dynamic(() => import("@/components/Modals/Products/NewProduct"), { loading: () => null });
const ShopSettingsPanel = dynamic(() => import("@/app/dashboard/catalog/store/components/ShopSettingsPanel"), {
 loading: () => <Skeleton className="h-64 w-full rounded-xl" />,
});

type Props = {
 stage: string; readiness: TOnboardingReadiness; user: TAuthUserSession["user"]; membership: TAuthUserSession["membership"];
 erp: ReturnType<typeof useInternalOnboardingErpState>; onRefresh: () => void; onLaunch: () => void; isLaunching: boolean;
};
export function ErpStages({ stage, readiness, user, membership, erp, onRefresh, onLaunch, isLaunching }: Props) {
 const { state, updateState } = erp;
 const close = () => { updateState({ modal: null }); onRefresh(); };
 const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
 const selected = readiness.erp.produtos.find((product) => product.id === state.produtoId);
 return <div className="flex flex-col gap-5">
  {stage === "canal" ? <ChoiceList label="Canal inicial" options={[...ERP_CHANNELS]} value={state.canal} onChange={(canal) => updateState({ canal })} /> : null}
  {stage === "produtos" ? <>
   <p className="text-sm text-muted-foreground">{readiness.erp.produtosUtilizaveis} produtos prontos para este canal. Cadastre cinco para percorrer a prévia guiada.</p>
   <ul className="divide-y divide-border">{readiness.erp.produtos.map((product) => <li key={product.id} className="flex justify-between gap-4 py-3 text-sm"><span>{product.nome}</span><span className="tabular-nums">{money(product.precoVenda)}</span></li>)}</ul>
   <Button className="self-start" onClick={() => updateState({ modal: "produto" })} disabled={!membership}>Cadastrar produto</Button>
   <Button className="self-start" variant="ghost" onClick={onRefresh}>Atualizar produtos</Button>
  </> : null}
  {stage === "experiencia" ? <>
   <p className="max-w-prose text-sm text-muted-foreground">{state.canal === "CATALOGO" ? "Prepare a apresentação, os produtos, a retirada ou entrega e as formas de pagamento da loja." : state.canal === "MESAS" ? "Configure como as contas funcionam e cadastre as mesas que receberão pedidos." : "Revise o atendimento de balcão. O operador escolhe os produtos e conclui a venda no PDV."}</p>
   <div className="flex flex-wrap gap-2">{state.canal === "CATALOGO" ? <Button onClick={() => updateState({ modal: "loja" })}>Configurar loja digital</Button> : <Button onClick={() => updateState({ modal: "atendimento" })}>Configurar atendimento</Button>}{state.canal === "MESAS" ? <Button variant="outline" onClick={() => updateState({ modal: "mesa" })}>Cadastrar mesa</Button> : null}</div>
  </> : null}
  {stage === "simulacao" ? <>
   <p className="text-sm text-muted-foreground">Prévia guiada · Nada será cobrado ou movimentado no estoque.</p>
   {readiness.erp.produtosUtilizaveis < 5 ? <p role="status">Cadastre ao menos cinco produtos utilizáveis para experimentar a compra, ou faça esta etapa depois.</p> : state.simulacaoEtapa === 0 ? <><ChoiceList label="Escolha um produto para a prévia" value={state.produtoId} onChange={(produtoId) => updateState({ produtoId })} options={readiness.erp.produtos.map((product) => ({ value: product.id, titulo: product.nome, descricao: money(product.precoVenda) }))} /><Button disabled={!selected} onClick={() => updateState({ simulacaoEtapa: 1 })}>Ver sacola simulada</Button></> : state.simulacaoEtapa === 1 ? <><h3 className="font-bold">Sacola do cliente</h3><p>{selected?.nome} · 1 unidade · {money(selected?.precoVenda ?? 0)}</p><p className="text-sm text-muted-foreground">O cliente revisa o pedido antes de confirmar.</p><Button onClick={() => updateState({ simulacaoEtapa: 2 })}>Ver pedido na operação</Button></> : <><h3 className="font-bold">Pedido simulado recebido</h3><p>{selected?.nome} aparece na fila para o operador conferir e preparar.</p><p className="text-sm text-muted-foreground">Na operação real, você acompanha atendimento, pagamento e entrega por aqui.</p></>}
  </> : null}
  {stage === "lancamento" ? <>
   <h3 className="text-lg font-bold">Checklist do canal</h3>
   {readiness.erp.pendenciasLancamento.length ? <ul className="flex flex-col gap-2">{readiness.erp.pendenciasLancamento.map((item) => <li key={item.chave} className="text-sm">{item.rotulo}</li>)}</ul> : <p className="text-sm">Seu canal está preparado para começar a vender.</p>}
   <Button disabled={isLaunching || readiness.erp.pendenciasLancamento.length > 0} onClick={onLaunch}>{isLaunching ? "Preparando…" : state.canal === "CATALOGO" ? "Publicar loja e entrar" : "Começar a vender"}</Button>
  </> : null}
  {state.modal === "produto" && membership ? <NewProduct user={user} userMembership={membership} closeModal={close} callbacks={{ onSuccess: onRefresh }} /> : null}
  {state.modal === "mesa" ? <NewServicePoint closeModal={close} callbacks={{ onSuccess: onRefresh }} /> : null}
  {state.modal === "atendimento" ? <ServiceSettings closeModal={close} /> : null}
  {state.modal === "loja" ? <ShopSetup closeModal={close} /> : null}
 </div>;
}
function ShopSetup({ closeModal }: { closeModal: () => void }) {
 const { data, isLoading, error, queryKey } = useShopSettings();
 const queryClient = useQueryClient();
 const create = useMutation({ mutationFn: () => updateShopSettings({ ativo: false, modo: "CATALOGO", configuracoes: DEFAULT_SHOP_SETTINGS_CONFIGURATION }), onSuccess: () => queryClient.invalidateQueries({ queryKey }), onError: (err) => toast.error(getErrorMessage(err)) });
 return <ResponsiveMenu menuTitle="CONFIGURAR LOJA" menuDescription="Prepare sua loja para receber pedidos." menuActionButtonText="CONCLUIR" menuCancelButtonText="FECHAR" actionFunction={closeModal} actionIsLoading={false} stateIsLoading={isLoading} stateError={error ? getErrorMessage(error) : null} closeMenu={closeModal}>
  {data ? <ShopSettingsPanel settings={data} /> : <Button disabled={create.isPending} onClick={() => create.mutate()}>Preparar configurações da loja</Button>}
 </ResponsiveMenu>;
}
