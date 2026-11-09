import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	AlertTriangle,
	BrainCircuit,
	CheckCircle2,
	ChevronLeft,
	CreditCard,
	FileText,
	Globe,
	Mail,
	MessageSquare,
	RefreshCw,
	Scale,
	Server,
	Shield,
	Store,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import Image from "next/image";
import RecompraCRMLogo from "@/utils/images/logos/horizontal-color-on-dark.png";
export default function LegalPage() {
	const lastUpdateDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

	const sections = [
		{ id: "intro", title: "1. Introdução", icon: <FileText className="w-4 h-4" /> },
		{ id: "termos-uso", title: "2. Termos de Uso", icon: <Scale className="w-4 h-4" /> },
		{ id: "privacidade", title: "3. Política de Privacidade", icon: <Shield className="w-4 h-4" /> },
		{ id: "whatsapp", title: "4. Integração WhatsApp", icon: <MessageSquare className="w-4 h-4" /> },
		{ id: "funcionalidades", title: "5. Funcionalidades e Recursos", icon: <BrainCircuit className="w-4 h-4" /> },
		{ id: "dpa", title: "6. Processamento de Dados (DPA)", icon: <Server className="w-4 h-4" /> },
		{ id: "cookies", title: "7. Cookies", icon: <Globe className="w-4 h-4" /> },
		{ id: "transferencia", title: "8. Transferência Internacional", icon: <Globe className="w-4 h-4" /> },
		{ id: "alteracoes", title: "9. Alterações", icon: <RefreshCw className="w-4 h-4" /> },
		{ id: "legislacao", title: "10. Legislação", icon: <Scale className="w-4 h-4" /> },
		{ id: "contato", title: "11. Contato", icon: <Mail className="w-4 h-4" /> },
	];

	return (
		<div className="min-h-screen bg-gray-50/50 flex flex-col font-sans">
			{/* Header */}
			<header className="sticky top-0 z-50 w-full border-b bg-[#24549c] backdrop-blur supports-[backdrop-filter]:bg-[#24549c] text-white">
				<div className="container px-4 h-16 flex items-center justify-between mx-auto max-w-7xl">
					<div className="flex items-center gap-4">
						<Link href="/auth/signin">
							<Button variant="ghost" size="icon" className="h-8 w-8">
								<ChevronLeft className="h-4 w-4" />
							</Button>
						</Link>
						<div className="flex items-center gap-2">
							<Image src={RecompraCRMLogo} alt="RecompraCRM" width={200} height={200} />
						</div>
					</div>
					<Badge variant="outline" className="text-xs font-normal hidden sm:inline-flex text-white">
						Última atualização: {lastUpdateDate}
					</Badge>
				</div>
			</header>

			<div className="flex-1 container px-4 py-8 mx-auto max-w-7xl">
				<div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
					{/* Sidebar Navigation */}
					<aside className="hidden lg:block w-64 shrink-0">
						<div className="sticky top-24">
							<div className="pb-4">
								<h4 className="mb-2 text-sm font-semibold tracking-tight text-gray-900">Índice</h4>
								<ScrollArea className="h-[calc(100vh-10rem)]">
									<nav className="flex flex-col gap-1 pr-4">
										{sections.map((section) => (
											<a
												key={section.id}
												href={`#${section.id}`}
												className="flex items-center gap-2 text-sm text-gray-600 hover:text-foreground hover:bg-primary/5 px-2 py-1.5 rounded-md transition-colors"
											>
												<span className="shrink-0">{section.icon}</span>
												<span className="truncate">{section.title}</span>
											</a>
										))}
									</nav>
								</ScrollArea>
							</div>
						</div>
					</aside>

					{/* Main Content */}
					<main className="flex-1 min-w-0">
						<div className="max-w-4xl space-y-12 pb-24">
							{/* Introdução */}
							<section id="intro" className="scroll-mt-24 space-y-4">
								<div className="space-y-2">
									<h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Termos de Uso e Política de Privacidade</h1>
									<p className="text-xl text-gray-600">Transparência e segurança no tratamento dos seus dados e de seus clientes.</p>
								</div>
								<div className="prose prose-gray max-w-none text-gray-700 leading-relaxed">
									<p>
										Bem-vindo ao <strong>RecompraCRM</strong>. Este documento unificado contém nossos Termos de Uso e Política de Privacidade, regulando o
										acesso e uso de nossa plataforma SaaS (Software as a Service) de Business Intelligence, CRM e automação de marketing.
									</p>
									<p>Desenvolvemos este documento para ser claro e acessível. Recomendamos a leitura atenta antes de utilizar nossos serviços.</p>
								</div>
							</section>

							<Separator />

							{/* Termos de Uso */}
							<section id="termos-uso" className="scroll-mt-24 space-y-8">
								<div className="flex items-center gap-3 mb-6">
									<div className="p-2 bg-primary/10 rounded-lg">
										<FileText className="h-6 w-6 text-foreground" />
									</div>
									<h2 className="text-2xl font-bold tracking-tight text-gray-900">2. Termos de Uso</h2>
								</div>

								<div className="space-y-8 text-gray-700 leading-relaxed">
									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.1. Aceitação dos Termos</h3>
										<p className="mb-2">
											Ao criar uma conta ou utilizar a plataforma, você concorda em cumprir estes termos. Se você estiver usando o serviço em nome de uma
											empresa, você declara ter autoridade para vinculá-la a estes termos.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.2. Descrição do Serviço</h3>
										<p className="mb-2">
											Oferecemos uma plataforma de gestão de relacionamento com clientes (CRM) e inteligência de negócios (BI) focada em varejo, com
											funcionalidades de integração de dados, análise de vendas e automação de comunicação via WhatsApp.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.3. Cadastro e Segurança</h3>
										<p className="mb-2">
											Você é responsável por manter a confidencialidade de suas credenciais de acesso. Notifique-nos imediatamente sobre qualquer uso não
											autorizado de sua conta. As informações fornecidas no cadastro devem ser precisas e atualizadas.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.4. Disponibilidade e Suporte (SLA)</h3>
										<p className="mb-4">
											Comprometemo-nos a manter a plataforma disponível 24/7, com disponibilidade mínima de 99,5% ao mês, excluindo-se períodos de manutenção
											programada. Manutenções serão comunicadas com antecedência mínima de 48 horas. O suporte técnico está disponível em horário comercial
											(segunda a sexta, das 9h às 18h) via e-mail e sistema de tickets.
										</p>

										<div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
											<h4 className="font-semibold text-sm uppercase tracking-wider text-slate-600 mb-4">Acordo de Nível de Serviço (SLA)</h4>
											<ul className="space-y-3 text-sm">
												<li className="flex items-start gap-3">
													<CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
													<span>
														<strong>Compromisso de Disponibilidade:</strong> Garantimos 99,5% de uptime mensal.
													</span>
												</li>
												<li className="flex items-start gap-3">
													<CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
													<span>
														<strong>Medição:</strong> Monitoramento contínuo através de ferramentas especializadas.
													</span>
												</li>
												<li className="flex items-start gap-3">
													<AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
													<span>
														<strong>Exclusões:</strong> Manutenções programadas, indisponibilidade de serviços de terceiros (WhatsApp, provedores de cloud), força
														maior.
													</span>
												</li>
												<li className="flex items-start gap-3">
													<CreditCard className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
													<span>
														<strong>Compensação:</strong> Em caso de indisponibilidade acima do acordado, o cliente poderá solicitar créditos de serviço
														proporcionais ao período de indisponibilidade.
													</span>
												</li>
											</ul>
										</div>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.5. Propriedade Intelectual</h3>
										<p className="mb-2">
											Todos os direitos de propriedade intelectual relacionados à plataforma, incluindo software, código-fonte, interface, design, marcas,
											logotipos e metodologias, pertencem exclusivamente a RecompraCRM ou seus licenciadores. O cliente recebe apenas uma licença limitada, não
											exclusiva e intransferível para uso do serviço durante a vigência do contrato.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.6. Propriedade dos Dados e Exportação</h3>
										<p className="mb-4">
											<strong>O cliente mantém total propriedade sobre seus dados e os dados de seus clientes finais.</strong> Atuamos como processadores de
											dados em nome do cliente. Os dashboards, relatórios e análises gerados a partir dos dados do cliente também pertencem ao cliente.
										</p>
										<p className="font-semibold mb-2 text-gray-900">Exportação e Portabilidade de Dados:</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Formatos Disponíveis:</strong> Clientes, vendas e produtos podem ser exportados em CSV e Excel (.xlsx); relatórios em PDF e Excel;
											</li>
											<li>
												<strong>Acesso à Exportação:</strong> Disponível diretamente na plataforma a qualquer momento;
											</li>
											<li>
												<strong>Exportação Completa (Backup):</strong> Para exportações completas de todos os dados, contatar o suporte técnico. Prazo de
												processamento: até 72 horas para bases grandes;
											</li>
											<li>
												<strong>Ao Encerramento do Contrato:</strong> Os dados são mantidos por 90 dias após cancelamento. O cliente pode solicitar exportação
												completa neste período. Após 90 dias, os dados são permanentemente excluídos.
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.7. Planos de Assinatura e Faturamento</h3>
										<p className="mb-2">
											<strong>Funcionalidades por Plano:</strong> Os planos de assinatura incluem diferentes níveis de acesso a:
										</p>
										<ul className="list-disc list-inside space-y-1 ml-4 mb-4">
											<li>Limite de campanhas de marketing ativas simultâneas;</li>
											<li>Limite de atendentes (assentos) no hub de atendimentos via WhatsApp;</li>
											<li>Limite de integrações ativas com sistemas externos;</li>
											<li>Acesso a dicas de IA e limite semanal de consultas;</li>
											<li>Créditos de IA para atendimento automático;</li>
											<li>Relatórios automáticos via WhatsApp.</li>
										</ul>
										<p className="mb-4">
											<strong>Período de Teste:</strong> Oferecemos período de teste gratuito de 14 dias. Durante o período de teste, todas as funcionalidades
											estão disponíveis. Ao término do período de teste, o acesso é suspenso até contratação de plano pago.
										</p>
										<p className="font-semibold mb-2 text-gray-900">Faturamento:</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>Os planos de assinatura são cobrados mensalmente ou anualmente, conforme escolha do cliente;</li>
											<li>O pagamento deve ser realizado via boleto bancário, cartão de crédito ou transferência bancária;</li>
											<li>O não pagamento pode resultar em suspensão temporária do acesso;</li>
											<li>Reajustes de preços serão comunicados com 30 dias de antecedência;</li>
											<li>Custos adicionais podem ser aplicados para uso excedente de recursos (mensagens WhatsApp, armazenamento, etc.).</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.8. Suspensão e Cancelamento</h3>
										<p className="mb-2">Reservamo-nos o direito de suspender ou cancelar a conta em casos de:</p>
										<ul className="list-disc list-inside space-y-1 ml-4 mb-4">
											<li>Violação destes termos de uso;</li>
											<li>Inadimplência por período superior a 15 dias;</li>
											<li>Uso fraudulento ou abusivo da plataforma;</li>
											<li>Envio de spam ou violação de políticas da WhatsApp Business API;</li>
											<li>Atividades ilegais ou que prejudiquem terceiros.</li>
										</ul>
										<p>
											O cliente pode cancelar o serviço a qualquer momento, mediante aviso prévio de 30 dias. Após o cancelamento, os dados serão mantidos por 90
											dias para possível recuperação, e então permanentemente excluídos.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">2.9. Limitação de Responsabilidade</h3>
										<p>
											Não nos responsabilizamos por danos indiretos, lucros cessantes ou prejuízos decorrentes de: uso inadequado da plataforma pelo cliente,
											indisponibilidade de serviços de terceiros (WhatsApp, provedores de internet), falhas de infraestrutura fora de nosso controle, ou conteúdo
											de mensagens e campanhas criadas pelo cliente. Nossa responsabilidade está limitada ao valor pago pelo cliente nos últimos 12 meses.
										</p>
									</div>
								</div>
							</section>

							<Separator />

							{/* Política de Privacidade */}
							<section id="privacidade" className="scroll-mt-24 space-y-8">
								<div className="flex items-center gap-3 mb-6">
									<div className="p-2 bg-primary/10 rounded-lg">
										<Shield className="h-6 w-6 text-foreground" />
									</div>
									<h2 className="text-2xl font-bold tracking-tight text-gray-900">3. Política de Privacidade</h2>
								</div>

								<div className="space-y-8 text-gray-700 leading-relaxed">
									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.1. Dados Coletados e Processados</h3>
										<p className="mb-2">Como plataforma B2B, processamos diferentes categorias de dados:</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Dados da Empresa Cliente:</strong> CNPJ, razão social, nome fantasia, endereço, telefone, e-mail corporativo, dados de
												faturamento;
											</li>
											<li>
												<strong>Dados dos Usuários (Colaboradores do Cliente):</strong> Nome, e-mail corporativo, cargo, telefone, credenciais de acesso,
												permissões e perfis de uso;
											</li>
											<li>
												<strong>Dados dos Clientes Finais (Clientes do Varejista):</strong> Nome, CPF/CNPJ, telefone, e-mail, histórico de compras, preferências,
												segmentação, dados de interação;
											</li>
											<li>
												<strong>Dados de Comunicação WhatsApp:</strong> Números de telefone, conteúdo de mensagens enviadas e recebidas, status de entrega e
												leitura, timestamps, mídia compartilhada;
											</li>
											<li>
												<strong>Dados Analíticos e de Negócio:</strong> Métricas de vendas, dados de produtos, estoque, transações, comportamento de compra,
												análises estatísticas;
											</li>
											<li>
												<strong>Dados de Uso da Plataforma:</strong> Logs de acesso, endereços IP, navegador, ações realizadas, funcionalidades utilizadas, tempo
												de uso;
											</li>
											<li>
												<strong>Dados Técnicos:</strong> Cookies de sessão, tokens de autenticação, preferências de configuração.
											</li>
											<li>
												<strong>Dados de Vendedores:</strong> Nome do vendedor, identificador externo, desempenho de vendas e metas associadas.
											</li>
										</ul>
										<p className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
											<strong>Responsabilidade sobre Dados de Vendedores:</strong> O cliente é controlador dos dados de vendedores de sua equipe e deve garantir
											comunicação adequada sobre o tratamento desses dados, base legal para monitoramento de desempenho, e acesso restrito às informações de
											metas e comissões individuais.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.2. Finalidade do Tratamento de Dados</h3>
										<p className="mb-2">Os dados são coletados e processados para:</p>
										<ul className="list-disc list-inside space-y-2 ml-4 mb-4">
											<li>Fornecer os serviços contratados de BI, CRM e atendimento WhatsApp;</li>
											<li>Gerar dashboards, relatórios e análises de dados para o cliente;</li>
											<li>Executar campanhas de marketing automatizadas via WhatsApp em nome do cliente;</li>
											<li>Gerenciar atendimentos e conversas com clientes finais;</li>
											<li>Manter e melhorar a funcionalidade da plataforma;</li>
											<li>Realizar cobranças e gestão financeira;</li>
											<li>Prestar suporte técnico e atendimento ao cliente;</li>
											<li>Cumprir obrigações legais e regulatórias;</li>
											<li>Garantir segurança, prevenir fraudes e proteger direitos;</li>
											<li>Realizar análises estatísticas agregadas e anônimas para melhoria do serviço;</li>
											<li>Realizar análise comportamental de clientes (RFM) para segmentação e personalização.</li>
										</ul>
										<div className="bg-blue-50 border border-blue-100 rounded-lg p-6">
											<h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
												<BrainCircuit className="w-4 h-4" /> Análise Comportamental de Clientes (RFM)
											</h4>
											<p className="text-sm text-blue-800">
												Realizamos análise RFM (Recência, Frequência, Monetário) dos clientes finais para segmentação automática em perfis (Campeões, Leais, Em
												Risco, etc.), personalização de campanhas de marketing, e geração de insights estratégicos. A análise considera: tempo desde a última
												compra, quantidade de compras no período, e valor total gasto. O cliente controla a configuração dos parâmetros de análise RFM na
												plataforma.
											</p>
										</div>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.3. Base Legal (LGPD)</h3>
										<p className="mb-2">O tratamento de dados está fundamentado nas seguintes bases legais da LGPD (Lei nº 13.709/2018):</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Execução de contrato (Art. 7º, V):</strong> Processamento necessário para prestação dos serviços contratados pelo cliente;
											</li>
											<li>
												<strong>Legítimo interesse (Art. 7º, IX):</strong> Para operação da plataforma, melhorias, segurança e prevenção de fraudes;
											</li>
											<li>
												<strong>Obrigação legal (Art. 7º, II):</strong> Cumprimento de obrigações fiscais, trabalhistas e regulatórias;
											</li>
											<li>
												<strong>Consentimento (Art. 7º, I):</strong> Quando aplicável, mediante autorização expressa do titular para finalidades específicas.
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.4. Papel como Processador de Dados</h3>
										<p>
											<strong>Importante:</strong> Em relação aos dados dos clientes finais (consumidores do varejista), atuamos como{" "}
											<strong>operadores de dados</strong>, enquanto nosso cliente (empresa varejista) atua como <strong>controlador de dados</strong>. Isso
											significa que processamos esses dados exclusivamente conforme instruções do cliente e para as finalidades por ele determinadas. O cliente é
											responsável por garantir que possui base legal adequada para coleta e processamento dos dados de seus consumidores finais, incluindo
											consentimentos necessários para comunicações de marketing via WhatsApp.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.5. Compartilhamento de Dados</h3>
										<p className="mb-2">Compartilhamos dados com terceiros apenas quando necessário:</p>
										<ul className="list-disc list-inside space-y-2 ml-4 mb-4">
											<li>
												<strong>Meta/WhatsApp:</strong> Para envio e recebimento de mensagens através da WhatsApp Business API;
											</li>
											<li>
												<strong>Provedores de Cloud:</strong> Para hospedagem e armazenamento de dados (AWS, Google Cloud, Azure);
											</li>
											<li>
												<strong>Processadores de Pagamento:</strong> Para gestão de cobranças e faturas;
											</li>
											<li>
												<strong>Ferramentas de Analytics:</strong> Para monitoramento de performance da plataforma (dados anonimizados);
											</li>
											<li>
												<strong>Prestadores de Suporte:</strong> Quando necessário para resolução de problemas técnicos;
											</li>
											<li>
												<strong>Assistentes de IA autorizados pelo Cliente:</strong> Quando o Cliente conecta o RecompraCRM a um assistente de IA, nos termos do
												item 3.6;
											</li>
											<li>
												<strong>Autoridades Legais:</strong> Quando exigido por lei ou ordem judicial.
											</li>
										</ul>
										<p>
											<strong>Garantia:</strong> Todos os terceiros são cuidadosamente selecionados e vinculados a acordos de confidencialidade e proteção de
											dados. Nunca vendemos dados a terceiros ou os utilizamos para publicidade.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.6. Conexões com Assistentes de IA (MCP)</h3>
										<p className="mb-2">
											O Cliente pode conectar o RecompraCRM a assistentes de IA de terceiros, como o Claude (Anthropic) e o ChatGPT (OpenAI), pelo protocolo MCP
											(Model Context Protocol). Nessa integração:
										</p>
										<ul className="list-disc list-inside space-y-2 ml-4 mb-4">
											<li>
												<strong>Autorização:</strong> a conexão só é criada por um usuário do Cliente com permissão de edição da organização, que escolhe a
												organização e as permissões concedidas (por exemplo, consultar vendas, clientes, campanhas, financeiro ou atendimentos). A conexão pode
												ser revogada a qualquer momento nas configurações da organização, com efeito imediato;
											</li>
											<li>
												<strong>Dados compartilhados:</strong> o assistente recebe apenas o resultado das consultas que fizer dentro das permissões concedidas, o
												que pode incluir dados comerciais, o histórico de compras de clientes finais e, com a permissão de atendimentos, o conteúdo das conversas
												de WhatsApp. Telefone, e-mail e CPF/CNPJ de clientes finais são mascarados, salvo concessão expressa de permissão específica;
											</li>
											<li>
												<strong>Alterações:</strong> ações que modificam dados criam rascunhos ou sugestões. A ativação de campanhas e o envio de templates à Meta
												exigem aprovação humana dentro do RecompraCRM;
											</li>
											<li>
												<strong>Registro:</strong> cada consulta fica registrada na auditoria da organização (ferramenta utilizada, data e registros retornados).
												O RecompraCRM recebe apenas os parâmetros de cada consulta, nunca o conteúdo da conversa entre o usuário e o assistente;
											</li>
											<li>
												<strong>Tratamento pelo provedor do assistente:</strong> os dados entregues ao assistente passam a ser tratados também pelo provedor
												escolhido pelo Cliente, inclusive fora do Brasil, conforme os termos e a política de privacidade desse provedor. Como controlador, o
												Cliente decide se e com qual assistente compartilha os dados.
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.7. Segurança da Informação</h3>
										<p className="mb-2">Implementamos rigorosas medidas de segurança para proteger os dados:</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Criptografia:</strong> SSL/TLS para dados em trânsito e criptografia AES-256 para dados em repouso;
											</li>
											<li>
												<strong>Controle de Acesso:</strong> Autenticação forte, permissões granulares baseadas em papéis (RBAC);
											</li>
											<li>
												<strong>Monitoramento:</strong> Logs detalhados de acesso e atividades, detecção de anomalias;
											</li>
											<li>
												<strong>Infraestrutura:</strong> Servidores em data centers certificados (ISO 27001, SOC 2);
											</li>
											<li>
												<strong>Backups:</strong> Backups automáticos diários com retenção de 30 dias, testes de recuperação regulares;
											</li>
											<li>
												<strong>Testes:</strong> Auditorias de segurança periódicas e testes de penetração;
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.8. Retenção de Dados</h3>
										<p className="mb-2">Os dados são retidos pelos seguintes períodos:</p>
										<ul className="list-disc list-inside space-y-2 ml-4 mb-4">
											<li>
												<strong>Dados do cliente ativo:</strong> Durante toda a vigência do contrato de prestação de serviços;
											</li>
											<li>
												<strong>Após cancelamento:</strong> 90 dias para possibilidade de reativação, depois exclusão permanente;
											</li>
											<li>
												<strong>Dados fiscais e contábeis:</strong> 5 anos conforme legislação tributária brasileira;
											</li>
											<li>
												<strong>Mensagens WhatsApp:</strong> Conforme definido pelo cliente, com máximo de 2 anos;
											</li>
											<li>
												<strong>Logs de auditoria:</strong> 12 meses para fins de segurança.
											</li>
										</ul>
										<p>O cliente pode solicitar exclusão antecipada de dados, respeitando-se apenas os prazos legais mínimos obrigatórios.</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">3.9. Direitos dos Titulares de Dados</h3>
										<p className="mb-2">Conforme a LGPD, os titulares de dados (usuários e clientes finais) têm direito a:</p>
										<ul className="list-disc list-inside space-y-2 ml-4 mb-4">
											<li>Confirmação da existência de tratamento de seus dados pessoais;</li>
											<li>Acesso aos dados pessoais armazenados;</li>
											<li>Correção de dados incompletos, inexatos ou desatualizados;</li>
											<li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
											<li>Portabilidade dos dados a outro fornecedor de serviço;</li>
											<li>Eliminação dos dados tratados com consentimento;</li>
											<li>Informação sobre compartilhamento de dados com terceiros;</li>
											<li>Revogação do consentimento quando aplicável.</li>
										</ul>
										<p className="mb-2">
											<strong>Para clientes finais (consumidores):</strong> Solicitações devem ser direcionadas ao varejista (nosso cliente), que as encaminhará
											para processamento.
										</p>
										<p className="mb-2">
											<strong>Para usuários da plataforma:</strong> Solicitações podem ser feitas diretamente ao nosso DPO através do e-mail:{" "}
											<strong>lucas@syncroniza.com.br</strong>
										</p>
									</div>
								</div>
							</section>

							<Separator />

							{/* Integração WhatsApp */}
							<section id="whatsapp" className="scroll-mt-24 space-y-8">
								<div className="flex items-center gap-3 mb-6">
									<div className="p-2 bg-green-100 rounded-lg">
										<MessageSquare className="h-6 w-6 text-green-700" />
									</div>
									<h2 className="text-2xl font-bold tracking-tight text-gray-900">4. Integração com WhatsApp Business API</h2>
								</div>

								<div className="space-y-8 text-gray-700 leading-relaxed">
									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.1. Natureza da Integração</h3>
										<p>
											Nossa plataforma integra-se oficialmente com a WhatsApp Business API da Meta para permitir que empresas varejistas se comuniquem com seus
											clientes de forma profissional, escalável e automatizada. Esta integração possibilita o envio de campanhas de marketing, notificações
											transacionais e atendimento ao cliente via WhatsApp.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.2. Dados Processados via WhatsApp</h3>
										<p className="mb-2">Através da integração WhatsApp, processamos:</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>Números de telefone de clientes finais (com código do país);</li>
											<li>Conteúdo de mensagens enviadas pelo varejista (texto, imagens, documentos, vídeos);</li>
											<li>Conteúdo de mensagens recebidas dos clientes finais;</li>
											<li>Status de entrega, leitura e resposta das mensagens;</li>
											<li>Timestamps de todas as interações;</li>
											<li>Metadados de conversação (ID da conversa, perfil do contato, etc.);</li>
											<li>Templates de mensagens aprovados pela Meta.</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.3. Conformidade com Políticas da Meta</h3>
										<p className="mb-2">O uso da WhatsApp Business API está sujeito aos termos e políticas da Meta. Garantimos conformidade com:</p>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Políticas de Comércio e Negócios da Meta:</strong> Todas as comunicações devem seguir diretrizes de conteúdo;
											</li>
											<li>
												<strong>Opt-in Obrigatório:</strong> Mensagens de marketing só podem ser enviadas para usuários que deram consentimento prévio explícito;
											</li>
											<li>
												<strong>Janela de 24 horas:</strong> Mensagens promocionais só podem ser enviadas dentro de 24h após última interação do cliente;
											</li>
											<li>
												<strong>Templates Aprovados:</strong> Mensagens fora da janela de 24h devem usar templates pré-aprovados pela Meta;
											</li>
											<li>
												<strong>Opt-out Facilitado:</strong> Usuários devem poder facilmente cancelar o recebimento de mensagens;
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.4. Responsabilidades sobre Campanhas de Marketing</h3>
										<div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
											<p className="mb-2">
												<strong>Importante:</strong> O cliente (empresa varejista) é o único responsável por:
											</p>
											<ul className="list-disc list-inside space-y-1 ml-4">
												<li>Obter consentimento válido dos consumidores para envio de mensagens via WhatsApp;</li>
												<li>Garantir que possui base legal para tratamento dos dados de contato;</li>
												<li>Respeitar pedidos de cancelamento (opt-out) imediatamente;</li>
												<li>Criar conteúdo que respeite as políticas da Meta e legislação brasileira;</li>
											</ul>
											<p className="mt-2 text-sm text-yellow-800">
												Fornecemos as ferramentas, mas o cliente é responsável pelo uso adequado e legal das funcionalidades de marketing.
											</p>
										</div>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.5. Compartilhamento de Dados com Meta</h3>
										<p>
											Ao utilizar a WhatsApp Business API, alguns dados são necessariamente compartilhados com a Meta (empresa controladora do WhatsApp) para
											viabilizar o serviço de mensagens. A Meta possui sua própria política de privacidade, disponível em whatsapp.com/legal. Nos certificamos de
											utilizar a API de forma que minimize o compartilhamento de dados, limitando-o ao estritamente necessário para operação do serviço.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.6. Restrições e Limitações</h3>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>A Meta pode impor limites de mensagens com base no comportamento e qualidade;</li>
											<li>Violações das políticas podem resultar em suspensão temporária ou permanente do número WhatsApp;</li>
											<li>Não nos responsabilizamos por bloqueios ou restrições impostas pela Meta devido a uso inadequado pelo cliente;</li>
											<li>Tempos de entrega dependem da infraestrutura da Meta e podem variar;</li>
											<li>A disponibilidade do serviço WhatsApp está sujeita aos servidores e políticas da Meta.</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.7. Bloqueio de Número WhatsApp</h3>
										<div className="bg-red-50 border border-red-200 rounded-lg p-6">
											<h4 className="font-semibold text-red-900 mb-3 uppercase tracking-wider text-sm flex items-center gap-2">
												<AlertTriangle className="h-4 w-4" /> Isenção de Responsabilidade
											</h4>
											<ul className="list-disc list-inside space-y-3 text-red-900/90 text-sm">
												<li>
													<strong>Conexões Oficiais (WhatsApp Business API):</strong> Bloqueios podem ocorrer por violação de políticas da Meta. A RecompraCRM não
													se responsabiliza por bloqueios decorrentes de uso inadequado pelo cliente, envio de spam, conteúdo impróprio, ou violação das políticas
													de uso da Meta;
												</li>
												<li>
													<strong>Conexões Não-Oficiais:</strong> Para conexões via métodos não-oficiais (como conexões baseadas em WhatsApp Web ou QR Code), a
													RecompraCRM NÃO se responsabiliza por: banimentos temporários ou permanentes do número, suspensão da conta WhatsApp, perda de acesso ao
													número, ou quaisquer outras restrições impostas pela Meta. O uso de métodos não-oficiais é de inteira responsabilidade do cliente;
												</li>
												<li>
													Independentemente do tipo de conexão, o cliente é responsável por manter práticas adequadas de comunicação e respeitar os limites de
													envio e qualidade de mensagens;
												</li>
												<li>
													Não oferecemos garantias de recuperação de números bloqueados ou de continuidade do serviço WhatsApp, uma vez que este depende de
													terceiros (Meta).
												</li>
											</ul>
										</div>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">4.8. Comunicações Automatizadas</h3>
										<p className="mb-2">A plataforma possibilita o envio de comunicações automatizadas via WhatsApp:</p>
										<div className="grid md:grid-cols-2 gap-6 mt-4">
											<div className="bg-gray-50 p-4 rounded-lg">
												<strong className="block text-gray-900 mb-2">Para Clientes Finais (consumidores):</strong>
												<ul className="list-disc list-inside space-y-1 ml-2 text-sm">
													<li>Notificações de aniversário;</li>
													<li>Alertas de cashback próximo de expirar;</li>
													<li>Mensagens de campanhas de marketing automatizadas.</li>
												</ul>
											</div>
											<div className="bg-gray-50 p-4 rounded-lg">
												<strong className="block text-gray-900 mb-2">Para Usuários da Plataforma:</strong>
												<ul className="list-disc list-inside space-y-1 ml-2 text-sm">
													<li>Relatórios diários/semanais de vendas;</li>
													<li>Alertas de metas atingidas;</li>
													<li>Relatórios consolidados.</li>
												</ul>
											</div>
										</div>
										<p className="mt-4">
											<strong>Controle:</strong> O cliente pode configurar quais comunicações automatizadas deseja ativar. Clientes finais podem solicitar
											opt-out diretamente ao varejista.
										</p>
									</div>
								</div>
							</section>

							<Separator />

							{/* Funcionalidades e Recursos */}
							<section id="funcionalidades" className="scroll-mt-24 space-y-8">
								<div className="flex items-center gap-3 mb-6">
									<div className="p-2 bg-purple-100 rounded-lg">
										<BrainCircuit className="h-6 w-6 text-purple-700" />
									</div>
									<h2 className="text-2xl font-bold tracking-tight text-gray-900">5. Funcionalidades e Recursos da Plataforma</h2>
								</div>

								<div className="space-y-8 text-gray-700 leading-relaxed">
									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">5.1. Uso de Inteligência Artificial (IA)</h3>
										<p className="mb-2">A plataforma utiliza recursos de Inteligência Artificial para:</p>
										<ul className="list-disc list-inside space-y-1 ml-4 mb-4">
											<li>Geração de respostas automáticas de atendimento via WhatsApp;</li>
											<li>Processamento e transcrição de mídias (áudios, imagens, documentos);</li>
											<li>Análise comportamental de clientes (análise RFM);</li>
											<li>Sugestões e dicas personalizadas para o negócio.</li>
										</ul>
										<p className="mb-2">
											<strong>Limitações e Tratamento:</strong>
										</p>
										<ul className="list-disc list-inside space-y-1 ml-4 mb-4">
											<li>A IA pode gerar respostas imprecisas ou inadequadas; o cliente deve revisar conteúdos;</li>
											<li>Utilizamos modelos de IA de terceiros (OpenAI) que possuem suas próprias políticas de privacidade;</li>
											<li>Não utilizamos dados do cliente para treinar modelos de IA.</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">5.2. Ponto de Interação (PDI)</h3>
										<p className="mb-2">
											O módulo PDI é uma interface de consulta para clientes finais em pontos de venda físicos, permitindo identificação de clientes, consulta de
											saldo de cashback e resgates.
										</p>
										<div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
											<strong className="block text-purple-900 mb-2 text-sm uppercase tracking-wide">Privacidade e Segurança no PDI:</strong>
											<ul className="list-disc list-inside space-y-1 ml-2 text-sm text-purple-800">
												<li>O PDI é acessível publicamente via URL específica da organização;</li>
												<li>Dados sensíveis são mascarados na interface (telefone, CPF);</li>
												<li>O cliente é responsável pela segurança física do dispositivo onde o PDI é acessado;</li>
											</ul>
										</div>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">5.3. Programas de Cashback</h3>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Acumulação:</strong> Pode ser por % ou valor fixo. Pode ocorrer via vendas integradas ou manuais.
											</li>
											<li>
												<strong>Expiração:</strong> Cashback possui validade definida e expira se não utilizado.
											</li>
											<li>
												<strong>Resgate:</strong> Aplicado como desconto em novas compras. Intransferível e não conversível em dinheiro.
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">5.4. Integrações com Sistemas Terceiros</h3>
										<p className="mb-2">A plataforma integra-se com ERPs (ex: Online Software, Cardápio Web) e Sistemas de PDV para sincronização de dados.</p>
										<p>
											<strong>Responsabilidades:</strong> O cliente é responsável por configurar credenciais. Não nos responsabilizamos por dados inconsistentes
											originados de sistemas integrados ou falhas de conexão dos terceiros.
										</p>
									</div>
								</div>
							</section>

							<Separator />

							{/* DPA */}
							<section id="dpa" className="scroll-mt-24 space-y-8">
								<div className="flex items-center gap-3 mb-6">
									<div className="p-2 bg-gray-100 rounded-lg">
										<Server className="h-6 w-6 text-gray-700" />
									</div>
									<h2 className="text-2xl font-bold tracking-tight text-gray-900">6. Acordo de Processamento de Dados (DPA)</h2>
								</div>

								<div className="space-y-8 text-gray-700 leading-relaxed">
									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">6.1. Relação Controlador-Operador</h3>
										<ul className="list-disc list-inside space-y-2 ml-4">
											<li>
												<strong>Cliente (Controlador):</strong> A empresa varejista contratante é o controlador dos dados de seus clientes finais.
											</li>
											<li>
												<strong>Plataforma (Operador):</strong> Nossa plataforma atua como operadora, processando dados em nome do cliente.
											</li>
											<li>
												<strong>Dados Próprios:</strong> Em relação aos dados cadastrais da empresa cliente e seus usuários, atuamos como controladores.
											</li>
										</ul>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">6.2. Obrigações como Operador</h3>
										<p>
											Comprometemo-nos a processar dados exclusivamente conforme instruções, implementar segurança, assistir no cumprimento de direitos dos
											titulares e excluir dados ao término do contrato.
										</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">6.3. Responsabilidades do Cliente (Controlador)</h3>
										<p>Responsável por base legal, consentimentos, fornecer informações de privacidade e responder a titulares.</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">6.4. Suboperadores</h3>
										<p className="mb-2">Utilizamos suboperadores para infraestrutura (AWS, Google Cloud), mensagens (Meta) e pagamentos.</p>
										<p>Todos são vinculados a obrigações rigorosas de proteção de dados.</p>
									</div>

									<div>
										<h3 className="text-lg font-bold text-gray-900 mb-2">6.5. Incidentes de Segurança</h3>
										<p>Notificaremos o cliente em até 72 horas após confirmarmos um incidente de segurança que afete dados pessoais.</p>
									</div>
								</div>
							</section>

							<Separator />

							<div className="grid md:grid-cols-2 gap-12">
								{/* Cookies */}
								<section id="cookies" className="scroll-mt-24 space-y-4">
									<h2 className="text-2xl font-bold tracking-tight text-gray-900 border-b pb-2">7. Cookies</h2>
									<div className="text-gray-700 leading-relaxed">
										<h3 className="font-semibold mb-2">7.1. Tipos Utilizados</h3>
										<ul className="list-disc list-inside text-sm space-y-1">
											<li>Cookies Essenciais (Autenticação, Sessão)</li>
											<li>Cookies de Preferência (Tema, Layout)</li>
											<li>Cookies de Performance (Anônimos)</li>
										</ul>
										<p className="mt-2 text-sm">
											<strong>Não</strong> utilizamos cookies de rastreamento publicitário de terceiros.
										</p>
										<h3 className="font-semibold mt-4 mb-2">7.2. Gestão</h3>
										<p className="text-sm">Gerenciável via navegador. Cookies essenciais não podem ser desativados sem comprometer a plataforma.</p>
									</div>
								</section>

								{/* Transferência Internacional */}
								<section id="transferencia" className="scroll-mt-24 space-y-4">
									<h2 className="text-2xl font-bold tracking-tight text-gray-900 border-b pb-2">8. Transferência Internacional</h2>
									<div className="text-gray-700 leading-relaxed text-sm">
										<p className="mb-2">Dados podem ser processados em servidores (AWS, Google) fora do Brasil.</p>
										<p>
											<strong>Garantias:</strong> Todas as transferências seguem a LGPD (Art. 33), utilizando países com nível adequado de proteção ou cláusulas
											contratuais padrão e certificações (ISO 27001).
										</p>
									</div>
								</section>
							</div>

							<Separator />

							<div className="grid md:grid-cols-2 gap-12">
								{/* Alterações */}
								<section id="alteracoes" className="scroll-mt-24 space-y-4">
									<h2 className="text-2xl font-bold tracking-tight text-gray-900 border-b pb-2">9. Alterações</h2>
									<p className="text-gray-700 leading-relaxed text-sm">
										Podemos alterar estes termos. Mudanças substanciais serão notificadas com 30 dias de antecedência. O uso continuado implica aceitação.
									</p>
								</section>

								{/* Legislação */}
								<section id="legislacao" className="scroll-mt-24 space-y-4">
									<h2 className="text-2xl font-bold tracking-tight text-gray-900 border-b pb-2">10. Legislação e Foro</h2>
									<p className="text-gray-700 leading-relaxed text-sm">
										Regido pela legislação brasileira (LGPD, Marco Civil, CDC). Eleito foro da comarca da sede do cliente.
									</p>
								</section>
							</div>

							<Separator />

							{/* Contato */}
							<section id="contato" className="scroll-mt-24 bg-primary/5 rounded-xl p-8 text-center space-y-4">
								<Mail className="w-8 h-8 text-foreground mx-auto" />
								<h2 className="text-2xl font-bold tracking-tight text-gray-900">11. Contato e DPO</h2>
								<p className="text-gray-600 max-w-lg mx-auto">Para exercício de direitos LGPD ou dúvidas, contate nosso Encarregado de Proteção de Dados.</p>
								<div className="flex flex-col sm:flex-row gap-4 justify-center items-center font-medium text-sm">
									<div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm">
										<span className="text-gray-500">DPO:</span>
										<a href="mailto:lucas@syncroniza.com.br" className="text-foreground hover:underline">
											lucas@syncroniza.com.br
										</a>
									</div>
									<div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm">
										<span className="text-gray-500">Suporte:</span>
										<a href="mailto:suporte@syncroniza.com.br" className="text-foreground hover:underline">
											suporte@syncroniza.com.br
										</a>
									</div>
								</div>
								<p className="text-xs text-gray-500 mt-4">Responderemos solicitações em até 15 dias úteis.</p>
							</section>

							{/* Aceitação */}
							<section className="border-t pt-8 text-center text-sm text-gray-500">
								<p>Ao utilizar a plataforma, você declara ter lido e concordado com estes Termos de Uso e Política de Privacidade.</p>
							</section>
						</div>
					</main>
				</div>
			</div>
		</div>
	);
}
