import { CircleHelp, CreditCard } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BankMark, BrandMark, NeutralMark } from '@/components/brand-mark';
import { Segmented } from '@/components/segmented';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
// Data comes only through loadCatalog(): a static import of the tables would
// put every card company's and bank's rates in the main chunk.
import { loadCatalog } from '@/data/card-catalog';
import { clubsOf, issuersAt, resolveCard, tiersOf, type ResolvedCard } from '@/data/card-catalog/resolve';
import type { Catalog, CatalogBank, CatalogIssuer } from '@/data/card-catalog/types';
import type { CardCatalogLink } from '@/types/domain';

type Link = Omit<CardCatalogLink, 'version' | 'updatedOn' | 'filled'>;

/** What the person has picked so far; a link exists once there is a bank, a company and a type. */
type Selection = {
  readonly bank?: string; // a Masav code, 'none', or UNLISTED
  readonly issuer?: string; // an issuer id, or UNLISTED
  readonly tier?: string;
  readonly club?: string;
};

const UNLISTED = 'unlisted';
const NO_BANK = 'none';
const NO_CLUB = 'none';

type Step = 'bank' | 'issuer' | 'tier' | 'club';

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly catalog: Catalog };

/** What an existing card says about itself in its own fields. */
export type StoredCard = {
  readonly kind: string;
  readonly issuer: string;
  readonly bank: string;
  readonly tier: string;
  readonly club: string;
};

/** Whether a complete selection is exactly this link. */
function sameLink(s: Selection, l: Link): boolean {
  return s.bank === l.bank && s.issuer === l.issuer && s.tier === l.tier && s.club === l.club;
}

const same = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The catalog bank a typed bank name or code stands for, among those that issue `issuer`. */
function bankOf(catalog: Catalog, issuer: string, text: string): CatalogBank | undefined {
  if (text.trim() === '') return undefined;
  return catalog.banks.find(
    (b) =>
      b.issuers.some((i) => i === issuer) &&
      (same(b.id, text) || same(b.name.en, text) || same(b.name.he, text)),
  );
}

/**
 * "Who issues this card": the bank, then the card company, then the type and
 * club. Choosing a type links the card; `onLink` is given the link, what it
 * resolves to, and whether the rates the person entered stay.
 *
 * A card that is already linked and has rates of its own is asked first
 * ("Keep the rates you entered?"); nothing changes until it is answered.
 * A card that was never linked but looks like a catalog entry gets an offer,
 * and nothing changes until the person takes it.
 */
