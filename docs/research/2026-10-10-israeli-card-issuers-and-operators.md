# Israeli cards: issuer, card company, network, product and the account they charge

Date: 2026-10-10. Branch: `research/open-banking`.

Asked for by the user: "the [last four digits] max card is a bank card that Max, a credit company, manages for them; this is how it works in Israel. In Israel bank credit cards also have a provider which is usually a credit card company. Research the logic in Israel and make sure it is implemented in the app correctly and most accurately." Then, binding: "you have 'מנפיק', 'רשת' which is visa/mastercard etc, and you have the brand, which is visually on the card: the bank's name or the credit company's name. All 3 are set on a card. We need to ask users first if it's a bank card, then the provider, then the network, because some providers don't work with all networks: check who works with who."

**How to read this.**

- **[primary]**: a law, a Bank of Israel (BOI) directive or circular, or a bank's or card company's own page, contract, tariff or annual report.
- **[secondary]**: press or an encyclopedia.
- **[V]**: verified on the household's real export files, kept outside the repo. Only column names and categorical values are quoted here, never a digit, an amount or a name.
- **UNCONFIRMED**: no primary source here establishes it.
- Hebrew is quoted as the source writes it. "Seen" is 2026-10-10 unless a line says otherwise.
- Many facts below come from the earlier issuer research on this branch (`docs/research/issuers/*.md`, seen 2026-10-08), which has the full quotes. They are cited as "issuers/max.md §1.2" and so on, with the underlying URL.

---

## 0. The answer on one screen

A card in Israel has **five separate facts**, and the app needs all five:

| Fact                                 | Hebrew                            | Who it is                                                                                                                                        | Example: the user's Discount Visa run by Max |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| **Issuer**                           | מנפיק                             | A **bank** for a bank card ("מנפיק בנקאי"). The **card company itself** for a non-bank card. Its name is the big name on the card.               | Discount Bank                                |
| **Card company** (operator/provider) | מתפעל הנפקה, "חברת כרטיסי האשראי" | Isracard (with Amex), Cal (with Diners) or Max. Always present. For a non-bank card it is also the issuer.                                       | Max                                          |
| **Network**                          | רשת / "ארגון בינלאומי"            | Visa, Mastercard, American Express, Diners, or Isracard's local network. Limited by the card company (§4).                                       | Visa                                         |
| **Product and club**                 | סוג כרטיס, מועדון                 | The card's type and programme as the issuer names it.                                                                                            | "Discount Basic International"               |
| **Charged to**                       | חשבון לחיוב, מועד חיוב            | A current account. A bank card: an account at the **issuing bank**. A non-bank card: **any** bank, by a debit authorisation (הרשאה לחיוב חשבון). | the household's Discount account             |

Two more parties exist and the app should **not** model them:

- the **acquirer** (סולק), who pays the merchant;
- the **clearing** of the deal between companies (סליקה, סליקה צולבת).

The cardholder never chooses or sees them, and the BOI makes the bank's payment to its card company independent of which acquirer handled the deal (§1.3).

**Certain** (primary sources agree):

- The bank is the issuer of a bank card.
- The card company runs it under an operating agreement the bank chooses, and the bank may move its cards to another card company.
- The bank gives the credit and sets its rates.
- The card company prints the statement.
- Non-bank cards are issued by the card company itself and can be charged to any bank.

**Varies by bank and product:** which card companies run which bank's cards, and on which networks (§4.2).

**Unverified:** listed in §8.

---

## 1. The parties of a card

### 1.1 Issuer (מנפיק)

