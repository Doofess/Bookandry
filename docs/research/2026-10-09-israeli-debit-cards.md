# Debit, prepaid and gift cards in Israel: what they carry, and how Bookandry should model them

Date: 2026-10-09. Every source below was opened on this date (the "seen" date) unless the line says otherwise. Where a source carries its own date or version, it is given next to the link.

Scope: what an Israeli immediate-debit card (כרטיס חיוב מיידי, "דביט", "דיירקט"), a prepaid card (כרטיס נטען) and a gift card (גיפט קארד, שובר מתנה, תו קנייה) carry and show their holder; how their transactions reach a statement; and what Bookandry should store when a person adds one. The recommendation fits the user's decisions of 2026-10-09: one "Cards" screen for every card kind, "Other ways to pay" removed, and cash, cheques, transfers, standing orders, wallets and "other" as built-in "Paid with" choices.

**How to read this.** Every claim has its source next to it. **[primary]** marks a law, a regulator's document, or an issuer's or bank's own page or document. **[secondary]** marks press. **UNCONFIRMED** marks anything no primary source here establishes. Hebrew is quoted as the source writes it. Isracard's and BuyMe's pages block plain fetches, so I read them in a real browser; Isracard's fee schedule was fetched from inside that browser.

**The hard rule holds throughout.** Bookandry never stores a full card number or the code on the back; `gate:pci` fails the build on those names (`scripts/gate-pci.mjs`). Only the last 4 digits are kept. A gift card's redemption code or PIN is the same kind of secret, since whoever holds it can spend the card, so it is never stored either (§5.6).

---

## 0. Summary and recommendation

**What the cards are.**

