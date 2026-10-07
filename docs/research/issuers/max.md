# Max (מקס איט פיננסים בע"מ, formerly Leumi Card): card catalog research

Researched 2026-10-08. Prime is 4.75% (Bank of Israel rate 3.25% + 1.5), as in the background note. Every "seen" date below is 2026-10-08 unless stated. Hebrew quotes are verbatim from the source. Sources are listed at the end with their URLs; inline links point to them.

Two scopes recur throughout:

- **Max-issued (non-bank) cards** (כרטיסים חוץ בנקאיים). Max sets every term. Max's own cardholder agreement, fee schedule (תעריפון) and product pages govern them.
- **Bank-issued Max cards** (כרטיסים בנקאיים, in הנפקה משותפת with a bank). The **bank** sets the credit limit, its terms and the interest margins. The bank's own card agreement governs these cards, and the terms differ by bank.

---

## Summary table

| #   | Rate / rule                                                     | Value                                                                                                                                                                                                          | Basis                          | Kind                    | As of                     | Source                                        |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- | ------------------------- | --------------------------------------------- |
| 1   | Legal issuer                                                    | מקס איט פיננסים בע"מ (credit products also via מקס איט אשראים בע"מ)                                                                                                                                            | —                              | fact                    | agreement Nov 2025        | [primary] [agr]                               |
| 2   | Owner                                                           | Clal Holdings (כלל החזקות עסקי ביטוח), through Simax, since March 2023                                                                                                                                         | —                              | fact                    | AR 2025                   | [primary] [ar25]                              |
| 3   | Banks distributing Max cards                                    | Leumi, Mizrahi-Tefahot, Discount, Hapoalim, FIBI group (הבינלאומי)                                                                                                                                             | —                              | fact                    | AR 2025                   | [primary] [ar25]                              |
| 4   | Who sets terms on bank cards                                    | The bank: "לכל בנק הוקנתה סמכות לקבוע את מסגרת האשראי בכרטיסי האשראי ואת תנאיה"                                                                                                                                | —                              | rule                    | AR 2025                   | [primary] [ar25]                              |
| 5   | Billing dates, non-bank cards                                   | 2, 10 or 15 of the month                                                                                                                                                                                       | —                              | fixed list              | AR 2025                   | [primary] [ar25]                              |
| 6   | Cycle cut-off                                                   | Charges are counted by when Max **captures** them (נקלטו), between one billing date and the next, not by purchase date                                                                                         | —                              | rule                    | AR 2025; bank terms       | [primary] [ar25] [poalim]                     |
| 7   | FX conversion fee (standard Max cards)                          | 3%                                                                                                                                                                                                             | % of the transaction           | fixed                   | tariff from 1.10.2026     | [primary] [tariff]                            |
| 8   | FX fee, premium/club cards                                      | First 2%; SKYMAX 2.8%; SKYMAX Premium 1.9%; World Elite 1.5%                                                                                                                                                   | %                              | fixed per card          | tariffs 11.2025 / 10.2026 | [primary] [first] [sky] [we]                  |
| 9   | FX rate used                                                    | שער יציג "הידוע בעת עיבוד העסקה במערכות max" (the previous day's rate). Direct conversion for 14 currencies; others go via USD (Visa) or EUR (Mastercard)                                                      | —                              | rule                    | 2026                      | [primary] [abroad] [tariff]                   |
| 10  | FX charge timing (International / Gold cards)                   | Charged **immediately**, not at the billing date. Deferral to the billing date is optional, with interest                                                                                                      | prime-based daily interest     | rule                    | tariff 10.2026            | [primary] [tariff] [agr]                      |
| 11  | קרדיט (3–18)                                                    | Fixed rate. Equal Spitzer payments. Min deal ₪75, min ₪25 per payment                                                                                                                                          | fixed at grant                 | rule                    | 2026                      | [primary] [split] [discount]                  |
| 12  | קרדיט פלוס (19–36)                                              | Fixed for payments 1–18. From payment 19: new rate = old rate + (prime now − prime at the deal). The balance is then fixed to the end. Min deal ₪950, min ₪50 per payment. Not available for foreign purchases | "ריבית קבועה מתחלפת תקופתית"   | rule                    | agreement 11.2025         | [primary] [agr] [split] [discount]            |
| 13  | After-the-fact split (חלוקת עסקה)                               | 3–36 payments. Shekel "רגילה" deals of ₪75 or more. Min ₪25 per payment up to 18 payments, ₪50 above 18. Interest from the request date. Bridge interest if the deal was already charged                       | as קרדיט / קרדיט פלוס          | rule                    | 2026                      | [primary] [split]                             |
| 14  | Split the monthly bill (חלוקת החיוב החודשי = "חודש חופש")       | Bill of ₪600 or more. 3–36 payments, min ₪200 each. First payment on the 2nd billing date. Rate re-set at payments 13 and 25. Non-bank Max cards only                                                          | prime + margin                 | rule                    | 2026                      | [primary] [monthly] [agr]                     |
| 15  | Revolving (שירות אשראי מתגלגל) minimum payment                  | "200 ₪ או 2% מגובה המסגרת, הגבוה מבין השניים. בכרטיסים שאינם מסוג מולטי ... 500 ₪", rounded to the nearest ₪10                                                                                                 | % of the **limit**             | published rule          | 2026                      | [primary] [fixcharge] [agr]                   |
| 16  | Revolving rate                                                  | Variable, prime + margin                                                                                                                                                                                       | prime                          | personal                | agreement                 | [primary] [agr]                               |
| 17  | Mizrahi-issued Max International: קרדיט / revolving / חודש חופש | 15.50% → 16.65% / 14.50% → 15.50% / 16.25% → 17.52% (nominal → מתואמת)                                                                                                                                         | bank-set                       | published per card type | from 3.9.2026             | [primary] [mizrahi]                           |
| 18  | Mizrahi-issued Max Gold: same three                             | 13.25% → 14.08% / 11.75% → 12.40% / 16.25% → 17.52%                                                                                                                                                            | bank-set                       | published               | 3.9.2026                  | [primary] [mizrahi]                           |
| 19  | Mizrahi-issued Max Platinum                                     | 11.50% → 12.13% / 11.00% → 11.57% / 13.50% → 14.37%                                                                                                                                                            | bank-set                       | published               | 3.9.2026                  | [primary] [mizrahi]                           |
| 20  | Mizrahi-issued Max First                                        | 8.25% → 8.57% / 8.00% → 8.30% / 10.00% → 10.47%                                                                                                                                                                | bank-set                       | published               | 3.9.2026                  | [primary] [mizrahi]                           |
| 21  | Max online loan                                                 | Average מתואמת P + 5.57%; maximum P + 11.75%; 3–99 months                                                                                                                                                      | prime + margin                 | average and max         | 2026                      | [primary] [loancalc]                          |
| 22  | חלוקת החיוב החודשי rate                                         | Average מתואמת "P+5.57%" (the same figure as the loan)                                                                                                                                                         | prime + margin                 | average                 | 2026                      | [primary] [monthly]                           |
| 23  | Late interest (ריבית פיגורים)                                   | "בשיעור החוקי המקסימאלי" (Fair Credit Law cap: 1.2 × (BOI rate + 15) = 21.9% today). Actual/365, can be capitalised                                                                                            | BOI rate                       | max                     | agreement §18             | [primary] [agr]; cap from the background note |
| 24  | Day count, card credit                                          | "360 ימים בשנה ו-30 ימים בחודש (שיטת שפיצר) או ... 365 או 366", per the specific credit                                                                                                                        | —                              | rule                    | agreement §7.3            | [primary] [agr]                               |
| 25  | Card fee, standard non-bank cards                               | Classic ₪12.90/month; International and Gold ₪17.90; Gold Business and Platinum ₪19.90. Reduced or waived by monthly spend, on the פינוקים track only                                                          | monthly                        | fixed                   | from 1.10.2026            | [primary] [tariff]                            |
| 26  | Card fee, premium cards                                         | SKYMAX ₪19.90; SKYMAX Premium ₪29.90; First ₪60; World Elite "270 ש״ח לכרטיס"                                                                                                                                  | monthly per the tariff wording | fixed                   | 11.2025 / 10.2026         | [primary] [sky] [first] [we]                  |
| 27  | Early repayment of a credit                                     | ₪60 (none in the first 3 business days, for loans and splits)                                                                                                                                                  | flat                           | fixed                   | 2026                      | [primary] [tariff] [monthly]                  |
| 28  | Early / immediate repayment of transactions                     | ₪40 per request, ₪20 online                                                                                                                                                                                    | flat                           | fixed                   | 2026                      | [primary] [tariff]                            |
| 29  | Prime used in Max contracts                                     | "ריבית הנקבעת על-ידי בנק לאומי לישראל בע"מ"                                                                                                                                                                    | —                              | definition              | agreement                 | [primary] [agr]                               |
| 30  | Change notice                                                   | 30 days' written notice for contract changes. Prime moves apply automatically. Non-prime rate changes apply only to credit granted after the notice                                                            | —                              | rule                    | agreement                 | [primary] [agr]                               |

Every Mizrahi nominal/מתואמת pair in rows 17–20 matches (1 + i/12)^12 − 1 to two decimals. The one borderline case is Gold קרדיט: 13.25% gives 14.085%, published as 14.08% (rounding of a value that falls exactly on .005). The loan example on Max's page, 10% → 10.47%, also matches.

---

## 1. Identity

### 1.1 Legal entity and history

- **Legal name**: מקס איט פיננסים בע"מ. The agreement names the provider as "מקס איט פיננסים בע"מ ו/או מקס איט אשראים בע"מ ו/או כל גוף אחר מטעמם". The current agreement version is dated "גרסת נובמבר 2025" (form 30-12-005, 11.2025). **[primary]** [agr]
- **Subsidiaries**: מקס איט אשראים בע"מ, מקס איט פקדונות בע"מ, מקס איט ניכיונות בע"מ, מקס סוכנות לביטוח (2020) בע"מ. **[primary]** [ar25]
- **History and ownership**: Founded 15.2.2000. The company was Leumi Card. It has been controlled by Simax since 25.2.2019. Simax was formerly WPI (Warburg Pincus) and has been controlled by **Clal Holdings** since March 2023 (Supervisor of Banks control permit dated 23.2.2023). **[primary]** [ar25]. Max's About page: "חברת MAX הינה בבעלות קבוצת כלל החזקות עסקי ביטוח בע"מ". It reports more than 3 million active cards. **[primary]** [about]
- **Regulatory status**: "נותן שירותי תשלום בעל חשיבות יציבותית" (formerly "סולק"), under the Banking (Licensing) Law. **[primary]** [ar25] [q2]
- **Brands it issues**: Visa and Mastercard. (Cal issues Diners; Isracard issues Isracard and Amex. Max issues neither.) **[primary]** [ar25]
- **Card mix**: about 86% of valid Max cards are credit cards, 11% debit and 3% prepaid. **[primary]** [ar25]
- **Market share** (30.9.2025): about 20% of bank-card issuing turnover and about 35% of non-bank-card turnover. **[primary]** [ar25]

### 1.2 Bank-issued vs non-bank Max cards

- **Banks**: "החברה מנפיקה כרטיסים בנקאיים במסגרת הנפקה משותפת ותפעול הנפקה (Processing) של כרטיסי אשראי עם בנק לאומי, בנק מזרחי טפחות בע"מ, בנק דיסקונט בע"מ, בנק הפועלים בע"מ וקבוצת הבנק הבינלאומי בע"מ ללקוחותיהם". **[primary]** [ar25]
  - **Leumi** is the main partner. The agreement was signed 11.10.2018 and amended 10.2.2025. It was extended to **31.1.2031**. Leumi's agreement provides about 21% of issuing-segment revenue net of bank payments. It also includes "הסדרת הפסקת השימוש בשם 'לאומי קארד'". **[primary]** [ar25]. Max runs a dedicated service line for "כרטיס עם לוגו של בנק לאומי" (*5522). **[primary]** [contact]
  - **Hapoalim** has a general-terms agreement for Max-issued Hapoalim cards, dated August 2026. **[primary]** [poalim]. Since 31.8.2022 Hapoalim-branded Max cards no longer earn Max's פינוקים, because Hapoalim runs its own loyalty programme. **[primary]** [qa-poalim]
  - **FIBI (First International)** has "תנאים כלליים לקבלת כרטיס חיוב max" (form 214-1400, 6.22). The parties are FIBI and Max. **[primary]** [fibi]
  - **Discount** describes "כרטיסי אשראי שהונפקו ב-max" alongside Cal cards. **[primary]** [discount]
  - **Mizrahi-Tefahot** publishes rates for "כרטיס אשראי ויזה מקס" and "ויזה מקס מולטי". **[primary]** [mizrahi]
- **Who sets what on bank cards** (Max's annual report, note 20):
  - "לכל אחד מהבנקים הוקנתה סמכות לקבוע למי מלקוחותיו יונפק כרטיס ... לכל בנק הוקנתה סמכות לקבוע את מסגרת האשראי בכרטיסי האשראי ואת תנאיה".
  - "כל בנק אחראי למלוא החיובים" (with exceptions such as fraud and lost cards).
  - Bank-card balances "הן בערבות הבנקים". The card limit is usually part of the bank account's credit line.
  - **[primary]** [ar25]
- **The banks' own contracts confirm that the bank sets the interest margin:**
  - FIBI/Max: קרדיט is priced at "שיעור הריבית הבסיסית (פריים) במועד קליטת העסקה אצל החברה, בתוספת או בהפחתת מרווח שיקבע הבנק". **[primary]** [fibi]
  - Hapoalim/Max: "תוספת הסיכון להסדר קרדיט בתשלומים כפי שיהיו נהוגים בבנק". **[primary]** [poalim]
  - Leumi: קרדיט is "בשיעור, במספר תשלומים ובסכום כפי שייקבעו על-ידי הבנק". **[primary]** [leumi]
  - The 2018 Leumi Card leaflet also said "שיעורי הריבית משתנים בהתאם להחלטת בנק לאומי ו/או ... לאומי קארד לפי העניין". **[primary, 2018]** (from the background note)
- **Non-bank cards**: "האשראי בכרטיסים החוץ בנקאיים מועמד על ידי החברה ומסגרת האשראי נקבעת בהתאם לשיקול דעתה הבלעדי". The credit risk is Max's. These cards debit any bank account under a הרשאה לחיוב חשבון. **[primary]** [ar25]
- **Some Max products exist only on non-bank cards.** חלוקת החיוב החודשי says "ניתן לבצע את הפעולה בכרטיס max חוץ בנקאי בלבד". **[primary]** [monthly]

### 1.3 Co-branded and club cards

Max publishes a separate disclosure-and-fees document (גילוי נאות ותעריפון) for each club. The list on its commissions page covers:

- MAX Back Total, MAXBack, MAXBack CRYPTO
- SKYMAX / SKYMAX Premium, DREAMCARD VIP, MyMAX (prepaid, for children)
- פינוקים, executive (workplace clubs), MAX Business, XPLACE Business, WINCARD+ (מחסני השוק)
- UNIQ, UNIQ ISIC, TAU, קרנות, תמורה (teachers), ביחד בשבילך (Histadrut), בהצדעה (discharged soldiers and reservists)
- First, SUPER PAY-BACK, World Elite, מועדון האלף, חברת החשמל
- רעות תקני לי, I need it, ויקטורי, Hebrew University alumni, 1824, INDI / All-Club Business, קרנות PRE-PAID, קלאב 50, FREE, CLALPAY
- מסגרת בטוחה (a secured card)

**[primary]** [comm]

- **Credit terms do not differ by club in any published Max document.** The club disclosures I read contain card fees, FX fees and points rules, but **no interest rates**. All of them sit under the one cardholder agreement. **[primary]** [mbt] [tariff] (and the 25 club tariffs listed in [comm], all read)
- **Interest does differ by card _tier_** (International / Gold / Platinum / First) on bank-issued cards. See Mizrahi's table, §5. Max's agreement allows "ריביות שונות (לרבות מרווחים שונים מריבית הפריים) בהתאם לסוג הכרטיס בהתאם למסלול האשראי או על-פי נתונים אחרים הקשורים אליי" (§7.8(ה)). **[primary]** [agr] [mizrahi]
- **MAX Back Total** supports "עסקאות רגילות, תשלומים, קרדיט וקרדיט פלוס" and gives "מסגרת אשראי נוספת – בנוסף לזו שיש לכם בבנק". **[primary]** [mbt]
- **Card fees differ by club and tier** (§8).

---

## 2. Billing

- **Billing dates on offer (non-bank)**: "מועדי החיוב של מחזיקי הכרטיס הינם ב-2, 10 או ה-15 לכל חודש. במועדי חיוב אלה, גובה החברה ממחזיקי הכרטיס החוץ בנקאיים את חיובי החודש שחלף ממועד החיוב הקודם ועד למועד החיוב הנוכחי." **[primary]** [ar25]
  - A secondary search summary claimed 2, 5 and 10. That conflicts with the annual report, and I treat the annual report as authoritative. **[secondary, rejected]**
- **The billing date is chosen** on the application form "בין האפשרויות אשר יפורטו שם". It can be changed by notice, "ועשוי להיות כרוך בעמלה". Max may change dates or add billing dates with advance notice (§1 definition "מועד החיוב החודשי"; §5.9). **[primary]** [agr]
  - The 1.10.2026 tariff lists **no** billing-date-change fee. **[primary]** [tariff]
  - Online change: `online.max.co.il/Registred/ChangeBillingCycle.aspx` (requires login, not read).
- **Cut-off rule**:
  - The accumulated balance grows "בסמוך לאחר הגעת החיוב לחברה" (§5.9). **[primary]** [agr]
  - Hapoalim's Max-card terms are explicit: the cycle covers charges "אשר ייקלטו אצל חברת כרטיסי האשראי ... בתקופה שבין מועד חיוב אחד לבין מועד החיוב שלאחריו ... בלי להתחשב בתאריכים הרשומים על השוברים" (§8.1). **[primary]** [poalim]
  - **So the rule is the capture date at Max, not the purchase date.**
  - The exact daily cut-off (how many days before the billing date capture closes) is **UNCONFIRMED**.
- **Bank-issued cards**: the bank chooses.
  - Hapoalim: the date is "המועד שנבחר על-ידי הלקוח מבין המועדים המקובלים אצל הבנק". The bank may force one date for all cards on an account (§8.5). A changed date can be refused if the previous change was within 90 days (§8.8). **[primary]** [poalim]
  - Leumi: "מועד החיוב החודשי ניתן לשינוי בהודעה שתימסר על ידי הלקוחות לבנק" (§11). **[primary]** [leumi]
  - Which dates each bank offers is **UNCONFIRMED** (not in the documents read).
- **Index- or FX-linked deals at Hapoalim**: if the billing date is not the 2nd, "יחויב בתשלום הראשון חודש לאחר מועד החיוב הרגיל" (§8.7). **[primary]** [poalim]

---

## 3. Foreign purchases

- **Conversion fee**:
  - **3%** on "כל העסקאות במט"ח שבוצעו בישראל או מחוץ לישראל" and on foreign cash withdrawals (general tariff from 1.10.2026; MAX Back Total, MAXBack and most club tariffs). **[primary]** [tariff] [mbt-t]
  - First **2%**; SKYMAX **2.8%**; SKYMAX Premium **1.9%**; World Elite **1.5%**. **[primary]** [first] [sky] [we]
  - Bank-issued Max cards follow **the bank's** tariff. Max's FX page sends readers to Leumi's, Mizrahi's and Discount's tariffs. Leumi markets its own figures, e.g. FlyCard 2.5%, FlyCard Premium 1.8%, FlyAll 1% in year 1. **[primary]** [abroad] [leumi-cards]
- **Which rate**:
  - "המרה ישירה ממטבע העסקה המקורי למטבע שקלי על פי השער יציג" for 14 currencies: USD, AUD, CAD, JOD, EUR, JPY, GBP, LBP, EGP, CHF, SEK, NOK, DKK, ZAR.
  - Any other currency converts via USD at Visa's rate, or via EUR at Mastercard's rate, then to shekels at the representative rate "הידוע בעת עיבוד העסקה במערכות max (השער של היום הקודם ליום עיבוד העסקה)".
  - **[primary]** [abroad] [tariff]
- **When the conversion happens**: at Max's **processing** of the transaction, not at the purchase or billing date. **[primary]** [abroad]
- **When it is charged**:
  - "אם יונפק לי כרטיס מסוג ויזה בינלאומי או ויזה זהב/זהב עסקי, החיוב בגין עסקאות במטבע חוץ ... כולל משיכות מזומנים בחו"ל ועסקאות בשקלים בחו"ל ו/או עסקאות באינטרנט בבית־עסק שמקום מושבו בחו"ל וכן עסקאות שתבוצענה במטבע־חוץ בישראל ... תחויבנה באופן מיידי ולא במועד החיוב החודשי." **[primary]** [tariff]
  - "אם ארצה, אוכל לפנות ל-max ולבקש שחיובי מט"ח יידחו למועד החיוב החודשי בתוספת חיוב בריבית." **[primary]** [mbt-t]
  - The deferral is the "דחיית חיובים למועד החיוב החודשי" credit: prime-based variable interest "בגין מספר הימים שחלף ממועד החיוב המקורי ועד למועד החיוב החודשי" (§7.3(ז)). **[primary]** [agr]
  - **Revolving-credit members**: "עסקאות במט"ח בחו"ל, עסקאות שקליות בחו"ל ומשיכות מט"ח בחו"ל בכרטיסך יתבצעו במועד החיוב החודשי" (they can switch to immediate). **[primary]** [fixcharge]
  - Platinum and other tiers: the 2018 Leumi Card leaflet excepted Platinum from immediate charging. The current tariff names only International and Gold. Whether Platinum is charged monthly today is **UNCONFIRMED**.
- **Shekel purchases from foreign websites**:
  - They are classed with the "חיובי מט"ח" that are charged immediately on International and Gold cards (quote above). **[primary]** [tariff]
  - Whether the 3% fee applies to a shekel-denominated charge from a foreign merchant is **UNCONFIRMED**. The tariff applies 3% to "עסקאות במט"ח" only, and Hapoalim §9.6 says such shekel slips are charged in shekels.
- **Example** (Max's own):
  - Withdrawing ₪1,000 abroad costs 3%, giving ₪1,030. There is no separate Max cash-withdrawal fee for the 14 currencies.
  - If the foreign ATM charges ₪50, the 3% applies to ₪1,050, giving ₪31.50.
  - **[primary]** [abroad]

---

## 4. Deal types

Max's agreement §7.3 lists the credit tracks (מסלולי האשראי):

- "אשראי קרדיט" / "אשראי קרדיט חו"ל"
- "אשראי קרדיט פלוס"
- "אשראי חודש חופש"
- "אשראי הלוואה ברגע"
- "אשראי צמוד מט"ח/מדד"
- "אשראי 30 פלוס"
- "דחיית חיובים למועד החיוב החודשי"
- "הלוואת Multi"
- "שירות אשראי מתגלגל"
- "מסלול Multi"
- "אשראי בריבית קבועה"

Repayment of every installment track is "בסכומים חודשיים שווים ורצופים של קרן בתוספת ריבית", i.e. **Spitzer**. **[primary]** [agr]

**Statement / data labels.** These are the `planName` values in Max's online data, as read by israeli-bank-scrapers' `max.ts` (last changed 2026-07-16). **[secondary]** [scraper]:

- "רגילה", "חיוב עסקות מיידי", "אינטרנט/חו"ל"
- "תשלומים", "קרדיט", "קרדיט-מחוץ למסגרת"
- "חיוב חודשי", "תשלום חודשי"
- "דחוי חודש", "דחוי לחיוב החודשי", "דחוי חודש תשלומים", "דחוי חודשיים", "דחוי 2 ח' תשלומים"
- "מימון לרכישה עתידית", "עסקת 30 פלוס", "חודשי + ריבית"
- "סל מצטבר", "פריסת העסקה הדחויה", "חלוקת חיוב חודשי"
- "כרטיס חליפי", "פרעון מוקדם", "דמי כרטיס", "חיוב ארנק מטח"

The scraper treats "תשלומים", "קרדיט" and "קרדיט-מחוץ למסגרת" (and planTypeId 2/3) as installments, and planTypeId 5 as normal.

### 4.1 רגילה

- A single charge at the next billing date after capture (§5.9). Label "רגילה". **[primary]** [agr]; label **[secondary]** [scraper]

### 4.2 תשלומים (merchant installments) and the linked variants

- The number of payments is "כמספר התשלומים שנרשמו על-פני השובר", starting "ממועד החיוב הסמוך" (§5.9(א)(2)). **[primary]** [agr]
- Hapoalim: "מועד פירעון התשלום הראשון יהא במועד החיוב הסמוך למועד ביצוע העסקה, וכל תשלום תורן נוסף ייפרע במועד החיוב העוקב" (§8.3). **[primary]** [poalim]
- **CPI-linked** (צמוד מדד):
  - Each payment is adjusted by "המדד החדש" (the last CPI published before the payment's due date) against "המדד היסודי" (the last CPI published before the credit) (§7.8(ג)).
  - Max has a separate agreement appendix (2023) for index-linked credit.
  - **[primary]** [agr] [cpi]
- **FX-linked** (צמוד מט"ח): adjusted by the representative rate "שיפורסם בגין יום הגדלת סכום החיוב המצטבר" against the rate on the day the credit was given (§7.8(ד)). **[primary]** [agr]
- Statement label: "תשלומים", with the comment "תשלום k מתוך N". **[secondary]** [scraper]

### 4.3 קרדיט (3–18 payments)

- **Contract**: "אשראי בריבית קבועה בשיעור, במספר תשלומים ובסכום כפי שייקבעו על-ידי החברה". If the requested number or size of payments does not fit, Max may adjust them, and the result is shown on the statement (§7.3(א)). **[primary]** [agr]
- **Minimums** (Max-issued cards): deal ₪75, payment ₪25. "הריבית הינה ריבית קבועה (אינה משתנה לאורך חיי העסקה)". **[primary]** [discount]. Same figures on Max's split page. **[primary]** [split]
- **First payment**: "*במועד החיוב הראשון העסקה תופיע לידיעה בדף הפירוט החודשי" (Discount, about Max cards). So payment 1 falls on the 2nd billing date. **[primary]** [discount]
- **When the credit starts**: "מועד העמדת האשראי ... לפי שובר אשראי – מועד קליטת השובר בחברה" (§7.5(א)). Interest runs "בגין התקופה המתחילה במועד העמדתו של האשראי" (§7.3). "ייתכן שאהיה מחויב בריבית גישור" (§7.3). **[primary]** [agr]
  - How the days from capture to the first billing date are billed (inside payment 1, or as a separate bridge line) is **UNCONFIRMED**.
- **Bank versions**:
  - Hapoalim: interest "תחושב על פי מספר החודשים השלמים ... החל ממועד החיוב הרגיל", 30/360; the rate is fixed on the day the slip is captured (§19.2.3). **[primary]** [poalim]
  - FIBI: prime at capture + the bank's margin; "שינויים ... לא יחולו על אשראי שכבר הועמד". **[primary]** [fibi]
  - Leumi: fixed "על בסיס ריבית הפריים כפי שתהיה במועד ביצוע העסקה, בתוספת מרווח", 30/360 Spitzer. **[primary]** [leumi]
- **Label**: "קרדיט". **[secondary]** [scraper]

### 4.4 קרדיט פלוס (19–36 payments): the re-pricing at payment 19

**Contract text** (Max agreement 11.2025, §7.3(ב)):

> "'אשראי קרדיט פלוס' ... הינו אשראי בריבית קבועה מתחלפת תקופתית במסגרתו מוגדל סכום החיוב המצטבר ב-19 עד 36 תשלומים וכולל שתי תקופות ריבית: (א) התקופה הראשונה – תקופת הגדלת סכום החיוב המצטבר בגין 3-18 התשלומים הראשונים ו-(ב) התקופה השנייה – יתר תקופת התשלומים. ... בכפוף לשינוי סכום החיוב המצטבר החודשי החל ממועד השינוי, כמתחייב משינוי ריבית הקרדיט."

The text says "3-18". In context this plainly means payments 1–18; it is probably a drafting slip. **[primary]** [agr]

**Definition of the rate type** (§7.2(ב)(2), "ריבית קבועה מתחלפת תקופתית"):

> "עם סיום תקופה ותחילת תקופה חדשה ישתנה שיעור הריבית במספר אחוזים זהה לזה שבו שונתה ריבית הפריים בין שתי התקופות לריבית קבועה למשך תקופה נוספת."

**[primary]** [agr]

**Max's split page states the operational rule:**

> "בפריסה של 19 תשלומים ומעלה – שיעור הריבית יתעדכן בתשלום ה-19 וככל שחל שינוי בבסיס הפריים. אם יחול שינוי בריבית הפריים, אזי במועד החיוב שלאחר השינוי תחושב יתרת הפריסה שטרם סולקה לפי ריבית הפריים החדשה וריבית זו תישאר קבועה עד לתום תקופת הפריסה."

**[primary]** [split]

**Formula** (my synthesis of the two quotes above):

- r₁ = the nominal annual rate fixed at the deal.
- P₀ = prime when the credit was granted. P₁₉ = prime when period 2 starts (at payment 19).
- **r₂ = r₁ + (P₁₉ − P₀)**, fixed for payments 19…N.
- Payment for k = 1…18: PMT₁ = A·(r₁/12) / (1 − (1 + r₁/12)^−N).
- B₁₈ = the balance after payment 18.
- Payment for k = 19…N: PMT₂ = B₁₈·(r₂/12) / (1 − (1 + r₂/12)^−(N−18)).

**Worked example** (my numbers; the method follows the contract):

- ₪3,600 in 24 payments at 15.50% (Mizrahi's Max International קרדיט rate). PMT₁ = ₪175.41. B₁₈ = ₪1,006.46.
- If prime is 0.5 point higher at payment 19: r₂ = 16.00%, and PMT₂ = ₪175.66 for payments 19–24.

**Other terms:**

- **Minimums**: deal ₪950, payment ₪50. "התוכנית אינה רלוונטית לרכישות שמתבצעות בחו"ל". "הריבית מחושבת על פי לוח סילוקין שפיצר". **[primary]** [discount]. Max's split page also sets ₪50 per payment above 18. **[primary]** [split]
- **Bank versions differ.**
  - Hapoalim's Max-card terms allow 19–36 payments with ₪50 minimum principal (₪950 minimum deal). The rate is "ריבית קבועה" fixed at capture, and the terms describe **no** re-set at payment 19 (§19.2.2.3.2, §19.2.3.1). **[primary]** [poalim]
  - FIBI's and Leumi's terms allow קרדיט up to 36 payments, at a fixed rate not changed for credit already granted, and do not mention קרדיט פלוס. **[primary]** [fibi] [leumi]
  - Discount says its Max-issued cards **do** re-set after payment 18. **[primary]** [discount]
- **Rate**: no source publishes a separate קרדיט פלוס rate. Mizrahi publishes one "קרדיט בתשלומים קבועים" rate per card. **UNCONFIRMED** whether 19–36 deals start at the same rate as 3–18.
- **Label**: probably "קרדיט" (there is no separate plan name in the scraper). **UNCONFIRMED**.
- **Name**: Max's own MAX Back Total page uses "קרדיט פלוס". **[primary]** [mbt]

### 4.5 דחוי / 30 פלוס

- **"אשראי 30 פלוס"**: "אשראי בריבית משתנה על בסיס פריים ... קרן בצירוף ריבית שתחושב על-פי מספר הימים שחלף ממועד החיוב החודשי ועד מועד החיוב החודשי הסמוך שחל מיד אחריו" (§7.3(ו)). It is triggered by a slip marked "פלוס 30" (§7.5(ב)). **[primary]** [agr]. Label "עסקת 30 פלוס". **[secondary]** [scraper]
- **Merchant deferrals** (labels "דחוי חודש", "דחוי חודשיים", "דחוי לחיוב החודשי", "דחוי חודש תשלומים", "דחוי 2 ח' תשלומים"): the contract allows "מועדי חיוב דחויים" as agreed between the cardholder and the merchant (§5.9(א)(1)). Whether these are interest-free to the cardholder is **UNCONFIRMED**; the contract describes them as merchant-agreed with no interest clause. **[primary]** [agr]; labels **[secondary]** [scraper]
- **"דחיית חיובים למועד החיוב החודשי"**: immediate charges (FX, cash) deferred to the billing date at prime-based interest by days (§7.3(ז)). **[primary]** [agr]

### 4.6 Spreading after the fact (Max's "פריסה" products)

**(a) חלוקת עסקה לתשלומים: split one past transaction.** **[primary]** [split]

- **Eligibility**: "אפשר לחלק כל עסקה רגילה שחויבה בשקלים בלבד, בסכום של 75 ₪ ומעלה".
- **Payments**: 3–36, "תלוי בסכום". Min ₪25 per payment (excluding interest) up to 18 payments; ₪50 above 18. No limit on the number of deals.
- **Interest**: "החלוקה לתשלומי קרדיט צוברת ריבית מיום הבקשה". Up to 18 payments the rate is fixed; from 19 payments up, the rate re-sets at payment 19 by the prime change (§4.4).
- **A deal not yet charged**: "לא יהיה חיוב בריבית גישור כלל".
- **A deal already charged**: "החשבון יזוכה תוך 3 ימי עסקים. במועד החיוב הקרוב, יתבצע חיוב בריבית גישור. החל ממועד החיוב השני לאחר הגשת הבקשה, יחל החיוב בתשלומי העסקה שנפרסה". The bridge interest is "ריבית יומית משתנה".
- **The quoted rate is not locked**: "במקרה שיחול שינוי בשיעור הריבית עד למועד פריסת העסקה ... תחויב עפ"י הריבית החדשה".
- **Rate**: personal. Not published. **UNCONFIRMED**.
- **Label after splitting**: **UNCONFIRMED** (probably "קרדיט").
- **Bank-card version (Hapoalim)**: a split request "בדיעבד" gets the account credited within 4 business days. Interest runs from the credit date, or "ממועד החיוב הרגיל" if the deal had not yet been charged (§19.2.1.2.2). **[primary]** [poalim]

**(b) חלוקת החיוב החודשי: split the whole or part of the monthly bill.** In the contract this is "אשראי חודש חופש". **[primary]** [monthly] [agr]

- **Limits**: bill of ₪600 or more; 3–36 payments; at least ₪200 each.
- **Deadlines**: request up to 1 business day before the billing date, by 17:00, or "בדיעבד" up to 7 days after it (the debited amount is refunded).
- **First payment**: "במועד החיוב השני מרגע ביצוע החלוקה".
- **Exclusions**: non-bank Max cards only; one card per month; no immediate charges (cash, foreign); not "כסף בצד"/"כסף פלוס".
- **Early repayment**: ₪60 (free in the first 3 business days).
- **Rate**: "הריבית החודשית הממוצעת ... שיעור הריבית השנתית המתואמת הממוצעת P+5.57%", prime + margin, "המותאמת אישית".
- **Rate periods** (contract §7.3(ג)): "התקופה הראשונה – 12 חודשים ... כך שהריבית תשתנה בתשלום ה-13, (ב) התקופה השנייה – 12 חודשים נוספים, כך שהריבית תשתנה בתשלום ה-25". Each re-set is by the prime change, per the "ריבית קבועה מתחלפת תקופתית" definition.
- **Bank versions**: FIBI's Max-card terms describe the same חודש חופש periods, with a margin set by the bank (§12.2.8). **[primary]** [fibi]
- **Label**: "חלוקת חיוב חודשי". **[secondary]** [scraper]

**(c) "פריסת העסקה הדחויה"**: a label in Max's data for spreading a deferred deal. Its terms are **UNCONFIRMED**. **[secondary]** [scraper]

### 4.7 Other plans

- **הלוואה ברגע** (on the card): "אשראי בריבית קבועה מתחלפת חודשית", up to 60 payments (§7.3(ד)). "Monthly" means the rate follows prime from the next billing date (loan terms §8.7(ג)). **[primary]** [agr]
- **Multi** (an older revolving card type): "מסלול Multi" and "הלוואת Multi", prime-based variable. The loan joins the accumulated balance and bears interest "באותו אופן כמו סכום החיוב המצטבר" (§7.3(ח),(י)). **[primary]** [agr]
- **קרדיט חו"ל**: a fixed-rate installment credit for foreign charges (§7.3(א)). Its terms are not published. **[primary]** [agr]
- **"קרדיט-מחוץ למסגרת"**: a data label. Its terms are **UNCONFIRMED**. **[secondary]** [scraper]

---

## 5. Interest on קרדיט

| Card (Mizrahi-issued Max)                    | קרדיט בתשלומים קבועים, nominal | מתואמת | Check                        |
| -------------------------------------------- | ------------------------------ | ------ | ---------------------------- |
| Visa International (and Multi International) | 15.50%                         | 16.65% | 16.650 ✓                     |
| Visa Gold / Gold Business (and Multi)        | 13.25%                         | 14.08% | 14.085 (borderline rounding) |
| Visa Platinum (and Multi)                    | 11.50%                         | 12.13% | 12.126 ✓                     |
| Visa First                                   | 8.25%                          | 8.57%  | 8.569 ✓                      |

- **Source**: Mizrahi, "שיעורי ריבית באשראי", in force from 3.9.2026. Each rate fell by −0.25 points on that date, with prime. **[primary]** [mizrahi]
- **Kind**: the published rate for each card type at Mizrahi. Mizrahi does not label it as a maximum. Personal rates may differ, since the agreements let the margin depend on the customer.
- **Basis**: prime + a bank margin. Implied margins: International +10.75, Gold +8.50, Platinum +6.75, First +3.50. (Computed: published nominal − 4.75.)
- **Fixed at purchase**: yes, for 3–18 payments. For 19–36 the rate re-sets once at payment 19 on Max-issued and Discount cards (§4.4).
- **Interest start**:
  - Max-issued: from the capture of the slip at Max (§7.5(א)), with possible bridge interest. **[primary]** [agr]
  - Hapoalim-issued: from the regular billing date. **[primary]** [poalim]
- **Method**: Spitzer, with equal monthly payments of principal + interest. **[primary]** [agr] [discount]
- **Day count**: "360 ימים בשנה ו-30 ימים בחודש (שיטת שפיצר) או ... מספר הימים שחלפו בפועל ... חלקי 365 או 366 ... כמפורט בהסכם האשראי" (§7.3). Bank versions use 30/360. **[primary]** [agr] [poalim] [leumi]
- **First payment**: on the 2nd billing date. The deal shows "לידיעה" on the 1st. **[primary]** [discount]
- **Max-issued (non-bank) קרדיט rates are not published** on max.co.il. The agreement says the rates appear "בדפי הפירוט התקופתיים" (§7.8(ה)). **UNCONFIRMED** figures.

---

## 6. Revolving credit (שירות אשראי מתגלגל / סל מצטבר)

- **Names**:
  - Current: "שירות אשראי מתגלגל" (Max). The rolled balance is called "סל מצטבר" (also "סל עסקות מצטבר נושא ריבית"). **[primary]** [fixcharge]
  - Older or other: "מסלול Multi" on Multi cards **[primary]** [agr]; "חיוב חודשי קבוע" in the FIBI bank version **[primary]** [fibi]; "מסלול חיוב חודשי קבוע" at Leumi **[primary]** [leumi]; "הסדר קרדיט" (5% / ₪100, quarterly interest) at Hapoalim **[primary]** [poalim].
- **Joining**: a setting on the existing card, not a separate card. It is open to "כל מי שיש לו כרטיס אשראי של MAX. לא כולל כרטיסי PEPPER, DEBIT ורכש". You join on the application or later; there is also a one-time variant (חיוב חד פעמי). **[primary]** [fixcharge] [agr]
- **Minimum monthly payment, verbatim**: "ניתן לקבוע החזר חודשי מינימאלי בסך 200 ₪ או 2% מגובה המסגרת, הגבוה מבין השניים. בכרטיסים שאינם מסוג מולטי ניתן לקבוע החזר חודשי מינימאלי בסך 500 ₪. החברה שומרת לעצמה את הזכות לבצע שינויים בחיוב החודשי המינימאלי מעת לעת." **[primary]** [fixcharge]
  - The contract defines it as "סכום מינימלי או אחוז מסוים ממסגרת האשראי ... לפי הגבוה מהשניים כשהוא מעוגל לכפולה של 10 ₪ הקרובה ביותר", and Max may set it per customer (§7.3(ט)). **[primary]** [agr]
  - **Confirmed**: the greater of ₪200 and 2% **of the credit limit**, rounded to ₪10. Examples: limit ₪10,000 → ₪200; ₪20,000 → ₪400; ₪30,000 → ₪600.
  - **Ambiguity**: for "cards that are not Multi" the page names a ₪500 minimum. It does not say whether that replaces the ₪200 floor (i.e. max(₪500, 2% of limit)) or is a flat ₪500. **UNCONFIRMED**.
  - **Bank versions differ**:
    - FIBI: the greater of a set amount or "אחוז מסוים מסך ההתחייבויות בכרטיס" (of total obligations, not of the limit). **[primary]** [fibi]
    - Leumi: the greatest of a set amount, a % of the card limit, or a % of the monthly charge. **[primary]** [leumi]
- **Which balance bears interest**: "הריבית שמשלמים היא רק על הסכום שנדחה מחודש לחודש". **[primary]** [fixcharge]
  - Contract mechanics (§7.3(ט)): purchases join interest-bearing credit "לתקופה המתחילה במועד החיוב החודשי הקרוב ומסתיימת במועד החיוב החודשי הסמוך שאחריו". So there is a grace period: the new month's purchases bear no interest until the first billing date, and only the unpaid remainder then accrues.
  - Cash withdrawals (if chosen) and foreign deals accrue from capture to the billing date.
  - Loans and other credit products: "הריבית על סכום החיוב בשירות אשראי מתגלגל תחול גם על ההחזר החודשי של ההלוואות ומוצרי האשראי (ריבית דריבית)".
  - **[primary]** [agr] [fixcharge]
- **Rate**: "אשראי בריבית משתנה על בסיס פריים" (§7.3(ט)). A prime change moves it point for point (§7.2(ב)(3)). **[primary]** [agr]
  - Published figures (Mizrahi-issued Max cards, from 3.9.2026): International 14.50% / 15.50%; Gold 11.75% / 12.40%; Platinum 11.00% / 11.57%; First 8.00% / 8.30%. All match m = 12. **[primary]** [mizrahi]
  - Max-issued (non-bank) rate: not published. **UNCONFIRMED**.
- **Day count and compounding**:
  - The day count is not specified for revolving (the general §7.3 allows either 30/360 or actual/365). **UNCONFIRMED**.
  - Compounding is monthly: "כל ריבית ... תגדיל את סכום החיוב המצטבר ותצטרף לקרן – בתום כל חודש ... ותישא אף היא ריבית" (§19). **[primary]** [agr]
- **Paying more**:
  - "ניתן לבצע פירעון חלקי או מלא של הסל שהצטבר בכל עת ללא עלות".
  - The fixed amount can be changed "בכל עת, לכל המאוחר עד יום עסקים לפני מועד החיוב בשעה 17:00".
  - If spending is below the fixed amount, the lower amount is charged.
  - A fixed amount equal to the limit means everything is charged.
  - **[primary]** [fixcharge]
- **Over the limit**: "אם יתרת הכרטיס בחריגה ממסגרת האשראי בסכום העולה על גובה החיוב ... יחויב החשבון בגובה החריגה בתוספת ריבית". **[primary]** [fixcharge]
- **Large amounts**: with a fixed amount of ₪15,000 or more, the limit is freed 5 business days after the billing date. **[primary]** [fixcharge]
- **On the statement**: "סל מצטבר ... תמיד יופיע כחלק מהחיוב העתידי וכחלק מדף הפירוט". **[primary]** [fixcharge]. The data label is "סל מצטבר", and "חודשי + ריבית" may be its interest line (**UNCONFIRMED**). **[secondary]** [scraper]
- **Size**: Max's revolving balance was about ₪2,060 million at 31.12.2025. **[primary]** [ar25]

---

## 7. Other rates

| Item                                         | Rate / fee                                                                                                                                                                                                                                       | Basis                | m / day count                                                                   | Source                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Late interest (ריבית פיגורים)                | "בשיעור החוקי המקסימאלי ... או ... הגבוה ביותר מבין השיעורים שיהיו נהוגים בחברה ... או ... בשיעור המרבי" (§18). Fair Credit cap today 21.9%                                                                                                      | BOI rate + 15, × 1.2 | actual/365(366), "קונטוקורנטית"; may be added to principal (§18(ד), §19)        | [primary] [agr]; cap figure from the background note             |
| Over-limit (חריגה)                           | No separate published rate. The excess may be charged immediately; revolving: "בגובה החריגה בתוספת ריבית"                                                                                                                                        | —                    | —                                                                               | [primary] [agr] [fixcharge]                                      |
| Cash withdrawal abroad                       | 3% FX fee. No separate Max withdrawal fee for the 14 currencies. ₪22 for a withdrawal "ממטבע שמתנהל באותו חשבון"                                                                                                                                 | %                    | —                                                                               | [primary] [tariff] [abroad]                                      |
| Cash withdrawal, interest                    | Immediate charge on International/Gold. If deferred: prime-based daily interest to the billing date (§7.3(ז))                                                                                                                                    | prime + margin       | days                                                                            | [primary] [agr]                                                  |
| Cash withdrawal in Israel                    | The tariff lists 1% only for prepaid cards not linked to a current account. A credit-card ATM fee in Israel is **UNCONFIRMED**                                                                                                                   | —                    | —                                                                               | [primary] [tariff]                                               |
| Buying foreign currency from a changer       | $6                                                                                                                                                                                                                                               | flat                 | —                                                                               | [primary] [tariff]                                               |
| Max online loan (no card needed)             | Average מתואמת P + 5.57%; maximum P + 11.75%; 3–99 months (99 only above ₪50k–80k, as stated on different pages); ₪2,000–200,000; 0.5% digital discount (floor 2.5%); up to 2 months' deferral with bridge interest (loans of up to 60 payments) | prime + risk margin  | Spitzer 30/360; bridge interest daily at prime + margin (loan terms §8.5, §8.7) | [primary] [loancalc] [qaloans] [agr]                             |
| Max's loan example                           | ₪20,000, 20 months, prime + 4% = 10% (prime 6% as of June 2024) → מתואמת 10.47%, total ₪21,795.97                                                                                                                                                | —                    | —                                                                               | [primary] [credlimit]; verified: PMT ₪1,089.80 × 20 = ₪21,795.97 |
| הלוואה ברגע (on the card)                    | Up to 60 payments, "ריבית קבועה מתחלפת חודשית"                                                                                                                                                                                                   | prime + margin       | —                                                                               | [primary] [agr]                                                  |
| Mizrahi-issued Max: חודש חופש / הלוואות ברגע | International and Gold 16.25% / 17.52%; Platinum 13.50% / 14.37%; First 10.00% / 10.47%; Multi Gold 16.50% / 17.81%                                                                                                                              | bank-set             | m = 12 (all verified)                                                           | [primary] [mizrahi]                                              |

---

## 8. Fees that affect a budget

- **Card fee, general Max tariff from 1.10.2026** (monthly, "נגבית במלואה מדי חודש בעבור החודש החולף"; pro-rated in the first and last month). **[primary]** [tariff]

  | Card                 | Fee    | Reduced fee at monthly spend of | Waived at monthly spend of |
  | -------------------- | ------ | ------------------------------- | -------------------------- |
  | Classic              | ₪12.90 | ₪7.90 at ₪1,750+                | ₪5,000+                    |
  | International / Gold | ₪17.90 | ₪12.90 at ₪3,000+               | ₪6,000+                    |
  | Gold Business        | ₪19.90 | ₪15.90 at ₪3,000+               | ₪5,000+                    |
  | Platinum             | ₪19.90 | ₪15.90 at ₪3,000+               | ₪6,000+                    |
  | max cash / pre-paid  | ₪19.90 | —                               | —                          |
  - The reductions apply "בכרטיסים המשויכים למסלול פינוקים בלבד".
  - "Spend" excludes cash, fees, interest, credit products and "פירעון שוטף של עסקאות".
  - The same grid appears in the executive, קרנות, ביחד בשבילך, בהצדעה, 1824, WINCARD, Victory, CLALPAY, DREAMCARD and תמורה tariffs. **[primary]** [comm] (all read)

- **Premium and club fees**:
  - SKYMAX ₪19.90 and SKYMAX Premium ₪29.90 a month; no spend-based waiver. **[primary]** [sky]
  - First ₪60. **[primary]** [first]
  - World Elite "270 ש״ח לכרטיס", ₪190 for a second card. The wording says it is collected monthly. That seems high, so whether the figure is monthly or annual is **UNCONFIRMED**. **[primary]** [we]
  - Notice of 15.9.2026: from 1.10.2026 "נוספה לו עמלת דמי כרטיס לכרטיסים מסוג Premium". **[primary]** [ann]
- **Waivers**:
  - MAX Back Total: "פטור מדמי כרטיס לשנה הראשונה"; afterwards the full fee. **[primary]** [mbt]
  - A card unused within 30 days of receipt can be cancelled free. **[primary]** [mbt-t]
- **Paper statement**: "לכרטיסי free max - דיוור שלא באמצעות האינטרנט - 3 ש"ח". No paper-statement fee is listed for other Max cards (**UNCONFIRMED** that none applies). Printing documents ₪11, free online. **[primary]** [tariff]
- **Changing the billing date**: no fee in the tariff. The contract says it "עשוי להיות כרוך בעמלה". **[primary]** [tariff] [agr]
- **Changing the deal type**: there is no fee to split a deal; the cost is interest (and bridge interest). **[primary]** [split]
  - Early or immediate repayment of transactions: ₪40, or ₪20 online. **[primary]** [tariff]
  - Early repayment of a credit or loan: ₪60. It does not apply to max cash or max free; there is no fee within 3 business days for loans and splits. **[primary]** [tariff] [monthly]
- **Other**: replacement card ₪25 (₪15 online), instant issue ₪40; late-payment notice ₪5; lawyer's letter ₪145; returned direct debit ₪1. **[primary]** [tariff]
- **Bank-issued Max cards** pay the **bank's** card fees. Leumi: "דמי כרטיס בהתאם לתעריפון עמלות של לאומי". **[primary]** [leumi-cards] [comm]

---

## 9. Exports

- **Max's own Excel download** (from "פירוט חיובים"):
  - The column names are **UNCONFIRMED**. I could not log in, and found no documented layout.
  - The Bookandry repo's own import tests use headers such as "תאריך עסקה", "שם בית העסק", "סכום עסקה", "מטבע עסקה", "סכום חיוב", "פירוט נוסף", "4 ספרות אחרונות של כרטיס האשראי" and a title row "פירוט עסקאות לכרטיס מקס …". These are test fixtures, not a confirmed Max layout.
- **Max's online data** (the API behind the website: `onlinelcapi.max.co.il/api/registered/transactionDetails/getTransactionsAndGraphs`). **[secondary]** [scraper]
  - Fields per row: `shortCardNumber`, `purchaseDate`, `paymentDate`, `merchantName`, `categoryId`, `originalAmount`, `originalCurrency`, `actualPaymentAmount`, `paymentCurrency` (376/840/978), `planName`, `planTypeId`, `comments`, `dealData.arn`, `fundsTransferComment`.
  - Installments are in `comments`, as "תשלום k מתוך N". The scraper takes the first two numbers.
  - **No field carries an interest rate or a per-row interest amount**; a קרדיט row's charged amount is principal + interest.
  - Plan labels are listed in §4.
  - The home-page data also returns per card `CreditLimit`, `OpenToBuy` and `CycleSummary` (billing dates).
- **Statement**:
  - The periodic statement carries the card's interest rates, "המעודכנים למועד משלוחם" (§7.8(ה)).
  - The number and size of payments of each credit appear "בדף הפירוט התקופתי שישלח סמוך לאחר מועד העמדתו" (§7.3(א)).
  - The statement prevails over the contract if they conflict.
  - **[primary]** [agr]

---

## 10. Changes and dates

- **Document dates**:
  - Max agreement: November 2025.
  - General tariff: in force from 1.10.2026.
  - Club tariffs: 1.11.2025 or 1.10.2026.
  - Mizrahi rates: from 3.9.2026.
  - Hapoalim Max terms: August 2026. Leumi terms: 08.25. FIBI Max terms: 6.22.
  - Annual report: 2025 (published 2026). Max pages seen 2026-10-08.
- **Announced changes**:
  - 1.10.2026 tariff, which adds a Premium card fee (announced 15.9.2026). **[primary]** [ann]
  - Leumi agreement extended to 31.1.2031. **[primary]** [ar25]
  - A government bill would extend the duty to run bank-card issuing through an operating company ("תפעול הנפקה של עד 40% מכרטיסי החיוב החדשים באמצעות חברה מתפעלת (במקום 52%)"). **[primary]** [ar25]
- **How changes are notified**:
  - Contract changes need at least 30 days' written notice, binding only after the notice period. Technical changes need 24 hours. Changes may also be published in two daily newspapers, effective 14 days after publication. Fee changes do not apply to deals made before they take effect. **[primary]** [agr]
  - **Prime changes**: "הודעה של החברה או של בנק ישראל על שינוי ריבית הפריים ... תיחשב כהודעה על שינוי כל אחת מהריביות המשתנות". They apply to existing and new balances of prime-based credit. **[primary]** [agr]
  - **Non-prime rate changes** apply only "לגבי האשראים שהועמדו לאחר ההודעה". **[primary]** [agr]
  - Prime in Max's contract is **Bank Leumi's** prime. **[primary]** [agr]

---

## UNCONFIRMED / gaps

1. **The ₪500 revolving minimum on non-Multi cards.** It is unclear whether it is max(₪500, 2% of limit) or a flat ₪500. The ₪200 / 2%-of-limit rule itself is confirmed verbatim.
2. **The exact reference date for P₁₉ in the קרדיט פלוס re-set**: whether prime is taken as known at the billing date of payment 19 or on another date. Also, whether the re-set payment is re-amortised Spitzer over the remaining N − 18 payments. That is inferred from "סכום החיוב ... כמתחייב משינוי ריבית הקרדיט", not stated.
3. **Whether the payment-19 re-set applies on Leumi-, Hapoalim- and FIBI-issued Max cards.** Their contracts describe fixed קרדיט with no re-set. Discount says its Max cards do re-set.
4. **Max-issued (non-bank) interest rates**: קרדיט, קרדיט פלוס, revolving, 30+, bridge. None is published on max.co.il; only Mizrahi's bank-card rates and the loan average/max are public. Whether 19–36 deals start at the same rate as 3–18 is also unknown.
5. **How interest from capture to the first billing date is billed** on Max-issued קרדיט (inside payment 1, or a separate bridge charge).
6. **The day count for revolving interest.**
7. **The capture cut-off** (days before the billing date). The billing dates each partner bank offers for Max cards.
8. **Whether Platinum cards are still charged monthly for FX.** Whether the 3% fee applies to shekel-priced foreign-merchant charges.
9. **World Elite ₪270**: monthly or annual. No paper-statement fee is listed except on max free.
10. **The Excel export's column names**; the label of a split deal ("קרדיט"?), of קרדיט פלוס, and of "חודשי + ריבית" / "קרדיט-מחוץ למסגרת" / "פריסת העסקה הדחויה".
11. **"max credit"**: no product of that name exists on any Max page read. "MAX Back" is a cashback card family (MAX Back Total, MAXBack, MAXBack CRYPTO), not a credit product. Max's other branded credit products are הלוואה ברגע, חודש חופש / חלוקת החיוב החודשי, Multi, הלוואה אונליין, מימון רכב, מיחזור הלוואה, הלוואה לסגירת המינוס and the secured "מסגרת בטוחה" card. "כסף בצד" appears only as an exclusion; what it is is unknown.
12. **Leumi's, Discount's, Hapoalim's and FIBI's own published rates for their Max cards** were not read; only Mizrahi's were.

---

## Sources (all seen 2026-10-08)

- [agr]: Max cardholder agreement "תנאי בקשת הצטרפות", גרסת נובמבר 2025: https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf
- [tariff]: Max general fee schedule from 1.10.2026: https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_general.pdf
- [comm]: Max agreements and fee schedules index: https://www.max.co.il/cards/pages/commissions
- [mbt-t]: MAX Back Total disclosure and tariff (1.11.2025): https://www.max.co.il/api/umbraco/getImage?imageName=taarifon-maxback-total-new.pdf
- [sky]: SKYMAX tariff (1.10.2026): https://www.max.co.il/api/umbraco/getImage?imageName=taarifon-skymax.pdf
- [first]: First tariff (1.11.2025): https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_first.pdf
- [we]: World Elite tariff (1.11.2025): https://www.max.co.il/api/umbraco/getImage?imageName=taarifon-world-elite.pdf
- [cpi]: Index-linked credit appendix (2023): https://www.max.co.il/api/umbraco/getImage?imageName=credit-zmood-madad.pdf
- [fixcharge]: Max שירות אשראי מתגלגל: https://www.max.co.il/loans/fixcharge
- [split]: Max חלוקת עסקה לתשלומים: https://www.max.co.il/loans/transaction-split
- [monthly]: Max חלוקת החיוב החודשי: https://www.max.co.il/loans/monthly-payments
- [abroad]: Max שימוש במט"ח: https://www.max.co.il/cards/pages/abroad-commissions
- [mbt]: MAX Back Total page: https://www.max.co.il/cards/max-back-total
- [loancalc]: Max online loan: https://www.max.co.il/loans/calc
- [qaloans]: Max loans Q&A (01.09.2026): https://www.max.co.il/loans/magazine/qa-loans
- [credlimit]: Max loans article (with the loan example): https://www.max.co.il/cards/magazine/credit-limit
- [about]: About Max: https://www.max.co.il/general/pages/about-max
- [ann]: Max important announcements: https://www.max.co.il/general/pages/important-announcements
- [contact]: Max contact / service lines: https://www.max.co.il/contactus
- [qa-poalim]: End of Max benefits on Hapoalim cards: https://www.max.co.il/cards/pages/qa-hapoalim
- [ar25]: Max annual report 2025: https://www.max.co.il/api/umbraco/getImage?imageName=100332524.pdf
- [q2]: Max Q2 2026 report: https://www.max.co.il/api/umbraco/getImage?imageName=100332622.pdf
- [mizrahi]: Mizrahi-Tefahot, שיעורי ריבית באשראי (from 3.9.2026): https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/
- [discount]: Discount, תוכניות אשראי – קרדיט: https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/
- [poalim]: Bank Hapoalim, general terms for Max cards (August 2026): https://www.bankhapoalim.co.il/sites/default/files/media/tn-max.pdf
- [fibi]: FIBI / Max, תנאים כלליים לקבלת כרטיס חיוב max (6.22): https://www.fibi.co.il/media/uhwf2anu/תנאים-כלליים-לקבלת-כרטיס-חיוב-max.pdf
- [leumi]: Bank Leumi, תנאי הצטרפות לכרטיס חיוב (319-56, 08.25): https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/hozim%20ahidim/319-56_ACC.pdf
- [leumi-cards]: Bank Leumi credit cards page: https://www.leumi.co.il/he/credit-cards
- [scraper]: israeli-bank-scrapers `max.ts` (secondary; last commit 2026-07-16): https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/max.ts
- Background: `docs/research/2026-10-08-israeli-credit-card-interest.md` (prime, Fair Credit caps, the 2018 Leumi Card leaflet)
