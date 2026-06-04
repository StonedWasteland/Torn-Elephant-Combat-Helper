# TECH Changelog

Full version history for **TECH — Torn Elephant Combat Helper**.

The most recent versions live inline at the top of `TornElephantCombatHelper.user.js` so the latest context is always one click away from the code. Everything older lives here.

---

## v1.3.2 — Reposition floating launcher above PDA toolbars

v1.3.1 spawned the floating launcher at `bottom: 12px` — directly underneath PDA's persistent bottom toolbar, which is 100–150px tall and hides anything corner-pinned in that zone. Result: the launcher was technically there but invisible behind PDA's UI.

v1.3.2 moves the launcher to the **vertical middle of the right edge** (`top: 50%; transform: translateY(-50%)`), clear of both PDA's top status bar and bottom toolbar. Also bumped its size to 52px (Material's recommended touch target) and the mascot mark to 30px for better fingertip targeting on mobile.

Added a `[TECH] Floating launcher mounted` console log on first spawn so PDA debug consoles can confirm whether the script is reaching this code path.

---

## v1.3.1 — Floating launcher fallback for PDA

v1.3.0 turned out to ship with TECH effectively invisible on Torn PDA: the script ran, but the launcher button injected into Torn's desktop top-bar (anchored on `#recent-history-wrapper`) never appeared because that element doesn't exist in PDA's mobile DOM. No launcher = no way to open the panel = TECH appears completely silent.

v1.3.1 adds a **floating launcher fallback** — a circular mascot FAB pinned to the bottom-right corner of the screen, spawned automatically after ~1 second when the desktop toolbar can't be found. Clicking it toggles the TECH panel exactly like the toolbar version would. On desktop browsers where the toolbar exists, behavior is unchanged — the floating launcher never appears.

Body-MutationObserver continues watching for the desktop toolbar to lazy-render, and when it does, the floating launcher is removed automatically so you never see both at once.

This makes TECH actually usable on PDA. Other PDA gaps (settings layout polish, possible text encoding) still pending feedback.

---

## v1.3.0 — Experimental Torn PDA support

Torn PDA (the official mobile app) runs userscripts inside a Flutter WebView with its own `PDA_httpGet` / `PDA_httpPost` APIs instead of `GM_xmlhttpRequest`, no `GM_setValue` / `GM_getValue` (so storage has to use `localStorage`), and an API-key auto-injection mechanism at script load time. This release adds the shim layer that translates between TECH's existing call patterns and PDA's runtime, so the same `.user.js` file now runs in both Tampermonkey and PDA without code branching at call sites.

### How it works

At the top of the IIFE, TECH detects which environment it's running in by checking whether PDA substituted the `###PDA-APIKEY###` placeholder. If yes, a small `_gm.*` shim wires `GM_setValue` / `GM_getValue` to `localStorage`, `GM_xmlhttpRequest` to `PDA_httpGet` / `PDA_httpPost` (callback-style on top of PDA's Promise API), and `GM_addStyle` to manual `<style>` injection. On Tampermonkey the shim is a pass-through to the real `GM_*` APIs, so Tampermonkey behaviour is unchanged.

PDA-injected API keys are auto-applied to `settings.apiKey` on first run, so PDA users don't have to paste a key manually. Existing keys are never overwritten.

### What's expected to work

- All API integrations (Torn, TornStats, BSP, FF Scouter) via the shimmed XHR
- Settings persistence via localStorage
- All read-only / display features (Dashboard, Fights tab, Scout, Test simulator, Settings)
- Pull spies / Pull BSP / Pull FF bulk fetches
- Cross-source consensus and faction-spy bulk endpoint (v1.2.0 features)

### Known gaps & rough edges

- **Right-click menu** doesn't exist in PDA — the menu-command registrations become no-ops. Use the panel's UI buttons instead.
- **Browser notifications** (chain-break / target-ready) don't fire on PDA — the Notification API isn't available; the script gracefully no-ops these, but you won't get push alerts. Use Torn's native chain UI.
- **Layout** — narrow PDA viewport may produce some clipping or scroll oddness, especially on the Scout tab where row content is dense and Settings where the form is long. Layout polish will land in v1.3.x as feedback rolls in.
- **Text encoding** — PDA's WebView has historically misread UTF-8 as Latin-1 in some versions, which could garble emoji/symbol characters. Whether the current PDA still has this issue is unknown — if you see ⚡ / ⚠ / ◆ / ↻ / · / em-dashes rendering as garbled glyphs, please report which page/element so we can fix in v1.3.x.

This is the **experimental** rollout — install on PDA, use it, and report anything that looks broken so we can iterate. Tampermonkey users are unaffected; the shim layer is dormant in that environment.

### Reference

The shim pattern is adapted from FF Scouter v2 (rDacted / Glasnost), which has had stable PDA support for a while. Their approach has been textbook for the userscript ecosystem.

---

## v1.2.3 — Lightweight auto-update mechanism

