import {
  Building2,
  Bus,
  Circle,
  CircleMinus,
  CirclePlus,
  Clapperboard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  TrendingUp,
  Undo2,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Category icons, as an explicit map.
 *
 * NOT `import * as icons from 'lucide-react'` with a dynamic lookup: that
 * defeats tree-shaking and pulls the entire icon set - roughly 1,500 components -
 * into the bundle to render twenty of them.
 *
 * `TrendingUp` is in the set and is deliberately NOT in the RTL flip allowlist:
 * it encodes meaning by slope, so mirroring it reads as the opposite trend.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  Wallet,
  Laptop,
  Gift,
  TrendingUp,
  Undo2,
  CirclePlus,
  House,
  ShoppingBasket,
  Zap,
  Landmark,
  Building2,
  Bus,
  UtensilsCrossed,
  HeartPulse,
  ShieldCheck,
  Repeat,
  ShoppingBag,
  Clapperboard,
  GraduationCap,
  CircleMinus,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  // A custom category can name an icon this build does not ship, and an import
  // that resolves to undefined would throw inside the render of a feed row.
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden="true" />;
}
