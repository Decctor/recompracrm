# Google Ads changes — 29 September 2026

Account: recompraCRM (799-894-7107), Syncroniza Chrome profile.
Campaign: `Pesquisa | Categoria + Dor` (24292846290).

## Saved in Google Ads

- Renamed the original group to `CRM | Varejo`, retaining its eight keywords.
- Created `Fidelização | Cashback` with eight keywords: exact and phrase matches of `sistema de fidelização`, `software de fidelização`, `programa de fidelidade para lojas`, and `sistema de fidelização de clientes`.
- Created `Reativação | Clientes` with `[software de retenção de clientes]`. Google currently marks this keyword **low search volume / not eligible**. The group is saved but cannot serve through this keyword while that status persists.
- Verified the keyword table total: **17**.
- Created a responsive search ad for each new group, with 15 headlines and four descriptions. Destinations: `/features/programa-de-cashback` and `/features/campanhas-whatsapp` respectively. Both production pages were opened and their content checked.
- Updated the original retail ad with CRM category headlines, a corrected iFood headline, simpler wording about inactive customers, and `R$ 399,90/mês`. Added display paths `crm/varejo`.
- Corrected campaign sitelinks: WhatsApp → `/features/campanhas-whatsapp`; integrations → `/integrations`; pricing → `/#saldo`; trial → `/auth/signup`. Corrected the pricing sitelink description to R$399.90.
- Verified all three ads in the ads table. Their ad-strength fields were pending after creation/editing; this is not a performance result.
- Budget remains R$18.17/day. Maximize Clicks and the existing R$5 CPC cap were retained.

## Campaign negatives saved

Verified all 18 entries at campaign scope. Broad negative match:

```text
vaga
vagas
emprego
empregos
salário
salários
salario
salarios
curso
cursos
apostila
apostilas
torrent
crack
```

Phrase negative match:

```text
"o que é crm"
"o que e crm"
"cashback cartão"
"cashback banco"
```

Free-trial intent and integration names remain available. Review actual search terms once traffic arrives before expanding this list.

## Keyword Planner evidence

Settings: Brazil, Portuguese, Google, September 2025–August 2026. These are historical ranges, not forecasts or guaranteed CPCs. Exact/phrase versions do not represent separate additional demand.

| Keyword | Average monthly searches | Competition | Top-of-page bid low–high |
| --- | --- | --- | --- |
| crm para varejo | 100–1,000 | High | R$10.71–46.28 |
| crm varejo | 100–1,000 | High | R$10.71–46.28 |
| sistema de fidelização | 10–100 | Medium | R$4.88–22.88 |
| software de fidelização | 10–100 | Medium | Not provided |
| programa de fidelidade para lojas | 10–100 | High | R$4.64–24.97 |
| sistema de fidelização de clientes | 10–100 | High | R$6.96–30.43 |
| software de retenção de clientes | 10–100 | Not provided | Not provided |
| programa de fidelização de clientes | 10–100 | Medium | R$11.05–35.96 |

The R$5 cap is below the historical low top-of-page estimate for retail CRM. If impressions remain near zero after ad processing, review eligibility and auction constraints before changing the cap. The retention exact keyword is already flagged for low volume despite Planner's aggregate range.

## Conversion validation and remaining work

- GTM `GTM-KHTDGQL4`, version 3, was published on 28 September 2026. The workspace had no pending changes.
- Google Ads conversion tag: ID `18481218774`, label `D0p8CMae04kdENaJxOxE`, value 1 BRL, custom-event trigger `organization_created`.
- Production signup and onboarding are marked tagged in GTM coverage. Diagnostics show 16 untagged URLs and 120 without recent activity among 488 URLs, including preview deployments and some dashboard routes. These warnings alone do not establish that signup tracking is broken.
- Tag Assistant preview on production signup confirmed the Ads base tag and conversion linker fired. The organization-created conversion tag did not fire on a page visit, as expected. Preview also detected the older Ads destination `AW-17974535339`.
- No synthetic lead event was sent and no test account was created. A real completed first-organization CRM signup still needs an end-to-end conversion test.
- Local source now adds `produto: activeProduct` to the existing `organization_created` event, preserving the existing trigger. This change is **not deployed**. The published GTM trigger currently does not separate CRM from ERP.
- After deploying the source change, verify CRM and ERP event payloads, then configure product-specific conversion filtering. Do not require `produto` in the live trigger before deployment, since older events lack that field.
- Targeted Oxlint passed with zero errors/warnings; `git diff --check` passed for the source edit.