Switched the `@updateURL` from the full `.user.js` file to a tiny `.meta.js` file that contains *only* the metadata block. Tampermonkey hits the meta file (~1 KB) on every update check instead of pulling the full ~500 KB user.js — saves bandwidth, reduces pressure on GitHub's raw-URL rate limits, and makes update checks faster for everyone.

`@downloadURL` still points at the full `.user.js` — TM only fetches the big file when it actually detects a new version in the meta.

A GitHub Action (`.github/workflows/update-meta.yml`) regenerates `TornElephantCombatHelper.meta.js` automatically on every push to `main` that touches the `.user.js` file, by extracting the metadata block via `sed`. Drift between the two files is impossible by design — the meta is always derived from the user.js header.

No behaviour changes for users. Anyone on v1.2.2 or earlier needs to update once (their TM will pull v1.2.3 within the next 24h auto-check, or sooner via "Check for userscript updates"), after which all future updates flow through the much lighter `.meta.js` URL.

---

## v1.2.2 — TEST tab Specific dropdown mobile fix

The Specific (named-weapon) dropdown on the TEST simulator was clipping its closed-state text on mobile — selected weapons like "Jackhammer · dmg 71.5 · acc 65" displayed as "Jackhammer · dmg 71.5" with the trailing `acc` field hidden off-screen.

Added `min-width:0`, `text-overflow:ellipsis`, `overflow:hidden`, and `white-space:nowrap` to `.wpn-select`. The select can now shrink below its content's intrinsic width within the flex layout, and gracefully ellipsizes when narrow. The full option text remains visible when the dropdown is open (mobile native pickers have plenty of space).

---

## v1.2.1 — Mobile viewport fix

Panel was using a hardcoded `width:430px`. On Firefox mobile (and any browser with a viewport narrower than 446px after padding), the panel extended off the left edge of the screen — left content like the `DASHBOARD` tab label got clipped to `ASHBOARD`, settings rows lost the start of their labels, etc.

Replaced with `width:min(430px, calc(100vw - 24px))` plus `box-sizing:border-box` so the panel caps at 430px on desktop and shrinks gracefully to the viewport width minus 12px on each side on mobile. No other changes.

---

## v1.2.0 — Cross-source consensus + TornStats faction-spy bulk

Two synthesis layers on top of v1.1.0's three integrations. The data is already flowing in from spy / BSP / FF Scouter — v1.2.0 makes that data easier to *use*.

### What's new

1. **Cross-source consensus card** (`settings.consensusEnabled`, default **on**). Combines the available stat-prediction sources for an opponent into a synthesised median band, plus an explicit agreement chip that flags when the sources disagree. Renders as a new "Consensus" card at the very top of Opponent Intel with the headline verdict + per-source breakdown chips; the existing TornStats / BSP / FF Scouter cards stay below as the audit trail. Disagreement gets a short explainer line so the user knows not to over-trust a split read. Scout rows consolidate the separate `bsp`/`ff` bits into a single consolidated chip with `⚠` for major disagreement / `◆` for minor.

2. **TornStats faction-spy bulk endpoint.** The Pull spies button on the Scout tab now tries TornStats's `/api/v2/{key}/spy/faction/{factionId}` endpoint first — one HTTP call covers a whole roster and pulls wider coverage (faction-spy + personal-spy + faction-share entries) than the per-user endpoint alone. If the bulk call fails for any reason (network, subscription tier, partial roster), TECH silently falls back to the existing sequential per-user loop — worst case matches v1.1.0 behavior. Per-member spy data is parsed defensively across several possible response shapes since the public docs example was truncated.

3. **Honest synthesis design.** The consensus is the median of available source values, robust to one stale outlier, and the agreement chip explicitly says how much the sources agree. TECH never invents a prediction it didn't read from a real service — it's still a hub, not a silo.

### Cost

No new external services — both features layer on data v1.1.0 already collects. The bulk faction-spy call is a net *reduction* in TornStats traffic vs. the per-user loop it replaces.

### Caveat

Like v1.1.0's Phase 2 War Priority Queue, the cross-source consensus is best validated in real conditions. The faction-spy bulk endpoint is partly modeled from truncated docs — if you see spy data missing for opponents TornStats's website shows as spied, paste the API response shape so we can refine the per-member parser.

---

## v1.1.0 — Hub-not-silo integrations

The integration milestone. TECH stops being a closed loop over your own fight history and starts orchestrating data from the rest of the Torn ecosystem: BSP (Battle Stats Predictor), FF Scouter, and TornStats all feed the same Opponent Intel and Scout views. Positioning is explicit: TECH is a hub, not a silo — we want users running BSP, TornTools, TornStats, and FF Scouter alongside TECH, not picking between them.

### What's new

