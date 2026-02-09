"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getErrorMessage } from "@/lib/errors";
import { createOrganization } from "@/lib/mutations/organizations";
import { isValidCNPJ } from "@/lib/validation";
import { useOrganizationOnboardingState } from "@/state-hooks/use-organization-onboarding-state";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import z from "zod";
import { ActuationStage } from "./components/ActuationStage";
import { GeneralInfoStage } from "./components/GeneralInfoStage";
import { NicheOriginStage } from "./components/NicheOriginStage";
import { OnboardingLayout } from "./components/OnboardingLayout";
import { SubscriptionPlansStage } from "./components/SubscriptionPlansStage";

type OnboardingPageProps = {
	user: unknown; // We might need this later, keeping prop signature
};
const OnboardingFirstStageValidationSchema = z.object({
	nome: z.string({ invalid_type_error: "Tipo não válido para o nome da empresa." }).min(1, "Por favor, preencha o nome da empresa."),
	cnpj: z
		.string({ invalid_type_error: "Tipo não válido para o CNPJ da empresa." })
		.min(1, "Por favor, preencha o CNPJ da empresa.")
		.refine(isValidCNPJ, "Por favor, preencha um CNPJ válido."),
	email: z.string({ invalid_type_error: "Tipo não válido para o email da empresa." }).email("Por favor, preencha um email válido."),
	telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone/whatsapp." }).min(1, "Por favor, preencha o telefone/whatsapp."),
	termsAccepted: z.boolean({ message: "Por favor, aceite os Termos de Uso e Política de Privacidade para continuar." }),
});
export function OnboardingPage({ user }: OnboardingPageProps) {
	const { state, updateOrganization, updateOrganizationLogoHolder, updateOrganizationOnboarding, goToNextStage, goToPreviousStage } =
		useOrganizationOnboardingState({});

	const mutation = useMutation({
		mutationFn: createOrganization,
		onSuccess: (data) => {
			// Redirect to the provided URL (either dashboard or Stripe checkout)
			window.location.href = data.data.redirectTo;
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const handleNext = () => {
		if (state.stage === "organization-general-info") {
			const firstStageValidation = OnboardingFirstStageValidationSchema.safeParse({
				...state.organization,
				termsAccepted: state.termsAccepted,
			});
			console.log(firstStageValidation);
			if (!firstStageValidation.success) {
				const firstIssue = firstStageValidation.error.issues?.[0];
				return toast.error(firstIssue?.message ?? "Ocorreu um erro de validação.");
			}
		}
		if (state.stage === "subscription-plans-section") {
			console.log("Onboarding Complete:", state);
			// Submit logic would go here
			return;
		}
		goToNextStage();
	};

	const handleBack = () => {
		goToPreviousStage();
	};

	const renderStageContent = () => {
		switch (state.stage) {
			case "organization-general-info":
				return (
					<GeneralInfoStage
						state={state}
						updateOrganization={updateOrganization}
						updateOrganizationLogoHolder={updateOrganizationLogoHolder}
						updateOrganizationOnboarding={updateOrganizationOnboarding}
					/>
				);
			case "organization-niche-origin":
				return <NicheOriginStage state={state} updateOrganization={updateOrganization} />;
			case "organization-actuation":
				return <ActuationStage state={state} updateOrganization={updateOrganization} />;
			case "subscription-plans-section":
				return (
					<SubscriptionPlansStage
						state={state}
						handleSelectPlan={(info) => {
							updateOrganizationOnboarding({ subscription: info });
							mutation.mutate({
								organization: state.organization,
								subscription: info,
							});
						}}
						isMutationPending={mutation.isPending}
						goToPreviousStage={handleBack}
					/>
				);
			default:
				return null;
		}
	};

	const getStageInfo = () => {
		switch (state.stage) {
			case "organization-general-info":
				return {
					step: 1,
					title: "SOBRE A EMPRESA",
					description: "Preencha aqui as informações básicas da sua empresa para começarmos.",
				};
			case "organization-niche-origin":
				return {
					step: 2,
					title: "NICHO E ORIGEM",
					description: "Conte-nos um pouco mais sobre o seu mercado e como nos conheceu.",
				};
			case "organization-actuation":
				return {
					step: 3,
					title: "ATUAÇÃO",
					description: "Entenda melhor o perfil e escala da sua operação.",
				};
			case "subscription-plans-section":
				return {
					step: 4,
					title: "PLANOS",
					description: "Escolha o plano ideal para o seu negócio.",
				};
		}
	};

	const stageInfo = getStageInfo();

	return (
		<OnboardingLayout currentStage={state.stage}>
			<div className="h-full flex w-full flex-col gap-6 min-h-0">
				<div className="flex flex-col gap-0.5">
					<h3 className="text-xs text-gray-500 tracking-tight">ETAPA {stageInfo.step}</h3>
					<h1 className="font-bold text-xl md:text-2xl text-gray-900 tracking-tight">{stageInfo.title}</h1>
					<p className="text-sm text-gray-500 tracking-tight">{stageInfo.description}</p>
				</div>
				<div className="w-full flex flex-col gap-6 grow overflow-y-auto px-1 min-h-0 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
					{renderStageContent()}
				</div>
				{state.stage !== "subscription-plans-section" ? (
					<>
						<Separator />
						<div className="w-full flex items-center justify-between">
							<Button variant="ghost" size="lg" onClick={handleBack} className="flex items-center gap-1.5 rounded-xl py-3">
								<ArrowLeft className="h-4 w-4" />
								VOLTAR
							</Button>

							<Button
								onClick={handleNext}
								size={"lg"}
								className="flex items-center gap-1.5 bg-[#24549C] text-white hover:bg-[#1e4682] transition-all rounded-xl py-3"
							>
								CONTINUAR
								<ArrowRight className="h-4 w-4" />
							</Button>
						</div>
					</>
				) : null}
			</div>
		</OnboardingLayout>
	);
}
