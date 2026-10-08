# Brand logos: where each came from

The logos are their owners' trademarks. Bookandry uses them only to label which bank or card company a card or
account belongs to, and which network a card runs on. None is free-licensed artwork unless the row says so.

Each file was fetched on 2026-10-08, cleaned (no script, no external references), and run once through
`svgo@3 --multipass`. `src/data/brands.test.ts` scans every file here for script, event handlers, external links,
`@import` and entities, and holds each to 64 KB and the set to 300 KB.

| Brand                           | File                                      | Source                                                              | Terms                                                                                                      | Fetched    |
| ------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| Bank Leumi                      | bank-10.svg                               | https://he.wikipedia.org/wiki/File:LeumiBank2026.svg                | Hebrew Wikipedia local file, "fair use of logo"; trademark of Bank Leumi, not free-licensed                | 2026-10-08 |
| Bank Hapoalim                   | bank-12.svg                               | https://www.bankhapoalim.co.il/api/media/l3hlwykh/logo-poalim-1.svg | Brand website SVG (mark only); trademark of Bank Hapoalim, no open licence                                 | 2026-10-08 |
| Mizrahi-Tefahot                 | bank-20.svg                               | https://www.mizrahi-tefahot.co.il/media/vlwlbdf2/logo.svg           | Brand website SVG (mark only); trademark of Mizrahi-Tefahot Bank                                           | 2026-10-08 |
| Israel Discount Bank            | bank-11.svg                               | https://he.wikipedia.org/wiki/File:DiscountBank.svg                 | Hebrew Wikipedia local file, "fair use of logo"; trademark of Israel Discount Bank, not free-licensed      | 2026-10-08 |
| Mercantile Discount Bank        | bank-17.svg                               | https://he.wikipedia.org/wiki/File:Mercantile.svg                   | Hebrew Wikipedia local file, "fair use of logo"; trademark of Mercantile Discount Bank, not free-licensed  | 2026-10-08 |
| First International Bank (FIBI) | bank-31-wordmark.svg                      | https://he.wikipedia.org/wiki/File:הבנק_הבינלאומי.svg               | Hebrew Wikipedia local file, "fair use of logo"; trademark of FIBI, not free-licensed                      | 2026-10-08 |
| Bank PAGI                       | bank-52-wordmark.svg                      | https://he.wikipedia.org/wiki/File:בנק_פאגי.svg                     | Hebrew Wikipedia local file, "fair use of logo"; trademark of the FIBI group, not free-licensed            | 2026-10-08 |
| Bank Otsar HaHayal              | bank-14-wordmark.svg                      | https://he.wikipedia.org/wiki/File:בנק_אוצר_החייל.svg               | Hebrew Wikipedia local file, "fair use of logo"; trademark of the FIBI group, not free-licensed            | 2026-10-08 |
| U-Bank                          | bank-26.svg                               | https://he.wikipedia.org/wiki/File:U-Bank.svg                       | Hebrew Wikipedia local file, "fair use of logo"; trademark of the FIBI group, not free-licensed            | 2026-10-08 |
| Bank Massad                     | bank-46-wordmark.svg                      | https://he.wikipedia.org/wiki/File:MassadBank.svg                   | Hebrew Wikipedia local file, "fair use of logo"; trademark of Bank Massad, not free-licensed               | 2026-10-08 |
| Bank Yahav                      | bank-4.svg                                | https://he.wikipedia.org/wiki/File:בנק_יהב.svg                      | Hebrew Wikipedia local file, "fair use of logo" (mark only); trademark of Bank Yahav, not free-licensed    | 2026-10-08 |
| One Zero                        | bank-18.svg                               | https://he.wikipedia.org/wiki/File:ONE_ZERO.svg                     | Hebrew Wikipedia local file, "fair use of logo" (mark only); trademark of One Zero, not free-licensed      | 2026-10-08 |
| Isracard                        | issuer-isracard.svg, network-isracard.svg | https://www.isracard.co.il/ (inline header SVG, mark only)          | Brand website SVG; trademark of Isracard, no open licence                                                  | 2026-10-08 |
| Cal                             | issuer-cal.svg                            | https://he.wikipedia.org/wiki/File:Cal_logo_2019.svg                | Hebrew Wikipedia local file, "fair use of logo"; trademark of Israel Credit Cards (Cal), not free-licensed | 2026-10-08 |
| Max                             | issuer-max.svg                            | https://www.max.co.il/assets/images/homepage/logo-max-black.svg     | Brand website SVG; trademark of Max It Finance, no open licence                                            | 2026-10-08 |
| American Express                | issuer-amex.svg, network-amex.svg         | https://cdn.jsdelivr.net/npm/simple-icons/icons/americanexpress.svg | Simple Icons, CC0 icon data; trademark of American Express                                                 | 2026-10-08 |
| Diners Club                     | issuer-diners.svg, network-diners.svg     | https://cdn.jsdelivr.net/npm/simple-icons/icons/dinersclub.svg      | Simple Icons, CC0 icon data; trademark of Diners Club International                                        | 2026-10-08 |
| Visa                            | network-visa.svg                          | https://cdn.jsdelivr.net/npm/simple-icons/icons/visa.svg            | Simple Icons, CC0 icon data; trademark of Visa Inc.                                                        | 2026-10-08 |
| Mastercard                      | network-mastercard.svg                    | https://commons.wikimedia.org/wiki/File:Mastercard_2019_logo.svg    | Wikimedia Commons, public domain (ineligible for copyright); registered trademark of Mastercard            | 2026-10-08 |

The FIBI-group banks (31, 52, 14, 46) share one zigzag mark, so the app shows each by its wordmark;
`brandLogo` in `src/data/brands.ts` makes that choice. U-Bank has only a wordmark.
