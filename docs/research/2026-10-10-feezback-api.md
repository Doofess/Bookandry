# Feezback's open-banking API: can Bookandry use it for live bank and card data?

Date: 2026-10-10. Every source below was opened on this date (the "seen" date) unless the line says otherwise. Where a source carries its own date or version, it is given next to the link. Feezback's documentation pages carry an `updatedAt` stamp; it is given as "page updated …".

Scope: Feezback's developer documentation, read in full from its own index ([llms.txt](https://docs.feezback.cloud/llms.txt): 97 pages, all downloaded and read, including the OpenAPI definitions behind the API reference), its marketing site, terms and privacy pages, its bank list and outage feeds, its status page, and press. The question is whether Bookandry, a Hebrew-first household money app on Supabase and Cloudflare, can use Feezback to show a household's real, live bank and card data, and what it would take.

**How to read this.** Every claim has its source next to it. **[primary]** marks Feezback's own documentation, site or files, a law, or a regulator's document. **[secondary]** marks press, company databases and other third parties. **UNCONFIRMED** marks anything no primary source here establishes. Hebrew is quoted as the source writes it. This builds on [`2026-10-09-israeli-open-banking-path.md`](2026-10-09-israeli-open-banking-path.md) ("the path doc"), which covers the law; its section numbers are cited as "path doc §…". This is research, not legal advice.

The test identities on Feezback's Mock Bank page are described, not copied.

---

## 0. Summary

**Can Bookandry use Feezback now? No.** Feezback's own documentation says so in as many words: **"Only organizations licensed for providing third party data services may get open banking financial data. If you are not licensed, you can still get a credit-score, but not access full financial data"** **[primary]** [Introduction to Open Banking Data, page updated 2026-09-07](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). Its error catalogue has a code for exactly this case: `1010 NOT_TRUSTED_CUSTOMER_VALIDATION_FAIL`, "Customer validation failed for a client without a license" **[primary]** [Feezback Links error scenarios](https://docs.feezback.cloud/docs/error-handling-1). This matches the law: a licensed aggregator may pass data on only to another licensed provider (path doc §1.1, law §29(א)(3)).

**What blocks it.**

1. **Bookandry's own ISA licence**, of the "use of data collected by another" type (path doc §1.2, §5 Option A). No "licence as a service", agent, sub-provider or white-label route appears anywhere in Feezback's docs, terms or site (§2).
2. **A technical gap, smaller and fixable.** Feezback accepts calls only from whitelisted source IPs **[primary]** [Security](https://docs.feezback.cloud/docs/security), and Supabase Edge Functions have no static outbound IP **[primary]** [Supabase troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0). Bookandry would need a fixed-IP egress proxy (§5.2).

**What Feezback is good for once licensed.** One integration covers all the large banks (Leumi, Hapoalim, Discount, Mercantile, Mizrahi, the FIBI group, Yahav, Pepper) and Isracard, Amex, Cal and Max **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). It pulls only through the regulated open-banking APIs, never by scraping (§1.3). It adds a Hebrew category, a standard merchant name, recurring and duplicate flags and a stable transaction id to each transaction (§3.5). Card transactions carry the standard's `merchantCategoryCode`, merchant name, original currency, exchange rate, FX fee and masked card number, when the issuer fills them (§3.4).

**"Real time", in Feezback's terms.** There is no "new transaction" push. Webhooks cover consent status, the first data pull, consent expiry, a TPP-wide "refresh complete" and monthly life-event triggers (§3.6). Fresh data comes from calling the data API, which by default refreshes from the bank on the call **[primary]** [Retrieving data](https://docs.feezback.cloud/docs/data-aggregation-and-enrichment). The Bank of Israel caps how stale that may be at 30 seconds behind the bank's own site, and background refreshes at about four a day per consent (path doc §3.2, §4.4). So "real time" for Bookandry means as fresh as the bank's own app whenever the person opens Bookandry, plus a few background refreshes a day.

**Cost of a 10-tester pilot.** No Feezback price is public anywhere: not on its site, its docs, its terms or in press (§4). The sandbox (Mock Bank on the integration environment) needs an account from Feezback; its price is not stated. Real-bank data for 10 households is production data. It needs Feezback's production onboarding and, per Feezback's own docs and the law, Bookandry's own licence. **The blocker for a pilot is the licence, not the price** (§4.1).

**Recommended next step.** Send Feezback the inquiry in §4.4 (Hebrew and English drafts included). Ask above all whether it will open its integration environment to an applicant that has no licence yet, and what a ~10-household pilot would cost after licensing. Ask Open Finance the same; it publishes slightly more (§4.5). In parallel, keep the path doc's plan: Smart import now, and counsel on the "use only" licence before any money is spent. A Mock Bank prototype (§5.4) is worth building only once Feezback has given an integration account.

---

## 1. What Feezback is

### 1.1 Company and licence

