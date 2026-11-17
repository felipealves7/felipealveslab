---
title: "Where does my attention go?"
type: "research study"
series: "human-variable"
status: "building"
question: "Where does my attention go, and how far do what I say I prioritise, what I report in the moment and what my devices measure agree?"
payer: "A product, operations or transformation lead who sets a team's priorities and needs to know how far stated priorities, self-reported attention and measured activity diverge before planning around any one of them."
dataSource: "Felipe Alves's own experience-sampling answers, collected by pipelines/attention-pings from 1 to 22 December 2026, and his stated priorities, committed before the first ping. Published as aggregates only."
dataLicence: "Not applicable: Felipe's own data, published as aggregates (categories and counts) only."
dataFreshness: 2026-11-17
synthetic: false
limits: "One person, about three weeks, a planned 132 pings. Self-report cannot see all of attention. Missed pings may not be missed at random. Measured device usage is not yet included. No population claim."
runningCost: "US$0 a month expected, inside the Cloudflare Workers Free and D1 free limits and the free ntfy.sh server."
builtBy: "https://github.com/felipealves7/felipealveslab/pull/52"
---

## The Provocation

Felipe writes this section before the first ping.

## What We Know

### Mind-wandering in daily life

Killingsworth and Gilbert sampled people's thoughts, feelings and actions through a smartphone app. Their abstract reports that people think about what is not happening almost as often as about what is, and that doing so typically makes them unhappy ([Science 330(6006):932, 2010, PubMed record](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=21071660&rettype=abstract&retmode=text)).

The Harvard Gazette's report of the study gives the figures: an iPhone app contacted 2,250 volunteers at random intervals and gathered 250,000 data points; people spent 46.9% of their waking hours thinking about something other than what they were doing ([Harvard Gazette, November 2010](https://news.harvard.edu/gazette/story/2010/11/wandering-mind-not-a-happy-mind/)). The full paper was not opened for this page (the publisher's site refused the request), so the 46.9% is cited from the news report, not the paper.

### The method: experience sampling

Csikszentmihalyi and Larson describe the Experience-Sampling Method as an instrument for the frequency and patterning of daily activity, psychological states and thoughts. Their abstract reports evidence for short- and long-term reliability, and for validity through correlations with physiological measures, one-time psychological tests and behavioural indices ([J Nerv Ment Dis 175(9):526–536, 1987, PubMed record](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=3655778&rettype=abstract&retmode=text)). The abstract gives no reliability coefficients, and the full article was not opened, so none are quoted here.

### What the sources do not settle

Both sources rest on self-report, and the 2010 sample was volunteers with iPhones. Neither compares self-report with measured device activity, which is the third measure here. This page cites only these two sources; it does not survey studies that disagree with them.

## The Experiment

The panel at the top of this page is the live piece. It reads `data/attention/results.json`, a file of counts built from the study's answers, and nothing else. Until the first ping is sent it shows empty figures.

### Design, fixed before the first ping

- **Pings.** Six a day at random times between 09:00 and 21:00 local time (UTC+4), at least 60 minutes apart, from 1 to 22 December 2026: 132 planned. Each ping is a phone notification from ntfy.sh with a signed link to a one-screen form.
- **Answer window.** 30 minutes from sending. A later answer is refused and the ping counts as missed. A ping the scheduler could not send within 15 minutes of its time is recorded as not sent.
- **Questions.** What are you doing (12 fixed categories)? Is your mind on it (yes or no)? Are your thoughts about the past, present or future? Which project is it for (Felipe's listed projects, or no project)? Mood from 0 to 100. There is no free-text field.
- **Stated priorities.** A ranked list of projects, committed to `data/attention/priorities.json` before 1 December 2026. The commit time is the record that it came first.
- **Comparisons.** Share of answered pings per project against stated rank. Share of answered pings off-task, against the 46.9% figure above. Both with 95% Wilson intervals and the count answered out of sent.
- **Response pattern.** Answered out of sent, by three-hour block of the day, so clustering at convenient times is visible.
- **Sample.** The minimum worth publishing is 60 answered pings. If fewer are answered, the counts are still published, with their intervals.
- **What would disprove the idea.** Stated priorities and reported attention agree within the intervals, so there is no gap to report. That result is published as it comes.
- **Measured usage.** Device activity is added only if it can be exported by 8 December 2026. If not, the study stays a two-way comparison and the panel says so.

### Privacy

Answers stay in a Cloudflare D1 database. The Worker's export returns counts and group averages only, and the build refuses a file that carries an id, a timestamp or any single answer. A mood average is shown only for a group of at least 5 answers.

### Results

None yet. Collection starts on 1 December 2026. The figures will appear in the panel above with their denominators.

### Tests

20 tests in `pipelines/attention-pings/attention.test.mjs` cover the aggregation, the intervals, the schedule rules, the signed links, the form checks and the Worker end to end against a SQLite stand-in for D1. Rerun with `node --test pipelines/attention-pings/attention.test.mjs`; rebuild the page data with `node pipelines/attention-pings/run.mjs`.

## What Surprised Me

No answers have been collected yet, so there are no misses or failed hypotheses to report. Limits of the method, known before the start:

- One person over about three weeks. Every result is about that period only.
- With 60 answers, a 95% interval on a share is roughly 25 percentage points wide.
- Self-report misses attention that the person does not notice in the moment.
- Missed pings may fall at busy or absorbing moments, which would bias the answered sample.
- The 12 activity categories and the project list are fixed in advance and may not fit every moment.

## The Return

Felipe writes this section after the study ends.

## How it was built

Pull request [#52](https://github.com/felipealves7/felipealveslab/pull/52), built from issue [#51](https://github.com/felipealves7/felipealveslab/issues/51).

Running cost: US$0 a month expected. The Worker runs every 5 minutes (288 runs a day) and sends 6 pings a day. Cloudflare Workers Free allows 100,000 requests a day and 5 Cron Triggers ([limits](https://developers.cloudflare.com/workers/platform/limits/)); D1 on the free plan allows 5 million rows read and 100,000 rows written a day, and stops queries rather than charging when a limit is reached ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). The free ntfy.sh server allows 250 messages a day ([publishing limits](https://docs.ntfy.sh/publish/)).
