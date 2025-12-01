import { Dialog as RadixDialog } from "radix-ui";
import * as React from "react";
/**
 * @prop defaultOpen - Whether the modal is opened by default.
 * @prop open - Whether the modal is opened.
 * @prop onOpenChange - A function to handle when the modal is opened or closed.
 */
interface FocusModalRootProps extends React.ComponentPropsWithoutRef<typeof RadixDialog.Root> {
}
interface FocusModalTriggerProps extends React.ComponentPropsWithoutRef<typeof RadixDialog.Trigger> {
}
interface FocusModalPortalProps extends RadixDialog.DialogPortalProps {
}
/**
 * The `FocusModal.Content` component uses this component to wrap the modal content.
 * It accepts props from the [Radix UI Dialog Portal](https://www.radix-ui.com/primitives/docs/components/dialog#portal) component.
 */
declare const FocusModalPortal: {
    (props: FocusModalPortalProps): React.JSX.Element;
    displayName: string;
};
/**
 * This component is used to create the overlay for the modal.
 * It accepts props from the [Radix UI Dialog Overlay](https://www.radix-ui.com/primitives/docs/components/dialog#overlay) component.
 */
declare const FocusModalOverlay: React.ForwardRefExoticComponent<Omit<RadixDialog.DialogOverlayProps & React.RefAttributes<HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
interface FocusModalTitleProps extends React.ComponentPropsWithoutRef<typeof RadixDialog.Title> {
}
declare const FocusModal: {
    (props: FocusModalRootProps): React.JSX.Element;
    displayName: string;
} & {
    Trigger: React.ForwardRefExoticComponent<FocusModalTriggerProps & React.RefAttributes<HTMLButtonElement>>;
    Title: React.ForwardRefExoticComponent<FocusModalTitleProps & React.RefAttributes<HTMLHeadingElement>>;
    Description: React.ForwardRefExoticComponent<RadixDialog.DialogDescriptionProps & React.RefAttributes<HTMLParagraphElement>>;
    Content: React.ForwardRefExoticComponent<Omit<RadixDialog.DialogContentProps & React.RefAttributes<HTMLDivElement>, "ref"> & {
        overlayProps?: React.ComponentPropsWithoutRef<typeof FocusModalOverlay>;
        portalProps?: React.ComponentPropsWithoutRef<typeof FocusModalPortal>;
    } & React.RefAttributes<HTMLDivElement>>;
    Header: React.ForwardRefExoticComponent<Omit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    Body: React.ForwardRefExoticComponent<Omit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
    Close: React.ForwardRefExoticComponent<RadixDialog.DialogCloseProps & React.RefAttributes<HTMLButtonElement>>;
    Footer: React.ForwardRefExoticComponent<Omit<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & React.RefAttributes<HTMLDivElement>>;
};
export { FocusModal };
//# sourceMappingURL=focus-modal.d.ts.map