1. **BSP integration** (TDup-blessed 2026-06-01). Opt-in via Settings. Requires the user's own active BSP subscription — verified on every response via `SubscriptionEnd`, with a "Subscribe at BSP" nudge when lapsed. Output is roughened to coarse strength bands (Soft target / Matched / Dangerous / Out-of-league) so BSP's precise TBS stays a reason to subscribe directly. Roughened BSP card in Opponent Intel, color-coded `bsp` band in scout rows, **Pull BSP** bulk button.

2. **FF Scouter integration** (Glasnost/rDacted public API). Opt-in via Settings. Free tier provides FF rating + battle-stat estimate; the Premium tier "Top stats distribution" is surfaced when available. Batched endpoint = one HTTP call for an entire 100-member roster (much friendlier on the API budget than per-target calls). 1-hour cache TTL per the author's request. FF Scouter card in Opponent Intel + `ff` band in scout rows + **Pull FF** bulk button.

3. **Beatability cascade for Phase 2 War Priority Queue.** The scout sort that auto-activates when scouting your ranked war target now reads from the richest available signal: spy → BSP (subscriber-gated) → FF Scouter → local FF history → neutral. Each layer fills gaps the next can't, so users without one service still get useful priority scoring.

4. **Per-service Torn API key overrides.** Some Torn players keep multiple limited keys registered with different services. Three optional override fields in Settings — TornStats / BSP / FF Scouter — fall back to the main key when empty. Lets TECH talk to each service using whichever key the user registered there.

5. **Theme-aligned BSP / FF Scouter band palette.** Soft target = icy cyan, Matched = TECH purple, Dangerous = gold, Out-of-league = orange. Cool→warm escalation reads naturally.

6. **Pull-button retry-on-error behaviour.** Pull BSP / Pull FF now treat cached errors as immediately retryable on explicit user click. The 5-minute cooldown exists to prevent automatic hammering — it shouldn't gate a user's "try again" intent.

### Caveat — Phase 2 War Priority Queue early-access

Phase 2 (the war-target-aware priority scoring + auto-sort) is **war-untested in production**. It's gated dormant for users who aren't in an active ranked war (`meta.activeWarTarget` null), so non-war users see no change. War users get a clearly-marked early-access cycle; please report any glitches you see during a real war so we can refine.

### Cost

+1 batched HTTP call to BSP / FF Scouter per scouted roster *when those features are enabled*. Both opt-in, both default off. Cross-tab cache (v1.0.1) absorbs most repeat calls across multiple Torn tabs.

---

## v1.0.1 — Cross-tab API cache

A targeted fix for users who keep multiple Torn tabs open. Without it, each tab independently re-fetched the same endpoints — multiplying the Torn API budget by the number of open tabs and triggering rate-limit code 5 under normal multi-tab use.

`apiGet` now routes a freshness check through `GM_setValue` (shared across all tabs of the same userscript): before fetching, look up the stripped URL in a shared `xtcache` blob; if a fresh entry exists, resolve from cache and skip the network call. Default TTL 45 s — slightly under the default 60 s poll interval so two tabs with offset timers cover a full cycle without serving data older than one poll tick.

Cache key strips `_`, `key`, `comment` so identical "logical" calls from different tabs share a key. Error responses (anything with a top-level `error` field) are never cached — caching a rate-limit response would propagate it to every tab for the full TTL window, the exact thing we're trying to prevent. Hard eviction window is 24 h so long-TTL entries (catalog-style endpoints) get full cross-tab dedup without unbounded blob growth.

Validated on the author's install: poll cycle dropped from 73 s → 47 s under multi-tab usage, rate-limit code 5 errors eliminated. Companion patch shipped in TEEM v6.7.0.

---

## v1.0.0 — Stability declaration

The v0.7.0 feature set, war-validated in the TNU vs Infernum Perdition ranked war on 2026-05-29, is now the stable production version. No new features in this release — it's a milestone: TECH is feature-complete by design, and v1.0 declares the codebase production-quality for daily use.

Two stabilising fixes layered on top of v0.7.0:

1. **`@updateURL` + `@downloadURL` added** to the script header. Without these, Tampermonkey's auto-update logic could resolve TECH's update source to a sibling userscript with a higher version number (e.g. TEEM at v6.6.x > TECH at v0.7.0), silently overwriting TECH's installed code. Symptom: "TECH suddenly broke for no reason." Fix is preventive — every sibling userscript now carries its own explicit update/download URLs. **Reinstall from corrected source is required for the fix to take effect**, since Tampermonkey reads the update URL from the installed copy.

2. **Chain-break notifications gated to chain ≥ 10.** Torn's chain respect-multiplier tiers start at 10 (10/25/50/100/...). Below 10 there's no multiplier to protect — a dropped chain costs nothing meaningful. The chain-break notification was firing for sub-tier chains, which the user found noisy. Now silent below 10; the alert auto-arms the moment the chain crosses into multiplier territory. Settings label updated to reflect the floor.

Neither change affects core combat-data flow or any of the v0.7.0 Build Coherence feature set.

---

## v0.6.83 — Polish pass before v0.7.0

Two cleanup items on the way to the v0.7.0 milestone:

1. Empty-state Build Coherence placeholder. v0.6.81-82 surfaced nothing on the Dashboard when `settings.buildGoal` was null — first-time installers had no signpost for the entire 2-axis Build Verdict feature. Now renders a small placeholder card with a one-click "Open Settings" button when no goal is picked, mentioning the seven available archetypes by name.

2. Stale code-comment cleanup. Three live comments still described Phase 2/3 as "will add" / "will replace" with the original pre-reframe archetype list (Dodge/Sniper/Brawler/Burner/...). Updated to reflect what actually shipped (DoT Dan, Powerhouse Paul, the 2-axis verdict). UPDATE NOTES blocks at the top stay as-is — they're a frozen historical record.

Zero new API calls. Zero behaviour changes for users who already have a Build Goal set.

---

## v0.6.82 — Pure damage column completion + mismatch logic refactor

Pure damage column completion. Powerful + Specialist are the most universal weapon bonuses (drop on every weapon category), so the Pure damage family is the most common real-world loadout family. Filling the remaining four stat-shape combos lets non-Smasher / non-Dodge Pure damage users land on a named archetype instead of General George.

Four new archetypes (male / female):
- Heavy Brawler × Pure damage → Walloper Walt / Walloper Wendy
- Glass Cannon × Pure damage → Hitman Henry / Hitman Helena
- Tank × Pure damage → Bulwark Brent / Bulwark Brenda
- Chain Fighter × Pure damage → Workhorse Wally / Workhorse Wanda

ARCHETYPES is now 10 specific (goalKey, familyKey) entries plus the self-buff wildcard. Pure damage column fully populated.

Bonus refactor: `computeLoadoutCoherence` now uses a direct ARCHETYPES match instead of the v0.6.81 rigid "expects family X" check. With 10 specific archetypes, "Heavy Brawler expects Debuff" was misleading because Heavy Brawler ALSO has a Pure damage archetype now. New logic: a match means a specific archetype exists for this (goal, family) combo; mismatch only fires when NO direct entry exists. Mismatch hint upgraded to offer both paths — keep goal + swap weapons to the canonical expected family, OR keep loadout + switch to an alternative goal whose archetype matches.

Zero new API calls.

---

## v0.6.81 — Phase 3: 2-axis Build Verdict

Phase 3 of the v0.7 Build Coherence rewrite. The existing single-axis stat-shape verdict (ALIGNED/DRIFTING/OFF pill + colored card edge) is preserved as the at-a-glance signal, but the Build Coherence card now also surfaces:

- Soft score + 5-dot confidence visual next to the verdict pill ("DRIFTING · ⬤⬤⬤⬤◯ 72"). The dots give the granular "how close are you really" answer the hard-bucketed verdict label can't.
- New LOADOUT ALIGNMENT section under the existing stat bars: dots + score + dominant family + match status vs the expected family for the user's stat-shape goal.
- Family breakdown line when the loadout has more than one contributing family ("Pure damage 65% · Self-buff 35%").
- Mismatch hint when the user's loadout and stat-shape disagree, with actionable swap-or-retrain advice that points to the alternative stat-shape goal whose archetype matches the user's actual loadout.

New helpers: `STAT_TO_EXPECTED_FAMILY` (inverse of ARCHETYPES), `scoreToDots`/`dotsString`, `computeLoadoutCoherence`.

Stat-shape scoring: `100 - distanceL1 × 100 - 10 × violations`, floored at 0. Grinder always = 100. Loadout scoring: dominant family value share × 100. Both feed the same 5-dot scale (80+ = 5, 60-79 = 4, 40-59 = 3, 20-39 = 2, <20 = 1). Self-buff is special-cased as "matches any goal" since Snowballer is the wildcard archetype.

Zero new API calls.

---

## v0.6.80 — Flavor archetype names + Smasher stat-shape + General fallback

Phase 2 archetypes get full personality. All seven mapped archetypes now have alliterative male/female flavor names that pair with the user's character gender, and a "General" fallback covers any combo that doesn't map to a specific archetype — every loadout-with-bonuses gets a label, no more dead-end "no match" notes.

New stat-shape goal — **SMASHER**: all-offense Strength build with mid Speed + Defense and low Dex (Str ≥45%, Dex ≤10%, Spd/Def within ~10% of each other). Sits alongside Heavy Brawler as the "punchier less-tanky cousin."

Archetype map (male / female):
- Tank × DoT → DoT Dan / DoT Diana
- Glass Cannon × Crit / Burst → Critical Cody / Critical Candy
- Heavy Brawler × Debuff → Crippler Chris / Crippler Christine
- Chain Fighter × Reward-on-KO → Tricky Tony / Tricky Tammy
- Dodge/Evader × Pure damage → Dancer Donald / Dancer Donna
- Smasher × Pure damage → Powerhouse Paul / Powerhouse Paula
- Any shape × Self-buff → Snowball Samuel / Snowball Samantha
- (no specific combo) → General George / General Georgia

