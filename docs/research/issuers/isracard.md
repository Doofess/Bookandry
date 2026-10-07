# Isracard (including American Express Israel): card catalog research

Seen: 2026-10-08 for every source below, unless a row says otherwise. Prime is 4.75% and the Bank of Israel rate is 3.25% (from 3.9.2026), as in the background note.

Tags: **[primary]** is Isracard's, Amex Israel's or a bank's own page, contract, fee schedule (תעריפון) or disclosure. **[secondary]** is open-source code or another third party. **UNCONFIRMED** means no primary source here establishes it.

Sources used most (all seen 2026-10-08):

- **AG25**: Isracard cardholder agreement, _הסכם כרטיס חיוב_, version 11/2025, catalog no. 16-95-01072 (current link on Isracard's contracts page). [primary] <https://digital.isracard.co.il/link/c144296f498b49ffbe3fbcbeb72fc0eb.aspx>
- **AG22**: the same agreement, version 01/2022, which is still linked from Isracard's fair-credit page. [primary] <https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx>. Section numbers are the same in both versions unless noted.
- **T-ISR**: Isracard non-bank fee schedule, "בתוקף החל מ-יוני 2026", version 06/2026. [primary] <https://digital.isracard.co.il/globalassets/taarifon_2026.pdf>
- **T-AMEX**: Premium Express (Amex) non-bank fee schedule, from 1.7.2026. [primary] <https://he.americanexpress.co.il/globalassets/pdf/taarifonhatsavjan26.pdf>
- **MIZ**: Mizrahi-Tefahot, _שיעורי ריבית באשראי_, dated 2.9.2026, effective 3.9.2026, Isracard table. [primary] <https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/>
- **FAIR**: Isracard, _מידע אודות ריבית פיגורים / אשראי הוגן_. [primary] <https://digital.isracard.co.il/pages/Credit/>
- **ISCH**: Isracard iSchool (staff training site), _אפשרויות תשלום_. It is undated. [primary, undated] <https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html>
- **REV**: Isracard, _אשראי מתגלגל_ (with FAQ answers expanded). [primary] <https://www.isracard.co.il/credit-solutions/fixed-monthly-payment/private>. Amex has the same page: <https://www.americanexpress.co.il/credit-solutions/fixed-monthly-payment>
- **AMEXPDF**: Amex, _הסבר על שיטת הקרדיט_. It is undated and old: it names Bank Igud, Klali and HaSapanut. [primary, undated] <https://he.americanexpress.co.il/globalassets/PDF/credit-explan.pdf>
- **GUIDE**: Isracard, _כל מה שרציתם לדעת על כרטיס חוץ בנקאי_, leaflet 11-95-020-05, 2/2023. [primary] <https://digital.isracard.co.il/link/c43f8e7f48d645bdbf118b085396a4ac.aspx>

---

## Summary table

| Rate or rule                                                                                   | Value                                                                                                                                                                 | Basis                            | Kind                    | As-of                        | Source                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------- | ---------------------------- | --------------------------------------------------------- |
| Domestic billing dates                                                                         | 2, 10, 15 or 20 of the month                                                                                                                                          | customer's choice                | list                    | undated                      | [primary] ISCH                                            |
| Cut-off for a billing cycle                                                                    | Purchases **captured** from the last billing date up to the day before the next one                                                                                   | capture date, not purchase date  | rule                    | 2/2023; 11/2025              | [primary] GUIDE; AG25 §8.1                                |
| Foreign purchases: when charged                                                                | Next business day after capture. Premium and some club cards are charged monthly instead.                                                                             | —                                | rule                    | 06/2026                      | [primary] T-ISR part 2(ו); AG25 §8.5; ISCH                |
| FX conversion rate                                                                             | Bank of Israel representative rate on the **capture** day. A currency with no representative rate goes via USD at the network's rate.                                 | —                                | rule                    | 06/2026                      | [primary] T-ISR part 2. **Conflicts** with AG25 (see §3). |
| FX fee, Isracard non-bank                                                                      | **2.9%**                                                                                                                                                              | % of the charged amount          | fixed                   | 1.1.2025 and 06/2026         | [primary] T-ISR                                           |
| FX fee, Isracard cards via Hapoalim                                                            | **2.90%**                                                                                                                                                             | %                                | fixed                   | as of 1.10.2026              | [primary] Hapoalim tariff p.8                             |
| FX fee, Isracard cards via Mizrahi / FIBI group / Massad / Yahav                               | **2.7%**                                                                                                                                                              | %                                | fixed                   | 2019–2025 schedules          | [primary] bank-specific Isracard schedules                |
| FX fee, One Zero (Isracard Mastercard)                                                         | **2%**                                                                                                                                                                | %                                | fixed                   | undated                      | [primary] One Zero schedule                               |
| FX fee, Amex (non-bank and all banks)                                                          | **2.5%**                                                                                                                                                              | %                                | fixed                   | 1.7.2026                     | [primary] T-AMEX and the bank Amex schedules              |
| FX cash withdrawal abroad                                                                      | **3.5%** (Hapoalim, non-Amex cards: 3.30%)                                                                                                                            | %                                | fixed                   | 06/2026                      | [primary] T-ISR; Hapoalim tariff                          |
| קרדיט בתשלומים קבועים: payments                                                                | 3–18 at ≥₪25 principal each (so a ₪75 minimum deal); "more than 19" at ≥₪50 principal each; up to 36 per Amex                                                         | —                                | range                   | 11/2025                      | [primary] AG25 §19.2.2.3; Amex calculator page            |
| קרדיט בתשלומים קבועים: rate type                                                               | **Fixed** for the deal's life: prime + risk margin, set on the day the slip is captured                                                                               | prime + margin                   | rule                    | 11/2025                      | [primary] AG25 §19.2.3.1                                  |
| קרדיט בתשלומים קבועים: interest                                                                | 30/360 on each deal's unpaid balance, whole months from the regular billing date. Spitzer (equal payments). First payment on the 2nd billing date after the purchase. | —                                | rule                    | 11/2025                      | [primary] AG25 §19.2.2–19.2.3; AMEXPDF                    |
| קרדיט בתשלומים קבועים rate, regular Isracard / Mastercard / Amex Blue / Amex קרדיט via Mizrahi | **15.25% nominal / 16.36% מתואמת** (prime + 10.50)                                                                                                                    | prime + margin                   | published per card type | 3.9.2026                     | [primary] MIZ                                             |
| ישראקרדיט / אמק"ס קרדיט (pooled, variable) rate, regular card via Mizrahi                      | **14.15% / 15.10%** (prime + 9.40)                                                                                                                                    | prime + margin, variable         | published per card type | 3.9.2026                     | [primary] MIZ                                             |
| ישראקרדיט repayment                                                                            | default 5% of principal, at least ₪100 a month; or a fixed amount ≥ ₪200                                                                                              | —                                | rule                    | 11/2025                      | [primary] AG25 §19.1.2                                    |
| ישראקרדיט interest                                                                             | daily, actual/365(366), from the regular billing date; **charged quarterly**, on the 1st business day of each calendar quarter                                        | —                                | rule                    | 11/2025                      | [primary] AG25 §19.1.4.3                                  |
| אשראי מתגלגל (revolving; called "החזר חודשי קבוע" in AG22) minimum payment                     | **the greater of 3% of the pool and ₪500**. Non-bank cards only.                                                                                                      | —                                | rule                    | 11/2025; web page            | [primary] AG25 §19.4.2; REV                               |
| אשראי מתגלגל interest                                                                          | prime + margin, variable; daily, actual/365(366); charged **monthly** inside the fixed payment, interest first                                                        | —                                | rule                    | 11/2025                      | [primary] AG25 §19.4.9                                    |
| אשראי מהיר (card loan) rate, regular card via Mizrahi                                          | **16.25% / 17.52%** (prime + 11.50)                                                                                                                                   | fixed at request; prime + margin | published               | 3.9.2026                     | [primary] MIZ; AG25 §19.3.4                               |
| Non-bank loan (הלוואה לכל מטרה, Isracard Mimun)                                                | **prime + 1% to prime + 11.9%** (5.75%–16.65% today), variable, 18–100 months. Worked example: P+5 = 9.75% / 10.20%.                                                  | prime + margin                   | range                   | 10/2026                      | [primary] Isracard non-bank-loan page                     |
| Late interest (ריבית פיגורים)                                                                  | **BOI rate + 16.40%**, actual days, **added to principal once a quarter**. Today 19.65% nominal / 21.15% מתואמת (m=4).                                                | BOI rate + margin                | fixed formula           | page stale (shows BOI 4.50%) | [primary] FAIR. AG25's definition differs (see §7).       |
| Over-limit                                                                                     | Excess charged immediately; the issuer may charge "ריבית בשיעור המירבי" until it is charged                                                                           | max lawful rate                  | rule                    | 11/2025                      | [primary] AG25 §18.12, §18.17                             |
| Card fee, Isracard local / international / gold (non-bank)                                     | ₪17.90/month. ₪15.30 at ₪5,000 monthly spend; free at ₪7,500.                                                                                                         | —                                | list price              | 06/2026                      | [primary] T-ISR                                           |
| Card fee waiver, Isracard cards via Hapoalim                                                   | 20% off at ₪5,000; 100% at ₪8,000 (Isracard) or ₪10,000 (Mastercard / Visa)                                                                                           | —                                | rule                    | from 1.11.2025               | [primary] Hapoalim notice                                 |
| Billing-date change                                                                            | **No fee**; at most once per 90 days; takes effect from the next billing date                                                                                         | —                                | rule                    | undated; 11/2025             | [primary] ISCH; AG25 §8.9                                 |
| Early or immediate repayment of deals (on request)                                             | ₪29.90 through a clerk / ₪15.90 direct                                                                                                                                | —                                | fixed                   | 06/2026                      | [primary] T-ISR                                           |
| Early repayment of credit                                                                      | ₪60 through a clerk / ₪30 direct (Isracard Mimun loans: ₪59.90)                                                                                                       | —                                | fixed                   | 06/2026; 1.1.2025            | [primary] T-ISR; Isracard Mimun schedule                  |
| Paper statement                                                                                | No monthly statement fee appears in T-ISR. Emailed statements are free.                                                                                               | —                                | —                       | 06/2026                      | [primary] T-ISR; Isracard "הודעות חיוב במייל"             |
| Change notices                                                                                 | 30 days' notice for contract changes and for billing-date or billing-method changes; notice may be published in two daily newspapers                                  | —                                | rule                    | AG22 §32, §8.7, §34.3        | [primary]                                                 |

---

## 1. Identity

### Legal entities and brands

- **Isracard group** = _ישראכרט בע"מ, ישראכרט מימון בע"מ, פרמיום אקספרס בע"מ_ (AG25 §1, definition of "קבוצת ישראכרט"). [primary]
  - **ישראכרט בע"מ** issues the Isracard, Mastercard and Visa cards. AG25 §1, "הארגונים הבינלאומיים": "לעניין ישראכרט בע"מ כמנפיקות - קבוצת מסטרקארד ... וקבוצת ויזה". [primary]
  - **פרימיום אקספרס בע"מ** issues **American Express** cards in Israel: "לעניין פרימיום אקספרס בע"מ כמנפיקה - קבוצת אמריקן אקספרס אינטרנשיונל" (AG25 §1). T-AMEX is headed "פרימיום אקספרס בע"מ - למחזיקי כרטיסי אמריקן אקספרס". [primary]
  - **ישראכרט מימון בע"מ** (ח"פ 513497628) is the **lender** for non-bank cards and loans: "בהלוואות לכל מטרה, הלוואות רכב, ובכרטיסים חוץ בנקאים האשראי מועמד לך ע"י קבוצת ישראכרט מימון בע"מ" (FAIR). [primary]
