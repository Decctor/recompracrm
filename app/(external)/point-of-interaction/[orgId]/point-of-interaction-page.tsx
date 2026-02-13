"use client";

import type { TCreatePointOfInteractionTransactionInput } from "@/app/api/point-of-interaction/new-transaction/route";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuViewOnly from "@/components/Utils/ResponsiveMenuViewOnly";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToCPForCNPJ, formatToMoney, formatToPhone } from "@/lib/formatting";
import { createClientViaPointOfInteraction } from "@/lib/mutations/clients";
import { useClientByLookup } from "@/lib/queries/clients";
import type { TCashbackProgramEntity, TOrganizationEntity } from "@/services/drizzle/schema";
import LogoHorizontalRecompraCRM from "@/utils/images/logos/RECOMPRA - COMPLETE - HORIZONTAL- COLORFUL.png";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, Coins, Gift, Loader2, ShoppingCart, Trophy, Wallet } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSound from "use-sound";
type ClientLookupResult = {
	id: string;
	nome: string;
	telefone: string;
	email: string | null;
	saldos: Array<{
		id: string;
		saldoValorDisponivel: number;
		saldoValorAcumuladoTotal: number;
		saldoValorResgatadoTotal: number;
	}>;
};

type AlternatingCashbackBadgeProps = {
	cashbackProgram: TCashbackProgramEntity;
};

function AlternatingCashbackBadge({ cashbackProgram }: AlternatingCashbackBadgeProps) {
	const [showPromo, setShowPromo] = useState(false);

	useEffect(() => {
		const interval = setInterval(() => {
			setShowPromo((prev) => !prev);
		}, 3000);

		return () => clearInterval(interval);
	}, []);

	return (
		<div className="flex items-center gap-3 bg-brand/5 px-5 py-3 rounded-2xl border border-brand/10 min-w-[280px]">
			<AnimatePresence mode="wait">
				{!showPromo ? (
					<motion.div
						key="rules"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.4 }}
						className="flex items-center gap-3 w-full"
					>
						<div className="bg-brand/10 p-2.5 rounded-full">
							<Coins className="w-5 h-5 text-brand" />
						</div>
						<div className="flex flex-col">
							<span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Regras do Cashback</span>
							<div className="flex items-center gap-2 text-sm font-bold text-foreground">
								<span>Ganhe {cashbackProgram.acumuloValor}%</span>
								<span className="w-1 h-1 bg-brand/30 rounded-full" />
								<span>Válido por {cashbackProgram.expiracaoRegraValidadeValor} dias</span>
							</div>
						</div>
					</motion.div>
				) : (
					<motion.div
						key="promo"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.4 }}
						className="flex items-center gap-3 w-full"
					>
						<div className="bg-brand/10 p-2.5 rounded-full">
							<Gift className="w-5 h-5 text-brand" />
						</div>
						<div className="flex flex-col">
							<span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Promoção Especial</span>
							<div className="flex items-center text-sm font-bold text-foreground">
								<span>Ganhe R$ 20 na sua primeira compra</span>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export default function PointOfInteractionContent({
	org,
	cashbackProgram,
}: {
	cashbackProgram: TCashbackProgramEntity;
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
	};
}) {
	const router = useRouter();
	const [showProfileMenu, setShowProfileMenu] = useState(false);
	const [playAction] = useSound("/sounds/action-completed.mp3");

	return (
		<div className="grow bg-background p-6 md:p-10 flex flex-col items-center gap-6">
			{/* HEADER HORIZONTAL: Logo + Info + Regras */}
			<header className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4 bg-white/50 backdrop-blur-sm px-4 py-2 md:px-6 md:py-4 rounded-[2rem] border border-white/40 shadow-sm">
				<div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
					{org.logoUrl ? (
						<div className="relative w-12 h-12 md:w-16 md:h-16 drop-shadow-sm rounded-full overflow-hidden bg-white">
							<Image src={org.logoUrl} alt={org.nome} fill className="object-contain" />
						</div>
					) : (
						<div className="w-12 h-12 md:w-16 md:h-16 bg-brand/10 rounded-full overflow-hidden flex items-center justify-center">
							<Building2 className="w-8 h-8 text-brand" />
						</div>
					)}
					<div>
						<h1 className="text-md md:text-lg font-black uppercase tracking-tight text-foreground/90">SEJA BEM VINDO À {org.nome}</h1>
						<p className="text-xs md:text-sm font-medium text-muted-foreground">O melhor programa de fidelidade da região.</p>
					</div>
				</div>

				<AlternatingCashbackBadge cashbackProgram={cashbackProgram} />
			</header>

			{/* MAIN CONTENT - Unified Flow */}
			<PointOfInteractionActions
				org={org}
				router={router}
				handleOpenProfileMenu={() => {
					setShowProfileMenu(true);
					playAction();
				}}
				handlePlayAction={() => playAction()}
			/>

			{/* MODAL DE BUSCA */}
			{showProfileMenu ? <IdentificationMenu orgId={org.id} closeMenu={() => setShowProfileMenu(false)} /> : null}
		</div>
	);
}

