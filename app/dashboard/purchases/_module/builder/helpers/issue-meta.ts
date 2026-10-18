import { Link2Off, ReceiptText, Ruler, ScanSearch, type LucideIcon } from "lucide-react";
import type { TTone } from "../components/builder-ui";
import type { TReviewIssue } from "./review-lines";

export const ISSUE_META: Record<TReviewIssue, { pill: string; icon: LucideIcon; tone: TTone; fix: string }> = {
	unmapped: { pill: "Sem produto", icon: Link2Off, tone: "bad", fix: "Vincular" },
	suggested: { pill: "Confirmar vínculo", icon: ScanSearch, tone: "info", fix: "Confirmar" },
	unit: { pill: "Converter unidade", icon: Ruler, tone: "warn", fix: "Informar fator" },
	tax: { pill: "Classificar tributo", icon: ReceiptText, tone: "warn", fix: "Classificar" },
};
