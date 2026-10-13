# Live bank and card data in Israel: the path for Bookandry

Date: 2026-10-09. Every source below was opened on this date (the "seen" date). Where a source carries its own date, it is given next to the link.

Scope: what it takes for Bookandry to show real, live data from every Israeli bank and card company, for a whole household, in one app. That covers the law and the licence, who is licensed today, what the banks and card companies expose, the technical standard, and a roadmap.

**How to read this.** Every claim has its source next to it. **[primary]** marks a law, a regulator's document, or a bank's or provider's own page or document. **[secondary]** marks a law firm's summary or press. **UNCONFIRMED** marks anything no primary source here establishes. Hebrew is quoted as the source writes it. This is research, not legal advice; the licensing conclusions in §1 and §5 should be checked with Israeli counsel before money is spent.

The Bank of Israel and Israel Securities Authority (ISA) HTML pages block plain fetches, so I read them in a real browser. The PDFs (the law, directives, circulars, the technical standard) were downloaded and read. Discount's own documents came from its developer platform; they are cited as "Discount developer platform document &lt;filename&gt;, retrieved 2026-10-09". Discount's sandbox test identities and IBANs are described, not copied.

---

## 0. Summary and recommendation

**The one fact that decides everything.** Under the Financial Information Service Law, 2021 (חוק שירות מידע פיננסי, התשפ"ב-2021), a "financial information service" includes not only collecting data from banks but also **"שימוש, באופן מקוון, במידע פיננסי שנאסף בידי אחר והועבר לעושה השימוש"**, that is, using online data that someone else collected and passed on (§1). Nobody may provide that service without an ISA licence (§2(א)), on pain of up to two years in prison (§57(א)(1)). A licensed aggregator may pass a customer's data only to a financial body, to an accountant or tax adviser (מייצג), or **to another licensed provider** (§29(א)) **[primary]** [the law on Nevo, current to 27.7.2026](https://www.nevo.co.il/law_html/law00/204508.htm). So **there is no route in which an unlicensed Bookandry shows live bank data it receives from an aggregator.** "Partner with an aggregator" still means Bookandry holds a licence of its own, of the narrower "use only" type.

**Five facts that shape the plan**

1. **Who regulates, and the licence.** The ISA licenses non-bank providers. The licence names which of three service types a company may provide: collect and pass on, collect and use, or use data collected by another (§1, §6). There is no "basic vs full" licence; the ISA may set different requirements by service type and scale (§36(א), §37(ג)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). Fees from 1.1.2026: **₪6,350** to apply, **₪16,940 a year** **[primary]** [ISA fee notice, 8.1.2026](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-63b3dc4fa5dd2/FeeAdjustmen.pdf). Professional-liability insurance or a trust deposit is required, built from components that each have a **₪200,000** floor **[primary]** [ISA capital/insurance directive, Appendix 6](https://www.new.isa.gov.il/images/Fittings/isa-be/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/order_equity.pdf).
2. **28 companies are on the ISA register; ten may pass data on to another licensed provider.** Those ten are Open Finance, Feezback, Finanda, Certomo, Personetics, I Fact (bizibox), Silver-Net, SUMIT, Menahel 4 You (Finsite) and Dokka. Two small apps, AccountBox and Finbot, already hold the "use data collected by another" licence type that Bookandry would need. Riseup may not pass data to other providers **[primary]** [ISA register](https://www.new.isa.gov.il/nav-index/supervised-api/tax-api-faqs).
3. **Coverage is broad and has been live since 2022.** All the banks, Isracard (including Amex), Cal (including Diners) and Max publish open-banking developer portals **[primary]** [Bank of Israel list of developer portals, 19.1.2025](https://www.boi.org.il/media/ok4p5qxq/%D7%A7%D7%99%D7%A9%D7%95%D7%A8%D7%99%D7%9D-%D7%9C%D7%A4%D7%95%D7%A8%D7%98%D7%9C-%D7%94%D7%9E%D7%A4%D7%AA%D7%97%D7%99%D7%9D.pdf). Card data (cards, card balances, card transactions) has been mandatory since **31.3.2022** **[primary]** [BOI circular 2692](https://boi.org.il/media/z02m0icl/h2692.pdf). The card-transaction standard has a **`merchantCategoryCode`** (MCC) field, which an issuer must fill when it shows the category in its own app or site **[primary]** [BOI Implementation Guidelines v1.8, §14.29 and the "Conditional" rule](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip).
4. **Certificates come only from the government, and only to licensed providers or applicants.** The client certificate (QWAC) and the signing certificate (QSealC) must be issued by the Gov CA (ממשל זמין), and the TLS version is **1.3** **[primary]** [IG v1.8](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip). Even the _test_ certificate is issued only after an applicant has filed for a licence, paid the fee and passed a fitness and technology check **[primary]** [ISA directive for applicants, §3–§7](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf). Isracard admits nobody to its sandbox without the regulator's certificate **[primary]** [Isracard developer portal FAQ](https://marketing.isracard.co.il/developer-portal/). **The self-signed certificates made for Discount will not get Bookandry live customer data**, and almost certainly not sandbox access to the regulated API either (§4.6).
5. **Screen scraping is a crime.** Accessing a customer's bank data "דרך עיסוק" (as a business) with the customer's own login details is banned (§60). The penalty is up to one year in prison (§57(ב)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). The israeli-bank-scrapers style of approach is not an interim option.

**Recommendation: Option C now, then Option A.** Option A means a narrow ISA licence plus a licensed aggregator.

- **Now (weeks):** keep making Smart import the best statement import in Israel (Option C). It is legal, it already works, and it is what the app has.
- **Next (1–2 months, low cost):** ask three aggregators (Open Finance, Feezback, Finanda) for pricing and for their household/consumer-app terms. Ask counsel and the ISA whether a household budgeting app can hold the "use data collected by another" licence alone, and with what insurance, officers and audit.
- **Then (if the answers and the money work):** apply for that licence and launch live data through one aggregator, which covers every bank and card company at once.
- **Option B**, a full collecting licence and direct integration with about 15 bank and card APIs, makes sense only at a scale where aggregator fees exceed the cost of running 15 integrations.
- **Pause Discount's developer platform.** Without a Gov CA test certificate it leads nowhere. §4.7 describes what to build once there is one.

---

## 1. The law and the licence

### 1.1 Who must be licensed

- **The activity.** "שירות מידע פיננסי" is any of: (1) collecting financial information and passing it to another; (2) collecting it and using it online, by whoever collected it; (3) **using online information collected by another and passed to the user** **[primary]** [law §1](https://www.nevo.co.il/law_html/law00/204508.htm). "איסוף" (collecting) means access to a data source's data **through the financial-information interface** (the API), and receiving and holding it (§1).
- **The duty.** "לא יעסוק אדם ... במתן שירות מידע פיננסי, אלא אם כן בידו רישיון לכך שניתן מאת הרשות" (§2(א)). Banks, card companies and other regulated sources need an **approval (אישור)** from their own regulator instead (§2(ב)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm).
- **Exemptions.** A financial body, a representative (accountant, tax adviser), or another body named by regulation is exempt _only_ for using data it received under §29 for the purpose it was sent (§3(א)). The Minister of Finance may exempt more bodies by regulation (§3(ב)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). I found no regulation under §3(ב) that would exempt a budgeting app. **UNCONFIRMED** that none exists.
- **Passing data on.** A provider may pass data only to: a financial body (for an offer to the customer), a representative (for that representative's service), or another provider "לשם מתן שירות מידע פיננסי לאותו לקוח" (§29(א)(1)–(3)), with the customer's explicit written consent **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). The Bank of Israel adds that such a transfer needs a written agreement with the receiver covering security, privacy and use, plus seven years of logs **[primary]** [Directive 368 v6, §57א, in circular 2778, 7.4.2024](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Scraping.** §60: "לא ייגש אדם, ובכלל זה נותן שירות, אל מידע פיננסי ... אם הגישה כאמור נעשית דרך עיסוק, באמצעות מערכת מקוונת ותוך שימוש בפרטי הגישה של הלקוח". Penalty: one year (§57(ב)). Veteran scrapers had transition periods (§81) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). A February 2025 draft amendment proposed extending credential access only for **corporate** accounts **[secondary]** [Herzog, Feb 2025](https://herzoglaw.co.il/he/news-and-insights/%D7%97%D7%95%D7%A7-%D7%A9%D7%99%D7%A8%D7%95%D7%AA-%D7%9E%D7%99%D7%93%D7%A2-%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99-%D7%AA%D7%99%D7%A7%D7%95%D7%9F-%D7%9E%D7%A1-3-%D7%94%D7%AA%D7%A9%D7%A4%D7%94-2025/).
- **What this means for Smart import.** A user downloads their own statement and uploads it. That is not "איסוף" as the law defines it (access through the interface system), and Bookandry never touches the user's bank credentials. My reading is that statement import is outside the licensing regime. **UNCONFIRMED** by any regulator statement; confirm with counsel.

### 1.2 Licence types and tiers

- **No "basic" vs "full" licence.** The licence states which of the three service types the holder may provide (§6(א)), and the ISA may set conditions **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). The register shows the three types combined in every pattern. AccountBox and Finbot hold "use of data collected by another" plus "collect and pass on" without onward transfer to other providers; Open Finance holds all three **[primary]** [ISA register](https://www.new.isa.gov.il/nav-index/supervised-api/tax-api-faqs).
- **Scaling.** The ISA "רשאית ... לקבוע דרישות שונות, לפי היקף שירות המידע הפיננסי שנותן בעל הרישיון וסוג השירות שהוא נותן" (§36(א)). Its directives "יכול שייקבעו דרך כלל או לפי סוג שירות המידע הפיננסי או היקפו" (§37(ג)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). **UNCONFIRMED** whether the ISA in practice applies lighter requirements to a "use only" licence.
- **Payment initiation** is a separate approval under the Payment Services Law, 2023, which a licensed provider may add **[primary]** [ISA directive for applicants, ch. ב'1](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf).

### 1.3 Requirements

From the law, §4(א) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm):

- **Company.** An Israeli company, or a foreign company registered under §346 of the Companies Law (§4(א)(1)).
- **Control and management** exercised in Israel, or else proof that the law can be enforced against it (§4(א)(2)).
- **Technology** suitable for the service, ensuring privacy, information security, cyber protection and risk management (§4(א)(3)).
- **A business plan and a declaration of financial means** (§4(א)(4)).
- **Insurance, minimum equity or other security** as the ISA sets (§4(א)(5), §36(א)).
- **No insolvency proceedings** (§4(א)(6)). **A control permit** for any controlling shareholder (§4(א)(7), §9).
- **Fitness.** The ISA may refuse on public-interest or integrity grounds (§4(ב)).

From the ISA's directive for applicants and licence holders (published 15.3.2022, updated 7.9.2022 and 4.6.2024) **[primary]** [horaha15322](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf):

- **An information-security and cyber officer** with suitable training and experience (§30(ג), §32). The CEO may hold this role. It may be outsourced, and the officer may live abroad if enforceable **[primary]** [ISA Q&A, 30.5.2022](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic//QA300522_.pdf).
- **A risk-management officer.** This may be the same person (§31).
- **Privacy level.** A database that would be at the "basic" level under the Privacy Protection (Data Security) Regulations, 2017 must meet the **"medium"** level at least (ch. ה').
- **Customer login.** Multi-factor login for customers on the provider's website (§14(ב)).
- **Outsourcing.** Allowed, but the licensee "יבצע בעצמו את הפעילות המהותית הכרוכה במתן שירות מידע פיננסי" and stays fully responsible, cloud included (§34–§35).
- **Cloud and data location.** Customer data may be stored outside Israel if the cloud provider meets a GDPR-equivalent level **and the customer is told** (§46). Data must be encrypted in the cloud (§51).
- **Certificate custody.** Certificates are created and held only by authorised staff (§15–§28). The Bank of Israel adds that the certificate must be kept "ברכיב חומרה מאובטח" (a secure hardware component, i.e. an HSM). Suppliers may use it only on the provider's own machines under its staff's control **[primary]** [Directive 368 v6, §55.7, §55.9](https://www.boi.org.il/media/k1dl4le3/2778.pdf).

**Insurance or deposit.** The current rule is the ISA directive on equity, insurance or other security for payment companies, initiators and information-service licensees **[primary]** [order_equity.pdf, ch. ח' and Appendix 6](https://www.new.isa.gov.il/images/Fittings/isa-be/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/order_equity.pdf):

- An information-service licensee carries professional-liability insurance, or a deposit held by a trustee in government or investment-grade bonds, covering negligence "בכלל כאלו, שנעשו כתוצאה מאירועי אבטחה מידע או סייבר" (§17–§19).
- The minimum is the sum of three criteria: risk profile, type of activity, and scale (Appendix 6).
- The information-service components are each **max(a sliding % of accounts or customers, ₪200,000)**. Another business line adds ₪200,000 unless it cannot harm customers.
- For a small "information only" company, my reading is a floor of about **₪400,000**: the two information-service components.
- It would be up to about **₪1,000,000** if the payment-initiation components' ₪200,000 floors also apply to a company that does no initiation. **UNCONFIRMED** which reading the ISA uses.
- The directive's dated publication is 23.5.2024 per a law-firm summary **[secondary]** [Herzog](https://herzoglaw.co.il/he/news-and-insights/%D7%94%D7%95%D7%A8%D7%90%D7%94-%D7%9C%D7%97%D7%91%D7%A8%D7%95%D7%AA-%D7%AA%D7%A9%D7%9C%D7%95%D7%9E%D7%99%D7%9D-%D7%91%D7%A2%D7%9C%D7%99-%D7%A8%D7%99%D7%A9%D7%99%D7%95%D7%9F-%D7%99%D7%99%D7%96%D7%95/).
- The older rule, a flat ₪500,000 insurance or deposit, still appears in the 2024 version of the applicants' directive as a transition for existing licensees **[primary]** [horaha15322, §66](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf).

**Ongoing duties once licensed** **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm):

- **Duty of loyalty.** The provider acts in its customers' interest (§21).
- **Confidentiality** (§23).
- **No benefits from third parties**, except under ISA rules (§24).
- **Use only for the customer's own financial management** (§25).
- **A written agreement** in which the customer picks the services, the sources, accounts and baskets, and one-off or continuing access of **at most three years** (§26(א)).
- **A check every six months** that the customer still knows access is on; if the customer cannot be reached, the agreement counts as cancelled (§26(ב)).
- **Keep data no longer than needed and at most three years**, or seven with explicit written consent; delete within seven business days after that (§27).
- **Easy cancellation**, and the provider tells the source within two days (§28).
- **Report severe security incidents** at once to the ISA, the source and the Privacy Protection Authority (§31).
- **Disclosure and no misleading** (§33–§34).
- **Logs** of all API traffic kept for **seven years** **[primary]** [Directive 368 v6, §56](https://www.boi.org.il/media/k1dl4le3/2778.pdf).

### 1.4 Application process

The ISA's licensing page sets out six steps **[primary]** [ISA, נותני שירותי מידע – רישוי](https://www.new.isa.gov.il/page/lobby-api):

1. Register for the ISA's **Magna** filing system and **Yael** secure mailbox.
2. File the full application on Magna forms: ט010/ט10 (opening data), ט011 (equity, insurance or security, and financial means), ט012 (competence report), ט014 (risk management), and ט051 (officers and controlling holders).
3. **Pay the application fee.** It is a precondition for review.
4. **Test certificate.** An applicant whose application is pending may ask for QWAC and QSEAL test certificates on Magna form י100, "לאחר קבלת אישור בכתב כי הוא עומד בתנאים". The conditions are: a fitness check, the fee paid, and a first review of the technology. They also include an **auditor's opinion** on information security in the test environment, at least on key storage, plus a dated plan for the rest **[primary]** [horaha15322, §3–§7](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf); [ISA Q&A, 30.5.2022](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic//QA300522_.pdf). Insurance and the financial-means declaration are not needed at this stage.
5. The ISA decides on the licence and the control permit.
6. **Production certificate**, on form י100.

**Fees** (index-linked, from 1.1.2026): application **₪6,350**; annual **₪16,940** **[primary]** [ISA fee notice, 8.1.2026](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-63b3dc4fa5dd2/FeeAdjustmen.pdf). A 2026 draft would cut annual fees by 25% for one year **[secondary]**; **UNCONFIRMED** that it passed.

**Timeline.** The law sets no deadline for the ISA's decision, and I found no published service level. Evidence from the register:

- The first licences were dated **28.9.2022** (Riseup, Finanda, FamilyBiz, Green Invoice), about six months after the directive was published on 15.3.2022.
- Recent grants are dated 1.7.2025 (Connectiv), 18.9.2025 (Paperless, AccountBox, Finbot), 28.1.2026 (Dokka), 23.3.2026 (Shavve) and 11.5.2026 (KashCash) **[primary]** [ISA register](https://www.new.isa.gov.il/nav-index/supervised-api/tax-api-faqs).

How long each of these took from filing is **UNCONFIRMED**. Plan on **6–12 months** as an assumption, not a sourced figure.

### 1.5 Sandbox or exemption

- The law has no sandbox or trial-licence regime. Its only exemption power is §3(ב), by regulation **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm).
- The ISA runs an innovation hub, but I found no "ארגז חול רגולטורי" that lets an unlicensed company receive live bank data. **UNCONFIRMED**.
- The banks' and card companies' "sandbox" is a technical test environment with fictitious data. It is open to holders of a suitable certificate **[primary]** [Directive 368 v6, §8א](https://www.boi.org.il/media/k1dl4le3/2778.pdf). It is not a regulatory sandbox.

---

## 2. Licensed providers today

### 2.1 The ISA register

The register lists **28** companies; one is suspended at its own request. Columns: the service types the licence allows, whether it may pass data on to **another provider** (§29(א)(3)), and the date granted **[primary]** [ISA register, read via its public API](https://www.new.isa.gov.il/nav-index/supervised-api/tax-api-faqs).

| Company (app)                                  | Collect + pass on | …to another provider (§29(א)(3)) | Collect + use | Use data collected by another | Payment initiation | Licensed                 |
| ---------------------------------------------- | ----------------- | -------------------------------- | ------------- | ----------------------------- | ------------------ | ------------------------ |
| Rise Up Moments (Riseup)                       | yes               | **no**                           | yes           | yes                           | yes                | 28.09.2022               |
| Finanda (MyFinanda, Finanda Smart Aggregation) | yes               | **yes**                          | yes           | yes                           | no                 | 28.09.2022               |
| Green Invoice (Morning)                        | yes               | no                               | yes           | yes                           | suspended          | 28.09.2022               |
| Family Biz Holdings (FamilyBiz)                | yes               | no                               | yes           | yes                           | no                 | 28.09.2022               |
| Feezback Technologies                          | yes               | **yes**                          | yes           | yes                           | yes                | 07.02.2023               |
| Finance FolloApp Services 2021 (FolloApp)      | yes               | no                               | yes           | yes                           | yes                | 07.02.2023               |
| Amir Cashflow (tazrim)                         | yes               | no                               | yes           | yes                           | no                 | 07.02.2023               |
| Metaor Plus (Storenext)                        | yes               | no                               | yes           | yes                           | no                 | 07.02.2023               |
| Open Finance                                   | yes               | **yes**                          | yes           | yes                           | yes                | 28.02.2023               |
| Moneytor                                       | yes               | no                               | yes           | yes                           | no                 | 02.08.2023               |
| Certomo                                        | yes               | **yes**                          | yes           | yes                           | no                 | 02.08.2023               |
| I Fact (bizibox)                               | yes               | **yes**                          | yes           | yes                           | no                 | 02.08.2023               |
| Personetics Technologies                       | yes               | **yes**                          | no            | no                            | no                 | 02.08.2023               |
| Summa Technologies (SUMMA)                     | yes               | no                               | yes           | no                            | no                 | 19.11.2023               |
| All In All (ALLinALL)                          | yes               | no                               | yes           | no                            | no                 | 19.11.2023               |
| Silver-Net Computer Systems                    | yes               | **yes**                          | yes           | yes                           | yes                | 27.12.2023               |
| iCount Systems                                 | yes               | no                               | yes           | yes                           | no                 | 27.12.2023               |
| SUMIT                                          | yes               | **yes**                          | yes           | yes                           | no                 | 18.09.2024               |
| Menahel 4 You (Finsite)                        | yes               | **yes**                          | yes           | no                            | no                 | 26.02.2025               |
| Connectiv Information Systems                  | yes               | no                               | yes           | no                            | no                 | 01.07.2025               |
| MeshPay IL (Mesh Payments)                     | yes               | no                               | yes           | no                            | no                 | 22.07.2025               |
| Paperless                                      | yes               | no                               | yes           | no                            | no                 | 18.09.2025               |
| Direct Accounting Management (AccountBox)      | yes               | no                               | no            | **yes**                       | no                 | 18.09.2025               |
| Finbot                                         | yes               | no                               | no            | **yes**                       | no                 | 18.09.2025               |
| Dokka A.I.                                     | yes               | **yes**                          | yes           | yes                           | yes                | 28.01.2026               |
| R.R.T Technologies (Shavve / שווה)             | no                | no                               | yes           | no                            | no                 | 23.03.2026               |
| KashCash                                       | no                | no                               | yes           | no                            | yes                | 11.05.2026               |
| Clevir Systems (GOP)                           | yes               | no                               | yes           | no                            | no                 | suspended at own request |

Notes:

- **"Kima" and "Q"** are not on the register. **UNCONFIRMED** whether they exist under another company name.
- **Banks and card companies** hold Bank of Israel _approvals_, not ISA licences. Discount, Leumi, Mizrahi-Tefahot, FIBI, Massad, One Zero (Digibank), Pepper, Cal, Isracard and Max are listed. Most are approved for "collect and use", which is how a bank's app shows other banks' accounts. Leumi, Discount and Pepper are also approved for "use data collected by another". Mizrahi-Tefahot is approved for "collect and pass on" too **[primary]** [BOI list of approved providers, 17.12.2024](https://www.boi.org.il/media/h4oj5chd/%D7%A0%D7%95%D7%AA%D7%A0%D7%99-%D7%A9%D7%99%D7%A8%D7%95%D7%AA-%D7%9E%D7%99%D7%93%D7%A2-%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99.pdf). The table's columns are scrambled in the PDF text, so the per-bank pairing of service types is my best reading. A household can already see several banks in one bank's app. That is a competitor to keep in mind, not a channel for Bookandry.

### 2.2 Which ones sell data access to other apps

| Provider     | What its own site says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Pricing                                                          | How to start                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Finance | B2B: open banking data, payment initiation, underwriting. "70+ מקורות מידע". API docs with accounts, transactions, category taxonomy, connections, webhooks, an embeddable consent journey (iframe), and "Testing with fake bank data" **[primary]** [open-finance.ai](https://www.open-finance.ai/), [docs](https://docs.open-finance.ai/docs/getting-started.md). Has a guide for a card that appears through two sources (bank and issuer), with `isDuplicate` **[primary]** [docs index](https://docs.open-finance.ai/) | Not public for data. The site promotes a fixed fee per _payment_ | "Access isn't self-serve yet": email Support@open-finance.ai. API key and secret come from its dashboard **[primary]** [getting started](https://docs.open-finance.ai/docs/getting-started.md) |
| Feezback     | B2B: payment initiation, underwriting, an "Aggregate Data API" with accounts, balances, transactions, **cards, card balances, card transactions**, loans, savings, securities, consents. Integration environment with test users and a mock bank. ISO 27001 **[primary]** [feezback.com](https://feezback.com/), [docs](https://docs.feezback.cloud/docs/open-banking-data.md). Consent can be requested "from your business account or from your customers"                                                                | Not public                                                       | "Complete Feezback onboarding" to get a `TPP_ID` **[primary]** [docs](https://docs.feezback.cloud/docs/open-banking-data.md)                                                                   |
| Finanda      | Consumer app MyFinanda since 2009. The register also lists a second app, "Finanda Smart Aggregation". The website says nothing about B2B **[primary]** [finanda.co.il](https://www.finanda.co.il/); [ISA register entry](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/FINANDA.pdf)                                                                                                                                                                                      | Not public                                                       | Contact form only. B2B offer **UNCONFIRMED**                                                                                                                                                   |
| Certomo      | Business finance operations (fraud, cash, FX), "Domestic & regional capabilities using Open Banking", aimed at financial institutions **[primary]** [certomo.com](https://www.certomo.com/)                                                                                                                                                                                                                                                                                                                                 | Not public                                                       | Not stated. A consumer-app fit is unlikely                                                                                                                                                     |
| Personetics  | Licensed only to collect and pass on. Its product is personalisation for banks **[primary]** [ISA register](https://www.new.isa.gov.il/nav-index/supervised-api/tax-api-faqs)                                                                                                                                                                                                                                                                                                                                               | —                                                                | Not a fit for a consumer app (my judgement)                                                                                                                                                    |

None of the providers' pages says whether its customer company needs its own licence. The law answers that: data may go only to another licensed provider (§29(א)(3)). Nothing found allows a "licence as a service" in which Bookandry runs the app under the aggregator's licence. The licensee must do "הפעילות המהותית" itself **[primary]** [horaha15322, §34](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf). **UNCONFIRMED** whether the ISA would accept an arrangement in which the aggregator is the licensed provider and Bookandry only supplies software. Ask counsel and the aggregators.

Fees between a provider and another body are allowed only under ISA rules against conflicts of interest (§24(2)). Paying an aggregator for data is the ordinary case, but the agreement must be in writing **[primary]** [law §24](https://www.nevo.co.il/law_html/law00/204508.htm); [Directive 368 v6, §57א–57ב](https://www.boi.org.il/media/k1dl4le3/2778.pdf).

---

## 3. Coverage and phases

### 3.1 Who must give access

Banks and card companies ("חברת כרטיסי אשראי" – "סולק, שהוא גם מנפיק כרטיס חיוב") must give access as data sources **[primary]** [Directive 368 v6, definitions and §3](https://www.boi.org.il/media/k1dl4le3/2778.pdf).

The Bank of Israel's list of developer portals, dated 19.1.2025, is below **[primary]** [BOI](https://www.boi.org.il/media/ok4p5qxq/%D7%A7%D7%99%D7%A9%D7%95%D7%A8%D7%99%D7%9D-%D7%9C%D7%A4%D7%95%D7%A8%D7%98%D7%9C-%D7%94%D7%9E%D7%A4%D7%AA%D7%97%D7%99%D7%9D.pdf). The PDF's text layer offsets the two columns by a row, so the pairings are my reading of it.

| Source                       | Developer portal                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Discount                     | http://www.openbanking.co.il/open-banking → [developer.discountbank.co.il](https://developer.discountbank.co.il/openapi/user/login) |
| Mercantile                   | https://www.mercantile.co.il/MB/openbanking                                                                                         |
| Hapoalim                     | https://poalimdev.co.il                                                                                                             |
| Leumi                        | http://www.leumiopenbanking.co.il                                                                                                   |
| Mizrahi-Tefahot              | https://devportal.sboapi.mizrahi-tefahot.co.il/mizrahi-tefahot-sandbox/sboapi/open_banking_lp                                       |
| First International & Massad | https://devapi.test.fibi.co.il/fibi/sb                                                                                              |
| Yahav                        | https://apiportal.yahav.co.il                                                                                                       |
| Jerusalem                    | https://apiportal.bankjerusalem.co.il/                                                                                              |
| One Zero                     | https://www.onezerobank.com/lp/one_zero_dev_portal/                                                                                 |
| Isracard and Amex            | https://openbanking.isracardgroup.co.il (redirects to marketing.isracard.co.il/developer-portal)                                    |
| Cal                          | https://www.cal-online.co.il/ecredit/financial-terms/dev-portal/                                                                    |
| Max                          | https://developers.max.co.il/max/openbanking                                                                                        |
| bit, Pepper                  | https://developer.bitpay.co.il, https://www.pepperopenbanking.co.il                                                                 |

- **Amex** is part of the Isracard group: the portal is "פורטל המפתחים של הבנקאות הפתוחה של ישראכרט ואמריקן אקספרס" **[primary]** [Isracard portal](https://marketing.isracard.co.il/developer-portal/).
- **Diners** is not named on any list. It is issued by Cal, so it is presumably served through Cal's portal. **UNCONFIRMED**.

### 3.2 What data, and since when

The law's data baskets (Third Schedule, part א', for banks and auxiliary corporations) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm):

1. A shekel payment account, "ובכלל זה פירוט יתרות בחשבון ופירוט כלל החיובים והזיכויים".
2. A foreign-currency account, likewise.
3. A debit card, "ובכלל זה פירוט החיובים והזיכויים באמצעות הכרטיס והעמלות".
   3א. Card acquiring (for merchants).
4. Credit, including balance, interest, fees, repayment dates and liens.
5. Savings and deposits.
6. Securities.

The Bank of Israel's directive breaks these into finer baskets: current-account details, balances, transactions; card information, card balances, card transactions; savings and deposits; credit; securities **[primary]** [Directive 368 v2 (2021), §20](https://boi.org.il/media/an2dckx2/368_2.pdf).

| What                                                                      | Mandatory from                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current-account details, balances, transactions (BOI phase 1)             | **18.4.2021** **[primary]** [circular 2658](https://boi.org.il/media/j2amd45l/h2658.pdf)                                                                                                                                                                                                           |
| Card details, card balances, card transactions; single payment initiation | **31.3.2022** **[primary]** [circular 2692](https://boi.org.il/media/z02m0icl/h2692.pdf)                                                                                                                                                                                                           |
| The law, and access by licensed non-bank providers                        | **14.6.2022** **[primary]** [law §79(א)](https://www.nevo.co.il/law_html/law00/204508.htm)                                                                                                                                                                                                         |
| Credit (loans), savings and deposits                                      | **31.10.2022** **[primary]** [circular 2692](https://boi.org.il/media/z02m0icl/h2692.pdf); [law §79(ב)(1)(א)](https://www.nevo.co.il/law_html/law00/204508.htm)                                                                                                                                    |
| Small corporations; securities                                            | 31.1.2023; 14.6.2023 **[primary]** [law §79(ב)](https://www.nevo.co.il/law_html/law00/204508.htm)                                                                                                                                                                                                  |
| Other corporations                                                        | 14.4.2024 **[primary]** [circular 2778](https://www.boi.org.il/media/k1dl4le3/2778.pdf)                                                                                                                                                                                                            |
| Extended payment initiation (standing orders, bulk, request-to-pay)       | **2.11.2025**. Moved from 1.9.2025 because of "מבצע עם כלביא" and reserve call-ups **[primary]** [circular 2826, 1.9.2025](https://www.boi.org.il/media/hm1d3rxo/h2826.pdf); [BOI standards page](https://www.boi.org.il/roles/supervisionregulation/bank-sup/open-banking/open_banking_standart/) |

Rules for every source **[primary]** [Directive 368 v6, §33.3–§33.4](https://www.boi.org.il/media/k1dl4le3/2778.pdf):

- **History.** At least **12 months** of current-account and card transactions and balances.
- **Freshness.** No more than **30 seconds** behind what the bank's own site shows.

**Standing orders** are not a separate basket. **UNCONFIRMED** whether any source exposes a list of a customer's existing standing orders. The standard's standing-order support concerns _initiating_ them.

### 3.3 What card data contains

From the card-transaction structure in the Bank of Israel's guidelines **[primary]** [IG v1.8, §14.29](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip). The Bank of Israel defines "Conditional" as "the attribute has to be supported by the server if the attribute is supported in the ASPSP online site or app":

| Field                                                       | Meaning (Hebrew gloss from the standard)                                    | Status                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `transactionDate`, `bookingDate`, `valueDate`               | "תאריך התנועה בכרטיס בפועל"; for cards, `valueDate` is the payment due date | conditional; `valueDate` mandatory for non-pending |
| `transactionAmount`                                         | "סכום התנועה" as billed                                                     | mandatory                                          |
| `grandTotalAmount`                                          | "סכום כולל של העסקה, לרבות ריביות ועמלות. לדוגמא: לעסקאות תשלומים"          | conditional                                        |
| `originalAmount`, `currencyExchange`, `markupFee`           | original currency amount, rate, fee                                         | conditional                                        |
| `cardAcceptorName`, `cardAcceptorId`, `cardAcceptorAddress` | merchant name, id, address                                                  | conditional                                        |
| **`merchantCategoryCode`**                                  | "קוד של קטגוריית בית העסק שבו בוצעה העסקה"                                  | conditional                                        |
| `maskedPAN`, `transactionDetails`, `invoiced`               | card, free text, already on a statement                                     | conditional / optional                             |

So **MCC is in the standard**. An issuer must send it if its own app or site shows a category.

- Isracard's published v1.8 card-transaction spec has `merchantCategoryCode` in each booked transaction. It returns a `booked` list only (no `pending`), and the list response has no `cardAcceptorName` field **[primary]** [Isracard, get-card-transactions-list 1.8.0](https://marketing.isracard.co.il/media/jnvdm3ol/get-card-transactions-list_180.yaml). The standard lets a source give some fields only in a separate transaction-detail call ("two steps").
- **UNCONFIRMED** whether Isracard, Cal and Max fill `merchantCategoryCode` with a real ISO MCC or with their own sector code. This matters for the MCC work in `2026-10-09-mcc-sources.md`.

**Upcoming charges and credit lines** **[primary]** [IG v1.8, §14.21](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip); [cards IG v1.8](https://www.boi.org.il/media/unpkbtmy/%D7%AA%D7%A7%D7%9F-%D7%9B%D7%A8%D7%98%D7%99%D7%A1-%D7%97%D7%99%D7%95%D7%91-18.zip):

- `closingBooked` for a card is "invoiced, but not yet paid entries". The Bank of Israel's example shows several `closingBooked` balances, each with its own `referenceDate`: one per billing date.
- `expected` for a card is "invoiced, but not yet paid entries, not yet invoiced but already booked entries and pending items". It is conditional.
- Card details carry `creditLimit`.

Together these are what a "next charge" screen needs. **UNCONFIRMED** how each issuer fills them.

### 3.4 Payment initiation

- **2022.** Single shekel payments from a current account were mandatory for banks from 31.3.2022, under the 2021 version of the directive (§38) **[primary]** [circular 2692](https://boi.org.il/media/z02m0icl/h2692.pdf).
- **The new law.** Non-bank initiators now come under the Payment Services and Payment Initiation Law, 2023. The extended services start on 2.11.2025 **[primary]** [circular 2826](https://www.boi.org.il/media/hm1d3rxo/h2826.pdf).
- **Who holds it.** Six ISA licensees hold initiation approval (table in §2.1).
- **Discount** supports single payments on `masav`, `zahav`, `fp` and `swift`. Its own options sheet says bulk and periodic payments are not supported **[primary]** Discount developer platform documents payments_1.8.pdf and V1.2-Implementer-Options-Discount.xlsx (IO2–IO4), retrieved 2026-10-09. Its payments document does list bulk and periodic endpoints, so this may have changed. **UNCONFIRMED**.

Bookandry does not need initiation.

---

## 4. Technical

### 4.1 Standard and versions

- **Base.** The Bank of Israel's "Open Banking IL" standard is the Berlin Group NextGenPSD2 XS2A Framework v1.3.11 (24.9.2021) with Bank of Israel remarks **[primary]** [IG v1.7](https://boi.org.il/media/s2pjyjfi/boi-implementation-guidelines-v17_16_11_2023.pdf).
- **Current versions.** General **1.8** (January 2024), cards **1.8**, credit and deposits **1.5**, securities **1.1**, debit mandate **1.0**, request-to-pay **2.1**. Each source must also support the previous version for six months after a new one goes live **[primary]** [BOI standards page, updated 11.6.2026](https://www.boi.org.il/roles/supervisionregulation/bank-sup/open-banking/open_banking_standart/); [Directive 368 v6, §7](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Clarifications.** The Bank of Israel's Q&A on the standard is at version 6, 27.3.2025 **[primary]** [BOI Q&A](https://www.boi.org.il/media/yfmimoya/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%95%D7%AA%D7%A9%D7%95%D7%91%D7%95%D7%AA-27032025.pdf).

### 4.2 Consent flow (SCA)

- **SCA.** "In chapter 5.1 the only supported SCA Approaches are OAuth2 and Decoupled with Implicit start". OAuth2 is mandatory, Decoupled optional, and Embedded "forbidden to use"; the Bank of Israel marks `scaRedirect` "not supported" **[primary]** [IG v1.8](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip).
- **What the customer sees.** The customer is sent to their bank's site or app, authenticates there, and approves accounts and baskets (the "OAuth2" flow) **[primary]** [Discount open banking FAQ](https://www.openbanking.co.il/faq/).
- **Verification.** The source asks for the same authentication factors it uses in its own channels, and treats a consent as a high-risk action **[primary]** [Directive 368 v6, §18](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Provider may not take credentials.** "ספק צד ג' לא יבקש מהלקוח את גורמי האימות שלו" **[primary]** [Directive 368 v2, §57](https://boi.org.il/media/an2dckx2/368_2.pdf).
- **Card numbers.** The provider may not ask the customer for the card number either; issuers identify cards by masked PAN **[primary]** [Directive 368 v6, §23.1, §49.4](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Household.**
  - In a joint account, access given by one owner counts as given by all, and all owners are notified **[primary]** [Directive 368 v6, §26א(3)](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
  - For card data the account holder is the person the card was issued to **[primary]** [Directive 368 v2, definitions](https://boi.org.il/media/an2dckx2/368_2.pdf).
  - So each partner consents for their own cards, and one partner can consent for a joint current account.

### 4.3 Consent validity and refresh

- **Law.** Continuing access is for a fixed period of **at most three years** (§26(א)(3)). Every **six months** the provider must check that the customer is aware access continues, or treat the agreement as cancelled (§26(ב)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm). There is no European-style 90- or 180-day re-authentication at the bank.
- **History.** The 2021 directive capped consent at one year (§19) and required cancelling consent after **180 days** without use (§51.9) **[primary]** [Directive 368 v2](https://boi.org.il/media/an2dckx2/368_2.pdf). Both sections are marked "בטל" or absent in the April 2024 version **[primary]** [Directive 368 v6](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Standard.** `validUntil` "9999-12-31" means "the maximum approved date by the regulator" **[primary]** [IG v1.8](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip).

### 4.4 Rate limits on background access

- **The standard.** `frequencyPerDay`, the "maximum frequency for an access without PSU involvement per day", must be "less equal to 4" unless agreed bilaterally **[primary]** [IG v1.8](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip).
- **The law.** A source may charge a provider "החל מהבקשה החמישית של אותו נותן שירות ... באותו היום". All requests within 10 minutes count as one, and requests made while the customer is online do not count (Fifth Schedule). A source may not charge the customer (§46(א)) **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm).
- **Discount** counts frequency on "all" requests per endpoint, so accounts, balances and transactions each count **[primary]** Discount developer platform document V1.2-Implementer-Options-Discount.xlsx (IO47), retrieved 2026-10-09.
- **For Bookandry.** About four background refreshes a day per source, plus unlimited refreshes when the user opens the app.

### 4.5 Certificates and transport

- **TLS.** "BOI remarks: the TLS version is 1.3". mTLS on every call, set up by the provider **[primary]** [IG v1.8](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip); [Directive 368 v6, §41](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Who issues them.**
  - The Bank of Israel guidelines say: "The TPP has to use QWAC certificate issued by Gov CA" and "QSEALC certificate issued by Gov CA". Signing every request is mandatory except within OAuth2 **[primary]** [IG v1.8](https://www.boi.org.il/media/xmufimvl/%D7%92%D7%A8%D7%A1%D7%94-18-%D7%AA%D7%A7%D7%9F-%D7%9B%D7%9C%D7%9C%D7%99.zip).
  - The directive defines a certificate as "תעודה חתומה דיגיטלית, שהונפקה על ידי המאסדר הרלוונטי באמצעות ממשל זמין" **[primary]** [Directive 368 v6, definitions](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
  - The law requires it in its Second Schedule, item 2 **[primary]** [law](https://www.nevo.co.il/law_html/law00/204508.htm).
  - EU eIDAS certificates are not accepted; the Gov CA is the only issuer. The ISA requests them from ממשל זמין on the licensee's behalf **[primary]** [ISA directive, definitions](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-6267b530a26dd/horaha15322.pdf).
- **Kinds** **[primary]** [BOI Q&A v6, §3.4](https://www.boi.org.il/media/yfmimoya/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%95%D7%AA%D7%A9%D7%95%D7%91%D7%95%D7%AA-27032025.pdf):
  - **PRD**: production, issued by "Prod ca", serial "Boi-…".
  - **TST**: for the sources' test environments and for other sources' sandboxes, issued by "Test ca", serial "Boitst-…".
  - **TPRD**: for self-tests in production only.
- **Subject fields.** Up to three domains per certificate (Q&A §3.6). The certificate's Organization Name is the provider's name and Organization Unit is the app's name, which the bank shows the customer on the consent screen (§3.8). Requests and notifications go to the domain in the certificate, and the provider must keep owning it while consents are live **[primary]** [Directive 368 v6, §55.8](https://www.boi.org.il/media/k1dl4le3/2778.pdf).
- **Discount's sign-up form** asks for Organization, Organization Unit and Organization Identifier, which are the same subject fields **[primary]** [Discount developer portal, registration form](https://developer.discountbank.co.il/openapi/user/register).

### 4.6 Sandboxes: who gets in

- **The Bank of Israel.** Sources must let "בעלי סרטיפיקט מתאים" test in a sandbox, and must put future versions there a month before production **[primary]** [Directive 368 v6, §8א](https://www.boi.org.il/media/k1dl4le3/2778.pdf). The sandbox duty for the new payment features applied from 5.10.2025 **[primary]** [circular 2826](https://www.boi.org.il/media/hm1d3rxo/h2826.pdf).
- **Isracard and Amex.** "לאחר שמציגים לישראכרט סרטיפיקט רשמי מהרגולטור, אפשר להתנסות בשירותי ה-API בסביבת הבדיקות". Access is for "חברות שמחזיקות בתעודה ייעודית מהרגולטור". The service is free "בשלב הזה" **[primary]** [Isracard developer portal FAQ](https://marketing.isracard.co.il/developer-portal/).
- **Discount.**
  - "חברות שברשותן תעודות שהונפקו ע"י ממשל זמין, יוכלו ליהנות מגישה לשירותי ה-API".
  - "לאחר בחינת הבקשה ואישורה תינתן גישה לסביבת ה-Sandbox". Production follows bank approval and "חתימה של החברה המפתחת על הסכם מתאים".
  - "אם ברשותכם תעודות שהונפקו על ידי ממשל זמין ... תוכלו להיכנס ישירות לפורטל".
  - The regulated APIs are free for certificate holders.
  - Large companies can also use the platform to connect their ERP to their **own** accounts. This is a separate, non-regulated use **[primary]** [Discount open banking FAQ](https://www.openbanking.co.il/faq/).
  - The registration form offers customer types "PSD2 Open Banking", "Bussines Line", "Partners" and "cloud" **[primary]** [registration form](https://developer.discountbank.co.il/openapi/user/register).
- **Self-signed certificates.** **UNCONFIRMED** whether Discount's sandbox accepts a self-signed certificate. Neither Discount's FAQ nor the documents retrieved on 2026-10-09 say so, and the Bank of Israel's certificate table has no self-signed kind. The non-PSD2 customer types ("Business Line", "Partners") may be what a self-signed certificate is meant for. They concern a company's own accounts, not consumers' data. Ask Discount (discountTpp_openbanking@dbank.co.il, from the BOI approvals list) before investing more.
- **Hapoalim.** "Service providers with an Israeli PSD2 license may use Bank Hapoalim's APIs"; it lists a sandbox **[primary]** [poalimdev.co.il](https://poalimdev.co.il).
- **Max.** "It's free to join"; the sandbox terms are not on its landing page **[primary]** [Max portal](https://developers.max.co.il/max/openbanking).
- **Leumi, Cal, Mizrahi, FIBI and the rest:** not read. **UNCONFIRMED**.

### 4.7 Discount's implementation, from its own documents

**Endpoints** **[primary]** Discount developer platform document GetStarted-v1.pdf, retrieved 2026-10-09:

- **Sandbox APIs.** `https://mtls-api-nonprod.discountbank.co.il/devapi/cert`. OAuth for consents at `…/psd2/v1.0.6/consent/token` (mTLS host) and `https://api-nonprod.discountbank.co.il/devapi/cert/psd2/v1.0.6/consent/authorize`.
- **Production.** `https://mtls-api.discountbank.co.il/prod/d`, with the same paths.
- **Mercantile**, which is in the Discount group, mirrors all of these on `mercantile.co.il` hosts.

**Options Discount chose** **[primary]** Discount developer platform document V1.2-Implementer-Options-Discount.xlsx, sheet ImplOpt, retrieved 2026-10-09:

- **IO1.** The provider must sign requests, but "במוצר עו"ש לא תתבצע בדיקה של החתימה הדיגיטלית" (signatures are not checked for current-account data).
- **IO5–IO6.** SCA by OAuth2 only. Redirect and Decoupled are not supported, Embedded is forbidden, and there is no OAuth pre-step.
- **IO15.** PSU-ID is mandatory in consent and payment requests.
- **IO17.** One currency per account.
- **IO18.** Discount's column: "משתמשים בשדה ה IBAN" (accounts are identified by IBAN). The Bank of Israel column next to it requires a masked PAN for cards.
- **IO30.** "List of available accounts" is supported; with balances, no.
- **IO31.** JSON only.
- **IO32.** No `withBalance` and no single-transaction endpoint.
- **IO33.** No `bookingStatus=pending`, no `both`, no `deltaList`, no `entryReferenceFrom`.
- **IO34.** Balance types `closingBooked`, `expected`, `forwardAvailable`.
- **IO42.** Card numbers are not supported as sub-account ids.
- **IO47.** Frequency counts "all" requests.
- **IO51.** Discount can revoke consent outside the API (`suspendedByASPSP`, `blockedByASPSP`).

**Consents** **[primary]** Discount developer platform document consents_1.8.pdf, retrieved 2026-10-09:

- **Endpoints.** `POST /v1/consents`, `GET /v1/consents/{id}`, `GET …/status`, `DELETE …`.
- **Request headers.** `X-Request-ID`, `PSU-ID`, `PSU-ID-Type` (Retail or SME), `PSU-Corporate-ID` and its type (for companies), `TPP-Redirect-URI`, `TPP-Nok-Redirect-URI`, `PSU-IP-Address`.
- **Body.** `access` with `accounts`, `balances`, `transactions`, and `restrictedTo` taking **CACC, CARD, LOAN, SVGS, SCTS**; `recurringIndicator`; `validUntil`; `frequencyPerDay`; `combinedServiceIndicator` (only `false`).
- **Values.** The document gives no allowed values or maximum for `validUntil` or `frequencyPerDay`, so the standard's limits (§4.3–§4.4) apply. **UNCONFIRMED** whether Discount caps them lower.
- **Timeout.** A consent the customer does not approve moves from `received` to `rejected` after **5 days**.
- **Account number.** Use the account number shown in the customer's profile, not an older account number.

**Accounts** **[primary]** Discount developer platform document accounts_1.8.pdf, retrieved 2026-10-09:

- **Scope.** The document covers current accounts (עו"ש) only, `cashAccountType` CACC.
- **Endpoints.** `GET /v1/accounts`, `/{id}`, `/{id}/balances`, `/{id}/transactions`.
- **Account fields.** `resourceId`, `iban`, `currency`, `ownerName`, `name`, `displayName`, `usage`. When an account moves branch, the `resourceId` stays and the IBAN changes.
- **Balances.** `closingBooked` and `forwardAvailable`, with `referenceDate` and `creditLimitIncluded`.
- **Transactions.** `bookingStatus=booked` only, with `dateFrom`, `dateTo` and paging at **200 per page** via `_links.next`. Each transaction has `transactionId`, `entryReference`, `bookingDate`, `valueDate`, `transactionAmount`, `currencyExchange` and `remittanceInformationUnstructured` (the description text). **There is no MCC or merchant category on current-account transactions.**
- **Headers.** The read calls list `X-Request-ID`, `PSU-IP-Address`, `Consent-ID` and `Authorization`. `Digest`, `Signature` and `TPP-Signature-Certificate` are not listed for consents or accounts. They are listed on every payment call **[primary]** Discount developer platform document payments_1.8.pdf, retrieved 2026-10-09. This fits IO1: signing is required by the standard but not checked for current-account data.

**Cards at Discount.**

- Consents accept `CARD`, and the standard identifies cards by masked PAN (IO18, Bank of Israel column). But no card-account specification was among the documents retrieved, so **UNCONFIRMED** whether Discount serves bank-issued card transactions itself.
- Under the directive, a consent at a bank for "cards issued by the bank" in that account covers all of them (Directive 368 v2, §21). Card detail such as MCC usually lives with the issuer (Cal for most Discount cards), and Cal is a source in its own right.

**Sandbox data** **[primary]** Discount developer platform document berlin-sandbox-configuration-Discount.docx, retrieved 2026-10-09:

- For each service (consents, payment initiation, debit mandate, request-to-pay) there is one retail PSU-ID whose every request is approved, one whose every request is refused, and one company (SME) PSU-ID that is approved.
- The approved retail consent covers three test current accounts (IBAN plus resourceId). The company covers one.
- No card accounts are listed.
- The document does not describe how a provider's certificate is registered.

### 4.8 What Bookandry would build first against Discount's sandbox

All of this needs a sandbox certificate Discount accepts. Per §4.6 that is most likely a Gov CA test certificate, which needs a pending ISA application. It touches only fictitious data, so it is a technical spike, not a feature.

1. **A server-side connector.** It holds the client certificate and private key, opens mTLS (TLS 1.3) to the `mtls-api-nonprod` host, and signs requests (`Digest`, `Signature`, `TPP-Signature-Certificate`) even though Discount does not check them for current accounts.
   - In production the key must sit in an HSM and run only on Bookandry's own machines (Directive 368 v6, §55.7, §55.9). So "a Supabase Edge Function with the key in an environment variable" is fine for the sandbox and **not** for production.
   - Whether Cloudflare Workers or Supabase Edge Functions can present a client certificate and use an HSM-backed key is **UNCONFIRMED**. Check before choosing.
2. **Consent.**
   - Send `POST /v1/consents` with `PSU-ID` (mandatory) and `PSU-ID-Type: Retail`, asking for accounts, balances and transactions on CACC, `recurringIndicator: true`, `validUntil` (try "9999-12-31" and read back the adjusted date), and `frequencyPerDay: 4`.
   - Send the user to `/consent/authorize`, take the code back at the redirect URI, and exchange it at `/consent/token` over mTLS.
   - Store `consentId`, the token and `validUntil` per household member.
   - Show the user the bank's 5-day approval window.
3. **Read.** Fetch `GET /v1/accounts` and, per account, `balances` (`closingBooked`, `forwardAvailable`). Then fetch `transactions` with `bookingStatus=booked` and a date range, following `_links.next` 200 at a time.
4. **Map into Bookandry.**
   - Map `transactionId` / `entryReference` to a stable external id for dedup against rows from Smart import, `remittanceInformationUnstructured` to the description that the merchant-recognition code already reads, and `bookingDate` / `valueDate` to dates.
   - Card charges on the current account arrive as one monthly debit. The per-purchase detail and any MCC come from Cal, Isracard or Max consents, not from Discount.
5. **Scheduler.** At most 4 background pulls a day per consent (IO47 counts each endpoint), plus a pull when the user opens the app. Handle `suspendedByASPSP`, `blockedByASPSP`, revoked and expired consents, and the six-monthly "access is still on" check (law §26(ב)).
6. **Test both sandbox outcomes**: the always-approved and always-refused PSU-IDs.

---

## 5. Roadmap

### Option A: a narrow licence, plus a licensed aggregator

**Steps:**

1. Talk to Open Finance, Feezback and Finanda about price per connected user or per call, consumer-app terms, coverage of every bank and Isracard, Cal and Max, whether MCC is passed through, and whether they will contract under §29(א)(3).
2. Get counsel's view, and an ISA pre-filing meeting, on a "use data collected by another" licence for a household app. Cover: insurance or deposit amount, officers, auditor's opinion, and whether a test certificate is even needed when Bookandry never calls a bank.
3. Set up the company side: an Israeli company, a control permit for its owners, an information-security officer (may be the CEO or outsourced), a risk officer, policies, and a privacy-regulation "medium" security level.
4. File on Magna, pay ₪6,350, and get the licence.
5. Sign a written data agreement with the aggregator (Directive 368 v6, §57א) and a §26 customer agreement in the app.
6. Integrate one aggregator API instead of 15 bank APIs.

**Cost:**

- ISA fees: ₪6,350, then ₪16,940 a year **[primary]** [fee notice](https://www.new.isa.gov.il/images/Fittings/isa/asset_library_pic/al_lobby/al_lobby-63b3dc4fa5dd2/FeeAdjustmen.pdf).
- Insurance or deposit: from about ₪400,000 cover (§1.3). The premium is **UNCONFIRMED**.
- Aggregator fees: not public.
- Legal, audit and security work: not sourced.

**Timeline:** an assumed 6–12 months for the licence (§1.4), then weeks to integrate.

**Obligations on the app:** the full set in §1.3, including:

- the §26 written agreement and six-monthly check;
- three-year retention and deletion;
- security incidents reported to the ISA and the Privacy Protection Authority;
- seven years of logs;
- data abroad only at a GDPR-equivalent level and with notice to users. Supabase's hosting region would need to meet this.

**Why it fits:** one integration covers all sources, and the aggregator carries the bank certificates, HSM and per-bank quirks.

### Option B: a full licence, collecting directly

**Steps:** as in A, plus:

- the collect-and-use service type;
- test and production QWAC/QSealC from the Gov CA via the ISA (form י100);
- an HSM;
- sandbox and production onboarding with each bank and card company. Discount, for example, requires a signed agreement before production (§4.6);
- building and maintaining about 15 integrations at 1.8-level differences. Discount alone diverges in a dozen ways (§4.7).

**Cost:** the same regulatory costs as A, plus engineering, the HSM, and the auditor's opinion on key storage. Sources may charge from the fifth daily request (law, Fifth Schedule). Isracard and Discount are free "בשלב הזה" or "ללא עלות" **[primary]** [Isracard](https://marketing.isracard.co.il/developer-portal/); [Discount FAQ](https://www.openbanking.co.il/faq/).

**Timeline:** the licence, then months of integration per source. **When it fits:** only at a scale where aggregator fees exceed the cost of running the integrations.

### Option C: interim, statement import (no licence)

**Steps:**

- Make Smart import read every issuer's and bank's export: Excel, CSV and PDF, Hebrew headers, sectors and MCC columns where present. Some of this work is already in the repo; see `2026-10-09-mcc-sources.md`.
- Add a guided "download this month's file" flow per issuer.
- Dedupe repeated imports.
- Add a monthly reminder.

**Cost:** engineering only. **Timeline:** now.

**Obligations:** the Privacy Protection Law and its Data Security Regulations, 2017 still apply to the household data Bookandry holds. My reading is that the open-banking licence does not, because there is no access through the interface (§1.1). **UNCONFIRMED**.

**Not allowed:** logging into banks with users' credentials, on a server or in the app, as a business (§60).

### Recommendation

**Do C now and prepare A.**

- **C** improves the app today with no legal risk.
- **A** is the only route to live data that does not mean building and certifying 15 bank integrations. It needs a licence either way, because §29 lets an aggregator hand data only to another licensed provider.
- **Before spending on A,** get three answers: the aggregators' prices, the ISA's actual requirements for a "use only" licence (insurance amount above all), and counsel's view on whether any white-label route exists.
- **If the insurance and annual costs are out of reach** for a single-household-scale product, stay on C. Revisit when the user base justifies about ₪60–100k a year of regulatory overhead. That band is my estimate from the sourced fees and insurance floors, not a sourced figure.
- **Stop work on Discount's sandbox until a Gov CA test certificate exists.** The self-signed certificates do not get Bookandry into the regulated API.

---

## Open questions

1. Whether the ISA applies lighter requirements to a licence for "use of data collected by another" only. In particular: the insurance or deposit amount (₪400,000 or ₪1,000,000 under Appendix 6), and whether such a licensee needs a Gov CA certificate at all.
2. Whether any lawful white-label or "licence as a service" model exists, in which a licensed aggregator is the provider and Bookandry supplies the app. §29(א)(3) and the ISA directive's §34 suggest not.
3. How long ISA licence applications take in practice, from filing to grant.
4. Whether Discount's sandbox accepts a self-signed certificate for any customer type, and what "Business Line", "Partners" and "cloud" are for.
5. Whether Discount exposes bank-issued card accounts and card transactions (consents accept CARD, but no card spec was retrieved), and the maximum `validUntil` and `frequencyPerDay` it accepts.
6. Whether Isracard, Cal and Max fill `merchantCategoryCode`, and with ISO MCCs or their own sector codes, and whether they return future-dated `closingBooked` balances for upcoming billing dates.
7. Aggregator pricing, card-company coverage and MCC pass-through for Open Finance, Feezback and Finanda. None is public.
8. Whether any source exposes a customer's existing standing orders (הוראות קבע) as data.
9. Whether Diners data is served through Cal's portal.
10. Whether "Kima" or "Q" exist as licensed providers under other names.
11. Whether the 2026 draft cutting ISA annual fees by 25% was adopted, and the final text of the February 2025 amendment memo.
12. Whether Cloudflare Workers or Supabase Edge Functions can do mTLS with an HSM-held key, as production would require.
13. Whether statement import really falls outside the law. That is my reading of "איסוף"; no regulator statement was found.
