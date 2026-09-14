"use client";

import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { VirtualKeyboard } from "@/components/ui/virtual-keyboard";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { getErrorMessage } from "@/lib/errors";
import { formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { createClientViaPointOfInteraction } from "@/lib/mutations/clients";
import type { TPoiRegistrationConfig } from "@/lib/point-of-interaction/registration";
import { useClientByLookup } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import { isValidCpfCnpj } from "@/lib/validation";
import type { TCashbackProgramEntity, TOrganizationEntity } from "@/services/drizzle/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Building2, ChevronDown, ChevronUp, Clock, Delete, Gift, Loader2, ShoppingCart, UserPlus, WalletCards } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ClubIdentityCard } from "./_shared/components/club-identity-card";
import { SellerPicker } from "./_shared/components/seller-picker";
import { getCashbackAccumulationCopy } from "./_shared/helpers/cashback-copy";
import { formatDateDigits, parseBirthDateDigitsToIso } from "./_shared/helpers/date-digits";
import { useAutoAdvanceTimer } from "./_shared/hooks/use-auto-advance-timer";
import { usePoiSounds } from "./_shared/hooks/use-poi-sounds";
import { RegistrationWizard } from "./_shared/registration/registration-wizard";

type PointOfInteractionContentProps = {
	cashbackProgram: TCashbackProgramEntity;
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
	};
	mode: "kiosk" | "mobile";
	// Destino pós-identificação/cadastro: "transaction" = fluxo de venda no caixa (padrão);
	// "profile" = clube de benefícios (perfil do cliente) — QR de mesa, link do vendedor.
	flow: "transaction" | "profile";
	// Vendedor pré-atribuído via link pessoal (?sellerId=), já validado no servidor.
	// Quando presente, o select "quem te atendeu" fica oculto.
	presetSellerId: string | null;
	// Cadastro configurável desta superfície: fluxo + passos já ordenados e resolvidos no servidor
	// (lib/point-of-interaction/registration.ts). O assistente do fluxo COMPLETO consome isto; o
	// cadastro rápido atual ignora — `fluxo: "RAPIDO"` com `campos: []` é o default de todas as
	// organizações que nunca configuraram nada.
	registrationConfig: TPoiRegistrationConfig;
};