- **The BOI's directive on cards defines a bank issuer.** "מנפיק בנקאי – מנפיק שהינו בנק". "מנפיק" itself takes the Debit Cards Law's meaning. **[primary]** [BOI directive 470, "כרטיסי חיוב", edition 12/25, §2](https://boi.org.il/media/3nxboqe3/470%D7%9E%D7%95%D7%A0%D7%92%D7%A9.pdf)
- **The issuer is who the cardholder owes.** The Debit Cards Law describes the card-credit contract as one "בין לקוח לבין מנפיק, שלפיו מתחייב הלקוח לשלם למנפיק את תמורת הנכסים", paid "בדרך של חיוב חשבונו של הלקוח בתאגיד בנקאי או בכל דרך אחרת" (§7). **[primary]** [חוק כרטיסי חיוב, התשמ"ו-1986, Wikisource](https://he.wikisource.org/wiki/חוק_כרטיסי_חיוב)
  - That page records the law as repealed on 14.10.2020 under the Payment Services Law, 2019. Directive 470 (12/25) still borrows its definitions. **UNCONFIRMED**: whether the Payment Services Law now defines "מנפיק" itself. Its Wikisource text defines "אמצעי תשלום", "חשבון תשלום" and "סליקה" but not "מנפיק". **[primary]** [חוק שירותי תשלום, Wikisource](https://he.wikisource.org/wiki/חוק_שירותי_תשלום)
- **A bank card is issued jointly, and the bank is a party to it.**
  - Leumi: "חברת כרטיסי האשראי מנפיקה ביחד עם הבנק את הכרטיס ועוסקת בתפעול ההנפקה". **[primary]** [Leumi form 319-56, ed. 08.25, §2.2](https://www.leumi.co.il/leumi-hebrew/s3fs-public/newsite/hozim%20ahidim/319-56_ACC.pdf), in issuers/banks-leumi-hapoalim-mizrahi.md §L.1
  - Hapoalim's three card agreements (Isracard and Amex, Cal, Max; August 2026) define "המנפיקה" as "חברת כרטיסי האשראי והבנק". **[primary]** issuers/banks-leumi-hapoalim-mizrahi.md §H.1
  - Discount: "הכרטיס המונפק במשותף על ידי הבנק וחברת כרטיסי האשראי". **[primary]** [Discount general terms, part ז' §28](https://www.discountbank.co.il/media/kwmj2jsr/part_g.pdf)
  - Max: "החברה מנפיקה כרטיסים בנקאיים במסגרת הנפקה משותפת ותפעול הנפקה (Processing) ... עם בנק לאומי, בנק מזרחי טפחות בע"מ, בנק דיסקונט בע"מ, בנק הפועלים בע"מ וקבוצת הבנק הבינלאומי". **[primary]** Max annual report 2025, in issuers/max.md §1.2
- **Isracard's own bank-specific tariffs name the bank as issuer.** For example "המונפקים ע"י הבנק הבינלאומי ... בהנפקה משותפת עם ישראכרט", and "המונפקים על ידי בנק יהב ... בהנפקה משותפת עם ישראכרט". **[primary]** issuers/isracard.md §1
- **A non-bank card (כרטיס חוץ בנקאי)** is issued by the card company alone. "האשראי בכרטיסים החוץ בנקאיים מועמד על ידי החברה ומסגרת האשראי נקבעת בהתאם לשיקול דעתה הבלעדי ... These cards debit any bank account under a הרשאה לחיוב חשבון". **[primary]** Max AR 2025, issuers/max.md §1.2. Cal says the same: "מסגרת האשראי בכרטיס חוץ בנקאי ... נקבעת באופן בלעדי על ידי חברת האשראי". **[primary]** [Cal – כרטיס אשראי חוץ בנקאי](https://www.cal-online.co.il/ecredit/financial-terms/off-bank-credit-card/)
- **The legal issuer of a non-bank card is a company in the group, not always the brand.**
  - Isracard group: ישראכרט בע"מ issues Isracard, Mastercard and Visa. פרימיום אקספרס בע"מ issues American Express. ישראכרט מימון בע"מ lends. **[primary]** Isracard agreement 11/2025 §1, issuers/isracard.md §1
  - Cal group: כרטיסי אשראי לישראל בע"מ issues Visa and Mastercard. דיינרס קלוב ישראל בע"מ issues Diners. כאל (מימון) and דיינרס (מימון) lend. **[primary]** Cal agreement §1, issuers/cal.md §1.1
  - Max: מקס איט פיננסים בע"מ, with מקס איט אשראים בע"מ for credit. **[primary]** issuers/max.md §1.1

### 1.2 Card company: the issuance operator (מתפעל הנפקה)

- **The BOI's term is "מתפעל הנפקה":** "חברת כרטיסי חיוב, כהגדרתה בסעיף 6 לחוק להגברת התחרות, העוסקת בתפעול הנפקה, כהגדרתו בסעיף 1 לחוק זה". **[primary]** [D470 §2](https://boi.org.il/media/3nxboqe3/470%D7%9E%D7%95%D7%A0%D7%92%D7%A9.pdf). The definition was added in 2018, after the Strum law (החוק להגברת התחרות ולצמצום הריכוזיות בשוק הבנקאות בישראל, 2017). **[primary]** [BOI circular 2565, 2.7.2018](https://boi.org.il/media/qagblnn5/h2565.pdf). **UNCONFIRMED**: the law's own wording of "תפעול הנפקה" (§1). I did not read the law's text.
- **The issuer's site and app must show both names.** "המנפיק יציג לכל הפחות את פרטי המידע הבאים: (א) שם המנפיק. (ב) שם מתפעל ההנפקה. (ג) שם הלקוח ... (ד) ארבע ספרות אחרונות של המספר המוטבע על הכרטיס או שם הכרטיס". **[primary]** D470 §12(1). So a card company's card page is the one document that must name both the issuer and the operator.
- **The bank chooses the operator, per card, and may change it.**
  - Leumi: "כרטיסים שונים מתופעלים ע"י חברות כרטיסי אשראי שונות, לפי בחירת הבנק", and the bank may replace the operator after notice. **[primary]** Leumi form 319-56 §2.2
  - Discount: "כרטיסים שונים עשויים להיות מונפקים במשותף ומתופעלים על ידי חברות כרטיסי אשראי שונות, לפי בחירת הבנק". **[primary]** Discount part ז' §28
  - So the operator is a fact **of the card**, not of the bank. One bank customer can hold cards run by two companies, as the user does at Discount.
- **Operating agreements are regulated.** Agreements between a bank issuer and an issuance operator signed up to 31.1.2022 had to be filed with the Supervisor. A big bank's agreement needs the Supervisor's approval. **[primary]** D470 §27; circular 2565 §3
- **Money flows bank → operator, whatever the customer's billing day.** "התמורה בגין כל העסקאות שנעשו בכרטיס חיוב שמנפיק בנקאי הנפיק, תועבר מהמנפיק הבנקאי למתפעל ההנפקה, בהתאם למועד שנקבע ... בהסכם הסליקה הצולבת, ללא תלות במועד החיוב של הלקוח וללא תלות בזהות הסולק". The bank bridges the gap between when the operator pays the acquirer and when the customer is charged. **[primary]** D470 §26; circular 2565 §2 and its explanation
- **The open-banking rule calls the card companies "חברת כרטיסי אשראי": "סולק, שהוא גם מנפיק כרטיס חיוב".** **[primary]** [Directive 368 v6, definitions](https://www.boi.org.il/media/k1dl4le3/2778.pdf), in `2026-10-09-israeli-open-banking-path.md` §2

### 1.3 Acquirer (סולק), clearing (סליקה) and the "בנק סולק" idea

- **Definitions.**
  - Payment Services Law: "סליקה – קליטה של פעולת תשלום ועיבודה לשם זיכוי המוטב". Its own definition of "סולק" is marked "(נמחקה)". **[primary]** [Wikisource](https://he.wikisource.org/wiki/חוק_שירותי_תשלום)
  - D470 takes "סולק" from §36ט of the Banking (Licensing) Law. **[primary]** D470 §2
- **Who acquires.**
  - The three card companies acquire as well as issue. Max now reports as "נותן שירותי תשלום בעל חשיבות יציבותית" (formerly "סולק"). **[primary]** Max AR 2025, issuers/max.md §1.1
  - The BOI has licensed acquirers outside the card companies: one on 04.04.2017, another on 20.03.2018, and a permanent licence to "קארדקום סליקה בע"מ" on 18.07.2023. **[primary]** [BOI – רישיון בנק ורישיון סולק](https://boi.org.il/roles/supervisionregulation/bank-sup/legislationinfo/legisbank/), page updated 27/10/2024. The 2017 licensee was Tranzila. **[secondary]** [centralbanking.com](https://www.centralbanking.com/central-banking/news/2435136/bank-of-israel-smoothes-the-way-for-new-credit-card-players)
- **"בנק סולק".** In the international four-party model the acquirer is called the "acquiring bank". In Israel that role is held by the card companies and by licensed non-bank acquirers. The BOI licensing page lists no bank among the acquirer licences. **UNCONFIRMED**: whether any Israeli bank acquires today. I found no source that says so.
- **Why the app ignores it.** The acquirer is the merchant's party. A bank card's money moves bank → operator "ללא תלות בזהות הסולק" (D470 §26). Nothing on the cardholder's statement depends on it, and no export column names it.

### 1.4 Network (רשת, "הארגונים הבינלאומיים")

The card company holds the network licence. Bank cards use their operator's licences.

| Card company                      | Networks it issues                                               | Source                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isracard (ישראכרט בע"מ)           | **Isracard** (domestic only), **Mastercard**, **Visa**           | "לעניין ישראכרט בע"מ כמנפיקות - קבוצת מסטרקארד ... וקבוצת ויזה" **[primary]** Isracard agreement 11/2025 §1 ([link](https://digital.isracard.co.il/link/c144296f498b49ffbe3fbcbeb72fc0eb.aspx)); the domestic Isracard card in its tariff |
| American Express (פרימיום אקספרס) | **American Express** only                                        | "לעניין פרימיום אקספרס בע"מ כמנפיקה - קבוצת אמריקן אקספרס אינטרנשיונל" **[primary]** same §1                                                                                                                                              |
| Cal                               | **Visa**, **Mastercard**                                         | Cal agreement §1 **[primary]** ([link](https://www.cal-online.co.il/media/hfmnvm15/heskemklalinew.pdf))                                                                                                                                   |
| Diners (דיינרס קלוב ישראל, Cal)   | **Diners**; and **Mastercard** on "Diners Mastercard" and FlyAll | Cal agreement §1; FlyAll "on Diners or Mastercard" **[primary]** ([Cal – FlyAll](https://www.cal-online.co.il/cards/flyall)); Mizrahi's Cal table names "דיינרס מסטרקארד"                                                                 |
| Max                               | **Visa**, **Mastercard**. "Max issues neither" Diners nor Amex.  | Max AR 2025 **[primary]**, issuers/max.md §1.1                                                                                                                                                                                            |

- **The user's "brand".** The name that is big on the card is the **issuer's**: the bank's logo on a bank card (Leumi brands its cards "כרטיס אשראי בנקאי עם לוגו לאומי" **[primary]** issuers/banks-leumi-hapoalim-mizrahi.md §L.1), and the company's on a non-bank card. A co-brand or club card adds the partner's name (Shufersal, El Al). The network's logo sits in a corner. The app's Hebrew label "מותג" for the network is therefore misleading; "רשת" is the right word.
- A card's operator is usually printed too (for example "max" on a Leumi-logo card). **UNCONFIRMED** as a rule: no source requires it on the plastic. D470 §12(1)(ב) requires it on the issuer's site and app.

### 1.5 Product and club

- The product is the issuer's: a bank names its own cards and clubs. Examples include Discount "מפתח דיסקונט", Mercantile "סמייל", Mizrahi "הכרטיס של מזרחי-טפחות" (club "כתום") and Leumi "לאומי בונוס". **[primary]** issuers/cal.md §1.4; issuers/banks-leumi-hapoalim-mizrahi.md §M.1, §L.1
- A non-bank card's product is the company's: Max "max executive", "Dream Card VIP" and "max ביחד בשבילך" are names printed in Max's own export **[V]** (§5). Max publishes a separate disclosure and tariff per club. **[primary]** issuers/max.md §1.3
- **Benefits on a bank card can be the bank's, not the operator's.** "Since 31.8.2022 Hapoalim-branded Max cards no longer earn Max's פינוקים, because Hapoalim runs its own loyalty programme". **[primary]** issuers/max.md §1.2

### 1.6 Who gives the credit and sets the rates

- **Bank card: the bank.** The card limit is usually part of the account's credit line, and "כל בנק אחראי למלוא החיובים". **[primary]** Max AR 2025, issuers/max.md §1.2
  - Isracard: "המסגרת נקבעת על ידי הגורם המנפיק (סניף הבנק בכרטיסים הבנקאיים וישראכרט בכרטיסים חוץ בנקאיים)". **[primary]** [Isracard iSchool](https://minisites.isracard.co.il/ischool/onboarding/onboarding_products_4.html)
  - Discount: "בכל פעם שיוצג לבנק שובר אשראי ייחשב הדבר כבקשה של הלקוחות מהבנק לקבלת אשראי". **[primary]** Discount part ז'2 §1ד
- **Non-bank card: the card company's lending arm.** **[primary]** §1.1
- Exceptions exist: at Yahav, Cal sets the revolving rate on Cal cards. **[primary]** issuers/banks-others.md §6
- So rates are keyed by **(issuing bank, operator, product)**. The catalog already does this (`BankRateRow`).

### 1.7 Where it is charged

- **Non-bank card:** any bank, by a debit authorisation (הרשאה לחיוב חשבון). **[primary]** Max AR 2025. Billing days are the company's: Max 2, 10 or 15; Isracard 2, 10, 15 or 20. **[primary]** issuers/max.md; issuers/isracard.md
- **Bank card:** the customer's current account **at the issuing bank**. Leumi: "חיוב החשבון"; Hapoalim's debit: "החיוב יעשה מהחשבון השקלי בלבד". **[primary]** `2026-10-09-israeli-debit-cards.md` §2.2
  - The bank sets the billing-date menu and can force one date for all cards on an account. **[primary]** Hapoalim §8.5; Leumi §11.1, in issuers/banks-leumi-hapoalim-mizrahi.md
  - A bank card charged to an account at **another** bank: no source describes it. **UNCONFIRMED** that it never happens. The design treats it as a warning, never a block.
- **How it shows on the current account** **[V]**, from the import study (`2026-10-10-import-samples-study.md` §3):
  - a non-bank card's bill as one lump named after the company ("מקס איט פי חיוב");
  - a bank card's purchases one by one ("חיוב לכרטיס ויזה NNNN") at Discount.

### 1.8 Who sends the statement, and where the card shows

- **The card company sends the monthly statement**, for bank cards too. Discount's contract calls it "הודעת החיוב התקופתית שתישלח אל הלקוחות על ידי חברת כרטיסי האשראי". **[primary]** issuers/banks-others.md §1.9. Mercantile routes statements and loans to Cal's app. **[primary]** [Mercantile](https://www.mercantile.co.il/private/credit-cards/)
- **The bank's site shows its own bank cards** in the same format as other cards. On the customer's request it also shows an **external card** (another issuer's card charged to this bank's account), with a link to the issuer's or operator's site. **[primary]** D470 §12א(1)–(2)
- **A Discount-issued, Max-run card appears on both Discount's site and Max's site.** **[V]** (import study §1)

### 1.9 Debit and prepaid

- **A debit card is a bank card by definition:** "כרטיס חיוב מיידי – כרטיס בנק כהגדרתו בחוק כרטיסי חיוב, שחיוב באמצעותו הוא מיידי". **[primary]** D470 §2. It is run by a card company (§4.2).
  - **Exception, UNCONFIRMED:** Isracard's **non-bank** tariff lists "כרטיס דירקט / ISRACASH (כרטיס חיוב מיידי)" at ₪8.50. **[primary]** [Isracard tariff 06/2026](https://digital.isracard.co.il/globalassets/taarifon_2026.pdf). Whether a non-bank immediate-debit card is sold today is not established.
- **A prepaid card (כרטיס נטען)** can be the company's own or a bank's. Hapoalim's Up Card is run by Isracard; Mercantile's 2GO is seen on Cal's site. **[primary]** `2026-10-09-israeli-debit-cards.md` §1.3

---

## 2. Who owns the card companies (2026)

| Company                                   | Owner today                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Source                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Max** (formerly Leumi Card, לאומי קארד) | Leumi sold it. Simax (formerly Warburg Pincus) has controlled it since 25.2.2019, and **Clal Holdings** has controlled Simax since March 2023. Leumi remains its main bank partner, with the agreement extended to 31.1.2031; the agreement includes "הסדרת הפסקת השימוש בשם 'לאומי קארד'".                                                                                                                                                                   | **[primary]** Max AR 2025, issuers/max.md §1.1–1.2                                                                |
| **Isracard** (with Amex Israel)           | Spun off from Hapoalim and listed in 2019 under the Strum reform. It had no controlling shareholder until the BOI gave **Delek Group** (Yitzhak Tshuva) a control permit, announced 9.7.2025: about ₪770m for about 30%, with an option up to 49.99%. A 2023 Harel deal did not complete. Isracard's 11/2025 agreement still ties its conversion-rate and late-interest definitions to Bank Hapoalim.                                                         | **[secondary]** [Walla, 9.7.2025](https://finance.walla.co.il/item/3763855); **[primary]** issuers/isracard.md §1 |
| **Cal** (with Diners)                     | Discount about 72%, FIBI about 28%. Discount must sell under the Strum law, by May 2027. A sale to Union (80%) and Harel (20%) was approved by the Competition Commissioner on conditions, including that Union sell its Super-Pharm stake. On 23.9.2026 the buyers said the agreement will be cancelled if that decision stands. The deal's latest long-stop date is 1.11.2026, and Discount may ask the Supervisor to extend its deadline to November 2027. | **[secondary]** [Funder, 23.9.2026](https://funder.co.il/article/210363); issuers/cal.md §1.1                     |

- **The Mizrahi–Isracard agreement.** On 12.4.2026 Mizrahi-Tefahot and Isracard signed a five-year agreement: "ישראכרט תהיה אחראית על הנפקה, ניהול ושירות של כרטיסי האשראי של כלל לקוחות הבנק". **[secondary]** [Bizportal, 12.4.2026](https://www.bizportal.co.il/general/news/article/20030227). **UNCONFIRMED**: the start date, and what happens to existing Mizrahi cards run by Cal, Max or Diners. Mizrahi's site still listed all five companies on 2026-10-08. **[primary]** issuers/banks-leumi-hapoalim-mizrahi.md §M.1
- **Ownership changes no card's terms by itself.** The bank still chooses the operator per card (§1.2). The app should key on the operator **brand**, not the owner.

---

## 3. The arrangements in Israel today

| Arrangement               | Issuer                          | Card company                                 | Credit from                      | Charged to                | Statement from   | Examples                                                                                                                                                                                                     |
| ------------------------- | ------------------------------- | -------------------------------------------- | -------------------------------- | ------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bank credit card**      | the bank                        | Isracard, Cal, Diners or Max (bank's choice) | the bank                         | an account at that bank   | the card company | Discount Visa run by Cal or by Max; Leumi-logo Max cards; Mizrahi Isracard Mastercard; One Zero Isracard Mastercard                                                                                          |
| **Bank Amex**             | the bank (with Premium Express) | Amex (Isracard group)                        | the bank ("מועמדת על ידי בנק …") | an account at that bank   | Amex             | Hapoalim, Mizrahi, FIBI group, Yahav **[primary]** issuers/isracard.md §1                                                                                                                                    |
| **Non-bank credit card**  | the card company                | the same company                             | the company's lending arm        | any bank                  | the card company | Max "max executive" (Mastercard), "Dream Card VIP" (Visa); Isracard and Amex non-bank; CalChoice; Leumi passes Amex applicants to a non-bank card **[primary]** issuers/banks-leumi-hapoalim-mizrahi.md §L.1 |
| **Co-brand or club card** | as the base card                | as the base card                             | as the base card                 | as the base card          | as the base card | Shufersal (Cal, non-bank); FlyCard (moved from Cal to Isracard in 2026, **[secondary]**); FlyAll (Cal); bank clubs such as "כתום"                                                                            |
| **Debit card**            | the bank                        | Isracard, Cal or Max                         | none                             | the bank account, at once | both (§1.8)      | Hapoalim "דיירקט" (Isracard only); Mizrahi debit (Cal) or Direct (Isracard)                                                                                                                                  |
| **Prepaid card**          | the company, or a bank          | Isracard, Cal or Max                         | none                             | loaded in advance         | the card company | Cal Prepaid, MyCal; Max cash, MyMAX; Hapoalim Up Card (Isracard); Mercantile 2GO (Cal)                                                                                                                       |

---

## 4. Compatibility matrix

Cell status:

- **confirmed**: a primary source names the combination.
- **varies**: the combination exists, but not for every product, or the source names only some products.
- **unverified**: likely, but no primary source here names it. It is **shown** in the app, tagged "Check your card".
- **absent**: the bank's own full list of card companies omits it. Hidden in the app, but reachable through "Not in the list".

"Checked" is the date the source was read: 10-08 from the issuer research on this branch, 10-10 for this note.

### 4.1 Card company × kind × network: non-bank cards

| Card company | Credit                                                                               | Debit                                                                                               | Prepaid                                                                                         |
| ------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Isracard     | Isracard, Mastercard, Visa: **confirmed** (AG25 §1; 10-08)                           | Isracard (ISRACASH): **unverified** (in the non-bank tariff, §1.9; 10-08)                           | נטענצ'יק, for non-bank Isracard holders: **confirmed** (10-08); its network **unverified**      |
| Amex         | American Express: **confirmed** (AG25 §1; 10-08)                                     | none found: **absent**                                                                              | none found: **absent**                                                                          |
| Cal          | Visa, Mastercard: **confirmed** (Cal agreement §1; 10-08)                            | none found: **absent** (Cal debit is sold only through banks, §4.2)                                 | Prepaid ("ויזה נטען": Visa **confirmed**), MyCal, PayBox Young (network **unverified**) (10-08) |
| Diners       | Diners **confirmed**; Mastercard on Diners Mastercard and FlyAll: **varies** (10-08) | none found: **absent**                                                                              | none found: **absent**                                                                          |
| Max          | Visa, Mastercard: **confirmed** (AR 2025; 10-08)                                     | about 11% of Max cards are debit (AR 2025), but no non-bank debit product was found: **unverified** | max cash, max pre-paid, MyMAX: **confirmed** (10-08); network **unverified**                    |

### 4.2 Bank × card company × kind, with network narrowing

Bank codes are Masav codes, as `src/domain/banks.ts` keeps them.

| Bank (code)                                                    | Isracard                                                                                                          | Amex                                          | Cal                                                                                                                                                    | Diners                                                                  | Max                                                          | Debit run by                                                                                             | Prepaid                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Leumi (10)**                                                 | **varies**: the tariff names "החברות כ.א.ל וישראכרט" (10-08); likely FlyCard since its move (10-10)               | **absent**: Amex is non-bank at Leumi (10-08) | **unverified** for Cal's Visa and Mastercard: a 2019 Leumi–Cal agreement covered them, but Cal's tariff names only "כרטיס דיינרס של בנק לאומי" (10-08) | **confirmed** (10-08); Leumi lists FlyAll, Diners or Mastercard (10-10) | **confirmed**, the main partner, Visa and Mastercard (10-08) | "דביט" is issued by Leumi on Visa; its operator **unverified** (10-10)                                   | Cash Card: operator **unverified**                   |
| **Hapoalim (12)**                                              | **confirmed**, Isracard / Mastercard / Visa (10-08)                                                               | **confirmed** (10-08)                         | **unverified** for Visa/Mastercard: Hapoalim has a Cal agreement (08/2026), but Cal's tariff names only Hapoalim's Diners (10-08)                      | **confirmed** (10-08)                                                   | **confirmed** (08/2026 agreement; 10-08)                     | Isracard only, "בשיתוף עם חברת ישראכרט בלבד": **confirmed**; Mastercard Direct and Visa Debit **varies** | Up Card, Isracard, Visa or Mastercard: **confirmed** |
| **Discount (11)**, incl. Igud (13 → 11)                        | **absent**: no Isracard or Amex chapter in the tariff (10-08)                                                     | **absent** (10-08)                            | **confirmed** (tariff part 6; the user's card **[V]**)                                                                                                 | **confirmed** (10-08)                                                   | **confirmed** (tariff part 6; the user's card **[V]**)       | Debit: operator **unverified** (Cal or Max)                                                              | 2go: operator **unverified**                         |
| **Mizrahi-Tefahot (20)**                                       | **confirmed**; sole issuer for new cards under the 12.4.2026 agreement (**secondary**, start date **unverified**) | **confirmed** (10-08)                         | **confirmed** (rate table 3.9.2026)                                                                                                                    | **confirmed** (10-08)                                                   | **confirmed** ("ויזה מקס", "ויזה מקס מולטי"; 10-08)          | Cal ("כרטיס דביט") and Isracard ("דיירקט"): **confirmed**                                                | none found                                           |
| **Mercantile (17)**                                            | **absent** (10-08)                                                                                                | **absent**                                    | **confirmed**, the only one (10-08)                                                                                                                    | **confirmed** (10-08)                                                   | **absent**: no Max chapter (10-08)                           | Debit: Cal, **unverified**                                                                               | 2GO, seen on Cal's site: **confirmed**               |
| **FIBI (31)**, with PAGI (52), Otsar HaHayal (14), U-Bank (26) | **confirmed**, "בהנפקה משותפת עם ישראכרט" (10-08)                                                                 | **confirmed** (10-08)                         | **varies**: Cal's tariff lists FIBI; FIBI's table has Cal rows; no FIBI page for new Cal cards was found (10-08)                                       | **confirmed** (10-08)                                                   | **confirmed** (FIBI–Max terms 6.22; 10-08)                   | Isracard ("דיירקט", "MASTERCARD DIRECT"): **confirmed**                                                  | none found                                           |
| **Massad (46)**                                                | **confirmed** (10-08)                                                                                             | **confirmed** (10-08)                         | **unverified**: a Cal notice is posted, but no Cal rows (10-08)                                                                                        | **unverified**                                                          | **confirmed** (10-08)                                        | Isracard: **confirmed**                                                                                  | none found                                           |
| **Yahav (4)**                                                  | **varies**: Mastercard (Isracard's Yahav tariff), with Gold, Platinum, World Elite (10-08)                        | **confirmed** (10-08)                         | **confirmed**, Visa and Mastercard (own Cal agreement; 10-08)                                                                                          | **confirmed** (10-08)                                                   | **absent**: none on the site (10-08)                         | Isracard ("דיירקט"): **confirmed**                                                                       | none found                                           |
| **One Zero (18)**                                              | **confirmed**, Mastercard only (10-08)                                                                            | **absent**                                    | **absent**                                                                                                                                             | **absent**                                                              | **absent**                                                   | **unverified** whether it offers one                                                                     | none found                                           |
| **Bank of Jerusalem (54)**                                     | **absent**                                                                                                        | **absent**                                    | **confirmed**, "כרטיס ויזה כאל" (10-10). This corrects issuers/banks-others.md §5, which said it issues no credit card.                                | **unverified**                                                          | **absent**                                                   | "כרטיס לחיוב מיידי", international: operator **unverified** (10-10)                                      | "כרטיס מאסטרקארד נטען": operator **unverified**      |
| **Postal Bank (9)**                                            | debit only                                                                                                        | —                                             | —                                                                                                                                                      | —                                                                       | —                                                            | Isracard Direct: **confirmed** (10-08)                                                                   | —                                                    |
| **Esh Israel (3)**                                             | none: "כרטיסי חיוב" is among the services it does not give (10-08)                                                |                                               |                                                                                                                                                        |                                                                         |                                                              |                                                                                                          |                                                      |
| **Other codes** (Citibank, HSBC, Arab banks …)                 | **unverified**: not researched                                                                                    |                                               |                                                                                                                                                        |                                                                         |                                                              |                                                                                                          |                                                      |

Sources for every 10-08 cell: issuers/banks-leumi-hapoalim-mizrahi.md (§L.1, §H.1, §M.1), issuers/banks-others.md (§1.1, §2.1, §3.1, §4.1, §6.1, §7, §8), issuers/isracard.md §1 (the bank table), issuers/cal.md §1.2, issuers/max.md §1.2, and `2026-10-09-israeli-debit-cards.md` §1.2–1.3. Each gives the URL. The 10-10 cells cite [Leumi – credit cards](https://www.leumi.co.il/he/credit-cards) and [Bank of Jerusalem – credit cards](https://www.bankjerusalem.co.il/current-account/credit-cards).

**Network narrowing at a bank.** A bank card's network is limited to its operator's networks (§4.1) and further where the bank's tariff names fewer:

- One Zero: Isracard on Mastercard only.
- Yahav: Isracard on Mastercard.
- Leumi: Cal on Diners (and FlyAll on Diners or Mastercard).
- Hapoalim: Cal on Diners.

Every other bank: the operator's full list, with "varies" where products differ.

### 4.3 What the matrix means for the flow

- **Every combination a bank card can have is (bank, operator, network, kind).** The bank and the operator narrow each other; the operator narrows the network; the kind narrows all three.
- **Real cards outrun any table.** Operators change by the bank's choice (§1.2), and FlyCard moved company in 2026. So the matrix must be data with dates, an "unverified" state that never hides a choice, and an escape that accepts any combination.

---

## 5. Which fact is on which document

| Document                                          | Issuer (bank)                                                                                                                            | Card company                                                                              | Network                                          | Product / club                                                                                        | Charged-to account                                   | Status                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| **The card itself**                               | big logo on a bank card                                                                                                                  | often a small logo; not required (§1.4)                                                   | corner logo                                      | printed name, club logo                                                                               | no                                                   | [primary] for the issuer brand; operator **UNCONFIRMED** |
| **Card company's site or app**                    | must show "שם המנפיק" (D470 §12(1)(א))                                                                                                   | must show "שם מתפעל ההנפקה" (§12(1)(ב))                                                   | yes                                              | card name (§12(1)(ד))                                                                                 | sometimes                                            | [primary]                                                |
| **Max export** ("transaction-details_export")     | **not stated**. A column "מפתח דיסקונט" exists and was always empty in the sample. **UNCONFIRMED** that it marks a Discount-issued card. | implied: the file is Max's                                                                | no column                                        | **title row 2: "<last 4>-<product name>"**, e.g. "max executive", "Dream Card VIP", "max ביחד בשבילך" | no                                                   | [V]                                                      |
| **Discount bank-cards export** ("כרטיסי אשראי")   | **implied: Discount.** Title row "פירוט עסקאות - כל הכרטיסים הבנקאיים"                                                                   | **column "מנפיק" holds the operator: "כאל" on every row** of the sample                   | "כרטיס" cell: "<network word> NNNN", e.g. "ויזה" | no                                                                                                    | title row 3 holds the account (personal; never read) | [V]                                                      |
| **Discount bank-cards page** (screenshot)         | yes (the bank's own page)                                                                                                                | per card                                                                                  | per card                                         | sometimes                                                                                             | the account                                          | [V] by viewing                                           |
| **Bank current-account statement**                | —                                                                                                                                        | lump line names the company ("מקס איט פי חיוב"): a non-bank or Max-run bill               | per-transaction line "חיוב לכרטיס ויזה NNNN"     | no                                                                                                    | it is the account                                    | [V]                                                      |
| **Open banking** (BOI standard via an aggregator) | the bank's card list returns "all accounts used for reconciliation of the related credit cards"                                          | `aspspCode` of the data source (`10023` Cal, `10033` Max, `12002` Isracard, `12011` Amex) | no field                                         | `product`: "the issuer's own product name"                                                            | the bank's account list                              | [primary] `2026-10-10-feezback-api.md` §3                |

Two findings matter most for Smart import:

1. **Documents use "מנפיק" loosely.** Discount's own export, for a card Discount itself issued, has a "מנפיק" column whose value is the operator, "כאל" **[V]**. A reader must map that column to the **card company**, not the issuer.
2. **The Max export never says who issued the card.** A Discount-issued, Max-run card and a Max non-bank card look the same in it. The issuer must come from somewhere else: the product name (a bank's name in it), the bank statement's per-transaction lines, a bank export, a screenshot, or the person.
   - In the sample, the Discount card run by Max appeared in **no** export: not Max's, and not Discount's bank-cards export, which held only the Cal-run card **[V]**. **UNCONFIRMED** whether Discount's export always leaves out Max-run cards.

---

## 6. The user's three cards, worked through

No digits or names. The networks and products are as the user described them.

1. **"Discount Basic International", Visa, run by Max.**
   - Issuer: Discount Bank (code 11). Card company: Max. Network: Visa. Product: Discount's.
   - Credit and rates: Discount's (Discount: "שיעורי הריבית ... מפורטים במכתב שנשלח בסמוך להנפקת הכרטיס ובדף הפירוט החודשי").
   - Fees: Max sets them, "למעט דמי כרטיס", which the bank sets. **[primary]** Discount tariff part 6, issuers/banks-others.md §1.1
   - Charged to: the household's Discount account. Statement: from Max. Shown on both Discount's and Max's sites **[V]**.
   - In the app today it would be stored as `issuer: 'max'`, `kind: 'bank'`, `bank: 'Discount Bank'`. That works only if "Issued by: Bank card" was answered. Smart import sets neither `kind` nor `bank`, so an imported copy reads as a Max card with nothing else.
2. **A Discount Visa run by Cal.**
   - Issuer: Discount. Card company: Cal. Network: Visa.
   - Smart import reads it from Discount's export with its last four digits and "ויזה", but drops the "מנפיק" = "כאל" column and the bank title. So it arrives with no company and no bank.
3. **Max's own cards: "max executive" (Mastercard) and "Dream Card VIP" (Visa).**
   - Issuer and card company: Max (non-bank). Credit: Max's. Charged to: any of the household's accounts, here Discount.
   - In the app: `issuer: 'max'`, `kind: 'non_bank'`, `bank` = the **charged-to** bank's name. The same `bank` field holds the **issuer** in example 1.
   - Smart import keeps only the last four digits from the export's title row, and drops the product name.

---

## 7. What this means for Bookandry

The model, the flow and the migration are specified in the add-card spec on branch `add-card-flow` (`docs/superpowers/specs/2026-10-09-add-card-flow-design.md`, section 21). In short:

1. **Store the issuing bank separately from the charged-to account.** Today one `bank` text field means "the issuing bank" on a bank card and "the paying account's bank" on a non-bank card. It is stored as a display name in one language, and an unlinked bank card's issuing bank is overwritten when an account is picked (`card-fields.tsx`).
2. **Keep `card.issuer` as the card company**, and say so in its comment and in the import prompt. It has never meant the issuer of a bank card.
3. **Ask in the user's order**: kind → bank card or not → which bank → card company → network → type. Each list is filtered by the answers before it and by the matrix, through data rather than code.
4. **Read what documents really say**:
   - Discount's "מנפיק" column into the card company;
   - its "כל הכרטיסים הבנקאיים" title into issuer = Discount;
   - Max's title row into the product name;
   - open banking's `aspspCode` into the card company, never the issuer.
5. **Hebrew labels**: "רשת" for the network, not "מותג"; "מנפיק" for the issuer; "חברת האשראי (מתפעלת)" for the operator of a bank card.

---

## 8. What I could not verify

1. **Operator splits inside a bank.** Which company runs:
   - Leumi's Visa and Mastercard cards beyond Max (Cal, under the 2019 agreement, and Isracard);
   - Hapoalim's Visa credit cards;
   - Discount's, Leumi's, Mercantile's and Bank of Jerusalem's **debit** and **prepaid** cards.
2. **The Mizrahi–Isracard agreement** (12.4.2026): its start date, and the fate of existing Cal, Max and Diners cards at Mizrahi. Secondary source only.
3. **Cal's sale**: whether the Union–Harel deal is cancelled after 23.9.2026, and any change of owner. No card term depends on it.
4. **Networks of prepaid products** (MyCal, PayBox Young, max cash, MyMAX, נטענצ'יק) and of Cal's and Max's debit cards.
5. **Non-bank debit cards**: whether Isracard's ISRACASH or any Max debit card is sold as non-bank today.
6. **Whether the operator is printed on every bank card**: no rule found. D470 requires it only on the issuer's site and app.
7. **Max's "מפתח דיסקונט" column**: whether it marks Discount-issued Max cards. It was empty in the sample.
8. **Discount's export coverage**: whether it always omits Max-run cards, as in the sample.
9. **Isracard, Cal and Amex exports**: their columns for issuer and operator. No samples were available.
10. **"בנק סולק"**: whether any Israeli bank holds an acquirer licence. BOI pages for the 2017, 2018 and 2023 licences are behind a bot wall, and only their titles were read.
11. **The Strum law's definition of "תפעול הנפקה"**, and whether the Payment Services Law now defines "מנפיק". The Debit Cards Law was repealed on 14.10.2020, but D470 still borrows its terms.
12. **Banks not researched**: Citibank, HSBC, State Bank of India and the Arab banks in Masav. Their cells are "unverified", so every company is offered with "Check your card".