type IdentificationMenuProps = {
	orgId: string;
	closeMenu: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
function IdentificationMenu({ orgId, closeMenu, callbacks }: IdentificationMenuProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const {
		data: client,
		queryKey,
		isSuccess: isSuccessClient,
		isLoading: isLoadingClient,
		isError: isErrorClient,
		error: errorClient,

		params,
		updateParams,
	} = useClientByLookup({
		initialParams: {
			orgId,
			phone: "",
			clientId: null,
		},
	});

	const [playAction] = useSound("/sounds/action-completed.mp3");

	// Auto-redirect timer state
	const REDIRECT_COUNTDOWN_SECONDS = 3;
	const [countdown, setCountdown] = useState<number | null>(null);
	const [isRedirecting, setIsRedirecting] = useState(false);
	const [wasCancelled, setWasCancelled] = useState(false);

	// Reset wasCancelled when user starts typing a new phone number
	useEffect(() => {
		if (params.phone && wasCancelled) {
			setWasCancelled(false);
		}
	}, [params.phone, wasCancelled]);

	// Start countdown when client is found
	useEffect(() => {
		if (isSuccessClient && client && countdown === null && !isRedirecting && !wasCancelled) {
			playAction();
			setCountdown(REDIRECT_COUNTDOWN_SECONDS);
		}
	}, [isSuccessClient, client, countdown, isRedirecting, wasCancelled, playAction]);

	// Handle countdown timer and auto-redirect
	useEffect(() => {
		if (countdown === null || countdown < 0) return;

		if (countdown === 0) {
			setIsRedirecting(true);
			router.push(`/point-of-interaction/${orgId}/client-profile/${client?.id}`);
			return;
		}

		const timer = setTimeout(() => {
			setCountdown((prev) => (prev !== null ? prev - 1 : null));
		}, 1000);

		return () => clearTimeout(timer);
	}, [countdown, router, orgId, client?.id]);

	// Cancel auto-redirect and reset search
	async function handleCancelRedirect() {
		await queryClient.cancelQueries({ queryKey });
		await queryClient.invalidateQueries({ queryKey });
		setCountdown(null);
		setIsRedirecting(false);
		setWasCancelled(true);
		updateParams({ phone: "", clientId: null });
	}

	// Show found client card with auto-redirect
	const showFoundClientCard = isSuccessClient && client && !isRedirecting && !wasCancelled;
	// Show input only when not found or cancelled
	const showInput = !showFoundClientCard && !isRedirecting;

	return (
		<ResponsiveMenuViewOnly
			menuTitle="IDENTIFIQUE-SE"
			menuDescription="Informe seu telefone para ver seu saldo atual"
			menuCancelButtonText="CANCELAR"
			closeMenu={closeMenu}
			stateIsLoading={false}
			stateError={null}
			drawerContentClassName="min-h-[50vh]"
			dialogShowFooter={false}
		>
			<AnimatePresence mode="wait">
				{showInput ? (
					<motion.div
						key="input-form"
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 20 }}
						transition={{ duration: 0.3, ease: "easeOut" }}
						className="w-full flex flex-col gap-4"
					>
						<form
							className="w-full"
							onSubmit={(e) => {
								e.preventDefault();
							}}
						>
							<TextInput
								label="NÚMERO DO WHATSAPP"
								inputType="tel"
								placeholder="(00) 00000-0000"
								value={params.phone}
								handleChange={(value) => updateParams({ phone: formatToPhone(value) })}
								onFocus={(e) => {
									setTimeout(() => {
										e.target.scrollIntoView({ behavior: "smooth", block: "center" });
									}, 300);
								}}
							/>
						</form>
						<AnimatePresence>
							{isLoadingClient ? (
								<motion.div
									initial={{ opacity: 0, y: -10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -10 }}
									className="w-full flex items-center justify-center gap-1.5"
								>
									<Loader2 className="w-4 h-4 animate-spin" />
									<p className="text-sm text-muted-foreground">Buscando registros...</p>
								</motion.div>
							) : null}
						</AnimatePresence>
						{isSuccessClient && !client ? <NewClientForm orgId={orgId} phone={params.phone} closeMenu={closeMenu} callbacks={callbacks} /> : null}
					</motion.div>
				) : null}

				{showFoundClientCard && client ? (
					<motion.div
						key="profile-card"
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.9 }}
						transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
						className="bg-green-50 border-2 border-green-200 rounded-3xl p-6 flex flex-col items-center gap-4 w-full"
					>
						<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }} className="text-center">
							<motion.p
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ delay: 0.15, type: "spring", stiffness: 500, damping: 25 }}
								className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1"
							>
								✓ Perfil Encontrado
							</motion.p>
							<p className="text-green-900 font-black text-2xl uppercase italic">{client.nome}</p>
							<p className="text-green-600 font-bold">{formatToPhone(client.telefone)}</p>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
							className="bg-green-600 w-full rounded-2xl p-4 text-center text-white shadow-md"
						>
							<p className="text-[0.6rem] font-bold opacity-80 uppercase tracking-widest">Saldo Disponível</p>
							<motion.p
								initial={{ opacity: 0, scale: 0.5 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ delay: 0.35, type: "spring", stiffness: 400, damping: 20 }}
								className="text-3xl font-black"
							>
								{formatToMoney(client.saldos[0]?.saldoValorDisponivel ?? 0)}
							</motion.p>
						</motion.div>

						{/* Progress bar and countdown */}
						<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.3 }} className="w-full flex flex-col gap-2">
							<div className="w-full h-2 bg-green-200 rounded-full overflow-hidden">
								<motion.div
									className="h-full bg-green-600"
									initial={{ width: "100%" }}
									animate={{ width: `${((countdown ?? 0) / REDIRECT_COUNTDOWN_SECONDS) * 100}%` }}
									transition={{ duration: 1, ease: "linear" }}
								/>
							</div>
							<p className="text-sm text-green-700 text-center font-medium">
								Redirecionando em {countdown} segundo{countdown !== 1 ? "s" : ""}...
							</p>
						</motion.div>

						<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.3 }} className="w-full">
							<Button
								variant="outline"
								size="fit"
								className="w-full p-4 font-black border-green-300 text-green-700 hover:bg-green-100"
								onClick={handleCancelRedirect}
							>
								CANCELAR
							</Button>
						</motion.div>
					</motion.div>
				) : null}

				{isRedirecting ? (
					<motion.div
						key="redirecting"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
						className="w-full flex flex-col items-center justify-center gap-3 py-8"
					>
						<motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}>
							<Loader2 className="w-8 h-8 text-green-600" />
						</motion.div>
						<p className="text-sm text-muted-foreground font-medium">Carregando perfil...</p>
					</motion.div>
				) : null}
			</AnimatePresence>
		</ResponsiveMenuViewOnly>
	);
}

