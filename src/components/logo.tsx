import { cn } from 'cn';

type LogoProps = {
  size?: number;
  className?: string;
  /** 'inverse': a light disc, for the deep-green brand panel. */
  tone?: 'brand' | 'inverse';
} & ({ title: string } | { decorative: true });

/**
 * Bookandry mark: a banknote inside a circle.
 *
 * Deliberately NO dollar glyph. The spec asked for "a dollar bill", but a `$`
 * is USD-specific in an app whose second locale is Hebrew and whose base
 * currency the user picks. The name justifies a banknote, not a currency symbol.
 *
 * Drawn on a 24-unit grid so it aligns optically with Lucide icons. Nothing here
 * is thinner than 1.5 device px at 24px. The favicon is a SEPARATE, simplified
 * file: at 16px the corner marks below would render at ~0.67px and disappear.
 */
export function Logo({ size = 28, className, tone = 'brand', ...rest }: LogoProps) {
  const disc = tone === 'inverse' ? 'fill-brand-deep-foreground' : 'fill-primary dark:fill-brand-vivid';
  const paper = tone === 'inverse' ? 'fill-brand-deep' : 'fill-primary-foreground dark:fill-background';
  const a11y =
    'decorative' in rest
      ? ({ 'aria-hidden': true, focusable: false } as const)
      : ({ role: 'img', 'aria-label': rest.title } as const);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      {...a11y}
    >
      {'decorative' in rest ? null : <title>{rest.title}</title>}
      <circle cx="12" cy="12" r="11" className={disc} />
      <rect x="4.5" y="8" width="15" height="8" rx="1.5" className={paper} />
      <circle cx="12" cy="12" r="1.9" className={disc} />
      <circle cx="7" cy="10" r="0.9" className={disc} />
      <circle cx="17" cy="14" r="0.9" className={disc} />
    </svg>
  );
}