`meta.gender` captured from Torn's `/user/?selections=basic` on `identifySelf`. Existing installs without a cached gender refetch on next poll. ARCHETYPES entries shape changed to `{ male, female, blurb }`; `pickArchetypeName()` picks the variant, defaulting to male for unknown / Enby.

Zero new API calls.

---

## v0.6.79 — Phase 2 classifier fix: b.title

Phase 2 classifier fix: bonus names live under `b.title`, not `b.name`. v0.6.76 assumed `name` based on a partial schema read; v0.6.78's inline JSON debug surfaced the actual shape on the test loadout (Powerful 17 + Specialist 33 etc.). The classifier was silently dropping every bonus because `b.name` was undefined.

Fix: read `b.title || b.name` (defensive — both shapes work, so a future Torn API rename in either direction stays compatible). Same fallback applied to the family-evidence label so the Focus row shows the right bonus name.

Stripped: v0.6.78's inline JSON debug span on every weapon row and the console.log of the raw equipment payload in `fetchEquipment`.

---

## v0.6.78 — Diagnostic build (local-only)

Temporary diagnostic build. v0.6.76's Phase 2 archetype classifier wasn't detecting bonuses on a known-non-vanilla loadout. Two diagnostics added (both stripped in v0.6.79):

1. Inline yellow JSON dump of the raw bonuses array on every weapon slot row. No DevTools needed.
2. `console.log` of the raw `/v2/user/equipment` response + the normalized `meta.equipment` on every fetch.

---

## v0.6.77 — Post-war WAR Scorecard fix

Bug fix: WAR Scorecard leaked prior-war fights once the active war ended. Symptom: 13h 43m war ends, scorecard later reads "201h 26m elapsed" with W/L counts mixing the just-finished war and every ranked-war fight in storage (back to the prior war ~8 days earlier).

Root cause: v0.6.72's fallback. When `meta.activeWarTarget` cleared, the WAR `rawFilter` dropped its time floor and the scorecard anchored on the earliest fight in `views` — which for back-to-back-war players is a prior war's first hit, not the current war's.

Fix:
- New `meta.lastWarTarget` snapshot. Captured automatically on the active → null transition. Also populated on cold start from the API's recently-ended wars within the 7-day TTL window, so users who install the fix POST-war still get the right scorecard back.
- WAR `rawFilter` now reads `activeWarTarget || lastWarTarget` for both the `warStart` floor AND a new `warEnd` ceiling.
- `computeWarScorecard` returns `isPostWar` + `warEndedAt` so the render layer can flip the title to "Last War Scorecard" with an "ended Xh ago · vs Faction" subtitle.
- `lastWarTarget` auto-purges after 7 days.

Zero new API calls.

---

## v0.6.76 — Phase 2: Loadout archetype detector

Phase 2 of the v0.7 Build Coherence rewrite — loadout-archetype detection. The Equipped Loadout card now reads the `bonuses` array on each equipped weapon, clusters the bonuses into six effect families (DoT / Crit-burst / Debuff / Reward-on-KO / Self-buff / Pure damage), and surfaces the dominant family + the 2-axis archetype label when the family pairs with the user's stat-shape goal.

Six recognized archetypes initially (later renamed in v0.6.80):
- Tank + DoT → DOT Bill
- Glass Cannon + Crit → Crit Demon
- Heavy Brawler + Debuff → Crippler
- Chain Fighter + Reward-on-KO → Plunderer
- Dodge + Pure damage → Dancer
- Any + Self-buff → Snowballer

Dodge is a new BUILD_GOALS entry alongside Glass Cannon / Tank / Heavy Brawler / Chain / Grinder — pure-Dex evasion shape.

Bonus-name to family mapping covers 60+ entries from the Torn wiki catalogue. Body-part hunters (Achilles / Crusher / Throttle etc.) and armor-bypass (Penetrate / Puncture) are folded into Pure damage. Pure-utility bonuses (Storage / Parry / Hazardous / Sleep) are intentionally unclassified.

Zero new API calls.

---

## v0.6.75 — Equipped Loadout normaliser fix + diagnostic strip

Equipped Loadout normaliser audited against the live `/v2/user/equipment` response and fixed. The truncated v2 swagger schema led v0.6.71 to treat `item.slot` as a string slot-name; the actual payload encodes it as integer 1-9 (with the temporary slot wedged non-intuitively between body and helmet). v0.6.75 adds an explicit `EQUIPMENT_SLOT_BY_NUMBER` lookup, prefers `sub_type` over `type` for the inline label (so the card reads "Shotgun" / "Pistol" / "Body" instead of "Weapon" / "Armor"), and drops the v0.6.73 in-panel debug block + first-fetch console diagnostic.

---

## v0.6.74 — Equipment normaliser integer-slot fix

Live `/v2/user/equipment` payload encodes `item.slot` as an integer 1-9, not the string slot-name v0.6.71 assumed. Added `EQUIPMENT_SLOT_BY_NUMBER` map. (Folded into v0.6.75 release notes; see above.)

