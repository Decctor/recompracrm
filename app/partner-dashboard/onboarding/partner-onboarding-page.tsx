"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { PlatformPartnerTermsMenu } from "@/components/Modals/PlatformPartners/PlatformPartnerTermsMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatToCNPJ, formatToCPF, formatToPhone } from "@/lib/formatting";
import { createPlatformPartnerDocument, createPlatformPartnerOnboarding } from "@/lib/mutations/platform-partnerships";
import { PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES, PLATFORM_PARTNER_DOCUMENT_MAX_BYTES } from "@/lib/platform-partnerships/documents";
import { detectPixKeyType, maskPixKey } from "@/lib/platform-partnerships/earnings";
import { cn } from "@/lib/utils";
import type { TPlatformPartnerPixKeyTypeEnum } from "@/schemas/enums";
import { usePlatformPartnerOnboardingState } from "@/state-hooks/use-platform-partner-onboarding-state";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Camera, Check, ChevronLeft, ExternalLink, FileText, Landmark, Link2, Loader2, Repeat, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CardLogo } from "../_components/partner-card";
import { PARTNER_CARD_SURFACE } from "../_components/partner-ui";
import { MainAppLink } from "../_components/partner-shell";
import { StatusFrame } from "../_components/partner-status-screens";

type TExistingPartner = {
	status: string;
	nome: string;
	email: string;
	telefone: string;
	tipoPessoa: "PESSOA_FISICA" | "PESSOA_JURIDICA" | null;
	cpfCnpj: string;
	chavePix: string;
	chavePixTipo: TPlatformPartnerPixKeyTypeEnum | null;
	arquivos: { cpf?: string; cnpj?: string };
};

const PIX_KEY_TYPES: { value: TPlatformPartnerPixKeyTypeEnum; label: string }[] = [
	{ value: "CPF", label: "CPF" },
	{ value: "CNPJ", label: "CNPJ" },
	{ value: "EMAIL", label: "Email" },
	{ value: "TELEFONE", label: "Telefone" },
	{ value: "ALEATORIA", label: "Aleatória" },
];

