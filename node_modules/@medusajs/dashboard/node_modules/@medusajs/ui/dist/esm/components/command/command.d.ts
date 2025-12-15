import React from "react";
declare const Command: {
    ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element;
    displayName: string;
} & {
    Copy: React.ForwardRefExoticComponent<Omit<React.HTMLAttributes<HTMLButtonElement> & {
        content: string;
        variant?: "mini" | "default" | null;
        asChild?: boolean;
    } & React.RefAttributes<HTMLButtonElement>, "ref"> & React.RefAttributes<HTMLButtonElement>>;
};
export { Command };
//# sourceMappingURL=command.d.ts.map