---

## v0.6.73 — Equipped Loadout debug aid

Diagnostic build for v0.6.71 Equipped Loadout: persisted the raw `/v2/user/equipment` payload to GM storage and rendered it inline below the card when the normaliser returned all-empty slots. Self-removed once any slot populated. (Stripped in v0.6.75 once the actual schema was verified.)

---

## v0.6.72 — WAR Scorecard prior-war leak fix

Bug fix: War Scorecard elapsed-time clock + every WAR-pill stat were silently including ranked-war fights from PRIOR wars, not just the current one. Symptom: scorecard reads "191h 54m elapsed" four hours into a fresh war, because the oldest ranked-war fight in storage dates back to the last war 8 days ago.

Root cause: WAR window's `rawFilter` only checked `r.ranked_war`. No timestamp floor. The v0.6.70 active-war detection already gives us the current war's exact start time via `meta.activeWarTarget.warStart`, but nothing was using it for scoping.

Fix:
- WAR `rawFilter` now also requires `r.timestamp_ended >= warStart` when an active war target is detected.
- `computeWarScorecard` now uses `warStart` for the elapsed clock with the earliest-fight fallback only when no active war target is cached.

Zero new API calls.

---

## v0.6.71 — Phase 1: Equipped Loadout card

Phase 1 of the v0.7 Build Coherence rewrite. Polls `/v2/user/equipment` every 5 minutes and surfaces the user's currently equipped weapons + armor below the existing Build Coherence verdict on the Dashboard.

Each weapon slot (Primary / Secondary / Melee / Temp) renders the equipped item's name, type, and — when the name matches an entry in the WEAPONS wiki table — an inline "dmg X · acc Y" readout pulled from the wiki midpoints. The armor row packs Helmet / Body / Pants / Boots / Gloves into a single dash-separated line so the card stays vertically tight.

Cost: +1 API call per 5 minutes.

---

## v0.6.70 — Dual chain pills during ranked war

Dual chain pills on the Dashboard during an active ranked war. TECH now auto-detects the user's faction's current ranked-war target via the `/faction/?selections=basic` endpoint (throttled to 5 minutes); when a war is in progress, the chain pill at the top of the Dashboard splits into a side-by-side pair — your chain on the left, the enemy faction's on the right. Both pills tick independently, both urgency-color the same way.

In dual-pill mode both sides always render — including an idle "No active chain" placeholder when one side has nothing going. That's deliberate: "you have no chain, but they're at 47" is itself actionable war intel. When no active war is detected, the Dashboard falls back to the original single-pill behavior.

Cost: +1 API call per 5 minutes when not throttled.

---

## v0.6.69 — Scout tab hospital tracker

Scout tab roster rows now lead with a colored status dot (locked/abroad/online/idle/offline) matching the Targets queue, and locked rows render a live "Hosp 14:23" / "Jail 2h 14m" / "Fed 5h 12m" countdown that ticks every second.

Two new sort options:
- Hospital (out soonest) — locked rows ranked by closest release.
- Status (hittable first) — Okay > Hospital/Jail/Fed (soonest out) > Traveling/Abroad.

Same rate-limit posture as before — uses already-cached roster data; no new API calls.

---

## v0.6.68 — Faction chain.timeout format fix

`/faction/{id}?selections=chain` returns `chain.timeout` as seconds-remaining (matching the cooldown convention), not as a Unix timestamp like the v0.6.45 comment claimed. Caused the Faction Intel drill to show "No active chain" even when the target faction was mid-chain. Added `resolveChainTimeoutAt` heuristic that routes values under a day as relative offsets while passing absolute timestamps through unchanged. Applied to both the faction and self-state code paths for symmetry.

---

## v0.6.67 — Weekly Digest card

New Weekly Digest card on the Dashboard. Fixed 7-day vs prior-7-day comparison table with direction-of-improvement coloring (win rate up = good, incoming attacks down = good, hosp'd them up = good, got hosp'd down = good). Independent of the window pill so the weekly read is always available.

Eight metrics: Fights · Outgoing · Incoming · Win rate · Respect net · Hosp'd them · Got hosp'd · Avg attacker level. Each row shows this week / last week / Δ with arrow.

---

## v0.6.66 — Incoming Activity card

New Incoming Activity card on the Dashboard. Surfaces patterns from fights where the user was the defender. Two questions answered:

1. WHEN do you get hit? — 24-bucket hour-of-day histogram so the user can time hospital/jail/abroad to dodge peak attack hours.
2. WHO keeps coming back? — top recurring attackers across the window, sorted by hit count.

Hours bucket by LOCAL timezone. Stealthed attacks count for hour patterns but are excluded from the persistent-attackers list since opponentId is anonymous on stealthed hits.

---

## v0.6.65 — TEST per-weapon named picker

