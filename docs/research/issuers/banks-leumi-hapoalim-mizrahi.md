# Bank side of credit cards: Leumi, Hapoalim, Mizrahi-Tefahot

Research for the Bookandry issuer catalog. Scope: the **bank** side of bank-issued cards (כרטיס בנקאי) at Bank Leumi, Bank Hapoalim and Mizrahi-Tefahot (Union Bank was merged into Mizrahi). It covers which issuers each bank distributes, who sets the credit rates, the published rate tables, billing and debit rules, the bank's own card credit products, and rules that differ from the issuer's.

All sources were read on **2026-10-08** with a headless Playwright Chromium. Leumi and Hapoalim block plain fetches but served pages to the browser. PDFs and XLS files were downloaded and read. Prime is 4.75% from 3.9.2026 (Hapoalim and Mizrahi both state it; see §H.1 and §M.5).

Formula check: ריבית מתואמת = (1 + nominal/m)^m − 1. **Every card-credit pair Mizrahi publishes fits m = 12**, except two that are 0.01 lower than the rounded result (13.25% → 14.08 against a computed 14.0850; 6.95% → 7.17 against 7.1757). That looks like truncation, not a different m. **Every overdraft pair (Mizrahi and Hapoalim), and the Tefahot-card and student-card pairs, fit m = 4** (quarterly). They do not fit m = 12. Each table below says which m it fits.

---

## Summary table (one row per bank and rate)

"Kind": **max** = the bank's published maximum, **list** = the published tariff rate for that card type (the actual rate can be lower), **personal** = set per customer and not published. Source tags: [P] = primary, [S] = secondary.

