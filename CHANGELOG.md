# TECH Changelog

Full version history for **TECH — Torn Elephant Combat Helper**.

The most recent versions live inline at the top of `TornElephantCombatHelper.user.js` so the latest context is always one click away from the code. Everything older lives here.

---

## v0.6.49 — DOM-hook verb expansion

DOM-hook verb expansion. Before this build the live combat-log parser recognised five verbs (fire / throw / spray / init / leave) which covered ranged + thrown attacks and the "left on the street" finish — but ~everything else (melee + fist damage events, and every non-"street" finisher) landed in `kind='unknown'`. The merge into the fight record still worked because the 30s idle fallback closed the buffer, but the events themselves carried no structured intel.

New verbs parsed in v0.6.49:
- **MELEE damage:** slashed / stabbed / hit / bashed / crushed / smashed / whipped / chopped / impaled / cut / struck / jabbed / swung at — when a "with their X" weapon clause is present. Captures actor, target, weapon, bodyPart, damage.
- **FIST damage:** same verb list MINUS the "with their X" clause — punched / kicked / headbutted / kneed / slapped / elbowed / tackled all land here too if they hit without a named weapon.
- **HOSPITALIZE finisher:** "X hospitalized Y (+respect)" — terminal.
- **COMA finisher:** "X left Y in a coma (+respect)" — terminal, the non-hospitalize KO finish.
- **MUG finisher:** "X mugged Y" or "X mugged Y and stole $N" with optional respect tail — captures cashStolen — terminal.
- **LOOT finisher:** "X stole $N from Y (+respect)" — captures cashStolen — terminal.
- **STALEMATE:** keyword fallback (`stalemate`/`stalemated`) — terminal.
- **ESCAPE:** keyword fallback (`escaped` / `fled the battle` / `ran away`) — terminal.

All new finisher kinds were added to `DOM_TERMINAL_KINDS` so the buffer auto-completes the moment the finishing line lands, instead of waiting out the 30s idle heuristic. That tightens the merge window and reduces the chance of an entry expiring against TTL before the v2 poll picks it up.

Diagnostic: unrecognised lines (`kind='unknown'` after all regexes ran) are now `console.log`-ed once each as `[TECH-DOM] Unrecognised line: …`. DevTools-only, no UI noise. The dedup Set resets on page reload. Goal: hand the user a way to drop raw samples back to me so we can keep widening the verb catalogue without writing blind regexes.

