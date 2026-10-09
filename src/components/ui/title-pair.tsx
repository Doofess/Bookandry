import { cn } from 'cn';
import type * as React from 'react';

type Size = 'screen' | 'hero' | 'sheet' | 'question' | 'steps';

/** §9.5. `screen` is Karantina on a phone and the 38/21 top bar from lg. */
const TITLE: Record<Size, string> = {
  screen:
    'font-display text-screen-name leading-[0.85] lg:font-sans lg:text-title-screen lg:leading-[1.02] lg:font-semibold lg:tracking-[-0.01em]',
  hero: 'text-title-hero font-semibold leading-[1.02] tracking-[-0.01em]',
  sheet: 'text-title-sheet font-semibold leading-[1.02] tracking-[-0.01em]',
  question: 'text-title-question font-semibold leading-[1.02] tracking-[-0.01em]',
  steps: 'text-title-steps font-semibold leading-[1.05] tracking-[-0.01em]',
};

const SUBTITLE: Record<Size, string> = {
  screen: 'hidden lg:block lg:text-sub-screen',
  hero: 'text-sub-hero',
  sheet: 'text-sub-sheet',
  question: 'text-sub-question',
  steps: 'text-sub-steps',
};

/**
 * A title in weight 600 and a subtitle in weight 300, a size step below, as
 * ONE heading (§7.7): the subtitle is a block span inside the heading, so a
 * screen reader reads the pair once. The space between them is real text, so
 * the pair's name is "October so far day 9 of 31", not "October so farday 9".
 */
export function TitlePair({
  as: Heading = 'h2',
  title,
  subtitle,
  size = 'sheet',
  className,
  ...props
}: {
  readonly as?: 'h1' | 'h2' | 'h3';
  readonly title: string;
  readonly subtitle?: string;
  readonly size?: Size;
  readonly className?: string;
} & Omit<React.HTMLAttributes<HTMLHeadingElement>, 'title' | 'children'>) {
  return (
    <Heading data-slot="title-pair" className={cn(TITLE[size], className)} {...props}>
      {title}
      {subtitle === undefined ? null : (
        <>
          {' '}
          <span className={cn('block leading-[1.15] font-light tracking-normal', SUBTITLE[size])}>
            {subtitle}
          </span>
        </>
      )}
    </Heading>
  );
}