type NewClientFormProps = {
	orgId: string;
	phone: string;
	closeMenu: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
function NewClientForm({ orgId, phone, closeMenu, callbacks }: NewClientFormProps) {
	const router = useRouter();
	const [infoHolder, setInfoHolder] = useState<Omit<TCreatePointOfInteractionTransactionInput["client"], "telefone">>({
		nome: "",
		cpfCnpj: null,
	});
	const [playSuccess] = useSound("/sounds/success.mp3");
	const { mutate: handleCreateClientMutation, isPending: isCreatingClient } = useMutation({
		mutationKey: ["create-client"],
		mutationFn: createClientViaPointOfInteraction,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			playSuccess();
			toast.success(data.message);
			return router.push(`/point-of-interaction/${orgId}/client-profile/${data.data.insertedClientId}`);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});
	return (
		<form
			className="w-full flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				handleCreateClientMutation({ orgId, client: { ...infoHolder, telefone: phone } });
			}}
		>
			<p className="text-sm text-muted-foreground text-pretty">
				Oops, parece que você ainda não tem um cadastro. Por favor, preencha os dados abaixo para criar seu cadastro e começar a ganhar cashback !
			</p>
			<TextInput
				label="NOME DO CLIENTE"
				placeholder="Digite o nome do cliente"
				value={infoHolder.nome}
				handleChange={(value) => setInfoHolder((prev) => ({ ...prev, nome: value }))}
				onFocus={(e) => {
					setTimeout(() => {
						e.target.scrollIntoView({ behavior: "smooth", block: "center" });
					}, 300);
				}}
			/>
			<TextInput
				label="CPF/CNPJ"
				inputType="tel"
				placeholder="Digite o CPF/CNPJ do cliente"
				value={infoHolder.cpfCnpj ?? ""}
				handleChange={(value) => setInfoHolder((prev) => ({ ...prev, cpfCnpj: formatToCPForCNPJ(value) }))}
				onFocus={(e) => {
					setTimeout(() => {
						e.target.scrollIntoView({ behavior: "smooth", block: "center" });
					}, 300);
				}}
			/>
			<LoadingButton type="submit" loading={isCreatingClient}>
				CRIAR CADASTRO
			</LoadingButton>
		</form>
	);
}
// Unified action buttons component for Point of Interaction
type PointOfInteractionActionsProps = {
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
	};
	router: ReturnType<typeof useRouter>;
	handleOpenProfileMenu: () => void;
	handlePlayAction: () => void;
};

