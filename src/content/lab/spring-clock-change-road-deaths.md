---
title: "The lost hour: does the spring clock change cost lives on the road?"
type: "research study"
series: "human-variable"
status: "live"
question: "Does the spring clock change cost lives on US roads in the work week that follows it?"
payer: "Road-safety agencies, insurers and fleet operators planning the week after the change, and legislators weighing permanent daylight saving time against permanent standard time."
dataSource: "NHTSA Fatality Analysis Reporting System (FARS), national accident files 1996-2024 from https://static.nhtsa.gov/nhtsa/downloads/FARS/, downloaded 17 Nov 2026; IANA Time Zone Database release 2026f (US rules and zones); sun position computed for each crash."
dataLicence: "FARS: US federal government work (17 U.S.C. 105); its Data.gov record lists rights as public. NHTSA's own terms page was not verified. IANA tz data: public domain."
dataFreshness: 2026-11-17
synthetic: false
limits: "Counts of fatal crashes only, by day, not exposure. 28 years pooled; a single year is too noisy to read. The comparison group is two small states. A placebo date also shows a rise after 2007. The season-long effect of evening light is not estimated yet."
runningCost: "US$0 a month. A fixed snapshot: the page reads saved files. No scheduled job and no live service."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/57"
published: 2026-11-17
---

## The Provocation

Every March, most of the United States moves its clocks forward one hour. By law, millions of people lose an hour of sleep on the same night and go to work on Monday as if nothing happened.

We talk about attention as if it were discipline. But it runs on a body, and it is paid for with last night's sleep. If attention is that physical, a small deficit shared by millions should show up somewhere, and the road is where a lapse of a second is least forgiving.

So this lab asks one question: when a country loses an hour of sleep together, does it cost lives?

<details class="dst-essay">
<summary>Read the full essay</summary>

Every March, most of the United States moves its clocks forward one hour. On the same night, by law, millions of people lose an hour of sleep and go to work on Monday as if nothing happened. Most of us remember it as a heavy morning and an oven clock that stays wrong for weeks.

I grew up in a country that used to change its clocks every summer. I now live in one that never does. Seen from here, the ritual looks stranger than it felt then. The clock looks like a fact of nature, but it is an agreement, a line in a statute. Our bodies never signed it. They keep running on the sun.

I have been thinking a lot about attention lately: where it goes, what it costs, and how much of it is really a choice. We talk about attention as if it were discipline, something we decide where to point. But it runs on a body. It is spent in the present and paid for with the sleep we had, or didn't. You cannot borrow it from tomorrow or save yesterday's.

That makes the spring change an experiment nobody designed. A whole country gives up the same hour on the same night. No one person loses much: an hour is less than a commute, less than a meeting that could have been an email. If attention were only willpower, nothing should happen.

But if attention is as physical as I suspect, a small deficit shared by millions should show up somewhere. And there is one place where a lapse of a second is least forgiving: the road.

I want to keep the question open rather than answer it in advance. The same law that takes an hour of sleep in March moves an hour of daylight into the evening, when roads are busy and darkness is dangerous. The clock might take lives in the first week and give them back over the summer. Both can be true. Which is larger is a question about numbers, not about how a Monday feels.

Underneath sits a quieter question. Some truths about people can't be seen from inside one life. I could log my tired mornings for years and never find what a population reveals in a single week. To see the human variable, you sometimes have to step back far enough that no individual is visible at all.

That is what The Human Variable is for. It takes questions about how people actually behave, the kind I tend to argue with myself about, and tests them on data about many people, with the limits stated. The first one starts with an hour.

</details>

## What We Know

### The first week: lost sleep

