# Zakat method: sources and open gaps (internal, not published)

Status: preparation only. Not a fatwa, not reviewed by a scholar. The calculator is not wired into any public page.
Method name in code: `elewa-annual-date`. Built on Dr. Basem Elewa's individual-zakat approach, chosen by the site owner.

## Rules and where each comes from
| Rule | Source | Elewa? |
|---|---|---|
| One pooled base (gold, cash, other zakatable assets), 2.5% of the whole base, fixed personal Hijri zakat date, no tracking during the year | Petroli podcast (Baheth 474403) | Yes |
| Nisab 85 g of 24k, Hijri year, full ownership | LinkedIn post 2024-09-22 | Yes |
| Jewelry: purpose at purchase decides. Bars, coins, scrap always zakatable | LinkedIn post 2026-08-23 | Yes |
| What exists on the zakat date counts, whether it rose or fell; no hawl per addition | LinkedIn posts 2025-01-02, 2024-09-01 | Yes |
| Adornment exemption conditions (lawful, present use, customary amount, wearable); broken jewelry zakatable with a new hawl from the break | Contemporary zakat issues symposium (al-Zuhayli, Fiqh al-Islami) | No, borrowed |
| Change of purpose to saving or trade starts the hawl at the intention date | Dar al-Ifta Egypt fatwa 20631 (quoting Ibn Qudama) | No, borrowed |
| Broken jewelry kept for repair | Malik (Muwatta 675) vs symposium: they differ | Not addressed, engine blocks |
| 2-day sighting margin on the hawl end | Dahabology product gate | Not fiqh |

## Engine behavior on gaps (fails closed, no amount given)
- First hawl, total may have dipped below nisab: BLOCKED unless the user confirms it stayed at or above nisab. Elewa (Baheth 474403 ~07:01) says not to follow in-year changes when using a fixed date, but nothing found from Elewa addresses a first-year dip, so that statement is quoted here and NOT extended. The schools differ (Kuwaiti Fiqh Encyclopedia vol. 18, "ma yaqta hukm al-hawl": Maliki, Shafii, Hanbali and Zufar require the nisab all year for gold and silver; Hanafi require it at both ends only). None of this is Elewa. Needs a specialist.
- Later years: earlier years' payment status not modeled; user must confirm settled.
- Zakat date on Hijri day 30 when the month has 29 days: no source found. The account UI asks for a fixed day 1 to 29 (Elewa tells each person to pick a fixed date, e.g. 1 Ramadan). The engine still blocks if day 30 is given and absent, and if the nisab date is day 30 with no day 30 a year later.
- Broken jewelry kept for repair: blocked. Shafii sources (al-Bayan; al-Hawi) and Hanbali (Kashshaf al-Qina) differ from each other and from Malik, and all assume intention-of-use rules, not Elewa's intention-at-purchase rule.
- Sold items, debts beyond one net figure, cash history: not modeled.
- Legacy `zakat()` multi-method function stays as a comparison tool; it has no defaults and blocks unless every method is chosen.

## Who answers what
The user can answer (facts about his own gold): purchase date, karat, grams, purpose at purchase, whether worn, funds source, when the cash reached nisab, whether he stayed above nisab, whether earlier years were paid, his personal zakat date.
Needs source or scholar grounding (not the user's choice): the four gaps above and the borrowed rules. The user should not be asked to pick between rulings.

## Integration (local branch, not published)
Gold list items carry purpose, adornment checks, change-of-purpose date, and broken-jewelry date and plan. Zakat settings (price, date, other assets, prior years) live in users/{uid}/zakat/settings, covered by the existing rules. Not offered: Gregorian-date option (Elewa allows it with 2.5775%), silver and trade goods modeled beyond one net figure, sold items.