function PointOfInteractionActions({ org, router, handleOpenProfileMenu, handlePlayAction }: PointOfInteractionActionsProps) {
	return (
		<main className="w-full max-w-5xl flex-1 flex flex-col">
			<div className="flex flex-col md:flex-row items-stretch gap-6 md:gap-10 flex-1">
				{/* LEFT COLUMN: Main Action - New Transaction */}
				<div className="w-full md:w-1/2 flex flex-col gap-6">
					<Button
						onClick={() => {
							handlePlayAction();
							router.push(`/point-of-interaction/${org.id}/new-sale`);
						}}
						variant="default"
						className="group relative flex flex-col items-center justify-center gap-4 h-auto flex-1 rounded-3xl shadow-xl hover:scale-[1.02] transition-all border-none p-8 bg-brand text-brand-foreground hover:bg-brand/80"
					>
						<div className="bg-white/20 p-6 rounded-3xl group-hover:scale-110 transition-transform">
							<ShoppingCart className="w-16 h-16 md:w-20 md:h-20" />
						</div>
						<div className="text-center">
							<h3 className="text-2xl md:text-3xl font-black tracking-tight">RESGATE SEU CASHBACK</h3>
							<p className="text-sm md:text-base opacity-90 mt-2 font-medium text-wrap whitespace-pre-wrap">
								Ganhe ou resgate cashback <br className="hidden md:block" /> em suas compras.
							</p>
						</div>
						<ArrowRight className="absolute bottom-8 right-8 w-8 h-8 opacity-50" />
					</Button>
				</div>

				{/* RIGHT COLUMN: Secondary Actions */}
				<div className="w-full md:w-1/2 flex flex-col gap-6">
					{/* MEU SALDO */}
					<Button
						onClick={handleOpenProfileMenu}
						variant="outline"
						size="fit"
						className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-primary/20 p-6 flex-1 w-full"
					>
						<Coins className="w-10 h-10" />
						<div className="text-center">
							<h3 className="text-base font-bold uppercase">MEU SALDO</h3>
							<p className="text-xs md:text-sm opacity-80 font-medium">Veja sua posição no ranking, seus resgates e seus acumulos</p>
						</div>
					</Button>

					{/* RANKING VENDEDORES */}
					<Button
						onClick={() => router.push(`/point-of-interaction/${org.id}/sellers-ranking`)}
						variant="outline"
						size="fit"
						className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-primary/20 p-6 flex-1 w-full bg-secondary"
					>
						<Trophy className="w-10 h-10" />
						<div className="text-center">
							<h3 className="text-base font-bold uppercase">RANKING DE VENDEDORES</h3>
							<p className="text-xs md:text-sm opacity-80 font-medium">Acompanhe a competição entre os vendedores</p>
						</div>
					</Button>
				</div>
			</div>
		</main>
	);
}
