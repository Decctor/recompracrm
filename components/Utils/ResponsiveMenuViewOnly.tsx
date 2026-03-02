import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import type { PropsWithChildren } from "react";

import { useMediaQuery } from "@/lib/hooks/use-media-query";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";
import { LoadingButton } from "../loading-button";
import { Button } from "../ui/button";

const responsiveMenuVariants = cva("flex flex-col", {
	variants: {
		dialogVariant: {
			fit: "h-fit w-fit max-w-fit min-h-fit",
			sm: "max-h-[90%] h-[60%] min-h-[60%] w-[40%] min-w-[40%] max-w-[40%]",
			md: "h-[70%] min-h-[70%] max-h-[70%] lg:max-h-[70%] w-[60%] min-w-[60%] max-w-[60%] lg:max-w-[60%]",
			lg: "h-[90%] min-h-[90%] max-h-[90%] lg:max-h-[90%] w-[80%] min-w-[80%] max-w-[80%] lg:max-w-[80%]",
		},
	},
	defaultVariants: {
		dialogVariant: "sm",
	},
});

const drawerVariants = cva("flex flex-col", {
	variants: {
		drawerVariant: {
			fit: "flex flex-col h-fit max-h-fit",
			sm: "flex flex-col h-fit max-h-[70vh]",
			md: "flex flex-col h-fit max-h-[80vh]",
			lg: "flex flex-col h-fit max-h-[90vh]",
		},
	},
	defaultVariants: {
		drawerVariant: "sm",
	},
});

type ResponsiveMenuViewOnlyProps = PropsWithChildren & {
	dialogContentClassName?: string;
	drawerContentClassName?: string;
	menuTitle: string;
	menuDescription: string;
	menuCancelButtonText: string;
	stateIsLoading: boolean;
	stateError?: string | null;
	closeMenu: () => void;
	dialogVariant?: "fit" | "sm" | "md" | "lg";
	drawerVariant?: "fit" | "sm" | "md" | "lg";
	dialogShowFooter?: boolean;
	drawerShowFooter?: boolean;
};
function ResponsiveMenuViewOnly({
	children,
	menuTitle,
	menuDescription,
	menuCancelButtonText,
	closeMenu,
	stateIsLoading,
	stateError,
	dialogContentClassName,
	drawerContentClassName,
	dialogVariant = "sm",
	drawerVariant = "sm",
	dialogShowFooter = true,
	drawerShowFooter = true,
}: ResponsiveMenuViewOnlyProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	return isDesktop ? (
		<Dialog onOpenChange={(v) => (v ? null : closeMenu())} open>
			<DialogContent className={cn(responsiveMenuVariants({ dialogVariant }), dialogContentClassName)}>
				<DialogHeader>
					<DialogTitle>{menuTitle}</DialogTitle>
					<DialogDescription>{menuDescription}</DialogDescription>
				</DialogHeader>
				{stateIsLoading ? (
					<LoadingComponent />
				) : stateError ? (
					<ErrorComponent msg={stateError} />
				) : (
					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex flex-1 flex-col gap-3 overflow-auto px-4 py-2 lg:px-0">
						{children}
					</div>
				)}
				{dialogShowFooter && (
					<DialogFooter className="flex-wrap gap-y-2">
						<DialogClose asChild>
							<Button variant="outline">{menuCancelButtonText}</Button>
						</DialogClose>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	) : (
		<Drawer onOpenChange={(v) => (v ? null : closeMenu())} open>
			<DrawerContent className={cn(drawerVariants({ drawerVariant }), drawerContentClassName)}>
				<DrawerHeader className="text-left">
					<DrawerTitle>{menuTitle}</DrawerTitle>
					<DrawerDescription>{menuDescription}</DrawerDescription>
				</DrawerHeader>

				{stateIsLoading ? (
					<LoadingComponent />
				) : stateError ? (
					<ErrorComponent msg={stateError} />
				) : (
					<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex flex-1 flex-col gap-3 overflow-auto px-4 py-2 lg:px-0">
						{children}
					</div>
				)}

				{drawerShowFooter && (
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline">{menuCancelButtonText}</Button>
						</DrawerClose>
					</DrawerFooter>
				)}
			</DrawerContent>
		</Drawer>
	);
}

export default ResponsiveMenuViewOnly;
