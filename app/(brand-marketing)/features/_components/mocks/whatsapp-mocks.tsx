import { cn } from "@/lib/utils";
import { Coins, Eye } from "lucide-react";
import { Fragment } from "react";
import { MockCard } from "./mock-parts";

// Pré-visualização do template de WhatsApp (components/MessageTemplates/TemplatePreview.tsx): o balão
// sobre o fundo do chat, com as variáveis destacadas em verde como no editor.

type TMessageRun = { text: string; variable?: boolean };

type TTemplatePreview = {
	tag: string;
	tagClassName: string;
	header: boolean;
	effect: string | null;
	body: TMessageRun[];
	footer: string;
	buttons: string[];
};

const text = (value: string): TMessageRun => ({ text: value });
const variable = (value: string): TMessageRun => ({ text: value, variable: true });

const TEMPLATES: Record<"utility" | "marketing", TTemplatePreview> = {
	// Aviso de saldo do programa de cashback.
	utility: {
		tag: "UTILIDADE",
		tagClassName: "bg-[#eef3fb] text-[#24549c]",
		header: true,
		effect: null,
		body: [
			text("Oi, "),
			variable("Maria"),
			text("! Você ganhou "),
			variable("R$ 4,60"),
			text(" de cashback na Gelateria Aurora. Seu saldo agora é de "),
			variable("R$ 26,60"),
			text(" e vale até "),
			variable("22/01"),
			text("."),
		],
		footer: "Responda SAIR para não receber mais",
		buttons: ["🔗 Ver meu saldo"],
	},
	// Campanha de reativação com cashback bônus.
	marketing: {
		tag: "MARKETING",
		tagClassName: "bg-[rgba(255,185,0,0.18)] text-[#7a5117]",
		header: false,
		effect: "CASHBACK BÔNUS · 25% · expira em 7 dias · compra mínima de R$ 40,00",
		body: [
			text("Oi, "),
			variable("Juliana"),
			text("! Sentimos sua falta na Gelateria Aurora. Volte esta semana e ganhe "),
			variable("25%"),
			text(" de cashback bônus na sua compra. Válido até "),
			variable("domingo, 02/11"),
			text("."),
		],
		footer: "Responda SAIR para não receber mais",
		buttons: ["↩️ Quero aproveitar", "↩️ Agora não"],
	},
};

export function WhatsappPreviewMock({ variant }: { variant: "utility" | "marketing" }) {
	const template = TEMPLATES[variant];
	return (
		<MockCard className="gap-3 p-4">
			<div className="flex items-center justify-between gap-3">
				<span className="flex items-center gap-2 text-[12px] font-bold">
					<Eye className="size-[15px]" aria-hidden />
					PREVIEW
				</span>
				<span className={cn("rounded-full px-2.5 py-[3px] text-[11px] font-bold", template.tagClassName)}>{template.tag}</span>
			</div>
			{template.effect ? (
				<div className="flex items-center gap-2.5 rounded-[10px] border border-[rgba(255,185,0,0.35)] bg-[rgba(255,185,0,0.15)] px-3 py-2.5">
					<Coins className="size-4 flex-none text-[#8a6400]" aria-hidden />
					<span className="text-[12px] font-semibold text-[#5c4300]">{template.effect}</span>
				</div>
			) : null}
			<div className="relative flex justify-center overflow-hidden rounded-lg bg-[#e5ddd5] px-4 py-5">
				<div className="relative max-w-[85%] overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]">
					{template.header ? (
						<div className="flex aspect-video flex-col justify-between bg-[#7a2943] p-4 text-white">
							<span className="text-[12px] font-bold opacity-85">Gelateria Aurora</span>
							<span>
								<span className="block text-[10px] font-extrabold tracking-[0.1em] opacity-80">SEU SALDO</span>
								<span className="block text-[30px] leading-[1.1] font-extrabold">R$ 26,60</span>
							</span>
						</div>
					) : null}
					<div className="px-3 pt-2.5 pb-1.5">
						<p className="m-0 text-[14px] leading-[1.45] whitespace-pre-wrap text-[#111827]">
							{template.body.map((run, i) => (
								<Fragment key={i}>
									{run.variable ? <span className="rounded bg-[#dcf8c6] px-1 py-px font-medium text-[#075e54]">{run.text}</span> : run.text}
								</Fragment>
							))}
						</p>
						<p className="m-0 mt-2 text-[12px] text-[#00a884]">{template.footer}</p>
						<p className="m-0 mt-1 text-right text-[10px] text-[#6b7280]">14:32</p>
					</div>
					{template.buttons.map((button) => (
						<div key={button} className="border-t border-[#e5e7eb] px-4 py-2.5 text-center text-[14px] font-medium text-[#00a884]">
							{button}
						</div>
					))}
				</div>
			</div>
		</MockCard>
	);
}