- **Brand families seen on Isracard's own sites:**
  - Isracard (domestic-only "ישראכרט" card), Mastercard, Visa.
  - Isracard Direct / ISRACASH (immediate debit).
  - MORE (a revolving card).
  - cashback+.
  - World Elite Mastercard (formerly Signia).
  - **American Express**: כחול, קרדיט, ירוק/Classic/Business, זהב, Gold+, Platinum, Centurion, FLYCARD Premium Amex, CashBack Premium.
  - [primary] T-ISR; T-AMEX
- **Ownership: UNCONFIRMED.** I did not verify Isracard's current controlling shareholder. AG25 still ties two definitions to **Bank Hapoalim**: the conversion rate and late interest (see §3, §7).

### Banks that distribute Isracard / Amex cards ("bank cards"), and who sets the credit rates

Isracard's fee-schedule page lists a separate Isracard schedule per bank, and Amex's page does the same for Amex. [primary] <https://marketing.isracard.co.il/pages/taarifon/>; <https://marketing.americanexpress.co.il/pages-amex/taarifon>

| Bank                                                      | Isracard / Mastercard / Visa                                                                                                                                                                                       | Amex                                                                                    | Evidence                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bank Hapoalim**                                         | Yes ("כרטיס אשראי שמתופעל על ידי ... ישראכרט")                                                                                                                                                                     | Yes ("המונפקים על ידי פרימיום אקספרס בע"מ שמסגרת הכרטיס בהם מועמדת על ידי בנק הפועלים") | [primary] Hapoalim tariff (as of 1.10.2026) <https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/united_23926.pdf>; Amex Hapoalim schedule 1.7.2026 <https://he.americanexpress.co.il/globalassets/pdf/taarifonpoalimjan26.pdf> |
| **Mizrahi-Tefahot** (incl. ex-Bank Igud)                  | Yes ("המונפקים ע"י ישראכרט בע"מ שמסגרת האשראי והריבית בכרטיס מועמדת על ידי בנק מזרחי טפחות")                                                                                                                       | Yes ("מועמדת על ידי בנק מזרחי טפחות בע"מ או בנק אגוד")                                  | [primary] <https://digital.isracard.co.il/globalassets/taarifon_files/2025/mizrachi25more.pdf>; <https://he.americanexpress.co.il/globalassets/pdf/taarifonmizrahijannew26.pdf>                                                                    |
| **FIBI group**: FIBI, PAGI, Otsar Hahayal, U-Bank, Massad | Yes ("המונפקים ע"י הבנק הבינלאומי ... בהנפקה משותפת עם ישראכרט"; Massad the same)                                                                                                                                  | Yes ("מועמדת על ידי הבנק הבינלאומי, בנק פאג"י, בנק מסד, בנק אוצר החייל, יובנק")         | [primary] <https://digital.isracard.co.il/globalassets/isracard/pdf/beinleumi25.pdf>; <https://digital.isracard.co.il/globalassets/isracard/pdf/masad25.pdf>; <https://he.americanexpress.co.il/globalassets/pdf/taarifonbenleumijan26.pdf>        |
| **Bank Yahav**                                            | Mastercard "המונפקים על ידי בנק יהב ... בהנפקה משותפת עם ישראכרט"                                                                                                                                                  | Yes                                                                                     | [primary] <https://digital.isracard.co.il/globalassets/isracard/pdf/forms/yahav.pdf>; <https://he.americanexpress.co.il/globalassets/pdf/taarifonyahavaprilnew26.pdf>                                                                              |
| **One Zero**                                              | Mastercard "המונפקים ע"י ישראכרט ... אשר מסגרת האשראי והריבית בכרטיסים מועמדת על ידי וואן זירו"                                                                                                                    | not listed                                                                              | [primary] <https://digital.isracard.co.il/link/9d9148461e9e439c88a5531bbe19d00f.aspx>                                                                                                                                                              |
| **Postal Bank** (Doar Finance)                            | Direct (debit) card only                                                                                                                                                                                           | —                                                                                       | [primary] <https://digital.isracard.co.il/globalassets/isracard/pdf/forms/taarifon_doar_1_1_26.pdf>                                                                                                                                                |
| **Bank Leumi**                                            | Isracard's fee page links to Leumi's tariff. Leumi's card chapter refers to "כרטיסים המתופעלים על ידי החברות כ.א.ל וישראכרט" and lists FLYCARD types. **UNCONFIRMED** which Isracard card types Leumi distributes. | not seen                                                                                | [primary] <https://www.bankleumi.co.il/Commissions/business/subchapters/6>                                                                                                                                                                         |
| Discount, Mercantile, Jerusalem                           | Not listed by Isracard. **UNCONFIRMED** that they offer no Isracard cards.                                                                                                                                         | —                                                                                       | —                                                                                                                                                                                                                                                  |

**Who sets the credit rates on bank cards: the bank, not Isracard.**

- The bank-specific schedules say so in their titles: "שמסגרת האשראי **והריבית** בכרטיס מועמדת על ידי בנק מזרחי טפחות" (Mizrahi); the same for One Zero. [primary]
- AMEXPDF: the קרדיט rate "יקבע לכל עסקה ועסקה על פי שעור הריבית שיהיה נהוג לאשראי זה, **בבנק מעמיד מסגרת האשראי**". For Amex קרדיט: "בגין האשראי יחייב אותך הבנק בריבית, כפי שתקבע על ידו". [primary, undated]
- The footer of Isracard's pages: "בכרטיסים חוץ בנקאים האשראי מועמד לך ע"י קבוצת ישראכרט מימון בע"מ **ובכרטיסים בנקאיים ע"י הבנק בו מתנהל חשבונך**". [primary] <https://digital.isracard.co.il/Abroad/lobby/after/payments/>
- The limit: "המסגרת נקבעת על ידי הגורם המנפיק (סניף הבנק בכרטיסים הבנקאיים וישראכרט בכרטיסים חוץ בנקאיים)". [primary] ISCH
- Hence MIZ is **Mizrahi's** price list for Isracard cards, not Isracard's own. **UNCONFIRMED**: the rates for the same card types at Hapoalim, FIBI, Yahav or One Zero. None of those banks' card-rate pages were found.
- For **non-bank cards**, the rate is personal. Isracard publishes no rate table. It appears "בבקשה לקבלת כרטיס חיוב ולאחר מכן בדף ריכוז החיובים" (AG25 §19.1.4.1, §19.2.3.1, §19.4.9.1). [primary]

### Co-branded and club cards (כרטיסי מועדון)

Isracard's card lobby lists 41 cards, 21 of them club cards. [primary] <https://www.isracard.co.il/lobby-credit-cards/private> Examples:

- **FLY CARD (El Al)** by Isracard: FLY CARD, Premium, Premium Select. Also Amex FLYCARD Premium.
  - Card fees: ₪19.90 / ₪38.90 / ₪27.90; Amex ₪40.
  - FX fee: 2.5% / 1.8% / 2.2% "במקום 2.9%" on non-bank cards; Amex 50% off.
  - "ניתן יהיה להנפיק כרטיסים בנקאיים מסוג FLY CARD של ישראכרט. כרטיסי אמריקן אקספרס בנקאיים זמינים כבר עכשיו".
  - [primary] <https://www.isracard.co.il/flycard/private>; T-ISR. The Amex FlyCard page: <https://www.americanexpress.co.il/credit-cards/flycard>
- **SuperFly** (Rami Levy group; Israir accrual):
  - FX fee 2.2% (classic) / 1.5% (premium);
  - card fee ₪17.90 / ₪24.90;
  - "חיובי חו"ל במועד חיוב הכרטיס" on the premium card.
  - [primary] <https://www.isracard.co.il/credit-cards/superfly>
- **חבר (Hever)**:
  - 1% FX fee;
  - "פטור קבוע מדמי כרטיס";
  - "דחיית חיובים בעסקאות בחו"ל - חיוב אחת לחודש, במועד חיוב הכרטיס".
  - [primary] <https://www.isracard.co.il/credit-cards/chever>
- **מועדון הוט**:
  - no card fee; 1% FX fee;
  - cards are "מקבוצת ישראכרט (ויזה / מאסטר קארד / אמריקן אקספרס)".
  - [primary] <https://www.isracard.co.il/credit-cards/moadonhot>
- **Others listed**: LifeStyle (Super-Pharm), ISRACARD TOP, Mehadrin / BASIC Mehadrin, Golanchik, the volunteers' club, Corporate. Also clubs named in MIZ: עו"ד (lawyers), עולמי עובדי הרשויות, מועדון חייל יותר, סופרקארד. [primary]

**Do club credit terms differ? Yes, by card type.**

- MIZ prices each Isracard/Amex card type separately. Some examples:
  - lawyers' club: 8.85% revolving, 9.75% קרדיט;
  - עובדי הרשויות: 12.35% / 13.55%;
  - World Elite: 7.75% / 7.95%;
  - Centurion: 6.25% / 6.45%;
  - LifeStyle קרדיט: 15.05% against 15.25% for a regular card.
  - [primary]
- The contract allows it: "על כרטיסים שונים או על לקוחות שונים יכול שייקבעו תנאים שונים של הסדרי אשראי, ובכלל זה שיעורי ריבית שונים" (AG25 §19.5.7). [primary]
- The clubs' own pages differ mainly in **fees** (card fee, FX fee, monthly vs immediate foreign billing), not in published credit rates.

---

## 2. Billing

- **Billing dates**: "לקוח יכול לבחור את מועד החיוב עבור רכישות בארץ מתוך ארבע אפשרויות: 2,10,15,20 לחודש". [primary, undated] ISCH. AG25 §8.1 says only "מבין המועדים המקובלים אצל המנפיקה". **UNCONFIRMED** that the list is still exactly these four.
- **Cut-off rule (capture-based)**:
  - "הלקוח יחויב באופן שוטף במועד זה בגין עסקאות שיבצע, ואשר **ייקלטו אצל המנפיקה** ... בתקופה שבין מועד חיוב אחד לבין מועד החיוב שלאחריו ... בלי להתחשב בתאריכים הרשומים על השוברים" (AG25 §8.1). [primary]
  - GUIDE (2/2023): "בגין עסקאות שנקלטו במחשבי קבוצת ישראכרט בין מועד החיוב החודשי האחרון לבין **יום לפני** מועד החיוב החודשי הבא". [primary]
  - **UNCONFIRMED**: the number of days between a purchase and its capture. iSchool says foreign deals are captured "בדר"כ בין 2-3 ימי עסקים".
- **Late capture**: a deal may be billed after its expected date "מסיבות שונות, כגון סיבות טכניות" (§8.3). [primary]
- **Domestic ATM cash** is charged "באופן שוטף ובסמוך לביצוע המשיכה" (§8.2). For non-bank cards this is within about 2 business days (ISCH). [primary]
- **One date per account**: the issuer may require all cards charged to the same account to share one billing date (§8.6). [primary]
- **Who sets the date on bank cards**:
  - The customer chooses from Isracard's list (§8.1, §8.9). The change can be made "באמצעים אוטומטיים ... באמצעות נציג שירות וסניף הבנק (בכרטיסים בנקאיים בלבד)" (ISCH). [primary]
  - So the bank is a channel; the set of dates is Isracard's.
  - **UNCONFIRMED** whether any bank restricts the dates for its Isracard cards.
- **Changing the date**:
  - "אינה כרוכה בעמלה", effective from the next billing date (ISCH). [primary]
  - The issuer may refuse a change made within 90 days of the previous one (§8.9). [primary]
  - Revolving-credit FAQ: change "עד יומיים לפני המועד". [primary] REV
  - Effect on קרדיט deals (two sources disagree):
    - AG25 §19.2.3.3: the interest already computed stays the same, "אף אם ישונה מועד תשלומם למועד החיוב שביקש הלקוח". This implies the installments move to the new date.
    - Amex's calculator FAQ: "תשלומי העסקה הנותרים ימשיכו לרדת ב-2 לחודש ושאר התשלומים יעברו למועד ה-10".
    - [primary, both] <https://marketing.americanexpress.co.il/pages-amex/credit-calculator/>
- **MORE card**: its "מועד חיוב MORE" is **20 days after** the regular billing date on the revolving track (AG25 §21.2). [primary]

---

## 3. Foreign purchases

- **When charged**:
  - Non-bank: "תחויבנה בחשבון באופן שוטף ביום העסקים הבא לאחר קליטת העסקאות אצל המנפיקה ... אלא אם נקבע לכרטיס במפורש הסדר אחר" (T-ISR part 2 ו; AG25 §8.5). [primary]
  - Listed exceptions billed monthly at the domestic date: "מסטרקארד פלטינה, WORLD ELITE, אמריקן אקספרס זהב ופלטינה, סנטוריון, כרטיסים המשויכים למועדון הוט או אשמורת". Corporate Mastercard: "שוטף+ (30,40,65)". [primary, undated] ISCH
  - Hever and SuperFly Premium also bill foreign charges monthly (their pages).
- **Exchange rate**:
  - **T-ISR (06/2026), T-AMEX and all the bank schedules**: "השער המתפרסם על ידי בנק ישראל כשער החליפין היציג ... כפי שידוע: (א) **במועד קליטת העסקה אצל המנפיקה** - לגבי עסקאות המדווחות ע"י הארגון הבינלאומי; (ב) במועד ביצוע העסקה - לגבי עסקאות שאינן מדווחות". A currency with no representative rate is converted to USD by the network, then to ILS at the USD representative rate. [primary]
  - Isracard's converter page agrees: "שער ההמרה ייקבע לפי השער היציג ביום קליטת הפעולה במערכות ישראכרט". [primary] <https://digital.isracard.co.il/Abroad/lobby/before/ExchangeRatesAbroad/>
  - **Conflict:** AG25 §1 defines "שער ההמרה" as "שער 'העברות המחאות מכירה', הנהוג **בבנק הפועלים**" (the same wording in AG22).
  - Treat the fee schedule and website (the representative rate) as current practice. **UNCONFIRMED** which one governs in a dispute.
- **When converted**: at capture, not at billing. For premium cards billed monthly the conversion is still at capture, per the definition. **UNCONFIRMED** for monthly-billed cards. [primary]
- **Conversion fee (עמלת עסקאות במטבע חוץ)**:
  - The fee is "מהסכום לחיוב החשבון", collected in the account's currency (T-ISR note 3). [primary]

  | Card                                                           | Fee                                                      | Source                                                                                       |
  | -------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
  | Isracard non-bank                                              | **2.9%** (1.1.2025 and 06/2026)                          | [primary] T-ISR; <https://digital.isracard.co.il/link/5224938544af4306bf0841758d02a6ce.aspx> |
  | Isracard via Hapoalim                                          | 2.90%                                                    | [primary] Hapoalim tariff p.8                                                                |
  | Isracard via Mizrahi                                           | 2.7% (schedule from 1.11.2019, print 01/2025)            | [primary]                                                                                    |
  | Isracard via FIBI                                              | 2.7% (from 1.7.2022, print 01/2025)                      | [primary]                                                                                    |
  | Isracard via Massad                                            | 2.7% (from 1.7.2022)                                     | [primary]                                                                                    |
  | Isracard via Yahav                                             | 2.7% (from 1.4.2025)                                     | [primary]                                                                                    |
  | One Zero                                                       | 2%                                                       | [primary]                                                                                    |
  | Postal Direct                                                  | 2.9% (from 1.1.2026)                                     | [primary]                                                                                    |
  | **Amex** (non-bank, Hapoalim, Mizrahi/Igud, FIBI group, Yahav) | **2.5%** (from 1.7.2026)                                 | [primary]                                                                                    |
  | Clubs                                                          | 1% (Hot, Hever), 1.5–2.2% (SuperFly), 1.8–2.5% (FlyCard) | [primary] club pages                                                                         |

- **Shekel purchases from foreign websites**:
  - They are charged in shekels: "עסקאות שבוצעו עם בית עסק מחו"ל (לרבות עסקאות באמצעות האינטרנט) שהסכום הנקוב בשובר הינו בשקלים, יחויבו בחשבון בשקלים" (AG25 §9.5). [primary]
  - They are also billed immediately: "עסקאות המדווחות למנפיקה באמצעות הארגון הבינלאומי (**לרבות עסקאות שבוצעו בשקלים**)" are charged the business day after capture (T-ISR part 2 ו). [primary]
  - Fee: T-ISR prices only "עסקאות בדולר או באירו או במטבע אחר", and classification follows the network's report (note 7). **UNCONFIRMED** whether any fee applies to a shekel-denominated foreign deal. No such line exists in T-ISR.
- **FX-account billing**: available only on bank cards with a foreign-currency account (ISCH; AG25 §9.2–9.4). [primary]

---

## 4. Deal types

Labels on the statement and in the export: see §9. Isracard's own data uses free text ("פירוט נוסף" / `moreInfo`).

### רגילה (one payment)

- "כרטיס הלקוח מחויב בכל סכום הרכישה במועד החיוב הקרוב" (ISCH). The cut-off is in §2. [primary]

### תשלומים (merchant installments, no interest to the cardholder)

- **Number of payments**: set by the merchant ("את מספר התשלומים המקסימלי קובע בית העסק", ISCH). [primary]
- **First payment**: on the billing date right after the deal; then monthly (AG25 §8.4). [primary]
- **Rounding**: the first payment can differ from the rest "במקרים בהם הסכום אינו עגול" (ISCH). [primary]
- **CPI-linked (צמודת מדד)**:
  - Each payment is linked by the "מדד הידוע במועד החיוב" against the "מדד הידוע במועד ביצוע העסקה".
  - If the slip is captured more than 60 days after the deal, the base is the index at capture.
  - **No reduction if the index falls.**
  - [primary] AG25 §1. ISCH adds: "ההצמדה לא תחול על התשלום הראשון".
- **Dollar-linked (צמודת מטבע חוץ)**:
  - Each payment is converted at "שער ההמרה הידוע ביום העסקים הסמוך לראשון לחודש בו מחויב כל תשלום" (AG25 §1).
  - ISCH: "שער העברות והמחאות גבוה של בנק הפועלים המתפרסם בראשון לכל חודש".
  - [primary]
- **Linked deals on a billing date other than the 2nd**: "יחויב בתשלום הראשון חודש לאחר מועד החיוב הרגיל" (§8.8). [primary]
- **Minimum deal amount**: set by the merchant. **UNCONFIRMED**: no issuer minimum was found.

### קרדיט בתשלומים קבועים (3–18 payments), Isracard's **fixed** track

- **Name**: "הסדר קרדיט בתשלומים" (AG25 §19.2). Marketing calls it "קרדיט בתשלומים קבועים" (MIZ column; ISCH: "קרדיט תשלומים קבועים").
- **How to ask for it**: at the till, the slip is marked "קרדיט בתשלומים" with the number of payments (§19.2.1.1). Two other routes exist:
  - A standing request that all monthly purchases form one deal: "סל חיובי ארץ" / "סל חיובי חו"ל", run separately (§19.2.1.2.1).
  - A retroactive request (§19.2.1.2.2).
- **Minimums**:
  - 3–18 payments: each payment's principal ≥ ₪25, "היינו סכום עסקה מינימלי - 75 ש"ח" (§19.2.2.3.1). [primary]
  - AMEXPDF also gives 3–18 and ≥ ₪25 a payment "(לא כולל ריבית)". [primary, undated]
  - A deal below the minimum may be treated as an ordinary deal (§19.2.2.3.5). [primary]
- **First payment**:
  - "החשבון יחויב ... החל במועד החיוב הראשון שלאחר מועד החיוב הרגיל" (§19.2.2.1), which is the **second** billing date after the purchase.
  - AMEXPDF: "התשלום הראשון לא יחוייב במועד החיוב הקרוב ... אלא רק במועד החיוב השני ... במועד החיוב הראשון תרשם העסקה בהודעת החיוב החודשית **לידיעה בלבד**". [primary]
- **Payments**: Spitzer, "סכומם הכולל של הקרן והריבית בכל אחד מהתשלומים ... יהיה זהה" (§19.2.2.2). [primary]
- **Interest**: see §5.

### Long credit (19–36 payments)

- **Name**: no separate name. It is the same "הסדר קרדיט בתשלומים" with a higher minimum: "אם יבחר הלקוח במספר תשלומים **העולה על 19** אזי קרן כל תשלום לא תפחת מ-50 ש"ח" (AG25 §19.2.2.3.2). [primary]
  - The contract's wording leaves exactly 19 payments ambiguous (18 → ₪25; "more than 19" → ₪50). **UNCONFIRMED** which minimum applies to 19.
- **Maximum**: Amex's calculator: "מ-3 תשלומים ועד 36 תשלומים, בסכום שנע בין 1,000 ש"ח לבין 100,000 ש"ח", and "לרוב אפשרי לחלק עסקת קרדיט לעד 36 תשלומים". [primary] <https://marketing.americanexpress.co.il/pages-amex/credit-calculator/>. **UNCONFIRMED** for Isracard-brand cards and at the till.
- **Rate adjusted mid-deal? No.** Unlike Max's קרדיט פלוס, the rate is fixed for the life of the deal:
  - "חשוב לדעת שהריבית היא **קבועה מרגע ביצוע העסקה** ולא משתנה בהתאם לריבית הפריים" (Amex calculator FAQ). [primary]
  - "שינויים בשיעור ריבית על הסדר קרדיט ... לא יחולו על אשראי שכבר הועמד" (AG25 §19.2.3.1). [primary]
- "קרדיט פלוס" does not appear in AG25. [primary, absence]

### דחוי / +30 / חיוב נדחה

- **Interest-bearing 30+ product: none found.** Isracard has no "30+" product. Its credit products are קרדיט, קרדיט בתשלומים, אשראי מהיר and אשראי מתגלגל (AG25 §1, "הסדרי האשראי"). [primary]
- **Merchant-side deferral** (no interest):
  - "במקרה של עסקה אשר הוסכם בין הלקוח לבין בית העסק כי פרעונה יבוצע במועד חיוב עתידי שאינו סמוך למועד העסקה, מועד פרעון התשלומים יהא החל ממועד החיוב הבא לאחר מועד החיוב הסמוך למועד העסקה או במועד חיוב אחר, כפי שיאושר" (AG25 §8.4). [primary]
  - **UNCONFIRMED**: its statement label.
- **MORE card grace period**: "אשראי MORE שאינו נושא ריבית" runs from the regular billing date to the MORE billing date, 20 days later (§21.2). [primary]

### Spreading after the fact

Three products:

1. **Retroactive קרדיט** (contract):
   - A request "בדיעבד" to turn past charges, or deals not yet charged, into הסדר קרדיט or קרדיט בתשלומים (AG25 §19.1.1.2.2, §19.2.1.2.2).
   - If approved, "יזוכה החשבון תוך 2 ימי עסקים **והריבית תחושב החל ממועד זיכוי החשבון**".
   - For a deal not yet charged, interest runs from the regular billing date.
   - [primary]
   - ISCH calls this "**העברה לקרדיט**": uses from the last **5 months** credited within 3 business days, or spreading of the nearest billing date. "בביצוע זיכוי מיידי - יחל הלקוח להחזיר את החוב ממועד החיוב הקרוב; בביצוע קיזוז ממועד חיוב עתידי - החיוב הראשון יתבצע במועד החיוב הבא". [primary, undated]
2. **"פריסת חיובים" / "פריסת החיוב החודשי לתשלומים"** (spread an upcoming bill):
   - "התשלום הראשון יידחה בחודש ויחויב במועד החיוב הבא".
   - Rate: "בהתאם לסכומי הריבית הקבועים בכרטיס ... שיעור הריבית מופיע גם בדף הפירוט החודשי". **UNCONFIRMED** which of the card's rates this is.
   - Limits: "בכרטיס בנקאי ... 3-24 תשלומים ובכרטיס חוץ בנקאי בין 3-60". The same page's footer says "בכרטיס בנקאי בין 3 תשלומים עד 18 תשלומים", so the page contradicts itself.
   - "דחיית החזר ההלוואה בכפוף לתשלום ריבית גישור".
   - Cancelling before the first payment costs the tariff's repayment fee plus pro-rata interest.
   - Foreign deals can be spread.
   - [primary] <https://www.isracard.co.il/credit-solutions/debtinstallments/private>. Amex's page is identical: <https://www.americanexpress.co.il/credit-solutions/debtinstallments>
3. **Spreading foreign charges after a trip**:
   - "לפרוס את החיובים לאחר החזרה ארץ ל-12-3 תשלומים ... בתוספת ריבית כמקובל".
   - Doing this **cancels** a revolving (fixed monthly repayment) plan.
   - [primary] <https://digital.isracard.co.il/Abroad/lobby/after/payments/>

### Other plans

- **ישראקרדיט / אמריקן אקספרס קרדיט** (pooled variable credit): see §5 and §6.
- **אשראי מתגלגל** (revolving): see §6.
- **MORE card**: see §6.
- **אשראי מהיר** (card loan): see §7.

---

## 5. Interest on קרדיט: Isracard's fixed and variable tracks

ISCH: "תחת קטגוריה זו קיימים שני מסלולי החזר: קרדיט תשלומים קבועים ... הריבית הינה קבועה ומחויבת על בסיס חודשי יחד עם ההחזר. | ישראקרדיט | מסלול המתבסס על סל מצטבר של עסקאות ... ברירת המחדל היא 5% מהחוב או 100 ₪ הגבוה מביניהם. הריבית במסלול זה הינה **משתנה ורבעונית ואינה מצטרפת לחיוב החודשי**". [primary, undated]

### Fixed track: הסדר קרדיט בתשלומים (קרדיט בתשלומים קבועים)

- **Basis**: "יישא ריבית קבועה, ששיעורה ייקבע על פי שיעור הפריים ... בצירוף תוספת הסיכון להסדר קרדיט בתשלומים כפי שיהיו נהוג **ביום קליטת שובר העסקה** אצל המנפיקה" (AG25 §19.2.3.1). [primary]
- **Fixed at purchase? Yes**, at capture. Changes "לא יחולו על אשראי שכבר הועמד". Each deal can carry a different rate, shown on the statement.
- **Basket deals** (סל חיובי ארץ/חו"ל):
  - one rate for the month's basket, "על פי שיעור הריבית במועד החיוב המוקדם מבין מועדי החיוב העוקבים".
  - The **foreign basket** also pays daily interest, actual/365(366), from the regular billing date to the next billing date. It is charged on the billing date after the regular one.
  - [primary] §19.2.3.1
- **When interest starts**: "החל ממועד החיוב הרגיל, ועד למועד החיוב העתידי ... בו אמור האשראי ... להיפרע במלואו", counted in **whole months** (§19.2.3.2). [primary]
  - AMEXPDF: "החל מהיום בו אמור היה סכום העסקה להיות מחוייב אילו בוצעה העסקה הרגילה". Example: a September purchase pays its first payment in November, with interest from October. [primary]
- **Day count**: "שיעור הריבית הנומינלי השנתי ... המוכפל ב-30 יום בחודש ומחולק ב-360 יום בשנה", on each deal's unpaid balance (§19.2.3.3). So the monthly rate is i/12. [primary]
- **Repayment**: Spitzer (§19.2.2.2). Amex: "חישוב הריבית נעשה לפי נוסחת שפיצר". [primary]
- **First payment**: PMT = P·r/(1−(1+r)^−N) with r = i/12. It falls on the 2nd billing date and carries exactly one month of interest, because interest starts at the 1st (regular) billing date. This is derived from §19.2.2.1 and §19.2.3.2. **UNCONFIRMED**: the rounding rule to the agora.
- **Early repayment off a billing date**: interest pro-rata, actual/365(366), from the previous billing date (§19.2.3.3). Fees are in §8. [primary]
- **Published rates** (MIZ, cards whose credit Mizrahi provides; nominal / מתואמת; effective 3.9.2026) [primary]:

  | Card type (MIZ wording)                                                                    | ישראקרדיט / אמק"ס קרדיט (variable, pooled) | קרדיט בתשלומים קבועים (fixed) | אשראי מהיר    |
  | ------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------- | ------------- |
  | ישראכרט רגיל; מסטרקרד; אמק"ס בלו; אמק"ס קרדיט; סופרקארד ישראכרט/מסטרקארד; מועדון חייל יותר | 14.15 / 15.10                              | 15.25 / 16.36                 | 16.25 / 17.52 |
  | לייפסטייל                                                                                  | 14.15 / 15.10                              | 15.05 / 16.13                 | 16.25 / 17.52 |
  | עולמי עובדי הרשויות                                                                        | 12.35 / 13.07                              | 13.55 / 14.42                 | 16.25 / 17.52 |
  | מסטרקרד ביזנס                                                                              | 12.05 / 12.74                              | 13.25 / 14.08                 | 16.15 / 17.40 |
  | גולד מסטרקרד; קורפורייט מסטרקרד; אמק"ס ירוק; סופרקארד-גולדמסטרקרד                          | 11.30 / 11.90                              | 13.00 / 13.80                 | 16.15 / 17.40 |
  | קורפורייט אמק"ס ירוק                                                                       | 11.00 / 11.57                              | 13.00 / 13.80                 | 16.15 / 17.40 |
  | גולד מסטרקרד ביזנס; קורפורייט זהב; קורפורייט אמק"ס זהב                                     | 11.00 / 11.57                              | 12.70 / 13.47                 | 16.15 / 17.40 |
  | אמק"ס זהב                                                                                  | 11.10 / 11.68                              | 12.70 / 13.47                 | 16.15 / 17.40 |
  | גולד מסטרקרד פלטינום                                                                       | 10.75 / 11.30                              | 11.25 / 11.85                 | 13.25 / 14.08 |
  | אמק"ס פלטינום                                                                              | 10.65 / 11.19                              | 11.25 / 11.85                 | 13.25 / 14.08 |
  | עו"ד ישראכרט (and spouse)                                                                  | 8.85 / 9.22                                | 9.75 / 10.20                  | 13.25 / 14.08 |
  | וורלד עילית                                                                                | 7.75 / 8.03                                | 7.95 / 8.25                   | 9.95 / 10.42  |
  | סנטוריון                                                                                   | 6.25 / 6.43                                | 6.45 / 6.64                   | 6.95 / 7.17   |
  - **Kind**: the published rate per card type at one bank. Its prime basis is implied, not printed: a regular card is prime + 9.40 / +10.50 / +11.50. Every row changed by −0.25 on 3.9.2026, the change in prime.
  - **Formula check** (m = 12): **every pair matches to 0.01**, with two edge cases:
    - Centurion אשראי מהיר: 6.95% gives 7.1757%, which rounds to 7.18; Mizrahi prints 7.17 (truncated).
    - 13.25% gives exactly 14.0850%; Mizrahi prints 14.08 (truncated or half-down).
  - Isracard's loan example also matches: 9.75% → 10.20%.

### Variable track: הסדר קרדיט (ישראקרדיט; on Amex "אמריקן אקספרס קרדיט")

- **Basis**: "ריבית משתנה המורכבת מריבית בשיעור 'פריים' בצירוף תוספת הסיכון להסדר קרדיט ... הריבית תשתנה בכל עת שיחול שינוי בפריים" (AG25 §19.1.4.1). The margin may change "בכל מועד חידוש מסגרת האשראי" (§19.1.4.2). [primary]
- **Fixed at purchase? No.** It moves with prime.
- **Interest starts**: "החל ממועד החיוב הרגיל" (§19.1.4.2–3). [primary]
- **Day count and charging**: "מדי יום ביומו ... חיוב הלקוח בריבית ... ייעשה **ביום העסקים הראשון של כל רבעון קלנדרי**, בגין תקופת הריבית שקדמה לו". The basis is the nominal rate × the exact days ÷ 365 or 366 (§19.1.4.3). The first interest period runs from the regular billing date to the end of that quarter. [primary]
- **Amex**: "החיובים בגין תשלומי הקרן יופיעו בהודעת החיוב החודשית ואילו הריבית תחוייב מידי רבעון קלנדרי בחשבון הבנק שלך" (AMEXPDF). [primary, undated]
- **Repayment of principal**:
  - default 5% of the principal balance, minimum ₪100 a month; or a fixed amount ≥ ₪200 chosen by the customer;
  - payments start at "מועד החיוב הראשון לאחר מועד החיוב הרגיל" (§19.1.2).
  - Prepayments captured in the 5 days before a billing date may be counted only at the next one (§19.1.3).
  - [primary]
- **How to join**:
  - mark the slip as קרדיט, or file a standing request that all future deals in Israel and/or abroad go into it (§19.1.1). [primary]
  - AMEXPDF: Amex קרדיט is a card type ("כרטיס אמריקן אקספרס קרדיט", fee ₪16.90 in the Amex schedules).
  - "מסגרת האשראי של הכרטיס הינה אחת ומשותפת" with קרדיט בתשלומים קבועים. [primary]
- **Published rate**: 14.15% / 15.10% for a regular card at Mizrahi (table above).
- **m-convention anomaly**: interest is charged quarterly, but the published pair matches m = 12. With m = 4 it would be 14.92%; with m = 365, 15.20%. **UNCONFIRMED** why. It matches the background note.
- **Still offered to new customers? UNCONFIRMED.** Isracard's public site has no ישראקרדיט page. The contract and MIZ still carry it.

---

## 6. Revolving credit (אשראי מתגלגל / החזר חודשי קבוע)

- **Names**:
  - AG22 §19.4: "תוכנית **החזר חודשי קבוע**".
  - AG25 §19.4 (11/2025): renamed "תוכנית **אשראי מתגלגל**".
  - ISCH: "חיוב חודשי קבוע". Web: "שירות אשראי מתגלגל".
  - The rolled balance is "**סל האשראי המצטבר**" / "יתרת הסל המצטבר".
  - [primary]
- **Who can join, and how**:
  - "למחזיקי כרטיס **חוץ בנקאי** בלבד" (REV). [primary]
  - ISCH (undated): also "כרטיסים בנקאיים בבנק מזרחי וקבוצת הבינלאומי". **UNCONFIRMED** whether that is still so.
  - It is a service on an existing card, joined online, not a separate card: ID + 4 card digits, choose the card, choose the monthly amount (REV). [primary]
  - The request takes effect from the next billing date if filed 3 business days before it (AG25 §19.4.4). [primary]
  - Joining may require digital-banking registration (§19.4.5). [primary]
- **Minimum monthly payment**:
  - "בכפוף להחזר חודשי מינימאלי של **3% מהסכום בש"ח של כלל הכספים המצויים בתוכנית** ... או **500 ש"ח** (לפי הגבוה מבניהם)" (AG25 §19.4.2). So it is a % of the **balance in the plan**, not of the limit. [primary]
  - REV: "500 ₪ או 3% מגובה השימושים (הגבוה מביניהם)".
  - When the month's spending is below the chosen amount: "הסכום שירד הוא סכום העסקאות ... למעט מקרים בהם נשארה יתרת חוב בסל ... הסכום שיחוייב הוא הסכום שקבעת או 3% מיתרת סל האשראי, הגבוה מביניהם". [primary]
- **What goes into the pool** (two sources conflict):
  - AG25 §19.4.1 / §19.4.7: all uses, including fees, תשלומים installments, קרדיט and קרדיט בתשלומים installments **with their interest**, אשראי מהיר installments, transfers and foreign cash.
    - **New in 11/2025**: "משיכות מזומנים בארץ, **לא יכללו** בתוכנית אשראי מתגלגל" (§19.4.7.4).
    - [primary]
  - REV (web): "מוצרי האשראי 'קרדיט' ו'אשראי מהיר' **לא יכנסו** לשירות אשראי מתגלגל ... עסקאות בבית עסק מסוג 'קרדיט בתשלומים קבועים' ... ייכנסו לסל המצטבר ... ויישאו גם את ריבית השירות (**ריבית דרבית**)". [primary]
  - **UNCONFIRMED**: which governs for אשראי מהיר and for the products the page calls "קרדיט".
- **Over-limit inside the plan**: domestic excess is charged in full at the next billing date and stays out of the plan. Foreign excess is charged within **48 hours** (§19.4.8). [primary]
- **Interest**:
  - "ריבית משתנה המורכבת מריבית בשיעור 'פריים' בצירוף תוספת הסיכון להסדר קרדיט ... הריבית תשתנה בכל עת שיחול שינוי בפריים" (§19.4.9.1). [primary]
  - **Which balance**: the principal not yet repaid, "מדי יום ביומו, החל ממועד החיוב הרגיל (כולל אותו מועד) ועד למועד החיוב הרגיל שלאחר מכן (לא כולל)". Day count: actual/365(366) (§19.4.9.2). [primary]
  - **Grace period**: none on rolled amounts. Uses become credit "החל ממועד החיוב הרגיל", so the normal purchase-to-billing free period still applies (§19.4.7). [primary]
  - **Charging (m)**: "אחת לחודש במועד החיוב הרגיל כחלק מסכום ההחזר החודשי, כך שקודם יחויב הלקוח בריבית ולאחר מכן בהחזר הקרן. היה ... ההחזר בגין הריבית יעלה על סכום ההחזר החודשי, יחויב הלקוח במלוא סכום הריבית" (§19.4.9.3). So interest compounds **monthly** through the fixed payment. [primary]
  - **Published rate**: the card's קרדיט rate ("תוספת הסיכון להסדר קרדיט"). REV: "בהתאם לריבית כרטיסך כפי שיפורט במסמכי הנפקת הכרטיס ובדפי הפירוט החודשיים". For non-bank cards it is personal and **unpublished**. MIZ's 14.15% / 15.10% column is the bank-card ישראקרדיט/revolving rate at Mizrahi. **UNCONFIRMED** that Isracard non-bank revolving uses the same figure.
- **Paying more than the minimum**:
  - change the monthly amount any time online, in the app, by IVR or by phone (REV; GUIDE). [primary]
  - early repayment, partial or full: "פירעון מוקדם חלקי או מלא כרוך בעמלת פירעון מוקדם" (AG25 §19.4, end). T-ISR lists "פירעון מוקדם (של אשראי)" at ₪60 through a clerk / ₪30 direct. [primary]
- **Example (Isracard's own)**: a fixed payment of ₪1,200. Monthly spending of ₪1,500, then ₪1,000+300, then ₪2,000+100 leaves ₪300, then ₪100, then ₪900 rolling. The page shows these without interest. [primary] REV
- **On the statement**:
  - "יתרות ... יצטרפו ליתרת הסל המצטבר" (REV).
  - The statement must show "יתרת חוב הלקוח (קרן) בגין הסך הכולל של הסכומים שטרם נפרעו" and "שיעור הריבית הנהוג" (AG25 §19.5.3).
  - [primary]
  - **UNCONFIRMED**: the exact row label (e.g. "סל מצטבר").
- **Leaving**: spreading foreign charges cancels the plan (the abroad page). On card cancellation, remaining amounts are charged at the chosen repayment level (§19.4.10). [primary]
- **MORE card** (a separate card; non-bank only):
  - Tracks:
    - **MORE מתגלגל**: pay at least the minimum, on the MORE billing date 20 days after the regular one.
    - **MORE קבוע**: a fixed amount from ₪1,000.
  - Minimum "עפ"י הסכום הנבחר או 3% מהסכום ב-₪ של כלל הכספים ... הגבוה מבינהם" (ISCH).
  - Interest: prime + margin, actual/365(366), computed quarterly and posted as a MORE transaction at the next billing date (AG25 §21.5).
  - Card fee ₪10.90/month (T-ISR).
  - [primary]

---

## 7. Other rates

### Late payment (ריבית פיגורים): BOI + 16.40%, compounded quarterly

- **Isracard's fair-credit page** (lender: Isracard Mimun for loans and non-bank cards): "'ריבית פיגורים' – הינה ריבית בנק ישראל ... כפי שתתעדכן מעת לעת **בצירוף 16.40%** מהווה נכון למועד זה ריבית שנתית של 20.90% ריבית מתואמת שנתית של 22.60%. ריבית הפיגורים תחושב לפי **מספר הימים המדויק** של הפיגור ותצורף לקרן החוב **אחת לרבעון** ... ריבית בנק ישראל נכון למועד זה הינה בשיעור של 4.50%". [primary] FAIR
- **Basis**: the Bank of Israel rate + 16.40 points. It is **not prime-based**. It "תשתנה בכל עת שיחול שינוי בריבית בנק ישראל".
- **m = 4** (capitalised quarterly). The page's own pair checks out: (1 + 0.209/4)^4 − 1 = **22.596% → 22.60%**. With m = 12 it would be 23.02%.
- **Today** (BOI 3.25%): **19.65% nominal → 21.15% מתואמת** (m = 4). The page is **stale**: it still shows BOI 4.50%.
- **Legal cap**: the Fair Credit Law late-interest cap, 21.9% today (background note). 19.65% is under it.
- **Conflicting definition in the card contract**: AG25 §1 (and AG22) define "ריבית פיגורים" for shekels as "הריבית המירבית הגבוהה ביותר, כפי שתהיה מעת לעת, **בבנק הפועלים** על יתרות חובה בחשבון עובר ושב ... שלא קיימת בו מסגרת אשראי בתוקף". [primary] **UNCONFIRMED** which applies to a non-bank card's unpaid bill. FAIR is the current consumer disclosure and links to the agreement.
- **Fees around a late payment**:
  - ₪5 per late-payment notice;
  - ₪146 for a lawyer's warning letter;
  - ₪11 for a bounced debit;
  - [primary] T-ISR

### Going over the limit (חריגה)

- "חרג הסכום המנוצל מסך מסגרת הכרטיס, מתחייב הלקוח לפרוע **באופן מידי** את סכום החריגה" (AG25 §18.12). [primary]
- §18.17: "בגין כל סכום החורג ממסגרת הכרטיס, **בריבית בשיעור המירבי** החל ממועד היווצרות החריגה ... ועד למועד חיוב החשבון". [primary] The rate is undefined beyond "המירבי". **UNCONFIRMED** figure.
- A credit-arrangement deal that turns out over-limit at capture may be billed whole as an ordinary deal (§18.16). [primary]

### Cash withdrawal

- **In Israel, non-bank card**: debited "באופן שוטף ובסמוך לביצוע המשיכה" (AG25 §8.2), within about 2 business days (ISCH). No interest. [primary]
  - Fee: none in T-ISR. Hever's page mentions "פטור מעמלת משיכת מזומן בכל עמדות המשיכה האוטומטיות הצמודות לסניפי הבנקים". **UNCONFIRMED**: the standard domestic ATM fee on Isracard non-bank cards.
  - Since 11/2025, domestic cash stays out of revolving credit (§19.4.7.4).
- **Abroad**:
  - fee **3.5%** at an ATM or a counter (T-ISR; all Amex schedules). Hapoalim's Isracard cards: **3.30%**. [primary]
  - From an FX account in the same currency: ₪19 flat.
  - Visa counter withdrawal without the card: up to $175.
  - Charged at capture. No interest unless spread into קרדיט (GUIDE: "ניתן לחלק את ההוצאות בחו"ל לתשלומים ... כולל משיכת מזומנים"). [primary]

### Card loans

- **אשראי מהיר / הלוואה מהירה** (from the card's limit):
  - **Rate**: fixed "בהתאם לשיעור הפריים בצירוף תוספת הסיכון להסדר אשראי מהיר כפי שיהיו אצל המנפיקה **במועד הבקשה**" (AG25 §19.3.4.1).
  - **Interest**: 30/360 Spitzer on the unpaid balance (§19.3.4.3).
  - **Bridge interest** (_ריבית גישור_): actual/365(366) from the crediting date to the first billing date. It is charged as **a separate extra payment** at the nearest billing date (§19.3.3.2, §19.3.4.4).
  - **Minimum** ₪1,000 (§19.3.1.2).
  - [primary]
  - Web (2026): up to **₪140,000** on non-bank cards and **₪30,000** on bank cards; **3–72** payments on non-bank cards, **3–24** on bank cards; money in 1 business day. [primary] <https://www.isracard.co.il/credit-solutions/quickloan/private>
  - Older ISCH: up to 70% of the available limit, 3–60 months non-bank.
  - **Published rate**: regular card via Mizrahi 16.25% / 17.52%; World Elite 9.95% / 10.42%; Centurion 6.95% / 7.17% (MIZ). [primary]
- **הלוואה לכל מטרה / הלוואה חוץ בנקאית** (Isracard Mimun; customers of any bank aged 21+):
  - "ריבית שנתית משתנה- ריבית הפריים בתוספת מרווח סיכון (**בטווח שבין 1% לבין 11.9%**)". [primary]
  - 18–100 months. [primary]
  - Example: ₪50,000 over 50 payments at P+5.00% = 9.75%, מתואמת 10.20%, about ₪1,228 a month. It matches m = 12. [primary]
  - 0.5% off digitally until 31.12.2026; up to 3 months' grace with bridge interest. [primary]
  - Source: <https://www.isracard.co.il/loans/non-bank-loan>
  - Hot's page: "ריבית המינימום לא תפחת מפריים + 1%". [primary]
- **Car loan**: up to ₪300,000 over up to 72 payments, "ריבית: צמודה לפריים" (ISCH, undated). [primary]

---

## 8. Fees that affect a budget

- **Card fees, non-bank Isracard (from June 2026)** [primary] T-ISR:
  - Digital card ₪9.90.
  - Local, international and gold ₪17.90.
  - Business and platinum ₪17.90.
  - World Elite **$63.90**.
  - Direct/ISRACASH ₪8.50.
  - MORE ₪10.90.
  - cashback+ ₪17.90.
  - Fly Card ₪19.90; Fly Card Premium ₪38.90; Fly Card Premium Select ₪27.90.
  - The fee is collected monthly, for the period between billing dates (note 1).
- **How the fee is waived** (non-bank Isracard):
  - local, international and gold: ₪15.30 at ₪5,000 of monthly purchases; **free at ₪7,500**;
  - business, gold business and platinum: ₪15.30 at ₪7,500; free at ₪12,000;
  - Rami Levy club cards are excluded.
  - 2nd card on the same account 50% off, 3rd 25% off (note 12).
  - [primary] T-ISR
- **Card fees, non-bank Amex (from 1.7.2026)** [primary] T-AMEX:
  - כחול ₪15.90; קרדיט ₪16.90; ירוק/Classic/Business ₪18.90; זהב ₪22.90; Gold+ ₪24.90.
  - Platinum $32.90 (was $27.90); Centurion $189 (was $170.30). The change notice is <https://he.americanexpress.co.il/globalassets/PDF/7783.pdf>.
  - FLYCARD Premium ₪40; CashBack Premium ₪30.90.
  - Spend targets: e.g. כחול ₪4.30 off at ₪1,000 and free at ₪6,000; קרדיט free at ₪6,500; זהב free at ₪7,000.
- **Bank-card fees are on the bank's own schedule.**
  - Hapoalim, from 1.11.2025: 20% off at ₪5,000; 100% off at ₪8,000 (Isracard card) or ₪10,000 (Mastercard / Visa / gold / platinum). [primary] <https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/MODAA_TAARIFON_CREDITCARDS__Acc_01112025.pdf>
  - Hapoalim Amex: 30% off at ₪3,000; 100% off at ₪8,000–10,000 by type. [primary]
  - FIBI / Massad: Isracard ₪17.22, Gold ₪19.25, Platinum ₪24.31, World Elite $63.31, Visa ₪24–30. [primary]
- **Clubs**: Hot and Hever "פטור מלא/קבוע מדמי כרטיס". [primary]
- **Paper statement**:
  - T-ISR has **no line for the monthly paper statement**.
  - It charges only for producing documents on request: ₪8.90 through a clerk / ₪2.90 direct.
  - Emailed statements: "השירות אינו כרוך בתשלום ... ניתן לבטל ... ולחזור ולקבל הודעות בדואר רגיל". [primary] <https://digital.isracard.co.il/products-services/messages/>
  - **UNCONFIRMED** that paper by post is free on every bank's Isracard cards.
- **Changing the billing date**: free (ISCH). MORE: may be charged twice during the switch (§21.8). [primary]
- **Changing a deal's type or paying early**:
  - "פירעון מוקדם או מיידי של עסקאות (לבקשה)": ₪29.90 through a clerk / ₪15.90 direct.
  - "פירעון מוקדם (של אשראי)": ₪60 / ₪30.
  - Isracard Mimun loans: ₪59.90.
  - Bank cards (FIBI, Mizrahi, Yahav): ₪40 / ₪20 and ₪60 / ₪30.
  - [primary] T-ISR; bank schedules; Isracard Mimun schedule <https://digital.isracard.co.il/link/6f3fbc67eba8405fa8027f34fbb8a2c1.aspx>
  - Turning a deal into קרדיט after the fact carries no separate fee in T-ISR; the cost is the interest.
- **Credit and collateral handling over ₪100,000**: 1.25% (T-ISR 1.1.2025 version only). [primary]

---

## 9. Exports

- **Isracard's own Excel download**: **UNCONFIRMED.** I could not log in, and no public documentation of its columns was found.
- **The data behind it** (Isracard's web API, read by open-source code) [secondary] <https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/base-isracard-amex.ts>:
  - **Fields per transaction**:
    - `fullPurchaseDate` / `fullPurchaseDateOutbound`;
    - `fullSupplierNameHeb` / `fullSupplierNameOutbound`;
    - `dealSum` / `dealSumOutbound` (deal amount);
    - `paymentSum` / `paymentSumOutbound` (charged amount);
    - `currencyId`, `currentPaymentCurrency`;
    - `voucherNumberRatz`;
    - `moreInfo` (free text);
    - `dealSumType`.
  - Domestic and foreign deals come in separate "Outbound" fields.
  - **Installments**: detected only when `moreInfo` contains "תשלום". The first two numbers are taken as k and N, matching text like "**תשלום 3 מתוך 12**".
  - The scraper drops rows with `dealSumType == '1'` or voucher "000000000". These appear to be summary rows. **UNCONFIRMED**.
  - Each billing month is fetched by `billingDate` (reqName=DashboardMonth).
- **No interest rate, and no per-installment interest amount, is in these fields.**
  - For a קרדיט row, `paymentSum` is principal + interest. AMEXPDF: "בהודעת החיוב החודשית יופיע פירוט התשלומים המחוייבים בפועל (קרן + ריבית)". [primary]
  - The rate can be solved from `dealSum`, N and `paymentSum` (Spitzer, 30/360).
- **The statement shows** the credit balance and the credit rates (AG25 §19.5.3), and each קרדיט deal's rate and number of payments (§19.2.2.3.6, §19.2.3.1). [primary]
- **UNCONFIRMED**: the exact labels for "קרדיט", ישראקרדיט quarterly interest, bridge interest and the revolving pool on an Isracard statement.

---

## 10. Changes and dates

- **Contract changes**:
  - "ייכנסו לתוקפם מיד בתום **30 יום** מיום שתינתן על כך הודעה ללקוח, אלא במקרים שבהם התיקון הוא טכני או אינו גורע מזכויות הלקוח" (AG22 §32).
  - The customer may then end the agreement at once.
  - [primary]
  - §32 in AG25's PDF text layer is garbled. **UNCONFIRMED** that it is unchanged.
- **Billing dates and billing method**: changes on 30 days' notice (§8.7). [primary]
- **Notice channels**: "דף ריכוז חיובים, עיתונים יומיים, אתר האינטרנט של המנפיקה ו/או פרסומים אחרים" (AG22 §2, general clause after §2.3); "בדרך של פרסום **בשני עיתונים יומיים**" (§34.3). [primary]
  - Isracard posts notices at <https://marketing.isracard.co.il/pages/changes-report/> (latest: Doar card fee from 1.1.2026).
  - Amex posts at <https://he.americanexpress.co.il/change/> (latest: card fees from 1.7.2026).
  - [primary]
- **Prime-linked rates**:
  - The variable ones (ישראקרדיט, revolving, MORE) change automatically with prime.
  - Amex's notice of 1.1.2024: "שיעורי הריבית באשראים שקלים אשר נקבעה בתנאיהם הצמדה לריבית בנק ישראל או הצמדה **לריבית הפריים של בנק הפועלים** בע"מ, יעלו בשיעור לעיל". The text says "יעלו" (rise) about a 0.25 cut, which looks like a typo in the source. [primary] <https://he.americanexpress.co.il/link/a68b8d32f59e4f97bd7869546423bebd.aspx>
  - Margins may change only at limit renewal and not on credit already extended (§19.1.4.2, §19.2.3.1). [primary]
- **Dates of the figures**:

  | Figure                         | Date                                                      |
  | ------------------------------ | --------------------------------------------------------- |
  | MIZ rates                      | effective 3.9.2026 (published 2.9.2026)                   |
  | T-ISR                          | June 2026; FX fee 2.9% unchanged since 1.1.2025           |
  | T-AMEX and bank Amex schedules | 1.7.2026                                                  |
  | Hapoalim tariff                | as of 1.10.2026                                           |
  | FIBI / Massad                  | 1.7.2022                                                  |
  | Mizrahi Isracard services      | 1.11.2019                                                 |
  | Yahav                          | 1.4.2025                                                  |
  | FAIR                           | undated and stale (BOI 4.50%, the rate before 27.11.2025) |
  | AG25                           | 11/2025                                                   |
  | GUIDE                          | 2/2023                                                    |
  | ISCH, AMEXPDF                  | undated                                                   |

- **Announced changes**:
  - FlyCard launch offers (new joiners 1.9–31.10.2026, first-year card fee ₪20.90);
  - Amex FlyCard 50% FX discount until 30.06.2027;
  - the digital loan discount until 31.12.2026.
  - No announced rate change beyond prime. The next BOI decision is 21.10.2026 (background note).

---

## UNCONFIRMED / gaps

1. **The current list of billing dates** (2/10/15/20 comes from an undated training page). Also the typical capture lag that decides the cycle.
2. **The conversion rate's legal source.** The fee schedule and website say the BOI representative rate on capture day. AG25 still defines Hapoalim's "העברות והמחאות מכירה" rate.
3. **Any fee on shekel-denominated purchases from foreign merchants.** None is listed.
4. **Rates at banks other than Mizrahi** (Hapoalim, FIBI group, Yahav, One Zero, Leumi) for Isracard / Amex cards. Also non-bank rates, which are personal and unpublished.
5. **Which late-interest definition binds a card bill**: BOI + 16.40% (fair-credit page) or Hapoalim's maximum overdraft rate (AG25 §1). The over-limit "שיעור המירבי" figure.
6. **The minimum for exactly 19 payments** (₪25 or ₪50). The maximum number of קרדיט payments on Isracard-brand cards at the till. 36 comes from Amex's calculator.
7. **What enters the revolving pool**: AG25 says all credit products, the web page excludes "קרדיט" and "אשראי מהיר". Whether Mizrahi and FIBI bank cards can still join.
8. **Why the published מתואמת for quarterly-charged ישראקרדיט uses m = 12.** Whether ישראקרדיט is still sold.
9. **The rate used for "פריסת חיובים" and "העברה לקרדיט"** ("the card's rate"; which one). The bank-card limit (18 or 24 payments; the page contradicts itself).
10. **Whether a billing-date change moves existing קרדיט installments.** AG25 implies yes; Amex's FAQ says no.
11. **Isracard's Excel export**: column names, the קרדיט label, and how interest, bridge interest and the revolving pool appear. Only API field names were seen [secondary].
12. **Domestic ATM fee** on non-bank Isracard cards. Whether paper statements are free at every bank.
13. **Leumi's role** (which Isracard cards it distributes). Whether Discount, Mercantile or Jerusalem offer any Isracard card.
14. **Isracard's current ownership** (not verified).
15. **Rounding**: Mizrahi prints Centurion אשראי מהיר 6.95% as 7.17% where m = 12 gives 7.1757%. The pair is otherwise consistent. The rounding rule for Spitzer payments is also unconfirmed.
