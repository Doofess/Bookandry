import {
  Baby,
  Bot,
  Building2,
  Bus,
  Circle,
  CircleMinus,
  CirclePlus,
  Clapperboard,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PawPrint,
  Plane,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
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
export const ICONS: Readonly<Record<string, LucideIcon>> = {
  // The generic one, offered in the picker AND used as the fallback for an
  // icon name this build does not ship.
  Circle,
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
  Bot,
  Smartphone,
  Plane,
  Baby,
  PawPrint,
  HandCoins,
  CircleMinus,
};

/**
 * Icon names the picker may offer.
 *
 * Derived from the map rather than written twice: a name in the list that is
 * not in the map renders as a fallback circle, and a name in the map that is
 * not in the list is an icon nobody can choose.
 */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS);