- **Licences, by its own account.** "Feezback operates under two authorizations from the Israel Securities Authority": a **Financial Information Service License** under the Financial Information Service Law, 5782-2021, and a **Basic Payment Initiation Approval** under the Payment Services and Payment Initiation Services Law, 5783-2023 **[primary]** [Overview, page updated 2026-09-01](https://docs.feezback.cloud/docs/overview). The site says: "פיזבק מחזיקה ברישיון מתן שירות מידע פיננסי ואישור לייזום תשלומים, כמו כן פיזבק עומדת בתקן 27001 ISO" **[primary]** [feezback.com](https://feezback.com/). Its consent screen says "פיזבק טכנולוגיות הינה בעלת רישיון ומפוקחת על ידי רשות ניירות ערך" **[primary]** [Feezback presentation, p. 3, embedded in the docs](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf) ("the presentation").
- **On the ISA register.** "Feezback Technologies" holds all three service types, **may pass data to another licensed provider (§29(א)(3))**, and holds payment initiation; licensed **07.02.2023** **[primary]** ISA register, read 2026-10-09 (path doc §2.1). Press dated 15.2.2023 reports the same licence **[secondary]** [ice.co.il](https://www.ice.co.il/digital-140/news/article/935381). The ISA's HTML pages block plain fetches, so the register was not re-read today.
- **Its own reading of the law.** Feezback's docs set out two tracks (a full ISA licence, or an approval from one's own regulator for banks, insurers and the like) plus the §3(א) exemption for a financial body receiving data for a defined purpose. They conclude: "there is no third path to lawfully collecting a customer's financial data in Israel" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data).
- **Company.** Feezback Technologies Ltd, founded 2015–2016 by Keren Zukerman (CEO) **[primary]** [feezback.com](https://feezback.com/). It ran a consumer app from 2016 with 70,000 users, then "שינינו את המודל העסקי" to serve businesses; Discount, IBI and Isracard are named clients, and Isracard is "the largest investor" **[secondary]** [Globes, 6.8.2022](https://www.globes.co.il/news/article.aspx?did=1001420274). A company database lists a $2.5M Series A led by Isracard (Aug 2022) and a headcount of 8 (13 in another field of the same page) **[secondary]** [startupim, last updated 2026-08-22](https://startupim.com/company/feezback-technologies).
- **Who it serves.** Lenders, investment houses, insurers and payment flows. Its site lists three uses: payment initiation, "חיתום וסיכוני אשראי" and "ניהול פיננסי מתקדם" (portfolio analysis and risk allocation) **[primary]** [feezback.com](https://feezback.com/). The docs' data products are aimed at "risk decisioning and financial offers" **[primary]** [Overview](https://docs.feezback.cloud/docs/overview). Named users include Altshuler Shaham (deposits into provident funds) **[secondary]** [Bizportal](https://www.bizportal.co.il/capitalmarket/news/article/825832) and Interactive Israel (deposits to trading accounts) **[secondary]** [inter-il.com](https://www.inter-il.com/deposit/). A household budgeting app is not among its stated uses, though "Financial dashboards for your users" is listed as a use of the data **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data).

### 1.2 Coverage

Feezback's table of supported data providers, all with private and business accounts **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data):

| Source                          | Covered                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Leumi (10), and Pepper          | yes                                                                                                                     |
| Hapoalim (12)                   | yes                                                                                                                     |
| Discount (11), Mercantile (17)  | yes                                                                                                                     |
| Mizrahi-Tefahot (20)            | yes                                                                                                                     |
| FIBI group (14, 26, 31, 46, 52) | yes: Otsar HaHayal, U-Bank, FIBI, Massad, PAGI                                                                          |
| Yahav (04)                      | yes                                                                                                                     |
| Cal                             | yes                                                                                                                     |
| Isracard                        | yes                                                                                                                     |
| Max                             | yes                                                                                                                     |
| Amex                            | yes                                                                                                                     |
| **Diners**                      | **not named anywhere.** Diners is issued by Cal (path doc §3.1). **UNCONFIRMED** whether it comes through Cal's consent |
| Jerusalem (54), Igud (13)       | listed as codes in the API's `aspspCode` enum, but not in the table, the bank list or the status page. **UNCONFIRMED**  |
| One Zero                        | not listed anywhere. **UNCONFIRMED**                                                                                    |

Supporting evidence:

- **The API's own codes.** `aspspCode` lists the banks plus **`10023` כאל, `10033` מקס, `12002` ישראכרט, `12011` אמריקן אקספרס** **[primary]** [API reference: Reads user's cards, Aggregate Data API 2.4.0, page updated 2026-07-22](https://docs.feezback.cloud/reference/getlistofcards).
- **The bank list** has the twelve bank codes above (04, 10, 10P, 11, 12, 14, 17, 20, 26, 31, 46, 52) with branches, and no card companies **[primary]** [bank-list.json](https://fb.feezback.cloud/bank-list.json).
- **The status page** monitors Discount, Leumi, Yahav, Beinleumi, Hapoalim, Mercantile, Pepper, Mizrahi, Isracard, Max and Cal. On 2026-10-10 it showed "ASPSP APIs: Degraded Performance", with Mizrahi degraded and an open incident "Mizrahi bank fails to return OB RTP status" (18.9.2026, a payments issue) **[primary]** [status.feezback.cloud](https://status.feezback.cloud/).
- **The live issues feed**, read today, carried notes only of "info" severity. For Discount and Mercantile data consents it said: "יש להזין את מספר החשבון העדכני (לפחות 6 ספרות) כפי שמופיע באפליקציית הבנק שלכם". For Leumi on mobile: make sure the bank's app "אינה פתוחה ברקע" **[primary]** [aspsp_issues.json](https://fb.feezback.cloud/aspsp_issues.json).

### 1.3 Where the data comes from

- **Regulated APIs only.** "Feezback pulls data exclusively through each institution's official open banking API. It never uses a customer's bank username or password, and never scrapes bank websites or apps" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data).
- **The API is the Bank of Israel standard, re-served.** The Aggregate Data API's OpenAPI definition is "based on document by The Berlin Group", and its descriptions carry the Bank of Israel's "BOI-REMARK" notes verbatim **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent).
- **Feezback's own layer.** Enrichment (category, standard name, flags), insights and the credit score are computed by Feezback from that data (§3.5). Fields a source returns outside the Bank of Israel guidelines are passed in `_extra` ("Additional fields that the ASPSP returned but don't comply with BOI's guidelines") **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent).
- **Non-bank sources.** The overview speaks of "supported extended financial data sources", and the docs mention pension funds and insurers as consent targets **[primary]** [Overview](https://docs.feezback.cloud/docs/overview); [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). Which of these are live is **UNCONFIRMED**.

---

## 2. The client model: does Bookandry need its own licence?

**Yes, by Feezback's own documentation.** The answer to the question this report exists for:

> **"Only organizations licensed for providing third party data services may get open banking financial data. If you are not licensed, you can still get a credit-score, but not access full financial data."**
> **[primary]** [Introduction to Open Banking Data, page updated 2026-09-07](https://docs.feezback.cloud/docs/introduction-to-open-banking-data)

and

> **`1010` `NOT_TRUSTED_CUSTOMER_VALIDATION_FAIL`**: "Customer validation failed for a client without a license." Action: "Ensure your customer account has the proper licensing, or contact support for verification."
> **[primary]** [Feezback Links error scenarios](https://docs.feezback.cloud/docs/error-handling-1); listed among the errors that "require Feezback action" in [Error Handling](https://docs.feezback.cloud/docs/error-handling)

What else was looked for, and what was found:

| Model                                         | Found?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Licence as a service", agent, sub-provider   | **No.** Not in the docs, terms, privacy policy or site. The docs' law section rules out "a third path" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). The ISA directive requires the licensee to do "הפעילות המהותית" itself (path doc §2.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| White-label consent screen                    | **Partly.** Feezback hosts the consent screens; a client may "customize the page color and add your logo" **[primary]** [Integration Overview](https://docs.feezback.cloud/docs/onboarding), and hide the data-basket picker (`hideDataBaskets`) **[primary]** [Consent link configuration guide](https://docs.feezback.cloud/docs/consent-link-configuration-guide). But the **bank's** screen names the recipient as Feezback: "ביקשת להעביר מידע ל-Feezback Technologies Ltd" **[primary]** [the presentation, p. 3](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf). Branding is cosmetic; the regulated party stays Feezback. |
| Onward transfer to the client, in the consent | **Yes, and it is how data reaches a client.** Feezback's consent screen has a checkbox: "אני מאשר\ת שקראתי ואני מסכים\ה לתנאים ומאשר\ת את העברת מידע לגופים הבאים לצורך מתן הצעות לשירותים חברה לדוגמא בע״מ" **[primary]** [the presentation, p. 3](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf). "For offers of services" is the wording of a transfer to a financial body under §29(א)(1). A budgeting app is not a financial body, so it would receive data under §29(א)(3), as a licensed provider (path doc §1.1).                                                                                                         |
| Feezback's own end-user screens               | **Yes, but not a consumer app.** A consent link for a user who already has a valid consent opens a Feezback "ניהול הסכמות" page to view, renew, edit and cancel consents **[primary]** [the presentation, p. 7](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf); a deletion reason reads "The end user terminated consent in feezback's management screen" **[primary]** [API reference: consent details](https://docs.feezback.cloud/reference/getconsentdetails). Feezback moved from its own consumer app to serving businesses by 2022 (§1.1).                                                                                 |
| Hosted "VIEW" dashboard                       | **Exists, branded per client.** A link (`srv: "view/user"`) opens a Feezback-hosted dashboard of a user's insights, valid 30 minutes; "it's a themeable surface" **[primary]** [Insights Report](https://docs.feezback.cloud/docs/view-report). The same consent also releases the insights as JSON to the client, so it is not a way to keep data away from an unlicensed client. Whether Feezback would offer **dashboard-only, no data to the client** to an unlicensed app is **UNCONFIRMED**. It would not feed Bookandry's own ledger in any case.                                                                                                                                                                                                                                                                                                                                                 |
| Credit score without a licence                | **Yes, but irrelevant.** The one product the docs offer unlicensed clients is the Feezback Score (an underwriting number out of 762, a band and a credit amount) **[primary]** [Feezback Score](https://docs.feezback.cloud/docs/credit-score). It carries no transactions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Terms that govern a client                    | **Not public.** The site's terms cover the website only, and say "FeezBack איננה סוכנת, משווקת, יועצת או מתווכת של שירותים בנקאיים ו/או פיננסיים" **[primary]** [תנאי שימוש](https://feezback.com/%d7%aa%d7%a0%d7%90%d7%99-%d7%a9%d7%99%d7%9e%d7%95%d7%a9/). The client agreement is behind "legal and production requirements" in onboarding **[primary]** [Integration Overview](https://docs.feezback.cloud/docs/onboarding).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Conclusion.** Bookandry cannot receive transactions or balances from Feezback without its own ISA licence. Feezback says so and enforces it. The narrow open question is whether Feezback would give an **applicant** integration-environment access (Mock Bank only, no real data) before the licence is granted. That is a commercial question; the docs say only "Don't have an account? Contact support@feezback.com" **[primary]** [Getting Started](https://docs.feezback.cloud/docs/getting-started).

---

## 3. The API

### 3.1 Authentication

- **Two JWTs, kept apart** **[primary]** [Security, page updated 2026-08-16](https://docs.feezback.cloud/docs/security):
  1. **The client's JWT.** Signed on the client's backend with its own private key and posted to the Link Generation Service (LGS) at `/link` or `/token`. Algorithms: "RS512, ES256, or EdDSA". The environments page and the error checklist say RS512 only **[primary]** [Configuring Environments & Security](https://docs.feezback.cloud/docs/environments-and-security); [Error Handling](https://docs.feezback.cloud/docs/error-handling). Use RS512.
  2. **Feezback's bearer token.** Returned by `/token`, signed by Feezback with EdDSA, sent as `Authorization: Bearer` on every data call. "The returned bearer token is valid for 600 seconds" **[primary]** [Retrieving data](https://docs.feezback.cloud/docs/data-aggregation-and-enrichment).
- **Claims.** `iss` = `tpp/{TPP_ID}`; `sub` = the user (no PII: "Apply hashing for PII values"); `srv` selects the product (`ais/user` for a consent link, `ais/tpp` for a data token, `view_ais/user`, `view/user`); `iat`, `exp`, `ttl` on token flows. `/link` JWTs need `"encrypt": true` at the top level **[primary]** [Configuring Environments & Security](https://docs.feezback.cloud/docs/environments-and-security); [Consent link configuration guide, page updated 2026-09-23](https://docs.feezback.cloud/docs/consent-link-configuration-guide).
- **Encrypted responses.** "Every token Feezback returns to you from Link Generation Service is encrypted": JWE, RSA-OAEP-256 and A256CBC-HS512 **[primary]** [Security](https://docs.feezback.cloud/docs/security). Which key decrypts it (one Feezback issues, or the client's own) is not stated. **UNCONFIRMED**.
- **Keys per environment.** In integration, the private key is generated in Feezback's admin platform; for production "you must generate your own private key and send Feezback the matching public key". Integration and production use separate keys **[primary]** [Getting Started, page updated 2026-07-26](https://docs.feezback.cloud/docs/getting-started); [Configuring Environments & Security](https://docs.feezback.cloud/docs/environments-and-security).
- **IP whitelisting is mandatory.** "Calls from an unregistered IP are rejected even with valid credentials" **[primary]** [Security](https://docs.feezback.cloud/docs/security).
- **No mTLS or certificates on the client side.** Feezback holds the Gov CA certificates and talks mTLS to the banks. The client never handles a QWAC or QSealC. Feezback can present a client certificate to the client's **webhook** endpoint if asked (§3.6).

### 3.2 Environments and sandbox access

| Purpose                 | Integration                          | Production                        |
| ----------------------- | ------------------------------------ | --------------------------------- |
| Link and token (LGS)    | `https://lgs-integ01.feezback.cloud` | `https://lgs-prod.feezback.cloud` |
| Data and payments (TPP) | `https://integ01-tpp.feezback.cloud` | `https://prod-tpp.feezback.cloud` |

**[primary]** [Configuring Environments & Security](https://docs.feezback.cloud/docs/environments-and-security). Admin platform: [collect.feezback.cloud](https://collect.feezback.cloud/).

- **Getting in.** "Get your Feezback login credentials from your organization. Don't have an account? Contact support@feezback.com". Then: log in, read the `TPP_ID`, generate a key, whitelist backend IPs, set a webhook address **[primary]** [Getting Started](https://docs.feezback.cloud/docs/getting-started). There is no self-serve sign-up.
- **What the sandbox is.** The integration environment runs against **Mock Bank** (bank code, branch and account number given in the docs). Different test ID numbers produce a valid consent with all account types, a partially authorised consent, one that becomes valid after 5 minutes, a rejection, and a delayed creation response **[primary]** [Testing & Mock Bank, page updated 2026-08-17](https://docs.feezback.cloud/docs/testing-and-mock-bank). No real bank's sandbox sits behind it. What data Mock Bank returns (cards, MCCs, pending) is **UNCONFIRMED**.
- **Going live.** "Submit a production env. request through our customer service portal. We recommend submitting legal and production requirements at the begging of the integration". Then production testing with real accounts, then go-live **[primary]** [Integration Overview, page updated 2026-08-17](https://docs.feezback.cloud/docs/onboarding).
- **Support.** A Jira service desk, open to a client's email domain once Feezback sets it up **[primary]** [Support](https://docs.feezback.cloud/docs/support-and-escalation).

### 3.3 The consent flow

**Steps** **[primary]** [Open Banking Account Connection (AIS), page updated 2026-08-19](https://docs.feezback.cloud/docs/open-banking-data):

1. The backend signs a JWT (`srv: "ais/user"`) naming the account types (`CACC`, `CARD`, `LOAN`, `SVGS`, `SCTS`), the data baskets (`ACCOUNTS`, `BALANCES`, `TRANSACTIONS`), the offered consent periods, redirects and an optional `context` (echoed on webhooks, up to 50 characters).
2. It posts it to `/link` and gets a link (valid 30 minutes by default, 24 hours at most).
3. The user opens it: Feezback's screens ask for the bank, private or business, the ID type and number, then the account types, baskets and period.
4. The user is redirected to the bank's site or app, logs in there, and approves.
5. A webhook reports the final status; then data can be read.

**The screens**, as Feezback shows them **[primary]** [the presentation, p. 3](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf):

- **"מתן הרשאה"**: "מאיפה לשתף את המידע?", "החשבון שלך באתר עסקי או פרטי?", "מהו אמצעי הזיהוי שלך…?", then "אילו סוגי מידע לשתף…?", "אילו סלי מידע?" and "למשך כמה זמן לשתף את המידע?" (יום אחד, 3 חודשים, 6 חודשים, שנה).
- **The bank's own screen**: "ביקשת להעביר מידע ל-Feezback Technologies Ltd", the validity date, and "על אילו חשבונות ברצונך להעביר מידע?", including joint accounts.

**Rules worth knowing:**

- **One ID per consent, one consent per institution.** "Consent is related to one user-id (ת.ז.)… If the ID and bank login credentials don't match - the consent process will fail". "Every institution the person connects requires its own consent flow" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data).
- **The ID number.** `userIdentifier` (ID or passport) is optional. Without it, "the debtor will be prompted to fill out their ID (you will receive it with the webhook at the end of the process)". It is mandatory if `userWasAuthenticated` is true **[primary]** [Consent link configuration guide](https://docs.feezback.cloud/docs/consent-link-configuration-guide). The financial-events webhooks carry `psuId`, "תעודת הזהות של בעל ההסכמה" **[primary]** [Financial Events Triggers](https://docs.feezback.cloud/docs/financial-events-triggers). So Bookandry would receive ID numbers even if it never asks for them.
- **Lifetime.** `timePeriods`: up to four of `ONE_DAY`, `ONE_MONTH`, `TWO_MONTHS`, `THREE_MONTHS`, `SIX_MONTHS`, `TWELVE_MONTHS`, `ONE_YEAR_SIX_MONTHS`, `TWO_YEARS`, `THREE_YEARS`. "The maximum period is 3 years. After the consent period is over, the user will need to grant a new consent" **[primary]** [Consent link configuration guide](https://docs.feezback.cloud/docs/consent-link-configuration-guide). This matches the law's three-year cap; there is no 90- or 180-day bank re-authentication (path doc §4.3).
- **Renewal.** `ConsentAboutToExpire` fires "up to 30 days before a consent's `validUntil`" **[primary]** [Webhooks Events Catalog, page updated 2026-09-07](https://docs.feezback.cloud/docs/webhooks-events-catalog). Consent details carry `_meta.isAboutToExpireSoon` (within two weeks) and `isContinuation` marks a consent that continues an earlier one **[primary]** [API reference: consent details](https://docs.feezback.cloud/reference/getconsentdetails); [Consents / Insights Data Webhook](https://docs.feezback.cloud/docs/ais-view-insight-data-webhook). Re-sending a consent link for the same `sub` opens Feezback's consent management page, with "חידוש הרשאה" for an expired one **[primary]** [the presentation, p. 7](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf).
- **Inactivity.** `ConsentNotAccessed`: "A consent has been revoked due to inactivity of over 6 months" **[primary]** [Webhooks Events Catalog](https://docs.feezback.cloud/docs/webhooks-events-catalog). Another page calls it only "a nudge" **[primary]** [Consents / Insights Data Webhook](https://docs.feezback.cloud/docs/ais-view-insight-data-webhook). The deletion reasons include "Non usage for 6 months" **[primary]** [API reference: consent details](https://docs.feezback.cloud/reference/getconsentdetails). Read it as revocation.
- **Revocation.** The user can revoke "at any time; your backend is notified of the change and access stops immediately" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). It can happen in Feezback's management screen, in the bank's app ("את ההרשאה למידע ניתן לבטל בכל זמן כאן או באפליקציה של הבנק", the presentation p. 3), or by the client: `DELETE /tpp/v1/users/{userId}/consents/{consentId}` sets `terminatedByTpp`, with an optional `reason` **[primary]** [Consent status updates, page updated 2026-08-13](https://docs.feezback.cloud/docs/consent-status-updates).
- **Statuses.** `received`, `valid`, `rejected`, `expired`, `revokedByPsu`, `revokedByAspsp`, `terminatedByTpp`, `suspendedByASPSP`, `partiallyAuthorised` ("requires additional approval from joint account holders"), `waitingForInitialFetch`, `initialFetchFailed`, `failed`, and `noAnswer` (no answer from the bank in two weeks) **[primary]** [Consent status updates](https://docs.feezback.cloud/docs/consent-status-updates); [Consents / Insights Data Webhook](https://docs.feezback.cloud/docs/ais-view-insight-data-webhook). The docs spell it both `partiallyAuthorized` and `partiallyAuthorised`; parse both.

### 3.4 Endpoints and fields

**Endpoints.** All under `/tpp/v1/users/{userId}` (where `userId` is `{sub}@{tpp_id}`), with transactions on `/tpp/v2/…` **[primary]** [Retrieving data, page updated 2026-08-19](https://docs.feezback.cloud/docs/data-aggregation-and-enrichment):

| Resource          | Person-level list                 | Per consent and resource                                                                   |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| Consents          | `/consents` (`withInvalid`)       | `/consents/{consentId}`, `DELETE` to terminate; `DELETE /consents` deletes the user's data |
| Current accounts  | `/accounts` (`withBalances`)      | `/consents/{c}/accounts/{id}`, `…/balances`, v2 `…/transactions`, v2 CSV export            |
| Cards             | `/cards`                          | `/consents/{c}/cards/{id}`, `…/balances`, v2 `…/transactions`                              |
| Loans             | `/loans`                          | `/consents/{c}/loans/{id}`, `…/balances`, v2 `…/transactions`                              |
| Savings, deposits | `/savings`                        | `/consents/{c}/savings/{id}`, `…/balances`, v2 `…/transactions`                            |
| Securities        | `/securities`                     | `/consents/{c}/securities/{id}`, v2 `…/transactions`, `…/orders`, `…/positions`            |
| Insights (VIEW)   | `/insights`                       | —                                                                                          |
| Deletion schedule | `GET /tpp/v1/data-deletion-tasks` | —                                                                                          |

"Call the person-level endpoints… and Feezback returns data from every valid consent that person holds, combined" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). The API reference documents only the v1 transaction paths; the v2 ones are described only in the guide. **UNCONFIRMED** whether v2's schema differs beyond paging and ids.

**Card list** (`/cards`) **[primary]** [API reference: Reads user's cards](https://docs.feezback.cloud/reference/getlistofcards):

- **Identity.** `resourceId`, `consentId`, `consentStatus`, `aspspCode`, `maskedPan` (required, e.g. "123456xxxxxx1234"), `currency`, `ownerName`, `name` ("credit card company - the name of the card holder"), `displayName`, `product` (the issuer's own product name), `status`, `usage` (`PRIV` or `ORGA`).
- **Credit.** `creditLimit`, and `details`, free text that may give "characteristic of the creditLimit level" and "characteristic of the monthly billing date".
- **Balances.** `closingBooked` (for cards: "invoiced, but not yet paid entries"), `expected`, `openingBooked`, `interimAvailable`, `interimBooked`, `forwardAvailable` and **`nonInvoiced`**, each with `referenceDate`.
- **Freshness.** `asOf`, `asOfBalances`, `asOfTransactions`.
- **Who serves what.** For a bank, the endpoint returns "all accounts used for reconciliation of the related credit cards", identified by one card's masked PAN. For a card company, "a dedicated card-account for every card related to a PSU".
- **No debit/credit field.** No field says whether a card is credit, debit or prepaid. **UNCONFIRMED** whether `product` reveals it.

**Card transaction** **[primary]** [API reference: card transactions](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent):

| Field                                                                     | Meaning                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cardTransactionId`                                                       | "Unique end to end identity"                                                                                                                            |
| `transactionDate`, `bookingDate`, `valueDate`                             | for cards `valueDate` is "the payment due date of related booked transactions"                                                                          |
| `transactionAmount` (required)                                            | the billed amount                                                                                                                                       |
| `originalAmount`, `currencyExchange[]`                                    | original currency and amount; rate, source and target currency, quotation date                                                                          |
| `markupFee`, `markupFeePercentage`                                        | the foreign-currency fee                                                                                                                                |
| `grandTotalAmount`                                                        | the deal's total (the standard's example is an instalment deal)                                                                                         |
| `cardAcceptorName`, `cardAcceptorId`, `cardAcceptorAddress`, `terminalId` | merchant name, id, address, terminal                                                                                                                    |
| **`merchantCategoryCode`**                                                | "Merchant category code", a 4-character string                                                                                                          |
| `maskedPAN`                                                               | which card                                                                                                                                              |
| `transactionDetails`, `invoiced`, `proprietaryBankTransactionCode`        | free text; whether already on a bill; the source's own code                                                                                             |
| `_aggregate`                                                              | Feezback's `standardName`, ISO 20022 `transactionCode`, Hebrew `category`, and `type` flags `online`, `forex`, `wallet`, `recurring`, `duplicateCharge` |
| `_extra`                                                                  | non-standard fields from the source                                                                                                                     |

- **Card last four.** Not a field of its own. It is the last four characters of `maskedPan` / `maskedPAN`.
- **MCC.** The schema allows exactly four characters, but the reference's own examples hold `"SLRD"` and `"SCDT"`, not ISO numbers. **UNCONFIRMED** what each issuer really sends. This is the same open question as path doc §3.3.
- **Instalments.** No instalment number or count field. Only `grandTotalAmount` and free-text `transactionDetails`; anything else would be in `_extra`. **UNCONFIRMED**.
- **Merchant name.** `cardAcceptorName` is null in all the reference examples. Under the standard, a source may give conditional fields only in a second "details" call (path doc §3.3). Feezback's `_links.transactionDetails` suggests it follows them, but no details endpoint appears in the reference. **UNCONFIRMED** whether Feezback fetches the second step itself.

**Account transaction** (current accounts) **[primary]** [API reference: account transactions](https://docs.feezback.cloud/reference/getaccounttransactions):

- `transactionId` (required), `entryReference`, `bookingDate`, `valueDate`, `transactionAmount`, `currencyExchange`.
- `creditorName`, `creditorAccount`, `debtorName`, `debtorAccount`.
- `remittanceInformationUnstructured` (the bank's description text), `mandateId`, `checkId`.
- `reversalIndicator`, plus securities fields.
- **No MCC on current-account transactions**, as at Discount (path doc §4.7).

**Pending and upcoming charges.**

- **Pending.** `bookingStatus` (`booked`, `pending`, `both`) is required on transaction calls; "To support the 'pending' and 'both' feature is optional for the ASPSP" **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent). Isracard returns booked only, and Discount current accounts booked only (path doc §3.3, §4.7).
- **Upcoming charges.** These are the card balances `closingBooked`, `expected` and `nonInvoiced`, per `referenceDate`.

**Standing orders.** There is no list of a customer's standing orders. Feezback flags recurring transactions (`recurring`, with `isFixed`, `isBiMonthly`, `relatedTransactionIds`) and has a "הוראות קבע" category **[primary]** [Standardization and Enrichments, page updated 2026-08-17](https://docs.feezback.cloud/docs/enrichment-categorization).

**Loans, savings and securities.** Loans come with rates, tracks and repayment dates; savings with rates, tracks and exit points; securities with holdings and fees **[primary]** [the presentation, p. 4](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf). The field-level schemas are in the reference ([loans](https://docs.feezback.cloud/reference/getlistofloans), [savings](https://docs.feezback.cloud/reference/getlistofsavings)); they were read, not mapped here.

### 3.5 Feezback's enrichment

**[primary]** [Standardization and Enrichments](https://docs.feezback.cloud/docs/enrichment-categorization); [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent)

- **`standardName`.** One name for many bank spellings: both "חיוב חברת פרטנר" and "חברת פרטנר תקש" become "פרטנר".
- **`transactionId`.** Feezback's own unique id, because a source's id "is unregulated, unexpected and applies different uniqueness rules across different banks". The source's id is kept as `aspspOriginalId`. Use v2 endpoints to get it.
- **`category`.** One Hebrew label per transaction: ביטוח, מזון וצריכה, דלק, תחבורה, תקשורת, רפואה פארם ובתי מרקחת, פנאי ובידור, מים חשמל וגז, עירייה וממשלה, הוראות קבע, משכורת, העברות, כרטיסי אשראי and others. Card transactions use "a separate, much larger merchant-name-based lookup", so their categories are finer.
- **Flags.** Current-account transactions get `isExpense`, `isIncome`, `isSalary`, `recurring`, `duplicateCharge`, `isCCPayment` (the monthly card debit) and risk flags. Card transactions get `online`, `forex`, `wallet`, `recurring`, `duplicateCharge`.
- **A typo the docs warn about.** On cards the field is spelled `recurring.expanse`, "a confirmed typo in the live API — code defensively".

### 3.6 "Real time": freshness, webhooks, limits

- **Refresh on read.** A data call refreshes from the bank unless `preventUpdate` is set: "When present, Feezback does not make account data requests to the ASPSP" **[primary]** [Retrieving data](https://docs.feezback.cloud/docs/data-aggregation-and-enrichment).
- **Waiting for the bank.** `X-Request-Wait` sets how long the call waits for the bank; past that, the API answers **307** and the client resumes with `transactionId` from the `Location` header **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent).
- **The user's IP.** Pass `X-Psu-IP-Address` "In case if end user is online" **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent). Under the standard, calls with the user present do not count against the daily background quota (path doc §4.4).
- **Freshness stamps.** `asOf` is "Last fetch time" **[primary]** [API reference](https://docs.feezback.cloud/reference/getlistofcards). The Bank of Israel requires a source's data to be no more than 30 seconds behind its own site (path doc §3.2).
- **Background refresh.** "While a consent is valid, Feezback refreshes and stores the data needed to serve it" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). `DataRefreshComplete` is "a TPP-wide event when a scheduled data refresh finishes", with only `tpp` in the payload **[primary]** [Consent status updates](https://docs.feezback.cloud/docs/consent-status-updates). How often Feezback refreshes, and whether that uses the standard's four background calls a day, is **UNCONFIRMED**.
- **Webhooks.** For data: `ConsentStatusChanged`, `UserDataIsAvailable` (first pull done, with fetched and failed accounts), `ConsentAboutToExpire`, `ConsentNotAccessed`, `DataRefreshComplete`, `UserInsightReady` **[primary]** [Webhooks Events Catalog](https://docs.feezback.cloud/docs/webhooks-events-catalog). **There is no "new transaction" or "balance changed" webhook.** The "financial events" triggers (high balance, new salary, child birth, insurance renewals) arrive once a month, "on the 3rd day of each calendar month" **[primary]** [Financial Events Triggers](https://docs.feezback.cloud/docs/financial-events-triggers).
- **Webhook rules.** Answer HTTP 200 within 3 seconds; retried "a small number of times automatically with backoff"; don't validate against a strict schema **[primary]** [Webhooks - Async Updates](https://docs.feezback.cloud/docs/webhooks-async-updates); [Webhooks Security](https://docs.feezback.cloud/docs/webhooks-security).
- **Webhook security.** Calls come from fixed IPs: integration `34.250.136.225`; production `54.78.124.183`, `54.228.71.93`, `51.17.181.171`. Optional, set per client: custom headers (a shared secret), mTLS, or OAuth2 bearer **[primary]** [Webhooks Security](https://docs.feezback.cloud/docs/webhooks-security).
- **Rate limits.** "The API enforces a rate limit per source IP. Requests beyond the limit return HTTP 429"; the threshold is not published **[primary]** [Security](https://docs.feezback.cloud/docs/security). The reference's 429 is "Too many requests for the same resource" **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent).

**For Bookandry this means:**

- **When the person opens the app**, a pull gives data as fresh as the bank's own app.
- **In between**, a few background refreshes a day at most.
- **No push** when a card is swiped. A "you just spent ₪X" notification would have to come from polling, within the Bank of Israel's quota.

### 3.7 Paging and history

- **Paging.** v2 transactions are paged with `page` (zero-based) and `pageSize` (default 100, up to 1000); v1 is one-based with a default of 10. Lists also carry `_links.first/next/previous/last` **[primary]** [Retrieving data](https://docs.feezback.cloud/docs/data-aggregation-and-enrichment).
- **History.** "If no `dateFrom` nor `dateTo` are specified, all transactions will be returned" **[primary]** [API reference](https://docs.feezback.cloud/reference/getaccounttransactions). Feezback's presentation promises "כל המידע הבנקאי על הלקוח עד שנה אחורה" **[primary]** [the presentation, p. 2](https://fb.feezback.cloud/documentation/%D7%90%D7%92%D7%A8%D7%92%D7%A6%D7%99%D7%99%D7%AA_%D7%9E%D7%99%D7%93%D7%A2_%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99_%D7%95%D7%AA%D7%95%D7%91%D7%A0%D7%95%D7%AA_%D7%91%D7%90%D7%9E%D7%A6%D7%A2%D7%95%D7%AA_%D7%91%D7%A0%D7%A7%D7%90%D7%95%D7%AA_%D7%A4%D7%AA%D7%95%D7%97%D7%94.pdf), which is the Bank of Israel minimum of 12 months (path doc §3.2).
- **"Up to three years".** The intro's "From a single day up to three years of history" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data) matches the consent-duration options, not a history depth. **UNCONFIRMED**: plan on 12 months back at the first pull, then accumulating forward.

### 3.8 Errors, SDKs, Postman

- **Error shape.** `{ "error": { "code": "CONSENT_NOT_FOUND", "message": "…" } }`.
- **Data-call status codes.** 401 (insufficient consent), 404, 410 (consent not found or invalid), 429, 451 (consent suspended), 500 (ASPSP error) and 502 (consent status refresh failed) **[primary]** [API reference](https://docs.feezback.cloud/reference/getcardtransactionlistbyconsent).
- **Link-side codes.** `1004`–`1011`, `424 ASPSP_ERROR`, and redirect reasons `access_denied`, `server_error` and others **[primary]** [Error Handling](https://docs.feezback.cloud/docs/error-handling); [Feezback Links error scenarios](https://docs.feezback.cloud/docs/error-handling-1).
- **No SDK.** None is published. The OpenAPI definitions are embedded in each reference page (Aggregate Data API 2.4.0; the link service is "hosted in AWS lambda") **[primary]** [API reference: /token](https://docs.feezback.cloud/reference/post_token).
- **Postman.** Collections exist only for payment links (FAST and Seamless), not for data **[primary]** [Postman Collection Examples](https://docs.feezback.cloud/docs/fast-postman-collection-examples).
- **Outages.** Check [aspsp_issues.json](https://fb.feezback.cloud/aspsp_issues.json) before sending a user into a known bank outage **[primary]** [Supported banks and availability feed](https://docs.feezback.cloud/docs/supported-banks-and-aspsp-issues).

### 3.9 Data residency and client-side security

- **Hosting.**
  - Feezback's API hostnames resolve to Cloudflare. Its webhook IPs belong to AWS: three in `eu-west-1` (Dublin) and one in `il-central-1` (Tel Aviv). This is my own lookup of the four published IPs on ipinfo.io, 2026-10-10.
  - The link service runs on AWS Lambda **[primary]** [API reference: /token](https://docs.feezback.cloud/reference/post_token).
  - Where customer data is stored is **UNCONFIRMED**. The ISA allows storage abroad at a GDPR-equivalent level with notice to customers (path doc §1.3).
- **Retention.**
  - Feezback stores the data while a consent is valid and starts deletion when it ends **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data).
  - `expirationDeletion`: "3 or 7 years has passed since the day we got the data" **[primary]** [API reference: data deletion tasks](https://docs.feezback.cloud/reference/datadeletiontasks).
- **What the client must do** **[primary]** [Configuring Environments & Security](https://docs.feezback.cloud/docs/environments-and-security); [Security](https://docs.feezback.cloud/docs/security); [Testing & Mock Bank](https://docs.feezback.cloud/docs/testing-and-mock-bank):
  - sign on the backend only ("Never sign JWTs in a browser or mobile client");
  - call from whitelisted IPs;
  - keep separate keys per environment;
  - answer webhooks within 3 seconds, idempotently;
  - send no PII in `sub`.
- **What the licence adds.** As a licensee, Bookandry would also carry the ISA's own duties: officers, the privacy "medium" level, seven years of logs, the §26 customer agreement (path doc §1.3).
- **Use limits.** "data may only be used for the purpose the customer consented… Reselling data, or using it for marketing without separate consent, isn't permitted" **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data).

---

## 4. Pricing, and the cost of a 10-tester pilot

### 4.1 What is public: nothing

**No Feezback price is published.** Checked on 2026-10-10:

- **Feezback's own pages.** Its site ([home](https://feezback.com/), [payments products](https://feezback.com/%d7%9e%d7%95%d7%a6%d7%a8%d7%99-%d7%aa%d7%a9%d7%9c%d7%95%d7%9e%d7%99%d7%9d-%d7%a4%d7%99%d7%96%d7%91%d7%a7/), [terms](https://feezback.com/%d7%aa%d7%a0%d7%90%d7%99-%d7%a9%d7%99%d7%9e%d7%95%d7%a9/), [privacy](https://feezback.com/privacy-policy/)) and all 97 documentation pages carry no price, plan or tier.
- **Insights.** The only commercial hint is that insights sections depend on "your plan": "If a section is missing from the response, it means that insight isn't enabled on your plan" **[primary]** [Insights Report](https://docs.feezback.cloud/docs/view-report).
- **Press.** Coverage of Feezback quotes no price for data access ([ice.co.il, 15.2.2023](https://www.ice.co.il/digital-140/news/article/935381); [Globes, 6.8.2022](https://www.globes.co.il/news/article.aspx?did=1001420274); [Bizportal](https://www.bizportal.co.il/capitalmarket/news/article/825832)) **[secondary]**. The only number is the CEO's claim that open banking could make credit offers "עד 50%" cheaper for customers (ice.co.il), which says nothing about Feezback's fees.
- **API directories** list Feezback's pricing as "unknown" **[secondary]** [apis.io](https://apis.io/providers/feezback/).

**The pilot questions, answered as far as sources allow:**

| Question                                                         | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the sandbox free? What does it allow?                         | **Price not stated.** Access is by request to support@feezback.com, not self-serve **[primary]** [Getting Started](https://docs.feezback.cloud/docs/getting-started). It allows the full consent, token, data and webhook flow against **Mock Bank** with scripted outcomes, no real banks **[primary]** [Testing & Mock Bank](https://docs.feezback.cloud/docs/testing-and-mock-bank). Whether an unlicensed applicant may have it is **UNCONFIRMED**.                               |
| Is there a pilot, startup or trial tier for ~10 real households? | **None published.** The docs know two environments, integration and production; "production testing" with real accounts is a step of go-live, not a tier **[primary]** [Integration Overview](https://docs.feezback.cloud/docs/onboarding).                                                                                                                                                                                                                                           |
| Per-user, per-consent or per-call prices; setup; minimums; term  | **None public.** Ask (§4.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Does real-bank data for testers need full production onboarding? | **Yes.** Real banks are reachable only on production, after a "production env. request" with "legal and production requirements" **[primary]** [Integration Overview](https://docs.feezback.cloud/docs/onboarding). Full data goes only to licensed clients **[primary]** [Introduction to Open Banking Data](https://docs.feezback.cloud/docs/introduction-to-open-banking-data). The law has no trial or de-minimis exemption, so ten households are ten customers (path doc §1.5). |

**So a 10-tester pilot on real bank data costs, at minimum, Bookandry's licence.** Using the path doc's sourced figures, that is the ISA's ₪6,350 application fee and ₪16,940 a year, plus insurance or a deposit from about ₪400,000 of cover (path doc §1.3–§1.4). Then add Feezback's fee, which is unknown. A **Mock Bank** prototype with ten testers clicking through fictitious data is possible as soon as Feezback grants an integration account, at whatever (unstated) price that carries.

### 4.2 What to ask (folded into the email below)

1. Will you give integration-environment access to a company that has **applied** for (or is preparing) a "use of data collected by another" licence and has none yet? At what cost?
2. Is there a pilot, startup or trial arrangement for about 10 households over 1–3 months, after licensing?
3. Prices: per connected user a month, per consent, per call or refresh, or per institution connected? Setup fee? Monthly minimum? Contract length?
4. Are enrichment (categories, `standardName`) and card MCC included in the base price, or plan-dependent?
5. Do you contract with a consumer budgeting app under §29(א)(3) at all, and is there a model in which Bookandry needs no licence (we read your docs as no)?

### 4.3 Comparison: what Open Finance and Finanda publish

| Provider     | Data-API pricing published?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Sandbox                                                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feezback     | **No.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Mock Bank, by request (§3.2)                                                                                                                                                                                                                                   |
| Open Finance | **No, for its data API.** Its home page shows a payments example of a fixed fee: "₪2.7" against "₪30" for a 3% card fee on ₪1,000, "הרשמה חינם", and a savings calculator **[primary]** [open-finance.ai](https://www.open-finance.ai/). It now runs its **own consumer app, Financy**: "Free ₪0", Starter **₪49/month**, Pro **₪199/month**, Ultra **₪999/month**, Enterprise by quote. It connects the banks, Isracard, Max, Cal and Bit, "מבוסס Open Banking מפוקח" **[primary]** [financy.open-finance.ai](https://financy.open-finance.ai) | "Access isn't self-serve yet": email Support@open-finance.ai; API key and secret from its dashboard **[primary]** [Getting started, page updated 2026-09-29](https://docs.open-finance.ai/docs/getting-started.md); fake bank data for testing (path doc §2.2) |
| Finanda      | **No B2B offer published.** Its site sells its own consumer app, MyFinanda (free download, "מנויי הפרימיום") **[primary]** [finanda.co.il](https://www.finanda.co.il/). A review site quotes premium at ₪49.90 for three months and ₪89.90 for six **[secondary]** [financa.co.il, about 2022](https://financa.co.il/myfinanda-%d7%91%d7%99%d7%a7%d7%95%d7%a8%d7%aa/)                                                                                                                                                                           | Not published                                                                                                                                                                                                                                                  |

**What the comparison shows.**

- **Nobody publishes a B2B data-access price.** The only public numbers are consumer subscriptions: Financy from ₪49 a month, MyFinanda about ₪15–17 a month (my arithmetic on the 2022 review's figures).
- **Those are competitors.** Both are licensed aggregators running their own household-money apps, so they set the price ceiling Bookandry would compete under. They are not a price for Bookandry's data.

### 4.4 Ready-to-send inquiry

To: support@feezback.com (the only address the docs give; ask them to forward to sales).

**Hebrew**

> נושא: בירור על גישה ל-API מידע פיננסי (AIS) לאפליקציית ניהול תקציב משק בית – פיילוט של כ-10 משקי בית
>
> שלום,
>
> אנחנו Bookandry (bookandry.com), אפליקציה בעברית לניהול הכסף של משק הבית. אנחנו בוחנים חיבור ל-Aggregate Data API שלכם (חשבונות עו"ש, כרטיסי אשראי, יתרות ותנועות) כדי להציג למשתמשים מידע עדכני מהבנקים ומחברות האשראי. קראנו את התיעוד ב-docs.feezback.cloud, ונשמח לתשובות לשאלות הבאות:
>
> 1. התיעוד מציין שרק גופים בעלי רישיון יכולים לקבל מידע פיננסי מלא. האם יש מסלול כלשהו שבו אפליקציה ללא רישיון משלה יכולה להשתמש בשירות (למשל, כשהמשתמש צופה במידע במסך מתארח שלכם)? ואם לא – האם תתקשרו עם בעל רישיון "שימוש במידע שנאסף בידי אחר" לפי סעיף 29(א)(3)?
> 2. האם תעניקו גישה לסביבת האינטגרציה (Mock Bank) לחברה שטרם קיבלה רישיון, בשלב הגשת הבקשה לרשות? האם יש לכך עלות?
> 3. האם קיים מסלול פיילוט, סטארט-אפ או ניסיון למידע אמיתי עבור כ-10 משקי בית למשך 1–3 חודשים, לאחר קבלת רישיון?
> 4. מה מודל התמחור: לפי משתמש מחובר לחודש, לפי הסכמה, לפי קריאה או רענון, או לפי מוסד מחובר? האם יש דמי הקמה, מינימום חודשי ותקופת התקשרות?
> 5. האם קטגוריות, standardName ו-merchantCategoryCode של כרטיסי אשראי כלולים במחיר הבסיס? האם חברות האשראי (ישראכרט, כאל, מקס, אמריקן אקספרס) ממלאות merchantCategoryCode כקוד MCC מספרי בן 4 ספרות? והאם דיינרס נתמכת דרך כאל?
> 6. באיזו תדירות אתם מרעננים מידע ברקע לכל הסכמה, והאם יש או מתוכנן webhook על תנועה חדשה?
> 7. היכן נשמר המידע של הלקוחות (אזור ענן), ולכמה זמן?
>
> תודה,
> [שם], Bookandry

**English**

> Subject: Financial-data API (AIS) for a household budgeting app – a pilot of about 10 households
>
> Hello,
>
> We are Bookandry (bookandry.com), a Hebrew-first household money app. We are evaluating your Aggregate Data API (current accounts, credit cards, balances and transactions) to show users up-to-date bank and card data. We have read docs.feezback.cloud and would appreciate answers to the following:
>
> 1. Your docs say only licensed organisations may receive full financial data. Is there any route by which an app without its own licence can use the service (for example, the user viewing data on a screen you host)? If not, will you contract with a holder of a "use of data collected by another" licence under §29(א)(3)?
> 2. Will you give integration-environment (Mock Bank) access to a company that has not yet been licensed, while its ISA application is pending? Is there a charge?
> 3. Is there a pilot, startup or trial arrangement for real data for about 10 households over 1–3 months, once licensed?
> 4. How is it priced: per connected user per month, per consent, per call or refresh, or per institution connected? Is there a setup fee, a monthly minimum, and a minimum contract term?
> 5. Are categories, standardName and card merchantCategoryCode included in the base price? Do Isracard, Cal, Max and Amex fill merchantCategoryCode with a 4-digit numeric MCC? Is Diners served through Cal?
> 6. How often do you refresh each consent in the background, and is a "new transaction" webhook available or planned?
> 7. Where is customer data stored (cloud region), and for how long?
>
> Thank you,
> [Name], Bookandry

---

## 5. Fit with Bookandry

### 5.1 Mapping onto Bookandry's model

From `src/types/domain.ts` and `README.md` in `C:/dev/greenback`, read only.

| Feezback                                                                     | Bookandry                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current account (`CACC`): `iban`, `aspspCode`, `ownerName`, `usage`          | `PaymentMethod` type `bank_account` with `BankAccountDetails`. Bank, branch and number come out of the Israeli IBAN; `usage: ORGA` maps to `holding: 'business'`. Joint versus personal is **not** in the data; ask the person.                                                                                                                                                    |
| Card (`CARD`): `maskedPan`, `aspspCode`, `creditLimit`, `product`, `details` | `credit_card` or `debit_card` with `CardDetails`. `lastDigits` is the end of `maskedPan`, which is how Smart import already matches cards. `issuer` comes from `aspspCode` (`10023` cal, `10033` max, `12002` isracard, `12011` amex); `creditLimitMinor` from `creditLimit`; `billingDay` from a booked transaction's `valueDate`. Credit versus debit is **not** a field (§3.4). |
| Card transaction                                                             | `Transaction` (kind expense, or income for a refund). `money.amountMinor` and `currency` from `originalAmount` when foreign, else `transactionAmount`. `rateUsed` and `rateDate` from `currencyExchange`; `feeRate` from `markupFeePercentage`; `baseAmountMinor` from `transactionAmount`. `date` from `transactionDate`.                                                         |
| `merchantCategoryCode`                                                       | `Transaction.mcc` **only if it is four digits**, with a new `mccSource` (e.g. `'bank'`); older builds treat an unknown source like `'user'` (`domain.ts`, `MccSource`). Otherwise fall back to the sector, history or AI path the app already has.                                                                                                                                 |
| `cardAcceptorName`, `standardName`, `remittanceInformationUnstructured`      | `note`, and the input the existing merchant-recognition and `categorize` paths read. `Transaction` has no merchant field.                                                                                                                                                                                                                                                          |
| `_aggregate.category`                                                        | A hint for `categoryId` through a fixed table from Feezback's ~23 Hebrew labels to the built-in categories. The person's own MCC moves (`Category.mccs`) still win.                                                                                                                                                                                                                |
| `_aggregate.type.isCCPayment` on a current-account row                       | **Skip it, or mark it as a transfer.** Bookandry counts card purchases one by one, so the monthly card debit would count them twice.                                                                                                                                                                                                                                               |
| Instalment deal                                                              | `Recurrence` monthly with `installments` and `plan` needs the count. Feezback gives at most `grandTotalAmount` (§3.4). Each instalment arriving as its own monthly row is the likely shape. **UNCONFIRMED**.                                                                                                                                                                       |
| `recurring` flag; category "הוראות קבע"                                      | A suggestion to make a row a `standing_order` payment or a monthly `Recurrence`. Never automatic.                                                                                                                                                                                                                                                                                  |
| Loans (`LOAN`)                                                               | `InstallmentPlan 'loan'` needs a principal, rate and term; Feezback's loan detail has them (§3.4). A later step.                                                                                                                                                                                                                                                                   |
| Savings, securities                                                          | Not modelled in Bookandry today. Skip.                                                                                                                                                                                                                                                                                                                                             |
| Feezback `transactionId`                                                     | **Needs a new optional field** on `Transaction` (e.g. `externalId`) for de-duplication against repeated pulls and Smart-import rows. `domain.ts` has none. Older builds keep fields they do not know (README, on `destinationId`).                                                                                                                                                 |

### 5.2 Where the integration would live

- **The SPA never holds a key.** Feezback demands backend-only signing; the private key goes in Supabase Edge Function secrets, beside `ANTHROPIC_API_KEY` and `RESEND_API_KEY` (README, "Supabase project checklist").
- **Static IP.** Feezback rejects calls from unregistered IPs, and Supabase Edge Functions "do not originate from a single static IP address". Supabase's recommended fix is an outbound proxy with a fixed IP **[primary]** [Supabase troubleshooting](https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0). Options:
  - a small VM of Bookandry's own as the proxy;
  - a managed static-IP proxy **[secondary]** [QuotaGuard](https://quotaguard.com/integrations/supabase-edge-functions-static-ip);
  - running the Feezback connector on a host with a fixed IP.

  Each is a new piece of infrastructure, and under the licence Bookandry's own systems are in scope (path doc §1.3).

- **Webhooks.** A public Edge Function deployed `--no-verify-jwt` (as `prime-rate` is). It checks a shared-secret header that Feezback adds (§3.6), answers 200 at once, and records the consent status.
- **Sealed sync.** Bookandry's synced rows are AES-256-GCM ciphertext sealed by the client with the account's key (README, "Accounts"). So the natural shape is:
  - **pull on open**: the client calls an Edge Function, which fetches from Feezback and returns plain rows over TLS;
  - **the client** maps them, shows them in the Smart import **review list**, and seals and syncs what the person accepts. Bookandry's server never stores transactions in the clear.
- **Background or webhook-driven imports** would need server-side staging of bank data, which is new server-held personal data and a change to the privacy page. Leave that for later.
- **Bookandry's own records.** As a licensee it must keep seven years of API logs (path doc §1.3), so the Edge Function needs request logging that holds no transaction content.

### 5.3 Consent per household member

- **One Feezback user per Bookandry account.** In linked accounts, every person is their own account, and their rows live in their own space (README, "Linked accounts"). So the Feezback `sub` should be per account: an HMAC of the account id, never the email or ID number. `userId` is then `{sub}@{tpp_id}`.
- **Each person consents for themselves, per institution.** The ID number must match the bank login (§3.3). A partner cannot connect the other's cards. For card data, the account holder is the person the card was issued to (path doc §4.2).
- **Joint accounts.**
  - The Bank of Israel says access given by one owner of a joint account counts as given by all (path doc §4.2).
  - Feezback nonetheless has `partiallyAuthorised` for consents that need "additional approval from joint account holders" **[primary]** [Consent status updates](https://docs.feezback.cloud/docs/consent-status-updates).
  - Handle both, and attach a joint account to one person's space with `holders` listing both (as `BankAccountDetails` already allows).
- **The ID number.** Let Feezback's screen ask for it (no `userIdentifier`), and do not keep the `psuId` the webhooks return beyond matching. Bookandry's §12 rule keeps identifiers out of synced data.
- **Leaving.** Unlinking a member should not end their consents; deleting an account must call `DELETE /tpp/v1/users/{userId}/consents` (delete user data).

### 5.4 A minimal Mock Bank prototype

This is possible only after Feezback grants an integration account (§2, §4.1). It uses fictitious data only, so it is a technical spike, not a feature. Steps:

1. **Account.** Get a `TPP_ID` and an admin login at collect.feezback.cloud. Generate the integration key, set the webhook URL, ask for a custom webhook header.
2. **Fixed egress.** Stand up the static-IP proxy (§5.2) and whitelist its IP with Feezback.
3. **`openbanking-link` Edge Function** (signed-in, `aal2`):
   - build the JWT: `sub` = HMAC(account id); `srv: "ais/user"`; `accountTypes` `CACC` and `CARD`; `dataBaskets` all three; `timePeriods` e.g. `TWELVE_MONTHS`; redirects to `https://bookandry.com/settings/...`;
   - sign it with RS512, post it to `lgs-integ01…/link` through the proxy, decrypt the JWE;
   - return the link. The SPA navigates to it.
4. **Consent at Mock Bank.** Complete it with the docs' test identities: one valid, one partially authorised, one rejected, one delayed.
5. **`openbanking-webhook` Edge Function** (`--no-verify-jwt`):
   - check the header (and the integration IP `34.250.136.225`);
   - store consent id, status and `validUntil` per account in a new table (metadata only, under row-level security);
   - answer 200 within 3 seconds;
   - treat `UserDataIsAvailable` as "ready".
6. **`openbanking-pull` Edge Function** (signed-in):
   - get a bearer token (`srv: "ais/tpp"`, 600 s);
   - call `/accounts?withBalances`, `/cards`, then v2 transactions per resource with `bookingStatus=both` (fall back to `booked`), `pageSize=1000`, and `X-Psu-IP-Address`;
   - follow 307 polling;
   - return normalised rows.
7. **Client.**
   - Map the rows (§5.1) into the Smart import review list.
   - Match cards by last four and accounts by IBAN.
   - Drop `isCCPayment` debits.
   - Dedupe by `externalId`.
   - Seal and sync what is accepted.
8. **Lifecycle.** Disconnect (`DELETE …/consents/{id}`), expiry banners from `ConsentAboutToExpire`, the 6-month inactivity rule, and account deletion calling the delete-user-data endpoint.

---

## 6. Red flags

1. **Licence required, stated and enforced** (§2). Nothing in Feezback's offer changes the path doc's conclusion.
2. **Built for lenders and payments, not household budgeting.**
   - Its products are underwriting, credit scores and "financial events" to "detect sales and marketing opportunities" **[primary]** [Overview](https://docs.feezback.cloud/docs/overview).
   - Its consent wording is "לצורך מתן הצעות לשירותים" (§2).
   - A budgeting app would be an unusual client, and the consent text would need changing to fit.
3. **The bank's consent screen names Feezback, not Bookandry** (§2). Users approve a transfer to a company they have not heard of.
4. **An issuer is the lead investor.** Isracard led its Series A (§1.1). That is not a conflict for read access, but worth knowing when Isracard-issued data quality is questioned.
5. **Small vendor.** 8–13 staff per a company database (§1.1). Ask about continuity and an escrow or exit plan in the contract.
6. **No static-IP path on the current stack** (§5.2).
7. **Data gaps that matter to Bookandry:**
   - MCC content unverified (example values are not ISO codes);
   - no instalment fields;
   - merchant name null in the examples;
   - no debit/credit flag;
   - pending optional;
   - no standing-order list;
   - Diners, Jerusalem and One Zero not confirmed (§1.2, §3.4).
8. **No push for new transactions.** "Real time" means pull-on-open (§3.6).
9. **Documentation inconsistencies:**
   - signing algorithms (RS512 only versus three choices);
   - v1 versus v2 transaction endpoints, with only v1 in the reference;
   - `partiallyAuthorized` versus `partiallyAuthorised`;
   - `ConsentNotAccessed` described as both a nudge and a revocation;
   - the JWE decryption key unspecified;
   - a typo'd live field (`recurring.expanse`);
   - the English privacy page is WordPress's placeholder ("Suggested text: Our website address is…") **[primary]** [Privacy Policy](https://feezback.com/privacy-policy/).
10. **Two copies of the data.** Feezback holds the data too, for up to 3 or 7 years after fetching (§3.9), and its storage region is unstated.

---

## 7. Open questions

For Feezback sales (all in the §4.4 email):

1. Integration access before a licence, and at what cost.
2. A pilot, startup or trial arrangement for ~10 households.
3. The price model: per user, per consent, per call or refresh, per institution; setup fee; minimum; contract term.
4. Whether any route lets an unlicensed app use the service (a hosted VIEW dashboard only?), and whether you contract under §29(א)(3) with a "use only" licensee.
5. Whether the issuers' `merchantCategoryCode` is a 4-digit ISO MCC, and whether Diners comes through Cal.
6. The background refresh frequency, and whether a "new transaction" webhook exists or is planned.
7. The data region and retention.

Also for Feezback, technical:

8. Whether Feezback fetches the standard's second-step "transaction details" itself, so `cardAcceptorName` is filled.
9. How instalment deals appear (one row per instalment? `grandTotalAmount`? `_extra` fields?).
10. Which key decrypts the JWE responses from LGS.
11. The v2 transaction schema.
12. Whether Jerusalem, Igud, One Zero and Diners are live.
13. What Mock Bank returns for cards: MCC, pending, foreign currency.
14. The rate-limit threshold per IP.

For counsel and the ISA (carried over from the path doc):

15. The "use only" licence's real requirements for a household app: insurance or deposit amount, officers, auditor's opinion.
16. Whether a licensee that receives data only from an aggregator needs a Gov CA certificate.
17. Whether the §26 six-monthly "access is still on" check falls on Feezback or on Bookandry when both are licensees in the chain.
