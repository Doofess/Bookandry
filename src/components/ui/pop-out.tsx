import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { TitlePair } from '@/components/ui/title-pair';

/**
 * The pop-out (§6.2): a flow's centred window, built on the Base UI dialog,
 * one popup always.
 *
 * Below sm it fills the screen. From sm it is centred: up to 1140 by 732, on
 * the paper, with the dialog radius and the pop-out shadow over a blurred
 * scrim. It lays out by its OWN width (a size container named `popout`; the
 * grid rules are in index.css): one pane below 720px, steps and body from
 * 720px, steps, body and preview from 1040px. Missing areas collapse, and a
 * pop-out crossing a threshold keeps its step and its answers, because it is
 * the same popup.
 */
function PopOut(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

const SIZE = {
  full: 'sm:h-[min(45.75rem,100dvh_-_4rem)] sm:w-[min(71.25rem,100vw_-_4rem)]',
  // A one-pane pop-out caps its own width, so a short form never stretches (§6.3).
  compact:
    'sm:h-fit sm:max-h-[min(45.75rem,100dvh_-_4rem)] sm:w-[min(36rem,100vw_-_4rem)] sm:overflow-y-auto sm:overscroll-contain',
} as const;

function PopOutContent({
  size = 'full',
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props & { readonly size?: keyof typeof SIZE }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="popout-scrim"
        className="fixed inset-0 z-50 bg-scrim transition-opacity duration-(--dur-panel) data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm"
      />
      <DialogPrimitive.Popup
        data-slot="popout"
        data-size={size}
        className={cn(
          '@container/popout fixed inset-0 z-50 flex flex-col overflow-clip bg-background text-foreground outline-none',
          // An opacity fade for everyone; a short rise only when motion is welcome (§8.2).
          'transition-[opacity,translate] duration-(--dur-panel) ease-out data-ending-style:opacity-0 data-starting-style:opacity-0',
          'motion-safe:data-ending-style:translate-y-2 motion-safe:data-starting-style:translate-y-2',
          // From sm: centred by auto margins, which leaves `translate` free for the rise.
          'sm:m-auto sm:rounded-dialog sm:shadow-pop',
          SIZE[size],
          className,
        )}
        {...props}
      >
        <div data-slot="popout-layout">{children}</div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function CloseButton() {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Close data-slot="popout-close" render={<Button variant="round" />}>
      <XIcon aria-hidden="true" />
      <span className="sr-only">{t('action.close')}</span>
    </DialogPrimitive.Close>
  );
}

/** The flow's title pair and its steps as an ordered list of pills; the reached ones go back. */
function PopOutSteps({
  title,
  subtitle,
  steps,
  current,
  reached,
  onStep,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly steps: readonly string[];
  /** 0-based. */
  readonly current: number;
  /** The furthest step answered so far, 0-based: every step up to it can be gone back to. */
  readonly reached: number;
  readonly onStep: (index: number) => void;
}) {
  const { t } = useTranslation();
  const row =
    'group flex min-h-11.5 w-full items-center gap-3 rounded-full ps-1.5 pe-3.5 text-start text-base font-light aria-[current=step]:bg-press aria-[current=step]:font-semibold aria-[current=step]:text-on-press';
  return (
    <section data-slot="popout-steps" className="flex-col gap-6 border-e-2 border-border px-6 pt-10 pb-7">
      <DialogPrimitive.Title render={<TitlePair as="h2" size="steps" title={title} subtitle={subtitle} />} />
      <ol aria-label={t('popout.steps')} className="flex flex-col gap-0.5">
        {steps.map((label, index) => {
          const content = (
            <>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-current text-sm font-medium group-aria-[current=step]:border-primary group-aria-[current=step]:bg-primary group-aria-[current=step]:text-primary-foreground"
              >
                {index + 1}
              </span>
              <span>{label}</span>
            </>
          );
          return (
            <li key={label}>
              {index <= reached && index !== current ? (
                <button
                  type="button"
                  className={cn(row, 'hover-fine:bg-accent')}
                  onClick={() => {
                    onStep(index);
                  }}
                >
                  {content}
                </button>
              ) : (
                <span className={row} aria-current={index === current ? 'step' : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The progress segments and "Step 3 of 7": the words carry it, the segments are decoration. */
function Progress({ current, total }: { readonly current: number; readonly total: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-sm font-semibold">{t('popout.stepOf', { current: current + 1, total })}</p>
      <div
        aria-hidden="true"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${String(total)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, index) => (
          <i
            key={index}
            className={cn(
              'h-2 rounded-full',
              index <= current ? 'bg-primary' : 'inset-ring-2 inset-ring-border',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** The question, the controls, and Back and Next at the body's inline end. */
function PopOutBody({
  title,
  subtitle,
  step,
  heading = 'dialog',
  footer,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly step?: { readonly current: number; readonly total: number };
  /** 'dialog': this title names the pop-out. A flow with PopOutSteps passes 'question'. */
  readonly heading?: 'dialog' | 'question';
  readonly footer?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  const question = <TitlePair as="h2" size="question" title={title} subtitle={subtitle} />;
  return (
    <section data-slot="popout-body" className="@container/popout-body flex min-h-0 flex-col">
      <header className="flex items-start gap-3 px-6 pt-6 sm:px-8 sm:pt-8">
        {step === undefined ? (
          <span className="flex-1" />
        ) : (
          <Progress current={step.current} total={step.total} />
        )}
        <CloseButton />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-6 sm:px-8">
        {heading === 'dialog' ? <DialogPrimitive.Title render={question} /> : question}
        <div className="mt-6">{children}</div>
      </div>
      {footer === undefined ? null : (
        <footer
          data-slot="popout-actions"
          className="flex flex-wrap justify-end gap-2.5 border-t-2 border-border px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:px-8 [&>*]:min-w-37.5"
        >
          {footer}
        </footer>
      )}
    </section>
  );
}

/** The live preview: an ink sheet inset 12px, with the round × in its corner when there is room for it. */
function PopOutPreview({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <aside
      data-slot="popout-preview"
      data-sheet="night"
      className="m-3 flex flex-col gap-4 rounded-preview p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <TitlePair as="h3" size="steps" title={title} subtitle={subtitle} />
        <CloseButton />
      </div>
      {children}
    </aside>
  );
}

export { PopOut, PopOutBody, PopOutContent, PopOutPreview, PopOutSteps };
