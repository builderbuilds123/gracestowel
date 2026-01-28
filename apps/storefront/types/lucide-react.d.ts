/**
 * Type declarations for lucide-react direct icon imports.
 *
 * These declarations allow direct imports from lucide-react/dist/esm/icons/*
 * which is an optimization to avoid loading the entire icon library.
 *
 * @see app/lib/icons.ts for usage
 */

declare module 'lucide-react/dist/esm/icons/*' {
    import type { LucideIcon } from 'lucide-react';
    const icon: LucideIcon;
    export default icon;
}
