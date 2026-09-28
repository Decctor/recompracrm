# Extração local de vendas do Phibo

O comando abaixo extrai as vendas de **28/06 a 28/09/2026**, incluindo itens, formas de pagamento e identificadores originais. Ele usa as mesmas consultas internas que a tela **Relação de Vendas** faz na sessão autenticada do navegador. Não é uma API pública; alterações no Phibo podem exigir ajustes no script.

```powershell
npm ci
npm run extract:phibo-sales -- --from 2026-06-28 --to 2026-09-28
```

O período padrão vai de três meses antes da data atual até hoje. O comando usa um perfil separado do Chrome em `.local-analysis/phibo/chrome-profile`. Se ele ainda precisar de login, execute `npm run extract:phibo-sales:ui -- --from ... --to ...`, entre no Phibo na janela aberta e pressione Enter no terminal. Depois, a sessão pode ser reutilizada pelo comando principal.

O resultado fica em `.local-analysis/phibo/vendas-raw-AAAA-MM-DD-a-AAAA-MM-DD.json`. Cada dia contém `quantidade` e `vendas`; cada venda contém os campos originais do Phibo e `detalhamento` com pagamentos e itens. O JSON é atualizado ao fim de cada dia. Rodar o mesmo comando novamente pula os dias concluídos. Se uma data falhar, o motivo aparece em `falhas` e a execução para.

O perfil e os JSONs ficam em `.local-analysis/`, pasta ignorada pelo Git porque contêm nomes, telefones e dados de compras. A extração não importa vendas para o RecompraCRM. Antes da importação, use `vendasUuid` para deduplicar, concilie datas no fuso da loja e valide valores, clientes e produtos. O extrator alternativo `extract:phibo-sales:ui` lê os cartões e modais da página.
