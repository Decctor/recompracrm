"use client";

import { Button } from "@/components/ui/button";
import { getOrganizationNicheByValue } from "@/config/onboarding";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import {
	completeOnboarding,
	confirmWhatsappPayment,
	createOnboardingJourney,
	enableOnboardingCampaigns,
	seedOnboardingCampaigns,
	updateOnboardingProgress,
	upsertOnboardingCashback,
} from "@/lib/mutations/onboarding";
import { createOrganization, updateOrganization } from "@/lib/mutations/organizations";
import {
	getJourneyDefinition,
	getStageIndex,
	isOnboardingStageId,
	resolveResumeStage,
	type TCrmStageId,
	type TOnboardingStageId,
} from "@/lib/onboarding/journeys";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import type { TResolvedOnboardingIntent } from "@/lib/onboarding/intent";
import { isValidOrganizationSlug, slugifyOrganizationName } from "@/lib/organizations/slug";
import { PLATFORM_PARTNER_COOKIE_NAME } from "@/lib/platform-partnerships/constants";
import { ONBOARDING_READINESS_QUERY_KEY, useOnboardingReadiness } from "@/lib/queries/onboarding";
import { isValidCNPJ } from "@/lib/validation";
import type { TOnboardingProductEnum } from "@/schemas/enums";
import type { TOrganizationEntity, TOrganizationOnboardingEntity } from "@/services/drizzle/schema";
import { useInternalOnboardingNavigationState } from "@/state-hooks/use-internal-onboarding-navigation-state";
import { useOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { sendGTMEvent } from "@next/third-parties/google";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { JourneyPicker } from "./_components/JourneyPicker";
import { ErpStages } from "./_components/erp/ErpStages";
import { useInternalOnboardingErpState } from "@/state-hooks/use-internal-onboarding-erp-state";
import { ImportProgress } from "./_components/shared/ImportProgress";
import { CampaignsStage } from "./_components/crm/CampaignsStage";
import { CashbackStage } from "./_components/crm/CashbackStage";
import { CompanyStage } from "./_components/crm/CompanyStage";
import { DataSourceStage } from "./_components/crm/DataSourceStage";
import { EntryStage } from "./_components/crm/EntryStage";
import { WhatsappStage } from "./_components/crm/WhatsappStage";
import { JourneyRail, type TJourneyRailStage } from "./_components/shell/JourneyRail";
import { JourneyStory } from "./_components/shell/JourneyStory";
import { OnboardingShell } from "./_components/shell/OnboardingShell";
import { StageFooter } from "./_components/shell/StageFooter";
import { StageHeader } from "./_components/shell/StageHeader";

type ExistingOrganization = Pick<
	TOrganizationEntity,
	| "id"
	| "nome"
	| "cnpj"
	| "slug"
	| "email"
	| "telefone"
	| "logoUrl"
	| "atuacaoNicho"
	| "atuacaoCanais"
	| "tamanhoBaseClientes"
	| "plataformasUtilizadas"
	| "origemLead"
	| "dadosViaPDI"
> | null;

type OnboardingPageProps = {
	user: TAuthUserSession["user"];
	membership?: TAuthUserSession["membership"];
	intent: TResolvedOnboardingIntent;
	existingOrganization: ExistingOrganization;
	journey: TOrganizationOnboardingEntity | null;
	readiness: TOnboardingReadiness | null;
	/** Etapa do fluxo antigo (cookie), para migrar uma retomada em curso. */
	legacyStage: TCrmStageId | null;
};

function resolveInitialStage({
	produto,
	journey,
	readiness,
	legacyStage,
	hasOrganization,
}: {
	produto: TOnboardingProductEnum;
	journey: TOrganizationOnboardingEntity | null;
	readiness: TOnboardingReadiness | null;
	legacyStage: TCrmStageId | null;
	hasOrganization: boolean;
}): TOnboardingStageId {
	if (!hasOrganization) return "empresa";
	if (journey && isOnboardingStageId(produto, journey.etapaAtual) && journey.etapaAtual !== "empresa") return journey.etapaAtual;
	if (produto === "CRM" && legacyStage && legacyStage !== "empresa") return legacyStage;
	if (readiness) return resolveResumeStage({ produto, journey, readiness });
	return getJourneyDefinition(produto).etapas[1]?.id ?? "empresa";
}

export function OnboardingPage({
	user,
	membership = null,
	intent,
	existingOrganization,
	journey: initialJourney,
	readiness: initialReadiness,
	legacyStage,
}: OnboardingPageProps) {
	const queryClient = useQueryClient();
	const [produto, setProduto] = useState<TOnboardingProductEnum | null>(initialJourney?.produto ?? intent?.produto ?? null);
	const [journey, setJourney] = useState<TOrganizationOnboardingEntity | null>(initialJourney);
	const [orgCreatedThisSession, setOrgCreatedThisSession] = useState(false);
	const [isAdvancing, setIsAdvancing] = useState(false);
	const erp = useInternalOnboardingErpState(initialJourney?.respostas.erpCanalInicial ?? null);
	const hasOrganization = !!existingOrganization || orgCreatedThisSession;

	const { data: readiness, refetch: refetchReadiness } = useOnboardingReadiness({ enabled: hasOrganization, initialData: initialReadiness });
	const invalidateReadiness = useCallback(() => queryClient.invalidateQueries({ queryKey: ONBOARDING_READINESS_QUERY_KEY }), [queryClient]);

	const activeProduct: TOnboardingProductEnum = produto ?? "CRM";
	const navigation = useInternalOnboardingNavigationState({
		produto: activeProduct,
		initialStage: resolveInitialStage({ produto: activeProduct, journey: initialJourney, readiness: initialReadiness, legacyStage, hasOrganization }),
		initialDeferred: initialJourney?.etapasAdiadas ?? [],
	});

	const form = useOrganizationOnboardingState({
		existingOrganization,
		readiness: initialReadiness,
		answers: initialJourney?.respostas ?? null,
	});
	const {
		state,
		updateOrganization: updateOrganizationState,
		updateOrganizationLogoHolder,
		updateOnboarding,
		updateCashback,
		applyCashbackPresetFromNiche,
		toggleCampaign,
		setDataSourceMode,
	} = form;

	// Código de indicação do cookie de parceiro (comportamento anterior preservado).
	useEffect(() => {
		const cookieCode = document.cookie
			.split("; ")
			.find((row) => row.startsWith(`${PLATFORM_PARTNER_COOKIE_NAME}=`))
			?.split("=")[1];
		if (!cookieCode) return;
		updateOnboarding({ indicadorCodigo: decodeURIComponent(cookieCode).trim().toUpperCase() });
		updateOrganizationState({ origemLead: "INDICAÇÃO" });
	}, [updateOnboarding, updateOrganizationState]);

	// Jornada ausente com organização existente (fluxo antigo em curso): cria uma vez, na etapa
	// em que o usuário parou.
	const ensuringJourney = useRef(false);
	useEffect(() => {
		if (!hasOrganization || journey || !produto || ensuringJourney.current) return;
		ensuringJourney.current = true;
		createOnboardingJourney({ produto, origemIntencao: intent?.origem ?? "PERGUNTA" })
			.then(async (result) => {
				setJourney(result.data.journey);
				await invalidateReadiness();
				if (result.data.journey.etapaAtual !== navigation.stage) {
					const updated = await updateOnboardingProgress({ produto, etapaAtual: navigation.stage });
					setJourney(updated.data.journey);
				}
			})
			.catch((error) => toast.error(getErrorMessage(error)))
			.finally(() => {
				ensuringJourney.current = false;
			});
	}, [hasOrganization, journey, produto, intent, navigation.stage, invalidateReadiness]);

	// Analytics por etapa.
	useEffect(() => {
		captureClientEvent({ event: "onboarding_stage_viewed", properties: { produto: activeProduct, etapa: navigation.stage } });
	}, [activeProduct, navigation.stage]);

	const persistProgress = useCallback(
		async (input: {
			etapaAtual?: TOnboardingStageId;
			adiarEtapa?: TOnboardingStageId;
			retomarEtapa?: TOnboardingStageId;
			respostas?: Parameters<typeof updateOnboardingProgress>[0]["respostas"];
		}) => {
			if (!hasOrganization || !produto) return;
			try {
				const result = await updateOnboardingProgress({ produto, ...input });
				setJourney(result.data.journey);
			} catch (error) {
				// Navegação não pode travar por falha de persistência; a retomada cai na prontidão.
				console.error("[ONBOARDING] Falha ao salvar progresso:", error);
			}
		},
		[hasOrganization, produto],
	);

	const definition = getJourneyDefinition(activeProduct);
	const currentStage = definition.etapas.find((stage) => stage.id === navigation.stage) ?? definition.etapas[0];
	const currentIndex = getStageIndex(activeProduct, navigation.stage);
	const isPickingJourney = !produto;

	const lastVisibleStage = useRef(isPickingJourney ? "picker" : navigation.stage);
	useEffect(() => {
		const visibleStage = isPickingJourney ? "picker" : navigation.stage;
		if (lastVisibleStage.current === visibleStage) return;
		lastVisibleStage.current = visibleStage;
		const frame = requestAnimationFrame(() => {
			const content = document.getElementById("onboarding-content");
			content?.scrollIntoView({ block: "start" });
			content?.querySelector("h1")?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [isPickingJourney, navigation.stage]);

	// ------------------------------------------------------------------ handlers por etapa
	async function handleCompanyStep() {
		if (!hasOrganization && !state.termsAccepted) {
			toast.error("Aceite os Termos de Uso e Política de Privacidade para continuar.");
			return false;
		}
		if (!state.organization.nome.trim()) {
			toast.error("Preencha o nome da empresa.");
			return false;
		}
		if (!isValidCNPJ(state.organization.cnpj)) {
			toast.error("Preencha um CNPJ válido.");
			return false;
		}
		if (!state.organization.atuacaoNicho) {
			toast.error("Escolha o segmento da sua empresa.");
			return false;
		}

		let logoUrl: string | null = state.organization.logoUrl ?? null;
		if (state.organizationLogoHolder.file) {
			const { url } = await uploadFile({ file: state.organizationLogoHolder.file, fileName: state.organization.nome, prefix: "organizations" });
			logoUrl = url;
		}

		if (hasOrganization) {
			await updateOrganization({
				organization: {
					nome: state.organization.nome,
					cnpj: state.organization.cnpj,
					email: state.organization.email,
					telefone: state.organization.telefone,
					atuacaoNicho: state.organization.atuacaoNicho,
					logoUrl,
				},
			});
			await invalidateReadiness();
			return true;
		}

		const normalizedSlug = slugifyOrganizationName(state.organization.slug || "");
		await createOrganization({
			organization: { ...state.organization, slug: isValidOrganizationSlug(normalizedSlug) ? normalizedSlug : "", logoUrl },
			subscription: activeProduct === "ERP" ? "FREE-TRIAL-ERP" : "FREE-TRIAL",
			indicadorCodigo: state.indicadorCodigo,
		});
		setOrgCreatedThisSession(true);
		captureClientEvent({ event: "onboarding_organization_created", properties: { niche: state.organization.atuacaoNicho, produto: activeProduct } });
		if (!membership) {
			sendGTMEvent({ event: "organization_created", produto: activeProduct });
		}

		const created = await createOnboardingJourney({ produto: activeProduct, origemIntencao: intent?.origem ?? "PERGUNTA" });
		setJourney(created.data.journey);
		if (activeProduct === "ERP") {
			await updateOnboardingProgress({ produto: "ERP", etapaAtual: "canal" });
			window.location.href = "/onboarding?produto=ERP";
			return false;
		}
		applyCashbackPresetFromNiche();
		await refetchReadiness();
		return true;
	}

	async function handleDataSourceStep() {
		if (!state.dataSourceMode) {
			toast.error("Escolha como as vendas vão entrar, ou deixe para depois.");
			return false;
		}
		if (state.dataSourceMode === "POI") {
			await updateOrganization({
				organization: { dadosViaPDI: true, origemDadosPadrao: "RECEPTOR", poiConfiguracao: { vendas: { registroAtivo: true } } },
			});
		}
		if (state.dataSourceMode === "INTEGRACAO" && (readiness?.fonteDados.integracoes.length ?? 0) === 0) {
			toast.info("Nenhum sistema conectado ainda. Você pode conectar depois, em Configurações.");
		}
		await persistProgress({ respostas: { fonteDadosModo: state.dataSourceMode } });
		await invalidateReadiness();
		return true;
	}

	async function handleCashbackStep() {
		await upsertOnboardingCashback({
			cashbackProgram: {
				ativo: state.cashback.ativo,
				titulo: state.cashback.titulo || `Programa de Cashback ${state.organization.nome}`,
				descricao: "Nosso programa de fidelidade.",
				terminologia: state.cashback.terminologia,
				modalidadeDescontosPermitida: state.cashback.modalidadeDescontosPermitida,
				modalidadeRecompensasPermitida: state.cashback.modalidadeRecompensasPermitida,
				resgatePermitirViaPos: true,
				resgatePermitirViaPontoIntegracao: true,
				resgatePermitirViaLojaDigital: true,
				acumuloTipo: state.cashback.acumuloTipo,
				acumuloValor: state.cashback.acumuloValor,
				acumuloValorParceiro: state.cashback.acumuloValorParceiro,
				acumuloRegraValorMinimo: state.cashback.acumuloRegraValorMinimo,
				acumuloPermitirViaIntegracao: state.cashback.acumuloPermitirViaIntegracao,
				acumuloPermitirViaPontoIntegracao: state.cashback.acumuloPermitirViaPontoIntegracao,
				expiracaoRegraValidadeValor: state.cashback.expiracaoRegraValidadeValor,
				resgateLimiteTipo: state.cashback.resgateLimiteTipo,
				resgateLimiteValor: state.cashback.resgateLimiteValor,
			},
		});
		await invalidateReadiness();
		return true;
	}

	async function handleCampaignsStep() {
		const result = await seedOnboardingCampaigns({
			cashbackAtivo: state.cashback.ativo,
			selectedKeys: state.selectedCampaignKeys,
			enableSendingKeys: state.enableSendingWhenReady ? state.selectedCampaignKeys : [],
		});
		toast.success(result.message);
		await invalidateReadiness();
		return true;
	}

	async function handleNext() {
		if (isAdvancing) return;
		setIsAdvancing(true);
		try {
			let ok = true;
			switch (navigation.stage) {
				case "canal":
					if (!erp.state.canal) {
						toast.error("Escolha o canal inicial.");
						return;
					}
					await persistProgress({ respostas: { erpCanalInicial: erp.state.canal, erpCanaisPretendidos: [erp.state.canal] } });
					await invalidateReadiness();
					break;
				case "produtos":
					if (!readiness?.erp.produtosUtilizaveis) {
						toast.error("Cadastre ao menos um produto com nome e preço para este canal.");
						return;
					}
					break;
				case "incentivo":
					ok = await handleCashbackStep();
					break;
				case "simulacao":
					if (erp.state.simulacaoEtapa < 2) {
						toast.error("Percorra a prévia ou escolha fazer depois.");
						return;
					}
					await persistProgress({ respostas: { erpSimulacaoConcluidaEm: new Date().toISOString() } });
					await invalidateReadiness();
					break;
				case "empresa":
					ok = await handleCompanyStep();
					break;
				case "fonte-dados":
					ok = await handleDataSourceStep();
					break;
				case "cashback":
					ok = await handleCashbackStep();
					break;
				case "campanhas":
					ok = await handleCampaignsStep();
					break;
				default:
					ok = true;
			}
			if (!ok) return;
			const wasDeferred = navigation.isDeferred(navigation.stage);
			const nextStage = navigation.next();
			captureClientEvent({ event: "onboarding_stage_completed", properties: { produto: activeProduct, etapa: navigation.stage } });
			if (nextStage) {
				if (wasDeferred) navigation.resume(navigation.stage);
				await persistProgress({ etapaAtual: nextStage, retomarEtapa: wasDeferred ? navigation.stage : undefined });
			}
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setIsAdvancing(false);
		}
	}

	async function handleDefer() {
		if (isAdvancing) return;
		const { deferred, next } = navigation.defer();
		if (deferred === "campanhas") updateOnboarding({ selectedCampaignKeys: [] });
		await persistProgress({
			adiarEtapa: deferred,
			etapaAtual: next ?? undefined,
			respostas:
				deferred === "fonte-dados"
					? { fonteDadosModo: "DEPOIS" }
					: deferred === "campanhas"
						? { campanhasNenhumaPorEnquanto: true, campanhasSelecionadas: [] }
						: undefined,
		});
	}

	async function handleBack() {
		const previous = navigation.back();
		if (previous) await persistProgress({ etapaAtual: previous });
	}

	async function handleSelectStage(stageId: string) {
		if (!isOnboardingStageId(activeProduct, stageId) || stageId === navigation.stage) return;
		navigation.setStage(stageId);
		await persistProgress({ etapaAtual: stageId });
	}

	const enableCampaignsMutation = useMutation({
		mutationKey: ["enable-onboarding-campaigns"],
		mutationFn: enableOnboardingCampaigns,
		onSuccess: async (data) => {
			toast.success(data.message);
			await invalidateReadiness();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const confirmPaymentMutation = useMutation({
		mutationKey: ["confirm-whatsapp-payment"],
		mutationFn: confirmWhatsappPayment,
		onSuccess: async (data) => {
			toast.success(data.message);
			await invalidateReadiness();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const completeMutation = useMutation({
		mutationKey: ["complete-onboarding"],
		mutationFn: completeOnboarding,
		onSuccess: (data) => {
			toast.success(data.message);
			window.location.href = data.data.redirectTo;
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	// ------------------------------------------------------------------ trilho
	const railStages: TJourneyRailStage[] = definition.etapas.map((stage, index) => {
		const complete = readiness ? stage.isComplete(readiness, journey) : false;
		const isCurrent = stage.id === navigation.stage;
		const estado: TJourneyRailStage["estado"] = isCurrent ? "atual" : complete ? "concluida" : navigation.isDeferred(stage.id) ? "adiada" : "pendente";
		const visited = journey?.etapasVisitadas.includes(stage.id) ?? false;
		const navegavel = hasOrganization && !isPickingJourney && (index <= currentIndex || visited || complete);
		return { id: stage.id, rotulo: stage.rotulo, estado, navegavel: navegavel && !isAdvancing && !completeMutation.isPending };
	});

	const minBackIndex = hasOrganization ? 1 : 0;
	const canGoBack = currentIndex > minBackIndex;
	const nicheLabel = state.organization.atuacaoNicho ? (getOrganizationNicheByValue(state.organization.atuacaoNicho)?.label ?? null) : null;

	// ------------------------------------------------------------------ render
	function renderStage() {
		if (isPickingJourney) {
			return (
				<JourneyPicker
					value={produto}
					onChange={(value) => setProduto(value)}
					erpAvailable={!hasOrganization || readiness?.erp.acesso === true || readiness?.erp.testeDisponivel === true}
				/>
			);
		}
		switch (navigation.stage) {
			case "empresa":
				return (
					<CompanyStage
						state={state}
						updateOrganization={updateOrganizationState}
						updateOrganizationLogoHolder={updateOrganizationLogoHolder}
						updateOnboarding={updateOnboarding}
						isEditing={hasOrganization}
					/>
				);
			case "fonte-dados":
				return <DataSourceStage mode={state.dataSourceMode} onChangeMode={setDataSourceMode} readiness={readiness ?? null} />;
			case "cashback":
			case "incentivo":
				return <CashbackStage cashback={state.cashback} updateCashback={updateCashback} nicheLabel={nicheLabel} />;
			case "campanhas":
				return (
					<CampaignsStage
						cashbackAtivo={state.cashback.ativo}
						selectedKeys={state.selectedCampaignKeys}
						toggleCampaign={toggleCampaign}
						enableSendingWhenReady={state.enableSendingWhenReady}
						onToggleEnableSending={(value) => updateOnboarding({ enableSendingWhenReady: value })}
						readiness={readiness ?? null}
					/>
				);
			case "whatsapp":
				return (
					<WhatsappStage
						whatsapp={readiness?.whatsapp ?? null}
						onConnectionChanged={() => void invalidateReadiness()}
						onConfirmPayment={(input) => confirmPaymentMutation.mutate(input)}
						isConfirmingPayment={confirmPaymentMutation.isPending}
					/>
				);
			case "entrada":
				return readiness ? (
					<EntryStage
						readiness={readiness}
						deferredStages={Array.from(navigation.deferred)}
						onEnableCampaigns={(chaves) => enableCampaignsMutation.mutate({ chaves, habilitar: true })}
						isEnabling={enableCampaignsMutation.isPending}
						onComplete={() => completeMutation.mutate({ produto: activeProduct })}
						isCompleting={completeMutation.isPending}
					/>
				) : null;
			default:
				return readiness ? (
					<ErpStages
						stage={navigation.stage}
						readiness={readiness}
						erp={erp}
						user={user}
						membership={membership}
						onRefresh={() => void invalidateReadiness()}
						onLaunch={() => completeMutation.mutate({ produto: "ERP" })}
						isLaunching={completeMutation.isPending}
					/>
				) : null;
		}
	}

	const header = isPickingJourney
		? {
				eyebrow: "Começando",
				titulo: "O que você quer melhorar primeiro?",
				descricao: "Escolha por onde começar. O cadastro da empresa é o mesmo para os dois caminhos.",
			}
		: {
				eyebrow: `Etapa ${currentIndex + 1} de ${definition.etapas.length} · ${currentStage.eyebrow}`,
				titulo: currentStage.titulo,
				descricao: currentStage.descricao,
			};

	return (
		<OnboardingShell
			visual={
				<JourneyStory
					stage={isPickingJourney ? "picker" : navigation.stage}
					nome={state.organization.nome}
					produto={activeProduct}
					currentIndex={currentIndex}
					total={definition.etapas.length}
					officialWhatsapp={readiness?.whatsapp.tipoConexao !== "INTERNAL_GATEWAY"}
				/>
			}
			rail={
				isPickingJourney ? null : (
					<JourneyRail
						journeyLabel={definition.rotulo}
						stages={railStages}
						onSelect={(id) => void handleSelectStage(id)}
						footer={readiness ? <ImportProgress integrations={readiness.fonteDados.integracoes} compact /> : null}
					/>
				)
			}
			actions={
				<>
					<span className="hidden max-w-40 truncate text-xs text-muted-foreground xl:inline">{user.email}</span>
					<Button asChild variant="ghost" size="sm">
						<Link href="/auth/logout" prefetch={false}>
							Sair
						</Link>
					</Button>
				</>
			}
		>
			<StageHeader eyebrow={header.eyebrow} titulo={header.titulo} descricao={header.descricao} />
			<div
				key={isPickingJourney ? "picker" : navigation.stage}
				className="flex min-h-0 grow flex-col gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
			>
				{renderStage()}
			</div>
			{(navigation.stage !== "entrada" && navigation.stage !== "lancamento") || isPickingJourney ? (
				<StageFooter
					canGoBack={!isPickingJourney && canGoBack}
					onBack={() => void handleBack()}
					deferLabel={isPickingJourney ? null : currentStage.adiarRotulo}
					onDefer={() => void handleDefer()}
					continueLabel={
						isPickingJourney
							? "Começar"
							: navigation.stage === "whatsapp" && readiness?.whatsapp.numero !== "CONECTADO"
								? "Continuar sem conectar"
								: "Continuar"
					}
					onContinue={() => {
						if (isPickingJourney) {
							if (!produto) toast.error("Escolha por onde começar.");
							return;
						}
						void handleNext();
					}}
					isLoading={isAdvancing}
				/>
			) : null}
		</OnboardingShell>
	);
}
