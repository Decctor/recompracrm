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
			sm: "max-h-[90%]",
			md: "h-[70%] min-h-[70%] max-h-[70%] lg:max-h-[70%] w-[60%] min-w-[60%] max-w-[60%] lg:max-w-[60%]",
			lg: "h-[90%] min-h-[90%] max-h-[90%] lg:max-h-[90%] w-[80%] min-w-[80%] max-w-[80%] lg:max-w-[80%]",
			xl: "h-[95%] min-h-[95%] max-h-[95%] lg:max-h-[95%] w-[95%] min-w-[95%] max-w-[95%] lg:max-w-[95%]",
		},
	},
	defaultVariants: {
		dialogVariant: "sm",
	},
});

const drawerVariants = cva("flex flex-col", {
	variants: {
		drawerVariant: {
			fit: "flex flex-col h-fit max-h-[90vh]",
			sm: "flex flex-col h-fit max-h-[90vh]",
			md: "flex flex-col h-fit max-h-[80vh]",
			lg: "flex flex-col h-fit max-h-[90vh]",
			xl: "flex flex-col h-fit max-h-[95vh]",
		},
	},
	defaultVariants: {
		drawerVariant: "sm",
	},
});

type ResponsiveMenuProps = PropsWithChildren & {
	dialogContentClassName?: string;
	drawerContentClassName?: string;
	menuTitle: string;
	menuDescription: string;
	menuActionButtonText: string;
	menuActionButtonClassName?: string;
	menuSecondaryActionButtonText?: string;
	menuSecondaryActionButtonClassName?: string;
	menuCancelButtonText: string;
	actionFunction: () => void;
	secondaryActionFunction?: () => void;
	actionIsLoading: boolean;
	stateIsLoading: boolean;
	stateError?: string | null;
	closeMenu: () => void;
	dialogVariant?: "fit" | "sm" | "md" | "lg" | "xl";
	drawerVariant?: "fit" | "sm" | "md" | "lg" | "xl";
};
function ResponsiveMenu({
	children,
	menuTitle,
	menuDescription,
	menuActionButtonText,
	menuActionButtonClassName,
	menuSecondaryActionButtonText,
	menuSecondaryActionButtonClassName,
	menuCancelButtonText,
	closeMenu,
	actionFunction,
	secondaryActionFunction,
	stateIsLoading,
	stateError,
	actionIsLoading,
	dialogContentClassName,
	drawerContentClassName,
	dialogVariant = "sm",
	drawerVariant = "sm",
}: ResponsiveMenuProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	return isDesktop ? (
		<Dialog onOpenChange={(v) => (v ? null : closeMenu())} open>
			<DialogContent data-dialog-container className={cn(responsiveMenuVariants({ dialogVariant }), dialogContentClassName)}>
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

				<DialogFooter className="flex-wrap gap-y-2">
					<DialogClose asChild>
						<Button variant="outline">{menuCancelButtonText}</Button>
					</DialogClose>
					{menuSecondaryActionButtonText && secondaryActionFunction && (
						<LoadingButton
							loading={actionIsLoading || stateIsLoading}
							onClick={() => secondaryActionFunction()}
							className={menuSecondaryActionButtonClassName}
						>
							{menuSecondaryActionButtonText}
						</LoadingButton>
					)}
					<LoadingButton loading={actionIsLoading || stateIsLoading} onClick={() => actionFunction()} className={menuActionButtonClassName}>
						{menuActionButtonText}
					</LoadingButton>
				</DialogFooter>
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

				<DrawerFooter>
					<DrawerClose asChild>
						<Button variant="outline">{menuCancelButtonText}</Button>
					</DrawerClose>
					{menuSecondaryActionButtonText && secondaryActionFunction && (
						<LoadingButton
							loading={actionIsLoading || stateIsLoading}
							onClick={() => secondaryActionFunction()}
							className={menuSecondaryActionButtonClassName}
						>
							{menuSecondaryActionButtonText}
						</LoadingButton>
					)}
					<LoadingButton loading={actionIsLoading || stateIsLoading} onClick={() => actionFunction()}>
						{menuActionButtonText}
					</LoadingButton>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export default ResponsiveMenu;
