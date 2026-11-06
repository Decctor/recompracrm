import { ArrowRight, Check, FileSpreadsheet, Plug, Plus, ScanLine, ShoppingBag, Smartphone, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { FeatureStage } from "../../../features/_components/FeatureStage";
import { ScaledMock } from "../../../features/_components/ScaledMock";
import { TrackedCta } from "../../../features/_components/TrackedCta";
import { SIGNUP_HREF, whatsappHref } from "../../../features/_components/feature-links";
import { CampaignRankingMock } from "../../../features/_components/mocks/CampaignRankingMock";
import { RfmMatrixMock } from "../../../features/_components/mocks/bi-mocks";
import { TriggerGridMock } from "../../../features/_components/mocks/campaign-mocks";
import { PdiProfileMock, SellersRankingMock } from "../../../features/_components/mocks/pdi-mocks";
import {
	CRM_CAMPAIGN_TRIGGERS,
	CRM_DEFINITION,
	CRM_FAQS,
	CRM_PROFILE_BULLETS,
	CRM_SLUG,
	CRM_SOURCES,
	CRM_TEAM_BULLETS,
	CRM_WHATSAPP_TEXT,
} from "./crm-content";
import { CustomerProfileMock } from "./mocks/CustomerProfileMock";
import { InboxMock } from "./mocks/InboxMock";

// Mesma tipografia e palcos de /solutions/programa-de-fidelidade e das páginas de funcionalidade.
const CONTAINER = "mx-auto max-w-[1240px] px-6 max-md:px-4";
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]";
const LEAD = "mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PRIMARY_CTA =
	"inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]";
const SECONDARY_CTA =
	"inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]";

const SOURCE_ICONS: Record<string, LucideIcon> = { pdv: ScanLine, pdi: Smartphone, shop: ShoppingBag, integrations: Plug, sheet: FileSpreadsheet };

function Bullets({ items, dark = false }: { items: string[]; dark?: boolean }) {
	return (
		<ul className="mt-8 flex list-none flex-col gap-3 p-0">
			{items.map((item) => (
				<li key={item} className={`flex gap-3 text-[16px] leading-[1.5] ${dark ? "text-white/80" : "text-[#2b3538]"}`}>
					<Check className={`mt-0.5 size-4 flex-none ${dark ? "text-[#ffb900]" : "text-[#24549c]"}`} aria-hidden />
					{item}
				</li>
			))}
		</ul>
	);
}

