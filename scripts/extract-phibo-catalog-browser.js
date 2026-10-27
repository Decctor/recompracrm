/** Executar no preview autenticado, na listagem de estoque. Não salva credenciais. */
(() => {
	if (window.phiboCatalog) return "Extrator já instalado.";
	const endpoint = "https://www.phibo-api.com.br/estoque/listarProdutos";
	let sessionHeaders;
	let running = false;
	const previousFetch = window.fetch;
	window.fetch = function (input, init) {
		const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
		if (`${url.origin}${url.pathname}` === endpoint) {
			const headers = new Headers(input instanceof Request ? input.headers : undefined);
			new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
			if (headers.has("authorization")) sessionHeaders = Object.fromEntries(headers.entries());
		}
		return previousFetch.call(this, input, init);
	};
	const open = XMLHttpRequest.prototype.open;
	const setHeader = XMLHttpRequest.prototype.setRequestHeader;
	const requests = new WeakMap();
	XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		const parsed = new URL(url, location.href);
		if (method.toUpperCase() === "GET" && `${parsed.origin}${parsed.pathname}` === endpoint) requests.set(this, {});
		else requests.delete(this);
		return open.call(this, method, url, ...rest);
	};
	XMLHttpRequest.prototype.setRequestHeader = function (key, value) {
		const headers = requests.get(this);
		if (headers) {
			headers[key] = value;
			if (key.toLowerCase() === "authorization") sessionHeaders = headers;
		}
		return setHeader.call(this, key, value);
	};
	async function extract() {
		if (!sessionHeaders) throw new Error("Faça uma pesquisa ou mude de página para observar a sessão.");
		if (running) throw new Error("Extração já em andamento.");
		running = true;
		try {
			const result = { fonte: location.href, extraidoEm: new Date().toISOString(), consultas: [] };
			for (const status of [1, 0]) {
				const run = { status, paginas: [] };
				let totalPages = 1;
				let total;
				for (let page = 0; page < totalPages; page++) {
					const url = new URL(endpoint);
					url.search = new URLSearchParams({ page: String(page), size: "50", opcaoConsulta: status ? "6" : "12", status: String(status) });
					const response = await fetch(url, { headers: { ...sessionHeaders }, signal: AbortSignal.timeout(30000) });
					if (!response.ok) throw new Error(`Consulta retornou HTTP ${response.status}.`);
					const data = await response.json();
					if (page === 0) {
						totalPages = data.totalPages;
						total = data.totalElements;
					}
					if (
						!Array.isArray(data.content) ||
						data.number !== page ||
						!Number.isSafeInteger(totalPages) ||
						totalPages < 0 ||
						totalPages > 10000 ||
						data.totalElements !== total ||
						data.totalPages !== totalPages
					)
						throw new Error("Paginação mudou; execute novamente.");
					run.paginas.push({ url: url.href, ...data });
				}
				if (run.paginas.flatMap((p) => p.content).length !== total) throw new Error("Catálogo truncado.");
				result.consultas.push(run);
			}
			const rows = result.consultas.flatMap((q) => q.paginas.flatMap((p) => p.content));
			if (
				rows.some((r) => !r.estoqueId || !r.produtoEan) ||
				new Set(rows.map((r) => r.estoqueId)).size !== rows.length ||
				new Set(rows.map((r) => r.produtoEan)).size !== rows.length
			)
				throw new Error("Identidades ausentes ou repetidas.");
			const link = document.createElement("a");
			const blob = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
			link.href = blob;
			link.download = `phibo-catalogo-completo-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(blob), 60000);
			return {
				modelos: new Set(rows.map((r) => r.produtoId)).size,
				variacoes: rows.length,
				ativos: rows.filter((r) => r.status === 1).length,
				excluidos: rows.filter((r) => r.status === 0).length,
			};
		} finally {
			running = false;
		}
	}
	window.phiboCatalog = { extract, ready: () => Boolean(sessionHeaders) };
	return "Faça uma pesquisa e depois execute await phiboCatalog.extract().";
})();
