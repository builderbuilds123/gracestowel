/**
 * Centralized Icons Library
 *
 * OPTIMIZATION: Direct imports from lucide-react prevent loading the entire icon library.
 * Barrel file imports (from "lucide-react") load ~1,583 modules and add 200-800ms to cold start.
 * Direct imports load only what's needed (~18KB vs ~1MB).
 *
 * Usage:
 *   import { ArrowRight, Heart, Star } from '~/lib/icons';
 *
 * To add a new icon:
 *   1. Find the icon name in lucide-react
 *   2. Add the direct import below (kebab-case for file path)
 *   3. Export it with the PascalCase name
 *
 * @see https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
 */

// Navigation & UI
export { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
export { default as ArrowLeft } from 'lucide-react/dist/esm/icons/arrow-left';
export { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
export { default as ChevronLeft } from 'lucide-react/dist/esm/icons/chevron-left';
export { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
export { default as Menu } from 'lucide-react/dist/esm/icons/menu';
export { default as X } from 'lucide-react/dist/esm/icons/x';
export { default as Search } from 'lucide-react/dist/esm/icons/search';
export { default as Globe } from 'lucide-react/dist/esm/icons/globe';
export { default as DollarSign } from 'lucide-react/dist/esm/icons/dollar-sign';
export { default as SlidersHorizontal } from 'lucide-react/dist/esm/icons/sliders-horizontal';
export { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';

// Actions
export { default as Plus } from 'lucide-react/dist/esm/icons/plus';
export { default as Minus } from 'lucide-react/dist/esm/icons/minus';
export { default as Check } from 'lucide-react/dist/esm/icons/check';
export { default as Loader2 } from 'lucide-react/dist/esm/icons/loader-2';
export { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
export { default as ThumbsUp } from 'lucide-react/dist/esm/icons/thumbs-up';

// Shopping & Commerce
export { default as ShoppingBag } from 'lucide-react/dist/esm/icons/shopping-bag';
export { default as Heart } from 'lucide-react/dist/esm/icons/heart';
export { default as Tag } from 'lucide-react/dist/esm/icons/tag';
export { default as Gift } from 'lucide-react/dist/esm/icons/gift';

// User & Account
export { default as User } from 'lucide-react/dist/esm/icons/user';

// Delivery & Shipping
export { default as Truck } from 'lucide-react/dist/esm/icons/truck';
export { default as Package } from 'lucide-react/dist/esm/icons/package';
export { default as MapPin } from 'lucide-react/dist/esm/icons/map-pin';

// Status & Feedback
export { default as Star } from 'lucide-react/dist/esm/icons/star';
export { default as CheckCircle } from 'lucide-react/dist/esm/icons/check-circle';
export { default as CheckCircle2 } from 'lucide-react/dist/esm/icons/check-circle-2';
export { default as AlertCircle } from 'lucide-react/dist/esm/icons/alert-circle';
export { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
export { default as XCircle } from 'lucide-react/dist/esm/icons/x-circle';
export { default as Clock } from 'lucide-react/dist/esm/icons/clock';

// Trust & Security
export { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
export { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

// Nature & Decoration
export { default as Leaf } from 'lucide-react/dist/esm/icons/leaf';
export { default as Sparkles } from 'lucide-react/dist/esm/icons/sparkles';
export { default as Quote } from 'lucide-react/dist/esm/icons/quote';
export { default as PartyPopper } from 'lucide-react/dist/esm/icons/party-popper';

// Social
export { default as Instagram } from 'lucide-react/dist/esm/icons/instagram';
export { default as Facebook } from 'lucide-react/dist/esm/icons/facebook';
export { default as Twitter } from 'lucide-react/dist/esm/icons/twitter';

// Phosphor Icons (also direct imports)
// Note: @phosphor-icons/react uses named exports
export { Towel } from '@phosphor-icons/react';
