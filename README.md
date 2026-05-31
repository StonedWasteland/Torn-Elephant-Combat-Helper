<h1 align="center">TECH — Torn Elephant Combat Helper</h1>

<p align="center">
  <img src="https://raw.githubusercontent.com/StonedWasteland/Torn-Elephant-Combat-Helper/main/assets/tech-mascot.png" width="160" alt="TECH mascot">
</p>

<p align="center">
  <em>Passive combat intelligence for <a href="https://www.torn.com/">Torn City</a>.<br>
  Your fights, your data, your conclusions.</em>
</p>

<p align="center">
  <a href="https://github.com/StonedWasteland/Torn-Elephant-Combat-Helper/raw/main/TornElephantCombatHelper.user.js"><strong>Install via Tampermonkey</strong></a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/StonedWasteland/Torn-Elephant-Economy-Manager">Sibling: TEEM</a>
</p>

---

## What it is

TECH runs in your browser as a single Tampermonkey userscript. While you play Torn, it quietly captures every fight from the v2 attacks API and builds a personal combat dashboard on top of your own history. No accounts, no servers, no telemetry — every byte lives in your browser's userscript storage.

The script answers questions you'd otherwise have to keep in your head:

- Is this opponent actually dangerous to me, or am I just guessing?
- Am I being farmed by chainers above my level, or am I out-statting them?
- Where on the fair-fight curve are my best returns?
- Does my actual stat distribution match the build I'm trying to play?
- When does the enemy faction's chain break?
- Is this pinned target hittable right now?

If you've ever lost a chain because you mistimed a target's release, or punched into someone who quietly hospitalized you twice already, this is the script for you.

