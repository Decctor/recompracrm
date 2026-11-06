"use client";

// Shell de impressão das propostas comerciais personalizadas (A4, várias folhas).
// Cada proposta é um componente em ./_components. Para trocar de proposta,
// importe outro componente e aponte `ActiveProposal` para ele — o resto não muda.

import { Printer } from "lucide-react";
import { BRAND } from "./_components/_shared";
import { EmporioDoBreuProposal } from "./_components/emporio-do-breu";

/* -------------------------------------------------------------------------- */
/*  Proposta ativa — troque aqui                                              */
/* -------------------------------------------------------------------------- */

const ActiveProposal = EmporioDoBreuProposal;

/* -------------------------------------------------------------------------- */
/*  Shell                                                                      */
/* -------------------------------------------------------------------------- */

export default function PropostaPersonalizadaPage() {
	function handlePrint() {
		window.print();
	}

	return (
		<div className="proposal-root flex min-h-screen flex-col items-center gap-6 bg-neutral-200/70 px-4 py-10 print:gap-0 print:bg-white print:p-0">
			<style>{`
				@page { size: A4 portrait; margin: 0; }
				.sheet {
					width: 210mm;
					min-height: 297mm;
					-webkit-print-color-adjust: exact;
					print-color-adjust: exact;
				}
				@media print {
					.proposal-root { background: #fff !important; }
					html, body { background: #fff !important; }
					.sheet {
						height: 297mm;
						overflow: hidden;
						box-shadow: none !important;
						break-after: page;
						page-break-after: always;
					}
					.sheet:last-of-type { break-after: auto; page-break-after: auto; }
				}
			`}</style>

			<ActiveProposal />

			{/* Controle de impressão — só na tela */}
			<button
				type="button"
				onClick={handlePrint}
				className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-2xl transition-transform hover:-translate-y-0.5 print:hidden"
				style={{ backgroundColor: BRAND.blue, boxShadow: "0 16px 40px -12px rgba(36,84,156,0.55)" }}
			>
				<Printer className="h-4 w-4" />
				Salvar em PDF
			</button>
		</div>
	);
}