| Bank         | Rate / rule                                                                                  | Value (nominal / מתואמת)                                                                                                                                                    | Basis                                                                 | Kind     | As of                                                       | Source                                       |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- | ----------------------------------------------------------- | -------------------------------------------- |
| **Leumi**    | Who lends on card credit                                                                     | The **bank**: "הבנק הוא המלווה של האשראי בכרטיס"                                                                                                                            | —                                                                     | rule     | form 319-56, ed. 08.25                                      | [P] Leumi card terms §29.1                   |
| Leumi        | קרדיט / long credit (אשראי קרדיט)                                                            | **Not published**. Fixed at the deal date: prime on that date ± a margin, for the life of the credit                                                                        | prime ± margin, fixed                                                 | personal | 08.25                                                       | [P] §29.2–29.3                               |
| Leumi        | Revolving (מסלול חיוב חודשי קבוע)                                                            | **Not published**                                                                                                                                                           | prime ± margin, variable                                              | personal | 08.25                                                       | [P] §29.3                                    |
| Leumi        | Late interest on card debts                                                                  | "ריבית פיגורים כמפורט בתנאי הניהול": the legal maximum, else the rate in the bank's "לוח גילוי נאות". **Figure UNCONFIRMED**                                                | per account terms                                                     | max      | terms 310-93, ed. 06.26                                     | [P]                                          |
| Leumi        | Refinancing a card-company loan into a Leumi loan                                            | prime + 1% (minimum) to prime + 10% (maximum), 2–96 months                                                                                                                  | prime + margin                                                        | range    | page undated (its example uses prime 6% "as of 4/1/2024")   | [P] leumi.co.il/he/loan_maximum              |
| Leumi        | FX fee, Leumi (Max/Cal/Isracard-operated) cards                                              | 3% (FIRST 2%, UNITED 1.5%)                                                                                                                                                  | % of the deal                                                         | list     | tariff of 01/10/2026                                        | [P] tariff ch. 6(א)                          |
| Leumi        | FX fee, Diners                                                                               | 3%                                                                                                                                                                          | % of the deal                                                         | list     | 01/10/2026                                                  | [P] tariff ch. 6(ב)                          |
| **Hapoalim** | Who lends on card credit                                                                     | The **bank**, for Isracard/Amex, Cal and Max cards alike: "אשראי המועמד על-ידי הבנק"                                                                                        | —                                                                     | rule     | agreements of Aug 2026                                      | [P]                                          |
| Hapoalim     | הסדר קרדיט (revolving)                                                                       | **Not published**. Rate = prime + "תוספת הסיכון להסדר קרדיט". Repay 5% of principal a month, minimum ₪100                                                                   | prime + risk margin, variable; interest charged quarterly; actual/365 | personal | Aug 2026                                                    | [P] §19.1                                    |
| Hapoalim     | הסדר קרדיט בתשלומים (3–36 payments)                                                          | **Not published**. Fixed when the voucher is received. 3–18 payments: at least ₪25 principal each (₪75 minimum deal). 19–36 payments: at least ₪50 each (₪950 minimum deal) | prime + risk margin, fixed per deal; 30/360                           | personal | Aug 2026                                                    | [P] §19.2                                    |
| Hapoalim     | הסדר אשראי מהיר (card loan)                                                                  | **Not published**. Minimum ₪1,000                                                                                                                                           | prime + risk margin, fixed per draw; 30/360                           | personal | Aug 2026                                                    | [P] §19.3                                    |
| Hapoalim     | Late interest on card debts (ריבית פיגורים)                                                  | Defined as the highest max rate on a shekel current account with no approved line. Today: **16.35% / 17.38%**                                                               | prime 4.75% + 11.60%                                                  | max      | from 3.9.2026                                               | [P] card agreement §1 + rate notice 1.9.2026 |
| Hapoalim     | FX fee, Isracard/Max/Cal cards                                                               | 2.90% (USD/EUR and other currencies)                                                                                                                                        | % of the deal                                                         | list     | short tariff of 01/10/2026                                  | [P]                                          |
| Hapoalim     | FX fee, Amex / Diners                                                                        | 2.5% / 3%                                                                                                                                                                   | % of the deal                                                         | list     | 01/10/2026                                                  | [P]                                          |
| **Mizrahi**  | Isracard regular, Mastercard, Amex Blue/Credit, Supercard: ישראקרדיט/אמק"ס קרדיט (revolving) | **14.15% / 15.10%**                                                                                                                                                         | fixed figure (moves with prime)                                       | list     | from 3.9.2026                                               | [P] Mizrahi rates page                       |
| Mizrahi      | Same cards: קרדיט בתשלומים קבועים                                                            | **15.25% / 16.36%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Same cards: אשראי מהיר                                                                       | **16.25% / 17.52%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Cal Basic/Local/International (Visa, Diners, Mastercard): ויזה עדיף/דיינרס לארג'             | **14.35% / 15.33%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Same cards: בתשלומים קבועים and ויזה 30+                                                     | **15.25% / 16.36%** each                                                                                                                                                    | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Same cards (not Basic): הלוואות אקספרס                                                       | **16.25% / 17.52%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Max International: חודש חופש / הלוואות ברגע ל"ק                                              | **16.25% / 17.52%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Max International: קרדיט בתשלומים קבועים                                                     | **15.50% / 16.65%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Max International: אשראי מתגלגל                                                              | **14.50% / 15.50%**                                                                                                                                                         | same                                                                  | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Tefahot card (mortgage holders' credit line)                                                 | **5.75% / 5.88%** to **8.45% / 8.72%**, by account-opening date (8.45% for accounts opened from 15.4.2020)                                                                  | fixed figure; m = 4                                                   | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Student card                                                                                 | 6.65% / 6.82% (accounts opened before 1.6.2009); 7.65% / 7.87% (from 1.6.2009)                                                                                              | m = 4                                                                 | list     | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | Late interest / over-limit on the account the card debits (עו"ש חובה, no line)               | **18.55% / 19.88%** (prime + 13.80%)                                                                                                                                        | prime + margin; m = 4                                                 | max      | 3.9.2026                                                    | [P]                                          |
| Mizrahi      | FX fee by issuer                                                                             | Isracard 2.7%, Amex 2.5%, Cal 3.00%, Max 3% (FIRST 2%)                                                                                                                      | % of the deal                                                         | list     | Isracard/Amex/Cal tariff 1.10.2026; Max annex dated 1.12.17 | [P]                                          |

---

# Part L: Bank Leumi (בנק לאומי לישראל בע"מ)

### L.1 Identity and distribution

- **Bank cards are issued jointly by the bank and an operating card company. The bank chooses which company operates each card.** "חברת כרטיסי האשראי מנפיקה ביחד עם הבנק את הכרטיס ועוסקת בתפעול ההנפקה ... כרטיסים שונים מתופעלים ע"י חברות כרטיסי אשראי שונות, לפי בחירת הבנק." The bank may replace the operator at any time after giving notice. **[primary]** [Leumi – תנאי הצטרפות לכרטיס חיוב, form 319-56, ed. 08.25, §2.2](https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/hozim%20ahidim/319-56_ACC.pdf) (seen 2026-10-08)
- **Operators named in Leumi's tariff.** Leumi-logo cards are run by **Max** ("מקס איט פיננסים בע"מ (לשעבר חברת לאומי קארד)") and by **Cal and Isracard** ("החברות כ.א.ל וישראכרט"). The card-fee rules differ by operator (§L.8). Diners cards have their own chapter, 6(ב). **[primary]** [Leumi tariff, individuals and small businesses, ch. 6, updated 01/10/2026 (XLSX)](https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.xlsx) ([PDF](https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.pdf))
- **Leumi–Cal agreement.** Leumi and Cal signed a long-term agreement to issue and operate Leumi's **Visa, Mastercard and Diners** cards, effective 1.2.2019 subject to approvals. **[primary, 2018]** [Leumi press release, 12.8.2018](https://www.leumi.co.il/Articles/44187). **UNCONFIRMED**: today's split of the Leumi card base between Max, Cal and Isracard.
- **Card list on the site**, 14 cards: Flycard Premium, Flycard Premium Select, FlyCard, FlyAll Premium, FlyAll, Cash Card (prepaid), Debit, First, United Airlines, לאומי עסקים, מועדון צרכנות הוט, לאומי חיילים, bttrU (students), and the plain "לאומי" card. **[primary]** [leumi.co.il/he/credit-cards](https://www.leumi.co.il/he/credit-cards)
- **FlyCard at Leumi** is "המשולב של דיינרס ומאסטרקארד" (a Diners/Mastercard combo, i.e. Cal). **[primary]** [Leumi FLY CARD promotion page (2025)](https://www.leumi.co.il/he/FLY-CARD). The tariff lists FlyCard fees under both 6(א) "Leumi" and 6(ב) "Diners". **UNCONFIRMED** which operator runs each FlyCard variant.
- **American Express is not a Leumi bank card.** Leumi passes the customer's details to American Express "לטובת הנפקת כרטיס חוץ בנקאי". **[primary]** [leumi.co.il/he/credit-cards-amex](https://www.leumi.co.il/he/credit-cards-amex)
- **Own brand.** Leumi brands its bank cards "כרטיס אשראי בנקאי עם לוגו לאומי", with the "לאומי בונוס" benefits club. It has no separate card company of its own. Max was sold off (formerly Leumi Card). **[primary]** [Leumi card comparison guide, updated 03.08.2026](https://www.leumi.co.il/he/credit-cards/articles/credit-card-comparison)

### L.2 Billing

- **Domestic shekel purchases** are debited "מידי חודש וחודש במועד שיבחר על ידי הלקוחות מתוך מספר מועדים חלופיים שהבנק יקבע". **The bank sets the menu of billing dates**, and may change their frequency or add dates with notice. A change of billing date "עשוי להיות כרוך בחיוב פעמיים בחודש בתקופת המעבר". **[primary]** [319-56 §11.1](https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/hozim%20ahidim/319-56_ACC.pdf)
- **Foreign vouchers**, including foreign websites charging in ₪, are debited "בסמוך לאחר מועד הגעת החיוב לחברת כרטיסי האשראי", **not on the monthly date**. The exception is a customer who asked for, and was granted, debit on the monthly date. Cash withdrawals, and FX-denominated vouchers from Israeli merchants, follow the same "יום התשלום" rule. **[primary]** §11.1
- **Deferred and installment vouchers** are debited on the dates written on the voucher, starting from "מועד החיוב הסמוך". **[primary]** §11.2
- **A billing date that falls on a non-business day** moves to the next business day, with interest to that day. **[primary]** §14
- **The menu of billing dates is UNCONFIRMED** for Leumi bank cards. No Leumi page listing them was found.

### L.3 Foreign purchases

- **Conversion.** The representative rate known when the operating company processes the deal. Without a representative rate: Visa converts via USD at Visa's rate, Mastercard via EUR at Mastercard's rate, and the result is then converted to ₪ at the representative rate. **[primary]** [tariff 6(א)(7)](https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.xlsx)
- **The fee** also applies when the deal currency differs from the billing currency the customer chose.

| Card type                                                 | FX deal fee                                       | Cash withdrawal abroad                                              |
| --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Leumi cards, general (USD/EUR and other currencies)       | 3%                                                | 3%; from an account in the same currency, ₪19                       |
| FIRST                                                     | 2%                                                | 2%                                                                  |
| UNITED                                                    | 1.5%                                              | 2.55%                                                               |
| Flycard Premium / Premium Select / FlyCard (product page) | 1.8% / 2.2% / 2.5%                                | —                                                                   |
| FlyAll Premium / FlyAll (product page)                    | 1% in year 1, then 1.8% / 1% in year 1, then 2.5% | —                                                                   |
| Diners (6(ב))                                             | 3% (representative rate + 3%)                     | 3% (FlyCard 2.6%, FlyCard Premium 2.55%); same-currency account ₪16 |
| Buying FX at a money changer                              | $6                                                | —                                                                   |

**[primary]** tariff 01/10/2026; [Leumi cards page](https://www.leumi.co.il/he/credit-cards)

- **Linking to an FX account.** A bank card can be linked to a USD or EUR account, so USD/EUR deals carry no conversion fee. A non-bank card cannot. **[primary]** [Leumi comparison guide](https://www.leumi.co.il/he/credit-cards/articles/credit-card-comparison)

### L.4 Deal types (Leumi's credit tracks, §29.3)

| Track (exact name)           | Rate type                 | Payments                                      | Timing                                                                                                                                 |
| ---------------------------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| "אשראי 30 פלוס"              | **fixed**                 | 1                                             | Debit deferred to "the monthly billing date right after the next one". Interest is charged for the days between the two billing dates. |
| "אשראי קרדיט"                | **fixed**                 | **3 to 36** (or another number the bank sets) | Equal monthly principal-plus-interest payments, on billing dates                                                                       |
| "אשראי קרדיט חו"ל"           | fixed                     | 3 to **12**                                   | Bridging interest until the next billing date (see below)                                                                              |
| "מסלול חיוב חודשי קבוע"      | **variable, prime-based** | open-ended                                    | Revolving (§L.6)                                                                                                                       |
| "אשראי הלוואה"               | fixed                     | 3 to 36                                       | Card loan (§L.7)                                                                                                                       |
| "דחיית חיוב חו"ל למועד חיוב" | fixed                     | 1                                             | Foreign deals deferred to the next monthly billing date. Daily interest from the voucher's receipt.                                    |

- **Requesting a track at the till.** A voucher marked "קרדיט" or "אשראי פלוס 30", "or the name of a similar track at other card companies", counts as a request for **bank** credit on that track. **[primary]** §29.5–29.6
- **Bridging interest (ריבית גישור).** From the day the voucher reaches the company until the next monthly billing date. It is fixed unless the bank says otherwise. **[primary]** §29.2(4), §29.6
- **Odd payment counts.** If the requested number or amount of payments does not match Leumi's practice, the bank may set its own, as close as possible to the request. **[primary]** §29.3
- **Rejected credit requests.** If the bank refuses a credit voucher, it may instead carry the amount for one month, from one billing date to the next, at **prime** (variable). **[primary]** §29.9(3)
- **Statement labels** in Leumi's export: **UNCONFIRMED**. They are the operating company's labels (see the Max / Cal / Isracard files).

### L.5 Interest on קרדיט

- **Basis.** "ריבית קבועה – ריבית בשיעור קבוע שיקבע במועד ביצוע העסקה, על בסיס ריבית הפריים כפי שתהיה במועד ביצוע העסקה, בתוספת מרווח חיובי או שלילי, למשך תקופת האשראי". **The rate is fixed at the deal date.** **[primary]** §29.2(2)
- **Day count.** Interest runs "מהמועד העמדתו של האשראי ... ועד לסילוקו בפועל על-פי 360 ימים בשנה ו-30 ימים בחודש (שיטת שפיצר)". **[primary]** §29.2(2)
- **When the credit is advanced.** On the day the voucher reaches the card company. Bridging interest runs from then until the next billing date, and the track rate runs after that. **[primary]** §29.6
- **Who sets the rate.** "הבנק רשאי לקבוע ריביות שונות (לרבות מרווחים שונים מריבית הפריים) בהתאם לסוג הכרטיס וכן בהתאם למסלול האשראי או על-פי נתונים אחרים הקשורים ללקוחות". Rates appear on the monthly statement.
  - A prime change moves prime-based rates point for point.
  - Any other change applies only to credit granted after the notice.
  - **[primary]** §29.10
- **Published figure: none found.** Leumi publishes no card-credit rate table on its site, tariff or contract pages. **UNCONFIRMED.**

### L.6 Revolving credit: "מסלול חיוב חודשי קבוע"

- **The fixed amount.** The customer picks a fixed amount ("סכום החיוב הקבוע"). The bank may set a **minimum**, which can be any of these three:
  - a set sum;
  - a % of the card limit (rounded to the nearest ₪10);
  - a % of the monthly charge.

  The amount billed is the higher of the customer's sum and the minimum. **The minimum's figures are not published. UNCONFIRMED.** **[primary]** §29.3

- **How the rest rolls over.** The unpaid rest becomes new credit "בריבית משתנה על בסיס הפריים", from that billing date to the next, "וחוזר חלילה".
  - If the rest falls below a "סכום האשראי המינימאלי", or goes over the card limit, that shortfall or excess is billed in full on that date.
  - The bank may keep the customer on the track even after the card or the request is cancelled.
  - **[primary]** §29.3
- **Prepayment.** Full or partial prepayment, or leaving the track, takes effect on the next billing date. The order must reach the card company 5 business days before it. **[primary]** §29.8
- **Compounding.** "כל ריבית ... שתתרבה במשך כל חודש ... תישא אף היא ריבית באותו שעור". Unpaid interest compounds monthly. **[primary]** §31
- **Rate and day count: UNCONFIRMED** for this track.

### L.7 Other rates

- **Late interest (ריבית פיגורים) on card debts** is charged "כמפורט בתנאי הניהול". **[primary]** 319-56 §30. The account terms set it at:
  - "ריבית פיגורים בשיעור החוקי המקסימלי ... לגבי אשראי מהסוג שהועמד";
  - where no legal cap applies, the rate "בלוח גילוי נאות המפורסם בסניפי הבנק ובאתר".
  - It is computed on daily balances.
  - **[primary]** [Leumi – תנאים כלליים לניהול חשבון 310-93, ed. 06.26, §6.2](<https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/General/chozim%20achidim/310-93%20-%20%D7%AA%D7%99%D7%A7%D7%95%D7%9F%20%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA%20%D7%90%D7%95%D7%9F%20%D7%A7%D7%95%D7%9C%20(002)%20-%20%D7%9E%D7%95%D7%A0%D7%92%D7%A9-PDFUA.pdf>)
  - **The figure is UNCONFIRMED**: Leumi's "לוח גילוי נאות" was not found online.
- **How a bank-card debit can cost interest.**
  - The monthly charge is debited to the current account. If that makes the account overdrawn, the debt bears the account's overdraft rate.
  - Above the approved line, or with no line at all, it bears "ריבית מירבית".
  - If the bank finds no cover, it may move the debt to a separate arrears account (חשבון פיגורים).
  - **[primary]** 310-93 §6.4; 319-56 §15
- **Exceeding the card limit (חריגה).** Leumi may honour vouchers above the card limit, and the customer must settle the excess immediately. **No separate card over-limit rate was found.** **[primary]** 319-56 §29.4
- **Card loan, "אשראי הלוואה".** Fixed rate, 3–36 payments, from the bank. **The rate is not published.** **[primary]** §29.3
- **Refinancing a card-company loan.** Leumi offers to refinance a loan taken "בחברת כרטיסי אשראי" at **prime + 1% (minimum) to prime + 10% (maximum)** over 2–96 months. It refunds the card company's early-repayment fee on prime-based loans. **[primary, undated page; its example cites prime 6% "as of 4/1/2024"]** [leumi.co.il/he/loan_maximum](https://www.leumi.co.il/he/loan_maximum)
- **Cash withdrawal in Israel** on a bank card is a current-account operation (ATM fees per tariff ch. 1). **No card cash-advance interest was found.**

### L.8 Fees that affect a budget (tariff 01/10/2026)

- **Card fee (דמי כרטיס)**, monthly:

  | Card                                              | Fee per month  |
  | ------------------------------------------------- | -------------- |
  | Visa local / classic / prepaid                    | ₪16            |
  | Visa/Mastercard (regular and Multi) International | ₪18.40         |
  | Gold                                              | ₪19.70         |
  | Business                                          | ₪20            |
  | Platinum                                          | ₪24            |
  | FIRST                                             | ₪40            |
  | DEBIT                                             | ₪7 (regulated) |
  | UNITED                                            | ₪31.90         |
  | INFINITE                                          | ₪400           |
  | FLYCARD                                           | ₪19.90         |
  | FLYCARD PREMIUM SELECT                            | ₪27.90         |
  | FLYCARD PREMIUM                                   | ₪38.90         |

  **[primary]** [tariff 6(א)(1)](https://www.bankleumi.co.il/static-files/Commissions_Leumi/AmlotYechidimL.xlsx)
  - FlyCard fees were added on 29.6.2026. **[primary]** [Leumi notice No. 1, 15.6.26](https://www.bankleumi.co.il/static-files/LeumiHebrew/pdf_files/27.pdf)

- **Diners cards**, monthly: Diners ₪15.30, Diners FLYCARD ₪19.90, FLYCARD PREMIUM ₪31.90, FLYALL ₪17.90, FLYALL PREMIUM ₪24.90. **[primary]** tariff 6(ב)(1)
- **PAYBACK waiver** (a Leumi rule, per card):
  - turnover of ₪5,000 or more in the previous billing period refunds 30% of the fee;
  - ₪10,000 or more refunds 100%.
  - It does not apply to flight-track or club cards, DEBIT, prepaid, UNITED, FLYCARD or FIRST.
  - A customer with more than 2 cards on one account pays only for the 2 most expensive.
  - "Turnover" excludes cash withdrawals, fees, interest, credit products and money transfers.
  - **[primary]** tariff 6(א) notes
- **Proration of the card fee, by operator.**
  - **Max cards**: the fee is computed by calendar month, and at cancellation from the start of the calendar month.
  - **Cal and Isracard cards**: up to the billing date the customer chose.
  - After a change of billing date, the full fee is charged on the new date.
  - **[primary]** tariff 6(א) notes
- **Other card fees**:
  - early or immediate repayment of deals: ₪40 per request (Diners ₪30);
  - early repayment of a loan: ₪60 (Diners chapter; it also covers "פריסות תשלומים" and immediate repayment of "חיוב חודשי קבוע, עדיף, תשלום עדיף ו-30+");
  - unjustified chargeback dispute: ₪15 (Diners ₪30);
  - replacement card: ₪30, or ₪50 immediate;
  - deferred-payment fee on installments made up to 31.1.2015: ₪0.50 per payment (Diners ₪0.55).
  - **[primary]** tariff 6(א), 6(ב)
- **Paper statement / document copies**:
  - retrieving statements from the operating company: ₪15 by a clerk, free online;
  - printing documents held by the operating company: ₪11 (Diners ₪8, or ₪25 for unavailable documents).
  - **[primary]** tariff Appendix ה and ch. 2
- **Credit line on the current account** (where card debits land): management fee **₪12 per quarter**, or the quarter's interest if higher. **[primary]** [leumi.co.il/he/credit/Line_of_credit](https://www.leumi.co.il/he/credit/Line_of_credit)
- **No fee was found for changing the billing date or the deal type.**

### L.9 Exports

- The card company sends the periodic statement ("דפי פירוט תקופתיים") at least monthly. A customer may ask for a separate statement of foreign deals within 17 days of their billing date. **[primary]** 319-56 §25
- **Leumi's own export format is UNCONFIRMED.** Not researched; it needs a logged-in account.

### L.10 Changes and notification

- Card-credit rate changes not tied to prime apply to credit granted after the notice. Notice can be given on the statement. **[primary]** 319-56 §29.10
- Tariff changes are published as numbered notices (Nos. 1–4 in 2026: 15.6.26, 28.5.26, 15.9.26). **[primary]** [Leumi fees page](https://www.leumi.co.il/he/economic-info/commissions_and_fees)

---

# Part H: Bank Hapoalim (בנק הפועלים בע"מ)

### H.1 Identity and distribution

- **Issuers.** "בנק הפועלים בשיתוף עם אחת מחברות כרטיסי האשראי (כגון, **כאל, מקס וישראכרט**) מציע ללקוחותיו מגוון של כרטיסי חיוב". **[primary]** [Hapoalim – תמצית עיקרי השימוש בכרטיסי אשראי וכרטיסי חיוב מיידי](https://www.bankhapoalim.co.il/api/media/yuaj4c4e/%D7%AA%D7%9E%D7%A6%D7%99%D7%AA-%D7%A2%D7%99%D7%A7%D7%A8%D7%99-%D7%A9%D7%99%D7%9E%D7%95%D7%A9-%D7%91%D7%9B%D7%A8%D7%98%D7%99%D7%A1%D7%99-%D7%90%D7%A9%D7%A8%D7%90%D7%99-%D7%95%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9E%D7%99%D7%99%D7%93%D7%99.pdf)
- **Three agreements**, each dated **August 2026**, one per issuer group:
  - [Isracard and Amex](https://www.bankhapoalim.co.il/api/media/w5hcmjmo/%D7%AA%D7%A0%D7%90%D7%99%D7%9D-%D7%9B%D7%9C%D7%9C%D7%99%D7%9D-%D7%94%D7%A1%D7%9B%D7%9D-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%99%D7%A9%D7%A8%D7%90%D7%9B%D7%A8%D7%98-%D7%95%D7%90%D7%9E%D7%A7%D7%A1-%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98-2026.pdf)
  - [Cal](https://www.bankhapoalim.co.il/api/media/xzdbw1qj/%D7%AA%D7%A0%D7%90%D7%99%D7%9D-%D7%9B%D7%9C%D7%9C%D7%99%D7%99%D7%9D-%D7%9C%D7%94%D7%A1%D7%9B%D7%9D-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9B%D7%90%D7%9C-%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98-2026.pdf)
  - [Max](https://www.bankhapoalim.co.il/api/media/35unnga3/%D7%AA%D7%A0%D7%90%D7%99%D7%9D-%D7%9B%D7%9C%D7%9C%D7%99%D7%99%D7%9D-%D7%9C%D7%94%D7%A1%D7%9B%D7%9D-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9E%D7%A7%D7%A1-%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98-2026.pdf)

  **[primary]**, listed on [Hapoalim – חוזים אחידים](https://www.bankhapoalim.co.il/standard-contract)

- **The three agreements share one text.** The sections on billing, credit, interest and late interest are worded the same in all three (§19 compared line by line).
- **The issuer is the bank and the card company together.** "המנפיקה" is defined as "חברת כרטיסי האשראי והבנק". **[primary]** agreements §1
- **Brands.** The international organisations named are Mastercard, Visa, Diners and American Express. **[primary]** §1
- **Debit cards.** Direct (debit) cards are issued "בשיתוף עם חברת ישראכרט בלבד". **[primary]** תמצית p.2
- **Catalogue tabs**: Classic, Gold, Business, Student, Soldiers, YOUNG, club cards, Platinum, Premium, immediate-debit (Visa Debit, Mastercard Direct, a prepaid card). Classic shows Mastercard International, Visa International, American Express Classic and Amex blue. **[primary]** [Hapoalim card catalogue](https://www.bankhapoalim.co.il/credit-cards/card-catalog/)
- **The tariff also has Diners-only lines**, so Diners (Cal) cards exist at Hapoalim. **[primary]** [short card tariff 01/10/2026](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/146.PDF)
- **UNCONFIRMED**: which company operates Hapoalim's Visa cards. Isracard is likely, since Visa appears in the Isracard and Amex agreement, but this was not confirmed.

### H.2 Billing

- **The bank sets the billing-date menu.** The billing date is "המועד שנבחר על-ידי הלקוח מבין המועדים המקובלים אצל הבנק". It applies **to deals made in Israel only**. **[primary]** agreement §8.1
- **Cut-off rule.** The customer is billed for deals "ייקלטו אצל חברת כרטיסי האשראי בתקופה שבין מועד חיוב אחד לבין מועד החיוב שלאחריו", whatever the date on the voucher. **The cut-off is the day the company receives the deal, not the purchase date.** **[primary]** §8.1
- **One date per account.** "הבנק יהיה רשאי לקבוע כי כל הכרטיסים ... והמחויבים באותו חשבון, יחויבו במועד חיוב אחד". **[primary]** §8.5
- **Changing the date.**
  - The bank decides.
  - The customer is billed at least once in the month of the change.
  - The bank may require the change to cover all the customer's cards on the account.
  - It may refuse a change within **90 days** of the previous one.
  - Bank-initiated changes need 30 days' notice.
  - **[primary]** §8.6–8.9
- **Foreign deals** are billed "ביום העסקים הבא לאחר קליטת החיובים מחו"ל", "על אף קיום מועד חיוב לגבי כלל העסקאות האחרות". **[primary]** §8.4; תמצית p.1
- **ATM withdrawals in Israel** are debited the next business day. **[primary]** תמצית p.1
- **Installments.** Payment 1 falls on the billing date nearest the deal. **CPI- or FX-linked deals billed on a date other than the 2nd** have their first payment one month after the regular billing date. **[primary]** §8.3, §8.7
- **Card limit.** It covers all uses except interest and ATM cash in Israel, and lasts up to 3 months. Since 2022 it renews each calendar quarter, ending 31.3, 30.6, 30.9 or 31.12. **[primary]** תמצית p.1; [Hapoalim notice 13466](https://www.bankhapoalim.co.il/api/media/PDFS/13466.pdf)
- **The billing-date menu is UNCONFIRMED.** The card page says only "בוחרים מועד חיוב". [Hapoalim credit cards](https://www.bankhapoalim.co.il/credit-cards)

### H.3 Foreign purchases

- **Conversion rate.** The representative rate known:
  - when the issuer receives the deal, for deals reported by the international organisation;
  - at the deal date, for other deals.

  Without a representative rate, the deal goes via USD at the organisation's rate. **[primary]** [Hapoalim tariff, card chapter, "הסבר לעניין שיטת ההמרה" (tariff API)](https://www.bankhapoalim.co.il/forms/he/fee-list)

- **Shekel deals with foreign merchants**, including online, are charged in ₪. **[primary]** agreement §9.6
- **Fees**, from the short card tariff:

  | Item                                       | Isracard/Max/Cal cards | Amex  | Diners |
  | ------------------------------------------ | ---------------------- | ----- | ------ |
  | FX deal, USD/EUR                           | 2.90%                  | 2.5%  | 3%     |
  | FX deal, other currency                    | 2.90%                  | 2.5%  | 3%     |
  | Cash withdrawal abroad (ATM or counter)    | 3.30%                  | 3.5%  | 3%     |
  | Cash from an account held in that currency | ₪19                    | —     | ₪16    |
  | Buying FX at a money changer               | $5                     | $3.90 | —      |

  **[primary]** [short card tariff 01/10/2026](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/146.PDF)

- The file's text layer is jumbled. **The figures above were matched label to number and may have a pairing error.** UNCONFIRMED at line level.

### H.4 Deal types and credit arrangements (§19, identical for Isracard/Amex, Cal and Max)

- **הסדר קרדיט (revolving)**, §19.1:
  - **How to join**:
    - at the till ("לסמן על גבי השובר ... כי זו עסקה המבוצעת במסגרת הסדר קרדיט");
    - by a standing request that **all** future deals, in Israel and abroad, go to קרדיט;
    - after the fact, for deals already charged or not yet charged. The account is credited within 4 business days.
  - **Repayment**: "בתשלומים חודשיים בשיעור של **5% מיתרת הקרן, אך לא פחות מ-100 ₪** בכל חודש", or another rate the bank sets or agrees. The customer may ask for a different monthly amount.
  - **Statement**: shows the principal owed and the bank's rate.
  - **[primary]** agreements §19.1, §19.4.3
- **הסדר קרדיט בתשלומים (fixed installments, 3–36)**, §19.2:
  - Equal principal-plus-interest payments, starting **on the first billing date after the regular billing date**.
  - **3–18 payments**: principal at least **₪25** a payment (**₪75** minimum deal).
  - **19–36 payments**: principal at least **₪50** a payment (**₪950** minimum deal).
  - A deal below the minimum may be treated as a regular charge.
  - **"סל חיובי ארץ" / "סל חיובי חו"ל"**: a standing request that each month's domestic, or foreign, charges be pooled into one sum and spread over N payments. The two pools are separate.
  - **[primary]** §19.2.1–19.2.2
- **הסדר אשראי מהיר (card loan)**, §19.3:
  - A draw on the card limit, credited to the account within 4 business days. Minimum **₪1,000**.
  - Repaid in equal payments, plus a separate first payment of bridging interest when the draw is not on a billing date.
  - Prepayment is executed within 3 business days. **[primary]**
- **Deferred deals** ("עסקה ... במועד חיוב עתידי שאינו סמוך"): payment from the billing date after the next one, or as the issuer approves. **[primary]** §8.3
- **Linked deals.** CPI-linked deals use the CPI known at billing against the CPI known at the deal date. If the voucher arrives more than 60 days late, the base becomes the CPI known at receipt. FX-linked payments use the FX rate of the first business day of the billing month. **[primary]** §1 definitions

### H.5 Interest on קרדיט

| Arrangement         | Rate rule                                                  | Fixed?                                                                                                                | Interest from                                                                                     | Day count                                   | When charged                                               |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| הסדר קרדיט          | prime + "תוספת הסיכון להסדר קרדיט, כפי שיהיו נהוגים בבנק"  | **variable**: moves with prime; the margin can change at each limit renewal                                           | the regular billing date                                                                          | **actual/365 (or 366)**, daily on principal | **quarterly**: first business day of each calendar quarter |
| הסדר קרדיט בתשלומים | prime on the day the voucher is received + the risk margin | **fixed per deal**. The bank may change rates on prime or margin changes; changes do not touch credit already granted | the regular billing date; whole months to the final payment                                       | **30/360**, equal payments (Spitzer)        | each billing date                                          |
| סל חיובי חו"ל       | one rate for the month's pool                              | fixed for that pool                                                                                                   | plus daily interest per deal, from the regular billing date to the next billing date (actual/365) | —                                           | —                                                          |
| אשראי מהיר          | prime + margin at the request date                         | fixed per draw                                                                                                        | the day the account is credited (bridging interest, actual/365, to the first billing date)        | **30/360** after that                       | each billing date                                          |

**[primary]** agreements §19.1.4, §19.2.3, §19.3.4

- **Who sets the rate: the bank.** "הבנק יהיה רשאי מעת לעת לשנות את שעור הריבית ... ו/או את היותה של הריבית משתנה או קבועה". Rates may differ by card and by customer. **[primary]** §19.4.6–19.4.7
- **Published figure: none.** The card request form has blank fields for "ריבית נומינלית שנתית", "ריבית מתואמת שנתית" and "ריבית ה'פריים', בצירוף תוספת סיכון בשיעור ___", for each of הסדר קרדיט, הסדר קרדיט בתשלומים קבועים and הסדר "אשראי מהיר". **The rates are personal, given at sign-up and on the statement.** **[primary]** [Hapoalim – בקשה לקבלת כרטיס חיוב (CCrequest)](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/41-65/65-finish/CCrequest.pdf). No Hapoalim page publishes card-credit rates; the "interest-update" page covers prime only. **UNCONFIRMED.**

### H.6 Revolving

- **Name**: "הסדר קרדיט". **Separate card?** No: an arrangement on the same card.
- **Minimum payment**: 5% of the principal balance, at least ₪100.
- **Interest**: on principal, actual/365, daily from the regular billing date, charged quarterly. Unpaid interest is added to the bank account, not to the revolving balance.
- **Paying more**: full or partial prepayment at any time. Raising the monthly payment counts as prepayment. Payments received in the 5 days before a billing date may be counted only from the following date. The bank may charge a fee (see H.8).
- **[primary]** §19.1.2–19.1.4, §19.4.8

### H.7 Other rates

- **Late interest (ריבית פיגורים) on card debts** is defined as "הריבית המרבית הגבוהה ביותר ... בבנק על יתרות חובה בחשבון עובר ושב במטבע ישראלי שלא קיימת בו מסגרת אשראי בתוקף". **[primary]** agreements §1
- **That rate from 3.9.2026: 16.35% nominal, 17.38% מתואמת** (prime 4.75% + 11.60%). **[primary]** [Hapoalim rate notice, 1.9.2026](https://www.bankhapoalim.co.il/api/media/kbznep3e/ribit_bank_israel_01092026.pdf). The pair fits **m = 4**; m = 12 would give 17.63%.
- **How the debit lands.** The card debit is charged to the current account even if it creates or deepens an overdraft. Overdraft and over-limit interest then follow the account documents. **[primary]** §12.1, §12.6
- **Account rates the card debit may meet** (max, from 3.9.2026, all m = 4):

  | Account type                     | In-line rate               | Over-line (חריגה) |
  | -------------------------------- | -------------------------- | ----------------- |
  | Private tiered (חח"ד פרטי מדורג) | 13.85% / 14.59%            | 16.35% / 17.38%   |
  | Salary (משכורת)                  | 11.25% / 11.73%            | 16.35% / 17.38%   |
  | Student                          | tiers 5.55%, 8.35%, 11.55% | 16.35% / 17.38%   |
  | Soldier                          | tiers 4.85%, 8.35%, 11.55% | 16.35% / 17.38%   |
  | No approved line                 | —                          | 16.35% / 17.38%   |

  **[primary]** same notice

- **Card over-limit**: the issuer may charge the account even above the card limit. **No separate rate.** **[primary]** §12.4
- **Card loans**: הסדר אשראי מהיר, rate not published (H.4).

### H.8 Fees (short card tariff 01/10/2026; changes notice of 1.11.2025)

- **Monthly card fee**:

  | Card                   | Fee    |
  | ---------------------- | ------ |
  | Isracard (Israel only) | ₪13.16 |
  | Mastercard / Visa      | ₪17.22 |
  | Gold / Business        | ₪19.25 |
  | Business Gold          | ₪22.29 |
  | Platinum               | ₪24.31 |
  | Isracard Young         | ₪4.15  |
  | Direct                 | ₪7     |
  | Fuel card              | ₪4.05  |
  | Amex Green / Classic   | ₪18.90 |
  | Amex Gold              | ₪22.90 |
  | Amex Platinum          | ₪32.90 |
  | Amex Centurion         | ₪189   |
  | Amex Credit            | ₪16.90 |
  | Amex Blue              | ₪15.90 |
  | Amex Local / Plus      | ₪13.90 |
  | El Al (FlyCard) Amex   | ₪40    |

  The Mastercard and Visa figures are confirmed by the waiver table: 20% off leaves ₪13.77 (Mastercard/Visa) and ₪19.44 (Platinum). **[primary]** [146.PDF](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/146.PDF)

- **Fee waiver by monthly spend.**
  - A target of ₪5,000 gives 20% off.
  - ₪10,000 gives a full waiver.
  - For the **Isracard** card the full-waiver target fell from **₪10,000 to ₪8,000** (notice effective 1.11.2025).
  - **[primary]** [Hapoalim notice on card tariff changes](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/Taarifon/MODAA_TAARIFON_CREDITCARDS__Acc_01112025.pdf)
- **Other card fees**:
  - early or immediate repayment of deals: ₪40 by a clerk, ₪20 direct (Amex ₪29.90 / ₪15.90; Diners ₪30 / ₪20);
  - early repayment of credit: ₪60 by a clerk, ₪30 direct;
  - replacement card: ₪30 / ₪15, or ₪40 immediate;
  - unjustified dispute: ₪25 / ₪15;
  - deferred-payment fee on installments made before 31.1.2015: ₪0.49.
  - **[primary]** 146.PDF
- **Document printing**: ₪11 by a clerk, ₪5 direct (Amex ₪8.90 / ₪2.90). **[primary]** 146.PDF
- **No fee was found for changing the billing date.**

### H.9 Exports

- **UNCONFIRMED.** Not researched; it needs a logged-in account. The statement ("דף ריכוז החיובים") must show the principal owed and the bank's rate for each arrangement. **[primary]** §19.4.3

### H.10 Changes and notification

- Changes to the billing-date menu need 30 days' notice. **[primary]** §8.6
- Ending the customer's access to credit arrangements needs 30 days' notice. **[primary]** §19.4.1
- Rate changes on prime follow the prime notice; the 1.9.2026 notice covers "כל סוגי מסגרות העו"ש" and other prime-based shekel credit. **[primary]**

---

# Part M: Mizrahi-Tefahot (בנק מזרחי-טפחות בע"מ), including former Union Bank

### M.1 Identity and distribution

- **Issuers offered**: **Isracard, Cal, American Express, Max and Diners**. "כל הטבות 'הכרטיס' ... תקפות בכרטיסי ישראכרט, Cal, אמריקן אקספרס, MAX ודיינרס". **[primary]** [Mizrahi credit cards](https://www.mizrahi-tefahot.co.il/credit-cards/)
- **The tariff has one card chapter per issuer**: 6א Isracard, 6ב American Express, 6ג Cal, 6ד Max, with fee annexes ד'1–ד'4. **[primary]** [Mizrahi tariff ch. 6](https://www.mizrahi-tefahot.co.il/interest-list-credit-card-small/)
- **Own brands.**
  - **"הכרטיס של מזרחי-טפחות"** with the "כתום" club. The club name is the bank's; the cards are the issuers'.
  - **"כרטיס טפחות"**, issued by **Isracard**, for Tefahot mortgage customers only (M.7). "כרטיס טפחות של ישראכרט". **[primary]** [Tefahot card benefits](https://www.mizrahi-tefahot.co.il/mortgagescard/)
- **New exclusive issuer deal.** On **12.4.2026** Mizrahi and Isracard signed a 5-year agreement: Isracard "תהיה אחראית על הנפקה, ניהול ושירות של כרטיסי האשראי של כלל לקוחות הבנק". **[secondary]** [Bizportal, 12.4.2026](https://www.bizportal.co.il/general/news/article/20030227)
  - **UNCONFIRMED**: the start date, and what happens to existing Cal, Max and Diners cards.
  - Mizrahi's site still lists all five brands, and the Cal and Max rate tables, as of 2026-10-08.
- **Union Bank**: no separate card terms were found on Mizrahi's site. **UNCONFIRMED** whether former Union customers keep any Union-specific card terms.

### M.2 Billing

- **Domestic billing.** Under the Isracard/Amex agreement used at Mizrahi, the billing date is "המועד שנבחר על-ידי הלקוח מבין המועדים המקובלים אצל המנפיקה". **[primary, 2016–17 version]** [Mizrahi – changes to the Isracard/Amex card terms (effective 1.1.17)](https://www.mizrahi-tefahot.co.il/mizmedia/1255/isrcard-terms-change.pdf)
- **The billing-date menu, the foreign-deal debit timing at Mizrahi, and the current agreement text are UNCONFIRMED.** The 2016 change document is the only Mizrahi card agreement found online.
- **First קרדיט payment.** "החיוב הראשון יבוצע חודש לאחר מועד החיוב הרגיל". **[primary]** [Mizrahi – שירותים בנקאיים למחזיקי הכרטיס (page dated 28.6.2021)](https://www.mizrahi-tefahot.co.il/credit-cards/credit-cards-benefits/)

### M.3 Foreign purchases (tariff ch. 6, updated 1.10.2026; Max chapter dated 1.12.17)

| Issuer at Mizrahi | FX deal (USD/EUR/other)               | Cash abroad (ATM/counter) | Same-currency account withdrawal | FX at a money changer |
| ----------------- | ------------------------------------- | ------------------------- | -------------------------------- | --------------------- |
| Isracard          | **2.7%**                              | 3.5%                      | ₪19                              | $5                    |
| American Express  | **2.5%**                              | 3.5%                      | ₪19                              | $3.90                 |
| Cal               | **3.00%** ("השער היציג בתוספת 3.00%") | 3%                        | ₪16                              | $6                    |
| Max               | **3%** (FIRST 2.00%)                  | 3%                        | —                                | $6                    |

**[primary]** [smallbusiness61.xls](https://www.mizrahi-tefahot.co.il/media/smallbusiness61.xls), [62](https://www.mizrahi-tefahot.co.il/media/smallbusiness62.xls), [63](https://www.mizrahi-tefahot.co.il/media/smallbusiness63.xls), [64](https://www.mizrahi-tefahot.co.il/media/smallbusiness64.xls)

- **Isracard and Amex**: the representative rate known when the issuer receives the deal (when reported by the international organisation), or at the deal date otherwise. **[primary]** annex ד2
- **Max**: the representative rate known when Max processes the deal.
- **Cal**: the representative rate plus 3%.

### M.4 Deal types (bank services for cardholders)

**[primary]** [Mizrahi – שירותים בנקאיים למחזיקי הכרטיס](https://www.mizrahi-tefahot.co.il/credit-cards/credit-cards-benefits/)

- **"עסקאות קרדיט"**: "פריסת עסקה על פני **3 עד 18** תשלומים קבועים ושווים (לוח שפיצר) בריבית קבועה. החיוב הראשון יבוצע חודש לאחר מועד החיוב הרגיל".
- **"עסקאות בקרדיט גמיש"** (revolving-style): repayment "בסכום החזר קרן קבוע או לפי אחוז מהעסקה בסכום החזר חודשי של **לפחות 5% מיתרת האשראי אך לא פחות מ-100 ש"ח**".
- **"פריסת תשלומים"**: spreading the monthly charge, or part of it, before or after the billing date.
- **"אשראי מתגלגל"**: "לקבוע מראש מדי חודש את הסכום בו יחויב הכרטיס ... יתרת החיוב תידחה ותישא ריבית".
- **"הלוואה במסלול מהיר"**: up to **₪30,000**, no guarantees, paid within 3 business days. "אישור תכנית האשראי כפוף למסגרת אשראי פנויה ובאישור חברת כרטיסי האשראי".
- **Issuer product names** appear in the rate tables (M.5):
  - Isracard: ישראקרדיט, קרדיט בתשלומים קבועים, אשראי מהיר.
  - Cal: ויזה עדיף/דיינרס לארג', בתשלומים קבועים, ויזה 30+, הלוואות אקספרס.
  - Max: חודש חופש/הלוואות ברגע, קרדיט בתשלומים קבועים, אשראי מתגלגל, מולטי.
- **Who lends.** The Isracard/Amex agreement used at Mizrahi treats a קרדיט request as "בקשה לקבלת אשראי **מהבנק**". The rate is "פריים בצירוף תוספת הסיכון ... כפי שיהיו נהוגים **בבנק**". **[primary, 2016–17 version]** [isrcard-terms-change.pdf §19](https://www.mizrahi-tefahot.co.il/mizmedia/1255/isrcard-terms-change.pdf)
- **A monthly-interest revolving variant was cancelled** in that version: "הסדר קרדיט ריבית חודשית", with a minimum monthly repayment of ₪1,000.

### M.5 Published card-credit rates (שיעורי ריבית באשראי)

**[primary]** [Mizrahi – שיעורי ריבית באשראי](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/). Notice dated 2.9.2026, effective **3.9.2026**; every row fell 0.25 points with prime. "Base rate (ריבית בסיסית) 4.75%."

- **The bank publishes the rate per issuer and card type.** This is the clearest primary evidence that **the bank sets card-credit rates for its own customers.**
- The page labels them "העלות החדשה המרבית", so each figure is a **maximum** list rate.
- The page also says: "בכל אשראי שקלי בו הריבית משתנה בהתאם לשינויים בריבית הבסיסית (פריים) - **לרבות אשראי באמצעות כרטיסי אשראי** שיעור הריבית ישתנה בהתאם".
- **All pairs below fit m = 12**, except the two truncation cases noted at the top.

**Isracard / Amex cards** (nominal / מתואמת):

| Card type                                                                                             | ישראקרדיט / אמק"ס קרדיט | קרדיט בתשלומים קבועים | אשראי מהיר    |
| ----------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- | ------------- |
| Isracard regular; Mastercard; Amex Blue; Amex Credit; Supercard Isracard/Mastercard; מועדון חייל יותר | 14.15 / 15.10           | 15.25 / 16.36         | 16.25 / 17.52 |
| Lifestyle                                                                                             | 14.15 / 15.10           | 15.05 / 16.13         | 16.25 / 17.52 |
| Gold Mastercard; Corporate Mastercard; Amex Green; Supercard Gold                                     | 11.30 / 11.90           | 13.00 / 13.80         | 16.15 / 17.40 |
| Mastercard Business                                                                                   | 12.05 / 12.74           | 13.25 / 14.08         | 16.15 / 17.40 |
| Gold Mastercard Business; Corporate Gold; Corporate Amex Gold                                         | 11.00 / 11.57           | 12.70 / 13.47         | 16.15 / 17.40 |
| Corporate Amex Green                                                                                  | 11.00 / 11.57           | 13.00 / 13.80         | 16.15 / 17.40 |
| Amex Gold                                                                                             | 11.10 / 11.68           | 12.70 / 13.47         | 16.15 / 17.40 |
| Gold Mastercard Platinum                                                                              | 10.75 / 11.30           | 11.25 / 11.85         | 13.25 / 14.08 |
| Amex Platinum                                                                                         | 10.65 / 11.19           | 11.25 / 11.85         | 13.25 / 14.08 |
| World Elite                                                                                           | 7.75 / 8.03             | 7.95 / 8.25           | 9.95 / 10.42  |
| Centurion                                                                                             | 6.25 / 6.43             | 6.45 / 6.64           | 6.95 / 7.17*  |
| Lawyers' Isracard (עו"ד), and spouse                                                                  | 8.85 / 9.22             | 9.75 / 10.20          | 13.25 / 14.08 |
| עולמי עובדי הרשויות                                                                                   | 12.35 / 13.07           | 13.55 / 14.42         | 16.25 / 17.52 |

\* Computed 7.18 at m = 12. 13.25 → 14.08 is computed as 14.0850. Both look like truncation.

**Cal cards (Visa / Diners / Mastercard)** (nominal / מתואמת):

| Card type                                                                                             | ויזה עדיף / דיינרס לארג' | ויזה/דיינרס בתשלומים קבועים | ויזה 30+      | הלוואות אקספרס |
| ----------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- | ------------- | -------------- |
| Basic; Mastercard Basic                                                                               | 14.35 / 15.33            | 15.25 / 16.36               | 15.25 / 16.36 | —              |
| Local; International; Mastercard International                                                        | 14.35 / 15.33            | 15.25 / 16.36               | 15.25 / 16.36 | 16.25 / 17.52  |
| Business (עיסקי); Mastercard Business                                                                 | 14.35 / 15.33            | 15.25 / 16.36               | 15.25 / 16.36 | 16.15 / 17.40  |
| Business Gold / Globus; Gold; Diners Platinum; Diners Mastercard; Mastercard Gold (and Gold Business) | 11.50 / 12.13            | 13.00 / 13.80               | 13.00 / 13.80 | 16.15 / 17.40  |
| Visa Platinum; Mastercard Platinum (and Platinum Business)                                            | 10.95 / 11.52            | 11.25 / 11.85               | 11.25 / 11.85 | 13.25 / 14.08  |
| מועדון כוחות הבטחון                                                                                   | 5.75 / 5.90              | 5.75 / 5.90                 | 5.75 / 5.90   | 5.75 / 5.90    |

**Max cards** (nominal / מתואמת). The page prints these with reversed digits (e.g. "00%.10" = 10.00%); they are decoded here.

| Card type                     | חודש חופש / הלוואות ברגע ל"ק | קרדיט בתשלומים קבועים | אשראי מתגלגל  |
| ----------------------------- | ---------------------------- | --------------------- | ------------- |
| Visa First                    | 10.00 / 10.47                | 8.25 / 8.57           | 8.00 / 8.30   |
| Visa Platinum                 | 13.50 / 14.37                | 11.50 / 12.13         | 11.00 / 11.57 |
| Visa Business Gold; Visa Gold | 16.25 / 17.52                | 13.25 / 14.08         | 11.75 / 12.40 |
| Visa International            | 16.25 / 17.52                | 15.50 / 16.65         | 14.50 / 15.50 |

**Max Multi cards** (nominal / מתואמת):

| Card type                     | מולטי         | קרדיט בתשלומים קבועים |
| ----------------------------- | ------------- | --------------------- |
| Visa Platinum                 | 13.50 / 14.37 | 11.50 / 12.13         |
| Visa Business Gold; Visa Gold | 16.50 / 17.81 | 13.25 / 14.08         |
| Visa International            | 16.25 / 17.52 | 15.50 / 16.65         |

- **Long credit (19–36 payments)**: Mizrahi's bank page offers קרדיט over 3–18 payments only. **UNCONFIRMED** whether 19–36 deals (e.g. Max's קרדיט פלוס) are available, and at what rate.

### M.6 Revolving

- **Products**:
  - "קרדיט גמיש": at least 5% of the balance, at least ₪100.
  - "אשראי מתגלגל": a fixed monthly amount chosen by the customer.
  - Isracard "ישראקרדיט" and Cal "עדיף": rates in M.5.
- **UNCONFIRMED** for Mizrahi: the day count, the compounding period and the interest-charging date. Under the shared Isracard terms they are likely actual/365, daily, and quarterly, as at Hapoalim, but this was not confirmed on a current Mizrahi document.

### M.7 Other rates and the bank's own card credit lines

- **כרטיס טפחות / הלוואת כרטיס אשראי טפחות (כא"ט)**, Mizrahi's own card-linked mortgage credit line:
  - **Eligibility**: Tefahot mortgage holders only.
  - **Limit and term**: up to **₪120,000**, repaid over **up to 360 payments**, with interest only on what is used.
  - **Cash**: ATM withdrawals up to ₪5,000 a day.
  - **No card fee.**
  - **Restrictions**: no installment, קרדיט or standing-order deals on the card.
  - **Mechanics**: charges accumulate and are rolled into a loan "בהגיע החיובים בכרטיס לסכום מצטבר כמוגדר בהסכם המסגרת", or after six months without use when charges have built up. The limit is valid one year. The mortgaged property also secures this loan.
  - **[primary]** [Tefahot card page](https://www.mizrahi-tefahot.co.il/mortgages/ckeckmortgage/tefahot-credit-card/); [guide to the Tefahot card loan (ed. 12.2018)](https://www.mizrahi-tefahot.co.il/media/eewjtggh/%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%9C%D7%A7%D7%91%D7%9C%D7%AA-%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%AA-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%90%D7%A9%D7%A8%D7%90%D7%99-%D7%98%D7%A4%D7%97%D7%95%D7%AA.pdf)
- **Tefahot card published rates**, by account-opening date (nominal / מתואמת, **m = 4**):

  | Account opened      | Rate            |
  | ------------------- | --------------- |
  | before 1.4.2007     | 5.75 / 5.88     |
  | 1.4.2007–30.11.2008 | 6.25 / 6.40     |
  | 1.12.2008–28.2.2009 | 6.55 / 6.71     |
  | 1.3–30.6.2009       | 6.95 / 7.13     |
  | 1.7–30.10.2009      | 7.20 / 7.40     |
  | 1.11.2009–28.2.2013 | 7.50 / 7.71     |
  | 1.3.2013–31.8.2014  | 7.70 / 7.93     |
  | 1.9.2014–14.5.2018  | 8.00 / 8.24     |
  | 15.5.2018–14.4.2020 | 8.25 / 8.51     |
  | from 15.4.2020      | **8.45 / 8.72** |

  **[primary]** Mizrahi rates page, 3.9.2026

- **Student card** (nominal / מתואמת, m = 4): 6.65 / 6.82 (accounts opened before 1.6.2009); 7.65 / 7.87 (from 1.6.2009). **[primary]** same page
- **Account rates the card debit lands on** (max, from 3.9.2026, all m = 4):

  | Account type                                                         | Rate (nominal / מתואמת)                     |
  | -------------------------------------------------------------------- | ------------------------------------------- |
  | **עו"ש חובה** (debit balance, no line: the late and over-limit case) | **18.55 / 19.88** (prime + 13.80%)          |
  | Private regular / preferred line, tier 1                             | 11.75 / 12.28                               |
  | Private regular / preferred line, tier 2                             | 15.70 / 16.65                               |
  | Private regular / preferred line, tier 3                             | 16.95 / 18.06                               |
  | Salaried line, tiers 1–3                                             | 11.30 / 11.79; 14.60 / 15.42; 16.95 / 18.06 |
  | Young / student line, tiers 1–3                                      | 6.10 / 6.24; 10.00 / 10.38; 13.95 / 14.70   |

  **[primary]** same page

- **UNCONFIRMED**: whether Mizrahi applies "עו"ש חובה" as the card's ריבית פיגורים. The current Mizrahi card agreement was not found online.

### M.8 Fees (tariff annexes ד'1–ד'4)

- **Isracard (monthly)**, as of 1.10.2026:

  | Card                                      | Fee                      | Waiver                              |
  | ----------------------------------------- | ------------------------ | ----------------------------------- |
  | Isracard (Israel only)                    | ₪17.22                   | free at ₪8,500 spend                |
  | Mastercard                                | ₪18                      | ~20% off at ₪5,000; free at ₪11,000 |
  | Gold Mastercard                           | ₪19.90                   | free at ₪12,000                     |
  | Mastercard Business / Corporate           | ₪19.90                   | free at ₪11,000                     |
  | Gold Business / Gold Corporate            | ₪21.90                   | free at ₪12,000                     |
  | Mastercard Platinum                       | ₪24                      | free at ₪13,000                     |
  | World Elite                               | ₪60                      | —                                   |
  | Isracard Young                            | ₪4.15                    | —                                   |
  | Direct                                    | ₪7                       | —                                   |
  | Fuel card                                 | ₪7                       | —                                   |
  | Lifestyle                                 | ₪28.36                   | —                                   |
  | FlyCard Premium / Premium Select / Bronze | ₪38.90 / ₪27.90 / ₪19.90 | —                                   |

  **[primary]** [kartisisracard.xls](https://www.mizrahi-tefahot.co.il/media/kartisisracard.xls)

- **American Express (monthly)**:

  | Card            | Fee    | Waiver          |
  | --------------- | ------ | --------------- |
  | Green           | ₪18.90 | free at ₪11,000 |
  | Gold            | ₪22.90 | free at ₪12,000 |
  | Platinum        | ₪32.90 | —               |
  | Centurion       | ₪189   | —               |
  | Credit          | ₪16.90 | free at ₪11,000 |
  | Blue            | ₪15.90 | free at ₪10,500 |
  | FlyCard Premium | ₪40    | —               |

  **[primary]** [kartisamex.xls](https://www.mizrahi-tefahot.co.il/media/kartisamex.xls)

- **Cal (monthly)**:

  | Card                                             | Fee             | Discount          |
  | ------------------------------------------------ | --------------- | ----------------- |
  | Visa / Mastercard Basic, Local, International    | ₪18             | —                 |
  | Business                                         | ₪20             | 20% off at ₪2,500 |
  | Gold                                             | ₪28             | 30% off at ₪2,500 |
  | Business Gold                                    | ₪36             | —                 |
  | Platinum                                         | ₪45             | 50% off at ₪5,000 |
  | Diners International                             | ₪18             | —                 |
  | Diners Platinum                                  | ₪42             | —                 |
  | Flight club Bronze / Premium (Diners Mastercard) | ₪17.90 / ₪34.90 | —                 |
  | Debit                                            | ₪7              | —                 |

  **[primary]** [kartiscal.xls](https://www.mizrahi-tefahot.co.il/media/kartiscal.xls)

- **Max (monthly)**: Visa First ₪60, Platinum ₪24, Business Gold ₪21.90, Gold ₪19.90, International ₪18. Discounts apply at ₪5,000 spend. **The annex is dated 2.1.2022.** **[primary]** [kartisleumicard.xls](https://www.mizrahi-tefahot.co.il/media/kartisleumicard.xls)
- **Early-repayment fees**:
  - Isracard: ₪40 by a clerk, ₪20 direct.
  - Amex: ₪29.90 / ₪15.90.
  - Cal: ₪30.
  - Max: ₪40.
  - Early repayment of credit: ₪60 / ₪30 (Isracard and Amex); Cal ₪60 for a loan, which also covers "פריסות תשלומים" and "חיוב חודשי קבוע, עדיף, תשלום עדיף ו-30+"; Max ₪40.
  - **[primary]** ch. 6
- **No fee was found for changing the billing date.**

### M.9 Exports

- **UNCONFIRMED.** Not researched.

### M.10 Changes and notification

- **Rate changes are published as a dated notice** on the "שיעורי ריבית באשראי" page, effective the next business day after a prime change (2.9 → 3.9.2026).
- **Tariff changes** appear as numbered notices ("הודעה מספר 1"). **[primary]**

---

## Cross-bank findings (bank rules that differ from the issuer's own)

1. **At all three banks the bank, not the issuer, is the lender on card credit, and it sets the rate.**
   - Leumi: "הבנק הוא המלווה".
   - Hapoalim: "אשראי המועמד על-ידי הבנק", with the bank's "תוספת הסיכון".
   - Mizrahi: publishes its own table per issuer and card type, and the shared Isracard terms say "אשראי מהבנק".

   **A Max card through Mizrahi therefore carries Mizrahi's rate (15.50% קרדיט on Max International), not Max's own rate.** The catalog should key rates by bank + issuer + card type.

2. **Hapoalim's bank terms override the issuer's product rules for all three issuers.**
   - Revolving is "הסדר קרדיט": 5% / ₪100 minimum, interest charged quarterly, actual/365.
   - Installments are "הסדר קרדיט בתשלומים": 3–36 payments, minimum ₪25 / ₪50 per payment, 30/360, fixed on the day the voucher is received.
3. **Day counts differ between banks.**
   - Leumi קרדיט: 30/360, Spitzer.
   - Hapoalim installments: 30/360. Hapoalim revolving: actual/365.
   - Bridging interest at both banks: actual/365, from the voucher's arrival to the next billing date.
4. **Foreign deals at Leumi and Hapoalim debit the account soon after the charge arrives**: next business day at Hapoalim, "בסמוך" at Leumi. They are not held for the monthly billing date. Leumi sells deferral to the billing date as a credit track bearing interest ("דחיית חיוב חו"ל למועד חיוב").
5. **Late interest on a bank card is the account's rate, not a card rate.**
   - Hapoalim: 16.35% / 17.38%, explicitly.
   - Leumi: legal maximum or disclosure table (figure UNCONFIRMED).
   - Mizrahi: "עו"ש חובה" 18.55% / 19.88% is the likely candidate (UNCONFIRMED).

   **These account rates compound quarterly (m = 4); card-credit rates compound monthly (m = 12).**

6. **The bank sets the billing-date menu and can force one date for all cards on an account** (Hapoalim §8.5; Leumi §11.1).

---

## UNCONFIRMED / gaps

1. **Leumi card-credit rates**: no published table for קרדיט, 30 פלוס, revolving (חיוב חודשי קבוע) or אשראי הלוואה. The rates are personal and appear on statements.
2. **Leumi late-interest figure** ("לוח גילוי נאות"), and Leumi's current overdraft maximums. Not found online.
3. **Hapoalim card-credit rates**: personal. The request form leaves the nominal, מתואמת and margin fields blank, and no public table was found.
4. **Billing-date menus** at all three banks. None states its list of dates on a reachable page.
5. **Mizrahi's current card agreement**, the debit timing for foreign deals, revolving day count and compounding, and which rate is the card's ריבית פיגורים. Only the 2016–17 Isracard-terms change document was found.
6. **Mizrahi–Isracard exclusive deal (12.4.2026)**: start date, migration of Cal, Max and Diners cards, and any rate or terms changes. Secondary source only.
7. **Operator split**: the current split of Leumi's card base between Max, Cal and Isracard; which company operates Hapoalim's Visa cards; and which operates each Leumi FlyCard variant.
8. **Long credit (19–36)**: Mizrahi offers 3–18 only; whether 19–36 deals and קרדיט פלוס-style re-pricing apply to bank cards at Mizrahi and Leumi. Leumi allows up to 36 payments at a fixed rate, with no mid-deal re-pricing in its terms.
9. **Hapoalim FX and cash-abroad fees** were read from a PDF with a jumbled text layer. Values are paired by label; check them against the live tariff page.
10. **Max fee annex at Mizrahi** is dated 2.1.2022, and the Max chapter 1.12.17. They may be stale.
11. **Union Bank legacy card terms**: not researched.
12. **Exports (§9)** for all three banks: not researched; they need logged-in access.
13. **Two Mizrahi pairs off by 0.01** (13.25 → 14.08; 6.95 → 7.17) against the m = 12 formula, probably truncation.
