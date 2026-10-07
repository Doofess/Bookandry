# Israeli credit cards and their interest: research for Bookandry

Date: 2026-10-08. Prime is quoted as of this date.

Scope: how charges and interest work on Israeli credit cards, so we can design how Bookandry shows a card's interest rates (ריבית שנתית, ריבית שנתית מתואמת, קרדיט פלוס) and understands the rows in issuers' exports.

**How to read this.** Every claim has its source next to it. **[primary]** marks the issuer's or bank's own page, a contract, a regulator document, or the text of a law. **[secondary]** marks press, open-source code or a consumer site. **UNCONFIRMED** marks anything that no primary source here establishes. Hebrew is quoted as the source writes it.

Most issuer pages block plain HTTP fetches (Cal, Isracard, Max, the Bank of Israel HTML pages). I read them in a real browser. The PDFs (contracts, Bank of Israel directives) were downloaded and read in full where relevant.

---

## 0. The headline answers

1. **ריבית שנתית and ריבית שנתית מתואמת are not two different charges.** They are two ways of writing the same rate. The nominal annual rate (_ריבית תעריפית שנתית_, often just "ריבית שנתית") is converted into the effective rate (_ריבית מתואמת שנתית_) by the formula in the Banking Rules, R = (1 + i/m)^m − 1. Every card-credit pair published by Mizrahi-Tefahot and quoted in the press matches **m = 12, monthly compounding**, to the hundredth of a percent. **Fees are not included** in the מתואמת rate. The figure that does include fees is a different one, the Fair Credit Law's _שיעור העלות הממשית של האשראי_.
2. **קרדיט פלוס is not revolving credit.** It is the name used by Max (formerly Leumi Card), and by Discount Bank when describing Cal- and Max-issued cards, for a **long קרדיט deal of 19–36 interest-bearing installments**. At Max its rate is fixed for the first 18 payments and then **re-priced from payment 19 by the change in prime**. Revolving credit is a separate product, called אשראי מתגלגל / "שירות אשראי מתגלגל" / "חיוב חודשי קבוע" / "החזר חודשי קבוע" / "סל מצטבר" / ישראקרדיט.
3. **Prime today is 4.75%**: the Bank of Israel rate of 3.25% plus 1.5%. It has applied since 3.9.2026, after the decision of 1.9.2026. The next decision is on 21.10.2026.

---

## 1. Transaction types on an Israeli card

### 1.1 The basic model: a deferred-debit card, billed once a month