`exportFights()` now includes the live `dom_buffer` in the dump under `domBuffer`. Previously the export only carried events that had already merged into a fight record (`fight.dom.events`) — unmerged fights (v2 hasn't polled yet, or the start-time fell outside the ±10min merge window) silently lost their raw text on TTL. Now they ship with the export so we can use them for regex tuning.

Zero new API calls. Zero new storage keys. Pure parser improvement.

---

## v0.6.38 — Faction Intel drill

New Faction Intel drill — one level up from Opponent Intel. Aggregates every fight against opponents whose faction matches `factionId` and renders the collective read in the same in-panel drill UX (Back button at top, cards below).

What it shows:
- Total fights vs this faction · W/L · respect net (both directions)
- KO'd them / got KO'd, with hosp-finisher subtotals
- Unique opponents within the faction + avg fights/opponent
- Verdict mix: per-opponent verdict counts across the roster you have history with (e.g. "3 DANGER · 5 TANKY · 12 NEUTRAL")
- Top opponents in this faction by fight count (clickable → existing Opponent Intel drill)
- Recent 8 fights vs any member of this faction

Three entry points to the drill:
1. Opponent Intel sub-line: faction name is now a link. Click → Faction Intel drill. Ctrl/⌘+click falls back to Torn's external faction profile (preserved for users who want it).
2. SCOUT tab header: the fetched faction's name is now a link. Click → Faction Intel drill (or stay in SCOUT for the roster list).
3. Direct via `openFactionDrill(id, name)` — useful seam for future entry points (e.g. clickable faction badges on fight rows once we surface those).

`computeFactionIntel` walks raw fights once, classifying by `attacker_faction` / `defender_faction` (whichever side ISN'T the user). Faction-name resolution falls back to the most recent non-empty string if the faction rebranded mid-history. Verdict mix uses the same `lookupOpponentSummary` path as the Active-Page Banner — STALE / UNKNOWN gates apply just like everywhere else.

Mirror of v0.6.37's broad-knockdowns choice: `koDelivered` uses `overview.wins` (every decisive defeat inflicted), `koTaken` uses `overview.losses` (every decisive defeat received). `hospThem` / `hospMe` stay narrow as a sub-line on the KO cards — still useful for "of those KOs, how many were Hospitalize finishers."

Pure read on existing fight data — no new API calls, no new storage. Refreshes on poll same as Opponent Intel drill.

---

## v0.6.37 — War Scorecard broad knockdowns

War Scorecard bottom line fix: swap the narrow "hosp'd" / "got hosp'd" counts for the broader "KO'd them" / "got KO'd" counts.

The previous version showed 0/0 even when the user had been defeated 40 times in a chained war, because `hosp_them` / `hosp_me` only fire on the explicit API `result='Hospitalized'` value (i.e. the attacker chose the "Hospitalize" finishing move). Chain attackers use "Leave them on the street" almost exclusively to keep their own chain alive — those reads come back as `result='Attacked'` and classify as `outcomeKey='loss'` on the defender side, never bumping `hospMe`.

Fix uses `overview.wins` / `overview.losses`, which were already summing across the broad `outcome.win` / `outcome.loss` flags (covers win/hosp_them/mugged_them/looted_them/special_win on the delivered side, and loss/hosp_me/mugged_me/looted_me on the taken side). That's the same family of corrections as v0.6.29's verdict gate (`defeatedMeCount`).

Net effect on a real war: where the previous line read "0 hosp'd them · 0 got hosp'd" against a 7/40 W/L record, the new line reads "7 KO'd them · 40 got KO'd" — matches reality.

---

## v0.6.36 — WAR Scorecard hero

WAR Scorecard hero — when the WAR pill is selected on Dashboard, a big at-a-glance hero panel renders above the regular stat cards. Reads as a scoreboard: W/L, net respect, time elapsed in the war, and respect-per-hour pace. Bottom line shows hosps in both directions side-by-side. Visually distinct (red/orange ember strip across the top edge) so the Dashboard reads as "war mode" at a glance, not "regular Dashboard with a filter."

Two metrics the existing cards don't surface:
- **Time elapsed:** from your first ranked-war fight in the window to now. Tells you how long the war has been going for you specifically (helpful when factions enter at staggered times).
- **Respect pace:** `respectGained / elapsedHours`, with a 60s floor on the denominator so a single fresh fight yields a meaningful number rather than NaN. Helps you judge whether you're on track for a respectable final tally.

Pure UI on data we already compute — zero new API calls, zero new state. Only renders when WAR pill is active AND there are fights in scope; non-war views and empty WAR windows are untouched.

---

## v0.6.35 — SCOUT sort + filter

SCOUT tab adds sort + filter controls on top of the fetched roster.

Sort dropdown (6 options): Verdict (default DANGEROUS-first), Level high→low (heavy hitters first), Level low→high (soft targets first), Last action recent first (likely-online), Last action oldest first (inactive farm targets), Name A→Z (reference). Null levels and never-seen `lastActionTs` values sink to the bottom of their respective sorts so the meaningful rows always lead. Every sort falls back to name for stable leaf ordering.

Two filter toggles: "Hide locked" drops Hospital / Jail / Federal members (unattackable). "Hide traveling" drops Traveling / Abroad (not in Torn — pre-war scouting wants them, mid-war you don't). When a filter is active, the header switches from "N members" to "X of N members shown" so the cut is visible.

Both filters and the sort key persist to settings, so reopening the panel during a war keeps your preferred view. All sort + filter work is client-side on the cached roster — zero extra API calls. Controls bar is hidden until a roster is rendered (nothing to sort).

---

## v0.6.34 — SCOUT tab

New SCOUT tab — pre-war faction reconnaissance at scale. Enter an enemy faction ID, hit "Fetch roster", and TECH calls Torn v1 `/faction/{id}?selections=basic`, then runs your local fight history against every member to produce one verdict per player.

Rows sort DANGEROUS first (then TANKY, STALE, NEUTRAL, UNKNOWN, FAVORABLE, NO HISTORY at the bottom). Tiebreak by recorded fight count descending, so the members you have most sample data on surface above thin-data peers within the same verdict.

A one-line summary at the top counts how many of each verdict are present ("3 DANGER · 5 TANKY · 12 NO HIST") — quick read on how much of the enemy faction is "we've fought them" vs "we have zero data."

Each row click drills into the existing Opponent Intel view — same flow as Top Opponents on the Dashboard.

Cache: the roster is stored in GM under `scoutData[factionId]` so reopening the panel doesn't re-hit the API. "Fetch roster" re-pulls and overwrites; nothing auto-refreshes (scout is a pre-fight read, not a live signal).

Defensive: if the user's own ID appears in the fetched roster (e.g. they scouted their own faction), that member is filtered out — `lookupOpponentSummary` would otherwise surface a meaningless fightCount equal to every fight they've ever logged (same bug v0.6.26 fixed for the Active-Page Banner).

API: v1 `/faction/{id}?selections=basic` returns the full member roster with name, level, position, last_action, and status. We flatten that to a thin row shape per member; the response is cache-busted with `_=Date.now()` and sent with no-cache headers (same lesson as v0.6.30 for `/v2/user/attacks`).

---

## v0.6.33 — WAR window filter

New WAR window filter. A 5th pill labeled "WAR" sits next to the 24H/7D/30D/All pills on Dashboard and Fights. Selecting it filters every view (Dashboard cards, Fights list, Difficulty Roadmap, Leveling Trap, Top opponents, Recent activity) to fights flagged `ranked_war=true` — the v2 attacks API's marker for fights that counted toward a ranked-war score. Time cutoff is bypassed when WAR is active so the entire war's history is in scope at once; when the war ends you can keep the pill selected for a clean post-mortem view of your war-only K/D, respect, and per-opponent verdicts without the noise of regular play. Empty-state copy adapts to "No ranked-war fights yet" when the pill is selected and there's nothing to show. Active-Page Banner is unaffected — it walks the full fight history regardless of which pill is active, because opponent intel should never be window-scoped. Mechanism is a tiny `rawFilter` predicate on the WINDOWS entry — other windows leave it undefined and behave identically.

---

## v0.6.32 — Export filename rename

Export filename rename: `torniq-fights-...` → `tech-fights-...` to match the script's rename from TornIQ to TECH (the in-script `SCRIPT_NAME` changed back in 0.2.0 but the download filename was missed). Cosmetic only — no behavioural change, no storage shape change, no breakage of any previously-exported file. `.gitignore` covers both patterns so neither shape can sneak into git.

---

## v0.6.31 — Strip 0.6.30 diagnostics

Strip the 0.6.30 diagnostic `console.log` calls now that the cache-bust fix is confirmed working (139 → 168 fights ingested in one poll on the user's machine, chain fights from earlier in the day pulled in correctly). No behavioural change vs 0.6.30; cleaner console.

---

## v0.6.30 — v2 attacks cache-bust fix

Fix: chain fights (and any fresh attacks) silently failing to ingest despite "successful" polls. Symptom — `[TECH][poll]` consistently returned 100 records with `firstEnded` stuck at a ~14h-old timestamp, even though the same v2 endpoint URL hit manually in the browser returned the latest chain fights. `[TECH][ingest]` reported `pageRecords: 100, newCount: 0` on every poll because every code in the stale page was already in storage.

Cause: the v2 attacks GET was being served from cache. Either the browser HTTP cache or an extension service worker (TornTools etc.) keyed on the exact URL and returned a frozen response.

Fix: cache-bust the v2 URL with `_=Date.now()` and send `Cache-Control: no-cache` + `Pragma: no-cache` headers via `GM_xmlhttpRequest`. Diagnostic logging from 0.6.30-debug kept in for one cycle so the fix can be verified by `firstEnded` advancing past 1779839289 on the next poll; will be stripped in 0.6.31.

---

## v0.6.29 — Verdict gate fix

Verdict gate fix: Marti was still showing UNKNOWN in v0.6.28 because `hospMe` only counts the explicit API `result="Hospitalized"` (when the attacker selects the "Hospitalize" finishing move). The user's actual fight with Marti was `result="Attacked"` — a regular "Leave them on the street" finish that put the user in hospital for 22 minutes as a damage side effect. Same outcome from the user's perspective ("Marti hospitalized me"), different API result code. The Fights row even showed the "X Loss" glyph, not the "skull" hosp_me glyph — that was the smoking gun.

Fix: new `defeatedMeCount` counter — any record where `iAm='defender'` AND `outcome.loss=true` (covers loss / hosp_me / mugged_me / looted_me, the full set of "they took you out" outcomes). DANGEROUS gate now triggers on `defeatedMeCount > 0`, and the blurb says "beaten you N times" — accurate to the broader signal regardless of which finishing move the API recorded.

---

## v0.6.28 — Banner accuracy fixes

Two banner accuracy fixes surfaced by Marti's profile (1.6B stats chainer who hospitalized the user).

1. **FF direction.** v0.6.27 showed Marti's banner as "FF 1.05" because the stored `modifiers.fair_fight` is direction-sensitive — when Marti (1.6B) attacked the user (1M), the API recorded FF 1.05 from Marti's perspective (free farm). The user's perspective FF when attacking Marti would be ~3.00 (saturated cap). v0.6.28 fixes `lookupOpponentSummary` to only capture FF from fights where the user was the attacker. If we have no outgoing fight with that opponent, the banner omits FF entirely rather than show the inverted (and misleading) value.

2. **Hospitalization beats the UNKNOWN gate.** v0.6.27 showed Marti as UNKNOWN because `computeOpponentIntel` short-circuits at `fights<2` BEFORE checking `hospMe`. A single hospitalization is decisive war evidence ("they can take you out") and should elevate to DANGEROUS regardless of fight count. v0.6.28 hoists the `hospMe` check above both the unknown gate and the stale gate — one hosp wins immediately, no sample-noise gate, no age discount.

Net effect for Marti: banner now reads "DANGEROUS · 1 fight" — accurate verdict, no false FF.

---

## v0.6.27 — Banner FF surfacing

Active-Page Banner now surfaces fair_fight. Torn's stat-differential modifier (1.0 = opponent ≤25% your stats, 3.0 = saturated cap at or above your stats) pairs the behavioural verdict (DANGEROUS / TANKY / FAVORABLE) with structural ground truth in one line. Marti's banner now reads "DANGEROUS · FF 3.00 · 1 fight" instead of just "DANGEROUS · 1 fight" — same verdict, but you instantly know the gap is unwinnable, not just unfavorable. `lookupOpponentSummary` extracts the latest known FF from `modifiers.fair_fight`; only renders when at least one stored fight carries it (post-v0.3.0 non-stealthed records). Tooltip explains the 1.0–3.0 scale.

---

## v0.6.26 — Banner self-profile suppression

Active-Page Banner no longer renders when you're on your own profile. Self-view was producing the contradictory "139 fights · NO HISTORY" line because `lookupOpponentSummary`'s fight loop counts every record where the opponent ID appears (your ID appears in all of them) but `computeOpponentIntel` can't produce a verdict against yourself. Cleaner UX is no banner. Same suppression applies defensively on the attack page in case Torn ever links a self attack URL (you can't actually attack yourself in-game).

---

## v0.6.25 — v1→v2 dedup migration

Bugfix: duplicate fight records left over from the v0.3.0 v1→v2 poll migration. Every fight that crossed the migration boundary was stored twice — once under its v1 attack code (no level data, no finishing-hit effects) and once under its v2 code (full enrichments). Symptom: the Fights tab showed pairs like "Mugged them Hulme · L1 STEALTH" right next to "Mugged them Hulme" with identical timestamps and respect. Fight counts, respect totals, and the new Active-Page Banner counts were all inflated.

Fix is a one-shot dedup migration that runs on next load: walks the fights store, groups by `(timestamp_started, timestamp_ended, attacker_id, defender_id)` — that tuple identifies a physical fight regardless of which API version returned it — and for each duplicate group keeps the richer record (the v2 one with `attacker_level` populated) and drops the v1 stub. Non-destructive: we always keep the strictly-better record. Sentinel ensures it only runs once. Cleared sentinel = forced re-run.

---

## v0.6.24 — Active-Page Banner

Active-Page Banner. When the current Torn URL names a specific opponent — a profile page (`/profiles.php?XID=`) or attack page (`/loader.php?sid=attack&user2ID=`) — the panel now shows a clickable banner at the top of every tab with TECH's verdict on that player: FAVORABLE / TANKY / DANGEROUS / STALE / NEUTRAL, or NO HISTORY if we've never logged a fight with them. One tap on the banner drills straight into the existing Opponent Intel view. Built for ranked war scouting — pre-war, glance at enemy faction profiles and see who's safe to engage; in-war, the attack page itself tells you "DANGEROUS, hosped you twice" before you spend the energy. Suppresses itself when you're already drilled into the same opponent (no banner → click → back → banner loop) and when the URL is any other Torn page. Engine code is unchanged — pure UI surfacing on top of v0.4.0's `computeOpponentIntel`.

---

## v0.6.22 — TEST HP formula matches Torn wiki

TEST sim HP formula now matches the Torn wiki. v0.6.7 shipped a linear stub (`250 + level*50`, giving L29 = 1,700 HP) so KOs would actually land at realistic stats. That stub overstated HP across the board — wiki says HP grows piecewise: +25/lvl (2-8), +50/lvl (9-95), +75/lvl (96-100), capping at 5,000 at L100. Real L29 = 1,325 HP, L40 = 1,875 HP. The shorter HP bar means slightly faster KOs and tighter AVG TURNS at low/mid level fights; high-level matchups (L95+) barely shift. `testHpForLevel` is the only call site, so changes are contained; `TEST_DEFAULTS` drops the now-unused `hpBase`/`hpPerLevel` fields.

Adds a per-side HP override input alongside the level field. Empty = use the wiki HP for that level (default); typed = use your value. Useful in two directions: type your own buffed max HP (merits + education + faction perks routinely add 20–30% over base), or type the opponent's max HP read straight off the attack screen — Torn shows current and max HP there. `readSide` passes hp through; the engine's existing `a.hp || testHpForLevel(a.level || opts.level)` fallback in `testRunMatch` handles the auto/override split. Per-side drug stat multipliers don't touch HP, so override values survive drug application unchanged. Calibration tag stays at `provisional-v0.4` — engine math (damage, accuracy, regions) is unchanged; only the HP curve was rescaled and an override path added.

---

## v0.6.21 — TEST per-region damage

TEST sim now surfaces per-region damage. Results panel adds two side-by-side breakdown tables — one per defender — showing where hits landed (Head/Chest/Stomach/Groin/Arms/Legs), the defender's armor coverage at each region, average damage per landed hit, and average damage absorbed per fight. Coverage cells color-code: red when uncovered, amber when partial (the leak rows), green when full. Engine accumulates per-region hits + damage during the trial loop and exposes them via `regionStatsA`/`B` on the `testSimulate` return. No engine math changes — pure data surfacing — so the calibration tag is unchanged.

---

## v0.6.20 — TEST weapon accuracy

TEST v0.4 — weapon accuracy now affects hit chance. `WEAPON_CLASSES` gets an `acc` field alongside `dmg`, derived from per-weapon midpoint averaging across the same wiki tables we used for damage. Damage values are retuned in lockstep so every class number is sourced from one consistent methodology (full data + exclusion rules archived in `memory/reference_torn_wiki_weapons.md`). `testHitChance` adds a +/-1% bias per acc point off the 50 baseline, clamped to the existing [0.10, 0.95] range — so at equal Spd/Dex a 70-acc Ithaca lands meaningfully more often than a 25-acc Chainsaw. The "biggest sword wins" assumption is broken: Melee (Elite) trades dmg ceiling for the lowest acc in the table because it includes Chainsaw/Flail/Meat Hook/Guandao — high-damage but inaccurate weapons. Sim now labels itself `provisional-v0.4` whenever a non-generic class OR non-naked armor is in play (formula-only stays reserved for pure stat sims).

---

## v0.6.13 — TEST sim integrated into Build Coherence

TEST v0.4 phase 1 — Build Coherence now gets a sim-derived gut check. After the existing shape/distance verdict, the BC card runs 500 trials of `testSimulate` vs a 25/25/25/25 reference opponent at your total stats and level (naked vs naked, so we're testing the SHAPE in isolation — not equipment, not stat mass). The result renders as one line under the verdict: "Sim outlook: vs an even-stats opponent your shape wins ~XX%". This catches builds that look ALIGNED on paper but underperform vs a neutral baseline — and validates ALIGNED builds that actually fight well. Sim is labeled formula-only so confidence stays visible. Engine code is unchanged from v0.3; this drop only wires it into BC.

---

## v0.6.12 — TEST full armor suite

TEST v0.3 — full armor suite. Each landed hit now rolls a body region (Head / Chest / Stomach / Groin / Arms / Legs) and looks up the defender's armor preset to apply per-region damage reduction. Preset list covers the main civilian sets (Body only, Tactical, Full Riot, Full Assault) plus the ranked-war sets (Vanguard, Sentinel, EOD). Each preset stores both a coverage map and a flat reduction %, so partial-coverage sets (Body / Tactical) correctly take full damage on uncovered regions — the whole point of modeling regions instead of one flat % per set. Values are provisional public-knowledge ballparks; the sim labels its output as `provisional-v0.3` whenever a non-naked preset is used. A later TEST version will refit these against captured fights, and v0.5+ will add a "your actual armor stats" override form on top of these presets (see `project-test-simulation-concept` memory). Naked vs naked under the same rngSeed produces identical numbers to v0.2, so existing matchups keep their baselines.

---

## v0.6.11 — Panel viewport clamp

Panel viewport clamp. The drag handler used to allow `bottom` to grow unbounded, so dragging upward could push the header above the viewport top with no way to grab it back. Now the panel position is clamped on three paths: during drag (mousemove), on panel creation (rescues anyone whose stored `panelPos` is already off-screen), and on window resize. A new Tampermonkey menu entry — "Reset panel position" — sets `panelPos` back to the default `{right:20, bottom:80}` for emergency recovery if a saved position is unreachable even with the rescue clamp (e.g. saved before this version on a since-removed monitor).

---

## v0.6.10 — TEST weapon class damage curves

TEST v0.2 — primary-weapon class damage curves. Each side now picks a weapon class (Pistol / SMG / Rifle / Shotgun / Melee / Heavy) or stays on the v0.1 Generic baseline. Per-class damage values are provisional public-knowledge midpoints — the sim labels its output as `provisional-v0.2` whenever a non-generic class is used so the confidence is visible at a glance. A later TEST version will refit these against captured-fight damage events (the hybrid model from `project-test-simulation-concept`).

Also fixed a latent bug: the iterations dropdown was a no-op since v0.6.6 — UI passed `iterations` but `testSimulate` only read `trials`, so every run was secretly 100 sims. `testSimulate` now accepts either.

---

## v0.6.9 — Difficulty Roadmap pivot to FF brackets

Roadmap card pivot: brackets are now Torn's fair-fight modifier (FF 1.0–3.0, derived from the stat differential) instead of relative opponent level. Old card was useless for stat-builders — a L29 with 880k stats vs a L29 with 60k stats are the same level-relative bracket but completely different fights. `fair_fight` captures that. Renamed to "Difficulty Roadmap". Five FF brackets: Free / Easy / Even / Hard / Max. Same PRIME/SAFE/CONTESTED/AVOID/THIN labelling, same headline + avoid lines. Triggers on 5+ outgoing fights with fair_fight data — every post-v0.3.0 non-stealthed attack qualifies.

---

## v0.6.8 — TEST tab survives polls

TEST tab no longer gets wiped by the 60-second poll. The poll's post-run refresh now uses `refreshAfterPoll()`, which always updates the status bar + launcher indicator but only re-renders the panel content for tabs that actually depend on live fight data (Dashboard, Fights, opponent drill). TEST is a stat-only simulator with no live data inputs, so we leave its DOM alone — your typed stats, level, and last simulation result all survive a poll cycle. Manual actions (tab clicks, settings toggles, drill open/close) still go through `renderActive()` and re-render fully as before. Poll cadence itself is unchanged.

---

## v0.6.7 — TEST engine recalibration

TEST engine recalibration. v0.6.6 shipped the UI but its damage formula plus fixed 5000 HP meant every fight at realistic L29 stats hit the 10-turn cap with no actual KOs — wins were decided by HP remaining, not by anyone dying. v0.6.7 fixes the math:
- HP scales with level: `HP = 250 + level * 50` (L29 ≈ 1700, L100 ≈ 5250), matching the rough Torn ballpark for vitality-using players. Per-side level input on the TEST tab.
- `Damage = STR^0.45 * sqrt(STR/DEF) * (weapon/50) * jitter`. Absolute scale (sub-linear in STR) plus a Vladar-style ratio kick. L29 mirror fights now resolve in 4-6 turns with real KOs; brawler vs defender wins ~70% in ~6 turns.
- Cap-tie now decided by HP fraction remaining (fairer when the two sides have different max HP).
- `identifySelf` now caches `meta.level` so future runs prefill the You-side level automatically.

Sanity check expectations updated; the menu-command harness still validates symmetric ≈ 50%, heavy-favorite > 85%, underdog < 15%.

---

## v0.6.6 — TEST v0.1 launch

Ships TEST v0.1 — Torn Elephant Simulation Tester — as a new tab (between Fights and Settings). Formula-only Monte Carlo battle simulator: enter your stats and an opponent's stats, pick an iteration count (10 / 100 / 1000 / 5000), and get a win-rate bar with mutual-KO and average-turn breakdowns. Your side prefills from cached battle stats (`meta.battleStats`) when present; both sides are fully editable so you can sim "me today vs me at goal build" without rewiring. Engine is pure (no `GM_storage`, no DOM, no network) and re-uses the v0.6.5 `testSimulate()` core; this drop adds only UI + CSS. Outputs are clearly labelled "formula-only" so users read confidence correctly — calibration against captured fights lands in a later TEST version.

---

## v0.4.0 — Opponent Intelligence v0.1

Ships vision feature #6 v0.1 — Opponent Intelligence. Click any fight row (or any top-opponent row on the Dashboard) and the panel drills into an intel view for that player, aggregating every fight you have on record against them:
- Verdict (FAVORABLE / TANKY / DANGEROUS / STALE / UNKNOWN) with a plain-language explanation of why.
- Win rate, respect net, hospitalisation record (both directions), level range seen, and interrupt rate.
- Two effect rosters: finishing-hit bonuses they have fired on you, and ones you have fired on them.
- Outcome breakdown bar chart + last 6 fights against them.

In-panel drill (back button), not a separate modal — preserves the 430px panel layout. Tab clicks clear the drill. Profile link inside rows still opens the Torn profile in a new tab; the rest of the row triggers the drill.

---

## v0.3.1 — v2 surfacing + Leveling Trap Detector

Surfaces the v2 data captured in v0.3.0:
- Fight rows now show an opponent-level badge (L97 etc.). When you are the defender and the attacker is 10+ levels above you, the badge turns red — the per-fight farm-target signal.
- Finishing-hit bonuses (Proficience, Plunder, Demoralized, ...) appear as orange tags on fight rows; hover for the percentage.
- `is_interrupted` fights show an "INT" tag (assist/non-chain hit).
- `is_raid` fights show a "RAID" tag.

Adds vision feature #4 v0.1 — the Leveling Trap Detector: a Dashboard card that aggregates incoming-attacker levels and renders a verdict (NORMAL / WATCH / FARM TARGET). Needs ≥3 incoming fights carrying `attacker_level` (i.e., post-v0.3.0, non-stealthed) before it renders.

---

## v0.3.0 — Migrate poll to Torn API v2

Background poll migrated from Torn API v1 (`/user/?selections=attacks`) to v2 (`/v2/user/attacks` with `Authorization: ApiKey` header). We now capture three new per-fight fields:
- opponent level (foundation for the Leveling Trap Detector)
- `is_interrupted` flag (cleaner chain attribution)
- `finishing_hit_effects` (advanced-weapon bonus name + percentage on the kill hit — partial signal toward weapon attribution)

Storage shape is preserved (normalised back to the v1-flat shape used by `deriveFightView`) so existing stored fights keep rendering and old + new records mix freely. Damage / weapons / armor data is NOT exposed by any v2 endpoint — that gap is solved by the live-attack DOM hook scheduled for v0.3.1.

---

## v0.2.1 — Launcher mark swap

Launcher icon swapped to a simplified head-only mark (transparent PNG by Wasteland). Replaces the earlier hand-traced interim SVG.

---

## v0.2.0 — Renamed TornIQ → TECH

Renamed from "TornIQ — Combat Intelligence" to "TECH — Torn Elephant Combat Helper" so this script pairs with TEEM under a shared identity.

**How to update without losing data:** Open your existing TornIQ entry in the Tampermonkey dashboard, replace its content with this file, save. Tampermonkey keeps the script's internal id stable across `@name` changes when you edit in place, so your GM storage is preserved. On first run the migrator below copies any `tiqc_*` keys it finds across to `tech_*` and sets a one-shot sentinel.
