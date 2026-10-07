# Brief: per-issuer card catalog research

Bookandry is a budgeting app for Israeli households. It will ship a **catalog of the exact settings of every Israeli credit card issuer and bank**, so a user who picks "Max, through Leumi" for a card gets that card's real rules and rates, already filled in. The owner wants every detail, and wants the data as accurate as possible.

Background, already researched (read it first, and don't repeat it): `docs/research/2026-10-08-israeli-credit-card-interest.md`. Key points from it:

- ריבית מתואמת = (1 + nominal/12)^12 − 1.
- קרדיט פלוס is Max's 19–36-payment קרדיט.
- Revolving credit is a separate product.
- Prime is 4.75% as of 2026-10-08.

## Method

- Prefer primary sources: the issuer's or bank's own תעריפון (fee schedule), its cardholder agreement (תנאי הצטרפות / הסכם כרטיס), its product pages, and its "שיעורי ריבית" pages. Use Bank of Israel documents too.
- Many sites block plain HTTP fetches. Use a real browser (Playwright) when needed, and download and read the PDFs.
- Tag every claim **[primary]** or **[secondary]**, cite its URL, and give the date you saw it.
- Mark anything you could not confirm **UNCONFIRMED**. Never guess numbers.
- Rates are often personal ("up to", "בהתאם לסיכון הלקוח"). Record the **published** figures as published: maximum, typical, or range. Say which kind each one is.
- Record the nominal rate, the מתואמת rate, and the prime basis exactly as each source shows them. Check each pair against the formula above, and note any pair that doesn't match it.

## What to record, per issuer (and per card family where they differ)

1. **Identity.** Record the issuer's legal name and its brands (e.g. Diners under Cal). Then cover:
   - Which banks distribute its cards: bank-issued cards versus non-bank cards (כרטיס חוץ בנקאי).
   - Its co-branded and club cards (כרטיסי מועדון), and whether their credit terms differ.
2. **Billing.**
   - The billing dates on offer.
   - The cut-off rule: when a purchase falls into a billing cycle.
   - Whether the issuer, or the bank, decides the billing date for bank-issued cards.
3. **Foreign purchases.**
   - The conversion fee (עמלת המרה / עמלת עסקה במט"ח), as a %.
   - Which exchange rate is used (representative rate, card rate).
   - When the conversion happens: at the transaction date or at billing.
   - Any fee on shekel purchases from foreign websites.
4. **Deal types.** Cover each of the following, with its rules: the minimum deal amount, the minimum payment, the number of payments, when the first payment falls, and how the deal appears on the statement or in the export (the exact label).
   - רגילה
   - תשלומים, including the CPI- and dollar-linked variants
   - קרדיט (3–18)
   - Long credit (19–36+): its name, and whether the rate is adjusted mid-deal (when, and by what rule)
   - דחוי / +30 / "חיוב נדחה"
   - "Spreading" an existing purchase after the fact (פריסת עסקה / "תשלומים אחרי"): its name, its rate, and its limits
   - Any other plan the issuer offers
5. **Interest on קרדיט.** For each relevant rate, give:
   - its basis: fixed, or prime ± margin;
   - the published figure, both nominal and מתואמת;
   - whether it is fixed at purchase;
   - when interest starts accruing (from the purchase, or from the first billing date);
   - the repayment method (שפיצר?);
   - how the first payment is computed.
6. **Revolving credit.**
   - The product names (old and current).
   - How you join it, and whether it is a separate card.
   - The minimum monthly payment rule, exactly: % of balance or % of limit, and the minimum in ₪.
   - Which balance interest is charged on, and whether there is a grace period.
   - The day count and the compounding period (m).
   - The published rate.
   - Whether you can pay more than the minimum, and how.
   - How it appears on the statement (e.g. "סל מצטבר").
7. **Other rates.** For each of the following, give the rate, its basis and its m:
   - late payment (ריבית פיגורים)
   - going over the limit (חריגה)
   - cash withdrawal, in Israel and abroad: both the interest and the fees
   - the loans the issuer offers on the card (הלוואה), with their rate range
8. **Fees that affect a budget.**
   - The card fee (דמי כרטיס) and how it is waived.
   - The fee for a paper statement.
   - Fees for changing the billing date or the deal type.
9. **Exports.**
   - What the issuer's own Excel/CSV download contains: the column names, how installments are shown ("תשלום 3 מתוך 12"), and whether interest appears per installment.
   - If you can find a real sample or its documented layout, record it.
10. **Changes and dates.**
    - When each figure was published.
    - Any announced change.
    - How changes are notified.

## Output

Write `docs/research/issuers/<slug>.md` and nothing else. Do not edit other files, do not commit, and do not dispatch subagents.

Open the file with a **summary table**: one row per rate or rule, with the columns _value, basis, kind (max / typical / range), as-of date, source tag_. Put the detail sections after it, following the numbering above. End with a section headed **UNCONFIRMED / gaps**.
