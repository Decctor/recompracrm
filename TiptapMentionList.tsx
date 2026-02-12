"use client";

type User = {
	id: string;
	nome: string;
	avatar?: string | null;
};

type MentionListProps = {
	props: {
		items: User[];
		command: (props: { id: string; label: string }) => void;
		users: User[];
		onSelect: (user: User) => void;
	};
};

export class MentionList {
	element: HTMLDivElement;
	props: MentionListProps["props"];
	selectedIndex: number;

	constructor({ props }: MentionListProps) {
		this.props = props;
		this.selectedIndex = 0;
		this.element = this.createElement();
		this.render();
	}

	createElement() {
		const div = document.createElement("div");
		div.className = "z-[9999] absolute";
		return div;
	}

	updateProps(props: MentionListProps["props"]) {
		this.props = props;
		if (this.selectedIndex >= this.props.items.length) {
			this.selectedIndex = 0;
		}
		this.render();
	}

	onKeyDown({ event }: { event: KeyboardEvent }) {
		if (event.key === "ArrowUp") {
			this.upHandler();
			return true;
		}

		if (event.key === "ArrowDown") {
			this.downHandler();
			return true;
		}

		if (event.key === "Enter") {
			this.enterHandler();
			return true;
		}

		return false;
	}

	upHandler() {
		if (this.props.items.length === 0) {
			return;
		}
		this.selectedIndex = (this.selectedIndex + this.props.items.length - 1) % this.props.items.length;
		this.render();
	}

	downHandler() {
		if (this.props.items.length === 0) {
			return;
		}
		this.selectedIndex = (this.selectedIndex + 1) % this.props.items.length;
		this.render();
	}

	enterHandler() {
		this.selectItem(this.selectedIndex);
	}

	selectItem(index: number) {
		const item = this.props.items[index];
		if (item) {
			this.props.onSelect(item);
		}
	}

	render() {
		const items = this.props.items;
		const listContainerClasses =
			"bg-popover/95 backdrop-blur-sm border border-border/80 rounded-lg shadow-lg min-w-[260px] max-h-[260px] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent";

		if (items.length === 0) {
			this.element.innerHTML = `
				<div class="${listContainerClasses}">
					<div class="px-3 pt-3 pb-2 border-b border-border/60">
						<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Usuários</p>
					</div>
					<div class="px-2 py-2">
						<div class="text-sm text-muted-foreground px-2 py-1.5">Nenhum usuário encontrado</div>
					</div>
				</div>
			`;
			return;
		}

		this.element.innerHTML = `
			<div class="${listContainerClasses}">
				<div class="px-3 pt-3 pb-2 border-b border-border/60">
					<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Usuários</p>
				</div>
				<div class="px-2 py-2">
				${items
					.map((item, index) => {
						const isSelected = index === this.selectedIndex;
						const initials = item.nome
							.split(" ")
							.map((n) => n[0])
							.join("")
							.slice(0, 2)
							.toUpperCase();

						return `
							<div 
								class="flex items-center gap-2.5 px-2 py-2 rounded-md cursor-pointer border border-transparent transition-colors ${
									isSelected ? "bg-accent text-accent-foreground border-border/60" : "hover:bg-accent/50"
								}"
								data-index="${index}"
							>
								<div class="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full">
									${
										item.avatar
											? `<img src="${item.avatar}" alt="${item.nome}" class="aspect-square h-full w-full object-cover" />`
											: `<span class="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs">${initials}</span>`
									}
								</div>
								<span class="text-sm">${item.nome}</span>
							</div>
						`;
					})
					.join("")}
				</div>
			</div>
		`;

		// Use pointerdown so selection happens before editor blur closes the menu.
		this.element.querySelectorAll("[data-index]").forEach((el) => {
			el.addEventListener("pointerdown", (event) => {
				event.preventDefault();
				const index = Number.parseInt(el.getAttribute("data-index") || "0");
				this.selectItem(index);
			});
		});
	}

	destroy() {
		this.element.remove();
	}
}