Per-weapon picker SHIPPED on the TEST sim's stat panels. Second dropdown ("Specific") under each side's weapon class lists named wiki weapons (~130 entries) with their exact dmg/acc. "(class average)" default preserves v0.6.x behaviour. Picking a specific weapon overrides the class midpoint with the wiki's exact dmg+acc inside `testRunMatch`.

User-loadout weapons selectable by name: Ithaca 37, Qsz-92, Metal Nunchakus, etc. Excluded: "?? - ??" entries and "Coming Soon" weapons.

Mirror button copies the picker too — dispatches `change` on the opponent's class dropdown first so the picker repopulates with mirrored class's options before assignment.

---

## v0.6.64 — Personal Weapon Performance card

New Personal Weapon Performance card on the Dashboard. Aggregates the DOM-hook per-hit events captured on the attack page (the only place per-hit damage and weapon name exist; the v2 attacks API gives end-of-fight summary only). Filters to outgoing hits, buckets by weapon string verbatim from the combat log, surfaces hits / total damage / avg per hit / top body part per weapon.

Silent until there's at least one damage-bearing outgoing event; shows a quiet hint when DOM is wired but no out-hits landed yet.

---

## v0.6.63 — HIT badge URL: /loader.php → /page.php

Bugfix on v0.6.62: the HIT badge linked to `/loader.php?sid=attack` but Torn migrated attack pages to `/page.php?sid=attack`. The old URL now returns "This endpoint is no longer available."

Three call sites updated:
1. The HIT badge link in `renderTargetQueue` — now points at `/page.php`.
2. `getActiveOpponentFromUrl` (Active-Page Banner) — now accepts both `/page.php` and `/loader.php` so stale links still trigger the banner.
3. `isAttackPage` (DOM hook gate) — same: accept both so the hook attaches on the new URL going forward.

---

## v0.6.62 — HIT badge becomes a real attack link

UX fix: the ⚡ HIT badge on Targets queue rows now actually attacks. Previously it was a visual marker only — clicking it triggered the row's drill-into-intel handler. Now the badge is an `<a>` element linking to the attack page; `stopPropagation` keeps the row's drill handler from firing too, so the row-vs-badge distinction is preserved: badge = attack, row elsewhere = open Opponent Intel.

Right-click → "open in new tab" works naturally because it's a real anchor.

---

## v0.6.61 — Chain-break notification

Chain-break browser notification. Opt-in via Settings. Background watcher runs every 5 seconds reading the chain state from Torn's sidebar (same zero-API-cost path the chain pill uses) and fires a browser notification when an active chain drops below 60s remaining.

Runs independent of the panel — the existing chain pill ticker only ticks while the Dashboard is rendered, so a user with TECH minimized wouldn't otherwise catch a chain about to break. The watcher closes that gap.

Dedup: fires ONCE per critical dip. State resets when chain bounces back above 90s.

Zero new API calls — pure DOM scrape.

---

## v0.6.60 — Quick Wins panel

Quick Wins panel — chain-fight optimizer. New Dashboard section that ranks opponents from the user's fight history by a composite "chain efficiency" score:

```
score = winRate²
      × respectPerFight
      × (60 / max(avgDurationSec, 30))   // reward short fights
      × stalenessPenalty                  // ½ past 30d, ¼ past 90d
```

Eligibility: you were the attacker, ≥3 outgoing fights, win rate ≥ 50%, usable timing data, last seen within a year. Top 8 candidates.

Design choice — DATA-DRIVEN ONLY. The panel doesn't poll live status for non-pinned candidates; that's the Targets panel's job. Zero new API calls.

---

## v0.6.59 — Stability sweep

Five findings from the post-v0.6.58 code review, none ship-blocking:

1. `store()` and `load()` used to silently swallow GM storage failures. Now both `console.warn` on catch and stash the error to a module-level `lastStoreError`.
2. Removed unused `escapeHtml()` helper. The `el()` DOM builder routes all dynamic content through `.text → textContent`, which is XSS-safe by construction.
3. `factionChainCache` now included in the 30-day TTL sweep alongside `spyCache` and `scoutData`.
4. `domSeenUnknown` Set now caps at 200 entries.
5. The `bodyObs` MutationObserver inside `attachLogObserver()` now self-disconnects after 30s if the log selector never appears.

---

## v0.6.58 — Cache hygiene (30-day TTL sweep)

30-day TTL sweep for `spyCache` and `scoutData`. Both keyed-by-id caches had no eviction beyond explicit user actions. Over months of pre-war scouts they would otherwise grow into thousands of stale entries.

New constant `CACHE_TTL_SEC = 30 * 86400`. New init-time IIFE `sweepStaleCaches()` walks both caches once per page load, drops any entry older than the TTL, and rewrites storage only if anything was removed.

`factionChainCache` and `targetStatus` are deliberately NOT swept — bounded by drill-opens and pinned targets respectively.

Zero new API calls.

---

## v0.6.57 — Polish pass (two P1 fixes)

Two fixes surfaced by a code review:

1. Errored cache entries refetched without throttle. `maybeFetchSpy` and `maybeRefreshFactionChain` both gated their refresh window on `!cached.error` — meaning any cached error bypassed the throttle entirely. New constants `SPY_ERROR_RETRY_SEC` and `FACTION_CHAIN_ERROR_RETRY_SEC` (both 60s) match the existing targets pattern.

2. Dead setting removed: `settings.targetsRefreshSec`. Held a 120s default but hadn't driven refresh timing since the v0.6.47 adaptive-cadence pivot.

Zero new features. Zero new API calls.

---

## v0.6.56 — Strip the TornStats batch attempt

Strips the v0.6.55 TornStats batch attempt. Verified against the TornStats v2 docs that `/spy/faction/{id}` returns a faction roster + Torn personalstats — NOT spy stats. The member objects have no strength/defense/speed/dexterity fields. Even if the endpoint worked for our key, it couldn't have populated the Scout spy column with usable stat data.

Per-member loop is the only path TornStats actually exposes that returns the stat fields. Sequential pull cost unchanged from v0.6.54.

Retained from v0.6.55: spy total sort options.

---

## v0.6.55 — Spy sort options

Two new entries in the Scout sort dropdown: "Spy total (high → low)" and "Spy total (low → high)". After bulk-pulling spies, picking either reorders the roster by actual stat mass — heavy hitters or soft targets surface immediately without scanning per-row badges.

Members without populated spy data (no cache / noData / error) sink to the end so the meaningful rows always lead.

---

## v0.6.54 — Scout bulk TornStats spy enrichment

Scout tab gets bulk TornStats spy enrichment. Adds a "Pull spies" button alongside the existing sort/filter controls: click it once after fetching a roster and TECH sequentially pulls spy data for every member, surfacing their estimated total stats inline on each row.

Implementation:
- `pullSpiesForRoster(roster)` walks the roster sequentially with a 250ms inter-call delay (so a 100-member faction takes ~25s).
- Skips members with a fresh cached spy entry.
- Bails on first hard fetch error.
- Aborts cleanly on Torn-side rate-limit.
- Re-renders the Scout panel every 5 fetches.

UI: "Pull spies (N)" button counts members without a fresh spy cache. Member rows get a "spy 1.2M" badge inline with the existing meta bits.

API budget: one TornStats call per uncached member, throttled to ~4/sec.

---

## v0.6.53 — TornStats "User not found" reclassified

Fix: TornStats "User not found" response was being surfaced as a red error stripe in the spy card. It's not an error — TornStats simply has no record of that player. Reclassified to render as the neutral "No spy on record" line.

`fetchSpyData` now matches the message of any `status:false` response against "not found" or "no spy" substrings; either match reclassifies to the noData state.

---

## v0.6.52 — TornStats spy integration

TornStats spy integration on the Opponent Intel drill. Pulls the latest spy report from tornstats.com — total estimated stats + the four per-stat values, each with the timestamp of when it was last spied — and surfaces them inline on every drill open.

- `fetchSpyData(id)` hits `https://www.tornstats.com/api/v2/{key}/spy/user/{id}` using the user's Torn API key for auth — no separate TornStats key needed.
- Per-target cache in `spyCache` throttled to 1 hour per target.
- Auto-fetch fires on `openOpponentDrill()`.
- Distinguishes four states: loading / error / no-data / populated.
- `@connect www.tornstats.com` added to header.

Target Queue rows also surface cached spy totals as "spy 1.2M" subline bits at zero extra API cost.

API budget: +1 TornStats call per drill open (throttled to 1h).

---

## v0.6.51 — Faction Intel empty-state fix

Bugfix: Faction Intel drill bailed out completely when the user had no local fight history against the target faction — exactly the pre-war scenario where the v0.6.50 chain timer is most useful. Symptom: click a faction in Scout, see "No fights against this faction yet" with no chain pill, no faction name.

Fix mirrors v0.6.41's Opponent Intel empty-state fix. The empty branch now renders the faction name + chain pill regardless of fight history, then shows a softer "no fight history" empty message.

Pure ordering fix — no new state, no API changes.

---

## v0.6.50 — Enemy faction chain timer

Enemy faction chain timer on the Faction Intel drill. When does the target faction's chain break, what's their current respect modifier, how long until their post-break cooldown ends. Lets the user time a strike to break their chain or schedule a hit-cluster to land just as their cooldown ends.

- `fetchFactionChain(id)` hits `/faction/{id}?selections=chain` and normalises the response to absolute Unix timestamps.
- Per-faction cache in `factionChainCache` throttled to 30s per faction.
- Rate-limit gated.
- Auto-fetch on `openFactionDrill()`; manual ↻ button bypasses the throttle.
- Auto-refresh when the local countdown elapses.

Render states: active / cooldown / error / idle. Reuses the existing `.tech-chain-pill` CSS so urgency colors stay consistent with the user's own chain pill.

API budget: +1 call per Faction Intel drill open (throttled).

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
