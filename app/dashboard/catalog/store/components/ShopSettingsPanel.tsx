"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { uploadFile } from "@/lib/files-storage";
import { updateShopSettings } from "@/lib/mutations/shop";
import { getShopAvailability } from "@/lib/shop/availability";
import type { TGetShopSettingsOutput } from "@/app/api/shop/settings/route";
import type { TShopPaymentMethod, TShopScheduleException, TShopSettingsConfiguration, TShopTimeRange } from "@/schemas/shop";
import type { TShopWeekdayEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
	AlertCircle,
	ArrowRight,
	Banknote,
	CalendarDays,
	CreditCard,
	Image as ImageIcon,
	Package,
	Plus,
	QrCode,
	RotateCcw,
	Save,
	Settings2,
	ShoppingBag,
	Store,
	Trash2,
	Truck,
	UploadCloud,
	X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

type TSettings = NonNullable<TGetShopSettingsOutput["data"]>;
type TSection = "visao-geral" | "atendimento" | "pagamento" | "horarios" | "operacao" | "aparencia" | "produtos";

const ShopHeaderCoverFileSchema = z.object({
	file: z.instanceof(File).optional(),
	previewUrl: z.string().optional(),
});
type TShopHeaderCoverFile = z.infer<typeof ShopHeaderCoverFileSchema>;

function isBlobUrl(url: string | undefined): url is string {
	return Boolean(url?.startsWith("blob:"));
}

const WEEKDAYS: Array<{ value: TShopWeekdayEnum; label: string }> = [
	{ value: "SEGUNDA", label: "Segunda-feira" },
	{ value: "TERCA", label: "Terça-feira" },
	{ value: "QUARTA", label: "Quarta-feira" },
	{ value: "QUINTA", label: "Quinta-feira" },
	{ value: "SEXTA", label: "Sexta-feira" },
	{ value: "SABADO", label: "Sábado" },
	{ value: "DOMINGO", label: "Domingo" },
];

const SECTIONS: Array<{ value: TSection; label: string; icon: typeof Store }> = [
	{ value: "visao-geral", label: "Visão geral", icon: Store },
	{ value: "atendimento", label: "Atendimento", icon: Truck },
	{ value: "pagamento", label: "Pagamento", icon: CreditCard },
	{ value: "horarios", label: "Horários", icon: CalendarDays },
	{ value: "operacao", label: "Operação", icon: Settings2 },
	{ value: "aparencia", label: "Aparência", icon: ImageIcon },
	{ value: "produtos", label: "Produtos", icon: ShoppingBag },
];

export default function ShopSettingsPanel({ settings }: { settings: TSettings }) {
	const queryClient = useQueryClient();
	const [section, setSection] = useState<TSection>("visao-geral");
	const [draft, setDraft] = useState(settings);
	const [headerCoverFile, setHeaderCoverFile] = useState<TShopHeaderCoverFile>({
		previewUrl: settings.configuracoes.aparencia.headerCoverUrl ?? undefined,
	});

	useEffect(() => {
		setDraft(settings);
		setHeaderCoverFile({ previewUrl: settings.configuracoes.aparencia.headerCoverUrl ?? undefined });
	}, [settings]);

	useEffect(() => {
		return () => {
			if (isBlobUrl(headerCoverFile.previewUrl)) URL.revokeObjectURL(headerCoverFile.previewUrl);
		};
	}, [headerCoverFile.previewUrl]);

	const isDirty = Boolean(headerCoverFile.file) || JSON.stringify(draft) !== JSON.stringify(settings);
	const hasSchedule = draft.configuracoes.operacao.horarios.some((item) => item.periodos.length > 0);

	const { mutate: save, isPending } = useMutation({
		mutationKey: ["update-shop-settings"],
		mutationFn: async () => {
			let configuracoes = draft.configuracoes;
			let uploadedHeaderCoverUrl: string | undefined;

			if (headerCoverFile.file) {
				const { url } = await uploadFile({
					file: headerCoverFile.file,
					fileName: `capa-loja-${headerCoverFile.file.name}`,
					vinculationId: draft.organizacaoId,
					prefix: "organizations",
				});
				uploadedHeaderCoverUrl = url;
				configuracoes = {
					...configuracoes,
					aparencia: {
						...configuracoes.aparencia,
						headerCoverUrl: url,
						headerCoverTipo: headerCoverFile.file.type.startsWith("video/") ? "VIDEO" : "IMAGEM",
					},
				};
			}

			const response = await updateShopSettings({ ativo: draft.ativo, modo: draft.modo, configuracoes });
			return { response, configuracoes, uploadedHeaderCoverUrl };
		},
		onSuccess: ({ response, configuracoes, uploadedHeaderCoverUrl }) => {
			toast.success(response.message);
			setDraft((prev) => ({ ...prev, configuracoes }));
			if (uploadedHeaderCoverUrl) setHeaderCoverFile({ previewUrl: uploadedHeaderCoverUrl });
			queryClient.invalidateQueries({ queryKey: ["shop-settings"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const updateConfig = (configuracoes: TShopSettingsConfiguration) => setDraft((prev) => ({ ...prev, configuracoes }));
	const updateOperation = (operacao: TShopSettingsConfiguration["operacao"]) => updateConfig({ ...draft.configuracoes, operacao });
	const updateService = (atendimento: TShopSettingsConfiguration["atendimento"]) => updateConfig({ ...draft.configuracoes, atendimento });

	const handleSave = () => {
		if (draft.ativo && !hasSchedule) {
			toast.error("Cadastre pelo menos um horário antes de ativar a loja.");
			setSection("horarios");
			return;
		}
		save();
	};

	const discardChanges = () => {
		if (isBlobUrl(headerCoverFile.previewUrl)) URL.revokeObjectURL(headerCoverFile.previewUrl);
		setDraft(settings);
		setHeaderCoverFile({ previewUrl: settings.configuracoes.aparencia.headerCoverUrl ?? undefined });
	};

	// `overflow-visible` é o que faz a barra de aplicar da vitrine funcionar: o `overflow-hidden`
	// padrão do Card vira o scrollport mais próximo de qualquer `sticky` interno e, como ele nunca
	// rola, a barra parava no fim do conteúdo em vez de acompanhar a leitura. Sem o recorte, o
	// `sticky` resolve contra o container que de fato rola (o SidebarInset). Quem encostava na borda
	// arredondada — só a coluna de navegação, que tem fundo — passa a carregar o próprio raio.
	return (
		<Card className="relative min-h-[42rem] gap-0 overflow-visible py-0">
			{/* A coluna do mobile precisa ser declarada tanto quanto a do desktop. Sem ela o grid cai
			    numa trilha implícita `auto`, cujo mínimo é o min-content dos itens — e a tira de abas é
			    uma fila de botões `shrink-0`, ou seja, 750px de min-content. A trilha inteira crescia
			    até lá, o `overflow-hidden` do Card recortava o excesso e os controles à direita de cada
			    linha (os switches de pagamento, por exemplo) ficavam fora da tela, inalcançáveis. */}
			<CardContent className="grid min-h-[42rem] grid-cols-[minmax(0,1fr)] p-0 lg:grid-cols-[13rem_minmax(0,1fr)]">
				{/* `min-w-0` pelo mesmo motivo que o painel ao lado já traz: quem rola por conta própria
				    não pode exigir a largura do próprio conteúdo do grid que o contém. */}
				<nav className="min-w-0 rounded-t-2xl border-b bg-muted/30 p-3 lg:rounded-t-none lg:rounded-l-2xl lg:border-r lg:border-b-0">
					<div className="scrollbar-thin flex gap-1 overflow-x-auto lg:flex-col">
						{SECTIONS.map((item) => {
							const Icon = item.icon;
							return (
								<button
									key={item.value}
									type="button"
									onClick={() => setSection(item.value)}
									className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-extrabold tracking-[0.08em] uppercase transition-colors ${
										section === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
									}`}
								>
									<Icon className="size-4 shrink-0" />
									{item.label}
								</button>
							);
						})}
					</div>
				</nav>

				<div className="min-w-0 p-4 pb-24 sm:p-6 sm:pb-24">
					{section === "visao-geral" ? (
						<Overview settings={draft} hasSchedule={hasSchedule} onNavigate={setSection} setAtivo={(ativo) => setDraft((prev) => ({ ...prev, ativo }))} />
					) : null}
					{section === "atendimento" ? <ServiceSection config={draft.configuracoes} updateService={updateService} /> : null}
					{section === "pagamento" ? <PaymentSection config={draft.configuracoes} updateConfig={updateConfig} /> : null}
					{section === "horarios" ? <SchedulesSection config={draft.configuracoes} updateOperation={updateOperation} /> : null}
					{section === "operacao" ? <OperationSection config={draft.configuracoes} updateOperation={updateOperation} /> : null}
					{section === "aparencia" ? (
						<AppearanceSection
							config={draft.configuracoes}
							updateConfig={updateConfig}
							headerCoverFile={headerCoverFile}
							updateHeaderCoverFile={setHeaderCoverFile}
						/>
					) : null}
					{section === "produtos" ? <ProductsSection modo={draft.modo} setModo={(modo) => setDraft((prev) => ({ ...prev, modo }))} /> : null}
				</div>
			</CardContent>

			{isDirty ? (
				<div className="absolute right-3 bottom-3 left-3 flex flex-col gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm font-semibold">Você tem alterações não salvas.</p>
					<div className="flex gap-2">
						<Button variant="outline" className="gap-2" onClick={discardChanges} disabled={isPending}>
							<RotateCcw className="size-4" />
							Descartar
						</Button>
						<Button className="gap-2" onClick={handleSave} disabled={isPending}>
							<Save className="size-4" />
							Salvar alterações
						</Button>
					</div>
				</div>
			) : null}
		</Card>
	);
}

function Overview({
	settings,
	hasSchedule,
	onNavigate,
	setAtivo,
}: {
	settings: TSettings;
	hasSchedule: boolean;
	onNavigate: (section: TSection) => void;
	setAtivo: (ativo: boolean) => void;
}) {
	const availability = getShopAvailability({ ativo: settings.ativo, configuracoes: settings.configuracoes });
	const service = settings.configuracoes.atendimento;
	const nextException = settings.configuracoes.operacao.excecoesHorarios
		.toSorted((a, b) => a.data.localeCompare(b.data))
		.find((item) => item.data >= new Date().toISOString().slice(0, 10));

	return (
		<SectionIntro title="Visão geral" description="Acompanhe o estado atual da loja e acesse rapidamente o que precisa de ajuste.">
			<SettingBlock
				title="Loja digital ativa"
				icon={<Store className="size-4" />}
				action={<Switch checked={settings.ativo} disabled={!hasSchedule && !settings.ativo} onCheckedChange={setAtivo} />}
			>
				<p className="text-sm text-muted-foreground">
					{hasSchedule
						? "Quando ativa, a loja recebe pedidos dentro dos horários configurados."
						: "Cadastre pelo menos um horário para liberar a ativação."}
				</p>
			</SettingBlock>
			<div className="divide-y rounded-2xl border">
				<SummaryRow
					label="Status operacional"
					value={availability.status === "ABERTA" ? "Aberta agora" : availability.status === "INDISPONIVEL" ? "Loja inativa" : "Fechada agora"}
					onEdit={() => onNavigate("horarios")}
				/>
				<SummaryRow
					label="Modalidades"
					value={[service.retirada.ativo ? "Retirada" : null, service.entrega.ativo ? "Entrega" : null].filter(Boolean).join(" e ")}
					onEdit={() => onNavigate("atendimento")}
				/>
				<SummaryRow label="Modo da loja" value={settings.modo === "CARDAPIO" ? "Cardápio" : "Catálogo"} onEdit={() => onNavigate("produtos")} />
				<SummaryRow
					label="Próxima exceção"
					value={nextException ? `${nextException.data}${nextException.mensagem ? `, ${nextException.mensagem}` : ""}` : "Nenhuma exceção futura"}
					onEdit={() => onNavigate("horarios")}
				/>
			</div>
			{!hasSchedule ? (
				<div className="flex items-start gap-3 rounded-2xl border border-brand-secondary/30 bg-brand-secondary/10 p-4">
					<AlertCircle className="mt-0.5 size-5 shrink-0" />
					<div>
						<p className="font-bold">Cadastre os horários de atendimento</p>
						<p className="mt-1 text-sm text-muted-foreground">A loja precisa de pelo menos um período configurado antes de receber pedidos.</p>
					</div>
				</div>
			) : null}
		</SectionIntro>
	);
}

function ServiceSection({
	config,
	updateService,
}: {
	config: TShopSettingsConfiguration;
	updateService: (service: TShopSettingsConfiguration["atendimento"]) => void;
}) {
	const service = config.atendimento;
	return (
		<SectionIntro title="Atendimento" description="Escolha como os clientes recebem os pedidos e defina as regras da entrega.">
			<SettingBlock
				title="Retirada"
				icon={<Package className="size-4" />}
				action={<Switch checked={service.retirada.ativo} onCheckedChange={(ativo) => updateService({ ...service, retirada: { ativo } })} />}
			>
				<p className="text-sm text-muted-foreground">O cliente retira o pedido no endereço cadastrado para a organização.</p>
			</SettingBlock>
			<SettingBlock
				title="Entrega"
				icon={<Truck className="size-4" />}
				action={
					<Switch checked={service.entrega.ativo} onCheckedChange={(ativo) => updateService({ ...service, entrega: { ...service.entrega, ativo } })} />
				}
			>
				{service.entrega.ativo ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<NumberField
							label="Pedido mínimo (R$)"
							value={service.entrega.pedidoMinimo}
							onChange={(pedidoMinimo) => updateService({ ...service, entrega: { ...service.entrega, pedidoMinimo } })}
						/>
						<NumberField
							label="Prazo estimado (min)"
							value={service.entrega.prazoMinutos}
							onChange={(prazoMinutos) => updateService({ ...service, entrega: { ...service.entrega, prazoMinutos } })}
						/>
						<NumberField
							label="Taxa de entrega (R$)"
							value={service.entrega.taxa}
							onChange={(taxa) => updateService({ ...service, entrega: { ...service.entrega, taxa } })}
						/>
						<OptionalNumberField
							label="Entrega grátis acima de (R$)"
							hint="Deixe vazio para sempre cobrar a taxa."
							value={service.entrega.gratisAcima}
							onChange={(gratisAcima) => updateService({ ...service, entrega: { ...service.entrega, gratisAcima } })}
						/>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">Ative para configurar taxa, pedido mínimo e prazo estimado.</p>
				)}
			</SettingBlock>
		</SectionIntro>
	);
}

const SHOP_PAYMENT_METHOD_OPTIONS: Array<{ value: TShopPaymentMethod; label: string; description: string; icon: typeof Banknote }> = [
	{ value: "DINHEIRO", label: "Dinheiro", description: "Permite solicitar troco no checkout.", icon: Banknote },
	{ value: "PIX", label: "PIX", description: "O pagamento é confirmado no atendimento.", icon: QrCode },
	{ value: "CARTAO_DEBITO", label: "Cartão de débito", description: "Pagamento na maquininha.", icon: CreditCard },
	{ value: "CARTAO_CREDITO", label: "Cartão de crédito", description: "Pagamento na maquininha.", icon: CreditCard },
];

function PaymentSection({
	config,
	updateConfig,
}: {
	config: TShopSettingsConfiguration;
	updateConfig: (config: TShopSettingsConfiguration) => void;
}) {
	const selected = config.pagamento.metodosAceitos;

	const toggleMethod = (method: TShopPaymentMethod, enabled: boolean) => {
		const metodosAceitos = enabled ? [...new Set([...selected, method])] : selected.filter((item) => item !== method);
		if (metodosAceitos.length === 0) {
			toast.error("Selecione pelo menos um método de pagamento.");
			return;
		}
		updateConfig({ ...config, pagamento: { ...config.pagamento, metodosAceitos } });
	};

	return (
		<SectionIntro title="Pagamento" description="Escolha as formas de pagamento que o cliente pode selecionar no checkout da loja digital.">
			<div className="divide-y rounded-2xl border">
				{SHOP_PAYMENT_METHOD_OPTIONS.map((method) => {
					const Icon = method.icon;
					return (
						<div key={method.value} className="flex items-center justify-between gap-4 p-4">
							<div className="flex items-center gap-3">
								<span className="flex size-9 items-center justify-center rounded-xl bg-muted">
									<Icon className="size-4" />
								</span>
								<div>
									<p className="text-sm font-bold">{method.label}</p>
									<p className="text-xs text-muted-foreground">{method.description}</p>
								</div>
							</div>
							<Switch checked={selected.includes(method.value)} onCheckedChange={(enabled) => toggleMethod(method.value, enabled)} />
						</div>
					);
				})}
			</div>
			<p className="text-sm text-muted-foreground">
				As opções representam a intenção do cliente. O recebimento continua pendente até a entrega ou retirada.
			</p>
		</SectionIntro>
	);
}

function SchedulesSection({
	config,
	updateOperation,
}: {
	config: TShopSettingsConfiguration;
	updateOperation: (operation: TShopSettingsConfiguration["operacao"]) => void;
}) {
	const operation = config.operacao;
	const [newException, setNewException] = useState<TShopScheduleException>({ data: "", periodos: [], mensagem: null });

	const updateDay = (day: TShopWeekdayEnum, ranges: TShopTimeRange[]) => {
		const horarios = [...operation.horarios.filter((item) => item.dia !== day), { dia: day, periodos: ranges }];
		updateOperation({ ...operation, horarios });
	};

	const addException = () => {
		if (!newException.data) return;
		updateOperation({
			...operation,
			excecoesHorarios: [...operation.excecoesHorarios.filter((item) => item.data !== newException.data), newException],
		});
		setNewException({ data: "", periodos: [], mensagem: null });
	};

	return (
		<SectionIntro
			title="Horários"
			description="Defina quando a loja recebe pedidos. Fora desses períodos, o catálogo continua disponível para consulta."
		>
			<div className="divide-y rounded-2xl border">
				{WEEKDAYS.map((weekday) => {
					const ranges = operation.horarios.find((item) => item.dia === weekday.value)?.periodos ?? [];
					return <WeekdayRow key={weekday.value} label={weekday.label} ranges={ranges} onChange={(next) => updateDay(weekday.value, next)} />;
				})}
			</div>
			<div className="space-y-3">
				<div>
					<h3 className="font-black">Exceções de horário</h3>
					<p className="text-sm text-muted-foreground">Use para feriados, inventários ou dias com expediente reduzido.</p>
				</div>
				<div className="space-y-2">
					{operation.excecoesHorarios
						.toSorted((a, b) => a.data.localeCompare(b.data))
						.map((exception) => (
							<div key={exception.data} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
								<div>
									<p className="text-sm font-bold">{exception.data}</p>
									<p className="text-xs text-muted-foreground">
										{formatRanges(exception.periodos)}
										{exception.mensagem ? `, ${exception.mensagem}` : ""}
									</p>
								</div>
								<Button
									size="icon"
									variant="ghost"
									onClick={() =>
										updateOperation({ ...operation, excecoesHorarios: operation.excecoesHorarios.filter((item) => item.data !== exception.data) })
									}
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						))}
				</div>
				<div className="grid gap-2 rounded-2xl border bg-muted/20 p-3 sm:grid-cols-[10rem_1fr_auto]">
					<Input type="date" value={newException.data} onChange={(event) => setNewException((prev) => ({ ...prev, data: event.target.value }))} />
					<Input
						placeholder="Mensagem opcional"
						value={newException.mensagem ?? ""}
						onChange={(event) => setNewException((prev) => ({ ...prev, mensagem: event.target.value || null }))}
					/>
					<Button type="button" onClick={addException}>
						Adicionar
					</Button>
					<div className="space-y-3 sm:col-span-3">
						<div className="flex items-center gap-2">
							<Switch
								checked={newException.periodos.length === 0}
								onCheckedChange={(checked) => setNewException((prev) => ({ ...prev, periodos: checked ? [] : [{ inicio: "08:00", fim: "18:00" }] }))}
							/>
							<p className="text-sm font-semibold">Fechado o dia inteiro</p>
						</div>
						{newException.periodos.length > 0 ? (
							<RangesEditor ranges={newException.periodos} onChange={(periodos) => setNewException((prev) => ({ ...prev, periodos }))} />
						) : null}
					</div>
				</div>
			</div>
		</SectionIntro>
	);
}

function WeekdayRow({ label, ranges, onChange }: { label: string; ranges: TShopTimeRange[]; onChange: (ranges: TShopTimeRange[]) => void }) {
	const enabled = ranges.length > 0;
	return (
		<div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 py-3 sm:grid-cols-[9rem_auto_1fr] sm:items-center">
			<p className="text-sm font-bold">{label}</p>
			<Switch checked={enabled} onCheckedChange={(checked) => onChange(checked ? [{ inicio: "08:00", fim: "18:00" }] : [])} />
			{enabled ? <RangesEditor ranges={ranges} onChange={onChange} /> : <p className="text-sm text-muted-foreground">Fechado</p>}
		</div>
	);
}

function RangesEditor({ ranges, onChange }: { ranges: TShopTimeRange[]; onChange: (ranges: TShopTimeRange[]) => void }) {
	return (
		<div className="space-y-2">
			{ranges.map((range, index) => (
				// `flex-wrap` porque num telefone os dois campos de hora não cabem lado a lado: o
				// input `time` do Chromium não desenha "08:00" mais estreito que ~8rem, e espremê-lo
				// até caber corta o próprio horário. Preferimos quebrar a linha a ilegibilidade.
				<div key={`${range.inicio}-${range.fim}-${index}`} className="flex flex-wrap items-center gap-2">
					<Input
						className="min-w-[8rem] flex-1"
						type="time"
						value={range.inicio}
						onChange={(event) => onChange(ranges.map((item, itemIndex) => (itemIndex === index ? { ...item, inicio: event.target.value } : item)))}
					/>
					<span className="text-xs text-muted-foreground">até</span>
					<Input
						className="min-w-[8rem] flex-1"
						type="time"
						value={range.fim}
						onChange={(event) => onChange(ranges.map((item, itemIndex) => (itemIndex === index ? { ...item, fim: event.target.value } : item)))}
					/>
					{ranges.length > 1 ? (
						<Button type="button" size="icon" variant="ghost" onClick={() => onChange(ranges.filter((_, itemIndex) => itemIndex !== index))}>
							<Trash2 className="size-4" />
						</Button>
					) : null}
				</div>
			))}
			<Button type="button" size="sm" variant="ghost" className="gap-2" onClick={() => onChange([...ranges, { inicio: "18:00", fim: "22:00" }])}>
				<Plus className="size-4" />
				Adicionar período
			</Button>
		</div>
	);
}

function OperationSection({
	config,
	updateOperation,
}: {
	config: TShopSettingsConfiguration;
	updateOperation: (operation: TShopSettingsConfiguration["operacao"]) => void;
}) {
	const operation = config.operacao;
	return (
		<SectionIntro title="Operação" description="Defina as informações usadas para orientar o cliente antes do envio.">
			<NumberField
				label="Tempo médio de preparo (min)"
				value={operation.preparoMinutos}
				onChange={(preparoMinutos) => updateOperation({ ...operation, preparoMinutos })}
			/>
			<div className="space-y-2">
				<Label htmlFor="checkout-message">Mensagem antes da finalização</Label>
				<Textarea
					id="checkout-message"
					placeholder="Ex.: Confira os itens e informe observações importantes."
					value={operation.mensagemCheckout ?? ""}
					onChange={(event) => updateOperation({ ...operation, mensagemCheckout: event.target.value || null })}
				/>
				<p className="text-xs text-muted-foreground">A mensagem aparece na revisão do pedido, antes do cliente enviar.</p>
			</div>
		</SectionIntro>
	);
}

function AppearanceSection({
	config,
	updateConfig,
	headerCoverFile,
	updateHeaderCoverFile,
}: {
	config: TShopSettingsConfiguration;
	updateConfig: (config: TShopSettingsConfiguration) => void;
	headerCoverFile: TShopHeaderCoverFile;
	updateHeaderCoverFile: (file: TShopHeaderCoverFile) => void;
}) {
	const appearance = config.aparencia;
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const previewUrl = headerCoverFile.previewUrl ?? appearance.headerCoverUrl ?? undefined;

	const selectFile = (file: File) => {
		const headerCoverTipo = file.type.startsWith("image/") ? "IMAGEM" : file.type.startsWith("video/") ? "VIDEO" : null;
		if (!headerCoverTipo) {
			toast.error("Selecione um arquivo de imagem ou vídeo válido.");
			return;
		}

		if (isBlobUrl(headerCoverFile.previewUrl)) URL.revokeObjectURL(headerCoverFile.previewUrl);
		updateHeaderCoverFile({ file, previewUrl: URL.createObjectURL(file) });
		updateConfig({ ...config, aparencia: { ...appearance, headerCoverTipo } });
	};

	const removeFile = () => {
		if (isBlobUrl(headerCoverFile.previewUrl)) URL.revokeObjectURL(headerCoverFile.previewUrl);
		updateHeaderCoverFile({});
		updateConfig({ ...config, aparencia: { ...appearance, headerCoverUrl: null, headerCoverTipo: null } });
		if (inputRef.current) inputRef.current.value = "";
	};

	return (
		<SectionIntro title="APARÊNCIA" description="Personalize a capa e escolha os blocos exibidos no início da loja.">
			<div className="space-y-3">
				<div>
					<Label htmlFor={inputId}>Capa do cabeçalho</Label>
					<p className="mt-1 text-xs text-muted-foreground">Envie uma imagem ou vídeo. O arquivo será enviado ao clicar em salvar alterações.</p>
				</div>
				<input
					ref={inputRef}
					id={inputId}
					type="file"
					accept="image/*,video/*"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) selectFile(file);
						event.target.value = "";
					}}
				/>
				{previewUrl ? (
					<div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border bg-muted/20">
						<div className="relative aspect-[8/5] overflow-hidden bg-muted">
							{appearance.headerCoverTipo === "VIDEO" ? (
								<video src={previewUrl} className="size-full object-cover" controls>
									<track kind="captions" srcLang="pt-BR" label="Sem legendas disponíveis" />
								</video>
							) : (
								<img src={previewUrl} alt="Pré-visualização da capa da loja" className="size-full object-cover" />
							)}
							<div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent" />
							<span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[0.65rem] font-black tracking-wider text-white uppercase">
								Prévia mobile · {appearance.headerCoverTipo === "VIDEO" ? "Vídeo" : "Imagem"}
							</span>
						</div>
						<div className="flex flex-wrap items-center justify-between gap-2 p-3">
							<p className="min-w-0 truncate text-xs text-muted-foreground">{headerCoverFile.file?.name ?? "Capa atual da loja"}</p>
							<div className="flex gap-2">
								<Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => inputRef.current?.click()}>
									<UploadCloud className="size-4" />
									Alterar
								</Button>
								<Button type="button" size="sm" variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={removeFile}>
									<X className="size-4" />
									Remover
								</Button>
							</div>
						</div>
					</div>
				) : (
					<button
						type="button"
						onClick={() => inputRef.current?.click()}
						className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/20 px-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
					>
						<span className="flex size-11 items-center justify-center rounded-full bg-background shadow-sm">
							<UploadCloud className="size-5 text-muted-foreground" />
						</span>
						<span>
							<span className="block text-sm font-bold">Selecionar imagem ou vídeo</span>
							<span className="mt-1 block text-xs text-muted-foreground">A capa será exibida no topo da loja digital.</span>
						</span>
					</button>
				)}
			</div>
			<div className="divide-y rounded-2xl border">
				{appearance.blocos.map((block, index) => (
					<div key={block.tipo} className="flex items-center justify-between gap-3 px-3 py-3">
						<p className="text-sm font-bold">
							{block.tipo === "EM_DESTAQUE" ? "Em destaque" : block.tipo === "MAIS_PEDIDOS" ? "Mais pedidos" : "Grupos de produtos"}
						</p>
						<Switch
							checked={block.ativo}
							onCheckedChange={(ativo) =>
								updateConfig({
									...config,
									aparencia: { ...appearance, blocos: appearance.blocos.map((item, itemIndex) => (itemIndex === index ? { ...item, ativo } : item)) },
								})
							}
						/>
					</div>
				))}
			</div>
		</SectionIntro>
	);
}

function ProductsSection({ modo, setModo }: { modo: "CARDAPIO" | "CATALOGO"; setModo: (mode: "CARDAPIO" | "CATALOGO") => void }) {
	return (
		<SectionIntro title="PRODUTOS" description="Escolha a apresentação da loja e monte a vitrine: grupos, produtos e preço na loja.">
			<div className="grid gap-2 sm:grid-cols-2">
				{(["CARDAPIO", "CATALOGO"] as const).map((mode) => (
					<Button key={mode} type="button" variant={modo === mode ? "default" : "outline"} onClick={() => setModo(mode)}>
						{mode === "CARDAPIO" ? "Cardápio" : "Catálogo"}
					</Button>
				))}
			</div>

			{/* A vitrine mudou de casa: a matriz de canais em Produtos edita a loja e os demais canais
			    numa grade só (docs/catalog-channels-matrix-design.md). O card aponta para lá já com a
			    loja em foco, para que quem chegava aqui continue encontrando a mesma curadoria. */}
			<div className="border-t pt-6">
				<Link
					href={`${appRoutes.catalog.products()}?view=channels&channel=SHOP`}
					className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40"
				>
					<div className="flex min-w-0 flex-col gap-1">
						<span className="text-sm font-black tracking-[0.08em] uppercase">Vitrine</span>
						<span className="text-sm text-muted-foreground">
							Quais produtos aparecem na loja, o preço na loja e a ordem dos grupos agora ficam na aba Canais de Produtos, junto dos demais canais.
						</span>
					</div>
					<ArrowRight className="size-5 shrink-0 text-muted-foreground" />
				</Link>
			</div>
		</SectionIntro>
	);
}

function SectionIntro({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-xl font-black tracking-tight">{title}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			{children}
		</div>
	);
}

function SettingBlock({
	title,
	icon,
	action,
	children,
}: {
	title: string;
	icon: React.ReactNode;
	action: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-4 rounded-2xl border p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 font-black">
					{icon}
					{title}
				</div>
				{action}
			</div>
			{children}
		</div>
	);
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Input type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} />
		</div>
	);
}

// Campo numérico opcional: vazio significa regra desligada, não zero.
function OptionalNumberField({
	label,
	hint,
	value,
	onChange,
}: {
	label: string;
	hint?: string;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Input type="number" min={0} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />
			{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
		</div>
	);
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
	return (
		<div className="flex items-center justify-between gap-3 px-4 py-3">
			<div>
				<p className="text-xs font-black tracking-wider text-muted-foreground uppercase">{label}</p>
				<p className="mt-1 text-sm font-semibold">{value || "Não configurado"}</p>
			</div>
			<Button variant="ghost" size="sm" onClick={onEdit}>
				Editar
			</Button>
		</div>
	);
}

function formatRanges(ranges: TShopTimeRange[]) {
	return ranges.length === 0 ? "Fechado o dia inteiro" : ranges.map((range) => `${range.inicio} - ${range.fim}`).join(", ");
}