Fritz, Vetter and colleagues counted 732,835 fatal crashes in FARS from 1996 to 2017, leaving out Arizona and Indiana. Fatal crashes ran 6% higher in the work week after the spring change, more than 8% higher in the western parts of time zones, and the rise moved to March with the 2007 change of date. They put the cost at about 28 deaths a year ([University of Colorado Boulder release, 30 January 2020](https://www.colorado.edu/today/2020/01/30/spring-forward-daylight-saving-time-brings-surge-deadly-crashes); paper in *Current Biology*, 2020, not verified).

Smith used the timing of the change and the 2007 move of its date. His abstract estimates that from 2002 to 2011 the spring change caused over 30 deaths a year, and attributes the risk to lost sleep, not to the change in light ([AEJ: Applied Economics 8(2):65–91, 2016, EconPapers record](https://econpapers.repec.org/RePEc:aea:aejapp:v:8:y:2016:i:2:p:65-91)). The full paper and its replication files were not opened.

### The season: evening light

Ferguson and colleagues tabulated fatal crashes in 6-hour periods around sunrise and sunset. They estimated that year-round daylight saving time might have prevented 901 fatal crashes from 1987 to 1991, 727 of them involving pedestrians ([American Journal of Public Health, 1995, IIHS bibliography record](https://www.iihs.org/topics/bibliography/ref/944)).

Coate and Markowitz used county-level FARS data for two-week periods in 1998 and 1999. Their abstract estimates that year-round daylight saving time would cut pedestrian deaths in the 5–10 a.m. and 4–9 p.m. windows by 171 a year (13%) and vehicle occupant deaths by 195 a year (3%) ([Accident Analysis & Prevention 36(3):351–357, 2004, Europe PMC record](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:15003579%20AND%20SRC:MED&resultType=core&format=json)).

### Where they pull apart

The first two studies measure a short cost from lost sleep. The last two measure a longer gain from moving light into the evening rush. Only the abstracts or press releases were read for all four, so their methods are described here as their summaries state them. This page tests the first week. The season is not tested yet.

## The Experiment

### Result

**Fatal crashes in states that change their clocks were 7.4% higher in the work week after the spring change than on the same weekdays in the weeks around it** (rate ratio 1.074, 95% interval 1.045 to 1.104). That is 11,524 crashes on 140 work-week days against 32,189 on 420 comparison days, 1996 to 2024 without 2020. It works out at about 28 extra fatal crashes a year (interval 17 to 40) and 30 extra deaths a year (interval 17 to 43).

<div data-lab-chart="dst"></div>

Each line is fatal crashes on that day divided by the average for the same weekday in the comparison weeks, summed over the years shown. 1.0 is an ordinary day. 2020 is left out of both observing-state lines and the Arizona and Hawaii line. Arizona and Hawaii together have about 40 fatal crashes on the 15 comparison days of a year, so their line moves a lot from day to day.

### The three comparisons

| Comparison | Years | Work-week crashes | Comparison crashes | Rate ratio (95% interval) |
| --- | --- | --- | --- | --- |
| Observing states, change in April | 1996–2006 (11) | 4,881 on 55 days | 13,854 on 165 days | 1.057 (1.007 to 1.109) |
| Observing states, change in March | 2007–2024 without 2020 (17) | 6,643 on 85 days | 18,335 on 255 days | 1.087 (1.055 to 1.123) |
| Arizona and Hawaii, same dates | 1996–2024 without 2020 (28) | 356 on 140 days | 1,120 on 420 days | 0.954 (0.827 to 1.079) |
| Placebo: second Sunday of March, change still in April | 1996–2006 (11) | 4,329 on 55 days | 13,246 on 165 days | 0.980 (0.943 to 1.017) |
| Placebo: first Sunday of April, change already in March | 2007–2024 without 2020 (17) | 6,663 on 85 days | 18,992 on 255 days | 1.052 (1.021 to 1.083) |

- **The rise moves with the date.** Before 2007 it came after the April Sunday and not after the March one (0.980). From 2007 it comes after the March Sunday.
- **States without a change show no rise.** Arizona and Hawaii: 0.954. Their interval is wide, and the ratio of the two groups' rate ratios is 1.126 (0.987 to 1.308), which does not rule out no difference.
- **The rise holds in recent years.** 2007–2015: 1.096 (1.050 to 1.143). 2016–2024 without 2020: 1.078 (1.037 to 1.130).

### By level of detail

- **Years.** One year is too few crashes to read. The single-year ratio ranges from 0.891 (2002) to 1.234 (2024), and 5 of 29 years are below 1.0. Only the pooled years give an interval that excludes 1.0.
- **Days.** The rise in observing states lasts the whole work week after the March change (1.061 to 1.103 each day since 2007) and fades after the Wednesday when the change was in April.
- **Hours.** Most of the rise is in the morning. Crashes from 05:00 to 09:59 clock time: 1.123 (1.061 to 1.183), 2,084 against 5,565. From 16:00 to 20:59: 1.040 (0.996 to 1.087), 3,119 against 8,996.
- **Minutes and the sun.** With the sun's position computed for each crash from 2001: crashes with the sun up rose 1.121 (1.088 to 1.156); crashes in the dark, sun more than 6° below the horizon, 1.025 (0.979 to 1.073).

### Against the published estimates

| Study | Their figure | This page, same years |
| --- | --- | --- |
| Fritz et al., 1996–2017 | 6% higher; about 28 deaths a year | 1.069 (1.035 to 1.103); 27 deaths a year (11 to 43) |
| Smith, 2002–2011 | over 30 deaths a year | 1.072 (1.011 to 1.127); 27 deaths a year (−4 to 54) |

The designs differ: Fritz et al. left out Arizona, Smith's design is known here only from his abstract, and this page counts Monday to Friday against the same weekdays in three nearby weeks. The figures agree in size; they are not a replication of either method.

### Method

- **Data.** 29 yearly FARS accident files, 1996 to 2024: 1,030,121 crash records, 1,132,885 deaths. 132 records with an unknown month or day were dropped. Indiana is left out (its counties followed different clock rules before 2006), as is any record outside the 50 states and the District of Columbia.
- **Clock rules.** Each state is joined to the IANA zone covering most of its people. The zone's rules give the change date for each year and whether the state changes at all. They return the first Sunday of April for 1996–2006, the second Sunday of March from 2007, and no change for Arizona and Hawaii.
- **Windows.** For each year, 14 days either side of two Sundays: the first of April and the second of March. One is the change, the other a placebo.
- **Estimate.** Work week: Monday to Friday after the change (days +1 to +5). Comparison: the same weekdays one and two weeks before and one week after (days −13 to −9, −6 to −2, +8 to +12). Rate ratio = crashes per work-week day ÷ crashes per comparison day, pooled over years. Intervals: percentile bootstrap over years, 4,000 resamples, fixed seed.
- **2020.** Left out of every estimate above: US lockdowns began in its comparison week after the change. With 2020 the main ratio is 1.070 (1.041 to 1.099).
- **Sun position.** For each crash with a known time and coordinates, its clock time is turned into UTC with the zone's offset that day, and the sun's elevation is computed (NOAA solar position equations). FARS coordinates are usable from 2001: 115,612 of 146,065 crash-window records have a sun position (a crash can fall in both windows of a year).

### Tests and checks

- **Sun join against NHTSA's recorded light: 106,261 of 107,982 agree** on crashes where both call it clearly day or dark (98.4%). The 1,721 misses were not broken down further.
- **Layouts.** The loader read every year's layout: 47 to 91 columns, upper- and lower-case names, file names that change case, two-digit years before 1998, and a UTF-8 byte-order mark in 2021 and 2022 that hid the `STATE` column until handled. The weekday NHTSA records matched the computed weekday on every one of the 1,029,989 kept records.
- **13 of 13 tests pass** in `pipelines/dst-crashes/dst.test.mjs`: clock rules and offsets, sun position, the loader on old and new layouts, the joins, the estimators on made-up numbers, and a rerun that reproduces `results.json` exactly. `scripts/dst-page.test.mjs` pins the figures on this page to the saved results.

### Rerun

- `node pipelines/dst-crashes/extract.mjs --cache <folder>` downloads the 29 files (about 540 MB) if missing and writes `data/dst-crashes/window.csv` and `extract.json`.
- `node pipelines/dst-crashes/analyse.mjs` writes `data/dst-crashes/results.json`. The chart is drawn from it when the site is built: `charts/dst_days.py` in Altair, through `src/lib/charts/dst.mjs`.
- `node --test pipelines/dst-crashes/dst.test.mjs scripts/dst-page.test.mjs` runs the tests.

## What Surprised Me

- **The placebo after 2007 is not flat.** The first Sunday of April, three to four weeks after the change, shows 1.052 (1.021 to 1.083). A likely reason, not tested here: if fatal crashes rise through the spring, the comparison days, which sit on average earlier in the season than the work week, lean every ratio upwards. A check added after reading the placebos uses one week before and one after, so a steady seasonal rise cancels: the main ratio becomes 1.064 (1.032 to 1.097), the April placebo 1.032 (0.998 to 1.064), the March change 1.088 (1.050 to 1.128) and the April change 1.034 (0.986 to 1.084). The March effect survives both designs; the April-era effect is weaker under the second. Easter, which falls in late March or April, is not modelled.
- **Arizona and Hawaii are a thin control.** 356 work-week crashes in 28 years. They show no rise, but the difference between the groups is not significant at the 95% level.
- **The rise is in daylight, not in the dark.** A sleep effect would show at any light level; a darkness effect would show in the dark mornings after the change. The rise is mostly in crashes with the sun up, which fits lost sleep better than darker mornings. The method cannot separate the two cleanly.
- **Not done yet.** The season-long effect of evening light, the effect by position within the time zone, and the Ask this lab panel. Without the season estimate, this page cannot say whether the season saves more lives than the first week costs.

## The Return

The hour has a price. In states that change their clocks, fatal crashes ran about 7% higher in the work week after the spring change: roughly 30 deaths a year. When the law moved the change from April to March in 2007, the rise moved with it.

No single year proves it: 5 of 29 years show no rise at all. Only decades, pooled, make it visible. The cost lives in the total, not in the person.

One hour is nothing to one person and about 30 lives to a country. Attention works the same way: a private resource with public consequences.

<details class="dst-essay">
<summary>Read the full essay</summary>

The hour has a price. In states that change their clocks, fatal crashes ran about 7% higher in the work week after the spring change than on the same weekdays around it: roughly 30 deaths a year, across nearly three decades of data. When the law moved the change from April to March in 2007, the rise moved with it. Arizona and Hawaii, which keep one time all year, showed no such rise.

What stays with me is the scale. In any single year the effect can vanish: 5 of 29 years show no rise at all. Only decades of crashes, pooled, make it visible. Nobody could notice this in their own life. Each tired driver who got to work safely would say the hour cost nothing, and almost all of them would be right. The cost lives in the total, not in the person.

The shape of the rise points at attention rather than darkness. It sits mostly in the morning, and mostly in crashes that happened in daylight, not in the dark. That fits drivers who slept less better than roads that got darker, though this method can't fully separate the two.

There are things this lab can't say yet. It hasn't measured the season: whether evening light saves more lives from March to November than the first week costs. Its comparison states are small. And one check came out less clean than I hoped: a date three weeks after the change also shows a smaller rise. A tighter comparison mostly removes it, and the March effect survives both designs.

So, back to the question. One hour is nothing to one person and about 30 lives to a country. Attention behaves like that: a private resource with public consequences, spent in the present and funded by a night we've already had. I don't change my clocks anymore. But I still lose hours: to late nights, early flights, one more thing at midnight. The lab didn't measure that. It did change how I count it.

</details>

## How it was built

- Pull request: https://github.com/felipealves7/felipealveslab/pull/57
- Code: `pipelines/dst-crashes/`. Saved outputs: `data/dst-crashes/` (daily counts in the windows, the per-year load log, the results and the IANA rule extract). Tests: `pipelines/dst-crashes/dst.test.mjs` and `scripts/dst-page.test.mjs`.
- Running cost: US$0 a month. A fixed snapshot, rebuilt by hand when NHTSA releases a new year.

Data: NHTSA Fatality Analysis Reporting System, a US federal government work. IANA Time Zone Database, public domain. Daily counts, ratios and sun positions computed by this Lab.