export default function PointOfInteractionContent({
	org,
	cashbackProgram,
	mode,
	flow,
	presetSellerId,
	registrationConfig,
}: PointOfInteractionContentProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { playAction, playSuccess } = usePoiSounds();
	const isMobileMode = mode === "mobile";
	const isProfileFlow = flow === "profile";

	// Phone number state (raw digits only)
	const [phoneDigits, setPhoneDigits] = useState("");
	const formattedPhone = formatToPhone(phoneDigits);
	const isPhoneComplete = phoneDigits.length === 11;

	// New client form state
	const [newClientName, setNewClientName] = useState("");
	const [newClientCpfCnpj, setNewClientCpfCnpj] = useState("");
	// Dígitos DDMMAAAA do teclado numérico; convertidos para ISO só no submit.
	const [newClientBirthDateDigits, setNewClientBirthDateDigits] = useState("");
	const [showOptionalFields, setShowOptionalFields] = useState(false);
	// "Quem te atendeu": seleção opcional — null = sem escolha, não trava a conversão.
	// authorSellerSkipped distingue "tocou em NÃO SEI" de "nem interagiu com o campo".
	// Com vendedor pré-atribuído via link, a seleção nasce feita e o select fica oculto.
	const [newClientAuthorSellerId, setNewClientAuthorSellerId] = useState<string | null>(presetSellerId);
	const [authorSellerSkipped, setAuthorSellerSkipped] = useState(false);

	const showSellerSelection = !presetSellerId;
	// Cadastro configurável: COMPLETO entrega o assistente por passos; RAPIDO (o default de toda
	// organização que nunca configurou nada) mantém o formulário inline abaixo, inalterado.
	const useRegistrationWizard = registrationConfig.fluxo === "COMPLETO";

	// Client lookup
	const {
		data: client,
		isLoading: isLoadingClient,
		isSuccess: isSuccessClient,
		updateParams,
	} = useClientByLookup({
		initialParams: { orgId: org.id, phone: "", clientId: null },
	});

	// Sync phone digits to lookup params
	useEffect(() => {
		if (isPhoneComplete) {
			updateParams({ phone: formattedPhone });
		} else {
			updateParams({ phone: "" });
		}
	}, [isPhoneComplete, formattedPhone, updateParams]);

	// Analytics
	useEffect(() => {
		captureClientEvent({
			event: "view_point_of_interaction_hub",
			properties: { organization_id: org.id },
		});
	}, [org.id]);

	// ===== Matriz de ações do ponto de interação =====
	// O programa vem no próprio lookup (por saldo do cliente); o programa carregado no servidor é o
	// fallback para quem ainda não tem linha de saldo — sem ele um cliente novo cairia em "carteirinha".
	const clientBalance = client?.saldos?.[0] ?? null;
	const clientProgram = clientBalance?.programa ?? null;
	const isProgramActive = clientProgram?.ativo ?? cashbackProgram.ativo;
	const allowsAccrualViaPoi = clientProgram?.acumuloPermitirViaPontoIntegracao ?? cashbackProgram.acumuloPermitirViaPontoIntegracao;
	const allowsRedemptionViaPoi = clientProgram?.resgatePermitirViaPontoIntegracao ?? cashbackProgram.resgatePermitirViaPontoIntegracao;
	const allowsDiscounts = clientProgram?.modalidadeDescontosPermitida ?? cashbackProgram.modalidadeDescontosPermitida;
	const allowsRewards = clientProgram?.modalidadeRecompensasPermitida ?? cashbackProgram.modalidadeRecompensasPermitida;
	const canAccrue = isProgramActive && allowsAccrualViaPoi;
	const canRedeem = isProgramActive && allowsRedemptionViaPoi && (allowsDiscounts || allowsRewards);
	const hasPoiActions = canAccrue || canRedeem;
	// Duas ações visíveis: o wizard não tem como adivinhar a intenção, então ela viaja na URL.
	const shouldPassIntent = canAccrue && canRedeem;
	// Sem nenhuma ação (`!hasPoiActions`) o POI vira carteirinha digital: identidade + acesso ao clube.
	const profileUrl = client ? `/point-of-interaction/${org.id}/client-profile/${client.id}${isMobileMode ? "?mode=mobile" : ""}` : "";

	const buildTransactionUrl = useCallback(
		(targetClientId: string, intent: "pontuar" | "resgatar" | null) => {
			const searchParams = new URLSearchParams();
			searchParams.set("clientId", targetClientId);
			if (isMobileMode) searchParams.set("mode", "mobile");
			if (intent) searchParams.set("intent", intent);
			return `/point-of-interaction/${org.id}/new-transaction?${searchParams.toString()}`;
		},
		[isMobileMode, org.id],
	);

	// Auto-advance timer for found clients
	const handleAdvance = useCallback(() => {
		if (!client || !isPhoneComplete) return;
		if (isProfileFlow) {
			// Clube de benefícios: cliente já cadastrado vai direto ao perfil (consulta de saldo).
			router.push(`/point-of-interaction/${org.id}/client-profile/${client.id}${isMobileMode ? "?mode=mobile" : ""}`);
			return;
		}
		router.push(buildTransactionUrl(client.id, null));
	}, [buildTransactionUrl, client, isMobileMode, isPhoneComplete, isProfileFlow, org.id, router]);

	const { countdown, countdownSeconds, isAdvancing, wasCancelled, cancel, resetCancellation } = useAutoAdvanceTimer({
		// flow=profile sempre avança (o destino é o próprio clube). flow=transaction só avança quando
		// existe pelo menos uma ação — senão o cliente cairia num wizard que não pode concluir nada.
		shouldStart: isSuccessClient && !!client && isPhoneComplete && (isProfileFlow || hasPoiActions),
		// Mesma duração da carteirinha pós-cadastro: em 3s o cliente mal termina de ler o próprio
		// saldo, que é justamente o que ele veio conferir.
		countdownSeconds: 6,
		onAdvance: handleAdvance,
	});

	// Play sound when client is found
	useEffect(() => {
		if (isSuccessClient && client && !wasCancelled) {
			playAction();
		}
	}, [isSuccessClient, client, wasCancelled, playAction]);

	// Reset cancellation when phone changes.
	// Reage à MUDANÇA dos dígitos, não à presença deles: cancelar agora mantém a carteirinha na tela
	// (com as ações), e a versão antiga religaria o timer no mesmo tick do cancelamento.
	const lastPhoneDigitsRef = useRef(phoneDigits);
	useEffect(() => {
		if (lastPhoneDigitsRef.current === phoneDigits) return;
		lastPhoneDigitsRef.current = phoneDigits;
		if (wasCancelled) {
			resetCancellation();
		}
	}, [phoneDigits, wasCancelled, resetCancellation]);

	// Destino pós-cadastro. Extraído para que o assistente do fluxo COMPLETO continue exatamente
	// para onde o cadastro rápido continua — a paridade é por construção, não por repetição.
	const navigateAfterRegistration = useCallback(
		(insertedClientId: string) => {
			if (isProfileFlow) {
				// Recém-entrou no clube: perfil com boas-vindas.
				router.push(`/point-of-interaction/${org.id}/client-profile/${insertedClientId}?welcome=true${isMobileMode ? "&mode=mobile" : ""}`);
				return;
			}
			const modeParam = isMobileMode ? "&mode=mobile" : "";
			router.push(`/point-of-interaction/${org.id}/new-transaction?clientId=${insertedClientId}${modeParam}`);
		},
		[isMobileMode, isProfileFlow, org.id, router],
	);

	// Create client mutation
	const { mutate: handleCreateClient, isPending: isCreatingClient } = useMutation({
		mutationKey: ["create-client-poi-v2"],
		mutationFn: createClientViaPointOfInteraction,
		onSuccess: (data) => {
			playSuccess();
			toast.success(data.message);
			navigateAfterRegistration(data.data.insertedClientId);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	// Virtual keypad handlers
	function handleKeyPress(digit: string) {
		if (phoneDigits.length >= 11) return;
		setPhoneDigits((prev) => prev + digit);
		playAction();
	}

	function handleBackspace() {
		setPhoneDigits((prev) => prev.slice(0, -1));
	}

	function clearClientLookup() {
		queryClient.cancelQueries({ queryKey: ["client-by-lookup"] });
		queryClient.removeQueries({ queryKey: ["client-by-lookup"] });
		updateParams({ phone: "", clientId: null });
	}

	function handleReset() {
		cancel();
		setPhoneDigits("");
		setNewClientName("");
		setNewClientCpfCnpj("");
		setNewClientBirthDateDigits("");
		setNewClientAuthorSellerId(presetSellerId);
		setAuthorSellerSkipped(false);
		setShowOptionalFields(false);
		clearClientLookup();
		resetCancellation();
	}

	// Cancelar interrompe o redirecionamento automático mas mantém a carteirinha e as ações na tela —
	// quem cancela quer escolher, não recomeçar. Para recomeçar existe "TROCAR NÚMERO".
	function handleCancelRedirect() {
		cancel();
	}

	function handleGoToTransaction(intent: "pontuar" | "resgatar" | null) {
		if (!client) return;
		cancel();
		playAction();
		router.push(buildTransactionUrl(client.id, intent));
	}

	function handleGoToProfile() {
		if (!client || !profileUrl) return;
		cancel();
		playAction();
		router.push(profileUrl);
	}

	function handleSubmitNewClient() {
		if (!newClientName || !formattedPhone) {
			toast.error("Preencha o nome do cliente.");
			return;
		}
		if (newClientCpfCnpj && !isValidCpfCnpj(newClientCpfCnpj)) {
			toast.error("CPF/CNPJ inválido. Confira os números digitados.");
			return;
		}
		let birthDateIso: string | null = null;
		if (newClientBirthDateDigits.length > 0) {
			birthDateIso = parseBirthDateDigitsToIso(newClientBirthDateDigits);
			if (!birthDateIso) {
				toast.error("Data de nascimento inválida. Confira o formato DD/MM/AAAA.");
				return;
			}
		}
		handleCreateClient({
			orgId: org.id,
			client: {
				nome: newClientName,
				telefone: formattedPhone,
				cpfCnpj: newClientCpfCnpj || null,
				// biome-ignore lint: dataNascimento schema transforms string->Date, but API receives string via JSON
				dataNascimento: birthDateIso as any,
				autorVendedorId: newClientAuthorSellerId,
			},
		});
	}

	// UI state: determine what to show
	const clientFound = isSuccessClient && !!client && isPhoneComplete && !isAdvancing;
	const clientNotFound = isSuccessClient && !client && isPhoneComplete;
	const isIdleState = !clientFound && !clientNotFound && !isAdvancing && !isLoadingClient;
	const isLoadingState = isLoadingClient && isPhoneComplete;

	// Fundo tingido com a lavagem clara da marca da org; no escuro o neutro do tema continua valendo.
	return (
		<div className="grow bg-[var(--poi-tint)] dark:bg-background flex flex-col items-center justify-center p-4 md:p-8">
			{/* ===== IDLE STATE: Org card + Keypad side by side ===== */}
			{isIdleState ? (
				<div className="w-full max-w-5xl flex flex-col md:flex-row items-center md:items-stretch gap-8 md:gap-12">
					{/* LEFT: Unified org card — brand hero header + program details list */}
					<div className="w-full md:w-[45%] flex flex-col">
						<div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden flex flex-col flex-1">
							{/* Brand hero header */}
							<div className="bg-brand px-6 py-7 md:px-8 md:py-10 flex items-center gap-5">
								<div className="w-16 h-16 md:w-20 md:h-20 flex-shrink-0 flex items-center justify-center relative rounded-2xl overflow-hidden bg-white shadow-sm ring-1 ring-white/20">
									{org.logoUrl ? (
										<Image src={org.logoUrl} alt={org.nome} fill className="object-contain p-1.5 rounded-2xl" />
									) : (
										<Building2 className="w-9 h-9 text-brand" />
									)}
								</div>
								<div className="flex flex-col gap-0.5 min-w-0">
									<h1 className="text-xl md:text-2xl font-black tracking-tight leading-tight text-brand-foreground truncate">{org.nome}</h1>
									{org.telefone ? <p className="text-sm text-brand-foreground/70 font-medium">{formatToPhone(org.telefone)}</p> : null}
								</div>
							</div>

							{/* Program info rows */}
							<div className="px-5 py-4 md:px-7 md:py-5 flex flex-col flex-1 justify-evenly divide-y divide-border/50">
								{/* Accumulation */}
								<div className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
									<div className="bg-green-100 p-2.5 rounded-xl flex-shrink-0">
										<BadgePercent className="w-5 h-5 text-green-700" />
									</div>
									<div className="flex flex-col min-w-0">
										<span className="text-[0.65rem] font-bold uppercase text-muted-foreground tracking-widest">Acúmulo</span>
										<span className="text-sm font-extrabold text-foreground leading-snug">{getCashbackAccumulationCopy(cashbackProgram)}</span>
									</div>
								</div>

								{/* Expiration */}
								{cashbackProgram.expiracaoRegraValidadeValor > 0 ? (
									<div className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
										<div className="bg-amber-100 p-2.5 rounded-xl flex-shrink-0">
											<Clock className="w-5 h-5 text-amber-700" />
										</div>
										<div className="flex flex-col min-w-0">
											<span className="text-[0.65rem] font-bold uppercase text-muted-foreground tracking-widest">Validade</span>
											<span className="text-sm font-extrabold text-foreground leading-snug">
												{cashbackProgram.expiracaoRegraValidadeValor} dias para utilizar
											</span>
										</div>
									</div>
								) : null}

								{/* Discounts */}
								{cashbackProgram.modalidadeDescontosPermitida ? (
									<div className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
										<div className="bg-blue-100 p-2.5 rounded-xl flex-shrink-0">
											<ShoppingCart className="w-5 h-5 text-blue-700" />
										</div>
										<div className="flex flex-col min-w-0">
											<span className="text-[0.65rem] font-bold uppercase text-muted-foreground tracking-widest">Descontos</span>
											<span className="text-sm font-extrabold text-foreground leading-snug">Use seu saldo como desconto</span>
										</div>
									</div>
								) : null}

								{/* Rewards */}
								{cashbackProgram.modalidadeRecompensasPermitida ? (
									<div className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
										<div className="bg-purple-100 p-2.5 rounded-xl flex-shrink-0">
											<Gift className="w-5 h-5 text-purple-700" />
										</div>
										<div className="flex flex-col min-w-0">
											<span className="text-[0.65rem] font-bold uppercase text-muted-foreground tracking-widest">Recompensas</span>
											<span className="text-sm font-extrabold text-foreground leading-snug">Troque por prêmios exclusivos</span>
										</div>
									</div>
								) : null}
							</div>
						</div>
					</div>

					{/* RIGHT: Keypad or Mobile Input */}
					<div className="w-full md:w-[55%] flex flex-col justify-center">
						{isMobileMode ? (
							<div className="flex flex-col gap-5 items-center">
								<div className="text-center space-y-1">
									<h2 className="text-2xl font-extrabold tracking-tight">Identifique-se</h2>
									<p className="text-sm text-muted-foreground">Digite seu número de telefone para começar</p>
								</div>
								<div className="w-full max-w-sm">
									<TextInput
										label="TELEFONE"
										inputType="tel"
										placeholder="(00) 00000-0000"
										value={formattedPhone}
										handleChange={(v) => {
											const digits = v.replace(/\D/g, "").slice(0, 11);
											setPhoneDigits(digits);
										}}
									/>
								</div>
							</div>
						) : (
							<div className="flex flex-col gap-3.5">
								{/* Phone showcase */}
								<div className="bg-card border border-border/50 rounded-2xl p-5 md:p-7 text-center shadow-sm">
									<p className="text-[0.65rem] font-bold uppercase text-muted-foreground tracking-widest mb-2">Número de Telefone</p>
									<div className="flex items-center justify-center min-h-[3.5rem]">
										{phoneDigits.length > 0 ? (
											<p className="text-4xl font-black tracking-wider text-foreground">{formattedPhone}</p>
										) : (
											<p className="text-4xl font-black tracking-wider text-muted-foreground/20">(00) 00000-0000</p>
										)}
									</div>
								</div>

								{/* Keypad — brand-colored buttons */}
								<div className="grid grid-cols-3 gap-2.5">
									{[7, 8, 9, 4, 5, 6, 1, 2, 3].map((digit) => (
										<button
											key={digit}
											type="button"
											disabled={phoneDigits.length >= 11}
											onClick={() => handleKeyPress(String(digit))}
											className="h-16 md:h-[4.25rem] rounded-xl bg-brand text-brand-foreground text-2xl md:text-3xl font-black hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
										>
											{digit}
										</button>
									))}
									<button
										type="button"
										disabled={phoneDigits.length >= 11}
										onClick={() => handleKeyPress("0")}
										className="col-span-2 h-16 md:h-[4.25rem] rounded-xl bg-brand text-brand-foreground text-2xl md:text-3xl font-black hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
									>
										0
									</button>
									<button
										type="button"
										onClick={handleBackspace}
										disabled={phoneDigits.length === 0}
										className="h-16 md:h-[4.25rem] rounded-xl bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md flex items-center justify-center"
									>
										<Delete className="w-7 h-7" />
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			) : null}

			{/* ===== LOADING STATE ===== */}
			{isLoadingState ? (
				<div className="w-full max-w-lg flex flex-col items-center justify-center gap-4 py-16 animate-in fade-in">
					<Loader2 className="w-12 h-12 text-brand animate-spin" />
					<div className="text-center">
						<p className="text-lg font-bold text-foreground">Buscando registros...</p>
						<p className="text-sm text-muted-foreground mt-1">Verificando o número {formattedPhone}</p>
					</div>
				</div>
			) : null}

			{/* ===== CLIENT FOUND — carteirinha do clube + matriz de ações ===== */}
			{clientFound && client ? (
				<div className={cn("w-full flex flex-col items-center justify-center gap-4 short:gap-3", isMobileMode ? "max-w-md" : "max-w-xl")}>
					<ClubIdentityCard
						org={{ nome: org.nome, logoUrl: org.logoUrl }}
						programTitle={clientProgram?.titulo ?? cashbackProgram.titulo}
						client={{ nome: client.nome, telefone: client.telefone, metadataTotalCompras: client.metadataTotalCompras }}
						saldoDisponivel={clientBalance?.saldoValorDisponivel ?? 0}
						terminologia={clientProgram?.terminologia ?? cashbackProgram.terminologia}
						dataAdesao={clientBalance?.dataAdesao ?? null}
						size={isMobileMode ? "mobile" : "kiosk"}
					/>

					{hasPoiActions ? (
						<div className={cn("w-full grid gap-3 short:gap-2", shouldPassIntent ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
							{canAccrue ? (
								<Button
									type="button"
									size="lg"
									onClick={() => handleGoToTransaction(shouldPassIntent ? "pontuar" : null)}
									className="w-full rounded-2xl h-12 text-base font-bold shadow-sm bg-brand text-brand-foreground hover:bg-brand hover:opacity-90"
								>
									<BadgePercent className="w-5 h-5 mr-2" />
									Pontuar
								</Button>
							) : null}
							{canRedeem ? (
								<Button
									type="button"
									size="lg"
									onClick={() => handleGoToTransaction(shouldPassIntent ? "resgatar" : null)}
									className="w-full rounded-2xl h-12 text-base font-bold shadow-sm bg-brand-secondary text-brand-secondary-foreground hover:bg-brand-secondary hover:opacity-90"
								>
									<Gift className="w-5 h-5 mr-2" />
									Resgatar
								</Button>
							) : null}
						</div>
					) : (
						<div className="w-full flex flex-col items-center gap-2">
							<p className="text-sm text-muted-foreground text-center font-medium">Esta é a sua carteirinha do clube. As transações acontecem no caixa.</p>
							<Button
								type="button"
								size="lg"
								onClick={handleGoToProfile}
								className="w-full rounded-2xl h-12 text-base font-bold shadow-sm bg-brand text-brand-foreground hover:bg-brand hover:opacity-90"
							>
								<WalletCards className="w-5 h-5 mr-2" />
								Ver meu clube
							</Button>
						</div>
					)}

					{/* Progresso do auto-avanço: só existe quando o timer está de fato rodando. */}
					{countdown !== null && !wasCancelled ? (
						<div className="w-full flex flex-col gap-2">
							<div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
								<div className="h-full bg-brand transition-all duration-1000 ease-linear" style={{ width: `${(countdown / countdownSeconds) * 100}%` }} />
							</div>
							<p className="text-sm text-muted-foreground text-center font-medium">
								Avançando em {countdown} segundo{countdown !== 1 ? "s" : ""}...
							</p>
							<Button
								type="button"
								variant="outline"
								size="fit"
								className="w-full p-3.5 font-black rounded-2xl text-sm uppercase tracking-widest"
								onClick={handleCancelRedirect}
							>
								CANCELAR
							</Button>
						</div>
					) : null}

					<button
						type="button"
						className="px-5 py-2.5 border border-border bg-background text-foreground hover:bg-accent rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
						onClick={handleReset}
					>
						NÃO É VOCÊ? TROCAR NÚMERO
					</button>
				</div>
			) : null}

			{/* ===== ADVANCING LOADER ===== */}
			{isAdvancing ? (
				<div className="w-full max-w-lg flex flex-col items-center justify-center gap-4 py-16 animate-in fade-in">
					<Loader2 className="w-12 h-12 text-green-600 animate-spin" />
					<p className="text-lg font-bold text-muted-foreground">Carregando...</p>
				</div>
			) : null}

			{/* ===== CLIENT NOT FOUND — assistente configurável (fluxo COMPLETO) ===== */}
			{clientNotFound && useRegistrationWizard ? (
				<RegistrationWizard
					org={org}
					cashbackProgram={cashbackProgram}
					registrationConfig={registrationConfig}
					mode={mode}
					flow={flow}
					presetSellerId={presetSellerId}
					phone={formattedPhone}
					onRestart={handleReset}
					onContinue={navigateAfterRegistration}
				/>
			) : null}

			{/* ===== CLIENT NOT FOUND — cadastro rápido (default de toda organização) ===== */}
			{clientNotFound && !useRegistrationWizard ? (
				<div className="w-full max-w-xl flex flex-col items-center justify-center animate-in zoom-in duration-300 motion-reduce:animate-none">
					<div className="w-full bg-card border border-brand/20 rounded-3xl p-8 md:p-10 short:p-5 flex flex-col gap-5 short:gap-3 shadow-sm">
						<div className="flex items-center gap-4 short:gap-3 mb-1 short:mb-0">
							<div className="p-3 short:p-2 bg-brand rounded-xl text-brand-foreground shadow-sm">
								<UserPlus className="w-7 h-7 short:w-5 short:h-5" />
							</div>
							<div className="min-w-0">
								<h3 className="font-extrabold text-foreground text-xl short:text-lg tracking-tight">
									{isProfileFlow ? "CLUBE DE BENEFÍCIOS" : "NOVO CLIENTE"}
								</h3>
								<p className="text-sm text-muted-foreground">
									{isProfileFlow ? "Complete os dados para entrar no clube com" : "Complete os dados para cadastrar"}{" "}
									<span className="font-bold text-foreground whitespace-nowrap">{formattedPhone}</span>
								</p>
							</div>
						</div>

						<form
							className="flex flex-col gap-4 short:gap-3"
							onSubmit={(e) => {
								e.preventDefault();
								handleSubmitNewClient();
							}}
						>
							<div className="flex flex-col gap-1.5">
								<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">NOME COMPLETO</span>
								<VirtualKeyboard
									type="text"
									label="Nome completo"
									description="Digite o nome do cliente para criar o cadastro."
									placeholder="Digite o nome do cliente"
									value={newClientName}
									onChange={setNewClientName}
									confirmLabel="Confirmar nome"
									triggerClassName="h-11 justify-start text-left px-3 rounded-lg border-input bg-background text-sm font-medium"
								/>
							</div>

							{showSellerSelection ? (
								<SellerPicker
									orgId={org.id}
									selectedSellerId={newClientAuthorSellerId}
									isSkipped={authorSellerSkipped}
									onSelectSeller={(sellerId) => {
										setAuthorSellerSkipped(false);
										setNewClientAuthorSellerId(sellerId);
									}}
									onSkip={() => {
										setAuthorSellerSkipped(true);
										setNewClientAuthorSellerId(null);
									}}
								/>
							) : null}

							<div className="w-full flex items-center justify-center">
								<Button
									type="button"
									variant="ghost"
									size="fit"
									className="w-fit flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
									onClick={() => setShowOptionalFields((prev) => !prev)}
								>
									{showOptionalFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
									{showOptionalFields ? "OCULTAR OUTROS DADOS" : "MOSTRAR OUTROS DADOS"}
								</Button>
							</div>

							{showOptionalFields ? (
								<div className="flex flex-col gap-3">
									<div className="flex flex-col gap-1.5">
										<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CPF/CNPJ</span>
										<VirtualKeyboard
											type="numeric"
											label="CPF/CNPJ"
											description="Digite apenas os números do documento do cliente."
											placeholder="Digite o CPF/CNPJ do cliente"
											value={newClientCpfCnpj.replace(/\D/g, "")}
											onChange={(value) => setNewClientCpfCnpj(formatToCPForCNPJ(value))}
											maxLength={14}
											formatValue={formatToCPForCNPJ}
											confirmLabel="Confirmar documento"
											triggerClassName={cn(
												"h-11 justify-start text-left px-3 rounded-lg border-input bg-background text-sm font-medium",
												newClientCpfCnpj && !isValidCpfCnpj(newClientCpfCnpj) && "border-destructive",
											)}
										/>
										{newClientCpfCnpj && !isValidCpfCnpj(newClientCpfCnpj) ? (
											<p className="text-xs font-medium text-destructive">CPF/CNPJ inválido — confira os números.</p>
										) : null}
									</div>
									<div className="flex flex-col gap-1.5">
										<span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">DATA DE NASCIMENTO</span>
										<VirtualKeyboard
											type="numeric"
											label="Data de nascimento"
											description="Digite dia, mês e ano (DD/MM/AAAA)."
											placeholder="DD/MM/AAAA"
											value={newClientBirthDateDigits}
											onChange={setNewClientBirthDateDigits}
											maxLength={8}
											formatValue={formatDateDigits}
											confirmLabel="Confirmar data"
											triggerClassName="h-11 justify-start text-left px-3 rounded-lg border-input bg-background text-sm font-medium"
										/>
									</div>
								</div>
							) : null}

							<Button
								type="submit"
								size="lg"
								disabled={isCreatingClient || !newClientName}
								className="w-full mt-1 short:mt-0 rounded-2xl h-12 text-base font-bold shadow-sm bg-brand text-brand-foreground hover:bg-brand hover:opacity-90"
							>
								{isCreatingClient ? (
									<>
										<Loader2 className="w-5 h-5 mr-2 animate-spin" />
										CADASTRANDO...
									</>
								) : (
									<>
										<UserPlus className="w-5 h-5 mr-2" />
										{isProfileFlow ? "ENTRAR NO CLUBE" : "AVANÇAR"}
									</>
								)}
							</Button>
							{!newClientName ? <p className="text-xs text-muted-foreground text-center -mt-2 short:-mt-1">Preencha o nome para continuar</p> : null}
						</form>

						<div className="w-full flex items-center flex-col gap-1 pt-2">
							<p className="text-sm text-muted-foreground font-medium">Outro número de telefone?</p>
							<button
								type="button"
								className="px-5 py-2.5 border border-border bg-background text-foreground hover:bg-accent rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
								onClick={handleReset}
							>
								TENTAR OUTRO NÚMERO
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