---

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser (Chrome, Firefox, Edge, Opera, Safari).
2. Open the [latest userscript](https://github.com/StonedWasteland/Torn-Elephant-Combat-Helper/raw/main/TornElephantCombatHelper.user.js) — Tampermonkey will prompt to install. Hit **Install**.
3. Refresh any `torn.com` page. The mascot launcher appears in Torn's top-right toolbar (next to your avatar).
4. Click the launcher → **Settings** tab → paste your Torn API key. A **Limited** access key is enough.
5. Hit **Save & start**. Background polling kicks off immediately.

**Hotkey:** `Alt+I` toggles the panel from anywhere on torn.com.

### Updating

Tampermonkey checks for updates automatically. To force an update, open the dashboard, find TECH, click **Check for userscript updates**.

---

## What you get

### Dashboard
- **Chain pill** with live countdown, urgency colors (green / amber / red-pulse), and respect-modifier display. Reads from Torn's sidebar in real time — works during API rate-limits.
- **Targets queue** — pin opponents from any Opponent Intel drill. Live online status, hospital countdowns, and a green **HIT** badge when they're attackable and you have the energy. Optional browser notification when a pinned target leaves hospital/jail/abroad.
- **Stats grid** — win rate, respect net, hospitalisation counts (both directions), respect-per-bar, filtered by 24H / 7D / 30D / All / **WAR** windows.
- **War Scorecard** — dedicated hero panel that appears when the WAR window is active. W/L, net respect, time elapsed, respect-per-hour pace, KO counts both directions.
- **Build Coherence** — pick a build goal (Glass Cannon, Tank, Heavy Brawler, Chain Fighter, Stat Grinder, Dodge, Smasher) and the dashboard delivers a two-axis verdict: how well your stats match the goal, AND how concentrated your weapon-bonus loadout is around a single effect family (DoT, Crit/burst, Debuff, Reward-on-KO, Self-buff, Pure damage). The two axes resolve to a named archetype — DoT Dan, Critical Cody, Powerhouse Paul, Tricky Tony, and 8 more (gendered variants for female characters). When your stats and loadout disagree, the card surfaces both paths: swap weapons toward the canonical family for your goal, or switch goals to match the loadout you're already running. Equipped Loadout card below shows all 9 slots, polled every 5 min.
- **Leveling Trap Detector** — aggregates incoming-attacker levels and renders a verdict: NORMAL / WATCH / FARM TARGET / OUT-STATTING. Stat-builder-safe: distinguishes "high-level chainers can't dent me" from "I'm getting farmed."
- **Difficulty Roadmap** — buckets your outgoing fights by Torn's fair-fight modifier (FF 1.0–3.0) and ranks each bracket PRIME / SAFE / CONTESTED / AVOID. Tells you where you actually win, not where you "should" be hunting.

### Opponent Intel drill
Click any fight row or top-opponent row. The panel drills into a full intel view for that player:
- Verdict (FAVORABLE / TANKY / DANGEROUS / STALE / UNKNOWN / NEUTRAL) with a plain-language blurb.
- Win rate, respect net, hospitalisation record, level history, interrupt rate.
- **TornStats spy card** — pulls latest spy data via TornStats (uses your Torn API key, no separate key needed).
- Finishing-hit weapon effects fired on you, and fired by you.
- Outcome breakdown bar chart + last 6 fights.
- Star button to pin to the Targets queue.

### Faction Intel drill
Click a faction name from Opponent Intel or Scout. Aggregates every fight against that faction's roster:
- Collective W/L, KO counts, respect net.
- **Enemy chain pill** — same urgency-coded countdown as your own chain, but for the target faction. Critical pre-war intel.
- Power Profile — opponent level histogram, fair-fight bracket distribution, and the weapon effects that faction tends to fire on you.
- Verdict mix across the roster.
- Top opponents within the faction, click any to drill further.

### Scout tab
Enter an enemy faction ID, hit Fetch roster. TECH pulls the full member list and runs your local fight history against every member to produce one verdict per player. DANGEROUS rows surface first.
- Sort by Verdict / Level / Last action / Spy total / Name.
- Filter out locked (Hospital/Jail/Federal) and traveling members.
- **Pull spies** button bulk-fetches TornStats spy data for every roster member. ~25 seconds for a 100-member faction, near-instant on re-pull thanks to the 1-hour cache.
- Click any row to drill into Opponent Intel.

### TEST simulator
A Monte Carlo battle simulator on the same engine the Build Coherence card uses. Pick your stats (or auto-fill from cache), opponent stats, weapon class, armor preset, drug, and HP override. Run 10 / 100 / 1000 / 5000 trials. Output includes:
- Win / loss / mutual-KO breakdown.
- Per-region damage table per side (Head/Chest/Stomach/Groin/Arms/Legs) with armor coverage and damage-per-hit.
- Calibration tag (`formula-only` for pure stats, `provisional-v0.4` once weapons or armor are in play).

### Active-Page Banner
When you're on a Torn profile (`/profiles.php?XID=`) or attack page (`/loader.php?sid=attack`), TECH prepends a verdict banner above the panel content. One tap drills you into that opponent's Intel. Built for war scouting — glance, decide, commit.

### DOM hook (per-hit data)
The v2 attacks API doesn't expose per-hit damage, weapons, body parts, or rounds fired. TECH hooks the live combat log on attack pages, parses each line with structured regexes (fire / throw / melee / fist / finishers / etc.), and merges captured events into the fight record. Fight rows then surface total outgoing damage and weapons used as a green badge with a detailed tooltip.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| Torn API key | (none) | Limited access is enough. Stored locally only. |
| Poll interval | 60s | How often TECH fetches new fights. 30 / 60 / 120 / 300 supported. |
| Build goal | (none) | Enables the Build Coherence Checker. Pick the shape you're training toward. |
| Target-ready notifications | off | Browser notification when a pinned target leaves hospital/jail/abroad. Requires permission. |

Tampermonkey menu commands (right-click the TM icon → TECH):
- **Toggle panel** — same as Alt+I.
- **Poll now** — force an immediate API poll.
- **Export fights (JSON)** — download every stored fight + your live DOM buffer for safekeeping or analysis.
- **TEST sanity check** — run the simulator's canned matchups, log to DevTools console. Useful for verifying the engine hasn't drifted.
- **Reset panel position** — emergency rescue if the panel ends up off-screen.

---

## Data & privacy

- **Everything lives in your browser's GM storage.** Nothing leaves your machine unless you opt into a community feature (none are enabled yet).
- **Torn API key:** used only to call `api.torn.com` directly from your browser. Never transmitted to any third party.
- **TornStats spy data:** uses your same Torn API key against `tornstats.com`. Disable by avoiding the spy refresh button; it's never auto-pulled on poll.
- **Export your data anytime:** Settings tab → **Export fights (JSON)** or the Tampermonkey menu command. The export includes all stored fights and the live DOM event buffer.
- **Wipe your data anytime:** Settings tab → **Clear all data**. Nuclear option, no undo.

The userscript is one file with no dependencies. Read it. Audit it. It's ~9,500 lines of plain JavaScript.

---

## Compatibility

- **TornTools, BSP, FF Scouter:** designed to coexist. TECH's launcher anchors on the stable `#recent-history-wrapper` Torn id so it shouldn't fight with other extensions for header space.
- **Torn PDA (mobile app):** not currently tested. The DOM hook for live attacks expects a desktop combat log. PDA support is on the roadmap.
- **Mobile browsers:** the panel renders but the 430px-fixed-width layout is cramped. Mobile-responsive layout is on the roadmap.

TECH and most other Torn tools share your one Torn API key, which has a **100 requests/minute** budget. TECH at default settings idles around **1–2 calls/minute** plus brief bursts during a Scout spy pull. Pair with [TEEM](https://github.com/StonedWasteland/Torn-Elephant-Economy-Manager) (its sibling, ~15 calls/min at default) and you've still got ~80 calls/min headroom for other tools.

---

## Roadmap

Live now (above) covers most of the personal-data feature surface. The bigger asks from the original vision are still in flight:

- **Crowdsourced intelligence engine** — anonymized fight data pooled across opt-in users. Weapon tier lists from real outcomes. Opponent profiles filled in by hundreds of fights. Meta shifts detected automatically. Requires server-side infrastructure that isn't built yet.
- **Equipment efficiency scoring** — score the temporary weapon you're running against your actual outcomes, not wiki theory. Engine needs more captured-fight data first to calibrate.
- **Cost-per-fight / cost-per-bar analytics** — temp-weapon spend vs. respect-and-stat-gain returns.
- **Chain-fight optimizer** — historical quick-win target list per user, fed back into Targets.
- **Weekly performance report** — automated digest of what improved/regressed and what to focus on next.
- **Stat efficiency curves** — personal diminishing-return thresholds derived from your fight pool.
- **PDA / mobile-responsive layout** — first-class support for Torn's official mobile app + narrow browsers.

If any of these matter to you specifically, open an issue and say so — it'll move things up the queue.

---

## Sibling: TEEM

[**TEEM — Torn Elephant Economy Manager**](https://github.com/StonedWasteland/Torn-Elephant-Economy-Manager) is TECH's market-focused counterpart. Same author, same elephant, same browser-local data model. Where TECH watches combat, TEEM watches the market: live item prices, travel profit rankings, war-gear pricing, crime $/hr tracker. They share your one Torn API key and play nicely together.

---

## Author & credits

Built by **Wasteland** (John Haloguy in-game). The tactical-elephant mascot is also by Wasteland.

Issues, feature requests, and weird-bug reports: [GitHub Issues](https://github.com/StonedWasteland/Torn-Elephant-Combat-Helper/issues).

---

## License

[MIT](LICENSE). Install it, audit it, fork it, ship derivatives — just keep the copyright notice intact.