export function CrmHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
				<p className={EYEBROW}>CRM para varejo</p>
				<h1 className="max-w-[920px] text-balance text-[68px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[44px] max-[420px]:text-[38px]">
					Sistema de CRM para varejo, feito para o cliente voltar.
				</h1>
				<p className="mt-6 max-w-[660px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
					Cada venda vira o histórico de um cliente. O RecompraCRM mostra quem está esfriando, manda a mensagem certa no WhatsApp e coloca o cashback no
					caixa, para a loja vender de novo para quem já comprou.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta href={SIGNUP_HREF} ctaId="crm_hero_trial" location="crm_hero" slug={CRM_SLUG} className={PRIMARY_CTA}>
						Testar 15 dias grátis
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta href={whatsappHref(CRM_WHATSAPP_TEXT)} ctaId="crm_hero_especialista" location="crm_hero" slug={CRM_SLUG} className={SECONDARY_CTA}>
						Falar com um especialista
					</TrackedCta>
				</div>
				<p className="mt-5 text-[13px] text-[#687a80]">Sem cartão de crédito · API oficial do WhatsApp · Integra com o sistema que você já usa</p>
			</div>
			<div className="mx-auto mt-[72px] max-w-[1400px] px-6 max-md:mt-14 max-md:px-4">
				<div className="overflow-hidden rounded-[28px] bg-[#eef2f6] px-12 pt-12 max-md:rounded-[20px] max-md:px-4 max-md:pt-4">
					<ScaledMock
						width={1080}
						label="Perfil de uma cliente no CRM: segmento RFM, compras, valor comprado, ticket médio, os dias da semana em que ela compra e os produtos preferidos"
					>
						<CustomerProfileMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function CrmDefinition() {
	return (
		<section id="conteudo" className="scroll-mt-[80px] bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="grid gap-x-[72px] gap-y-6 border-t border-[#0e1214] pt-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
					<h2 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.035em] max-md:text-[32px]">O que é um CRM para varejo</h2>
					<div>
						<p className="text-pretty text-[21px] leading-[1.6] text-[#2b3538] max-md:text-[18px]">{CRM_DEFINITION}</p>
						<Link href="/glossary/crm" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-[#24549c] hover:text-[#1f4886]">
							O que significa CRM, no glossário
							<ArrowRight className="size-4" aria-hidden />
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}

export function CrmSources() {
	return (
		<section id="base" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className={SPLIT}>
					<div className="max-w-[500px]">
						<p className={EYEBROW}>01 · A base de clientes</p>
						<h2 className={H2}>A base se forma a cada venda, sem formulário.</h2>
						<p className={LEAD}>
							O telefone é a chave. Ele liga a venda do balcão, o pedido do cardápio digital e a venda importada do seu sistema à mesma pessoa, e os
							cadastros repetidos são apontados para unir.
						</p>
					</div>
					<FeatureStage screen={{ label: "Cliente identificada pelo telefone no balcão, com o saldo de cashback", node: <PdiProfileMock /> }} />
				</div>
				<ul className="mt-16 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4 p-0">
					{CRM_SOURCES.map((source) => {
						const Icon = SOURCE_ICONS[source.key] ?? Plus;
						return (
							<li key={source.key} className="flex flex-col gap-3 rounded-[20px] border border-[#e3e8ea] p-6">
								<Icon className="size-5 text-[#24549c]" aria-hidden />
								<h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.02em]">{source.title}</h3>
								<p className="text-[15px] leading-[1.55] text-[#5b6a70]">{source.text}</p>
							</li>
						);
					})}
				</ul>
				<p className="mt-6 text-[15px] text-[#5b6a70]">
					Usa outro sistema?{" "}
					<Link href="/integrations" className="font-medium text-[#24549c] hover:underline">
						Veja as integrações
					</Link>
					.
				</p>
			</div>
		</section>
	);
}

export function CrmProfile() {
	return (
		<section id="perfil" className="bg-white pt-36 max-md:pt-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className="max-w-[480px]">
					<p className={EYEBROW}>02 · Perfil e segmentação</p>
					<h2 className={H2}>Cada cliente com o histórico e o segmento certo.</h2>
					<p className={LEAD}>
						O perfil junta o cadastro, as compras e o cashback. Todo dia, a matriz RFM reclassifica a base em onze segmentos pela recência, frequência e
						valor das compras, e os Públicos combinam segmentos com bairro, compradores de um produto e campos personalizados.
					</p>
					<Bullets items={CRM_PROFILE_BULLETS} />
					<div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium">
						<Link href="/glossary/matriz-rfm" className="text-[#24549c] hover:underline">
							O que é a matriz RFM
						</Link>
						<Link href="/features/business-intelligence" className="text-[#24549c] hover:underline">
							Inteligência de clientes
						</Link>
					</div>
				</div>
				<FeatureStage
					screen={{ label: "Matriz RFM com os onze segmentos de clientes, a contagem e o faturamento de cada um", node: <RfmMatrixMock /> }}
				/>
			</div>
		</section>
	);
}

export function CrmCampaigns() {
	return (
		<section id="campanhas" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className={SPLIT}>
					<FeatureStage
						className="max-[959px]:order-last"
						screen={{ label: "Escolha do gatilho de uma campanha, com Cashback expirando selecionado", node: <TriggerGridMock /> }}
					/>
					<div className="max-w-[460px]">
						<p className={EYEBROW}>03 · Campanhas no WhatsApp</p>
						<h2 className={H2}>A mensagem sai quando o cliente precisa dela.</h2>
						<p className={LEAD}>
							As campanhas disparam sozinhas a partir do que o cliente faz ou deixa de fazer, com limite semanal para ninguém receber mensagem demais.
						</p>
						<Bullets items={CRM_CAMPAIGN_TRIGGERS} />
					</div>
				</div>
				<div className={`${SPLIT} mt-24 max-md:mt-16`}>
					<div className="max-w-[460px]">
						<h3 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] max-md:text-[26px]">
							Receita atribuída a cada campanha.
						</h3>
						<p className={LEAD}>
							Conversões, taxa de conversão e receita atribuída dentro da janela que você escolhe. A receita incremental estima o que veio além do ritmo
							normal de cada cliente, e as conversões aparecem separadas em aquisição, reativação e aceleração.
						</p>
						<Link
							href="/features/campanhas-whatsapp"
							className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-[#24549c] hover:underline"
						>
							Como funcionam as campanhas
							<ArrowRight className="size-4" aria-hidden />
						</Link>
					</div>
					<FeatureStage
						screen={{
							label: "Ranking de campanhas por receita atribuída, conversões e taxa de conversão",
							node: <CampaignRankingMock />,
							interactive: true,
						}}
					/>
				</div>
			</div>
		</section>
	);
}

export function CrmInbox() {
	return (
		<section id="atendimento" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-24">
			<div className={CONTAINER}>
				<div className="grid gap-x-[72px] gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end">
					<div className="max-w-[640px]">
						<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">04 · CRM com WhatsApp</p>
						<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
							A conversa chega com o histórico do cliente.
						</h2>
						<p className="mt-5 text-pretty text-[17px] leading-[1.6] text-white/66">
							As respostas às campanhas e as mensagens novas caem numa caixa de entrada compartilhada, no número da loja, pela API oficial do WhatsApp. A
							equipe divide as conversas, e o agente de IA responde o que dá para responder sozinho.
						</p>
					</div>
					<ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] leading-[1.5] text-white/80">
						<li className="flex gap-3">
							<Check className="mt-0.5 size-4 flex-none text-[#ffb900]" aria-hidden />O agente de IA consulta compras, produtos, cashback e cupons
						</li>
						<li className="flex gap-3">
							<Check className="mt-0.5 size-4 flex-none text-[#ffb900]" aria-hidden />
							Responde na hora ou só quando ninguém da equipe assume a tempo
						</li>
						<li className="flex gap-3">
							<Check className="mt-0.5 size-4 flex-none text-[#ffb900]" aria-hidden />
							Passa a conversa para a equipe quando precisa
						</li>
					</ul>
				</div>
				<div className="mt-14 rounded-[28px] bg-white/6 p-10 max-md:rounded-[20px] max-md:p-3">
					<ScaledMock
						width={1120}
						label="Caixa de entrada do WhatsApp com as conversas da loja e uma cliente atendida pelo agente de IA, que informa o saldo de cashback"
					>
						<InboxMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

export function CrmTeam() {
	return (
		<section id="equipe" className="bg-white pt-36 max-md:pt-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<FeatureStage
					className="max-[959px]:order-last"
					screen={{ label: "Ranking de vendedores com vendas, faturamento e o avanço da meta de cada um", node: <SellersRankingMock /> }}
				/>
				<div className="max-w-[460px]">
					<p className={EYEBROW}>05 · A equipe</p>
					<h2 className={H2}>Cada vendedor sabe com quem falar hoje.</h2>
					<p className={LEAD}>
						O CRM distribui a base em carteiras e diz quem cada vendedor deve contatar no dia, no ritmo de cada segmento. As metas e as vendas influenciadas
						mostram o que esse contato rendeu.
					</p>
					<Bullets items={CRM_TEAM_BULLETS} />
				</div>
			</div>
		</section>
	);
}

export function CrmFaq() {
	return (
		<section id="perguntas-frequentes" className="scroll-mt-[80px] bg-white py-36 max-md:py-24">
			<div className={`${CONTAINER} grid gap-x-[72px] gap-y-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]`}>
				<div>
					<p className={EYEBROW}>06 · Dúvidas</p>
					<h2 className={H2}>Perguntas sobre CRM para varejo.</h2>
				</div>
				<div className="flex flex-col border-t border-[#e3e8ea]">
					{CRM_FAQS.map((faq, index) => (
						<details key={faq.question} open={index === 0} className="group border-b border-[#e3e8ea]">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
								{faq.question}
								<Plus className="size-5 flex-none text-[#687a80] transition-transform group-open:rotate-45" aria-hidden />
							</summary>
							<p className="max-w-[680px] pb-6 text-[16px] leading-[1.65] text-[#5b6a70]">{faq.answer}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}

export function CrmCta() {
	return (
		<section id="cta" className="bg-white px-6 pb-6 max-md:px-3 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-28 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-20"
			>
				<h2 className="max-w-[760px] text-balance text-[56px] font-semibold leading-[1.04] tracking-[-0.04em] max-md:text-[38px]">
					Sua base de clientes já existe. Falta fazer ela voltar.
				</h2>
				<p className="mt-5 max-w-[560px] text-[18px] leading-[1.6] text-white/66 max-md:text-[16px]">
					Conecte o sistema que você já usa ou comece pelo Ponto de Interação no balcão. O cashback e as campanhas vêm configurados para o seu segmento.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId="crm_cta_trial"
						location="crm_cta"
						slug={CRM_SLUG}
						className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-[22px] text-[15px] font-medium text-[#0b1628] transition-colors hover:bg-[#eef2f6]"
					>
						Testar 15 dias grátis
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href={whatsappHref(CRM_WHATSAPP_TEXT)}
						ctaId="crm_cta_especialista"
						location="crm_cta"
						slug={CRM_SLUG}
						className="inline-flex h-12 items-center rounded-full border border-white/20 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-white/8"
					>
						Falar com um especialista
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}