export function IssuerChooser({
  value,
  hasOverrides,
  stored,
  onLink,
  onUnlink,
}: {
  readonly value: CardCatalogLink | undefined;
  /** Whether the person has set rates of their own over the catalog's. */
  readonly hasOverrides: boolean;
  readonly stored: StoredCard;
  readonly onLink: (link: Link, resolved: ResolvedCard, keepOverrides: boolean) => void;
  readonly onUnlink: () => void;
}) {
  const { t, i18n } = useTranslation('cards');
  const lang = i18n.language.startsWith('he') ? 'he' : 'en';
  const ids = { bank: useId(), issuer: useId(), tier: useId(), club: useId() };

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (catalog) => {
        if (live) setLoaded({ status: 'ready', catalog });
      },
      () => {
        if (live) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // undefined: following the card's own link.
  const [picked, setPicked] = useState<Selection | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const box = useRef<HTMLFieldSetElement>(null);
  const focusNext = useRef<Step | undefined>(undefined);
  // After a render that follows a deliberate move, put focus where the person's attention is.
  useEffect(() => {
    const step = focusNext.current;
    if (step === undefined) return;
    focusNext.current = undefined;
    const radios = box.current?.querySelectorAll<HTMLElement>(`[data-step="${step}"] [role="radio"]`);
    const target = Array.from(radios ?? []).find((r) => r.tabIndex === 0) ?? radios?.[0];
    target?.focus();
  });
  const [asking, setAsking] = useState<{ link: Link; resolved: ResolvedCard; from: Step } | undefined>(
    undefined,
  );

  const legend = <legend className="text-sm font-semibold">{t('catalog.title')}</legend>;
  if (loaded.status === 'loading') {
    return (
      <fieldset className="space-y-3">
        {legend}
        <p role="status" className="text-sm text-muted-foreground">
          {t('catalog.loading')}
        </p>
      </fieldset>
    );
  }
  if (loaded.status === 'failed') {
    return (
      <fieldset className="space-y-3">
        {legend}
        <p role="status" className="text-sm text-muted-foreground">
          {t('catalog.loadFailed')}
        </p>
      </fieldset>
    );
  }

  const { catalog } = loaded;
  const current: Selection =
    picked ??
    (value === undefined
      ? {}
      : {
          bank: value.bank,
          issuer: value.issuer,
          tier: value.tier,
          ...(value.club === undefined ? {} : { club: value.club }),
        });
  const issuer: CatalogIssuer | undefined = catalog.issuers.find((i) => i.id === current.issuer);
  const bankName = (b: CatalogBank): string => b.name[lang];

  /** Commit a selection: link when it is complete and known, otherwise just show it. */
  const choose = (next: Selection, from: Step): void => {
    // Segmented fires on every click and arrow key, the current option included.
    if (value !== undefined && sameLink(next, value)) {
      setPicked(undefined);
      return;
    }
    setPicked(next);
    if (next.bank === UNLISTED || next.issuer === UNLISTED) {
      onUnlink();
      return;
    }
    if (next.bank === undefined || next.issuer === undefined || next.tier === undefined) return;
    const link: Link = {
      issuer: next.issuer,
      bank: next.bank,
      tier: next.tier,
      ...(next.club === undefined ? {} : { club: next.club }),
    };
    const resolved = resolveCard(catalog, link);
    if (resolved === undefined) return;
    if (value !== undefined && hasOverrides) {
      setAsking({ link, resolved, from });
      return;
    }
    setPicked(undefined);
    focusNext.current = from;
    onLink(link, resolved, true);
  };

  const answer = (keepOverrides: boolean): void => {
    if (asking !== undefined) {
      onLink(asking.link, asking.resolved, keepOverrides);
      focusNext.current = asking.from;
    }
    setAsking(undefined);
    setPicked(undefined);
  };

  const pickBank = (bank: string): void => {
    if (bank === UNLISTED) {
      choose({ bank }, 'bank');
      return;
    }
    const offered = issuersAt(catalog, bank).some((i) => i.id === current.issuer);
    choose(
      offered && current.issuer !== undefined && current.issuer !== UNLISTED
        ? {
            bank,
            issuer: current.issuer,
            ...(current.tier === undefined ? {} : { tier: current.tier }),
            ...(current.club === undefined ? {} : { club: current.club }),
          }
        : { bank },
      'bank',
    );
  };

  // An existing card whose own fields name a catalog entry.
  const suggestion = (():
    { bank: CatalogBank; issuer: CatalogIssuer; tier?: string; club?: string } | undefined => {
    if (value !== undefined || picked !== undefined || dismissed) return undefined;
    if (stored.kind !== 'bank') return undefined; // otherwise the bank is the debit account's
    const company = catalog.issuers.find((i) => i.id === stored.issuer);
    const bank = company === undefined ? undefined : bankOf(catalog, company.id, stored.bank);
    if (company === undefined || bank === undefined) return undefined;
    const tier = tiersOf(company).find(
      (x) => same(x.id, stored.tier) || same(x.name.en, stored.tier) || same(x.name.he, stored.tier),
    );
    const club = clubsOf(company).find((c) => same(c.id, stored.club) || same(c.name, stored.club));
    return { bank, issuer: company, ...(tier ? { tier: tier.id } : {}), ...(club ? { club: club.id } : {}) };
  })();

  const link = (): void => {
    if (suggestion === undefined) return;
    const only = tiersOf(suggestion.issuer);
    const tier = suggestion.tier ?? (only.length === 1 ? only[0]?.id : undefined);
    const next: Selection = {
      bank: suggestion.bank.id,
      issuer: suggestion.issuer.id,
      ...(tier === undefined ? {} : { tier }),
      ...(suggestion.club === undefined ? {} : { club: suggestion.club }),
    };
    // With no type to name, the person is taken to that step to pick it.
    if (tier === undefined) focusNext.current = 'tier';
    choose(next, 'tier');
  };

  const bankOptions = [
    { value: NO_BANK, label: t('catalog.noBank'), icon: <NeutralMark icon={CreditCard} /> },
    ...catalog.banks.map((b) => ({ value: b.id, label: bankName(b), icon: <BankMark code={b.id} /> })),
    { value: UNLISTED, label: t('catalog.notListed'), icon: <NeutralMark icon={CircleHelp} /> },
  ];
  const companies =
    current.bank === undefined || current.bank === UNLISTED ? undefined : issuersAt(catalog, current.bank);
  const clubs = issuer === undefined ? [] : clubsOf(issuer);

  return (
    <fieldset ref={box} className="space-y-3">
      {legend}

      {suggestion === undefined ? null : (
        <div className="space-y-2 rounded-lg bg-accent p-3">
          <p className="text-sm">
            {t('catalog.suggest', {
              issuer: suggestion.issuer.name[lang],
              bank: bankName(suggestion.bank),
            })}
          </p>
          <div className="flex gap-2">
            <Button type="button" className="h-11 flex-1" onClick={link}>
              {t('catalog.link')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={() => {
                focusNext.current = 'bank';
                setDismissed(true);
              }}
            >
              {t('catalog.notNow')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5" data-step="bank">
        <Label id={ids.bank}>{t('catalog.bank')}</Label>
        <Segmented<string>
          value={current.bank ?? ''}
          labelledBy={ids.bank}
          onChange={pickBank}
          options={bankOptions}
          className="grid grid-cols-3 sm:grid-cols-4"
        />
      </div>

      {picked === undefined || picked.bank === UNLISTED || picked.issuer === UNLISTED ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {t('catalog.pending')}
        </p>
      )}

      {companies === undefined ? null : (
        <div className="space-y-1.5" data-step="issuer">
          <Label id={ids.issuer}>{t('catalog.issuer')}</Label>
          <Segmented<string>
            value={current.issuer ?? ''}
            labelledBy={ids.issuer}
            onChange={(id) => {
              if (current.bank !== undefined) choose({ bank: current.bank, issuer: id }, 'issuer');
            }}
            options={[
              ...companies.map((i) => ({
                value: i.id,
                label: i.name[lang],
                icon: <BrandMark brand={`issuer-${i.id}`} />,
              })),
              { value: UNLISTED, label: t('catalog.notListed'), icon: <NeutralMark icon={CircleHelp} /> },
            ]}
            className="grid grid-cols-3"
          />
        </div>
      )}

      {issuer === undefined ? null : (
        <div className="space-y-1.5" data-step="tier">
          <Label id={ids.tier}>{t('catalog.tier')}</Label>
          <Segmented<string>
            value={current.tier ?? ''}
            labelledBy={ids.tier}
            onChange={(tier) => {
              choose({ ...current, tier }, 'tier');
            }}
            options={tiersOf(issuer).map((x) => ({ value: x.id, label: x.name[lang] }))}
          />
        </div>
      )}

      {issuer === undefined || current.tier === undefined || clubs.length === 0 ? null : (
        <div className="space-y-1.5" data-step="club">
          <Label id={ids.club}>{t('catalog.club')}</Label>
          <Segmented<string>
            value={current.club ?? NO_CLUB}
            labelledBy={ids.club}
            onChange={(club) => {
              const { club: _was, ...rest } = current;
              choose(club === NO_CLUB ? rest : { ...rest, club }, 'club');
            }}
            options={[
              { value: NO_CLUB, label: t('catalog.noClub') },
              ...clubs.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      )}

      <AlertDialog
        open={asking !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            if (asking !== undefined) focusNext.current = asking.from;
            setAsking(undefined);
            setPicked(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('catalog.keepTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                answer(false);
              }}
            >
              {t('catalog.useNew')}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                answer(true);
              }}
            >
              {t('catalog.keepMine')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}