- Most Israeli credit cards are **deferred-debit** cards. All purchases since the last billing date are charged together on one monthly date (_מועד חיוב_). The credit from purchase to billing date is free to the cardholder.
  - Bank of Israel: in the common cards "הלקוח מחויב מדי חודש במלוא סכום החיובים בגין העסקאות שביצע ... אומנם כרטיסים אלה כוללים מרכיב של מתן אשראי ממועד ביצוע העסקה בבית העסק ועד למועד החיוב החודשי, ואולם אשראי זה אינו מחויב בריבית". The footnote adds: "כרטיסים אלה מכונים גם 'כרטיסי אשראי עם חיוב נדחה' (deferred debit)". **[primary]** [BOI press release on revolving credit, 28.4.2025, pp. 1–2](https://www.boi.org.il/media/q43bv55w/202510.pdf)
  - Cal's glossary, under _חיוב דחוי_: "חיוב התשלום במועד חודשי קבוע לפי בחירתו של הצרכן. האשראי מיום העסקה ועד למועד החיוב החודשי ממומן מהעמלה שמשלם הסוחר לחברת כרטיסי האשראי". **[primary]** [Cal – חיוב דחוי](https://www.cal-online.co.il/ecredit/financial-terms/postponed-debit/)
- **Billing date.** Isracard lets the customer choose the 2nd, 10th, 15th or 20th of the month for domestic purchases: "לקוח יכול לבחור את מועד החיוב עבור רכישות בארץ מתוך ארבע אפשרויות: 2,10,15,20 לחודש". **[primary]** [Isracard iSchool – אפשרויות תשלום](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
  - Cal's contract: Cal sets "יום מסוים בחודש שבו יחויב הלקוח בגין שוברים שהוצגו לכאל לפני כן", chosen by the customer from the dates Cal offers (§7.1). **[primary]** [Cal issuing agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
  - A changed billing date takes effect from the next billing date, at no fee (Isracard iSchool, above).
- **The billing cycle.** A purchase is charged on the first billing date after it **reaches the issuer's systems** (it is "נקלט"), not after the date of purchase. **UNCONFIRMED**: none of the sources gives the cutoff for an ordinary card (how many days before the billing date a purchase must be captured). Cal does define a precise "activity period" for its CalChoice revolving card: for a billing date on the 2nd, purchases from the 15th of one month to the 14th of the next; for the 10th, from the 23rd to the 22nd (agreement §28.2(ח)). **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf). Treat the issuer's own billing date in the export as the truth.

### 1.2 רגילה (תשלום אחד): a regular purchase

- "כרטיס הלקוח מחויב בכל סכום הרכישה במועד החיוב הקרוב". **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
- Max's data labels this plan **"רגילה"**. **[secondary]** [israeli-bank-scrapers, max.ts](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/max.ts)

### 1.3 תשלומים: installments, interest-free to the cardholder

- A **merchant-side** arrangement. The card is charged each month for its share, the merchant is credited monthly, and **the merchant sets the maximum number of payments**. "כרטיס הלקוח מחויב במועד החיוב החודשי בחלק היחסי של הרכישה ... בית העסק מזוכה בסכום זהה לחיוב ... מדי חודש ... התשלום הראשון של העסקה יכול להיות שונה מיתר התשלומים (במקרים בהם הסכום אינו עגול ...) ... את מספר התשלומים המקסימלי קובע בית העסק ע"פ ההסכם שלו מול חברת האשראי". **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
- The first payment is charged on the billing date right after the purchase. Cal's agreement: "בתשלומים חודשיים שווים ורצופים ... החל ממועד החיוב החודשי שיחול סמוך לאחר מועד ביצוע העסקה בתשלומים". **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
- Variants:
  - **צמודי מדד**: each payment is linked to the CPI, except the first.
  - **צמודי דולר**: linked to the dollar rate (Isracard iSchool, above).
- The Bank of Israel describes a תשלומים deal as "עסקת תשלומים המהווה אשראי ללא ריבית". **[primary]** [BOI 28.4.2025, footnote 2](https://www.boi.org.il/media/q43bv55w/202510.pdf)

### 1.4 קרדיט: installments with interest, financed by the issuer

**What it is**

- The **issuer** pays the merchant in full, usually at once, and collects from the cardholder in installments **with interest**. The deal starts with a one-month deferral.
  - Isracard: "עסקה נושאת ריבית ... |1| ריבית |2| דחייה בחודש |3| בית העסק מקבל את הזיכוי ... בבת אחת ובדר"כ באופן מיידי".
  - Isracard's fixed track: "קרדיט תשלומים קבועים – הלקוח בוחר במעמד העסקה את מס' התשלומים הרצוי בין 3-18 ... הריבית הינה קבועה". **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
  - Cal's agreement §27.10: "הסדר 'קרדיט' הינו עסקת אשראי, במסגרתה משלמת כאל לבית העסק ... את תמורת העסקה הרלבנטית במלואה, אך פורסת את הגביה מאת הלקוח לשיעורין, כנגד תשלום ריבית". **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
- The Bank of Israel calls it "עסקת קרדיט (המהווה הלוואה נושאת ריבית לתקופה מוגדרת)". **[primary]** [BOI 28.4.2025](https://www.boi.org.il/media/q43bv55w/202510.pdf)

**Ranges and minimums**

- **3–18 payments** for ordinary קרדיט. Minimum deal ₪75, minimum payment ₪25 (before interest). **[primary]** [Discount – תוכנית קרדיט](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/); [Amex – הסבר על שיטת הקרדיט](https://he.americanexpress.co.il/globalassets/PDF/credit-explan.pdf)
- **19–36 payments** is "קרדיט פלוס" at Max and Discount (see §4). Isracard also allows more than 19 payments, with a minimum of ₪50 principal per payment (agreement §19.2.2.3.2). **[primary]** [Isracard charge-card agreement](https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx)

**Who sets the rate, and when it is fixed**

- **The issuer sets it, or for a bank-issued card the bank that provides the credit.** It is set per card type or club as prime + a margin, and fixed when the issuer receives the deal.
  - Isracard §19.2.3.1: "הסדר קרדיט בתשלומים יישא ריבית קבועה, ששיעורה ייקבע על פי שיעור הפריים ... בצירוף תוספת הסיכון להסדר קרדיט בתשלומים כפי שיהיו נהוג ביום קליטת שובר העסקה אצל המנפיקה ... שינויים בשיעור ריבית על הסדר קרדיט ... לא יחולו על אשראי שכבר הועמד". **[primary]** [Isracard agreement](https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx)
  - Cal §27.10(ב): "יישאו ריבית בשיעור שייקבע מפעם לפעם על ידי כאל ... שיעור ריבית הקרדיט יכול להשתנות בהתאם לשינויים בשיעור הריבית הבסיסית ... במקרה של שינוי הריבית הבסיסית השינוי יחול אך ורק על אשראי שטרם נלקח". **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
  - Amex (Isracard group), bank-provided credit: "שעור הריבית ... יקבע לכל עסקה ועסקה על פי שעור הריבית שיהיה נהוג לאשראי זה, בבנק מעמיד מסגרת האשראי, ביום קליטת העסקה". **[primary]** [Amex PDF](https://he.americanexpress.co.il/globalassets/PDF/credit-explan.pdf)
  - Leumi Card leaflet (08.18): "שיעורי הריבית משתנים בהתאם להחלטת בנק לאומי ו/או ... לאומי קארד לפי העניין, ובהתאם לסוגי הכרטיס". **[primary, dated 2018]** [Leumi Card – מידע חיוני ללקוחות](https://onlinelcapi.max.co.il/SharedMedia/12738/%D7%9E%D7%99%D7%93%D7%A2-%D7%97%D7%99%D7%95%D7%A0%D7%99-%D7%9C%D7%9C%D7%A7%D7%95%D7%97%D7%95%D7%AA.pdf)
- **The rate is per card product, not per merchant.** Mizrahi's disclosure lists different קרדיט rates per Isracard / Cal / Max card type (see §5.5). **[primary]** [Mizrahi – שיעורי ריבית באשראי](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)

**How the payments run**

- Equal Spitzer payments. The first payment falls on the **second** billing date after the purchase. The first month the deal shows on the statement **for information only**.
  - Cal §27.10(ג): "ייפרע בתשלומים חודשיים שווים ורצופים של קרן וריבית לפי לוח 'שפיצר' ... החל ממועד החיוב הראשון, שיבוצע לאחר מועד החיוב הסמוך לאחר מועד ביצוע העסקה". **[primary]**
  - Amex: "התשלום הראשון לא יחוייב במועד החיוב הקרוב ... אלא רק במועד החיוב השני ... במועד החיוב הראשון תרשם העסקה בהודעת החיוב החודשית לידיעה בלבד". **[primary]**
  - Discount: "*במועד החיוב הראשון העסקה תופיע לידיעה בדף הפירוט החודשי. *הריבית מחושבת על פי לוח סילוקין שפיצר". **[primary]**
- Section 6 has the math.

### 1.5 עסקאות חו"ל: foreign-currency transactions

- **When it is charged:**
  - **Isracard**: at capture, usually 2–3 business days after the purchase, regardless of the domestic billing date. The exception is listed premium cards (Platinum, World Elite, Amex Gold/Platinum, Centurion…), which are charged monthly. **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
  - **Leumi Card / Max (2018)**: "עסקאות ומשיכות במט"ח מחויבות בסמוך למועד קליטת החיובים ... למעט בכרטיסי ויזה פלטינה ומסטרקארד". Customers could defer foreign charges to the billing date with _ריבית גישור משתנה_ ("דחיית חיובי חו"ל למועד החיוב"). **[primary, 2018]** [Leumi Card leaflet](https://onlinelcapi.max.co.il/SharedMedia/12738/%D7%9E%D7%99%D7%93%D7%A2-%D7%97%D7%99%D7%95%D7%A0%D7%99-%D7%9C%D7%9C%D7%A7%D7%95%D7%97%D7%95%D7%AA.pdf)
  - **Max's current contract** §7.3(ז) "דחיית חיובים למועד החיוב החודשי": a prime-based variable-rate credit. Immediate charges, including foreign charges and cash withdrawals, are deferred to the monthly billing date with interest "שתחושב בגין מספר הימים שחלף ממועד החיוב המקורי ועד למועד החיוב החודשי". **[primary]** [Max cardholder agreement](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf)
- **How the amount is converted:** to shekels at the representative rate when the deal is processed. **Max charges a 3% fee** on foreign-currency transactions ("3% עסקאות במט"ח"). **[primary]** [Max general pricing list, from 1.10.26](https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_general.pdf)
- **Foreign purchases on credit:**
  - Cal's **"קרדיט חו"ל"** spreads all foreign purchases into 2–18 interest-bearing payments. The first payment is on the second billing date. "עד למועד החיוב הראשון תחול ריבית גישור". **[primary]** [Cal – קרדיט חו"ל](https://www.cal-online.co.il/ecredit/credit-abroad/)
  - Max's קרדיט פלוס "אינה רלוונטית לרכישות שמתבצעות בחו"ל". **[primary]** [Discount](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)

### 1.6 דחוי / חיוב נדחה / 30+: deferred charges

Three different things carry this name.

1. **The card itself is "חיוב נדחה"**: the deferred-debit model in §1.1.
2. **A one-month deferral with interest, chosen by the cardholder** (issuer credit):
   - Cal's "**30+**" (פלוס 30): "דחיית חיוב העסקה למועד החיוב של החודש העוקב. הדחיה נושאת ריבית" **[primary]** ([Discount](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)). In Cal's contract (§27.9) the 30+ rate is the base rate ± a margin. Interest is charged quarterly, in January, April, July and October. **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
   - Max/Leumi Card's "**עסקת 30 פלוס**": a deal deferred one month at a variable rate, "עסקה נדחית בחודש ... ריבית 30+ משתנה". **[primary, 2018]** [Leumi Card leaflet](https://onlinelcapi.max.co.il/SharedMedia/12738/%D7%9E%D7%99%D7%93%D7%A2-%D7%97%D7%99%D7%95%D7%A0%D7%99-%D7%9C%D7%9C%D7%A7%D7%95%D7%97%D7%95%D7%AA.pdf); Max contract §7.3(ו) "אשראי 30 פלוס ... בריבית משתנה על בסיס פריים". **[primary]** [Max agreement](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf)
3. **A merchant-side deferral**, interest-free to the cardholder. Max's data carries plan names such as "דחוי חודש", "דחוי חודשיים", "דחוי לחיוב החודשי", "דחוי חודש תשלומים" and "פריסת העסקה הדחויה". **[secondary]** [israeli-bank-scrapers, max.ts](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/max.ts). **UNCONFIRMED** by an issuer's own page: that these are interest-free merchant deferrals. The scraper treats them as ordinary charges, and the "פלוס 30" interest-bearing plan has its own separate name.

### 1.7 Bank-issued vs non-bank cards

- **Bank card** (כרטיס בנקאי): "כרטיס אשראי המונפק על ידי תאגיד בנקאי שבו יש ללקוח חשבון. כיסוי החוב ... נעשים על בסיס היתרה בחשבון". **[primary]** [Cal – כרטיס אשראי בנקאי](https://www.cal-online.co.il/ecredit/financial-terms/bank-credit-card/)
  - **The bank sets the card's credit limit.** Isracard: "המסגרת נקבעת על ידי הגורם המנפיק (סניף הבנק בכרטיסים הבנקאיים וישראכרט בכרטיסים חוץ בנקאיים)". **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
  - **The bank's own rate applies to credit on the card** (Amex PDF and Leumi Card leaflet, above). This is why banks publish card-credit rates; Mizrahi does (§5.5).
- **Non-bank card** (חוץ בנקאי): issued directly by the card company, with its own credit limit that does not depend on the bank. These cards carry the issuer's own credit products: revolving credit, card loans and spreading the monthly bill. **[primary]** [Cal – כרטיס אשראי חוץ בנקאי](https://www.cal-online.co.il/ecredit/financial-terms/off-bank-credit-card/)
  - Isracard's revolving product is "למחזיקי כרטיס חוץ בנקאי בלבד". **[primary]** [Isracard – אשראי מתגלגל](https://www.isracard.co.il/credit-solutions/fixed-monthly-payment/private)
  - Its older "חיוב חודשי קבוע" was available to non-bank Isracard customers and to bank cards at Mizrahi and the FIBI group. **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html); [FIBI notice](https://www.fibi.co.il/media/wf3abwvm/%D7%94%D7%95%D7%93%D7%A2%D7%95%D7%AA-%D7%A9%D7%95%D7%98%D7%A4%D7%95%D7%AA-31.pdf)
- **Cash withdrawals** on a non-bank Isracard card debit the bank account within about 2 business days ("עד חיוב המשיכה מהחשבון המתבצעת עד 2 ימי עסקים"). **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)

---

## 2. ריבית שנתית (nominal) vs ריבית שנתית מתואמת (effective)

### 2.1 Definitions: the Banking Rules (Disclosure)

The source is _כללי הבנקאות (שירות ללקוח) (גילוי נאות ומסירת מסמכים), התשנ"ב-1992_. **[primary]** [BOI consolidated text (PDF)](https://www.boi.org.il/media/rvzi1ngd/151.pdf); [Wikisource text with the formulas](<https://he.wikisource.org/wiki/%D7%9B%D7%9C%D7%9C%D7%99_%D7%94%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_(%D7%A9%D7%99%D7%A8%D7%95%D7%AA_%D7%9C%D7%9C%D7%A7%D7%95%D7%97)_(%D7%92%D7%99%D7%9C%D7%95%D7%99_%D7%A0%D7%90%D7%95%D7%AA_%D7%95%D7%9E%D7%A1%D7%99%D7%A8%D7%AA_%D7%9E%D7%A1%D7%9E%D7%9B%D7%99%D7%9D)>)

- **§1, the definition of "ריבית מתואמת שנתית"**: "שיעור ריבית המתקבל על ידי ייחוס שיעור ריבית לתקופה של שנה, המבוסס על חישוב של 365 ימים בשנה, בהתחשב במרכיב של ריבית דריבית אם תשלום הריבית נעשה תקופתית, והמחושב בדרך המובאת בתוספת א'".
- **§2(א)**: "ריבית תעריפית" means a rate for a period of one year. This is the nominal annual rate that issuers call _תעריפית_ or simply _ריבית שנתית_.
- **§2(ב)**: "בכל מקום שבו נאמר בכללים אלה כי יש לפרט, לגבי אשראים במטבע ישראלי שאינם צמודים ... את שיעור הריבית, יצויין גם שיעור הריבית המתואמת השנתית; הוראה זו לא תחול אם לא נקבע מראש מועד לתשלום הריבית".
- **§1** also defines "ריבית בסיסית" as "שיעור ריבית בסיסית (Prime Rate) ...". It defines "ריבית חריגה" as "התוספת לריבית, הנגבית על יתרות החורגות ממסגרת האשראי".
- **§33ב (advertising)**: a banking corporation advertising credit must include "שיעור הריבית השנתית המתואמת הממוצעת".

### 2.2 The formula (Appendix A, תוספת א')

With _i_ the nominal annual rate (תעריפית), _m_ the number of interest computations per year ("כאשר חישוב הריבית הוא יומי m = 365, כאשר הוא חודשי m = 12"), and _R_ the effective (מתואמת) annual rate:

- General case: **R = (1 + i/m)^m − 1**
- Daily interest: R = (1 + i/365)^365 − 1
- Quarterly interest: R = (1 + i/4)^4 − 1
- Given a periodic rate _r_ over _n_ days: R = (1 + r)^(365/n) − 1, where r = (1 + i/m)^(m·n/365) − 1

**[primary]** (same sources as §2.1)

### 2.3 Card credit uses monthly compounding (m = 12)

I checked every published pair of nominal and מתואמת rates against the three conventions. Monthly compounding reproduces **all** card-credit pairs exactly. Quarterly compounding reproduces exactly the products whose interest is capitalised quarterly.

| Product (source)                                                | Nominal | Published מתואמת | m=12      | m=4       | m=365 |
| --------------------------------------------------------------- | ------- | ---------------- | --------- | --------- | ----- |
| Isracard ישראקרדיט / Amex קרדיט, regular card (Mizrahi)         | 14.15%  | 15.10%           | **15.10** | 14.92     | 15.20 |
| Isracard קרדיט בתשלומים קבועים (Mizrahi)                        | 15.25%  | 16.36%           | **16.36** | 16.14     | 16.47 |
| Isracard אשראי מהיר (Mizrahi)                                   | 16.25%  | 17.52%           | **17.52** | 17.27     | 17.64 |
| Cal ויזה עדיף / דיינרס לארג', Basic (Mizrahi)                   | 14.35%  | 15.33%           | **15.33** | 15.14     | 15.43 |
| Max International, אשראי מתגלגל (Mizrahi)                       | 14.50%  | 15.50%           | **15.50** | 15.31     | 15.60 |
| Max International, קרדיט בתשלומים קבועים (Mizrahi)              | 15.50%  | 16.65%           | **16.65** | 16.42     | 16.76 |
| Max First, קרדיט בתשלומים קבועים (Mizrahi)                      | 8.25%   | 8.57%            | **8.57**  | 8.51      | 8.60  |
| Mizrahi overdraft (חח"ד), first tier max (Mizrahi)              | 11.45%  | 11.95%           | 12.07     | **11.95** | 12.13 |
| Isracard ריבית פיגורים (Isracard; "תצורף לקרן החוב אחת לרבעון") | 20.90%  | 22.60%           | 23.02     | **22.60** | 23.24 |

Sources: [Mizrahi – שיעורי ריבית באשראי (effective 3.9.2026)](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/) **[primary]**; [Isracard – ריבית פיגורים](https://digital.isracard.co.il/pages/Credit/) **[primary]**. The same 14.15/15.10, 14.35/15.33 and 14.50/15.50 pairs appear in [Bizportal, 8.9.2026](https://www.bizportal.co.il/guides/news/article/20041605) **[secondary]**.

So:

- **For card credit, מתואמת = (1 + nominal/12)^12 − 1.** Use this.
- The formula is general, though. An issuer that capitalises interest quarterly (overdraft, late interest) publishes with m = 4. Store the convention per rate, or store both numbers as the issuer prints them.
- **One unexplained detail (UNCONFIRMED).** Isracard's revolving ישראקרדיט accrues interest daily and _charges it quarterly_ (agreement §19.1.4.3). Yet the מתואמת published for it uses m = 12, not m = 4 or 365. I found no source explaining why. The convention appears to be "monthly for all card products".

Max explains the concept the same way: "ריבית מתואמת, הידועה גם כריבית אפקטיבית, היא הריבית שהלווים משלמים בפועל ... ריבית דריבית ... 6% ... בתשלומים חודשיים ... 0.5% [לחודש]". **[primary]** [Max – מילון: ריבית](https://www.max.co.il/loans/dictionary/interest)

### 2.4 Are fees included in the מתואמת rate?

**No.** The Banking Rules definition is purely the compounding of a nominal rate. Appendix A has no fee term (§2.1–2.2). The published card pairs match pure compounding exactly (§2.3).

The one place the Banking Rules fold fees into an effective rate is leasing: _תוספת ג'_ (CF0 = "תשלומי עמלה וחיובים אחרים בעת כריתת החוזה"). It does not apply to cards. **[primary]** [BOI text](https://www.boi.org.il/media/rvzi1ngd/151.pdf)

The **all-in figure** is a separate concept from the Fair Credit Law (_חוק אשראי הוגן, התשנ"ג-1993_): **"שיעור העלות הממשית של האשראי – היחס שבין סך כל התוספות לבין הסכום שקיבל הלווה בפועל, בחישוב שנתי"**. A "תוספת" is "כל סכום שנדרש לווה לשלם בקשר לחוזה ההלוואה מעבר לסכום שקיבל בפועל", excluding late interest, collection costs and certain prescribed setup costs. **[primary]** [חוק אשראי הוגן (Wikisource)](https://he.wikisource.org/wiki/%D7%97%D7%95%D7%A7_%D7%90%D7%A9%D7%A8%D7%90%D7%99_%D7%94%D7%95%D7%92%D7%9F)

The same law caps that cost (Schedule 1): "ריבית בנק ישראל בתוספת 15 נקודות האחוז", which today is 3.25% + 15 = **18.25%**. It caps late interest at the cost cap × 1.2 (Schedule 2), which today is **21.9%**. The cap applies to "מלווה מוסדי", which includes banking corporations. Card issuers' contracts tie their rates to this cap, for example Cal's §1 definition of "ריבית" and Max's §7.1. **[primary]**

### 2.5 Where the מתואמת rate must appear

- **Required by the Banking Rules (Disclosure) §2(ב)**, wherever those rules require a shekel non-linked rate to be disclosed. §33ב covers advertising. **[primary]** (above)
- **The monthly statement and the issuing letter.** Discount: "שיעורי הריבית בתוכנית קרדיט ו-30+ מפורטים במכתב שנשלח בסמוך להנפקת הכרטיס ובדף הפירוט החודשי". **[primary]** [Discount](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)
  - Leumi Card: "בדף הפירוט מופיעה טבלת ריביות בעבור סוגי העסקות, מסלולי האשראי וההלוואות השונים". **[primary, 2018]** [leaflet](https://onlinelcapi.max.co.il/SharedMedia/12738/%D7%9E%D7%99%D7%93%D7%A2-%D7%97%D7%99%D7%95%D7%A0%D7%99-%D7%9C%D7%9C%D7%A7%D7%95%D7%97%D7%95%D7%AA.pdf)
  - Cal: "שיעור הריבית מופיע גם בדף הפירוט החודשי שלך". **[primary]** [Cal – פריסה לתשלומים](https://www.cal-online.co.il/ecredit/debit-spread/)
- **Online channels.** Bank of Israel directive 470 (_ניהול בנקאי תקין 470 – כרטיסי חיוב_, 01/20), §12(1)(ט), requires the issuer's website and app to show "מסגרת האשראי בפועל והמנוצלת ושיעור הריבית הנומינלי הנגבה בגין ניצול מסגרת זו". This is the **nominal** rate. **[primary]** [BOI directive 470](https://www.boi.org.il/media/wo2n3irs/470.pdf)
- **Revolving credit offers.** The supervisor requires the **annual** rate to be stated during the sales call, before consent: "אין די בהצגת דוגמה מספרית, כגון 'על כל דחייה של 1,000 ₪ תשלום ריבית של 12 ₪ לחודש', אלא יש לנקוב בשיעור הריבית השנתית". **[primary]** [BOI 28.4.2025, §16.4](https://www.boi.org.il/media/q43bv55w/202510.pdf)
- **Loan contracts.** The Fair Credit Law §3(ב)(8) requires the contract to state the _שיעור העלות הממשית של האשראי_. **[primary]** (above)
- **The transaction slip (שובר).** **UNCONFIRMED**: none of the sources shows a rate printed on the slip at a קרדיט purchase. The sources say only that the slip is marked "קרדיט" with the number of payments (Isracard §19.2.1.1; Cal §27.4). The rate comes from the card's letter and statement.

### 2.6 Worked example of nominal → מתואמת

Take a nominal קרדיט rate of 15.25%, Isracard's קרדיט בתשלומים קבועים today.

- Monthly rate: 15.25% / 12 = 1.270833…%
- מתואמת: (1.01270833)^12 − 1 = 16.362% → **16.36%**, matching Mizrahi's published figure.
- Prime + 4% today: 4.75% + 4% = 8.75% nominal. Monthly that is 0.729167%; (1.00729167)^12 − 1 = **9.11%** מתואמת.

---

## 3. Prime-based pricing

### 3.1 What prime is, and its value today

- **Prime = Bank of Israel rate + 1.5 points.**
  - Cal's contract §27.1: "'הריבית הבסיסית' – הריבית הידועה כ'ריבית בנק ישראל' ... בתוספת אחד וחצי אחוז (1.5%), ואשר ידועה גם כריבית פריים". **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
  - Max: "החלק הקבוע בריבית עומד על 1.5% - ועליו מוסיפים את שיעור הריבית שקבע בנק ישראל". **[primary]** [Max – ריבית](https://www.max.co.il/loans/dictionary/interest)
- **The Bank of Israel rate is 3.25%**, decided on 1.9.2026: "הוועדה המוניטרית החליטה ב-01/09/2026 להוריד את הריבית ב-0.25% לרמה של 3.25%". The next decision "תתפרסם ביום רביעי, ה-21.10.2026". **[primary]** [BOI rate announcement 1.9.2026](https://www.boi.org.il/media/vuubo40c/%D7%94%D7%95%D7%93%D7%A2%D7%AA-%D7%A8%D7%99%D7%91%D7%99%D7%AA-01092026.pdf)
- **Prime is 4.75%, from 3.9.2026.** Cal: "החל מיום 03/09/2026 תחול ירידה של 0.25% בריבית הפריים. שיעור ריבית הפריים השנתי החדש יעמוד על 4.75%". **[primary]** [Cal – הודעות על שינויים](https://www.cal-online.co.il/about/legal-reports/changes/). Mizrahi lists "ריבית בסיסית 4.75%" effective 3.9.2026. **[primary]** [Mizrahi](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)
- **Recent prime history**, from Cal's notices: 5.75% from 27.11.2025; 5.50% from 8.1.2026; 5.25% from 28.5.2026; 5.00% from 9.7.2026; 4.75% from 3.9.2026. **[primary]** [Cal – הודעות על שינויים](https://www.cal-online.co.il/about/legal-reports/changes/)
  - **Prime changes take effect about two days after the decision date.**
  - Bank of Israel's own HTML pages blocked automated reading (Radware). The PDF announcement above was readable.

### 3.2 How card rates are quoted

- **As prime + a risk margin (_תוספת סיכון_).** Isracard ישראקרדיט: "ריבית משתנה המורכבת מריבית בשיעור 'פריים' בצירוף תוספת הסיכון להסדר קרדיט" (§19.1.4.1). Cal's revolving and CalChoice rate: "ריבית בסיסית + מרווח" (§27.12(ד), §28.2(ז)). **[primary]**
- **Margins are rarely published.** Issuers publish the resulting rates, nominal and מתואמת, per product.
  - Today's typical **non-premium** card credit sits around **prime + 9.4 to + 11.5**: revolving 14.15–14.50%, fixed-installment קרדיט 15.25–15.50%, quick credit and loans 16.25%.
  - **Premium and club cards** are much lower: World Elite 7.75%, Max First 8.00–10.00%, the security-forces club 5.75%. **[primary]** [Mizrahi](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)
  - A "prime − margin" card rate: **not seen** in any source for card credit. The Banking Rules and Max allow for "פריים מינוס" in general (Max mentions large mortgages).

### 3.3 What happens when prime changes

Cal's notice states the rule precisely, and it repeats with every prime change: "ישתנו בשיעור דומה שיעורי הריביות בתכניות ומסלולי האשראי המבוססים על ריבית הפריים (30+, עדיף, תשלום עדיף, שירות אשראי מתגלגל, וכרטיס Calchoice) ... **בהתייחס לאשראי הניטל במסגרת תכניות האשראי קרדיט ו-לארג', יחול השינוי אך ורק בהתייחס לעסקות שיבוצעו החל ממועד השינוי**". **[primary]** [Cal – הודעות על שינויים](https://www.cal-online.co.il/about/legal-reports/changes/)

| Kind of credit                                                                             | Effect of a prime change                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Revolving / open-ended**: אשראי מתגלגל, CalChoice, ישראקרדיט, 30+, עדיף, bridge interest | **The rate moves immediately by the same points.** Cal: a change between billing dates applies from the next billing date (§27.12(ד)). Isracard: "הריבית תשתנה בכל עת שיחול שינוי בפריים". **[primary]**                                   |
| **Fixed קרדיט, 3–18 payments** (all issuers)                                               | **Existing deals are not affected.** The new rate applies only to deals made after the change (Cal notice; Isracard §19.2.3.1; Max: "עד 18 תשלומים – שיעור ריבית הפריסה הינו שיעור קבוע"). **[primary]**                                   |
| **Max קרדיט פלוס, 19–36 payments**                                                         | **Fixed for payments 1–18, then shifted at payment 19 by the change in prime since the deal**, then fixed to the end. See §4. **[primary]**                                                                                                |
| **Cal-issued 19–36 ("קרדיט פלוס" per Discount)**                                           | Fixed for the deal's whole life ("אינה משתנה לאורך חיי העסקה"). **[primary]** [Discount](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)                                                   |
| **Card loans**                                                                             | Depends on the loan. Max's "הלוואה ברגע" is "ריבית קבועה מתחלפת חודשית". Isracard's "אשראי מהיר" is fixed at the request date. Cal's loans: "במקרים של ריבית משתנה, גובה הריבית עשויה להשתנות בהתאם לשינויים בריבית הפריים". **[primary]** |
| **Late interest**                                                                          | Isracard: Bank of Israel rate + 16.40%, "ריבית הפיגורים תשתנה בכל עת שיחול שינוי בריבית בנק ישראל". **[primary]**                                                                                                                          |

- **Margins can also change**, though not mid-term on existing fixed deals. Cal's revolving margin may change "בתום רבעון קלנדרי ו/או תוקף המסגרת". Isracard's risk margin can change at each renewal of the credit limit, and not for credit already extended. **[primary]**
- **A Bank of Israel requirement for revolving credit**: no teaser rates. "שיעור הריבית צריך להיות קבוע במהלך תקופת השירות (למעט שינויים בריבית הפריים)". **[primary]** [BOI 28.4.2025, §16.6](https://www.boi.org.il/media/q43bv55w/202510.pdf)

---

## 4. קרדיט פלוס

### 4.1 What it is

**קרדיט פלוס is a long קרדיט deal of 19 to 36 installments. It is not a revolving line.**

- **Discount Bank**, describing cards it distributes:
  - Cal- and Diners-issued: "תוכנית קרדיט פלוס – מאפשרת לחלק את סכום הרכישה ל-19 עד 36 תשלומים נושאי ריבית. הריבית הינה ריבית קבועה (אינה משתנה לאורך חיי העסקה), סכום המינימום לעסקה עומד על 950 ש"ח וסכום המינימום לתשלום הוא 50 ש"ח".
  - Max-issued: "... 19 עד 36 תשלומים נושאי ריבית. הריבית הינה קבועה (אינה משתנה לאורך 18 התשלומים הראשונים), ומתעדכנת לאחר פירעון התשלום ה-18 ... התוכנית אינה רלוונטית לרכישות שמתבצעות בחו"ל". "*הריבית מחושבת על פי לוח סילוקין שפיצר". **[primary]** [Discount – תוכניות אשראי: קרדיט](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/credit/)
- **Max's cardholder agreement**, §7.3(ב): "'אשראי קרדיט פלוס' ... הינו אשראי בריבית קבועה מתחלפת תקופתית במסגרתו מוגדל סכום החיוב המצטבר ב-19 עד 36 תשלומים וכולל שתי תקופות ריבית: (א) התקופה הראשונה – ... 18 התשלומים הראשונים ו-(ב) התקופה השנייה – יתר התשלומים". **[primary]** [Max cardholder agreement](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf)
  - "ריבית קבועה מתחלפת תקופתית" is defined: "עם סיום תקופה ותחילת תקופה חדשה ישתנה שיעור הריבית במספר אחוזים זהה לזה שבו שונתה ריבית הפריים בין שתי התקופות".
  - A slip marked "קרדיט פלוס" counts as a request for this credit (§7.4(ב)).
- **Max's split-after-purchase page** states the same rule: "עד 18 תשלומים הריבית קבועה; מ-19 תשלומים ומעלה הריבית מתעדכנת בהתאם לשינויים בריבית הפריים ... בפריסה של 19 תשלומים ומעלה – שיעור הריבית יתעדכן בתשלום ה-19 וככל שחל שינוי בבסיס הפריים ... תחושב יתרת הפריסה שטרם סולקה לפי ריבית הפריים החדשה וריבית זו תישאר קבועה עד לתום תקופת הפריסה". It sets a minimum of ₪25 per payment up to 18 payments and ₪50 above 18. **[primary]** [Max – חלוקת עסקה לתשלומים](https://www.max.co.il/loans/transaction-split)
- **Leumi Card's 2018 leaflet**, the origin of the name: "עסקת קרדיט – עסקת אשראי בתשלומים ... ריבית קרדיט קבועה העשויה להשתנות ב-קרדיט פלוס, בתשלום ה-19 ... בקרדיט פלוס, עדכון הריבית בהתאם לשינויים בפריים ... מינימום 25 ₪ לתשלום". It also says "עסקאות קרדיט ו-30 פלוס יופיעו לידיעה בחודש ביצוען וחיובן יחל בחודש העוקב". **[primary, 2018]** [Leumi Card leaflet](https://onlinelcapi.max.co.il/SharedMedia/12738/%D7%9E%D7%99%D7%93%D7%A2-%D7%97%D7%99%D7%95%D7%A0%D7%99-%D7%9C%D7%9C%D7%A7%D7%95%D7%97%D7%95%D7%AA.pdf)

**Who uses the name:**

- **Max** (ex-Leumi Card), confirmed in its own contract.
- **Discount Bank** uses it in its description of Cal- and Max-issued cards.
- **Cal's own contract** names its installment-credit plans "קרדיט", "קרדיט חו"ל" and "לארג'". **"קרדיט פלוס" does not appear** in the Cal or Visa-Cal (Bank Yahav) agreements I read. **UNCONFIRMED** whether Cal itself uses "קרדיט פלוס" as the label for 19–36 deals; Discount's page does.
- **Isracard** allows 19+ payments inside "קרדיט בתשלומים" without a separate name (§19.2.2.3.2) and at a fixed rate.

**How it differs from the rest:**

- **From regular קרדיט**: more payments (19–36 vs 3–18), a higher minimum (₪950 deal and ₪50 payment at Discount), and at Max a mid-life re-pricing. The mechanics are otherwise the same: Spitzer, first payment one month deferred, shown "לידיעה" on the first statement.
- **From revolving credit / מסגרת**: it has a fixed schedule and term (closed-end). Revolving credit has neither. The Bank of Israel draws exactly this line between "הלוואות לזמן קצוב ... לפי לוח סילוקין (closed-end credit)" and "אשראי גמיש ... ללא מועד פירעון מוגדר וללא לוח סילוקין (open-end credit)". **[primary]** [BOI 28.4.2025, §4–5](https://www.boi.org.il/media/q43bv55w/202510.pdf)
- **From a card loan (הלוואה)**: a loan is cash credited to the bank account, not a purchase spread into payments (§5.4).

### 4.2 Its interest and payments

- **Equal monthly payments of principal and interest** (Spitzer), on the remaining balance of the deal.
- **Max day count**: 30/360 Spitzer or actual/365 (366), per the specific credit's terms: "על-פי 360 ימים בשנה ו-30 ימים בחודש (שיטת שפיצר) או על-פי מספר הימים שחלפו בפועל ממועד העמדת האשראי חלקי 365 או 366". **[primary]** [Max agreement §7.1](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf)
- **At payment 19 (Max only):** the remaining balance is re-amortised over the remaining payments at the old rate + (prime now − prime at the deal). The Max contract also says the monthly sum changes "כמתחייב משינוי ריבית הקרדיט". Section 6.3 has a worked example.
- **Rates.** No source publishes a separate "קרדיט פלוס" rate column. Mizrahi's Max table has one "קרדיט בתשלומים קבועים" rate per card type: 15.50% / 16.65% on Max International. **UNCONFIRMED** whether 19–36 deals are priced the same as 3–18 deals at the start.
- **On the statement:** like any קרדיט deal, it shows "לידיעה" in the first month, then as "תשלום k מתוך N" rows (§7).

### 4.3 The revolving products (often confused with קרדיט פלוס)

If the owner meant **"credit where I pay a chosen amount and the rest rolls with interest"**, the product is **revolving credit**. Its names by issuer:

**Cal: "שירות אשראי מתגלגל"**, plus the CalChoice card (_אשראי מתחדש_)

- **Monthly payment**: the chosen amount, but at least 2% of total obligations, or the amount over the credit limit: "סכום החיוב החודשי הוא הסכום שנקבע על ידך או 2% מסך ההתחייבויות או סכום החריגה ממסגרת הכרטיס". For CalChoice the default is the greater of 4% of the balance and ₪200 (agreement §28).
- **Interest**: "הריבית מתווספת אך ורק ליתרת הסכום הנדחה לחודש העוקב". Rate = base rate + margin (§27.12).
- Sources: **[primary]** [Cal – שירות אשראי מתגלגל](https://www.cal-online.co.il/ecredit/fixed-monthly-charge/); [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)

**Max: "שירות אשראי מתגלגל"**; the rolled balance is called "**סל מצטבר**"

- **Monthly payment**: minimum the greater of ₪200 and 2% of the credit limit, or ₪500 on non-"מולטי" cards. Max calls it "סכום החיוב החודשי המינימלי ... אחוז מסוים ממסגרת האשראי ... לפי הגבוה מהשניים כשהוא מעוגל לכפולה של 10 ₪" (agreement §7.2).
- **Interest**: "הריבית שמשלמים היא רק על הסכום שנדחה מחודש לחודש".
- **Loans and credit products inside it**: their monthly installment rolls too, so interest compounds ("ריבית דריבית").
- **On the statement**: "הסל המצטבר ... תמיד יופיע כחלק מהחיוב העתידי וכחלק מדף הפירוט".
- Sources: **[primary]** [Max – שירות אשראי מתגלגל](https://www.max.co.il/loans/fixcharge); [Max agreement](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf)

**Isracard: "אשראי מתגלגל" / "החזר חודשי קבוע"** (non-bank cards)

- **Monthly payment**: "סכום החיוב המינימלי ... 500 ₪ או 3% מגובה השימושים (הגבוה מביניהם)".
- **Interest**: prime + the risk margin, computed **daily** on the principal and charged **monthly as part of the fixed payment, interest first**: "חיוב הלקוח בריבית ייעשה אחת לחודש במועד החיוב הרגיל כחלק מסכום ההחזר החודשי, כך שקודם יחויב הלקוח בריבית ולאחר מכן בהחזר הקרן" (§19.4.9.3).
- **קרדיט deals inside it**: "קרדיט" and "אשראי מהיר" products do not enter the pool. But "עסקאות בבית עסק מסוג 'קרדיט בתשלומים קבועים' ... ייכנסו לסל המצטבר ... ויישאו גם את ריבית השירות (ריבית דרבית)".
- Sources: **[primary]** [Isracard – אשראי מתגלגל](https://www.isracard.co.il/credit-solutions/fixed-monthly-payment/private); [Isracard agreement §19.4](https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx)

**Isracard / Amex: "ישראקרדיט" / "אמריקן אקספרס קרדיט"** (the older pooled-credit track)

- **Monthly payment**: "5% מיתרת הקרן ... אך לא פחות מ-100 ₪", or a fixed amount of at least ₪200.
- **Interest**: prime + margin, variable. It is computed daily on the principal ("מדי יום ביומו") and charged on the first business day of each calendar quarter, not added to the monthly charge. The basis is "שיעור הריבית הנומינלי השנתי ... ומספר הימים המדויק ... חלקי 365 או 366" (§19.1).
- **Amex**: "תשלומי הקרן יופיעו בהודעת החיוב החודשית ואילו הריבית תחוייב מידי רבעון קלנדרי בחשבון הבנק שלך".
- Sources: **[primary]** [Isracard agreement §19.1](https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx); [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html); [Amex PDF](https://he.americanexpress.co.il/globalassets/PDF/credit-explan.pdf)

**Isracard "MORE"**

- A fixed monthly amount from ₪1,000, or 3%. The unpaid amount joins an interest-bearing pool. **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)

**Names not found:** "תשלום גמיש", "קרדיט גמיש", "max credit" and "Max Back" as a credit product appear on **no** issuer page I read. "MAX Back" is a cashback card and club. "מינימום / תשלום מינימלי" exists as the revolving minimum described above.

**Typical revolving rates today** (Mizrahi, from 3.9.2026, regular non-premium cards):

| Issuer and product              | Nominal | מתואמת |
| ------------------------------- | ------- | ------ |
| Isracard ישראקרדיט / Amex קרדיט | 14.15%  | 15.10% |
| Cal עדיף / Diners לארג', Basic  | 14.35%  | 15.33% |
| Max International, אשראי מתגלגל | 14.50%  | 15.50% |
| Max First                       | 8.00%   | 8.30%  |

**[primary]** [Mizrahi](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)

The Bank of Israel gives the market-average revolving rate as about 15–16%. Its chart compares revolving credit with overdraft and prime-based loans, 2023–2025. Bizportal quotes 15.6% for August. **[primary/secondary]** [BOI 28.4.2025](https://www.boi.org.il/media/q43bv55w/202510.pdf); [Bizportal](https://www.bizportal.co.il/guides/news/article/20041605)

**Revolving credit's market share:**

- ₪6.2 billion, about 4.6% of non-housing consumer credit (September 2024).
- **Over 90% of it is issued by the card companies.**
- Over 80% of revolving customers never change their monthly amount.
- **[primary]** [BOI 28.4.2025](https://www.boi.org.il/media/q43bv55w/202510.pdf)

---

## 5. Other rates a card has

### 5.1 ריבית פיגורים (late-payment interest)

- Charged on any amount not paid when due, from the due date to actual payment.
- **Isracard**: "ריבית בנק ישראל ... בצירוף 16.40% ... ריבית הפיגורים תחושב לפי מספר הימים המדויק של הפיגור ותצורף לקרן החוב אחת לרבעון". Today: 3.25% + 16.40% = **19.65% nominal**. With quarterly capitalisation that is (1 + 0.1965/4)^4 − 1 ≈ **21.15% מתואמת**. **[primary]** [Isracard – ריבית פיגורים](https://digital.isracard.co.il/pages/Credit/)
  - **Note:** that page's worked figures (20.90% / 22.60%) still assume a 4.50% Bank of Israel rate. The page is stale.
- **Cal**: late interest "שתחושב על-פי מספר הימים שחלפו בפועל חלקי 365 או 366, בשיעור החוקי המקסימאלי". **[primary]** [Cal agreement §21](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)
- **Legal cap**: 1.2 × the Fair Credit Law cost cap, which is 21.9% today (§2.4). **[primary]**
- **Who sees it:** a cardholder only meets this rate if a bill bounces. A card debited automatically from a funded account never sees it.

### 5.2 ריבית על חריגה ממסגרת (over-limit interest)

- **On cards, going over the limit is mostly charged at once, not financed at a special rate.**
  - **Cal**: the excess over the available limit "יחויב לאלתר" (§27.12(ג)(2)).
  - **Isracard revolving**: "סכומים שיעברו את מסגרת אשראי בכרטיס יחויבו במועד החיוב"; foreign over-limit amounts are charged within 48 hours (§19.4.8).
  - **Max**: "אם יתרת הכרטיס בחריגה ממסגרת האשראי ... יחויב החשבון בגובה החריגה בתוספת ריבית".
  - **[primary]** (the Cal, Isracard and Max sources above)
- Max's data includes a plan called "**קרדיט-מחוץ למסגרת**". **[secondary]** [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers/blob/master/src/scrapers/max.ts)
- **"ריבית חריגה" as a published rate** belongs to bank current accounts (overdraft above the approved limit). The Banking Rules define it, and banks list it with overdraft tiers. **[primary]** [Banking Rules §1](https://www.boi.org.il/media/rvzi1ngd/151.pdf); [Mizrahi](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)
- **UNCONFIRMED**: any issuer publishing a separate over-limit _rate_ for cards.

### 5.3 Interest on cash withdrawals (משיכת מזומן)

- **Fees vs interest.** Cash withdrawals carry **fees** in the pricing list: Max lists a per-withdrawal fee abroad, 3% on foreign currency, and ATM fees. **[primary]** [Max pricing list](https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_general.pdf)
- **Interest arises only when the withdrawal is financed.**
  - **Domestic**, non-bank card: the bank account is debited within about 2 business days, so there is no interest (Isracard iSchool, above).
  - **Deferred to the billing date**: bridge interest at a variable prime-based rate, by days elapsed. Max's §7.3(ז) "דחיית חיובים למועד החיוב החודשי" includes cash withdrawals; Cal says "חיובים שנדחו ... לרבות משיכות מזומן מכספומט ... נושאים ריבית עד למועד החיוב הבא שלהם". **[primary]** [Max agreement](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf); [Cal – אשראי מתגלגל](https://www.cal-online.co.il/ecredit/fixed-monthly-charge/)
  - **Inside revolving**: cash withdrawals join the rolled balance (Isracard §19.4.7.4; Cal). The Bank of Israel now requires issuers to let customers choose **not** to roll extras such as loans, קרדיט splits and cash withdrawals into revolving credit. **[primary]** [BOI 28.4.2025, §17.1](https://www.boi.org.il/media/q43bv55w/202510.pdf)
- **"אשראי מהיר"** at Isracard is a withdrawal into the bank account, repaid in installments:
  - fixed rate, prime + margin at the request date;
  - 30/360 Spitzer;
  - **bridge interest (_ריבית גישור_)** at actual/365 from the credit date to the first billing date (§19.3).
  - Today's rate is 16.25% / 17.52%.
  - **[primary]** [Isracard agreement](https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx); [Mizrahi](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)

### 5.4 הלוואה בכרטיס אשראי (card loans)

**Isracard**

- **"הלוואה מהירה / אשראי מהיר"**: up to 70% of the available credit limit, paid within 3 business days. Terms are 3–24 months on bank cards and 3–60 on non-bank cards.
- **"הלוואה לכל מטרה (הלוואה 109)"**: up to ₪100,000 over 3–84 payments, for customers of any bank.
- **Car loan**: "ריבית: צמודה לפריים".
- **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)

**Cal**

- **"הלוואת אקספרס"** and an instant loan for customers of all banks, up to 84 payments. The rate is personal: "הריבית בכאל נקבעת על-פי נתוניו האישיים של כל לקוח ועל פי סוג ההלוואה". Equal payments from the **second** billing date. Interest for the stub period up to the first billing date is paid on that date (agreement §27.14).
- **Spreading the monthly bill** (_פריסת החיוב החודשי_): 1–36 payments, up to 60 on cards Cal issues directly. The first payment is on the second billing date.
- **[primary]** [Cal – ריבית](https://www.cal-online.co.il/ecredit/financial-terms/intrest/); [Cal – פריסה לתשלומים](https://www.cal-online.co.il/ecredit/debit-spread/); [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf)

**Max**

- **"הלוואה ברגע"**: "ריבית קבועה מתחלפת חודשית", up to 60 payments.
- **"חודש חופש"**: spreads the monthly bill over 3–36 payments. The rate is re-set at payments 13 and 25 ("תשתנה בתשלום ה-13 ... בתשלום ה-25").
- **Splitting one past transaction**: 3–36 payments, ₪75 minimum. "החלוקה לתשלומי קרדיט צוברת ריבית מיום הבקשה". An already-charged deal also pays **bridge interest** ("ריבית יומית משתנה") until the installments start.
- **[primary]** [Max agreement §7.3](https://www.max.co.il/api/umbraco/getImage?imageName=cardholderagreement.pdf); [Max – חלוקת עסקה](https://www.max.co.il/loans/transaction-split)

**Discount** (for cards it distributes)

- A loan "לכל מטרה" in 3–36 equal payments, with the rate "בהתאם לסוג הכרטיס ולתנאי הבנק".
- Spreading future or past monthly bills over up to 36 equal payments "נושאי ריבית קבועה".
- **[primary]** [Discount – הלוואות ופריסות](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/credit-plans/)

### 5.5 Which rates are listed together, and which one matters most

**Card companies do not put interest rates in their fee schedules (תעריפון).** Max's general תעריפון lists card fees, FX fees, cash-withdrawal fees, letters and replacements, but **no interest rates**. **[primary]** [Max pricing list](https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_general.pdf)

Rates are published together in three places:

1. **The card's welcome letter and the monthly statement**, as a table of rates per type of deal and credit plan (Leumi Card leaflet; Discount).
2. **Banks' disclosure pages for the cards they distribute.** For each issuer and card type, **Mizrahi** lists, as _תעריפית_ and _מתואמת_ side by side:
   - **Isracard**: ישראקרדיט / אמק"ס קרדיט (revolving) · קרדיט בתשלומים קבועים · אשראי מהיר
   - **Cal / Diners**: ויזה עדיף / דיינרס לארג' · ויזה/דיינרס בתשלומים קבועים · ויזה 30+ · הלוואות אקספרס
   - **Max**: חודש חופש / הלוואות ברגע · קרדיט בתשלומים קבועים · אשראי מתגלגל (and "מולטי" for Multi cards)
   - **[primary]** [Mizrahi – שיעורי ריבית באשראי](https://www.mizrahi-tefahot.co.il/about-mizrahi-tefahot-he/disclosure-links/credit-interest-rates/)
3. **The issuer's Fair Credit disclosure page**, for late interest (Isracard).

**Which one a regular cardholder most wants to see: the קרדיט (fixed-installment) rate**, nominal with its מתואמת beside it.

- It is the only one a typical household meets **at the till**: "קרדיט 12 תשלומים". It is also what the after-the-fact "split this transaction" buttons in the apps use.
- The revolving rate matters only to the minority on revolving credit, though for them it matters more because it compounds open-ended. Late and over-limit interest matter only if something goes wrong.
- The Bank of Israel's advice is to compare credit by its **annual rate**: "לברר את שיעור הריבית השנתי – המהווה את הנתון המרכזי לצורך השוואת התנאים". **[primary]** [BOI 28.4.2025, §21](https://www.boi.org.il/media/q43bv55w/202510.pdf)
- _Which rate matters most is my judgement from the sources, not a sourced fact._

---

## 6. Worked math

### 6.1 A קרדיט deal: ₪3,000 in 12 payments at prime + 4%

**Method: Spitzer (equal total payments), not equal principal.**

- Cal: "לפי לוח 'שפיצר' (בתמצית: סכום ההחזר הכולל הינו קבוע, אולם סכום הקרן וסכום הריבית המרכיבים את התשלום הכולל משתנים בכל תשלום)" (§27.10(ג)).
- Isracard: "בתשלומים חודשיים רצופים של קרן וריבית, כאשר סכומם הכולל ... יהיה זהה" (§19.2.2.2).
- Discount: "לוח סילוקין שפיצר". Amex: "סכום ההחזר החודשי קבוע וכולל בתוכו את ההחזר על חשבון הקרן ואת ההחזר על חשבון הריבית".
- **[primary]** (sources in §1.4)

**Day count:** Isracard computes קרדיט interest **30/360** on the unpaid balance of each deal: "שיעור הריבית הנומינלי השנתי ... המוכפל ב-30 יום בחודש ומחולק ב-360 יום בשנה" (§19.2.3.3). So the monthly rate is exactly i/12. **[primary]** [Isracard agreement](https://digital.isracard.co.il/link/5ece8d7fa0964e098de2271de13ba674.aspx)

**Inputs:**

- Prime 4.75% + 4% = i = **8.75%** nominal.
- r = 0.0875/12 = **0.7291667%** a month.
- מתואמת = (1 + r)^12 − 1 = **9.11%**.

**Payment:** PMT = P·r / (1 − (1 + r)^−n) = 3000 × 0.0072917 / (1 − 1.0072917^−12) = **₪262.01**

| #   | Interest | Principal | Payment | Balance after |
| --- | -------- | --------- | ------- | ------------- |
| 1   | 21.87    | 240.13    | 262.01  | 2,759.87      |
| 2   | 20.12    | 241.88    | 262.01  | 2,517.99      |
| 3   | 18.36    | 243.65    | 262.01  | 2,274.34      |
| 4   | 16.58    | 245.42    | 262.01  | 2,028.92      |
| 5   | 14.79    | 247.21    | 262.01  | 1,781.70      |
| 6   | 12.99    | 249.02    | 262.01  | 1,532.69      |
| 7   | 11.18    | 250.83    | 262.01  | 1,281.86      |
| 8   | 9.35     | 252.66    | 262.01  | 1,029.20      |
| 9   | 7.50     | 254.50    | 262.01  | 774.70        |
| 10  | 5.65     | 256.36    | 262.01  | 518.34        |
| 11  | 3.78     | 258.23    | 262.01  | 260.11        |
| 12  | 1.90     | 260.11    | 262.01  | 0.00          |

- **Total paid ₪3,144.08, of which interest is ₪144.08.**
- **Compare equal principal** (_קרן שווה_, not what issuers use): first payment ₪271.88, last ₪251.82, total interest ₪142.19.
- **Compare תשלומים** (interest-free): 12 × ₪250.00.
- **At a realistic card rate** of 15.25% (Isracard קרדיט today, about prime + 10.5): PMT = **₪271.13**, total interest **₪253.55**.

**Timing** (Isracard and Amex wording; card billed on the 10th; purchase on 20.10.2026):

- **10.11.2026, the "regular" billing date** (_מועד החיוב הרגיל_): the deal appears **"לידיעה"** and nothing is charged. **Interest starts here.** Isracard's קרדיט interest is computed "החל ממועד החיוב הרגיל" and in "חודשים השלמים" to each payment (§19.2.3.2). Amex: "חישוב הריבית יתבצע רק על פי תקופת האשראי בפועל, זאת אומרת החל מהיום בו אמור היה סכום העסקה להיות מחויב אילו בוצעה העסקה הרגילה". **[primary]**
- **10.12.2026**: payment 1 of 12, ₪262.01 (exactly one month of interest).
- **10.11.2027**: payment 12.

**Issuer differences (UNCONFIRMED in how they are billed):**

- **Cal**: interest accrues **from the day Cal pays the merchant**, "תוך 4 ימים בממוצע מיום ביצוע העסקה", which is earlier than the regular billing date (§27.10(ב)). **[primary]** [Cal agreement](https://cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf). How those extra days reach the bill (inside payment 1, or as a separate bridge charge) is **UNCONFIRMED**.
- **Max**: "החלוקה לתשלומי קרדיט צוברת ריבית מיום הבקשה" for after-the-fact splits. Its contract allows 30/360 or actual/365 "כמפורט בהסכם האשראי". **[primary]**
- **Rounding**: for interest-free תשלומים, Isracard says "התשלום הראשון ... יכול להיות שונה" to absorb rounding (§1.3). **UNCONFIRMED** for קרדיט: rounding is presumably to the agora, but no source gives the rule.

### 6.2 Revolving credit: Isracard's own example, with interest

- **Isracard's own example**: a fixed payment of ₪1,200. Spending is ₪1,500, then ₪1,000, then ₪2,000. Isracard shows ₪300, then ₪100, then ₪900 rolling, without interest. **[primary]** [Isracard – אשראי מתגלגל](https://www.isracard.co.il/credit-solutions/fixed-monthly-payment/private)
- **Isracard's rules applied** (§19.4.9):
  - prime + margin, today 14.15% for ישראקרדיט-type credit;
  - interest computed **daily** on the rolled principal, actual days / 365;
  - charged at the next billing date **inside** the fixed payment, interest first.
- **Billing on the 10th**: periods of 31, 28 and 31 days.

| Month | New spending | Rolled principal + interest from before | Due      | Paid (fixed) | Rolls to next month | Interest on it (14.15% × days/365)   |
| ----- | ------------ | --------------------------------------- | -------- | ------------ | ------------------- | ------------------------------------ |
| 1     | 1,500.00     | 0                                       | 1,500.00 | 1,200        | 300.00              | 300 × 0.1415 × 31/365 = **3.61**     |
| 2     | 1,000.00     | 303.61                                  | 1,303.61 | 1,200        | 103.61              | 103.61 × 0.1415 × 28/365 = **1.12**  |
| 3     | 2,000.00     | 104.73                                  | 2,104.73 | 1,200        | 904.73              | 904.73 × 0.1415 × 31/365 = **10.87** |

- **Rule of thumb**: ₪1,000 rolled for a month at about 14.15–14.5% costs about ₪12. That is the Bank of Israel's own example figure ("על כל דחייה של 1,000 ₪ תשלום ריבית של 12 ₪ לחודש").
- **Each issuer's version:**
  - **Cal**: same shape. The payment is the chosen amount, or 2% of obligations if higher. **UNCONFIRMED**: Cal's day count for revolving interest.
  - **Max**: same shape. The minimum is the greater of ₪200 and 2% of the limit (₪500 on non-Multi cards). **UNCONFIRMED**: Max's day count for revolving interest.
  - **Isracard ישראקרדיט / Amex קרדיט**: the monthly payment is **5% of the principal, minimum ₪100**. Interest accrues daily but is charged **quarterly** as a separate charge, not inside the monthly payment.

### 6.3 Max's קרדיט פלוס re-pricing at payment 19 (illustration)

- **Deal**: ₪3,600 in 24 payments at 8.75% (prime 4.75 + 4): PMT = ₪164.05.
- **After 18 payments** the balance is ₪959.67.
- **Prime change**: if prime is then 0.5 point lower (4.25%), payments 19–24 are re-amortised at 8.25%. The payment becomes **₪163.82**.
- **Contract basis**: "ישתנה שיעור הריבית במספר אחוזים זהה לזה שבו שונתה ריבית הפריים בין שתי התקופות" (Max §7.3(ב)). **[primary]**
- _These numbers are my illustration; the method is the contract's._

---

## 7. What appears on statements and in exports

### 7.1 The monthly statement (דף פירוט / דף ריכוז חיובים)

Confirmed from primary sources:

**For each installment deal**

- **The required fields:** the current amount, "**מספר התשלום הנוכחי מתוך סך התשלומים**", and the payment dates. Directive 470 §12(1)(י)(3) requires them in online channels: "בעסקה עם תשלום נדחה יפורטו ... סכום נוכחי לתשלום; מספר התשלום הנוכחי מתוך סך התשלומים; מועדי תשלום". **[primary]** [BOI directive 470](https://www.boi.org.il/media/wo2n3irs/470.pdf)
- **The charged amount of a קרדיט row is principal + interest.** Amex: "בהודעת החיוב החודשית יופיע פירוט התשלומים המחוייבים בפועל (קרן + ריבית)". **[primary]** [Amex PDF](https://he.americanexpress.co.il/globalassets/PDF/credit-explan.pdf)
- **In the first month a קרדיט deal appears "לידיעה" only** (Discount; Amex; Leumi Card). **[primary]**
- **Index-linked קרדיט**: the base index and the index used for the charge (directive 470 §12(1)(יב)). **[primary]**

**For the card as a whole**

- **A table of the card's interest rates** per deal type and credit plan (Leumi Card leaflet; Discount; Cal). **[primary]**
- **Online**: the used and available credit limit and **the nominal rate charged on using it** (directive 470 §12(1)(ט)). **[primary]**
- **Revolving**: the rolled balance, Max's "סל מצטבר", "יופיע כחלק מהחיוב העתידי וכחלק מדף הפירוט". **[primary]** [Max](https://www.max.co.il/loans/fixcharge)
- **Interest charges as their own lines**: Isracard ישראקרדיט quarterly interest; 30+ quarterly interest at Cal; bridge interest at Max. **[primary]** (contracts above)
- **Regulator's demand**: the Bank of Israel asked issuers to "לשפר את הגילוי של סכומים שנגבו מהלקוחות בגין שירותי אשראי מתגלגל ושירותי אשראי אחרים בדף הפירוט החודשי". This suggests disclosure of interest amounts was weak as of 2025. **[primary]** [BOI 28.4.2025, §17.4](https://www.boi.org.il/media/q43bv55w/202510.pdf)

**UNCONFIRMED** (I could not see a real statement):

- whether the **interest part of each קרדיט installment** is printed as its own number on the row;
- whether **both** nominal and מתואמת are printed in the statement's rate table. Banking Rules §2(ב) suggests they must be when a rate is disclosed.

### 7.2 Excel/CSV exports and issuer data

**Not confirmed from a primary source:** I could not log in to an issuer to download a live export.

**What the issuers' data contains**, from open-source code that reads the issuers' web APIs (the same data the export is built from). **[secondary]** [israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers/tree/master/src/scrapers)

- **Max**:
  - **Fields**: `planName`, `comments` (e.g. "תשלום 3 מתוך 12"), `originalAmount`, `actualPaymentAmount`, `paymentDate`.
  - **Known `planName` values**: "רגילה", "תשלומים", "קרדיט", "קרדיט-מחוץ למסגרת", "סל מצטבר", "חודשי + ריבית", "עסקת 30 פלוס", "דחוי חודש", "דחוי חודשיים", "דחוי לחיוב החודשי", "פריסת העסקה הדחויה", "חלוקת חיוב חודשי", "פרעון מוקדם", "דמי כרטיס", "חיוב עסקות מיידי", "אינטרנט/חו"ל", "חיוב ארנק מטח".
- **Cal**:
  - **Fields**: `trnType` (text) and `trnTypeCode`: 5 regular, **6 credit (קרדיט)**, 8 installments, 9 standing order. Also `numOfPayments`, `curPaymentNum`, `trnAmt` (deal amount) and the charged amount.
  - **For CalChoice/revolving**: `fixDebitAmount` and `totalBasketAmount`.
- **Isracard / Amex**: `moreInfo`, free text containing "תשלום k מתוך N"; `dealSum` (deal amount); `paymentSum` (charged amount).
- **None of these fields carries an interest rate or a per-row interest amount.**

**What this means for parsing:**

- **From the export you can get:**
  - **the plan kind**: from "סוג עסקה" / "פירוט נוסף" / "הערות" text such as "קרדיט", "תשלום k מתוך N" and "סל מצטבר";
  - **k and N**;
  - **the original deal amount**;
  - **this month's charged amount**.
- **For a קרדיט row**, the charged amount already **includes** that month's interest. So:
  - total interest on the deal = N × payment − original amount, once one payment is known, because Spitzer payments are equal;
  - the interest inside payment k needs the rate, or solving for it: r is the unique rate with PMT = P·r/(1 − (1 + r)^−N). It can be **solved from P, N and PMT**, since all three are in the export.
- **Rates themselves** (nominal and מתואמת) are not in the export. They come from the statement's rate table, the issuer's letter, or the bank's disclosure page.

---

## Implications for a budgeting app

**1. Show one rate per credit kind, as nominal with its מתואמת.** The owner's three items are not three parallel rates:

- **ריבית שנתית and ריבית שנתית מתואמת are the same rate written twice.** Enter or show the nominal rate. Compute the מתואמת as (1 + i/12)^12 − 1, which matches every card pair issuers publish. Fees are never part of it.
- **קרדיט פלוס is a kind of deal** (19–36 payments), not a kind of rate.

**2. What a user would reasonably expect to enter per card.** All of these are printed on the card's letter and statement rate table.

- **The קרדיט rate** (fixed-installment), the one that matters most. Enter it as a nominal %, or as prime ± a margin. The app already has `creditAnnualRate` and `creditPrimeMargin`.
- **The revolving rate**, only if the card is on אשראי מתגלגל / סל מצטבר / ישראקרדיט. Prime-based, so it moves with prime.
- **Optionally the late rate.** It is rarely relevant, and Isracard's is the Bank of Israel rate + 16.40%, not prime-based.
- **Whether the card is on revolving credit, and its fixed monthly amount.**
- **Card kind (bank / non-bank) and billing day**, which the app already has. These decide who sets the rate and when things are charged.

**3. What can be computed rather than entered**

| Item                                                  | How                                                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **מתואמת from nominal**                               | Monthly compounding                                                                                                                                                                    |
| **Today's rate from prime + margin**                  | Prime is a single global value: 4.75% since 3.9.2026, with a known change history. The app can hold it and update it when the Bank of Israel decides; the next decision is 21.10.2026. |
| **Payment and full Spitzer schedule of a קרדיט deal** | From amount, N and rate. Total interest = N × PMT − amount.                                                                                                                            |
| **The rate implied by an imported קרדיט row**         | From amount, N and the charged installment. This lets the app check or fill the card's rate without asking.                                                                            |
| **Revolving interest**                                | Approximately: rolled balance × rate × days/365 per cycle. Exact matching needs issuer-specific rules (Isracard daily; ישראקרדיט quarterly).                                           |

**4. What must be entered, or read from a statement:**

- the margin over prime, or the rate itself, per card and plan;
- the revolving fixed amount and minimum rules;
- whether a deal is קרדיט or תשלומים when the export's text does not say so.

**5. Rules to get right:**

- **A prime change re-prices only open-ended credit:** revolving, 30+, CalChoice, prime-based loans.
- **Existing fixed קרדיט deals keep their rate.** The exception is Max's קרדיט פלוס, which shifts once, at payment 19, by the prime change since the deal.
- **Snapshot the rate on each deal**, as the app already does with `Recurrence.creditAnnualRate`. Re-pricing old rows when prime moves would be wrong for most issuers.
- **A קרדיט deal's first payment is on the second billing date after the purchase**, with the deal shown "לידיעה" on the first statement. **תשלומים start on the first billing date.**
- **The export's charged amount for a קרדיט row includes interest.** Treat (charged − amount/N) as only an approximation of the interest in it; the exact split needs the schedule.

---

## Open uncertainties

1. Whether Cal itself, rather than Discount describing Cal cards, uses the name "קרדיט פלוס". Cal's contracts say "קרדיט" and "לארג'".
2. Whether 19–36-payment deals are priced at the same opening rate as 3–18-payment deals. No issuer publishes a separate rate.
3. Day-count and stub-period handling for Cal's קרדיט (interest from about 4 days after purchase) and for Max's revolving interest.
4. Why issuers publish the מתואמת of quarterly-charged ישראקרדיט with m = 12.
5. Whether statements print the interest part of each קרדיט installment, and whether the rate table shows both nominal and מתואמת. No real statement was seen.
6. The exact columns of each issuer's Excel/CSV export. Only API field names were seen, via open-source code.
7. Whether the merchant-side "דחוי ..." plans are interest-free. Inferred, not confirmed by an issuer.
8. Leumi, Hapoalim and FIBI card-rate pages were not reached directly. Bank-side rates come from Mizrahi and Discount, plus a FIBI notice and Leumi Card's 2018 leaflet.
9. Kolzchut and the Bank of Israel HTML consumer pages blocked automated access. The Bank of Israel's PDFs were used instead.
