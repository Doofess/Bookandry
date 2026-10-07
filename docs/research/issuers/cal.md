# Cal (כרטיסי אשראי לישראל) and Diners Club Israel: issuer catalog research

Seen: 2026-10-08. Prime on that date is 4.75% (Bank of Israel rate 3.25% + 1.5%), as in the background doc.

Read first: `docs/research/2026-10-08-israeli-credit-card-interest.md`. This file does not repeat it. It adds what is specific to Cal and corrects three points in it (§0).

**Tags.** **[primary]** means Cal's own page, contract, fee schedule or notice, a distributing bank's own page or contract, or a regulator. **[secondary]** means press, open-source code or a consumer site. **UNCONFIRMED** means no primary source here establishes it.

**How the sources were read.** Cal's site (cal-online.co.il and diners.co.il) rejects headless browsers with an F5 "Request Rejected" page. I read it in a headed Chromium with its window off screen. Cal's PDFs were fetched inside that session and their text was extracted with pdf.js. The Hebrew in them is quoted as it reads.

**Main sources** (all seen 2026-10-08):

| Short name             | What it is                                                                                                                         | URL                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cal agreement          | הסכם מסגרת ותנאים כללים, edition **06.2025/22**, in force from 1.9.2025. Covers cards **issued directly by Cal or Diners** (§2.1). | https://www.cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf                                          |
| Cal agreement 2020     | The previous edition, 09.2020. Its wording on קרדיט interest is the same.                                                          | https://www.cal-online.co.il/media/ljhjbplb/card-holder-agreement-092020.pdf                            |
| Yahav agreement        | Bank Yahav's agreement for **bank-issued Visa Cal cards** (2024 edition)                                                           | https://bank-yahav.co.il/media/3hqpft4v/2024-הסכם-לקוח-בנק-יהב-מהדורה-מעודכנת-ויזה-כאל.pdf              |
| Cal fees               | "עמלות כאל – כמה משלמים ועל מה", edition **06.2026**, in force from 1.6.2026                                                       | https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf (index: https://www.cal-online.co.il/more/amlot/) |
| Cal credit fees        | The fee schedule for Cal and Cal Mimun credit agreements (loans)                                                                   | https://www.cal-online.co.il/media/rqgd1oq4/taarifon010825.pdf                                          |
| Cal statement glossary | "מידע חיוני ללקוחות / הסברים למונחים", the glossary printed with the statement, edition **01/2023**                                | https://www.cal-online.co.il/media/o1klqq1j/beur-munachim.pdf                                           |
| Cal notices            | הודעות על שינויים (prime changes, fee changes, a 2015 rate table)                                                                  | https://www.cal-online.co.il/about/legal-reports/changes/                                               |
| Discount קרדיט         | Discount Bank's credit plans for the Cal, Diners and Max cards it distributes                                                      | https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/          |
| Mizrahi rates          | Mizrahi-Tefahot's rate disclosure, including a table for Cal and Diners cards, from 3.9.2026                                       | https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/      |

---

## 0. Corrections to the brief and to the background doc

1. **"לארג'" is not Cal's 19–36-payment credit.** It is **Diners Large** (דיינרס לארג'), a Diners plan that spreads the _monthly bill_ (from ₪300) over **3 to 12** fixed monthly payments: "Diners Large - באפשרותכם לפרוס את סך הרכישות החודשיות בארץ ובחו"ל לתשלומים חודשיים קבועים. ניתן לפרוס את החיוב החודשי (החל מסכום של 300 ש"ח) ל- 3 עד 12 תשלומים." **[primary]** [Diners – תשלומים בחו"ל](https://www.diners.co.il/live-wisley/payment-date/). Its rate, like קרדיט's, is fixed when the credit is taken (§5.3).
2. **Cal's own documents give no name for 19–36-payment קרדיט, and no numbers for it.** The ₪950 minimum deal, the ₪50 minimum payment and "fixed for life" come **only from Discount**, describing the Cal and Diners cards it distributes, under the name **"קרדיט פלוס"** **[primary for Discount-distributed cards]**. Neither Cal agreement mentions 19–36 payments, ₪950 or ₪50. Both say only that the number of payments and the minimum payment are "כפי שייקבעו על-ידי כאל מעת לעת".
3. **"Cal's 2% minimum" is the revolving service's rule (שירות אשראי מתגלגל), not CalChoice's.** The service charges the higher of the amount you set and **2% of total obligations on the card** (not 2% of the rolled balance). **CalChoice** is a separate card with a different floor: at least **4% of the balance or ₪200**, and by default the highest of 25% of the period's purchases, 4% and ₪200 (§6).
4. **The "day 4" interest rule applies to cards Cal issues directly.** A bank-issued Cal card can differ: Bank Yahav's agreement starts קרדיט interest at the **regular billing date** (§5.2).

---

## Summary table

"Cal-direct" means a card issued by Cal or Diners itself (non-bank). "Bank-issued" means a card issued through a bank. For bank-issued cards, the bank sets the rates (§1.3).

| Rule / rate                                                       | Value                                                                                                                                 | Basis                           | Kind                                  | As of      | Source                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------- | ---------- | -------------------------------------------------- |
| Billing dates offered                                             | 2, 10 or 15 of the month                                                                                                              | Issuer's list                   | Rule                                  | 2026-10-08 | [primary] Diners Classic page; Bank Jerusalem      |
| CalChoice billing dates                                           | 2 or 10, with fixed "activity periods" (15th–14th for the 2nd; 23rd–22nd for the 10th)                                                | Agreement §28.2                 | Rule                                  | 06.2025    | [primary]                                          |
| When a domestic purchase is billed                                | On the first billing date after the voucher reaches Cal, whatever the purchase date                                                   | Agreement §7.1–7.2; Yahav §5.4  | Rule                                  | 06.2025    | [primary]                                          |
| Foreign-currency fee (עמלת עסקאות במט"ח)                          | **3.0%** of the converted amount                                                                                                      | Fee schedule                    | Fixed (except "special arrangements") | 1.6.2026   | [primary] Cal fees                                 |
| Exchange rate                                                     | Bank of Israel representative rate **known on the day Cal captures the deal**. Other currencies go through USD at the network's rate. | Agreement §8.2                  | Rule                                  | 06.2025    | [primary]                                          |
| Shekel purchase at a foreign merchant                             | No conversion fee in Cal's schedule. A deal in ₪ is charged in ₪.                                                                     | Agreement §8.1; fee note (10)   | Rule                                  | 06.2026    | [primary]                                          |
| Cash withdrawal abroad                                            | 3.0%; ₪16 when the account is in the same currency                                                                                    | Fee schedule                    | Fixed                                 | 1.6.2026   | [primary]                                          |
| תשלומים (interest-free)                                           | First payment on the first billing date after the deal                                                                                | Agreement §7.2(ג)               | Rule                                  | 06.2025    | [primary]                                          |
| קרדיט 3–18: minimums                                              | Deal ₪75, payment ₪25                                                                                                                 | Discount (Cal and Diners cards) | Minimums                              | 2026-10-08 | [primary for Discount]                             |
| קרדיט פלוס 19–36: minimums                                        | **Deal ₪950, payment ₪50**                                                                                                            | Discount (Cal and Diners cards) | Minimums                              | 2026-10-08 | [primary for Discount]; UNCONFIRMED for Cal-direct |
| קרדיט פלוס: rate path                                             | Fixed for the deal's whole life (Discount, for Cal cards). Bank Yahav's contract allows a reset after a set number of payments.       | §4.4                            | Rule                                  | 2026-10-08 | [primary]                                          |
| קרדיט: start of interest (Cal-direct)                             | From the day **Cal pays the merchant or acquirer, "within 4 days on average" of the deal**                                            | Agreement §27.10(ב)             | Rule                                  | 06.2025    | [primary]                                          |
| קרדיט: start of interest (Bank Yahav)                             | From the **regular billing date** after the deal                                                                                      | Yahav §7.11.1                   | Rule                                  | 2024       | [primary]                                          |
| קרדיט: repayment                                                  | Equal Spitzer payments. The first payment is on the billing date **after** the regular billing date.                                  | Agreement §27.10(ג)             | Rule                                  | 06.2025    | [primary]                                          |
| קרדיט rate, regular cards (basic, local, international, business) | 15.25% nominal / 16.36% מתואמת                                                                                                        | Bank (Mizrahi)                  | Published per card type               | 3.9.2026   | [primary] Mizrahi                                  |
| קרדיט rate, gold, Diners Platinum, Diners Mastercard              | 13.00% / 13.80%                                                                                                                       | Bank (Mizrahi)                  | Per card type                         | 3.9.2026   | [primary] Mizrahi                                  |
| קרדיט rate, Visa or Mastercard Platinum                           | 11.25% / 11.85%                                                                                                                       | Bank (Mizrahi)                  | Per card type                         | 3.9.2026   | [primary] Mizrahi                                  |
| ויזה עדיף / Diners Large rate, regular cards                      | 14.35% / 15.33%                                                                                                                       | Bank (Mizrahi)                  | Per card type                         | 3.9.2026   | [primary] Mizrahi                                  |
| 30+ rate, regular cards                                           | 15.25% / 16.36%                                                                                                                       | Prime ± margin                  | Per card type                         | 3.9.2026   | [primary] Mizrahi                                  |
| Express loan (הלוואת אקספרס), local and international cards       | 16.25% / 17.52%                                                                                                                       | Bank (Mizrahi)                  | Per card type                         | 3.9.2026   | [primary] Mizrahi                                  |
| Security-forces club card, all plans                              | 5.75% / 5.90%                                                                                                                         | Bank (Mizrahi)                  | Club rate                             | 3.9.2026   | [primary] Mizrahi                                  |
| Revolving service (שירות אשראי מתגלגל): minimum                   | Higher of the amount set, **2% of total obligations**, and the amount over the limit                                                  | Cal page; glossary              | Rule                                  | 2026-10-08 | [primary]                                          |
| Revolving service: ₪ floor                                        | ₪200 (Bank Jerusalem). Cal-direct: "סכומים מותרים שייקבעו"                                                                            | —                               | Minimum                               | 2026-10-08 | [primary for Bank Jerusalem]; UNCONFIRMED for Cal  |
| Revolving: interest                                               | Prime + margin, on the **deferred amount only**, from the billing date it is deferred to the next one                                 | Agreement §27.12(ד); glossary   | Variable                              | 06.2025    | [primary]                                          |
| CalChoice: minimum you may choose                                 | Higher of **4% of the balance** and **₪200** (or the whole balance if it is under ₪200)                                               | Agreement §28.5                 | Rule                                  | 06.2025    | [primary]                                          |
| CalChoice: default if you choose nothing                          | Highest of **25% of the period's purchases**, **4% of the balance** and **₪200**                                                      | Agreement §28.2(ד)              | Rule                                  | 06.2025    | [primary]                                          |
| Late interest                                                     | The legal maximum, actual days / 365 or 366 (21.9% cap today, per the background doc)                                                 | Agreement §21.3                 | Max                                   | 06.2025    | [primary]                                          |
| Over the limit                                                    | The excess is charged immediately                                                                                                     | Agreement §6.4, §27.12(ג)(2)    | Rule                                  | 06.2025    | [primary]                                          |
| Instant loan (הלוואה מיידית)                                      | 3–84 payments, up to ₪200,000; rate **6.95%–16.85%** a year, personal                                                                 | Cal                             | Range                                 | 2026-10-08 | [primary]                                          |
| Spreading the monthly bill (פריסת חיוב)                           | 1–36 payments, or up to 60 on Cal-direct cards; first payment on the 2nd billing date                                                 | Cal                             | Rule                                  | 2026-10-08 | [primary]                                          |
| Card fee, regular and platinum                                    | ₪17.90 a month; reduced or waived by monthly spend                                                                                    | Fee schedule                    | Fixed                                 | 1.6.2026   | [primary]                                          |
| Card fee, Shufersal card                                          | ₪12.90 a month (first year free) plus a ₪3 club fee after year 1                                                                      | Fee schedule; Shufersal page    | Fixed                                 | 2026       | [primary]                                          |
| Early repayment of deals or of revolving                          | ₪30, or ₪20 in direct channels                                                                                                        | Fee schedule                    | Fixed                                 | 1.6.2026   | [primary]                                          |
| Early repayment of a loan or spread                               | ₪60                                                                                                                                   | Fee schedule                    | Fixed                                 | 1.6.2026   | [primary]                                          |
| Paper statement                                                   | No fee in Cal's schedule                                                                                                              | —                               | —                                     | 06.2026    | [primary] (absence)                                |
| Billing-date change                                               | No fee in Cal's schedule. Done online and effective within 5 days.                                                                    | Cal FAQ                         | —                                     | 2026-10-08 | [primary]                                          |

---

## 1. Identity

### 1.1 Legal entities and brands **[primary]** (Cal agreement §1, definition of "כאל")

- **כרטיסי אשראי לישראל בע"מ** ("כאל", "Cal") issues the **Visa** and **Mastercard** cards.
- **דיינרס קלוב ישראל בע"מ** issues the **Diners Club** cards.
- **כאל (מימון) בע"מ** and **דיינרס (מימון) בע"מ** are the lenders that provide the interest-bearing credit ("המעמידות את האשראי נושא הריבית בהתאמה לחברות"). Cal's pages name them as "המלווה: כאל מימון בע"מ / דיינרס מימון בע"מ".
- **כאל פקדונות בע"מ** holds money loaded onto prepaid cards and payment accounts.
- Diners Club Israel is a Cal brand. diners.co.il now runs on Cal's platform, and both agreements cover Visa, Mastercard and Diners together.
- **Ownership** **[secondary]**:
  - Discount Bank owns about 72% (71.84%) and First International (FIBI) about 28%.
  - The sale to Union Investments and Harel was signed at the end of 2025. Discount confirmed on 23.9.2026 that it had collapsed over a Competition Authority condition.
  - Discount must sell Cal by **May 2027** under the Strum law.
  - Sources: [Wikipedia – כרטיסי אשראי לישראל](https://he.wikipedia.org/wiki/כרטיסי_אשראי_לישראל); [TheMarker 23.9.2026](https://www.themarker.com/markets/2026-09-23/ty-article/.premium/000001a0-cd4e-d06e-afab-fddf98450000); [Calcalist](https://www.calcalist.co.il/market/article/h1yrpvzfyx).
  - It changes no card term today, but a new owner could.

### 1.2 Distribution: which banks issue Cal cards

- **Cal's fee schedule (06.2026)** lists the cards it covers: "ויזה, מסטרקארד ודיינרס חוץ בנקאיים, או שהונפקו על ידי: **דיסקונט, מרכנתיל, מזרחי, הבינלאומי, איגוד, יהב, ירושלים** וכרטיס **דיינרס של בנק לאומי ובנק הפועלים**". **[primary]** [Cal fees](https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf)
  - The fees index page adds separate schedules "לכרטיסים שהונפקו על ידי בנק הפועלים" and "...בנק לאומי". These are the Diners cards of those banks. **[primary]** [Cal – עמלות](https://www.cal-online.co.il/more/amlot/)
- **Cal's "בנקים" tab** of club and bank cards lists Discount, Mercantile and Mizrahi-Tefahot. **[primary]** [Cal – כרטיסי מועדונים וארגונים](https://www.cal-online.co.il/card/all-cards/)
- **Other banks' own pages confirm it:**
  - Bank Jerusalem offers "כרטיס ויזה כאל". **[primary]** [Bank Jerusalem](https://www.bankjerusalem.co.il/current-account/credit-cards)
  - Mercantile routes card service to Cal's call centre. **[primary]** [Mercantile](https://www.mercantile.co.il/private/credit-cards/)
  - Bank Yahav has its own Visa Cal agreement. **[primary]**
  - Mizrahi publishes rates for "ויזה כאל-דיינרס". **[primary]**
- **Igud** merged into Discount. It is still listed in the fee schedule.
- **FIBI** is listed in the fee schedule, but I found no FIBI page for Cal cards: FIBI's credit-cards URL returned 404. **UNCONFIRMED**: which issuer FIBI-group banks (FIBI, Massad, Otsar HaHayal, Pagi) hand new customers today.
- **Leumi and Hapoalim** distribute Diners cards only. They issue Max and Isracard cards for Visa and Mastercard (the Max and Isracard files cover those).

### 1.3 Who sets the credit rates on a bank-issued Cal card: the bank

- **Cal's statement glossary**: "מעמיד האשראי – האשראי בתוכניות השונות ותנאי האשראי נקבעים ע"י הבנק המנפיק ו/או כאל בע"מ ו/או כאל מימון בע"מ, ו/או דיינרס בע"מ ו/או דיינרס מימון בע"מ". **[primary]**
- **Cal's off-bank card page**: "תנאי כרטיס אשראי בנקאי ומסגרת האשראי שלו נקבעים על ידי הבנק. מסגרת האשראי בכרטיס חוץ בנקאי ... נקבעת באופן בלעדי על ידי חברת האשראי". **[primary]** [Cal – כרטיס אשראי חוץ בנקאי](https://www.cal-online.co.il/ecredit/financial-terms/off-bank-credit-card/)
- **Cal's קרדיט חו"ל page**: "ריבית אשר נקבעת על ידי הבנק או על ידי חברת Cal". **[primary]** [Cal – קרדיט חו"ל](https://www.cal-online.co.il/ecredit/credit-abroad/)
- **Yahav agreement**: the קרדיט rate is "בשיעור שייקבע מפעם לפעם על-ידי **בנק יהב**" (§7.11.1). The revolving and 30+ margins are Yahav's too (§7.10.1, §7.13.3, §7.19.1). The credit is "אשראי מבנק יהב באמצעות Cal" (§7.5). **[primary]**
- **Discount**: the 30+ rate is "בהתאם לשעורים הנהוגים **בבנק**". The קרדיט and 30+ rates are "מפורטים במכתב שנשלח בסמוך להנפקת הכרטיס ובדף הפירוט החודשי". **[primary]** [Discount קרדיט](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)
- **Mizrahi** publishes its own rate table per Cal card type, which bears this out. **[primary]**
- **For the catalog**, the rate key is **(bank, card type)**, not (Cal, card type). A Cal-direct card uses Cal's own rates, which **Cal does not publish on its site**: they appear only in the issuing letter and the statement (§10).

### 1.4 Co-branded and club cards: which Cal issues today

| Card / club                                         | Issuer today                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shufersal** (כרטיס אשראי שופרסל)                  | **Cal**, still issued                                                 | Cal sells it ("להזמנת כרטיס אשראי שופרסל"); fee ₪12.90 a month in the 06.2026 schedule; first year free, then a ₪3 monthly club fee **[primary]** [Cal – שופרסל](https://www.cal-online.co.il/cards/shufersal/). Shufersal moved to Cal from Max (Leumi Card) and paid Max ₪72.8m **[secondary]** [ynet](https://www.ynet.co.il/articles/0,7340,L-5661062,00.html)                                                                                                                                                                                                                                                                                                                                         |
| **El Al FlyCard**                                   | **Moved to Isracard.** Relaunched on Mastercard and Amex, not Diners. | ynet, 07.06.26: "פלייקארד ... הועבר לאחרונה בעסקת ענק מחברת האשראי כאל למתחרה ישראכרט ... רובם עדיין לא עברו לישראכרט מכאל" **[secondary]** [ynet](https://www.ynet.co.il/economy/article/sywyklqwfl); El Al's FlyCard pages point to Isracard **[primary]** [El Al](https://www.elal.com/heb/frequentflyer/flycard/flycard_all). Discount tells existing holders: "יש לך כרטיס Fly Card? אפשר להחליף למועדון FlyAll ולהישאר עם כרטיס האשראי הקיים" **[primary]** [Discount](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/). **Legacy Cal FlyCards still exist.** Cal's schedule still lists "כרטיס מועדון תעופה" fees (₪19.90 bronze; ₪38.90 premium, with ₪4 off on Diners) |
| **FlyAll**                                          | **Cal**, new                                                          | Cal's replacement aviation club card, on Diners or Mastercard **[primary]** [Cal – FlyAll](https://www.cal-online.co.il/cards/flyall)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Hever** (חבר, security forces and their families) | **Isracard**                                                          | Isracard sells "כרטיס אשראי מועדון 'חבר'" with a 1% FX fee and no card fee **[primary for Isracard]** [Isracard – חבר](https://www.isracard.co.il/credit-cards/chever). Mizrahi still lists a Cal "**מועדון כוחות הבטחון**" rate of 5.75% / 5.90% on all plans. That reads as legacy Cal club cards. **UNCONFIRMED**: whether Cal still issues any security-forces club card                                                                                                                                                                                                                                                                                                                               |
| **CalChoice / CalChoice+**                          | **Cal**, its own revolving card                                       | [Cal – CalChoice](https://www.cal-online.co.il/ecredit/calchoice/) **[primary]**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Other Cal clubs on its site                         | Cal                                                                   | CalFix, Cal FixBack, מועדון "שווה", High Miles, Diners Extra Family / Extra Home, Visa Infinite, CashCal / CashCal Pro, MyCal (prepaid), Miles & More, "שלנו" (kibbutz members), CAL VIP365 (HaMashbir) **[primary]** for the Cal pages; **[secondary]** for H&O, from hon.co.il                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Bank-branded                                        | Cal                                                                   | Discount "מפתח דיסקונט", Mercantile "סמייל", Mizrahi-Tefahot cards **[primary]**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Do club cards' credit terms differ?**

- **Yes, by card type.** Cal: "שיעורי ריבית שונים ... בהתאם לסוג הכרטיס ו/או לכל קריטריון אחר" (agreement §27.8(א)). Mizrahi's table shows the effect (§5.4). **[primary]**
- **The fees differ by club** (Shufersal ₪12.90; aviation clubs ₪19.90 or ₪38.90; no spend-based fee discount for aviation, Shufersal or CashCal cards).
- **CalChoice** has a different repayment model (§6).
- **UNCONFIRMED**: any Shufersal-specific or FlyAll-specific interest rate.

---

## 2. Billing

### 2.1 Dates on offer

- **Diners**: "מועדי החיוב המוצעים בכרטיס Diners הינם ה-2 לחודש, ה- 10 וה-15 לחודש. באפשרותכם לשנות את מועד החיוב **אחת לרבעון**". **[primary]** [Diners Classic](https://www.diners.co.il/clubs/clasic/) (the quote is from Cal's search snippet of that page; the rendered page lists the card types)
- **Bank Jerusalem (Visa Cal)**: "תוכל לבחור אם החיוב החודשי שלך יתבצע ב-2, 10 או 15 בכל חודש". **[primary]** [Bank Jerusalem](https://www.bankjerusalem.co.il/current-account/credit-cards)
- A consumer site also lists the **23rd** for Cal Mastercard Platinum. **[secondary]** [hon.co.il](https://www.hon.co.il/מאסטרקארד-פלטיניום-cal/). **UNCONFIRMED.**
- **CalChoice**: the 2nd or the 10th (agreement §28.2(ג)). **[primary]**
- **Contract**: the date is chosen by the customer "מן המועדים המקובלים בכאל, מעת לעת" (§7.1). Cal may change or add dates on **14 days'** notice (§7.3). **[primary]**

### 2.2 Cut-off: which billing date a purchase falls into

- **Cal-direct**: Cal charges "בגין שוברים שהוצגו לכאל לפני כן" (§7.1). A domestic voucher is charged "במועד החיוב החודשי הקרוב" after it is reported (§7.2(א)). **[primary]**
- **Yahav, more explicit**: the customer is charged for deals "אשר ייקלטו אצל המנפיקה בתקופה ... שבין מועד חיוב אחד לבין מועד החיוב שלאחריו ... בלי להתחשב בתאריך העסקה הרשומים על השוברים" (§5.4). **[primary]**
- **So the cycle is set by the capture date at Cal, not the purchase date.** No source gives a fixed cut-off in days before the billing date for ordinary cards. **UNCONFIRMED.**
- **CalChoice has an exact calendar cycle** (§28.2(ח)): **[primary]**
  - for billing on the **2nd**, purchases from the **15th to the 14th** of the previous month (billing on 2 October covers 15 August to 14 September);
  - for billing on the **10th**, purchases from the **23rd to the 22nd** (billing on 10 October covers 23 August to 22 September).
  - Cal markets this lag as "17 ימי אשראי נוספים חינם מדי חודש". **[primary]** [Cal – תכניות חיוב](https://www.cal-online.co.il/ecredit/credit-products)

### 2.3 Who decides the billing date on a bank-issued card

- The customer chooses "מבין המועדים המקובלים אצל **המנפיקה**" (Yahav §5.4, §5.12). The list of dates is the issuer's.
- The issuer may require one date for all cards debiting the same account (§5.8). It may refuse a change if one was made in the last **90 days** (§5.12). **[primary]**
- **Changing the date**: online in the Cal app ("שינוי מועד חיוב"), "תוך 5 ימים העדכון שבחרת יבוצע". **[primary]** [Cal – שירות אונליין](https://www.cal-online.co.il/self-service/)
- **After a change**, Cal may keep charging deals captured before the change on the old date until they are paid off (§27.8(ב)). Revolving credit applies only on the new date. **[primary]**

---

## 3. Foreign purchases

- **Fee: 3.0%** "מסכום העסקה" for every deal deposited in a currency other than ₪, debit or credit, except deals with no conversion. **[primary]** [Cal fees 06.2026](https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf), note (10).
  - **History:** 2.8% from 1.8.2017 (Cal notices), and still 2.8% in the 01/2023 statement glossary. **UNCONFIRMED**: when it rose to 3.0%. I saw no notice of the rise on the notices page.
  - Cal's prepaid "ויזה נטען" cards: 2.8% from 1.4.2018 (Cal notices). **[primary]**
- **Rate**, per the agreement (§8.2): **[primary]**
  - **(a)** a currency with a Bank of Israel representative rate is converted "על-פי השער היציג ... **הידוע ביום קליטת העסקה במחשבי כאל**";
  - **(b)** any other currency goes to USD at the network's rate on the day the network captures it, then to ₪ at the USD representative rate on the day Cal captures it.
  - The fee note puts it as "על פי השער היציג **בתוספת 3%**".
  - In a foreign-currency account, the deal is converted at the international companies' rates + 3%.
- **When it is charged.** For a card billed in ₪, foreign deals and cash "יחויבו בסמוך ליום קליטת העסקה בכאל". The exceptions are deals made in Israel, which are charged on the billing date, and "special arrangements". **[primary]** (statement glossary; agreement summary §5: "בגין עסקות במט״ח: ככלל החיוב הינו מיידי")
  - **Deferring them to the billing date costs interest.** "בכרטיס VISA או Mastercard הריבית בתוכנית אשראי לחו"ל מחושבת מיום הגעת החיוב לכאל ועד מועד החיוב הקרוב ... **למעט כרטיסי פלטינום**". **[primary]** (glossary)
  - This is the "**חיוב חו"ל חודשי**" plan: interest at the 30+ rate from receipt to repayment (§27.11). **[primary]**
  - **Diners**: foreign purchases are charged on the regular billing date "ללא תשלום ריבית עבור דחיית החיוב", and Diners Platinum gets up to 30 days' free credit. **[primary]** [Diners](https://www.diners.co.il/live-wisley/payment-date/)
  - **Revolving-service and CalChoice cards** gather foreign purchases and cash to the billing date without interest. **[primary]** [Cal – תכניות חיוב](https://www.cal-online.co.il/ecredit/credit-products). For CalChoice, Cal may still charge bridge interest from capture (§28.14(ב)).
- **Shekel purchases at foreign websites**: a voucher in ₪ is charged in ₪ "ללא תלות במקום עריכת העסקה" (§8.1). The fee applies only where a conversion happens (note 10). **No separate fee for a ₪ deal abroad appears in Cal's schedule.** **[primary]**
- **Other FX fees**: buying foreign currency from a money changer with the card costs $6. A cash withdrawal abroad costs 3.0%, or ₪16 in a same-currency account. **[primary]**
- **Cancelled foreign deals** are credited, with the fee, at the original deal's terms if the credit arrives before Cal sends the debit. Otherwise the credit is a separate deal, converted on its own day (§8.3). **[primary]**

---

## 4. Deal types

### 4.1 רגילה

- Charged in full on the next billing date. Cal's definition: "עסקה אשר הלקוח מחויב בגינה במועד החיוב החודשי הסמוך למועד ביצועה" (agreement §1). **[primary]**
- In Cal's data: `trnTypeCode` **5**. Standing orders (הוראת קבע) are **9**. **[secondary]** [israeli-bank-scrapers, visa-cal.ts](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/visa-cal.ts)

### 4.2 תשלומים (interest-free, merchant-funded)

- Cal charges "לשיעורין, בתשלומים חודשיים שווים ורצופים כפי שצוינו בשובר ... החל ממועד החיוב החודשי שיחול סמוך לאחר מועד ביצוע העסקה" (§7.2(ג)). **[primary]**
- The merchant sets the number of payments.
- Yahav adds that if merchant and customer agree to start later, the payments start "החל ממועד החיוב הבא לאחר מועד החיוב הסמוך" (§5.6). **[primary]**
- **CPI- and dollar-linked variants**: Yahav defines "המדד" (CPI) for linked payments. Cal's data has `amtBeforeConvAndIndex` (the amount before conversion and indexation). **UNCONFIRMED**: Cal's specific rules for linked payments.
- In Cal's data: `trnTypeCode` **8**, with `numOfPayments` and `curPaymentNum`. **[secondary]**
- **On CalChoice**, the first payment is on the billing date after the end of the activity period in which the deal was made (§28.13). **[primary]**

### 4.3 קרדיט, 3–18 payments

- Cal pays the merchant in full and collects in installments with interest (§27.10(א)). **[primary]**
- **Minimums for Cal and Diners cards at Discount**: "3 עד 18 תשלומים נושאי ריבית. הריבית הינה קבועה (אינה משתנה לאורך חיי העסקה), סכום המינימום לעסקה עומד על **75 ש"ח** וסכום המינימום לתשלום הוא **25 ש"ח**". **[primary]** [Discount קרדיט](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)
  - **For Cal-direct cards**, Cal's agreement says only "בכפוף למספר התשלומים המותר לכל עסקה ולסכום מינימום לכל תשלום, כפי שייקבעו על-ידי כאל מעת לעת" (§27.10(ג)).
  - A payment-gateway help page gives the same ₪25 and 3-payment minimum generally. **[secondary]** [Cardcom](https://support.cardcom.solutions/hc/he/articles/10922712148754)
- **First payment**: on the billing date **after** the regular billing date. On the first billing date the deal appears "לידיעה" (Discount: "*במועד החיוב הראשון העסקה תופיע לידיעה בדף הפירוט החודשי"). **[primary]**
- **The slip** must be marked "קרדיט". A slip asking for an impossible number of payments may be adjusted by Cal or charged in full (§27.4, §27.10(ג)). **[primary]**
- In Cal's data: `trnTypeCode` **6**, "credit". **[secondary]**

### 4.4 Long קרדיט, 19–36 payments ("קרדיט פלוס")

**The name**

- **Discount**, for "כרטיסי אשראי שהונפקו בכ.א.ל ובדיינרס": "תוכנית **קרדיט פלוס** מאפשרת לחלק את סכום הרכישה ל- **19 עד 36** תשלומים נושאי ריבית. הריבית הינה ריבית קבועה (**אינה משתנה לאורך חיי העסקה**), סכום המינימום לעסקה עומד על **950 ש"ח** וסכום המינימום לתשלום הוא **50 ש"ח**". **[primary for Discount-distributed Cal and Diners cards]** [Discount קרדיט](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)
- **Cal's own site and agreements** do not mention "קרדיט פלוס", 19–36 payments, ₪950 or ₪50. **UNCONFIRMED**: the label Cal uses on statements, and whether Cal-direct and other banks' Cal cards use the same minimums.
- **"לארג'" is a different product** (§0, §4.7).

**The ₪950 deal and ₪50 payment**

- **Confirmed for Discount-distributed Cal and Diners cards**, as published by Discount, seen 2026-10-08.
- Discount shows the **same figures for Max-issued cards**, where Max's own page gives ₪50 a payment above 18 payments.
- **Not confirmed** for Cal-direct cards or for other banks.

**Fixed for life?**

- **Cal-direct**:
  - The agreement says a change in the base rate "יחול אך ורק על אשראי שטרם נלקח" (§27.10(ב)).
  - Every Cal prime notice repeats: "בהתייחס לאשראי הניטל במסגרת תכניות האשראי **קרדיט ו-לארג׳**, יחול השינוי אך ורק בהתייחס לעסקות שיבוצעו החל ממועד השינוי". **[primary]** [Cal notices](https://www.cal-online.co.il/about/legal-reports/changes/)
  - There is **no** mid-deal reset clause in the 06.2025 agreement.
  - The same clause adds "ומעת לעת ייתכנו שינויים גם במרווח על הריבית הבסיסית". It does not say whether a margin change can touch existing deals. Read with the next sentence, it appears not to. **UNCONFIRMED.**
- **Bank-issued, Yahav**: the contract **allows a reset** (§7.17.1): **[primary]**
  - "על אף האמור לעיל לעניין שיעור הריבית על אשראים מסוג **קרדיט, לארג' ו/או הלוואות אקספרס**, אם אשראי מהסוגים הנ"ל נקבע לפירעון במספר תשלומים העולה על **מספר קובע** שייקבע על-ידי Cal מפעם לפעם ... אזי שיעור הריבית בגין יתרת האשראי הבלתי מסולקת לתקופה שתחילתה מתום המספר הקובע של התשלומים ... תהיה הריבית הנהוגה באותו הסדר אשראי, כפי שתהיה בתוקף בתחילת יתרת התקופה הנ"ל".
  - This is a **reset to the then-current plan rate**, unlike Max's "shift by the prime change".
  - No source gives the "מספר קובע" or shows it in use, and Discount says Cal cards' קרדיט פלוס is fixed for life. **UNCONFIRMED** whether any bank applies it.
- **For the catalog**: model Cal 19–36 as **fixed for the deal's life**, with an optional per-bank reset after N payments (N unknown).

**Its rate**

- No source publishes a separate 19–36 rate for Cal. Mizrahi has one "ויזה/דיינרס בתשלומים קבועים" column.
- **UNCONFIRMED** whether 19–36 deals open at the same rate as 3–18 deals.

### 4.5 דחוי / 30+ / "חיוב נדחה"

- **"פלוס 30"**: "עסקת אשראי, במסגרתה נדחה פירעון סכום העסקה הרלבנטית בחודש ימים כנגד תשלום ריבית" (§27.9(א)). It is repaid "במועד החיוב הסמוך לאחר מועד החיוב הרגיל" (§27.9(ג)). **[primary]**
- **Rate**: "הריבית הבסיסית ... בתוספת או בניכוי מרווח", recalculated pro rata when prime moves (§27.9(ב)).
- **The interest is charged quarterly**, "אחת ל-3 חודשים, במועד החיוב שבכל אחד מהחודשים ינואר, אפריל, יולי ואוקטובר". The first charge covers the period from the regular billing date (§27.9(ג)). **[primary]**
- **Not available on CalChoice** (§28.12).
- **History.** Cal's 2001 relaunch folded "ויזה-עדיף וויזה+30" into "תשלום עדיף" **[secondary]** [ynet 2001](https://www.ynet.co.il/articles/0,7340,L-1080052,00.html). 30+ still exists: it is in the 2025 agreement and the 2026 notices.
- **Diners equivalent**: "חודש פלוס חו"ל", one more month of deferral of the foreign charges, with interest. **[primary]** [Diners](https://www.diners.co.il/live-wisley/payment-date/)
- **Merchant-side deferrals** (interest-free) follow §5.6 of Yahav (above). **UNCONFIRMED**: Cal's labels for them.

### 4.6 Spreading after the fact

**פריסת החיוב החודשי** (spreading the monthly bill), Cal's main after-the-fact plan

- **Terms** **[primary]** [Cal – פריסה לתשלומים](https://www.cal-online.co.il/ecredit/debit-spread/); agreement §27.13:
  - 1–36 payments, or **up to 60 on cards Cal issues directly**;
  - before the billing date (up to 24 hours before), or after it, in which case the money is credited back within 3 business days;
  - the first payment is on the second billing date after the spread;
  - the rate is "**ייקבע במועד נטילת הפריסה**" and is fixed; by default it is the קרדיט rate unless Cal sets a separate "ריבית פריסה לתשלומים";
  - not available to customers on the revolving service (§27.6).
- **Discount**: up to 36 equal payments "נושאי ריבית קבועה", future or retroactive. **[primary]**
- **Early repayment** costs ₪60 (fee note 14).

**Spreading a single past purchase**

- Cal's app lists "לפרוס עסקה" among its actions. **[primary]** [Cal – אתר ואפליקציה](https://www.cal-online.co.il/service-and-support/cal-digital/)
- **UNCONFIRMED**: its terms, minimum and rate.

**Diners Large** — see §4.7.

### 4.7 Other plans

| Plan                                                | What it is                                                                                                  | Rules                                                                                                                                                                                                                          | Source                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **קרדיט חו"ל**                                      | All foreign deals and cash in foreign currency are split in advance into **2–18** interest-bearing payments | First payment on the **second** billing date; "עד למועד החיוב הראשון תחול ריבית גישור"; interest accrues from Cal's payment to the network (§27.10(ב)); join by phone (03-5726444), or via the bank for bank-issued cards      | [primary] [Cal – קרדיט חו"ל](https://www.cal-online.co.il/ecredit/credit-abroad/); agreement §27.10(ד–ה)  |
| **חיוב חו"ל חודשי**                                 | Foreign deals deferred to the regular billing date                                                          | Interest at the 30+ rate from receipt to repayment                                                                                                                                                                             | [primary] §27.11                                                                                          |
| **Diners Large** (דיינרס לארג')                     | Spreads the monthly bill, domestic and foreign                                                              | From ₪300; **3–12** fixed monthly payments; rate fixed per credit (Cal notices). 2015 rate: 8.65% / 9.00% "לכל סוגי הכרטיסים". Mizrahi today puts it in one column with ויזה עדיף: 14.35% / 15.33% on regular cards            | [primary] Diners page; Cal notices; Mizrahi                                                               |
| **תשלום עדיף** (and "ויזה עדיף", "תשלום עדיף חו"ל") | An older pooled-credit plan. Deals go into a "סל", repaid by a **tiered monthly amount**                    | "החזר תשלום עדיף" tiers: balance up to ₪1,500 → ₪75; ₪1,501–3,000 → ₪150; ₪3,001–5,000 → ₪250; ₪5,001–8,000 → ₪400; ₪8,001–10,000 → ₪500; then +₪250 for each further ₪5,000. Prime-based (moves with prime). Not on CalChoice | [primary] statement glossary 01/2023; Yahav §7.19.3; Cal notices. The same tiers in 2001 [secondary] ynet |
| **Revolving service, CalChoice**                    | §6                                                                                                          |                                                                                                                                                                                                                                |                                                                                                           |
| **Instant / express loan**                          | §7.4                                                                                                        |                                                                                                                                                                                                                                |                                                                                                           |

---

## 5. Interest on קרדיט

### 5.1 Basis and when it is fixed

- **Cal-direct**: the rate is "שייקבע מפעם לפעם על-ידי כאל" for that credit type ("ריבית קרדיט"). It "יכול להשתנות בהתאם לשינויים בשיעור הריבית הבסיסית" with "שינויים גם במרווח" from time to time. **A base-rate change applies only to credit not yet taken.** A deal carries "ריבית קרדיט שתהיה בתוקף **במועד קבלת השובר אצל כאל**" (§27.10(ב)). **[primary]**
- **So the rate is prime + margin at the moment Cal receives the voucher, then fixed** (§4.4).
- **Bank-issued (Yahav)**: the same, with the bank setting the rate (§7.11.1). **[primary]**
- Cal's prime notices confirm it: prime changes re-price "30+, עדיף, תשלום עדיף, שירות אשראי מתגלגל, וכרטיס Calchoice" immediately, and "קרדיט ו-לארג'" only for new deals. **[primary]**

### 5.2 When interest starts: the "day 4" rule, resolved

**Cal-direct cards** (agreement 06.2025/22 §27.10(ב), the same wording in the 09.2020 edition) **[primary]**:

> "...והיא תצטבר החל מן המועד בו כאל תשלם את תמורת העסקה לבית העסק או לחברת הסליקה שסלקה את העסקה או לארגון הבינלאומי ... יובהר כי כאל משלמת את תמורת העסקה לבית העסק או לחברת הסליקה שסלקה את העסקה בישראל **בתוך 4 ימים בממוצע מיום ביצוע העסקה**, ולארגון הבינלאומי - מיד עם קבלתו אצלה של הדיווח על העסקה, באופן שמועד תחילת החיוב בריבית בגין עסקה שבוצעה באשראי מסוג "קרדיט" ו-"קרדיט חו"ל" **חל קודם למועד חיוב החשבון בגינה**."

What this means:

- **Interest starts on the day Cal actually pays the acquirer.** That is not a fixed "day 4": 4 days is the **published average** for domestic deals.
- **For קרדיט חו"ל, interest starts the moment Cal receives the network's report.**
- **The interest-free period an ordinary purchase gets, from the deal to the regular billing date, does not apply to Cal-direct קרדיט.**

**Bank-issued Yahav cards are different** (Yahav §7.11.1) **[primary]**: "יישא ריבית קרדיט שתהיה בתוקף במועד קבלת השובר אצל Cal ... **אשר תיצבר החל ממועד החיוב הרגיל הסמוך**". That is the regular billing date, the same as Isracard and Amex.

**Worked timing** (card billed on the 10th; a קרדיט purchase on 20.10.2026; Cal pays the acquirer about 24.10):

| Card                | Interest accrues from                               | First payment | Deal shown "לידיעה" |
| ------------------- | --------------------------------------------------- | ------------- | ------------------- |
| Cal-direct          | about 24.10.2026 (the payment date to the acquirer) | 10.12.2026    | 10.11.2026          |
| Yahav (bank-issued) | 10.11.2026 (the regular billing date)               | 10.12.2026    | 10.11.2026          |

- **Cal-direct accrues about 17 more days of interest** before the first payment (47 days against 30).
- **UNCONFIRMED: how those extra days are billed.** The Spitzer schedule runs "החל ממועד החיוב הראשון, שיבוצע לאחר מועד החיוב הסמוך" (§27.10(ג)). The stub interest could be:
  - folded into the principal or the first payment;
  - built into a schedule that starts at the accrual date;
  - charged as a separate line.
  - Neither agreement says which, and no real statement was available.
- Cal's own loan contract settles the matching question for loans: stub interest is "תשולם במועד חיוב ההלוואה הסמוך" (§27.14(ב)(3)). That suggests, but does not prove, a separate stub charge.
- **UNCONFIRMED**: Discount's and Mizrahi's own agreements for Cal cards. I read only Yahav's. They may follow either rule.

### 5.3 Published rates

**Mizrahi**, for Cal and Diners cards, from 3.9.2026 **[primary]** [Mizrahi rates](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/). Each cell is nominal (תעריפית) / מתואמת.

| Card type                                                                   | ויזה עדיף / דיינרס לארג' | ויזה/דיינרס בתשלומים קבועים (קרדיט) | ויזה 30+      | הלוואות אקספרס |
| --------------------------------------------------------------------------- | ------------------------ | ----------------------------------- | ------------- | -------------- |
| בייסיק                                                                      | 14.35 / 15.33            | 15.25 / 16.36                       | 15.25 / 16.36 | —              |
| מקומי, בינלאומי                                                             | 14.35 / 15.33            | 15.25 / 16.36                       | 15.25 / 16.36 | 16.25 / 17.52  |
| עיסקי                                                                       | 14.35 / 15.33            | 15.25 / 16.36                       | 15.25 / 16.36 | 16.15 / 17.40  |
| עיסקי זהב / גלובוס; זהב; Diners Platinum; Diners Mastercard; Mastercard זהב | 11.50 / 12.13            | 13.00 / 13.80                       | 13.00 / 13.80 | 16.15 / 17.40  |
| Visa / Mastercard פלטינום (and Mastercard Platinum Business)                | 10.95 / 11.52            | 11.25 / 11.85                       | 11.25 / 11.85 | 13.25 / 14.08  |
| מועדון כוחות הבטחון                                                         | 5.75 / 5.90              | 5.75 / 5.90                         | 5.75 / 5.90   | 5.75 / 5.90    |

- **Kind**: published per card type, as Mizrahi's bank rates for the Cal cards it distributes.
- They are not maxima or ranges. Cal and banks may set personal rates.
- Every row moved by −0.25 points at the 3.9.2026 prime cut.
- **Check against (1 + i/12)^12 − 1**: every pair matches to 0.01 except **Visa Platinum express loan, 13.25% → 14.09% computed, 14.08% published**, a 0.01 rounding gap.
- **In prime terms**: the regular-card קרדיט rate of 15.25% is prime + 10.50. Gold is prime + 8.25. Platinum is prime + 6.50. The security-forces club is prime + 1.00.

**Cal's own, dated 26.2.2015** (prime 1.60%; historical, for the structure only) **[primary]** [Cal notices](https://www.cal-online.co.il/about/legal-reports/changes/):

| Plan                     | Card type                       | Nominal                | מתואמת                 | Check                                                          |
| ------------------------ | ------------------------------- | ---------------------- | ---------------------- | -------------------------------------------------------------- |
| קרדיט                    | gold / business / Diners Globes | 11.45%                 | 12.07%                 | m = 12 ✓                                                       |
| קרדיט                    | platinum                        | 8.25%                  | 8.57%                  | m = 12 ✓                                                       |
| קרדיט                    | others                          | 11.75%                 | 12.40%                 | m = 12 ✓                                                       |
| ויזה עדיף                | gold / platinum / others        | 9.45 / 6.05 / 9.55%    | 9.79 / 6.19 / 9.90%    | **m = 4** (quarterly) ✓; m = 12 does not match                 |
| ויזה 30+                 | gold / platinum / others        | 5.05 / 4.05 / 6.80%    | 5.15 / 4.11 / 6.98%    | **m = 4** ✓, consistent with interest charged quarterly (§4.5) |
| תשלום עדיף               | gold / platinum / others        | 12.30 / 8.90 / 13.15%  | 13.02 / 9.27 / 13.97%  | m = 12 ✓                                                       |
| שירות אשראי מתגלגל       | gold / platinum / others        | 13.60 / 11.10 / 15.50% | 14.48 / 11.68 / 16.65% | m = 12 ✓                                                       |
| דיינרס לארג' / חודש פלוס | all cards                       | 8.65%                  | 9.00%                  | m = 12 ✓                                                       |

The notice adds: "הודעה זו אינה חלה על מחזיקי כרטיסי אשראי CalChoice להם נקבעת ריבית אישית".

- **Note:** in 2015 Cal published 30+ and עדיף with **m = 4**. Mizrahi publishes 30+ today with m = 12 (15.25% → 16.36%).
- **Store the convention per plan.**
- **Cal-direct rates today are not published on Cal's site.** They appear only in the card's letter and statement (§10). **UNCONFIRMED** for Cal-direct cards.

### 5.4 Repayment method and first payment

- **Spitzer**: "בתשלומים חודשיים שווים ורצופים של קרן וריבית לפי לוח 'שפיצר' (בתמצית: סכום ההחזר הכולל הינו קבוע...)" (§27.10(ג)). **[primary]**
- **First payment**: "החל ממועד החיוב הסמוך לאחר מועד החיוב הרגיל". **[primary]**
- **Day count for קרדיט: not stated** in Cal's or Yahav's agreement. **UNCONFIRMED** (30/360 against actual/365).

---

## 6. Revolving credit

### 6.1 Products and names

| Name                                         | Period                                                              | Notes                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **שירות אשראי מתגלגל**                       | Current                                                             | A service on an existing card, not a separate card **[primary]** [Cal page](https://www.cal-online.co.il/ecredit/fixed-monthly-charge/)                                                                |
| "חיוב חודשי קבוע" / "תוכנית חיוב חודשי קבוע" | Older name, still in the Yahav agreement and the statement glossary | The same mechanism. Yahav: "אשראי מסוג חיוב חודשי קבוע הוא מסוג 'אשראי מתגלגל'" (§7.13.4) **[primary]**                                                                                                |
| "שיטה אמריקאית"                              | 2001                                                                | Pick a monthly amount; the excess is deferred **[secondary]** ynet 2001                                                                                                                                |
| **CalChoice** / **CalChoice+**               | Current                                                             | A **separate card type**. A card converted to CalChoice works only inside the CalChoice program (§28.3). Each month you choose what to pay. Cal's glossary calls it "כרטיס אשראי מתגלגל" **[primary]** |
| תשלום עדיף / ויזה עדיף                       | Legacy                                                              | Pooled credit with tiered repayment (§4.7)                                                                                                                                                             |

### 6.2 How you join

- **Revolving service**: online, in the app or by phone (03-5726444). You identify by ID number and set the monthly amount. **[primary]**
- It is subject to underwriting and a credit-bureau check. **The lender is Cal Mimun or Diners Mimun.**
- A customer on the service cannot take new "פריסת החיוב החודשי" credit (§27.6).
- **CalChoice**: order the card and choose "לבחור בכל חודש כמה לשלם – CalChoice", or ask to convert an existing card. **[primary]**
- **Bank-issued cards**: Bank Jerusalem and Mizrahi offer "אשראי מתגלגל" on Cal cards. **[primary]**

### 6.3 The minimum monthly payment

**Revolving service**

- Cal: "סכום החיוב החודשי הוא הסכום שנקבע על ידך **או 2% מסך ההתחייבויות** או סכום החריגה ממסגרת הכרטיס" (whichever is highest). **[primary]** [Cal page](https://www.cal-online.co.il/ecredit/fixed-monthly-charge/)
- The statement glossary: "סכום החיוב המינימאלי יהיה 2% מההתחייבויות בכרטיס או סכום החריגה ממסגרת האשראי (ככל שקיימת) הגבוה בינהם". **[primary]**
- **"התחייבויות" means the card's total obligations**, including all unpaid balances in every credit plan (agreement §1, "סכום ההתחייבויות בכרטיס"; Yahav §7.13.2).
  - **So it is 2% of total obligations, not of the rolled balance or of the limit.**
- The agreement leaves the % to Cal: "סכום השווה לשיעור (באחוזים), שייקבע על-ידי כאל מעת לעת מסכומן הכולל של ההתחייבויות" (§27.12(ג)). **[primary]**
- **If the month's spend is below your amount**, only the actual spend is charged.
- **If the difference is below a minimum Cal sets**, no credit is given and the full bill is charged (§27.12(ג)(1)).
- **Any excess over the available limit** is charged at once (§27.12(ג)(2)).
- **The ₪ floor**:
  - Bank Jerusalem: "סכום החיוב החודשי יהיה **מ-200 ₪** ועד גובה מסגרת האשראי". **[primary for Bank Jerusalem]**
  - Cal-direct: not stated publicly ("בכפוף לסכומים המותרים שייקבעו על-ידי כאל"). **UNCONFIRMED.**

**CalChoice** (agreement §28) **[primary]**

- **Default if you set nothing** (§28.2(ד)), the highest of:
  - **25%** of the purchases in the last activity period (including current installments of ongoing deals and cash withdrawals);
  - **4%** of the total balance due, which includes loans, fees, card fees, interest, the CalChoice cash program and the rolled basket with its interest ("סך האשראי המתגלגל");
  - **₪200**, or the whole balance if it is below ₪200.
- **The least you may choose** (§28.5, §28.6): **4%** of the balance due or **₪200**, whichever is higher. Any over-limit amount is added.
- **Cal's page**: "25% מסך העסקות החדשות שביצעת באותו החודש, או 4% מסך כל ההתחייבויות בכרטיסך (החדשות והקודמות), או 200 ₪ – הסכום הגבוה מביניהם". **[primary]** [Cal – CalChoice](https://www.cal-online.co.il/ecredit/calchoice/)
- **Cards issued up to 31.12.2012** use an older "תשלום מינימום CalChoice" table: ₪200 for a balance up to ₪5,000, ₪400 for ₪5,001–10,000, ₪600 for ₪10,001–15,000, then +₪200 per ₪5,000. **[primary]** (statement glossary)

### 6.4 Which balance bears interest; grace

**Revolving service**

- **Only the deferred part bears interest.** Cal: "הריבית מתווספת **אך ורק ליתרת הסכום הנדחה** לחודש העוקב. אם לדוגמא ביצעת עסקאות בסך 6,000 ₪ וגובה החיוב החודשי שהגדרת הוא 5,000 ₪ ... היתרה בסך 1,000 ₪ תדחה למועד החיוב הבא ותישא ריבית". **[primary]**
- **Interest runs from billing date to billing date.** "יתרת הסכום ... תידחה למועד החיוב הבא ותישא ריבית שתחושב **ממועד החיוב בו נדחתה ועד למועד החיוב שלאחריו**" (glossary). **[primary]**
- **The grace period is kept.** New purchases, including cash withdrawals and foreign purchases, gather to the billing date "ללא ריבית" ([Cal – תכניות חיוב](https://www.cal-online.co.il/ecredit/credit-products)). Interest starts only on what is deferred at the billing date.
- **One caveat.** The page also says "חיובים שנדחו למועד התשלום הבא לרבות: משיכות מזומן מכספומט וחיובים אחרים בארץ ובחו"ל, נושאים ריבית עד למועד החיוב הבא שלהם בהתאם לתנאי הכרטיס". I read this as referring to the deferred amounts. **UNCONFIRMED** whether cash withdrawals carry bridge interest before the billing date on a revolving card.

**CalChoice**

- The unpaid balance, "כולל הריבית שנצברה", is new credit from the billing date to the next one (§28.10).
- **Losing the grace period**: "במקרה בו בתחילת תקופת הפעילות קיים אשראי מתגלגל ... תהא כאל רשאית להודיע כי סכומי העסקות ... יישאו את ריבית הכרטיס, **מתום תקופת הפעילות ועד למועד החיוב**" (§28.11). **[primary]** So while a balance rolls, new purchases can bear interest from the end of the activity period.
- **Bridge interest** ("ריבית גישור") runs from capture to the billing date on express loans and foreign deals (§28.14).
- **Payments go to the cheapest balance first**: "ייגבה סכום פירעון ה-CalChoice תחילה בגין החיוב אשר בעבורו נקבע שיעור הריבית הנמוך ביותר" (§28.15). **[primary]**

### 6.5 Day count and compounding

- **Day count: not stated** for the revolving service or CalChoice in Cal's agreement. **UNCONFIRMED.**
- **Compounding is monthly in effect.** The deferred credit and its interest are repaid on the next billing date "כחלק מסכום החיוב החודשי" (§27.12(ה)). Whatever is deferred again, interest included, becomes new credit (§28.10 says so explicitly for CalChoice).
- That matches the m = 12 pairs Cal published for "שירות אשראי מתגלגל" (2015: 15.50% → 16.65%).
- **Rate changes**:
  - a prime change between billing dates applies from the next billing date;
  - the margin may change "בתום רבעון קלנדרי ו/או תוקף המסגרת" (§27.12(ד), §28.2(ז)).
  - The credit limit is renewed quarterly (§26(ד)).

### 6.6 Published rate

- **Cal-direct revolving and CalChoice**: personal rates, shown on the statement. **Not published.** **UNCONFIRMED.**
  - CalChoice rates are "ריבית אישית" (2015 notice).
- **Bank-distributed**: Mizrahi lists no separate revolving column for Cal. Its "ויזה עדיף" column is the nearest: 14.35% / 15.33% on regular cards. **UNCONFIRMED** whether that rate applies to the revolving service on Mizrahi's Cal cards.

### 6.7 Paying more than the minimum

- **Revolving service**: change the monthly amount at any time up to **48 hours before the billing date**, online or by phone. **[primary]**
- **Early repayment** on request (§27.15): it must reach Cal in reasonable time before the billing date, and interest runs to the actual payment. **[primary]**
  - The fee is **₪30**, or ₪20 in direct channels. The schedule says "פירעון מוקדם או מיידי של עסקות ₪30 ... העמלה תיגבה ... וכן **בפירעון מיידי של שירות אשראי מתגלגל**".
- **CalChoice**:
  - **Choosing the amount**: from the end of the activity period until **3 business days** before billing (§28.5). The statement is posted about two weeks before billing.
  - **Immediate repayment**, full or partial, is available at any time by phone (\*3338), in the app or on the site. Interest is charged pro rata to the repayment day (§28.8).
- **A contradiction in Cal's own texts:**
  - §28.8 says immediate repayment is "כפוף לתשלום עמלה";
  - §28.18 says the basket can be repaid "ללא עמלה";
  - the schedule charges ₪30 or ₪20 for "פירעון מיידי של שירות אשראי מתגלגל".
  - **UNCONFIRMED** which applies to CalChoice.

### 6.8 How it appears on the statement

The statement glossary (01/2023) uses these labels **[primary]**:

- **"סכום פרעון CalChoice שחויב ב...(תאריך)"**: the amount you chose. If you chose none, the default (or, for old cards, the minimum).
- **"פרעון מיידי CalChoice ב...(תאריך)"**: an immediate repayment. It includes interest from the last billing date to the repayment day.
- **"יתרת CalChoice חדשה"**: the balance from the previous statement, less repayments, plus purchases in the last activity period.
- **"אשראי נושא ריבית"**: the amounts not repaid on the billing date.
- **"תוכנית חיוב חודשי קבוע"**: the revolving service.
- **"החזר תשלום עדיף"**: the tier table for תשלום עדיף.
- **UNCONFIRMED**: the label for the rolled balance on a revolving-service card. Max's "סל מצטבר" does not appear in Cal's documents. The agreement speaks of "סל האשראי הפתוח" (§28.18).
- Cal's API has `fixDebitAmount` and `totalBasketAmount` (background doc). **[secondary]**

---

## 7. Other rates

### 7.1 Late payment (ריבית פיגורים)

- **The rule**: interest from the due date to actual payment, "שתחושב על-פי מספר הימים שחלפו בפועל חלק 365 או 366", "בשיעור החוקי המקסימאלי שיהיה קיים אותו מועד ושעליו תודיע כאל ... בדו״ח הפירוט" (agreement §21.3; Yahav §17.3). **[primary]**
- **Basis**: the Fair Credit Law cap for late interest. That is **21.9%** today (background doc §2.4).
- **Day count**: actual/365 or 366.
- **Compounding (m)**: not stated. **UNCONFIRMED.**
- **Fees on top**: ₪5 per late-payment notice; ₪150 for a lawyer's warning letter. **[primary]**

### 7.2 Going over the limit (חריגה)

- **No over-limit rate.** The excess "יחויב ... מיידית, בסכום החריגה או בחלקו, אף אם נקבע מועד פירעון נדחה" (§6.4). On revolving cards it is charged at once (§27.12(ג)(2)).
- **CalChoice**: the excess is added to the payment (§28.4). **[primary]**

### 7.3 Cash withdrawals

**In Israel**

- "**משיכת מזומן בארץ** ... עסקה זו תחוייב מיידית עם ביצועה. למעט הסדרים מיוחדים" (glossary). **[primary]**
- Domestic cash is outside the "monthly charge" (§27.1).
- **Bank-issued (Yahav)**: the customer chooses the next billing date or a debit **within 48 hours** (§5.10). **[primary]**
- **On revolving and CalChoice cards**, domestic and foreign cash gather to the billing date without interest. If rolled, it bears revolving interest. **[primary]**
- **Fees**: Cal charges none for domestic cash. The ATM operator or bank may charge (§18.2).
- A withdrawal counts against the limit for 7 days from the debit (§26(ז)(1)). **[primary]**

**Abroad**

- The fee is **3.0%**, or **₪16** when the account is in the same currency. It applies at an ATM or a counter.
- The amount is charged on capture.
- **Deferred to the billing date**, it bears bridge or 30+ interest (§3).
- **Under קרדיט חו"ל** it can be spread over 2–18 payments. **[primary]**

### 7.4 Loans on the card

**הלוואה מיידית / הלוואת אקספרס** **[primary]** [Cal – הלוואה מיידית](https://www.cal-online.co.il/ecredit/instant-loan/); agreement §27.14

- **Terms**:
  - up to **₪200,000**, over **3–84** payments;
  - for customers of any bank, inside or outside the card's limit;
  - credited within 3 business days.
- **Rate**: personal. "**טווח הריביות מינימום 6.95% ומקסימום 16.85% שנתי**".
  - Cardholders who show another lender's offer get "ריבית נמוכה ב- 1% פחות ... ועד ריבית מינימום P+2%" (P + 2% = 6.75% today, which is below the stated minimum of 6.95%).
  - **Kind**: range.
  - The rate may be **fixed** (prime + margin at origination, then fixed) or **prime-linked**.
- **Payments**:
  - equal payments of principal and interest from the **second** billing date;
  - interest for the stub up to the first billing date is paid on that date ("ריבית גישור – ריבית יחסית על התקופה שבין מועד קבלת ההלוואה למועד החיוב הקרוב").
- **Fees**:
  - early repayment ₪60 (note 14);
  - "טיפול באשראי ובביטחונות" of 1.18% (minimum ₪1,180, maximum ₪5,900) on loans **over ₪100,000** [primary] [Cal credit fees](https://www.cal-online.co.il/media/rqgd1oq4/taarifon010825.pdf).
- **Cal's calculator** shows ₪30,000 at 8.5%: ₪1,371 over 24, ₪954 over 36 and ₪483 over 84 payments.
  - A plain Spitzer gives ₪1,363.67, ₪947.03 and ₪475.09.
  - **UNCONFIRMED** what makes up the difference (likely stub interest or a fee).
- **Cal mislabels the effective rate.** Its loan FAQ defines מתואמת as "הריבית הנומינלית בתוספת עלויות נלוות כגון עמלות". The Banking Rules definition excludes fees (background doc §2.4). Treat Cal's own definition as loose.

**Mizrahi's express-loan rates** for Cal cards: 13.25%–16.25% nominal (§5.3). **[primary]**

**Car loan**: offered [Cal – הלוואה לרכב](https://www.cal-online.co.il/ecredit/car-loan/). Terms not read.

---

## 8. Fees that affect a budget

From Cal's fee schedule, edition 06.2026, in force from 1.6.2026 **[primary]** [Cal fees](https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf):

| Fee                                                                                 | Amount                                    | Notes                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card fee: regular cards (local, international, business, gold)                      | ₪17.90 a month                            | Spend ₪5,000 a month → ₪9.90; ₪7,500 → free                                                                                                                                                                            |
| Card fee: platinum                                                                  | ₪17.90 a month                            | Spend ₪7,500 → ₪15.90; ₪12,000 → free                                                                                                                                                                                  |
| Shufersal                                                                           | ₪12.90 a month                            | No spend discount; first year free; ₪3 a month club fee after year 1                                                                                                                                                   |
| Cal Lite                                                                            | ₪5.90                                     |                                                                                                                                                                                                                        |
| Prepaid                                                                             | ₪9.90                                     |                                                                                                                                                                                                                        |
| PayBox Young                                                                        | ₪7.90                                     |                                                                                                                                                                                                                        |
| Aviation club, bronze                                                               | ₪19.90                                    | ₪2 off for a combined Diners FlyCard; no spend discount                                                                                                                                                                |
| Aviation club, premium                                                              | ₪38.90                                    | ₪4 off on Diners                                                                                                                                                                                                       |
| CashCal Pro                                                                         | ₪19.90                                    | No spend discount                                                                                                                                                                                                      |
| Miles & More Platinum                                                               | ₪19.90                                    |                                                                                                                                                                                                                        |
| Infinite                                                                            | ₪400                                      | The period is not stated; **UNCONFIRMED** (likely yearly)                                                                                                                                                              |
| Diners Extra, Secret Flights                                                        | Waived                                    | At ₪5,000 a month of spend                                                                                                                                                                                             |
| Bank-issued cards                                                                   | "בהתאם לתעריף הבנק הרלוונטי"              | Set by the bank                                                                                                                                                                                                        |
| Replacement card                                                                    | ₪30 (₪15 in direct channels); ₪40 express |                                                                                                                                                                                                                        |
| Early or immediate repayment of deals, or of revolving                              | ₪30 (₪20 in direct channels)              |                                                                                                                                                                                                                        |
| Early repayment of a loan or spread; immediate repayment of עדיף, תשלום עדיף or 30+ | ₪60                                       |                                                                                                                                                                                                                        |
| Unjustified chargeback                                                              | ₪15                                       |                                                                                                                                                                                                                        |
| Document retrieval                                                                  | ₪10 (free in direct channels)             |                                                                                                                                                                                                                        |
| Paper statement                                                                     | **No fee in the schedule**                | Statements go by post unless you join digital statements. Digital statements are free and offered as the alternative [primary] [Cal – דפי פירוט דיגיטליים](https://www.cal-online.co.il/service-and-support/cal-mail/) |
| Changing the billing date or the deal type                                          | **No fee in the schedule**                |                                                                                                                                                                                                                        |

**Fee history** **[primary]** (Cal notices)

- **Card fee, regular cards**: ₪14.90 → ₪15.90 (1.5.2019) → ₪17.90 (2.3.2025).
- **Card fee, platinum**: ₪19.90 → ₪17.90 (2.3.2025).
- **Shufersal**: ₪12.90 flat from year 2, from the May 2020 billing date.

---

## 9. Exports

- **Cal's own Excel or CSV layout: UNCONFIRMED.**
  - I could not log in.
  - Cal's pages describe the online views: by card and billing date (up to 18 months back and into future months), the last 90 days by purchase date, and a search by merchant, dates and "סוגי עסקאות". **[primary]** [Cal – כל העסקאות](https://www.cal-online.co.il/self-service/alltransactions/)
  - Cal's pages do not mention an Excel download.
- **Cal's data API**, from open-source code that reads it **[secondary]** [israeli-bank-scrapers visa-cal.ts](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/visa-cal.ts):
  - **Deal type**: `trnType` (text) and `trnTypeCode`: 5 regular, **6 credit (קרדיט)**, 8 installments, 9 standing order.
  - **Installments**: `numOfPayments`, `curPaymentNum`.
  - **Amounts**: `trnAmt` (the deal amount), `amtBeforeConvAndIndex` (the charged amount before conversion and indexation), `trnCurrencySymbol`, `debCrdCurrencySymbol`.
  - **Dates**: `trnPurchaseDate` and `debCrdDate` (the billing date).
  - **Merchant**: `merchantName`, `branchCodeDesc` (category).
  - **Comments**: `transTypeCommentDetails` (free-text comments such as installment notes), `comments`, `onGoingTransactionsComment`.
  - **Flags**: `debitSpreadInd` (part of a monthly-bill spread), `isSpreadPaymenstAbroad` (קרדיט חו"ל), `earlyPaymentInd`, `refundInd`.
  - **Pending deals**: `numberOfPayments`, `firstPaymentAmount`.
  - **No field carries an interest rate or a per-installment interest amount.**
- **How installments are worded** ("תשלום k מתוך N") on Cal's statement or export: **UNCONFIRMED**. The numbers exist as `curPaymentNum` / `numOfPayments`.
- **Interest per installment**: not in the data. Solve it from the deal amount, N and the charged installment (background doc §7.2).
  - For Cal-direct קרדיט, the stub interest (§5.2) may make the first installment differ.

---

## 10. Changes and notification

- **Prime changes.** Cal posts a notice on its changes page for every prime change, effective two days after the Bank of Israel decision. It says the prime-based plans (30+, עדיף, תשלום עדיף, revolving, CalChoice) move "בשיעור דומה ... כנזכר בדפי הפירוט החודשיים", while קרדיט and לארג' change only for new deals. **[primary]** [Cal notices](https://www.cal-online.co.il/about/legal-reports/changes/)
  - The 2026 notices are dated 8.1, 28.5, 9.7 and 3.9.2026.
  - The 9.7 and 3.9 notices dropped CalChoice from the list ("שירות אשראי" only). **UNCONFIRMED** whether that is just a wording change.
- **A notice of a base-rate change counts as notice of the rate change** on all prime-based credit, even if it does not name the plan (§27.8(א)). **[primary]**
- **Contract changes**: on 30 days' notice. Notice sent with the statement is presumed received within 3 business days. A customer may cancel within 30 days and keep the old terms for past deals (§39.1). **[primary]**
- **Billing-date changes by Cal**: 14 days' notice (§7.3). Yahav says 30 days (§5.9). **[primary]**
- **Fee changes**: posted on the changes page. Examples: card fees on 2.3.2025; the FX fee at 2.8% on 1.8.2017.
- **The current agreement edition** is 06.2025/22, effective 1.9.2025. It changed provisions under privacy-law amendment 13 and "הנחיות בנק ישראל בנוגע לשירות אשראי מתגלגל". **[primary]**
- **Where the rates are published**: in the card's issuing letter and the monthly statement (Discount; Cal: "שיעור הריבית מופיע גם בדף הפירוט החודשי שלך"). **Cal does not publish a current rate table on its site.** **[primary]**
- **Announced changes**: none seen for card terms.
  - The **sale of Cal** collapsed in September 2026 and must be re-run by May 2027 [secondary].
  - The **FlyCard migration** to Isracard is under way (from June 2026) [secondary].

---

## UNCONFIRMED / gaps

1. **What Cal calls 19–36-payment קרדיט, and its minimums.** "קרדיט פלוס", the ₪950 deal and the ₪50 payment are confirmed only on Discount's page for Discount-distributed Cal and Diners cards. Cal's agreements and site give no name, range or minimums. Unknown for Cal-direct cards and for Mizrahi, Mercantile, Yahav and Jerusalem cards.
2. **Whether a 19–36 deal is fixed for life on every Cal card.** It is for Cal-direct cards (agreement and notices) and for Discount (stated). Bank Yahav's contract allows a reset to the then-current rate after a "מספר קובע" of payments (§7.17.1). The number and its use are unknown.
3. **How Cal-direct קרדיט's early interest is billed.** Interest accrues from Cal's payment to the acquirer, about 4 days after the deal on average, ahead of the billing date. Whether the extra roughly 2–3 weeks of interest sits inside the Spitzer payments or is charged separately is unknown. Also unknown: the day count for קרדיט (30/360 or actual/365), and whether Discount's and Mizrahi's Cal agreements follow Cal's rule or Yahav's.
4. **Opening rate for 19–36 deals.** Whether they open at the same rate as 3–18 deals: no source publishes a separate rate.
5. **Cal-direct current rates.** Rates for cards Cal issues directly (קרדיט, revolving, CalChoice, 30+) are not published on Cal's site. The only current table is Mizrahi's, for its own Cal cards. The latest Cal-own table is from 2015.
6. **Revolving service details.** Unknown: the ₪ floor on Cal-direct cards (Bank Jerusalem: ₪200); the day count; and whether cash withdrawals on a revolving card carry bridge interest before the billing date.
7. **CalChoice immediate-repayment fee.** The agreement (§28.8 against §28.18) and the fee schedule contradict each other.
8. **Late-interest compounding (m).** Not stated.
9. **Billing dates beyond 2, 10 and 15.** One consumer site lists the 23rd for Mastercard Platinum. There is no published cut-off for ordinary cards.
10. **FX fee history.** The date the fee rose from 2.8% to 3.0% is unknown.
11. **Exports.** The layout of Cal's Excel or CSV export, how installments are worded, and the statement label for a revolving balance are all unknown. Only API field names were seen [secondary].
12. **Spreading a single past purchase.** Terms of "לפרוס עסקה" (single-deal split in the app): its rate, minimum and range.
13. **Club cards.**
    - Whether Cal still issues any security-forces club card. Hever is now Isracard; Mizrahi still lists a Cal "מועדון כוחות הבטחון" rate.
    - Whether Shufersal or FlyAll cards carry their own interest rates.
    - How long legacy Cal FlyCards will keep running.
14. **FIBI.** Whether FIBI-group banks still issue Cal cards to new customers. FIBI is in Cal's fee list, but no FIBI page was reached.
15. **Instant-loan calculator.** The gap between Cal's example payments and plain Spitzer is unexplained. So is the gap between its stated floor of P + 2% (6.75%) and its stated minimum of 6.95%.
16. **Linked installments.** CPI-linked and dollar-linked installments: Cal's specific rules were not found.
17. **Infinite card fee.** Whether the ₪400 is yearly or monthly.