- **Debit (חיוב מיידי).** The Bank of Israel defines it as "כרטיס בנק כהגדרתו בחוק כרטיסי חיוב, שחיוב באמצעותו הוא מיידי" **[primary]** [Directive 470 §2, 12/25](https://boi.org.il/media/3nxboqe3/470%D7%9E%D7%95%D7%A0%D7%92%D7%A9.pdf). The bank is the issuer. A card company (Isracard, Cal, Max) runs it. The account is charged within about one business day. Each purchase appears as its own line on the current-account statement, with the merchant's name (§3.1).
- **Prepaid (כרטיס נטען).** It holds a loaded balance and is charged against it immediately **[primary]** (Directive 470 §2). Banks and all three card companies issue one, usually with low caps: ₪1,000 at a time at Isracard and Mercantile (§2.3).
- **Gift.** A gift card is a prepaid card or voucher with a fixed value, an expiry date, and usually a closed list of shops. BuyMe vouchers are valid for at least 60 months **[primary]**. Isracard's gift card "אינו כרטיס חיוב" under banking law **[primary]** (§2.4).

**Five facts that shape the model.**

1. **A debit card has no billing day, no credit limit, no instalments and no קרדיט.**
   - Hapoalim's agreement: "לא ניתן להשתמש בכרטיס לרכישות בתשלומים מכל סוג שהוא לרבות רכישות במסגרת הסדרי האשראי". The sections on the billing date, the card limit and credit arrangements do not apply to a debit card (§21.7–21.8) **[primary]** [Hapoalim terms, Aug 2026](https://www.bankhapoalim.co.il/sites/default/files/media/tn-isracard.pdf).
   - Leumi says the same: "לכרטיס זה אין מסגרת אשראי לרכישות"; "לא ניתן להצטרף למסלולי אשראי לרבות – עסקות בתשלומים והלוואות" **[primary]** [Leumi Debit](https://www.leumi.co.il/he/credit-cards/Debit).
2. **It keeps a monthly card fee and the foreign-currency fee.**
   - From **1.10.2026** the monthly fee is capped at **₪7**; the market average was about ₪9 **[primary]** [BOI circular 2851, 21.6.2026, §9 and §36(ב)(1)](https://www.boi.org.il/media/0cgabv01/h2851.pdf). FIBI's tariff shows Isracard Direct going from ₪8.50 to ₪7.00 "בפיקוח" **[primary]** [FIBI tariff, part 6](https://www.fibi.co.il/media/bwxl02kb/%D7%97%D7%9C%D7%A7-6-%D7%9B%D7%A8%D7%98%D7%99%D7%A1%D7%99-%D7%90%D7%A9%D7%A8%D7%90%D7%99-31.pdf).
   - Foreign-currency deals carry the bank's usual fee, about **3%** at FIBI **[primary]** (same tariff, §6.7.1).
3. **Spending limits are real, but set by the bank and changed "מעת לעת".** Leumi allows ₪5,000 a day, ₪400 for a minor and ₪2,000 abroad. FIBI allows ₪5,000 a purchase and ₪10,000 a day. Hapoalim allowed ₪3,000 a purchase as of 03/2022 (§2.2). They decide nothing in a budget, so the flow does not ask for them.
4. **The data already distinguishes the kinds.**
   - Under the Bank of Israel's open-banking card standard, a debit card's balance is "לא רלוונטי ... כי היא משתקפת בעו"ש עצמו"; only its transactions are reported. A prepaid card reports "היתרה הנוכחית בכרטיס" **[primary]** [cards IG v1.8 §6.5](https://www.boi.org.il/media/unpkbtmy/%D7%AA%D7%A7%D7%9F-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-18.zip).
   - The MCC field exists only on card transactions, not on account transactions (§3.2).
5. **The safe model change is a new open field, not a new enum value.**
   - `paymentMethodSchema.type` is a closed `z.enum`. A synced row with an unknown `type` is **rejected** by an older build (`src/db/sync/apply.ts`, `safeParse` → `'rejected'`).
   - Unknown _fields_ are stored as received.
   - So prepaid and gift cards should ship as `type: 'debit_card'` plus a new open-string `card.funding`, the way `CashMove.kind` was made open from the start (§5.7).

**Recommendation.**

- **Add-card flow:** the first step becomes **"Which kind of card?" Credit / Debit / Prepaid / Gift**. Each kind gets its own short path (§5.4):
  - **Debit:** account → company and type → your card → fees.
  - **Prepaid:** company → type → your card → money in → fees.
  - **Gift:** issuer → your card → value.
  - A catalog tier that is really debit or prepaid switches the kind if the person picked the wrong one.
- **Debit fields:** `funding: 'debit'`, `accountId` (the account it takes money from; it decides the balance), `bank`, `issuer` (the company that runs it), `tier`, `network`, `lastDigits`, `expiresMonth`, `monthlyFeeMinor` + `feeSince`, `fxFeeRate`. Omit `billingDay`, `creditLimitMinor`, `creditPrimeMargin`, `creditAnnualRate`, `lateRate`, `feeDiscount` and deal `overrides`.
- **Prepaid fields:** the debit set, plus `loadFeeMinor` and where it is loaded from: `accountId`, or `loadCardId` when a credit card loads it. Its balance is **not a field**. It is a pot of moves, like the cash pot: start, load, unload, count. Its purchases are expenses paid from the pot.
- **Gift fields:** `funding: 'gift'`, `issuer` / `issuerName` (BuyMe, a mall, Isracard GiftCard), `network` (optional), `lastDigits` (optional), `expiresMonth` (asked, with a reminder), `acceptedAt` (short text). Its value is a pot too: received, spent, count. No fees, no account.
- **Balance maths:**
  - A debit purchase lowers its account on the purchase date. `settleDate` already does this, because `billingDayOf` is credit-only.
  - A prepaid load moves money from the account into the card's pot and leaves the balance unchanged. Spending lowers both, exactly as cash does (`src/domain/cash.ts`).
  - A gift card's value comes from outside the household. §5.5 recommends keeping it out of the balance (open question 1).

---

## 1. Types and who issues them

### 1.1 The legal definitions

- **Directive 470** (Proper Conduct of Banking Business, "כרטיסי חיוב", version 12/25) **[primary]** [D470](https://boi.org.il/media/3nxboqe3/470%D7%9E%D7%95%D7%A0%D7%92%D7%A9.pdf), §2:
  - "כרטיס חיוב מיידי – כרטיס בנק כהגדרתו בחוק כרטיסי חיוב, שחיוב באמצעותו הוא מיידי";
  - "כרטיס נטען – כרטיס תשלום כהגדרתו בחוק כרטיסי חיוב, שחיוב באמצעותו הוא מיידי ... שניתן לצבור בהם ערך כספי בדרך של טעינה מראש";
  - "עסקת חיוב מיידי – עסקה בכרטיס חיוב מיידי או בכרטיס נטען, ולמעט תשלום בגין משיכת מזומנים באמצעות מכשירים אוטומטיים".
  - "כרטיס חיוב", "כרטיס תשלום" and "מנפיק" take the Debit Cards Law's meanings (חוק כרטיסי חיוב, התשמ"ו-1986).
- **The law's "כרטיס תשלום"** was added by Amendment No. 3 (1998): a reusable plate or object for buying from a supplier, in which monetary value can be stored by reloading, except one loaded only with cash that cannot debit the customer's account **[primary]** [Knesset, חוק כרטיסי חיוב (תיקון מס' 3), התשנ"ח-1998](https://fs.knesset.gov.il/14/law/14_lsr_211554.pdf). The scanned text is poorly OCR'd. I paraphrase it and did not read the current consolidated law on Nevo (**UNCONFIRMED** wording).
- **A "deferred-debit" card** (כרטיס חיוב נדחה) is what Israelis call a credit card: "כרטיס חיוב נדחה (כרטיס אשראי) בו החיובים מתבצעים אחת לחודש" **[primary]** [BOI, "שווה לדעת – דביט"](https://boi.org.il/media/2ruhzowm/%D7%A9%D7%95%D7%95%D7%94-%D7%9C%D7%93%D7%A2%D7%AA-%D7%93%D7%91%D7%99%D7%98.pdf) (undated leaflet). The open-banking standard uses the same three-way split: "differed debit/credit card", "Prepaid card", "Debit card" **[primary]** [cards IG v1.8 §6.5](https://www.boi.org.il/media/unpkbtmy/%D7%AA%D7%A7%D7%9F-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-18.zip).
- **A debit card must look different.** "על גבי כרטיס חיוב מיידי וכרטיס נטען יוטבע ... סימון המבדיל אותם מיתר כרטיסי החיוב" **[primary]** (D470 §18). The kind is printed on the card, so asking the person is fair.

### 1.2 Debit cards on the market

| Bank               | Product                                                                             | Run by                                                                                                    | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hapoalim           | "דיירקט"                                                                            | "כרטיסי דיירקט מונפקים בשיתוף עם חברת ישראכרט בלבד"; international, ₪ and FX, contactless                 | **[primary]** [Hapoalim summary, 03/2022](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/credit_card_use_0322.pdf)                                                                                                                                                                                                                                                                                                                                                                               |
| FIBI group, Massad | "כרטיס חיוב מיידי (דיירקט)"; also "MASTERCARD DIRECT"                               | Isracard; both rows are labelled "כרטיס חיוב מיידי"                                                       | **[primary]** [FIBI request form כאש150, 2.24](https://www.fibi.co.il/media/hrgdhaxs/%D7%91%D7%A7%D7%A9%D7%94-%D7%9C%D7%94%D7%96%D7%9E%D7%A0%D7%AA-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%90%D7%A9%D7%A8%D7%90%D7%99-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-%D7%9E%D7%99%D7%99%D7%93%D7%99-%D7%93%D7%99%D7%99%D7%A8%D7%A7%D7%98.pdf); [FIBI tariff, part 6](https://www.fibi.co.il/media/bwxl02kb/%D7%97%D7%9C%D7%A7-6-%D7%9B%D7%A8%D7%98%D7%99%D7%A1%D7%99-%D7%90%D7%A9%D7%A8%D7%90%D7%99-31.pdf) |
| Leumi              | "כרטיס דביט (DEBIT)", age 16 and up                                                 | "המונפק על ידי לאומי". Which company processes it is **UNCONFIRMED**; Max, formerly Leumi Card, is likely | **[primary]** [Leumi Debit](https://www.leumi.co.il/he/credit-cards/Debit)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mizrahi-Tefahot    | "כרטיס דביט" (Cal) and "דיירקט" (Isracard)                                          | Cal or Isracard. Both are "לחיוב מיידי בתשלום אחד"; the Direct one is "בארץ"                              | **[primary]** [Mizrahi credit cards](https://www.mizrahi-tefahot.co.il/credit-cards/)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Discount           | "Debit" and "2go" under "כרטיס חיוב מיידי"                                          | Not stated; Discount's cards are Cal's (**UNCONFIRMED** for debit)                                        | **[primary]** [Discount – charge](https://www.discountbank.co.il/private/credit-cards/types-of-credit-cards/charge/)                                                                                                                                                                                                                                                                                                                                                                                            |
| Mercantile         | "כרטיס חיוב מיידי (Debit)" and "2GO" prepaid                                        | 2GO transactions are seen "באתר של כאל"                                                                   | **[primary]** [Mercantile – debit card](https://www.mercantile.co.il/private/credit-cards/card-types/debit-card/)                                                                                                                                                                                                                                                                                                                                                                                               |
| Yahav              | Isracard debit "דיירקט"                                                             | Isracard                                                                                                  | [primary], seen 2026-10-08, in `docs/research/issuers/banks-others.md` §6                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Postal Bank (דואר) | Direct only                                                                         | Isracard                                                                                                  | [primary], seen 2026-10-08, in `docs/research/issuers/isracard.md` (Isracard's Doar tariff)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| One Zero           | **UNCONFIRMED** whether it offers a debit card; its card is an Isracard credit card | —                                                                                                         | `docs/research/issuers/banks-others.md` §7                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

- **Isracard prices Direct as a debit card.** Its own non-bank fee schedule lists "כרטיס דירקט / ISRACASH (כרטיס חיוב מיידי)" at **₪8.50** a month. Its fee is charged for the calendar month, "MASTERCARD DIRECT, ISRACASH / דירקט ... יחוייבו מידי חודש בחודשו", not per billing period **[primary]** [T-ISR 06/2026](https://digital.isracard.co.il/globalassets/taarifon_2026.pdf).
- **Max issues debit cards too.** About 11% of valid Max cards are debit and 3% prepaid **[primary]**, per Max's 2025 annual report as recorded in `docs/research/issuers/max.md` (seen 2026-10-08).
- **Every account holder is entitled to one.** "ככלל, כל לקוח זכאי לקבל כרטיס דביט, גם לקוח שהבנק אינו רואה לנכון להעניק לו אשראי", and banks must offer it when an account is opened **[primary]** [BOI leaflet](https://boi.org.il/media/2ruhzowm/%D7%A9%D7%95%D7%95%D7%94-%D7%9C%D7%93%D7%A2%D7%AA-%D7%93%D7%91%D7%99%D7%98.pdf). The Bank of Israel calls it "אמצעי תשלום בסיסי וחיוני" for people refused a credit card **[primary]** [circular 2851 §7](https://www.boi.org.il/media/0cgabv01/h2851.pdf).
- **Networks.** Isracard runs Direct on Isracard and Mastercard ("MASTERCARD DIRECT"). Cal and Max run Visa and Mastercard. The Leumi, Discount and Mercantile pages do not name the network (**UNCONFIRMED**).

### 1.3 Prepaid cards on the market

| Issuer                   | Product                           | Key terms                                                                                                                                                                                                                                                                                                                                                                                      | Source                                                                                                                                       |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Isracard                 | נטענצ'יק                          | Only for holders of a non-bank Isracard credit card. "סכומי טעינת הכרטיס נכללים במסגרת כרטיס האשראי הטוען". Up to ₪1,000 per load and on the card at any time; ₪4,000 a calendar month; ₪10,000 a year; up to 3 cards. Usable in Israel and abroad, and for cash. Load fee ₪3.5 after 3 months. Works in digital wallets. Excludes gambling, money transfer, fuel, crypto, hotels and car hire | **[primary]** [Isracard – נטענצ'יק](https://www.isracard.co.il/credit-cards/prepaidcard)                                                     |
| Hapoalim (with Isracard) | Up Card                           | Loaded from the account. Balance can be returned to the account. No instalments, no deferred payment, no standing orders. Unnamed card, may be handed to a family member. Balance on Isracard's and the bank's sites, by phone and SMS. Load credited within 1 business day; refund within 2. Visa or Mastercard                                                                               | **[primary]** [Up Card summary, 11/2025](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/standard-contract/upcard_nov2025.pdf) |
| Mercantile               | 2GO                               | Single load ≤ ₪1,000; balance ≤ ₪1,000; ATM up to ₪400. Load fee ₪3 at a branch, ₪2.70 in the app. Balance at ATMs, by phone, in the app. "ניתן לשייך את כרטיס 2go לארנקים דיגיטליים כגון Apple Pay, Google Pay"                                                                                                                                                                               | **[primary]** [Mercantile – debit card](https://www.mercantile.co.il/private/credit-cards/card-types/debit-card/)                            |
| Cal                      | Prepaid, MyCal, PayBox Young      | Card fee: "כרטיס פריפייד (PREPAID)" ₪9.90 a month; "PayBox Young" ₪7.90, charged "מכרטיס ההורה". Load fee up to ₪27; ₪2.9 on MyCal; ₪12 on reloadable cards                                                                                                                                                                                                                                    | **[primary]** [Cal fees, 06.2026](https://www.cal-online.co.il/media/ma5oflaj/amlot.pdf)                                                     |
| Max                      | max cash, max pre-paid, MyMAX     | Card fee ₪19.90 a month for "max cash ו-max pre-paid". Load fee: pre-paid ₪55 first, ₪27 each later; cash card ₪4 per load, or ₪2 by standing order. 1% for an ATM withdrawal "באמצעות כרטיס נטען שאיננו מקושר לחשבון עו"ש"                                                                                                                                                                    | **[primary]** [Max general tariff, 9.2026](https://www.max.co.il/api/umbraco/getImage?imageName=taarifon_general.pdf)                        |
| Leumi, Bank Jerusalem    | Cash Card; "כרטיס מאסטרקארד נטען" | Listed only                                                                                                                                                                                                                                                                                                                                                                                    | [primary], seen 2026-10-08, in `docs/research/issuers/banks-leumi-hapoalim-mizrahi.md` and `banks-others.md`                                 |

- **PayBox Young** is a wallet and card for 8–18-year-olds, set up and limited by a parent **[secondary]** [Gadgety](https://www.gadgety.co.il/352191/paybox-new-model/). Cal's fee line is the primary evidence that it is a Cal-issued prepaid card. That it is "prepaid" rather than a debit sub-card is **UNCONFIRMED**.

### 1.4 Gift cards and vouchers

- **Isracard GiftCard** (corporate gift, physical) **[primary]** [Isracard – GiftCard](https://www.isracard.co.il/credit-cards/gift-card):
  - "כרטיס זה בתוקף עד למועד הנקוב בו בלבד";
  - good in more than 60 chains, at their physical branches only: "אינו מכובד ברכישה באתרי הסחר ... (אונליין)";
  - no cash and no change: "תתבצע הפחתה של הסכום הטעון בו";
  - "אינו כרטיס חיוב בהגדרתו בחוק הבנקאות (רישוי)";
  - balance by phone (03-6364664) or on the site.
- **Isracard digital gift card** **[primary]** [terms](https://business.isracard.co.il/link/05e1578f563a4079a5b89339fb3a2917.aspx) (undated):
  - "מונפק ע"י ישראכרט בע"מ"; the expiry "מוטבע על גבי הכרטיס";
  - worth "עד לסכום היתרה הטעון בו";
  - Israel only, selected chains, not online unless stated;
  - lost or stolen: "לא יוחלף".
- **BuyMe** vouchers **[primary]** [BuyMe terms](https://buyme.co.il/page/%D7%AA%D7%A7%D7%A0%D7%95%D7%9F%20%D7%94%D7%90%D7%AA%D7%A8):
  - issued by "ביימי טכנולוגיות בע"מ", which is "פטורה מרישיון לפי חוק הסדרת העיסוק בשירותי תשלום";
  - valid "לא פחות מ 60 חודשים", or 24 months for a voucher for a specific product or service;
  - redeemable at the merchants listed for that voucher;
  - lost or stolen: BuyMe will try to restore "היתרה הצבורה".
- **The Consumer Protection Law** **[primary]** [חוק הגנת הצרכן on Nevo](https://www.nevo.co.il/law_html/law00/70305.htm):
  - a "תו קנייה" (good at several businesses for its face value) must print its issue and expiry dates, and is valid **at least five years** (§14ח(א)–(ב));
  - a "שובר מתנה" follows the credit-voucher rules: at least **two years** (§14ז(א)(3), (ד));
  - change in cash for a remainder up to 5% or ₪100 (§14ז(ג)).
- **Newer payment-services regulations** reportedly exempt anonymous, non-reloadable gift vouchers of up to ₪1,500 from the Payment Services Law. They also reportedly allow extension of vouchers above ₪150 to up to 15 years, and require a yearly balance notice above ₪20 plus a reminder a month before expiry **[secondary]** [Calcalist](https://www.calcalist.co.il/shopping/article/rkltxbx8gg). The regulation text was not found (**UNCONFIRMED**).
- **Max and Cal gift cards** (e.g. "גיפט קארד MAX", and mall cards issued through Cal) appear only in press and corporate-gift listings. No issuer terms were found (**UNCONFIRMED**).

---

## 2. What each card carries, and what the issuer shows

### 2.1 Every card, every kind

The issuer must show at least the following, on its site and in its app **[primary]** (D470 §12(1)):

- (א) the issuer's name; (ב) the operating company's name; (ג) the holder's name;
- (ד) "ארבע ספרות אחרונות של המספר המוטבע על הכרטיס או שם הכרטיס";
- (ה)–(ז) the amount last charged, the amount and date of the next charge;
- (ט) the credit limit and its interest;
- (י) per transaction: the amount, the date, instalment details, a flag for a continuing deal, and the merchant's name.

Items (ה)–(ט) describe a monthly bill and do not apply to a debit card. A debit card gets the per-transaction disclosure in §19 instead (§3.1).

Open banking's card-account object adds **[primary]** [cards IG v1.8, Card Account Details](https://www.boi.org.il/media/unpkbtmy/%D7%AA%D7%A7%D7%9F-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-18.zip):

- `maskedPan`;
- `ownerName`;
- `name` / `displayName`;
- `product` ("Product Name of the ASPSP");
- `status` (enabled / blocked / deleted);
- `usage` (PRIV / ORGA);
- `creditLimit`;
- `balances`.

### 2.2 Debit card, field by field

| Field                   | What the sources say                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Holder name             | Printed and shown (D470 §12(1)(ג)). Leumi's card is for "לקוחות בגיל 16 ומעלה". FIBI gives lower limits for teen cards from age 14.                                                                                                                                                                                                                                                                                                                                                          |
| Network                 | Isracard or Mastercard (Isracard Direct, Mastercard Direct); Visa or Mastercard elsewhere. "בינלאומיים" at Hapoalim **[primary]** [Hapoalim summary](https://www.bankhapoalim.co.il/sites/default/files/media/PDFS/credit_card_use_0322.pdf).                                                                                                                                                                                                                                                |
| Last 4 digits           | Shown like any card (D470 §12(1)(ד)).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Expiry                  | Printed; "תוקף הכרטיס הוא עד למועד שצוין עליו". The bank may renew it without a request **[primary]** (Hapoalim summary).                                                                                                                                                                                                                                                                                                                                                                    |
| Linked account          | One shekel account: "החיוב יעשה מהחשבון השקלי בלבד" **[primary]** (Leumi). The bank is the issuer (D470 §2: "כרטיס בנק").                                                                                                                                                                                                                                                                                                                                                                    |
| Charge timing           | **Israel:** "החשבון יחויב באופן שוטף תוך יום עסקים אחד מיום קליטת השובר" (Hapoalim §21.1). **Abroad:** "ביום העסקים הבא לאחר קליטת החיובים מחו"ל" (§21.2). Possibly later "מסיבות ... טכניות" (§21.3). The bank's rule: "יחייב מנפיק את הלקוח בערך יום שידור העסקה" (D470 §17(א)). Mercantile: "ביום ביצוע הרכישה או בסמוך לו". **No billing day.** The billing-date section does not apply (Hapoalim §21.8). The card fee is charged monthly (FIBI form).                                   |
| Authorisation hold      | Each purchase is approved against the balance (Hapoalim §21.6). FIBI holds the approved amount for up to 3 business days, or 7 business days plus 4% for a foreign one ("סכום השימור") **[primary]** (FIBI form).                                                                                                                                                                                                                                                                            |
| Overdraft               | "אם בחשבון הבנק של הלקוח קיימת מסגרת אשראי, ניתן ... להיכנס ליתרת חובה עד לגובה המסגרת" **[primary]** [BOI leaflet](https://boi.org.il/media/2ruhzowm/%D7%A9%D7%95%D7%95%D7%94-%D7%9C%D7%93%D7%A2%D7%AA-%D7%93%D7%91%D7%99%D7%98.pdf). Leumi: approved "בהתאם ליתרה הפנויה בחשבון". The account's overdraft limit (`BankAccountDetails.overdraftLimitMinor`) is what bounds it.                                                                                                              |
| Spending limits         | **Leumi:** ₪5,000 a day (₪400 for a minor), ATM included; ₪2,000 abroad. **FIBI:** ₪5,000 a purchase (₪400 for a minor); ₪10,000 a day; teens 16–18 ₪1,000; 14–16 ₪400 including ATMs. **Hapoalim:** ₪3,000 a purchase "נכון למרץ 2022". **Mercantile:** ₪5,000 a purchase. **Yahav:** ₪10,000 a day, ₪3,000 a purchase (seen 2026-10-08, `banks-others.md` §6.8). All may change "מעת לעת", and the customer may ask for lower ones (Hapoalim §21.5). Each figure is from its source above. |
| Card fee                | Capped at **₪7 a month** from 1.10.2026, a supervised price. It replaces the old 36-month waiver for holders of the same bank's credit card. That waiver runs on in parallel until 1.7.2027 **[primary]** [circular 2851 §9–10, §29, §36(ב)(1)](https://www.boi.org.il/media/0cgabv01/h2851.pdf). Before: Isracard Direct ₪8.50 (T-ISR); Leumi DEBIT ₪7 "regulated" (Leumi tariff, seen 2026-10-08).                                                                                         |
| Per-transaction fee     | None found. The Bank of Israel decided "שלא לכלול את כרטיס החיוב המיידי בשירות 'ניהול חשבון תשלום'" so the bundle does not cost more for people who do not use the card **[primary]** ([circular 2851](https://www.boi.org.il/media/0cgabv01/h2851.pdf); [regulatory report, 21.6.2026](https://www.boi.org.il/media/m4whhvkl/202616.pdf)).                                                                                                                                                  |
| FX fee                  | The bank's card FX fee: 3% "מסכום העסקה" at FIBI (§6.7.1), the same row as its credit cards. Hapoalim applies its FX sections to Direct (§21.2 → §9). Isracard's Postal Direct: 2.9% from 1.1.2026 (seen 2026-10-08, `isracard.md`). **Usual size: about 3%.**                                                                                                                                                                                                                               |
| ATM abroad              | 3% at FIBI (§6.8.1) and Cal (Cal fees). Leumi counts ATM use in its daily cap.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Instalments / קרדיט     | **Not possible.** Hapoalim §21.7 (above); Leumi; Mercantile: "לא ניתן לבצע בו עסקות בהוראות קבע, תשלומים, אשראי". The Bank of Israel lists "עסקאות בתשלומים", deals of unknown amount (car hire) and security deposits (hotel) as not possible **[primary]** (BOI leaflet).                                                                                                                                                                                                                  |
| Standing orders on card | **Not possible** (Hapoalim §21.7, "חיוב הכרטיס על פי הרשאה"; Leumi; Mercantile).                                                                                                                                                                                                                                                                                                                                                                                                             |
| Offline terminals       | Not possible: "לא ניתן לבצע עסקאות במכשיר ידני" (Hapoalim §21.4).                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Digital wallets         | Hapoalim's Direct works "באפליקצי ו ת התשלומים" and in bit. Apple's Israel list includes **Postal Finance**, whose only Isracard card is Direct **[primary]** [Apple – participating banks](https://support.apple.com/en-us/109516), so at least some debit cards work in Apple Pay. Apple adds that "Some cards ... might not be supported". **Per product: UNCONFIRMED.**                                                                                                                  |

### 2.3 Prepaid card, field by field

| Field                        | What the sources say                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Holder name                  | Up Card "אינו נושא שם", and whoever holds it may use it. Natanchik is ordered per child or employee.                                                                                                                                                                                                                                                                    |
| Network, last 4, expiry      | As for any card. Up Card: "תוקף הכרטיס הוא עד למועד שצוין עליו".                                                                                                                                                                                                                                                                                                        |
| Balance shown                | **Yes.** Up Card balance on the sites, by phone and SMS. 2GO at ATMs, by phone, in the app. Open banking: `closingBooked` and `interimAvailable` = "היתרה הנוכחית בכרטיס" for a prepaid card (cards IG v1.8 §6.5).                                                                                                                                                      |
| Loaded from                  | A bank account (Up Card, 2GO). **Or a credit card**: Natanchik's loads count against the loading Isracard credit card's limit, and Cal charges PayBox Young's fee "מכרטיס ההורה".                                                                                                                                                                                       |
| Load caps                    | ₪1,000 per load and on the card (Isracard, Mercantile); ₪4,000 a month and ₪10,000 a year (Isracard).                                                                                                                                                                                                                                                                   |
| Charge timing                | Immediate against the balance. Up Card: "הוראת התשלום תבוצע באופן מידי"; ATM use charged "במועד בו בוצעה הפעולה".                                                                                                                                                                                                                                                       |
| Fees                         | **Card fee:** Cal ₪9.90; PayBox Young ₪7.90; Max ₪19.90; Isracard none for ordering. **Load fee:** Isracard ₪3.5; Mercantile ₪3 / ₪2.70; Cal up to ₪27 (₪2.9 MyCal, ₪12 reloadable); Max pre-paid ₪55 / ₪27, cash card ₪4 / ₪2. **FX:** Cal 3.0% for all cards in 06.2026, against an older 2.8% for "ויזה נטען" (the catalog already marks this conflict UNCONFIRMED). |
| Instalments, standing orders | **Not possible** (Up Card; 2GO).                                                                                                                                                                                                                                                                                                                                        |
| Wallets                      | Natanchik: "גם בארנק הדיגיטלי". 2GO: Apple Pay, Google Pay.                                                                                                                                                                                                                                                                                                             |
| Blocked sectors              | Fuel, hotels, car hire, money transfer and more (Up Card, Natanchik).                                                                                                                                                                                                                                                                                                   |

### 2.4 Gift card, field by field

| Field           | What the sources say                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issuer          | Isracard (GiftCard, digital gift card); ביימי טכנולוגיות (BuyMe); a mall or chain for a "תו קנייה".                                                                                        |
| Network         | Isracard's GiftCard works only at listed chains. Whether it runs on a scheme network is **UNCONFIRMED**. Some mall gift cards are reported to be Cal-issued digital cards **[secondary]**. |
| Last 4          | A physical or digital card has a number; a BuyMe voucher is redeemed by a code. Whether a BuyMe voucher has digits a person could recognise is **UNCONFIRMED**.                            |
| Value / balance | Loaded once ("הסכום הטעון בו"), spent down, no change in cash (Isracard). BuyMe tracks "היתרה הצבורה".                                                                                     |
| Expiry          | Printed (Isracard). At least 60 months (BuyMe). By law at least 5 years for a תו קנייה, and 2 years for a שובר מתנה.                                                                       |
| Where accepted  | A closed list: Isracard ">60 רשתות", physical branches only; BuyMe "כפי שיופיע בעמוד המכירה".                                                                                              |
| Fees            | None to the holder in any source read.                                                                                                                                                     |
| Reloadable      | No. The reported ₪1,500 exemption covers non-reloadable vouchers.                                                                                                                          |

---

## 3. How it appears in data

### 3.1 The bank statement

- **One line per purchase, with the merchant.** "מנפיק יציג כל עסקה, שבוצעה באמצעות כרטיס חיוב מיידי בדף חשבון עובר ושב, בסמוך לאחר ביצועה תוך סימון העסקה כפעולה שבוצעה בחיוב מיידי וכן בציון תאריך ביצוע העסקה, שם הספק ... וסכום העסקה" **[primary]** (D470 §19(א)).
- **A monthly detail page as well.** "בכרטיס חיוב מיידי יגלה המנפיק ללקוח, בדף פירוט חודשי את העסקאות שבוצעו בכרטיס" (§19(ב)). The card company's own app and statement therefore list the same purchases a second time.
- **Contrast a credit card.** Its purchases reach the bank as **one** monthly line, the bill, on the billing date (`src/domain/cards.ts`). That is why credit and debit must not share a "billing" model.
- **Prepaid loads** appear on the bank statement as a transfer to the card (Up Card: "באמצעות חיוב חשבונו בבנק"), or, for Natanchik, as a charge on the loading credit card. The purchases appear only in the card's own statement.

### 3.2 Merchant and MCC

- **Account transactions** in the open-banking standard carry `creditorName`, `bankTransactionCode` and remittance text. They have **no** merchant-category field **[primary]** [IG v1.8 §14.24](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip). `merchantCategoryCode` appears only in §14.29, Card Transactions (same file).
- **Debit card transactions** are reported on the cards endpoint: "התנועות רלוונטיות". The balance is not, "כי היא משתקפת בעו"ש עצמו" **[primary]** (cards IG v1.8 §6.5). So the MCC for a debit purchase comes from the **card company's** feed or statement, not the bank's.
- Whether issuers fill the MCC with real ISO codes is still **UNCONFIRMED** (`2026-10-09-israeli-open-banking-path.md`, open question 6).

### 3.3 Avoiding double counting

A debit purchase can reach Bookandry three ways: typed by hand; from the bank statement, one line marked as immediate debit; and from the card company's statement or feed. Rules:

1. **One purchase, one transaction**, paid with the debit card. It settles on its own date against the card's `accountId`. Nothing is "billed" later, so there is no settlement line to post. This already holds today: `billingDayOf` returns a day only for `credit_card` (`src/domain/cards.ts`).
2. **Bank-statement import:** a line the bank marks as an immediate-debit card purchase (D470 §19(א)) is matched to the household's debit card, by the last 4 digits when the bank prints them, otherwise by the account. It is then imported as a **debit-card expense**, not a separate bank expense. How each bank words the marker is **UNCONFIRMED**; it needs sample statements.
3. **Card-statement import after bank import (or the reverse):**
   - Match on same card, same amount, date within 2 business days (D470 §17(ב) gives the issuer up to 2 business days to pay the acquirer, and Hapoalim debits "תוך יום עסקים אחד"), and a fuzzy merchant name.
   - On a match, **merge**: keep one row, and take the MCC and merchant from the card feed.
   - Never add a second row. Ambiguous matches are shown unticked, as Smart import already does with cards (`CARD_BLOCKING` in `src/domain/import-cards.ts`).
4. **Prepaid loads and unloads are moves, not expenses.**
   - A load on the bank statement, or on Natanchik's loading credit card, is a transfer into the card's pot.
   - The purchases on the card are the expenses.
   - Counting both would double the spending.
   - The credit card's bill still includes the load, so the load must be marked on the credit card as a move, not as spending.
5. **Foreign debit purchases** show in shekels on the bank line, and the original currency and FX fee show on the card line (`originalAmount`, `currencyExchange`, `markupFee` in §14.29). The merged row keeps the card's figures; `MoneySnapshot.feeRate` takes the card's `fxFeeRate`.

---

## 4. The codebase today (read-only check)

### 4.1 What a debit card gets

- **`PaymentMethodType`** has `'credit_card'` and `'debit_card'` and no prepaid or gift (`src/types/domain.ts`).
- **`PaymentMethod.card`** is documented as "Credit cards only".
- **`MethodForm`** writes `card` only when `type === 'credit_card'`. The comment above `CardFields` says "Only for a credit card: nothing else is billed monthly or charges קרדיט". `isCard` and `cardInvalid` are both keyed on `credit_card` (`src/features/cards/method-editor.tsx`).
- **So a debit card is saved as a label and an owner, nothing more.** This is the bug the user reports.
- **Debit cards live under `OtherMethods`** ("Other ways to pay", `newType="debit_card"`). The user's 2026-10-09 decision removes that section.
- **Readers that already accept a debit card:**
  - `feed-rows.tsx` `cardOf` shows the last 4 digits for `credit_card` **or** `debit_card`, but a debit card never has them.
  - `standingViaOf` maps `debit_card` to `'card'` (`src/domain/tx-options.ts`). Banks say a debit card cannot carry a standing order (§2.2), so this should become `'bank'` for debit, or the option should be hidden.
- **`card-draft.ts`** is kind-agnostic. `CardDraft` has every credit field; `DRAFT_KEYS` lists the `CardDetails` keys it manages, and keeps unknown keys on edit.
- **The add-card spec** (`C:/dev/greenback-addcard/docs/superpowers/specs/2026-10-09-add-card-flow-design.md`) covers credit cards only. Decision 6 says "'Add a card' always means a credit card", and §16 puts the other types out of scope. §9.1 adds `CardDetails.issuerName`, which gift cards will need too.

### 4.2 Which catalog tiers and clubs are really debit or prepaid

| Catalog entry                                | Kind                         | Evidence                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| isracard tier `direct` ("Direct / ISRACASH") | **debit**                    | T-ISR 06/2026 lists it as "כרטיס דירקט / ISRACASH (כרטיס חיוב מיידי)" at ₪8.50 (catalog `monthlyMinor: 850`). From 1.10.2026, at most ₪7 (circular 2851).                                                                           |
| isracard tier `digital`                      | **credit** (as far as found) | T-ISR lists "כרטיס דיגיטלי" ₪9.90 among ordinary card fees, with no debit label. That it is a credit card is **UNCONFIRMED**.                                                                                                       |
| cal tier `prepaid` ("נטען")                  | **prepaid**                  | Cal fees: "כרטיס פריפייד (PREPAID)" ₪9.90 (catalog `990`).                                                                                                                                                                          |
| cal tier `paybox_young`                      | **prepaid**                  | Cal fees ₪7.90, charged "מכרטיס ההורה"; a teen wallet card [secondary].                                                                                                                                                             |
| max tier `cash` ("max cash / pre-paid")      | **prepaid**                  | Max tariff: "max cash ו-max pre-paid" ₪19.90, with load fees for both (catalog `1990`).                                                                                                                                             |
| cal club `mycal`                             | **prepaid**                  | Cal fees: "MyCal" load fee ₪2.9.                                                                                                                                                                                                    |
| max clubs `mymax`, `kranot_prepaid`          | **prepaid**                  | MyMAX, a prepaid card for children (`docs/research/issuers/max.md`); "קרנות PRE-PAID" by name.                                                                                                                                      |
| cal clubs `cashcal`, `cashcal_pro`           | credit                       | Cashback cards. Cal fees list "Cash Cal Pro" ₪19.90 among regular cards. "Cash" is not "prepaid" here.                                                                                                                              |
| **missing**                                  | —                            | Isracard **נטענצ'יק** (prepaid); **Mastercard Direct** (debit, FIBI tariff); Isracard **GiftCard**; bank debit cards (Leumi DEBIT, Discount and Mercantile Debit, Mizrahi Cal debit); bank prepaid (Up Card, 2GO, Leumi Cash Card). |

- **The catalog's FX fee and rate logic is credit logic.** `resolveCard` fills `creditPrimeMargin` and `lateRate` for a linked tier. For a `direct` or `prepaid` tier those rates are meaningless.
- **Recommended catalog change:** add `CatalogTier.funding?: 'debit' | 'prepaid'` and `CatalogClub.funding?` (absent means credit). Have the resolver skip the deal and late rates for them. FIBI's file already excludes "the prepaid, digital and debit tiers" from its rate rows (`banks/fibi.ts` header).

### 4.3 Sync and old builds (why the type enum must not grow yet)

- **`paymentMethodSchema.type` is a closed `z.enum`** of nine values (`src/domain/transfer-schema.ts`). `cardSchema.issuer`, `network` and `kind` are closed too.
- **On a pull**, `applyRecord` does `rowSchemas[tbl].safeParse(row)`. On failure the row is **`'rejected'`**. On success it is stored **as received**, unknown keys included (`src/db/sync/apply.ts`).
- **So a new key is safe and a new enum value is not.** A new key on `card` is kept by an older device and survives its edits: `cardFromDraft` keeps unknown keys, per the add-card spec §9.1. A new `type` value hides the whole card from an older device. That device then shows its transactions with an unknown method.
- **An older build's file import** strips unknown keys (spec §9.1). It would fail on an unknown `type`, which is **UNCONFIRMED**: I did not trace `transfer-validate` for whole-file rejection.
- **The precedent is `CashMove.kind`.** It is "a string, not `CashMoveKind`: an older build rejects a row that carries an enum value it does not know, so this table is open from the start, and every sum ignores a kind it does not know" (`src/types/domain.ts`). `mccSource` and `catalog` / `overrides` follow the same rule ("Open on both axes ... must not make this one reject the whole card on a pull").

---

## 5. Recommendation

### 5.1 Debit card: what to store

| Field (`CardDetails` unless noted)                               | Store?               | Notes                                                                                                                                                                                          |
| ---------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `funding: 'debit'` (new, open string)                            | **yes**              | The card's kind (§5.7). `PaymentMethod.type` stays `'debit_card'`.                                                                                                                             |
| `accountId`                                                      | **yes, asked first** | The account it takes money from. It decides where each purchase lands. `bank` takes that account's bank name, as today.                                                                        |
| `bank`                                                           | yes                  | The issuer of a debit card is the bank (D470 §2). Filled from the account.                                                                                                                     |
| `kind`                                                           | `'bank'`             | Always: a debit card is a bank card. Not asked.                                                                                                                                                |
| `issuer` (+ `issuerName`)                                        | yes                  | The company that runs it: Isracard / Cal / Max / other. Narrowed by bank (§1.2). Skippable: it decides only the catalog link.                                                                  |
| `tier`, `catalog`                                                | yes                  | Direct, Mastercard Direct, Debit. The link carries `funding` and the fee.                                                                                                                      |
| `network`                                                        | yes                  | As for credit.                                                                                                                                                                                 |
| `lastDigits`                                                     | yes                  | 4 digits only. It is how bank-statement and card-feed rows find the card.                                                                                                                      |
| `expiresMonth`                                                   | yes                  | YYYY-MM. Never name it `expiry_date`, which `gate:pci` forbids.                                                                                                                                |
| `monthlyFeeMinor`, `feeSince`                                    | yes                  | Hint: "Up to ₪7 a month from October 2026". Charged to the account monthly, not to a bill (§5.5).                                                                                              |
| `fxFeeRate`                                                      | yes                  | Usually about 3%. Snapshotted per purchase as today.                                                                                                                                           |
| `feeDiscount`                                                    | no                   | No spend-based waiver applies to debit. Leumi's PAYBACK excludes DEBIT (`banks-leumi-hapoalim-mizrahi.md`). The old credit-card-holder waiver ends 1.7.2027; the person can type ₪0 meanwhile. |
| `billingDay`, `creditLimitMinor`                                 | **no**               | Neither exists (Hapoalim §21.8).                                                                                                                                                               |
| `creditPrimeMargin`, `creditAnnualRate`, `lateRate`, `overrides` | **no**               | No קרדיט, no instalments, no bill to be late on. Overdraft interest belongs to the account.                                                                                                    |
| Spending limits                                                  | **not now**          | Real, but bank-set, changing "מעת לעת", and used by no calculation. Leave them out of the flow (open question 4).                                                                              |

### 5.2 Prepaid card: what to store

- **Everything in the debit list**, with `funding: 'prepaid'`, and:
  - `kind`: `'bank'` for a bank's card (Up Card, 2GO), `'non_bank'` for a card company's (Natanchik, Cal Prepaid, max pre-paid);
  - `accountId`: the account it is loaded from, when it is;
  - **`loadCardId`** (new): the credit card that loads it (Natanchik, MyCal, PayBox Young). Only a `credit_card` method id;
  - **`loadFeeMinor`** (new): ₪3.5 at Isracard, ₪2.70–₪3 at Mercantile, up to ₪27 at Cal. One figure; the cheapest channel is the person's choice.
- **The balance is not a field.** It lives in a pot, the cash-pot pattern (`src/domain/cash.ts`, spec `2026-10-09-cash-deposit-design.md`):
  - `start`: the balance when the person added the card, asked in the flow;
  - `load` / `unload`: money moved in from the account or loading card, or back out;
  - `count`: a recount that matched, or found or lost money;
  - plus expense occurrences paid with the card.
  - A table like `cashMoves` keyed by the card's id, with `kind` an open string from the start, as `CashMove.kind` is. Or the same table with a `methodId`. Choosing between them is an implementation question.
- **Omitted:** `billingDay`, `creditLimitMinor`, all rates, `feeDiscount`, spending limits. A load cap (₪1,000) is shown as help text, not stored.

### 5.3 Gift card: what to store

| Field                          | Store?            | Notes                                                                                                                                                  |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `funding: 'gift'`              | yes               | `PaymentMethod.type` stays `'debit_card'` until §5.7 step 2.                                                                                           |
| `issuer` / `issuerName`        | yes               | `'isracard'`, `'cal'`, `'max'`, or `'other'` with a name: BuyMe, "קניוני עופר", a chain.                                                               |
| `acceptedAt` (new, short text) | optional          | "60 רשתות של ישראכרט", "BuyMe – ספא". A label, at most 40 characters.                                                                                  |
| `network`                      | optional          | Only when the card shows one.                                                                                                                          |
| `lastDigits`                   | optional          | Only if the card prints a number. **Never the voucher code or PIN.**                                                                                   |
| `expiresMonth`                 | **yes, prompted** | The law and the issuers make expiry the gift card's defining fact. A month is enough for a reminder "a month before" (the reported regulations' rule). |
| Value                          | pot               | `start` = the value received, on the date received. Then spending and counts. No loads: gift vouchers are "not reloadable".                            |
| Fees, account, rates           | **no**            | None apply.                                                                                                                                            |

### 5.4 The add-card flow: kind first

**Step 1 · "Which kind of card?"**

- Four large tiles, each with a one-line hint:
  - **Credit** · "Billed once a month";
  - **Debit** · "Taken from your bank account right away";
  - **Prepaid** · "You load money onto it";
  - **Gift** · "A gift card or voucher with money on it".
- **Help:** "It's printed on the card. A debit or prepaid card says so on its face." D470 §18 makes the mark mandatory.
- **One tap moves on.** Every add entry point opens here: Cards, Smart import, the transaction form. Smart import skips the step when the document says which kind.

**Later steps per kind.** Every kind ends with Review, and Review then Save.

| Credit (unchanged spec) | Debit                                                                                                      | Prepaid                                                                           | Gift                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2 Card company          | 2 **Which account does it take money from?** (household accounts; else a bank list; else "Not in the app") | 2 **Who issued it?** Isracard / Cal / Max / a bank / Other                        | 2 **Who issued it?** Isracard / Cal / Max / BuyMe / Other (name)                |
| 3 Bank                  | 3 **Card company and type**, narrowed by the bank (§1.2); one tap; skippable ("Don't know")                | 3 **Bank** (only if "a bank") and **type**: the catalog's prepaid tiers and clubs | —                                                                               |
| 4 Type and club         | 4 **Your card**: last 4, valid until, network, colour, whose                                               | 4 **Your card**: last 4, valid until, network, colour, whose                      | 3 **Your card**: last 4 (optional), **valid until**, where it's accepted, whose |
| 5 Your card             | 5 **Fees**: card fee a month (hint ₪7), FX fee; catalog-filled when linked                                 | 5 **Money in**: loaded from (an account or a credit card); **balance now**        | 4 **Value**: the amount on it, and the date received                            |
| 6 Billing               | —                                                                                                          | 6 **Fees**: card fee a month, load fee, FX fee                                    | —                                                                               |
| 7 Fees and interest     | —                                                                                                          | —                                                                                 | —                                                                               |

- **The kind can be inferred and corrected.**
  - If the person chose Credit and then picks a tier or club whose catalog `funding` is debit or prepaid (Isracard Direct, Cal Prepaid, max cash, MyCal, MyMAX), the flow switches kind. It shows one line, "This is a debit card. It's taken from your account, not billed monthly", with "Undo".
  - The billing and interest steps drop out, and the account step is added.
  - The reverse also holds: a debit kind with a credit tier is impossible, because debit only lists debit tiers.
- **Name suggestions:**
  - debit: "Isracard Direct ·1234 · Hapoalim";
  - prepaid: "נטענצ'יק ·5678";
  - gift: "BuyMe · עד 03/31".
- **Duplicate warning** as in the spec, keyed on kind + company + last 4.
- **"Finish setting up"** for a debit card without an account, because the account is what makes its purchases land in the right place. Also for a prepaid or gift card without a balance.
- **Existing `debit_card` rows** from "Other ways to pay" move to the Cards screen with the nudge. They have no `card` object, which reads as "debit, nothing set".

### 5.5 Balance maths per kind

- **Credit:** unchanged. Purchases settle on the billing day; the bill lowers the account.
- **Debit:**
  - A purchase lowers the balance and the linked account **on its date**. `settleDate` already returns the occurrence date for any method without a billing day.
  - The card fee is a monthly expense on the account: generated like `cardFeeOccurrences`, but dated in the month, not on a bill.
  - An overdraft is the account's business (`overdraftLimitMinor`).
  - The Bank accounts panel lists the card under its account. It already filters cards by `card.accountId`; it needs only to show "Debit" and no upcoming bill.
- **Prepaid:** like cash.
  - The pot is **part of** the balance. A load or unload moves money between the account and the pot and leaves the balance unchanged.
  - Spending with the card lowers both. Load fees and the card fee are expenses from the account, or from the loading card.
  - When a credit card loads it, the load sits on that card's bill as money moved, not spent. The bill still lowers the account on the billing day, and the pot rose on the load day.
  - So the balance dips only once, when the money is spent from the pot. Until the bill, the credit card's bill shows the load as owed.
- **Gift (recommended): its own pot, outside the balance.**
  - The money was never the household's to spend freely. Counting a ₪500 mall card as balance would overstate what can pay rent.
  - Spending with a gift card is recorded, so categories show what was bought, but it does not lower the balance. The gift's value was never in it.
  - The Cards screen shows the remaining value and the expiry.
  - The alternative (open question 1) is to count the gift as income into the pot, as cash income is counted.

### 5.6 Never stored

Bookandry never stores any of these:

- the full card number, CVV/CVC or PIN (unchanged; `gate:pci`);
- a gift voucher's code, barcode or PIN: whoever holds it can spend it;
- bank or card-company logins.

**Suggestion:** extend `gate:pci`'s pattern with `voucher_?code|gift_?code|redeem_?code` so no such field can be added, in the same way the existing pattern covers card numbers.

### 5.7 The data model change, in two steps

1. **Now: no new `PaymentMethodType`.**
   - Debit, prepaid and gift cards are `type: 'debit_card'` with a new **open-string** `card.funding`. It is `z.string().min(1).max(20).optional()`, never a `z.enum`, like `mccSource`.
   - Absent on a `debit_card` means `'debit'`; absent on a `credit_card` means `'credit'`; any unknown value means "a card, charged at purchase".
   - Every reader that cares (`billingDayOf`, `standingViaOf`, the pot sums) branches on `funding` and ignores values it does not know.
   - An older build reads a prepaid or gift card as a debit card. It settles purchases on their date, which is right for the card's own money, and it simply lacks the pot. Sync keeps `funding`. An older file import strips it, so the card becomes a plain debit card. Nothing is rejected.
   - The new keys (`loadCardId`, `loadFeeMinor`, `acceptedAt`, `issuerName`) are optional `cardSchema` fields, so they are equally safe.
   - The pot table's `kind` is an open string from the start.
2. **In the same release: open `type` for the future.**
   - Change `paymentMethodSchema.type` from `z.enum([...])` to "a known value, or any other short string", in the shape of `overrideTerm`'s union, and map an unknown type to `'other'` everywhere it is read.
   - Do **not** write a new type value until a release with this change has reached every device. If `'prepaid_card'` or `'gift_card'` ever become real types, a later release can migrate `funding` rows. By then an older build will keep the row instead of rejecting it.

---

## Open questions

1. **Is a gift card part of the balance?** The recommendation keeps it out (§5.5). The user may prefer it in, counted as income when received, the cash way.
2. **Should debit cards store spending limits?** They are real (Leumi ₪5,000 a day; FIBI ₪5,000 a purchase and ₪10,000 a day) but bank-set and changing, and no figure in the app uses them. A teen card's limit might be worth showing. If yes: one optional `dailyLimitMinor`, never asked in the add flow.
3. **How each bank marks a debit purchase on its statement.** D470 §19(א) requires a mark, but the wording ("כרטיס דביט", "דיירקט", the last 4 digits?) needs sample statements from Hapoalim, Leumi, Discount, Mizrahi and FIBI before Smart import can match it.
4. **Which company runs Leumi's and Discount's debit cards, and on which network.** The pages do not say.
5. **Whether One Zero issues a debit card at all.**
6. **Isracard's "דיגיטלי" tier.** The fee schedule does not mark it as debit, so it is treated as credit. Confirm what it is.
7. **Whether Isracard Direct (and debit cards generally) can be added to Apple Pay and Google Pay**, product by product. Apple's list implies at least Postal Finance's Direct.
8. **The text and start date of the payment-services regulations on gift vouchers**: the ₪1,500 exemption, the 15-year extension and the ₪20 notice. Only press was found.
9. **The current consolidated text of חוק כרטיסי חיוב** on Nevo or gov.il, and how much of it the Payment Services Law, 2019 has superseded for debit and prepaid cards. Only Directive 470's definitions and the 1998 amendment were read.
10. **Whether a gift voucher like BuyMe has any printed digits** worth keeping as "last 4", or only a code that must never be stored.
11. **Prepaid FX fee at Cal**: 2.8% (2018 notice) or 3.0% (06.2026 schedule). This is already flagged in the catalog.
12. **How an older build's file import treats an unknown `type`**: the whole file, or the row? `transfer-validate.ts` was not traced.