const TERMS = [
	{
		title: "Atribuição por último clique",
		text: "A loja fica vinculada a você por 30 dias depois do clique no link. O código informado no cadastro tem prioridade.",
	},
	{ title: "Base da comissão", text: "Valor bruto do plano do RecompraCRM, sem serviços de consultoria." },
	{ title: "Percentuais", text: "100% da 1ª e da 3ª mensalidade, 20% das demais. Planos anuais: 27% da fatura." },
	{ title: "Pagamento mensal", text: "O financeiro apura as comissões do mês e paga via PIX todo dia 10, com comprovante no painel." },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

function Field({
	label,
	htmlFor,
	accent,
	children,
	hint,
}: {
	label: string;
	htmlFor: string;
	accent?: boolean;
	children: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={htmlFor} className={cn("text-label", accent ? "text-primary" : "text-foreground/70")}>
				{label}
			</label>
			{children}
			{hint}
		</div>
	);
}

const INPUT_CLASS =
	"h-12 w-full rounded-[14px] border border-border bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-primary focus:shadow-[0_0_0_3px_rgba(36,84,156,0.15)]";

function PrimaryButton({ ready, children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { ready: boolean }) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-[52px] w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-extrabold transition-all duration-200 disabled:opacity-70",
				ready
					? "bg-primary text-primary-foreground shadow-[0_6px_14px_-4px_rgba(36,84,156,0.32),0_2px_4px_rgba(36,84,156,0.18)] hover:bg-primary/90"
					: "bg-border text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}

function StepHeader({ step, onBack, mainAppHref }: { step: number; onBack: (() => void) | null; mainAppHref: string | null }) {
	return (
		<>
			<div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
				{onBack ? (
					<button
						type="button"
						onClick={onBack}
						aria-label="Voltar"
						className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border transition-colors hover:bg-muted"
					>
						<ChevronLeft className="h-[18px] w-[18px]" />
					</button>
				) : mainAppHref ? (
					// Sem etapa anterior (quem volta para revisar começa aqui): o voltar leva ao app principal.
					<Link
						href={mainAppHref}
						aria-label="Voltar ao RecompraCRM"
						className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border transition-colors hover:bg-muted"
					>
						<ChevronLeft className="h-[18px] w-[18px]" />
					</Link>
				) : (
					<span className="w-10" />
				)}
				<span className="text-[13px] font-bold text-muted-foreground">Etapa {step} de 3</span>
				<span className="w-10" />
			</div>
			<div className="flex gap-1 px-5 pt-4" aria-hidden>
				{[1, 2, 3].map((index) => (
					<span key={index} className={cn("h-1.5 flex-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-border")} />
				))}
			</div>
		</>
	);
}

function StepTitle({ title, text }: { title: string; text: string }) {
	return (
		<div className="flex flex-col gap-1.5 px-5 pt-6">
			<h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.015em]">{title}</h1>
			<p className="text-sm leading-normal text-muted-foreground">{text}</p>
		</div>
	);
}

function StepFooter({ children }: { children: ReactNode }) {
	return (
		<div className="sticky bottom-0 mt-auto flex flex-col gap-3.5 border-t border-border bg-card px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
			{children}
		</div>
	);
}

export default function PartnerOnboardingPage({
	user,
	existingPartner,
	mainAppHref = null,
}: {
	user: TAuthUserSession["user"];
	existingPartner: TExistingPartner | null;
	/** Usuário de loja que abriu "Indique e ganhe": precisa de um caminho de volta ao app. */
	mainAppHref?: string | null;
}) {
	const router = useRouter();
	const initialState = useMemo(
		() => ({
			partner: existingPartner
				? {
						nome: existingPartner.nome,
						email: existingPartner.email,
						telefone: existingPartner.telefone,
						tipoPessoa: existingPartner.tipoPessoa ?? (existingPartner.cpfCnpj.replace(/\D/g, "").length === 14 ? "PESSOA_JURIDICA" : "PESSOA_FISICA"),
						cpfCnpj: existingPartner.cpfCnpj,
						chavePix: existingPartner.chavePix,
						chavePixTipo: existingPartner.chavePixTipo ?? detectPixKeyType(existingPartner.chavePix) ?? "CPF",
						titularPixConfirmado: false,
						arquivos: existingPartner.arquivos,
						aceiteTermos: false,
					}
				: {
						nome: user.nome,
						email: user.email,
						telefone: user.telefone ? formatToPhone(user.telefone) : "",
						tipoPessoa: "PESSOA_FISICA" as const,
						cpfCnpj: "",
						chavePix: "",
						chavePixTipo: "CPF" as const,
						titularPixConfirmado: false,
						arquivos: {},
						aceiteTermos: false,
					},
		}),
		[existingPartner, user],
	);
	const { state, updatePartner } = usePlatformPartnerOnboardingState({ initialState });
	const partner = state.partner;
	const [step, setStep] = useState(existingPartner ? 1 : 0);
	const [termsOpen, setTermsOpen] = useState(false);
	const [uploadedFile, setUploadedFile] = useState<{ nome: string; tamanhoBytes: number } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const pixInputRef = useRef<HTMLInputElement>(null);

	const pessoaFisica = partner.tipoPessoa === "PESSOA_FISICA";
	const documentKey = pessoaFisica ? "cpf" : "cnpj";
	const documentDigits = partner.cpfCnpj.replace(/\D/g, "");
	const hasDocumentFile = !!partner.arquivos[documentKey];

	const uploadMutation = useMutation({
		mutationKey: ["create-platform-partner-document"],
		mutationFn: createPlatformPartnerDocument,
		onSuccess: (data) => {
			updatePartner({ arquivos: { ...partner.arquivos, [data.data.tipo]: data.data.caminho } });
			setUploadedFile({ nome: data.data.nomeArquivo, tamanhoBytes: data.data.tamanhoBytes });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const submitMutation = useMutation({
		mutationKey: ["create-platform-partner-onboarding"],
		mutationFn: createPlatformPartnerOnboarding,
		onSuccess: (data) => {
			toast.success(data.message);
			router.push("/partner-dashboard");
			router.refresh();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const stepIssues: Record<number, string | null> = {
		1:
			partner.nome.trim().length < 3
				? "Informe seu nome completo."
				: !EMAIL_PATTERN.test(partner.email)
					? "Informe um email válido."
					: partner.telefone.replace(/\D/g, "").length < 10
						? "Informe um telefone com DDD."
						: documentDigits.length !== (pessoaFisica ? 11 : 14)
							? pessoaFisica
								? "Informe seu CPF."
								: "Informe o CNPJ."
							: null,
		2: !partner.chavePix.trim()
			? "Informe sua chave PIX."
			: !partner.titularPixConfirmado
				? "Confirme que a chave PIX está no seu nome."
				: uploadMutation.isPending
					? "Aguarde o envio do documento."
					: !hasDocumentFile
						? "Envie o documento para continuar."
						: null,
		3: partner.aceiteTermos ? null : "Aceite os termos para enviar.",
	};

	const goNext = () => {
		const issue = stepIssues[step];
		if (issue) {
			toast.error(issue);
			return;
		}
		if (step < 3) {
			setStep(step + 1);
			window.scrollTo({ top: 0 });
			return;
		}
		submitMutation.mutate({ partner });
	};

	const setPersonType = (tipoPessoa: "PESSOA_FISICA" | "PESSOA_JURIDICA") => {
		if (tipoPessoa === partner.tipoPessoa) return;
		setUploadedFile(null);
		updatePartner({ tipoPessoa, cpfCnpj: "", titularPixConfirmado: false, arquivos: {} });
	};

	const setPixKey = (chavePix: string) => {
		const detected = detectPixKeyType(chavePix);
		updatePartner({ chavePix, titularPixConfirmado: false, ...(detected ? { chavePixTipo: detected } : {}) });
	};

	const onFileSelected = (file: File | undefined) => {
		if (!file) return;
		if (!PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES[file.type]) {
			toast.error("Envie o documento em PDF ou foto (JPG, PNG, WEBP ou HEIC).");
			return;
		}
		if (file.size > PLATFORM_PARTNER_DOCUMENT_MAX_BYTES) {
			toast.error("O documento pode ter até 10 MB.");
			return;
		}
		uploadMutation.mutate({ tipo: documentKey, file });
	};

	// ---------------------------------------------------------------------------------------------
	// 0 · Boas-vindas
	// ---------------------------------------------------------------------------------------------
	if (step === 0) {
		const howItWorks = [
			{ icon: Link2, title: "Link próprio", text: "Você compartilha seu código com lojistas do seu relacionamento." },
			{ icon: ScanLine, title: "Onboarding rastreado", text: "O cliente informa o código ou chega pelo link de indicação." },
			{ icon: Repeat, title: "Receita recorrente", text: "As comissões aparecem no painel depois do pagamento." },
		];
		return (
			<StatusFrame>
				<div className="flex items-center gap-2.5 px-5 pt-[max(20px,env(safe-area-inset-top))]">
					<BrandLogo lockup="icon-badge" tone="color" width={32} height={32} className="rounded-full" />
					<span className="text-[11px] font-extrabold tracking-[0.16em] text-primary uppercase">Programa de Parcerias</span>
				</div>
				{mainAppHref ? <MainAppLink href={mainAppHref} className="self-start px-5 pt-3" /> : null}
				<div className="flex flex-col gap-3 px-5 pt-[22px]">
					<h1 className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.02em]">
						Indique lojas.
						<br />
						<span className="text-primary">Ganhe enquanto elas recompram.</span>
					</h1>
					<p className="text-[15px] leading-relaxed text-pretty text-foreground/70">
						{user.nome.split(" ")[0]}, falta pouco para você ter seu link, seu painel e pagamentos mensais via PIX.
					</p>
				</div>
				<div className="px-4 pt-[22px]">
					<div
						className={cn(
							"relative flex h-[190px] -rotate-2 flex-col justify-between overflow-hidden rounded-[22px] p-[22px] shadow-[0_16px_40px_-12px_rgba(36,84,156,0.40),0_6px_12px_rgba(36,84,156,0.16)]",
							PARTNER_CARD_SURFACE,
						)}
					>
						<span aria-hidden className="pointer-events-none absolute -top-[70px] -right-[60px] h-[220px] w-[220px] rounded-full border border-white/8" />
						<span aria-hidden className="pointer-events-none absolute -top-[30px] -right-[20px] h-[140px] w-[140px] rounded-full border border-white/8" />
						<div className="relative flex items-center justify-between">
							<span className="text-[11px] font-extrabold tracking-[0.14em] text-white/72 uppercase">Cartão do parceiro</span>
							<CardLogo />
						</div>
						<div className="relative flex gap-1.5" aria-hidden>
							{Array.from({ length: 8 }, (_, index) => (
								<span key={index} className="h-[34px] w-[26px] rounded-lg border-[1.5px] border-dashed border-white/35" />
							))}
						</div>
						<div className="relative flex items-end justify-between gap-3">
							<span className="truncate text-sm font-bold tracking-[0.06em] uppercase">{user.nome}</span>
							<span className="text-xs font-bold whitespace-nowrap text-warning">Seu código sai aqui</span>
						</div>
					</div>
				</div>
				<div className="flex flex-col gap-4 px-5 pt-[26px]">
					<h2 className="text-label text-muted-foreground">Como funciona</h2>
					{howItWorks.map((item) => (
						<div key={item.title} className="flex gap-3">
							<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
								<item.icon className="h-4 w-4" />
							</span>
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-extrabold">{item.title}</span>
								<span className="text-[13px] leading-snug text-muted-foreground">{item.text}</span>
							</div>
						</div>
					))}
				</div>
				<div className="grid grid-cols-3 gap-2 px-5 pt-[22px]">
					<div className="flex flex-col gap-1 rounded-[18px] bg-warning p-3 text-warning-foreground">
						<span className="text-[22px] leading-none font-extrabold">100%</span>
						<span className="text-xs leading-tight font-semibold">1ª mensalidade</span>
					</div>
					<div className="flex flex-col gap-1 rounded-[18px] bg-warning p-3 text-warning-foreground">
						<span className="text-[22px] leading-none font-extrabold">100%</span>
						<span className="text-xs leading-tight font-semibold">3ª mensalidade</span>
					</div>
					<div className="flex flex-col gap-1 rounded-[18px] bg-info-surface p-3 text-info-surface-foreground">
						<span className="text-[22px] leading-none font-extrabold">20%</span>
						<span className="text-xs leading-tight font-semibold">demais, todo mês</span>
					</div>
				</div>
				<StepFooter>
					<PrimaryButton ready onClick={() => setStep(1)}>
						Começar cadastro
						<ArrowRight className="h-4 w-4" />
					</PrimaryButton>
					<span className="text-center text-xs font-semibold text-muted-foreground">3 etapas · cerca de 3 minutos</span>
				</StepFooter>
			</StatusFrame>
		);
	}

	return (
		<StatusFrame>
			<StepHeader step={step} onBack={step > 1 || !existingPartner ? () => setStep(step - 1) : null} mainAppHref={mainAppHref} />

			{step === 1 ? (
				<>
					<StepTitle title="Seus dados" text="Trouxemos o que já temos da sua conta. Confira e complete o documento." />
					<div className="flex flex-col gap-4 px-5 pt-[22px] pb-6">
						<Field label="Nome completo" htmlFor="partner-nome">
							<input
								id="partner-nome"
								className={INPUT_CLASS}
								value={partner.nome}
								onChange={(event) => updatePartner({ nome: event.target.value })}
								autoComplete="name"
							/>
						</Field>
						<Field label="Email" htmlFor="partner-email">
							<input
								id="partner-email"
								type="email"
								inputMode="email"
								className={INPUT_CLASS}
								value={partner.email}
								onChange={(event) => updatePartner({ email: event.target.value })}
								autoComplete="email"
							/>
						</Field>
						<Field label="Telefone" htmlFor="partner-telefone">
							<input
								id="partner-telefone"
								type="tel"
								inputMode="tel"
								className={INPUT_CLASS}
								value={partner.telefone}
								placeholder="(00) 00000-0000"
								onChange={(event) => updatePartner({ telefone: formatToPhone(event.target.value) })}
								autoComplete="tel"
							/>
						</Field>
						<div className="flex flex-col gap-2">
							<span className="text-label text-foreground/70">Você vai receber como</span>
							<div className="flex gap-1 rounded-[14px] bg-muted p-1" role="radiogroup" aria-label="Tipo de pessoa">
								{(
									[
										["PESSOA_FISICA", "Pessoa física"],
										["PESSOA_JURIDICA", "Pessoa jurídica"],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										role="radio"
										aria-checked={partner.tipoPessoa === value}
										onClick={() => setPersonType(value)}
										className={cn(
											"h-[38px] flex-1 rounded-[10px] text-sm font-bold transition-all duration-150",
											partner.tipoPessoa === value
												? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]"
												: "text-muted-foreground",
										)}
									>
										{label}
									</button>
								))}
							</div>
						</div>
						<Field label={pessoaFisica ? "CPF" : "CNPJ"} htmlFor="partner-documento" accent>
							<input
								id="partner-documento"
								inputMode="numeric"
								className={INPUT_CLASS}
								value={partner.cpfCnpj}
								placeholder={pessoaFisica ? "000.000.000-00" : "00.000.000/0000-00"}
								onChange={(event) => updatePartner({ cpfCnpj: pessoaFisica ? formatToCPF(event.target.value) : formatToCNPJ(event.target.value) })}
							/>
						</Field>
					</div>
					<StepFooter>
						<PrimaryButton ready={!stepIssues[1]} onClick={goNext}>
							Continuar
						</PrimaryButton>
					</StepFooter>
				</>
			) : null}

			{step === 2 ? (
				<>
					<StepTitle title="Onde você recebe" text="As comissões são pagas todo mês nesta chave PIX." />
					<div className="flex flex-col gap-4 px-5 pt-[22px] pb-6">
						<Field
							label="Chave PIX"
							htmlFor="partner-pix"
							hint={
								!partner.chavePix && documentDigits ? (
									<button
										type="button"
										onClick={() => updatePartner({ chavePix: partner.cpfCnpj, chavePixTipo: pessoaFisica ? "CPF" : "CNPJ", titularPixConfirmado: false })}
										className="self-start text-[13px] font-bold text-primary hover:underline"
									>
										Usar meu {pessoaFisica ? "CPF" : "CNPJ"} como chave
									</button>
								) : null
							}
						>
							<div className="flex h-12 items-center gap-2 rounded-[14px] border border-border bg-card pr-1.5 pl-3.5 transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(36,84,156,0.15)]">
								<input
									id="partner-pix"
									ref={pixInputRef}
									className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70"
									value={partner.chavePix}
									placeholder="CPF, CNPJ, email, telefone ou aleatória"
									onChange={(event) => setPixKey(event.target.value)}
								/>
								<select
									aria-label="Tipo da chave PIX"
									value={partner.chavePixTipo}
									onChange={(event) => updatePartner({ chavePixTipo: event.target.value as TPlatformPartnerPixKeyTypeEnum, titularPixConfirmado: false })}
									className="h-7 shrink-0 cursor-pointer appearance-none rounded-full bg-muted px-2.5 text-[11px] font-bold text-foreground/70 outline-none"
								>
									{PIX_KEY_TYPES.map((type) => (
										<option key={type.value} value={type.value}>
											{type.label}
										</option>
									))}
								</select>
							</div>
						</Field>

						<div
							className={cn(
								"flex flex-col gap-3.5 rounded-[22px] border p-4 transition-colors duration-200",
								partner.titularPixConfirmado ? "border-success/25 bg-success-surface" : "border-primary/15 bg-info-surface/50",
							)}
						>
							<div className="flex items-center gap-3">
								<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-card text-primary shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.04)]">
									<Landmark className="h-[18px] w-[18px]" />
								</span>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Titular da chave</span>
									<span className="truncate text-base font-extrabold">{partner.nome || "—"}</span>
									<span className="text-xs text-muted-foreground">
										{documentDigits ? `${pessoaFisica ? "CPF" : "CNPJ"} ${maskPixKey(partner.cpfCnpj, pessoaFisica ? "CPF" : "CNPJ")}` : "Documento da etapa 1"}
									</span>
								</div>
							</div>
							{partner.titularPixConfirmado ? (
								<button
									type="button"
									onClick={() => updatePartner({ titularPixConfirmado: false })}
									className="flex items-center gap-2 text-left text-[13px] font-bold text-success-surface-foreground"
								>
									<Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
									Titular confirmado. A chave está no seu {pessoaFisica ? "CPF" : "CNPJ"}.
								</button>
							) : (
								<div className="flex flex-col gap-2">
									<span className="text-[13px] leading-snug text-foreground/70">
										O PIX só pode cair numa chave no seu nome. Confirme que esta chave é sua.
									</span>
									<div className="flex gap-2">
										<button
											type="button"
											disabled={!partner.chavePix.trim()}
											onClick={() => updatePartner({ titularPixConfirmado: true })}
											className="h-10 flex-1 rounded-[14px] bg-primary text-sm font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
										>
											Sou eu
										</button>
										<button
											type="button"
											onClick={() => {
												updatePartner({ chavePix: "", titularPixConfirmado: false });
												pixInputRef.current?.focus();
											}}
											className="h-10 flex-1 rounded-[14px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted"
										>
											Trocar chave
										</button>
									</div>
								</div>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<span className="text-label text-foreground/70">{pessoaFisica ? "Documento com CPF" : "Cartão CNPJ ou contrato social"}</span>
							<input
								ref={fileInputRef}
								type="file"
								accept={Object.keys(PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES).join(",")}
								className="hidden"
								onChange={(event) => {
									onFileSelected(event.target.files?.[0]);
									event.target.value = "";
								}}
							/>
							{hasDocumentFile && !uploadMutation.isPending ? (
								<div className="flex items-center gap-3 rounded-[22px] border border-border p-3.5">
									<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-success-surface text-success-surface-foreground">
										<FileText className="h-5 w-5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="truncate text-sm font-bold">{uploadedFile?.nome ?? "Documento enviado"}</span>
										<span className="text-xs text-muted-foreground">
											{uploadedFile ? `${formatBytes(uploadedFile.tamanhoBytes)} · enviado` : "Enviado anteriormente"}
										</span>
									</div>
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className="h-8 rounded-xl border border-border bg-card px-3 text-[13px] font-bold transition-colors hover:bg-muted"
									>
										Trocar
									</button>
								</div>
							) : (
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									disabled={uploadMutation.isPending}
									className="flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-border bg-muted/40 p-5 transition-colors hover:border-primary hover:bg-info-surface/50 disabled:cursor-wait"
								>
									<span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
										{uploadMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
									</span>
									<span className="text-[15px] font-extrabold">{uploadMutation.isPending ? "Enviando documento…" : "Tirar foto ou escolher arquivo"}</span>
									<span className="text-xs text-muted-foreground">
										{pessoaFisica ? "RG, CNH ou CPF · PDF ou foto · até 10 MB" : "PDF ou foto · até 10 MB"}
									</span>
								</button>
							)}
						</div>
					</div>
					<StepFooter>
						<PrimaryButton ready={!stepIssues[2]} onClick={goNext}>
							Continuar
						</PrimaryButton>
					</StepFooter>
				</>
			) : null}

			{step === 3 ? (
				<>
					<StepTitle title="Termos do programa" text="O essencial em quatro pontos. O texto completo fica disponível abaixo." />
					<div className="flex flex-col px-5 pt-5 pb-6">
						{TERMS.map((term, index) => (
							<div key={term.title} className={cn("flex gap-3.5 py-3.5", index > 0 && "border-t border-border")}>
								<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
									{index + 1}
								</span>
								<div className="flex flex-col gap-[3px]">
									<span className="text-[15px] font-extrabold">{term.title}</span>
									<span className="text-[13px] leading-[1.45] text-pretty text-muted-foreground">{term.text}</span>
								</div>
							</div>
						))}
						<button
							type="button"
							onClick={() => setTermsOpen(true)}
							className="flex items-center gap-1.5 self-start pt-1 pl-[42px] text-sm font-bold text-primary hover:underline"
						>
							Ler termos completos
							<ExternalLink className="h-3.5 w-3.5" />
						</button>
					</div>
					<StepFooter>
						<button
							type="button"
							role="checkbox"
							aria-checked={partner.aceiteTermos}
							onClick={() => updatePartner({ aceiteTermos: !partner.aceiteTermos })}
							className="flex items-start gap-3 text-left"
						>
							<span
								className={cn(
									"flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors duration-150",
									partner.aceiteTermos ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-card",
								)}
							>
								<Check className={cn("h-3.5 w-3.5 transition-opacity", partner.aceiteTermos ? "opacity-100" : "opacity-0")} strokeWidth={3} />
							</span>
							<span className="text-sm leading-[1.45]">Declaro que os dados informados são verdadeiros e aceito os termos do programa de parcerias.</span>
						</button>
						<PrimaryButton ready={!stepIssues[3]} onClick={goNext} disabled={submitMutation.isPending}>
							{submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
							Enviar cadastro
							{submitMutation.isPending ? null : <ArrowRight className="h-4 w-4" />}
						</PrimaryButton>
						<span className="text-center text-xs leading-[1.45] text-muted-foreground">
							Nosso financeiro valida seus dados e libera o painel completo quando o cadastro for aprovado.
						</span>
					</StepFooter>
				</>
			) : null}

			{termsOpen ? <PlatformPartnerTermsMenu closeMenu={() => setTermsOpen(false)} /> : null}
		</StatusFrame>
	);
}
