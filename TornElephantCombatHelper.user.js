// ==UserScript==
// @name         TECH — Torn Elephant Combat Helper
// @namespace    https://torn.com
// @version      1.0.0
// @description  TECH (Torn Elephant Combat Helper) — passive fight-log capture and a personal combat dashboard. Your own data, your own conclusions. Sibling to TEEM. Designed to run alongside TornTools.
// @author       John Haloguy
// @icon         https://raw.githubusercontent.com/StonedWasteland/Torn-Elephant-Combat-Helper/main/assets/tech-mascot.png
// @match        https://www.torn.com/*
// @updateURL    https://raw.githubusercontent.com/StonedWasteland/Torn-Elephant-Combat-Helper/main/TornElephantCombatHelper.user.js
// @downloadURL  https://raw.githubusercontent.com/StonedWasteland/Torn-Elephant-Combat-Helper/main/TornElephantCombatHelper.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// @connect      www.tornstats.com
// @run-at       document-idle
// ==/UserScript==

// ─── UPDATE NOTES (0.7.0 — Build Coherence milestone) ──────────────
// v0.7.0 is the public milestone that finishes the Build Coherence
// rewrite started at v0.6.50. The Combat tab Dashboard now ships a
// two-axis read on your character: stat-shape × loadout effect family,
// with a flavor-named archetype combining both.
//
// What's in v0.7.0:
//
// 1. Equipped Loadout card (v0.6.74). Polls /v2/user/equipment every
//    5 min, renders your 9 slots inline below the Build Coherence
//    verdict. ↻ button forces an immediate refresh outside the throttle.
//
// 2. Loadout family classifier (v0.6.76, debugged v0.6.78-79). Every
//    weapon bonus on your equipped gear is bucketed into one of 6
//    families: DoT, Crit/burst, Debuff, Reward-on-KO, Self-buff,
//    Pure damage. Dominant family + share rendered on the loadout card.
//    (Bug fix in v0.6.79: the API field is `title`, not `name` —
//    earlier classifier silently dropped every bonus.)
//
// 3. New stat-shape goals (v0.6.76, v0.6.80). Dodge (pure-Dex evasion)
//    and Smasher (high Str / high damage / medium Spd-Def / low Dex)
//    join the existing Heavy Brawler, Glass Cannon, Tank, Chain
//    Fighter, and Stat Grinder shapes — 7 total.
//
// 4. 2-axis verdict (v0.6.81). Build Coherence card now shows two
//    independent scores: stat alignment (how well your stats match the
//    chosen goal) AND loadout alignment (how concentrated your dominant
//    family is). 5-dot confidence rendering for both.
//
// 5. Gendered archetype names (v0.6.80, v0.6.82). 10 specific
//    (stat-shape × family) archetypes + one wildcard for Self-buff +
//    General George/Georgia fallback. Names render based on character
//    gender from /v2/user (?selections=basic). Pure damage column is
//    fully populated as of v0.6.82, since Powerful + Specialist are the
//    most common bonuses in real-world loadouts.
//
//    Full archetype roster (male / female):
//      Tank          × DoT         → DoT Dan / DoT Diana
//      Glass Cannon  × Crit/burst  → Critical Cody / Critical Candy
//      Heavy Brawler × Debuff      → Crippler Chris / Crippler Christine
//      Chain Fighter × Reward-KO   → Tricky Tony / Tricky Tammy
//      Dodge         × Pure damage → Dancer Donald / Dancer Donna
//      Smasher       × Pure damage → Powerhouse Paul / Powerhouse Paula
//      Heavy Brawler × Pure damage → Walloper Walt / Walloper Wendy
//      Glass Cannon  × Pure damage → Hitman Henry / Hitman Helena
//      Tank          × Pure damage → Bulwark Brent / Bulwark Brenda
//      Chain Fighter × Pure damage → Workhorse Wally / Workhorse Wanda
//      Any           × Self-buff   → Snowball Samuel / Snowball Samantha
//      Fallback                    → General George / General Georgia
//
// 6. Smart mismatch hints (v0.6.82). When no archetype exists for your
//    (goal, family) combo, the verdict offers BOTH paths: keep the goal
//    + swap weapons toward the canonical expected family, OR keep the
//    loadout + switch to a stat-shape goal whose archetype matches your
//    current loadout family.
//
// 7. Empty-state placeholder (v0.6.83). First-time installers with no
//    Build Goal set now see a small placeholder card on the Dashboard
//    naming all 7 stat-shapes with a one-click "Open Settings" button,
//    instead of nothing.
//
// Also bundled in this milestone:
//   - Post-war WAR Scorecard fix (v0.6.77): meta.lastWarTarget snapshot
//     + warEnd ceiling kill the prior-war leak. Title flips to
//     "Last War Scorecard · ended Xh ago · vs FactionName".
//   - Live faction chain pill in the Faction Intel drill (v0.6.50).
//   - Per-weapon picker for TEST sim (v0.6.65, 130+ wiki weapons).
//   - GM_xhr browser cache bypass (v0.6.30).
//   - Various polish around the Dashboard layout, drill, and modal UX.
//
// Cost: +1 API call per 5 min for /v2/user/equipment. No other new
// polls. Storage growth is bounded by the 9-slot equipment shape +
// the lastWarTarget snapshot (auto-purged at 7 days).
//
// Older per-version UPDATE NOTES (v0.6.49 and earlier, plus the
// granular v0.6.50–v0.6.83 entries that built up to this milestone)
// live in CHANGELOG.md alongside this file. Tracked there so the
// userscript header stays focused on what's new in the current
// feature wave. If you're upgrading from TornIQ-era storage
// (pre-v0.2.0), the migrator at the top of the IIFE handles the
// tiqc_* → tech_* rename on first run.

(function () {
  'use strict';
  try {

  // ─── CONFIG ─────────────────────────────────────────────────────────────
  const SCRIPT_KEY        = 'tech_';
  const SCRIPT_NAME       = 'TECH';
  const SCRIPT_LONG_NAME  = 'Torn Elephant Combat Helper';
  const SCRIPT_VERSION    = '1.0.0';

  // Full TECH mascot artwork (by Wasteland, the script author) hosted in
  // the Torn-Elephant-Combat-Helper GitHub repo under /assets/. Loaded over
  // HTTPS so the .user.js source stays compact and edits don't churn the file.
  const MASCOT_DATA_URL   = 'https://raw.githubusercontent.com/StonedWasteland/Torn-Elephant-Combat-Helper/main/assets/tech-mascot.png';
  // Simplified head-only launcher mark (by Wasteland) - pure violet silhouette,
  // designed to read cleanly at 22px in Torn's header where the full mascot is
  // too detailed. Hosted alongside the mascot in the public repo's /assets/.
  const LAUNCHER_MARK_DATA_URL = 'https://raw.githubusercontent.com/StonedWasteland/Torn-Elephant-Combat-Helper/main/assets/tech-mini.png';
  const MAX_FIGHTS        = 20000;          // hard cap on stored fight records
  const MAX_BACKFILL_PAGES = 5;             // each page = up to 100 attacks
  const ATTACK_ENERGY_COST = 25;            // standard attack energy cost
  const POLL_OPTIONS_SEC  = [30, 60, 120, 300];
  const API_TIMEOUT_MS    = 15000;
  const HOTKEY            = { alt: true, key: 'i' };  // Alt+I to toggle panel

  // Outcome catalogue. Keys are MY-perspective outcomes derived from the
  // raw Torn API result string + whether I was attacker or defender.
  const OUTCOMES = {
    win:         { label: 'Win',          color: '#34d399', glyph: '✓', win: true,  loss: false },
    hosp_them:   { label: 'Hosped them',  color: '#22c55e', glyph: '✚', win: true,  loss: false },
    mugged_them: { label: 'Mugged them',  color: '#fbbf24', glyph: '$', win: true,  loss: false },
    looted_them: { label: 'Looted them',  color: '#fde047', glyph: '⛁', win: true,  loss: false },
    special_win: { label: 'Special win',  color: '#a78bfa', glyph: '★', win: true,  loss: false },
    loss:        { label: 'Loss',         color: '#f87171', glyph: '✗', win: false, loss: true  },
    hosp_me:     { label: 'Got hosped',   color: '#ef4444', glyph: '☠', win: false, loss: true  },
    mugged_me:   { label: 'Got mugged',   color: '#f59e0b', glyph: '↓', win: false, loss: true  },
    looted_me:   { label: 'Got looted',   color: '#fbbf24', glyph: '⛁', win: false, loss: true  },
    stalemate:   { label: 'Stalemate',    color: '#94a3b8', glyph: '=', win: false, loss: false },
    escape_them: { label: 'They escaped', color: '#94a3b8', glyph: '→', win: false, loss: false },
    escape_me:   { label: 'I escaped',    color: '#94a3b8', glyph: '←', win: false, loss: false },
    timeout:     { label: 'Timeout',      color: '#94a3b8', glyph: '⏱', win: false, loss: false },
    assist:      { label: 'Assist',       color: '#60a5fa', glyph: '◑', win: false, loss: false },
    other:       { label: 'Other',        color: '#64748b', glyph: '·', win: false, loss: false },
  };

  // v0.6.33 — WAR window. Filters every view (Dashboard cards, Fights tab,
  // Difficulty Roadmap, Leveling Trap) to fights flagged ranked_war=true,
  // ignoring the time cutoff so the whole war's history is visible at once.
  // `rawFilter` runs against the stored shape before deriveFightView so we
  // skip work on non-matching fights. Other entries leave it undefined.
  const WINDOWS = [
    { key: '24h', label: '24H',  ms:  24 * 3600e3 },
    { key: '7d',  label: '7D',   ms:   7 * 86400e3 },
    { key: '30d', label: '30D',  ms:  30 * 86400e3 },
    { key: 'all', label: 'All',  ms: Infinity },
    // v0.6.72 — narrow WAR to fights from the CURRENT war's time range when
    // we've detected one (meta.activeWarTarget.warStart, populated by the
    // v0.6.70 /faction/?selections=basic poll). Without this floor, ranked-
    // war fights from prior wars sit in the same WAR bucket and skew every
    // war-scoped stat — most visibly the elapsed-time clock on the War
    // Scorecard, which used to read days when the current war was hours old.
    { key: 'war', label: 'WAR',  ms: Infinity,
      rawFilter: r => {
        if (!r.ranked_war) return false;
        // v0.6.77 — prefer activeWarTarget, fall back to lastWarTarget so
        // the post-war WAR pill keeps showing the just-ended war's stats
        // (not the union of every ranked-war fight in storage).
        const war = meta.activeWarTarget || meta.lastWarTarget;
        if (!war || !war.warStart) return true;
        const ts = r.timestamp_ended || 0;
        if (ts < war.warStart) return false;
        // Ceiling only applies to ended wars — active wars set warEnd = 0.
        if (war.warEnd && ts > war.warEnd) return false;
        return true;
      } },
  ];

  // Build archetypes for the Build Coherence Checker (feature #3 v0.1).
  // targetShares are desired fractions of total battle stats. tolerances:
  //   alignedMaxL1 — max sum-of-|actual − target| to be ALIGNED
  //   driftMaxL1   — max sum-of-|actual − target| to be DRIFTING; above = OFF
  // rules: array of hard floor/ceiling checks; any violation downgrades by one.
  // Heuristics are starting points (calibrate from community data later).
  const BUILD_GOALS = {
    glass_cannon: {
      label: 'Glass Cannon',
      blurb: 'Maximum offensive output. Speed to land hits, Strength to hurt. Accepts squishiness.',
      targetShares: { strength: 0.40, speed: 0.25, dexterity: 0.20, defense: 0.15 },
      alignedMaxL1: 0.20, driftMaxL1: 0.40,
      rules: [
        { msg: 'Defense should stay ≤25% of total', check: s => s.defense / s.total <= 0.25 },
        { msg: 'Strength + Speed should be ≥60% of total', check: s => (s.strength + s.speed) / s.total >= 0.60 },
      ],
    },
    tank: {
      label: 'Tank',
      blurb: 'Soak hits, outlast. Defense first, but enough Speed to still land your own attacks.',
      targetShares: { defense: 0.40, speed: 0.25, strength: 0.20, dexterity: 0.15 },
      alignedMaxL1: 0.20, driftMaxL1: 0.40,
      rules: [
        { msg: 'Defense + Speed should be ≥52% of total', check: s => (s.defense + s.speed) / s.total >= 0.52 },
        { msg: 'Speed should stay ≥20% (still need to land hits)', check: s => s.speed / s.total >= 0.20 },
      ],
    },
    heavy_brawler: {
      label: 'Heavy Brawler',
      blurb: 'Hit hard, soak hits, accept neglected Dex from heavy-armor weight. Shotgun/melee bruiser playstyle.',
      targetShares: { strength: 0.45, defense: 0.30, speed: 0.20, dexterity: 0.05 },
      alignedMaxL1: 0.25, driftMaxL1: 0.50,
      rules: [
        { msg: 'Strength should be ≥40% of total', check: s => s.strength / s.total >= 0.40 },
        { msg: 'Defense should be ≥25% of total', check: s => s.defense / s.total >= 0.25 },
        { msg: 'Strength + Defense should be ≥65% of total', check: s => (s.strength + s.defense) / s.total >= 0.65 },
        { msg: 'Dexterity should stay ≤10% (heavy-armor weight penalty is accepted)', check: s => s.dexterity / s.total <= 0.10 },
      ],
    },
    smasher: {
      label: 'Smasher',
      blurb: 'All-offense bruiser. Maximum Strength damage with mid Speed + Defense to stay in the fight. Low Dex is by design — dump dodge, over-train the punch.',
      targetShares: { strength: 0.50, speed: 0.22, defense: 0.22, dexterity: 0.06 },
      alignedMaxL1: 0.22, driftMaxL1: 0.44,
      rules: [
        { msg: 'Strength should be ≥45% of total', check: s => s.strength / s.total >= 0.45 },
        { msg: 'Dexterity should stay ≤10% of total', check: s => s.dexterity / s.total <= 0.10 },
        { msg: 'Speed and Defense should stay within ~10% spread of each other',
          check: s => Math.abs(s.speed/s.total - s.defense/s.total) <= 0.10 },
      ],
    },
    chain: {
      label: 'Chain Fighter',
      blurb: 'Balanced spread, slight Speed lean. Fast wins, energy-efficient, predictable.',
      targetShares: { speed: 0.28, strength: 0.26, defense: 0.23, dexterity: 0.23 },
      alignedMaxL1: 0.16, driftMaxL1: 0.32,
      rules: [
        { msg: 'Max-min stat spread should stay ≤15% (balance the build)',
          check: s => {
            const shares = ['strength','defense','speed','dexterity'].map(k => s[k] / s.total);
            return (Math.max(...shares) - Math.min(...shares)) <= 0.15;
          } },
      ],
    },
    dodge: {
      label: 'Dodge / Evader',
      blurb: 'Untouchable. Pure-Dex evasion build with enough Speed to land hits. Take little, give consistent.',
      targetShares: { dexterity: 0.45, speed: 0.25, defense: 0.20, strength: 0.10 },
      alignedMaxL1: 0.22, driftMaxL1: 0.44,
      rules: [
        { msg: 'Dexterity should be ≥35% of total', check: s => s.dexterity / s.total >= 0.35 },
        { msg: 'Speed should stay ≥20% (still need to land hits)', check: s => s.speed / s.total >= 0.20 },
      ],
    },
    grinder: {
      label: 'Stat Grinder',
      blurb: 'Any distribution works — the goal is total growth via safe high-respect targets. Audit is informational only.',
      targetShares: null,                // grinders don't have a shape requirement
      alignedMaxL1: Infinity, driftMaxL1: Infinity,
      rules: [],
    },
  };

  // ─── WEAPON-BONUS FAMILIES (v0.7 Phase 2) ──────────────────────────────
  // Maps each Torn weapon-bonus name to one of six effect families. The
  // loadout-archetype detector tallies bonus values per family across
  // every equipped weapon and picks the dominant family. Source data: the
  // full Torn wiki bonus catalogue, saved in
  // memory/reference_torn_weapon_bonuses.md (53 entries; rarity tiers do
  // not change the family classification).
  //
  // Six families, deliberately collapsed from the wiki's nine raw clusters
  // per user-validated 2026-05-29 design:
  //   - dot          → ticking damage over time (Bleed, Poisoned, …)
  //   - crit_burst   → burst / multi-hit / crit (Deadeye, Execute, Fury, …)
  //   - debuff       → strip opponent stats + lockdown (Wither, Stun, …)
  //   - reward_ko    → maximize per-KO payoff (Plunder, Warlord, …)
  //   - self_buff    → snowball / sustain (Bloodlust, Motivation, …)
  //   - pure_dmg     → reliable hit-for-hit damage with no DoT/crit gimmick
  //                    (Powerful, Specialist, Assassinate, plus body-part
  //                    hunters and armor-bypass folded in)
  //
  // Bonuses not present in this table (Storage, Parry, Hazardous, Sleep,
  // Spray, Smash, Blindfire, etc.) are intentionally unclassified — they
  // are weapon-specific quirks or pure utility, not loadout themes.
  const WEAPON_BONUS_FAMILIES = {
    // DoT family
    'Bleed':          'dot',
    'Poisoned':       'dot',
    'Laceration':     'dot',
    'Burn':           'dot',
    'Severe Burning': 'dot',
    // Crit / burst family
    'Deadeye':    'crit_burst',
    'Expose':     'crit_burst',
    'Deadly':     'crit_burst',
    'Execute':    'crit_burst',
    'Double Tap': 'crit_burst',
    'Fury':       'crit_burst',
    'Rage':       'crit_burst',
    // Debuff + CC family
    'Wither':      'debuff',
    'Weaken':      'debuff',
    'Slow':        'debuff',
    'Cripple':     'debuff',
    'Demoralized': 'debuff',
    'Toxin':       'debuff',
    'Freeze':      'debuff',
    'Stun':        'debuff',
    'Shock':       'debuff',
    'Suppress':    'debuff',
    'Paralyze':    'debuff',
    'Disarm':      'debuff',
    'Eviscerate':  'debuff',
    // Reward-on-KO family
    'Plunder':     'reward_ko',
    'Proficience': 'reward_ko',
    'Revitalize':  'reward_ko',
    'Warlord':     'reward_ko',
    'Stricken':    'reward_ko',
    'Irradiate':   'reward_ko',
    'Emasculate':  'reward_ko',
    // Self-buff family
    'Empower':    'self_buff',
    'Quicken':    'self_buff',
    'Motivation': 'self_buff',
    'Bloodlust':  'self_buff',
    'Grace':      'self_buff',
    'Focus':      'self_buff',
    'Comeback':   'self_buff',
    'Sure Shot':  'self_buff',
    'Conserve':   'self_buff',
    // Pure-damage family (body-part hunters + armor-bypass folded in)
    'Powerful':     'pure_dmg',
    'Specialist':   'pure_dmg',
    'Assassinate':  'pure_dmg',
    'Wind-up':      'pure_dmg',
    'Blindside':    'pure_dmg',
    'Frenzy':       'pure_dmg',
    'Berserk':      'pure_dmg',
    'Smurf':        'pure_dmg',
    'Finale':       'pure_dmg',
    'Achilles':     'pure_dmg',
    'Crusher':      'pure_dmg',
    'Cupid':        'pure_dmg',
    'Roshambo':     'pure_dmg',
    'Throttle':     'pure_dmg',
    'Backstab':     'pure_dmg',
    'Penetrate':    'pure_dmg',
    'Puncture':     'pure_dmg',
    'Double-edged': 'pure_dmg',
    // Weapon-specific damage bonuses — tied to single weapons but read as
    // pure_dmg because each is a predictable damage multiplier, not a
    // crit/random gimmick. A Sledgehammer-only user runs primarily on
    // Smash, so we need to classify it or their loadout reads vanilla.
    'Smash':        'pure_dmg',   // Sledgehammer: 2x on cooldown
    'Spray':        'pure_dmg',   // Dual SMGs: 2x dump on full clip
    'Blindfire':    'pure_dmg',   // MG3: dump remaining clip
  };

  const LOADOUT_FAMILY_LABELS = {
    dot:        'DoT',
    crit_burst: 'Crit / Burst',
    debuff:     'Debuff',
    reward_ko:  'Reward-on-KO',
    self_buff:  'Self-buff',
    pure_dmg:   'Pure damage',
  };

  // ─── ARCHETYPE LOOKUP (v0.7 Phase 2) ────────────────────────────────────
  // 2-axis combination of stat-shape (BUILD_GOALS key) and dominant loadout
  // family. Snowballer uses the '*' wildcard for stat-shape because
  // self-buff loadouts identify a player regardless of how they trained
  // their stats.
  //
  // v0.6.80 — full flavor renaming with male/female variants per the user's
  // alliterative naming scheme. Names are picked by meta.gender (captured
  // from Torn's basic API on identifySelf); unknown/Enby falls back to the
  // male form. Mechanical descriptors live in the blurb so the name can be
  // pure flavor. GENERAL_ARCHETYPE is the fallback when no specific combo
  // matches — every loadout-with-bonuses gets a name now, no more mismatch
  // dead ends.
  const ARCHETYPES = {
    'tank:dot': {
      male: 'DoT Dan', female: 'DoT Diana',
      blurb: 'Tank stat-shape + DoT weapons. Survive the fight while bleeding / poisoning them down.',
    },
    'glass_cannon:crit_burst': {
      male: 'Critical Cody', female: 'Critical Candy',
      blurb: 'Glass Cannon + crit / burst weapons. Kill before they get a turn.',
    },
    'heavy_brawler:debuff': {
      male: 'Crippler Chris', female: 'Crippler Christine',
      blurb: 'Heavy Brawler + debuff weapons. Soak hits while stripping their stats — the longer the fight, the worse it gets for them.',
    },
    'chain:reward_ko': {
      male: 'Tricky Tony', female: 'Tricky Tammy',
      blurb: 'Chain Fighter + finishing-hit tricks (Plunder, Warlord, Revitalize, Proficience). Maximize the per-KO payoff during chain runs.',
    },
    'dodge:pure_dmg': {
      male: 'Dancer Donald', female: 'Dancer Donna',
      blurb: 'Dodge stat-shape + reliable damage. Untouchable, just keeps hitting.',
    },
    'smasher:pure_dmg': {
      male: 'Powerhouse Paul', female: 'Powerhouse Paula',
      blurb: 'Smasher stat-shape + Powerful / Specialist loadout. No tricks, no DoT — just hits like a truck, over and over.',
    },
    // v0.6.82 — Pure damage column completion. Powerful + Specialist are
    // the most universal bonuses (drop on every weapon category), so the
    // Pure damage family is the most common loadout family. Filling the
    // remaining four stat-shape combos lets non-Smasher / non-Dodge Pure
    // damage users land on a named archetype instead of General George.
    'heavy_brawler:pure_dmg': {
      male: 'Walloper Walt', female: 'Walloper Wendy',
      blurb: 'Heavy Brawler stat-shape + reliable per-hit damage. Bashes through, hit after hit — close-range with weight behind every swing.',
    },
    'glass_cannon:pure_dmg': {
      male: 'Hitman Henry', female: 'Hitman Helena',
      blurb: 'Glass Cannon stat-shape + clean damage weapons. Deletes targets before they react. Fragile, but they\'re usually down first.',
    },
    'tank:pure_dmg': {
      male: 'Bulwark Brent', female: 'Bulwark Brenda',
      blurb: 'Tank stat-shape + steady damage output. Immovable; soaks hits while applying consistent pressure. The attrition fighter.',
    },
    'chain:pure_dmg': {
      male: 'Workhorse Wally', female: 'Workhorse Wanda',
      blurb: 'Chain Fighter stat-shape + reliable per-hit output. No-frills chain grinder. Predictable, efficient, gets the job done.',
    },
    '*:self_buff': {
      male: 'Snowball Samuel', female: 'Snowball Samantha',
      blurb: 'Self-buff loadout. Gets stronger as the fight goes on — Empower, Quicken, Bloodlust, Motivation stacks.',
    },
  };

  // Fallback when stat-shape × loadout-family doesn't map to a recognized
  // combo. Surfaces instead of a "no archetype match" note so every
  // loadout-with-bonuses gets a label.
  const GENERAL_ARCHETYPE = {
    male: 'General George', female: 'General Georgia',
    blurb: 'Custom hybrid — your stat-shape and loadout don\'t lock into a recognized archetype combo. Both axes are shown above as separate signals; read your build from the pair.',
  };

  // Pick the gender-appropriate name; default to male for unknown / Enby
  // since the Torn community is heavily male-coded and the fallback should
  // be the most-common form rather than null/empty.
  function pickArchetypeName(entry) {
    if (!entry) return null;
    const g = String(meta.gender || '').toLowerCase();
    if (g === 'female' && entry.female) return entry.female;
    return entry.male || entry.female || null;
  }

  function detectArchetype(goalKey, familyKey) {
    if (!familyKey) return null;
    let entry = null;
    if (familyKey === 'self_buff') {
      entry = ARCHETYPES['*:self_buff'];
    } else if (goalKey) {
      entry = ARCHETYPES[goalKey + ':' + familyKey] || GENERAL_ARCHETYPE;
    } else {
      entry = GENERAL_ARCHETYPE;
    }
    if (!entry) return null;
    return { name: pickArchetypeName(entry), blurb: entry.blurb };
  }

  // ─── EXPECTED LOADOUT FAMILIES PER STAT-SHAPE (v0.7 Phase 3) ───────────
  // Inverse of ARCHETYPES: for each stat-shape, what's the loadout family
  // the user "should" be running for the canonical archetype? Used by the
  // 2-axis Build Coherence verdict to detect mismatches ("you trained
  // Smasher but your weapons say Tank — pick a side").
  //
  // Derived manually rather than scanning ARCHETYPES at runtime so the
  // mapping stays explicit. Grinder excluded — Stat Grinder is the "any
  // loadout works" goal, so any family is acceptable.
  const STAT_TO_EXPECTED_FAMILY = {
    tank:          'dot',
    glass_cannon:  'crit_burst',
    heavy_brawler: 'debuff',
    chain:         'reward_ko',
    dodge:         'pure_dmg',
    smasher:       'pure_dmg',
  };

  // Soft scoring helpers (v0.7 Phase 3). 0-100 score → 1-5 confidence
  // dots. 5 dots = locked in, 1 dot = nowhere near. The dots are pure
  // glyph rendering — ⬤ filled + ◯ empty Unicode — no CSS needed for the
  // dots themselves, just inherit text colour.
  function scoreToDots(score) {
    if (score == null) return 0;
    if (score >= 80) return 5;
    if (score >= 60) return 4;
    if (score >= 40) return 3;
    if (score >= 20) return 2;
    return 1;
  }
  function dotsString(dots) {
    const filled = Math.max(0, Math.min(5, dots));
    return '⬤'.repeat(filled) + '◯'.repeat(5 - filled);
  }

  // ─── STORAGE ────────────────────────────────────────────────────────────
  // v0.6.59 — module-level error surface. `store()` and `load()` used to
  // swallow GM storage errors entirely; now both `console.warn` loudly and
  // record the last failure here so a future Settings-tab line item can
  // surface "Storage error: …" without us having to re-trace why fight
  // ingest mysteriously stopped persisting. Most relevant when the
  // `fights` blob approaches Tampermonkey's storage quota — that's where
  // a silent failure would hurt most.
  let lastStoreError = null;
  function store(key, val) {
    try {
      GM_setValue(SCRIPT_KEY + key, JSON.stringify(val));
    } catch (e) {
      lastStoreError = { key, at: Date.now(), msg: String(e && e.message ? e.message : e) };
      try { console.warn('[TECH] Storage write failed for ' + SCRIPT_KEY + key + ':', e); } catch (e2) {}
    }
  }
  function load(key, def) {
    try {
      const v = GM_getValue(SCRIPT_KEY + key);
      if (v === undefined || v === null || v === '') return def;
      const parsed = JSON.parse(v);
      if (Array.isArray(def) && !Array.isArray(parsed)) return def;
      if (def !== null && typeof def === 'object' && !Array.isArray(def) && typeof parsed !== 'object') return def;
      return parsed;
    } catch (e) {
      lastStoreError = { key, at: Date.now(), msg: 'load: ' + String(e && e.message ? e.message : e) };
      try {
        console.warn('[TECH] Storage parse failed for ' + SCRIPT_KEY + key + ', resetting to default:', e);
      } catch (e2) {}
      try { GM_setValue(SCRIPT_KEY + key, JSON.stringify(def)); } catch (e3) {}
      return def;
    }
  }

  // ─── LEGACY STORAGE MIGRATION ───────────────────────────────────────────
  // One-shot rename of tiqc_* (TornIQ era) keys to tech_* in-place. The
  // sentinel is set unconditionally so this never runs twice, even if the
  // legacy keys aren't present (fresh installs just flip the sentinel and
  // move on). We never overwrite an existing tech_* key — fresh data wins.
  (function migrateLegacyStorage() {
    const SENTINEL = SCRIPT_KEY + 'migrated_from_tiqc';
    try {
      if (GM_getValue(SENTINEL)) return;
      const LEGACY_KEYS = ['settings', 'fights', 'meta'];
      let moved = 0;
      for (const k of LEGACY_KEYS) {
        const legacy = GM_getValue('tiqc_' + k);
        if (legacy === undefined || legacy === null || legacy === '') continue;
        const current = GM_getValue(SCRIPT_KEY + k);
        if (current === undefined || current === null || current === '') {
          GM_setValue(SCRIPT_KEY + k, legacy);
          moved++;
        }
      }
      GM_setValue(SENTINEL, { ts: Date.now(), moved });
      if (moved > 0) console.log(`[TECH] Migrated ${moved} key(s) from the TornIQ era (tiqc_* → tech_*).`);
    } catch (e) {
      console.warn('[TECH] Legacy storage migration skipped:', e);
    }
  })();

  // ─── STATE ──────────────────────────────────────────────────────────────
  let settings = load('settings', {
    apiKey: '',
    pollIntervalSec: 60,
    activeTab: 'dashboard',
    windowKey: '7d',
    panelPos: { right: 20, bottom: 80 },
    panelOpen: false,
    buildGoal: null,                       // null | 'glass_cannon' | 'tank' | 'heavy_brawler' | 'chain' | 'grinder'
    scoutFactionId: '',                    // v0.6.34 — last-typed faction ID for the Scout tab
    scoutSort: 'verdict',                  // v0.6.35 — verdict | levelDesc | levelAsc | recent | oldest | name
    scoutHideLocked: false,                // v0.6.35 — hide Hospital / Jail / Federal members
    scoutHideTraveling: false,             // v0.6.35 — hide Traveling / Abroad members
    targetIds: [],                         // v0.6.39 — pinned opponent IDs for the Dashboard target queue
    notifyTargetReady: false,              // v0.6.43 — fire browser notification when a pinned target becomes hittable
    notifyChainBreak: false,               // v0.6.61 — fire browser notification when chain timer drops under 60s
  });

  // v0.6.34 — Scout cache. Last roster fetch per faction ID. We keep
  // these persisted so reopening the panel after a fresh-tab close
  // doesn't re-hit the API for the same enemy faction. Shape:
  //   { [factionId]: { factionName, factionTag, fetchedAt,
  //                    members: [{ id, name, level, position,
  //                                lastActionTs, statusState }] } }
  let scoutData = load('scoutData', {});

  // v0.6.50 — Enemy-faction chain cache. Last fetched chain state per
  // faction ID. Throttled by FACTION_CHAIN_REFRESH_SEC so reopening the
  // Faction Intel drill within 30s reuses the cached snapshot instead of
  // re-hitting the API. Shape per entry:
  //   { current, max, timeoutAt, modifier, cooldownAt, fetchedAt, error? }
  let factionChainCache = load('factionChainCache', {});

  // v0.6.52 — TornStats spy cache. Per-id snapshot of the latest spy
  // report fetched from tornstats.com. Shape per entry:
  //   { total, strength, defense, speed, dexterity, level,
  //     totalTs, strengthTs, defenseTs, speedTs, dexterityTs,
  //     fetchedAt, error? }
  // The *Ts fields are timestamps of when each stat was last spied
  // (TornStats stitches together datapoints from many spy reports).
  let spyCache = load('spyCache', {});

  // v0.6.39 — Target queue. Per-id status snapshot from /user/{id}?selections=profile
  // so the Dashboard Targets panel can render online/offline + last-action without
  // re-hitting the API on every panel open. Shape:
  //   { [id]: { name, level, statusState, statusDescription,
  //             lastActionStatus, lastActionTs, fetchedAt, error } }
  let targetStatus = load('targetStatus', {});
  let targetsRefreshing = false;

  // v0.6.54 — Scout bulk-spy progress. While truthy, the "Pull spies"
  // button is disabled and renders live progress text. Shape:
  //   null | { factionId, current, total }
  let scoutSpyPulling = null;

  // v0.6.45 — Chain timer ticker. The chain pill on the Dashboard updates
  // its countdown text every second when active; this handle is the
  // setInterval ref so we can clear it before re-rendering (avoid
  // duplicate tickers) and on a panel close. The interval's callback
  // self-cancels when the timer node is no longer in the DOM, which
  // covers tab switches and drill opens without an explicit clear.
  let chainTickerInterval = null;
  // v0.6.50 — Separate handle for the enemy faction chain pill on the
  // Faction Intel drill. Same self-cancel-on-disconnect pattern as
  // chainTickerInterval, distinct ref so the two pills can coexist if
  // the drill is opened while the user's own chain pill is ticking on
  // a separate render.
  let factionChainTickerInterval = null;
  // v0.6.69 — Scout tab hospital/jail countdown ticker. Re-ticks every
  // `.tech-scout-countdown` span in the rendered list each second so
  // release timings count down live during war prep. Same self-cancel-
  // on-disconnect pattern as the chain tickers.
  let scoutCountdownInterval = null;

  // fights: { [code]: rawFightObject } — raw shape preserved so we can recompute
  // derived fields if our normalisation logic changes later.
  let fights = load('fights', {});

  // ─── DEDUP MIGRATION: v1→v2 duplicate fights (v0.6.25) ──────────────────
  // When the poll migrated from Torn API v1 to v2 in v0.3.0, the new
  // endpoint apparently uses different attack `code` keys than v1 did.
  // The v2 poll then re-pulled recent history under the new codes,
  // creating duplicate records for every fight that crossed the boundary:
  // one v1-era entry (no attacker_level, no finishing_hit_effects) and
  // one v2-era entry (full enrichments). The fight tuple
  // (timestamp_started, timestamp_ended, attacker_id, defender_id)
  // uniquely identifies a physical fight regardless of which API version
  // returned it — same tuple => same fight. For each colliding pair we
  // keep the richer record (v2 marker is `attacker_level != null`) and
  // drop the v1 stub. One-shot via sentinel; clearing the sentinel forces
  // a re-run if a future regression makes us need it.
  (function migrateDedupV1V2Fights() {
    const SENTINEL = SCRIPT_KEY + 'dedup_v1v2_done';
    try {
      if (GM_getValue(SENTINEL)) return;
      const groups = {};
      for (const code in fights) {
        const f = fights[code];
        if (!f || !f.timestamp_ended || !f.attacker_id || !f.defender_id) continue;
        const key = (f.timestamp_started || 0) + '-' + f.timestamp_ended
                  + '-' + f.attacker_id + '-' + f.defender_id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(code);
      }
      function score(f) {
        return (f.attacker_level != null ? 4 : 0)
             + (f.defender_level != null ? 2 : 0)
             + (Array.isArray(f.finishing_hit_effects) && f.finishing_hit_effects.length ? 1 : 0);
      }
      let removed = 0;
      for (const key in groups) {
        const codes = groups[key];
        if (codes.length < 2) continue;
        codes.sort(function (a, b) { return score(fights[b]) - score(fights[a]); });
        for (let i = 1; i < codes.length; i++) {
          delete fights[codes[i]];
          removed++;
        }
      }
      if (removed > 0) {
        store('fights', fights);
        console.log('[TECH] Dedup migration removed ' + removed
                  + ' duplicate fight record(s) from the v1->v2 era.');
      }
      GM_setValue(SENTINEL, { ts: Date.now(), removed });
    } catch (e) {
      console.warn('[TECH] Dedup migration skipped:', e);
    }
  })();

  // v0.6.58 — TTL sweep for spyCache + scoutData. Both grow unbounded
  // without this: every Opponent Intel drill caches a spy fetch for 1h
  // refresh, and every Scout fetch persists a faction roster keyed by
  // factionId. Months of casual war prep would accumulate hundreds of
  // never-revisited entries. We drop anything older than 30 days on
  // load — long enough that no normal flow needs the data, short enough
  // that yearly play caps each cache at a sensible size. Inlined
  // timestamp math because nowSec() is a const arrow defined later in
  // the IIFE and isn't hoisted.
  const CACHE_TTL_SEC = 30 * 86400;
  (function sweepStaleCaches() {
    try {
      const cutoff = Math.floor(Date.now() / 1000) - CACHE_TTL_SEC;
      let spyDropped = 0;
      for (const id in spyCache) {
        const e = spyCache[id];
        if (e && e.fetchedAt && e.fetchedAt < cutoff) {
          delete spyCache[id];
          spyDropped++;
        }
      }
      if (spyDropped > 0) store('spyCache', spyCache);
      let scoutDropped = 0;
      for (const id in scoutData) {
        const r = scoutData[id];
        if (r && r.fetchedAt && r.fetchedAt < cutoff) {
          delete scoutData[id];
          scoutDropped++;
        }
      }
      if (scoutDropped > 0) store('scoutData', scoutData);
      // v0.6.59 — also sweep factionChainCache for symmetry with the other
      // keyed-by-id caches. Practical impact tiny (entries only land when
      // the user drills into a faction), but a long-tail of war-prep drills
      // would otherwise accumulate forever.
      let chainDropped = 0;
      for (const id in factionChainCache) {
        const c = factionChainCache[id];
        if (c && c.fetchedAt && c.fetchedAt < cutoff) {
          delete factionChainCache[id];
          chainDropped++;
        }
      }
      if (chainDropped > 0) store('factionChainCache', factionChainCache);
      if (spyDropped + scoutDropped + chainDropped > 0) {
        console.log('[TECH] Cache sweep dropped ' + spyDropped + ' spy + '
                  + scoutDropped + ' scout + ' + chainDropped
                  + ' faction-chain entries older than 30 days.');
      }
    } catch (e) {
      console.warn('[TECH] Cache sweep skipped:', e);
    }
  })();

  let meta = load('meta', {
    userId: null,
    userName: null,
    level: null,              // cached from identifySelf; powers TEST tab HP model
    firstPollTs: 0,           // when this install first started logging
    lastPollTs: 0,            // last time we tried to poll (success or fail)
    lastSuccessfulPollTs: 0,
    lastFightTs: 0,           // newest timestamp_ended we've seen
    lastError: null,
    totalPollCount: 0,
    totalIngestedCount: 0,    // running total of new fights ingested
    // Cached battle stats from /user/?selections=battlestats — refreshed on poll.
    // Shape: { strength, defense, speed, dexterity, total, ts } or null.
    battleStats: null,
  });

  let pollTimer    = null;
  let isPolling    = false;
  let panelEl      = null;
  let launcherEl   = null;  // <li> we inject into Torn's top-right toolbar
  let contentEl    = null;
  // When set, the panel content area renders an opponent intel drill instead
  // of the active tab. Cleared by the back button or any tab click.
  let currentDrill = null;  // null | { kind: 'opponent', id, name }

  // ─── UTIL ───────────────────────────────────────────────────────────────
  const nowSec = () => Math.floor(Date.now() / 1000);

  function fmtAgo(tsSec) {
    if (!tsSec) return 'never';
    const d = nowSec() - tsSec;
    if (d < 0)         return 'just now';
    if (d < 60)        return d + 's ago';
    if (d < 3600)      return Math.floor(d / 60) + 'm ago';
    if (d < 86400)     return Math.floor(d / 3600) + 'h ago';
    if (d < 30 * 86400) return Math.floor(d / 86400) + 'd ago';
    return new Date(tsSec * 1000).toLocaleDateString();
  }

  // v0.6.40 — Countdown to a Unix timestamp. Used for hospital / jail
  // "Hosp 14:23" reads on pinned targets. Returns null when the timestamp
  // has already passed (caller renders nothing).
  function fmtCountdown(untilTs) {
    if (!untilTs) return null;
    const sec = untilTs - nowSec();
    if (sec <= 0) return null;
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return h + 'h ' + m + 'm';
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function fmtNum(n, digits = 1) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(digits) + 'k';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(digits);
  }

  function fmtPct(n, digits = 1) {
    if (!isFinite(n)) return '—';
    return (n * 100).toFixed(digits) + '%';
  }

  function fmtRespect(n) {
    if (!isFinite(n)) return '—';
    const s = n >= 0 ? '+' : '−';
    return s + Math.abs(n).toFixed(2);
  }

  // v0.6.59 — escapeHtml() was removed. It was defined but never called.
  // All dynamic content in the script routes through the `el()` helper's
  // `.text` setter (= textContent), which is XSS-safe by construction.
  // Re-add only if we ever start setting `.html` from user-controlled
  // input — currently the single `html:` site (launcher mark SVG) is
  // script-controlled.

  // Tiny DOM helper. `attrs` accepts plain attrs plus `style`, `class`, `on:event`.
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class')      node.className = v;
        else if (k === 'style') Object.assign(node.style, v);
        else if (k === 'html')  node.innerHTML = v;
        else if (k === 'text')  node.textContent = v;
        else if (k.startsWith('on:')) node.addEventListener(k.slice(3), v);
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => x && node.appendChild(x));
      else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  }

  // ─── API CLIENT ─────────────────────────────────────────────────────────
  // v0.6.44 — Rate-limit cooldown. Torn allows 100 API calls/min PER KEY,
  // shared across every script using that key (TornTools, BSP, FF Scouter,
  // etc.). When TECH or another tool exhausts the quota the API returns
  // `{ error: { code: 5, error: "Too many requests" } }`. We catch that
  // here, set a 60s cooldown on `meta.rateLimitedUntil`, and every TECH
  // call site checks isRateLimited() before firing — so TECH stops adding
  // fuel to the fire while the user is throttled.
  const RATE_LIMIT_COOLDOWN_SEC = 60;
  function isRateLimited() {
    return !!(meta.rateLimitedUntil && nowSec() < meta.rateLimitedUntil);
  }
  function rateLimitRemainingSec() {
    if (!meta.rateLimitedUntil) return 0;
    return Math.max(0, meta.rateLimitedUntil - nowSec());
  }
  function markRateLimited(reason) {
    meta.rateLimitedUntil = nowSec() + RATE_LIMIT_COOLDOWN_SEC;
    meta.lastError = reason || 'Rate-limited by Torn (HTTP 5)';
    store('meta', meta);
  }

  function _gmFetch(url, headers) {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: headers || undefined,
          timeout: API_TIMEOUT_MS,
          onload: (r) => {
            try {
              const data = JSON.parse(r.responseText);
              if (data && data.error) {
                // Torn returns { error: { code, error } } on API errors.
                // Code 5 = rate limit; tag the error + set the cooldown so
                // every call site short-circuits until the quota refills.
                if (data.error.code === 5) {
                  markRateLimited('Rate-limited: ' + data.error.error);
                }
                const err = new Error(`Torn API ${data.error.code}: ${data.error.error}`);
                err.tornCode = data.error.code;
                reject(err);
              } else {
                resolve(data);
              }
            } catch (e) {
              reject(new Error('Bad JSON from API'));
            }
          },
          onerror:   () => reject(new Error('Network error')),
          ontimeout: () => reject(new Error('Request timed out')),
        });
      } catch (e) { reject(e); }
    });
  }

  function apiGet(url, headers) {
    return Promise.race([
      _gmFetch(url, headers),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Hard timeout')), API_TIMEOUT_MS + 1000)),
    ]);
  }

  // Legacy v1 URL (still used by identifySelf via /user/?selections=basic).
  // The attacks poll has moved to v2 (see v2Url + fetchAttacksPage).
  function tornUrl(selections, params = {}) {
    const qs = new URLSearchParams({
      selections,
      key: settings.apiKey,
      comment: 'TECH',
      ...params,
    });
    return `https://api.torn.com/user/?${qs.toString()}`;
  }

  // v2 URL builder. v0.6.5: reverted to query-string `?key=` auth (same
  // as v1 / the manual API call that confirmably returns fresh data). The
  // `Authorization: ApiKey` header path was returning stale results from
  // the script context for reasons we couldn't isolate (same key, same
  // endpoint, different response than a query-string call). Spec says
  // header is "preferred" but query-string still works on v2 and matches
  // what the script used in v0.2.x when the poll was reliable.
  //
  // v0.6.30: add a per-call cache-buster `_=Date.now()`. Without it,
  // identical poll URLs were being served stale by either the browser
  // HTTP cache or an extension service worker (TornTools etc.) — the
  // v2 attacks endpoint kept returning a 14h-old "newest" record even
  // though fresh data was available. Pairs with no-cache headers below.
  function v2Url(path, params = {}) {
    const qs = new URLSearchParams({
      key: settings.apiKey,
      comment: 'TECH',
      ...params,
      _: String(Date.now()),
    });
    const query = qs.toString();
    return `https://api.torn.com/v2${path}${query ? '?' + query : ''}`;
  }
  function v2AuthHeaders() {
    return {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
  }

  // ─── FIGHT NORMALISATION ────────────────────────────────────────────────
  // Translate a raw attack record + my user id into a MY-perspective outcome.
  // The Torn API reports `result` from the attacker's perspective.
  function classifyOutcome(raw, iAm) {
    const r = String(raw.result || '').toLowerCase();
    if (iAm === 'attacker') {
      if (r === 'attacked')      return 'win';
      if (r === 'hospitalized')  return 'hosp_them';
      if (r === 'mugged')        return 'mugged_them';
      if (r === 'looted')        return 'looted_them';
      if (r === 'special')       return 'special_win';
      if (r === 'lost')          return 'loss';
      if (r === 'stalemate')     return 'stalemate';
      if (r === 'escape')        return 'escape_them';
      if (r === 'timeout')       return 'timeout';
      if (r === 'assist')        return 'assist';
      return 'other';
    } else {
      // I was defender. Invert.
      if (r === 'attacked')      return 'loss';
      if (r === 'hospitalized')  return 'hosp_me';
      if (r === 'mugged')        return 'mugged_me';
      if (r === 'looted')        return 'looted_me';
      if (r === 'special')       return 'loss';
      if (r === 'lost')          return 'win';
      if (r === 'stalemate')     return 'stalemate';
      if (r === 'escape')        return 'escape_me';
      if (r === 'timeout')       return 'timeout';
      if (r === 'assist')        return 'assist';
      return 'other';
    }
  }

  function deriveFightView(raw, myId) {
    const iAm = (raw.attacker_id === myId) ? 'attacker'
              : (raw.defender_id === myId) ? 'defender'
              : null;
    const opponentId   = iAm === 'attacker' ? raw.defender_id   : raw.attacker_id;
    const opponentName = iAm === 'attacker' ? raw.defender_name : raw.attacker_name;
    const opponentFac  = iAm === 'attacker' ? raw.defender_faction : raw.attacker_faction;
    const opponentFacName = iAm === 'attacker' ? raw.defender_factionname : raw.attacker_factionname;
    const outcomeKey   = iAm ? classifyOutcome(raw, iAm) : 'other';
    const outcome      = OUTCOMES[outcomeKey] || OUTCOMES.other;
    const respectDelta = iAm === 'attacker' ? (raw.respect_gain || 0) : -(raw.respect_loss || 0);
    const duration     = (raw.timestamp_ended || 0) - (raw.timestamp_started || 0);
    return {
      raw,
      iAm,
      outcomeKey,
      outcome,
      opponentId,
      opponentName,
      opponentFaction:     opponentFac,
      opponentFactionName: opponentFacName,
      respectDelta,
      durationSec: Math.max(0, duration),
      tsEnded:   raw.timestamp_ended || 0,
      tsStarted: raw.timestamp_started || 0,
      stealthed: !!raw.stealthed,
      chain:     raw.chain || 0,
      isWar:     !!(raw.modifiers && (raw.modifiers.war > 1 || raw.modifiers.warlord > 1)),
      isRankedWar: !!raw.ranked_war,
      // v2 enrichments (null on records ingested before v0.3.0)
      attackerLevel:        raw.attacker_level ?? null,
      defenderLevel:        raw.defender_level ?? null,
      opponentLevel:        iAm === 'attacker' ? (raw.defender_level ?? null)
                          : iAm === 'defender' ? (raw.attacker_level ?? null)
                          : null,
      isInterrupted:        !!raw.is_interrupted,
      isRaid:               !!raw.is_raid,
      finishingHitEffects:  Array.isArray(raw.finishing_hit_effects) ? raw.finishing_hit_effects : [],
      // Torn's own difficulty multiplier, derived from the stat differential
      // (range 1.0–3.0, 1.0=opponent ≤25% your stats, 3.0=cap at ~even/stronger).
      // Stat-builder-safe: works the same regardless of level.
      fairFight:            (raw.modifiers && typeof raw.modifiers.fair_fight === 'number')
                              ? raw.modifiers.fair_fight : null,
      // v0.6.4 — DOM-captured per-hit log. null on records older than v0.6.4
      // and on fights where the user never visited the attack page (incoming
      // attacks, retroactive ingestion, etc.).
      dom:                  raw.dom || null,
    };
  }

  // v2 attacks endpoint returns nested objects with PascalCase result strings
  // and `started`/`ended` timestamps. Convert each entry to the v1-flat shape
  // that the rest of the code (storage, deriveFightView, classifyOutcome) was
  // built around, and enrich with the v2-only fields worth keeping:
  //   attacker_level, defender_level, is_interrupted, is_raid,
  //   finishing_hit_effects — array of { name, value } describing kill-hit
  //   advanced-weapon bonuses (name enum + percentage). Partial signal toward
  //   weapon attribution; the per-hit damage/weapon gap is still DOM-hook work.
  // classifyOutcome already lowercases `result`, so PascalCase passes through.
  function normalizeV2Attack(v2) {
    const att = v2.attacker || null;
    const def = v2.defender || {};
    return {
      attacker_id:           att ? att.id : null,
      attacker_name:         att ? att.name : null,
      attacker_faction:      (att && att.faction) ? att.faction.id : 0,
      attacker_factionname:  (att && att.faction) ? att.faction.name : '',
      defender_id:           def.id,
      defender_name:         def.name,
      defender_faction:      def.faction ? def.faction.id : 0,
      defender_factionname:  def.faction ? def.faction.name : '',
      result:                v2.result,
      respect_gain:          v2.respect_gain,
      respect_loss:          v2.respect_loss,
      timestamp_started:     v2.started,
      timestamp_ended:       v2.ended,
      chain:                 v2.chain,
      stealthed:             !!v2.is_stealthed,
      ranked_war:            !!v2.is_ranked_war,
      modifiers:             v2.modifiers || {},
      attacker_level:        att ? att.level : null,
      defender_level:        (def.level != null) ? def.level : null,
      is_interrupted:        !!v2.is_interrupted,
      is_raid:               !!v2.is_raid,
      finishing_hit_effects: Array.isArray(v2.finishing_hit_effects) ? v2.finishing_hit_effects : [],
    };
  }

  // ─── INGESTION ──────────────────────────────────────────────────────────
  function ingestAttacks(attacksObj) {
    if (!attacksObj || typeof attacksObj !== 'object') return 0;
    let newCount = 0;
    let maxTs = meta.lastFightTs || 0;
    let mergedAny = false;
    for (const code in attacksObj) {
      const isNew = !fights[code];
      if (isNew) newCount++;
      fights[code] = attacksObj[code];
      // v0.6.4 — merge any DOM-captured per-hit data buffered for this
      // opponent. Safe to call on existing records too: if the fight
      // already has `.dom`, the merge no-ops because the buffer entry
      // would have been deleted on the first merge.
      const beforeDom = fights[code].dom;
      mergeDomBufferIntoFight(fights[code]);
      if (fights[code].dom && fights[code].dom !== beforeDom) mergedAny = true;
      const ts = attacksObj[code].timestamp_ended || 0;
      if (ts > maxTs) maxTs = ts;
    }
    if (newCount > 0 || mergedAny) {
      enforceFightCap();
      store('fights', fights);
      if (newCount > 0) meta.totalIngestedCount += newCount;
    }
    meta.lastFightTs = maxTs;
    return newCount;
  }

  // Keep the most recent MAX_FIGHTS by timestamp_ended; drop the oldest.
  function enforceFightCap() {
    const codes = Object.keys(fights);
    if (codes.length <= MAX_FIGHTS) return;
    const sorted = codes.sort((a, b) =>
      (fights[a].timestamp_ended || 0) - (fights[b].timestamp_ended || 0));
    const toDrop = sorted.length - MAX_FIGHTS;
    for (let i = 0; i < toDrop; i++) delete fights[sorted[i]];
  }

  // ─── DOM HOOK: live-attack combat log capture (v0.6.4) ───────────────────
  // The v2 attacks API does NOT expose per-hit damage, weapon, body part, or
  // rounds fired — only the end-of-fight summary (outcome, respect, finishing
  // hit effects). The browser DOM during a fight is the ONLY place per-hit
  // data exists. We hook a MutationObserver on the combat log <ul>, parse
  // each new <li> into a structured event, buffer per-opponent in GM storage,
  // and merge the buffered events into the fight record when the next poll
  // picks up the matching attack from the API.
  //
  // Resilience: Torn uses CSS Modules (class names like `message___Ezhic`
  // carry a deploy-specific hash suffix). We anchor on the stable id
  // `#log-header`, the aria attr `[aria-describedby="log-header"]`, attribute
  // matchers `[class*="message___"]` / `[class*="col1___"]`, and unhashed
  // classes (`em.green` / `em.red`, `attacking-events-*` icon classes). The
  // parser is wrapped in try/catch so a Torn DOM shape change can't crash
  // TECH — at worst the badge stops appearing until the parser is updated.

  const DOM_LOG_SELECTOR     = 'ul[aria-describedby="log-header"]';
  const DOM_BUFFER_TTL_MS    = 30 * 60 * 1000;
  const DOM_MERGE_WINDOW_SEC = 600;     // fight start within ±10min of buffer
  const DOM_IDLE_COMPLETE_MS = 30 * 1000; // entry is "complete" after this idle

  // Verb patterns. The inner <span> text ends just before the damage <em>
  // (e.g. "...for ") so each pattern allows trailing whitespace.
  //
  // v0.6.49 — verb expansion. Pre-0.6.49 we only matched 5 verbs (fire / throw
  // / spray / init / leave) so melee + fist hits and every finisher except
  // "left on the street" landed in kind='unknown'. Now we add:
  //   - RE_MELEE / RE_FIST: damage events from melee weapons and bare-fist
  //     attacks (different shape — melee names a weapon, fist does not).
  //   - RE_HOSP / RE_COMA / RE_MUG / RE_STOLE: structured finisher captures
  //     with optional respect + cash-stolen amounts.
  //   - RE_STALE / RE_ESCAPE: keyword-fallback terminals (we keep these as
  //     `.test()` regexes since Torn's exact phrasing varies).
  // All new finisher kinds are added to DOM_TERMINAL_KINDS so the buffer
  // auto-completes the moment the finisher line lands, instead of waiting
  // out the 30s idle heuristic.
  const RE_FIRE  = /^(\S+) fired (\d+) rounds? of (?:his|her|their) (.+?) hitting (.+?) in the (.+?) for\s*$/i;
  const RE_THROW = /^(\S+) threw an? (.+?) at (.+?), it exploded for\s*$/i;
  const RE_SPRAY = /^(\S+) sprayed (.+?) in (.+?)'s face\s*$/i;
  const RE_INIT  = /^(\S+) initiated an attack against (.+?)\s*$/i;
  const RE_LEAVE = /^(\S+) left (.+?) on the street(?:\s*\(\+([\d.]+)\))?\s*$/i;

  // Melee + fist verb list. Torn uses different verbs per weapon class — blades
  // slash/stab, blunt hits/bashes/crushes, fists punch/kick/headbutt/knee. This
  // union covers the catalogue I'm confident about; unrecognised verbs will be
  // logged to console (see domSeenUnknown below) so we can add them next pass.
  const MELEE_VERBS = '(?:slashed|stabbed|hit|bashed|crushed|smashed|whipped|punched|kicked|headbutted|kneed|slapped|elbowed|tackled|chopped|impaled|cut|struck|jabbed|swung at)';
  // Has "with their X" mid-string → weapon-using melee strike.
  const RE_MELEE = new RegExp('^(\\S+) ' + MELEE_VERBS + ' (.+?) with (?:his|her|their) (.+?) in (?:the )?(.+?) for\\s*$', 'i');
  // No "with" → bare-fist / bodypart-only attack.
  const RE_FIST  = new RegExp('^(\\S+) ' + MELEE_VERBS + ' (.+?) in (?:the )?(.+?) for\\s*$', 'i');

  // Finishers — structured captures. Optional respect tail `(+N.NN)` and
  // optional "and stole $N" cash tail.
  const RE_HOSP  = /^(\S+) hospitalized (.+?)(?:\s*\(\+([\d.]+)\))?\s*$/i;
  const RE_COMA  = /^(\S+) left (.+?) in a coma(?:\s*\(\+([\d.]+)\))?\s*$/i;
  const RE_MUG   = /^(\S+) mugged (.+?)(?: and stole \$([\d,]+))?(?:\s*\(\+([\d.]+)\))?\s*$/i;
  const RE_STOLE = /^(\S+) stole \$([\d,]+) from (.+?)(?:\s*\(\+([\d.]+)\))?\s*$/i;

  // Keyword-fallback terminals (no rich captures — Torn's exact phrasing here
  // is uncertain so we just flag the line as terminal and let the user export
  // the raw text via the dom_buffer payload).
  const RE_STALE_KW  = /\bstalemate(?:d)?\b/i;
  const RE_ESCAPE_KW = /\b(?:escaped|fled the battle|ran away)\b/i;

  // Verb kinds that signal the fight is OVER from the DOM side. v0.6.49 expanded
  // from {leave} → {leave, coma, hospitalize, mug, loot, stalemate, escape}.
  const DOM_TERMINAL_KINDS = new Set([
    'leave', 'coma', 'hospitalize', 'mug', 'loot', 'stalemate', 'escape',
  ]);

  let domLogObserver = null;
  let domLogSeenNodes = new WeakSet();  // dedup by DOM-node identity (cheap, exact)
  // v0.6.49 — dedup console-log of unrecognised lines by raw text so DevTools
  // doesn't drown in repeated samples of the same line. Reset on page reload.
  // v0.6.59 — bounded at DOM_SEEN_UNKNOWN_MAX. Was unbounded; in practice the
  // Set fills slowly with unique unrecognised verb shapes, but a future Torn
  // log-line rewrite could explode it. Cap protects against the worst case.
  const DOM_SEEN_UNKNOWN_MAX = 200;
  let domSeenUnknown = new Set();

  function getOpponentIdFromUrl() {
    try {
      const qs = new URLSearchParams(location.search);
      const raw = qs.get('user2ID');
      const n = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    } catch (e) { return null; }
  }

  // Broader URL parser for the Active-Page Banner (v0.6.24). Detects when
  // the user is on a Torn surface that names a specific opponent — profile
  // page (/profiles.php?XID=) or attack page (/page.php?sid=attack&user2ID=,
  // or the legacy /loader.php?sid=attack&user2ID= retained for stale links).
  // Returns { id, source } where source labels which surface so the banner
  // can pick its wording ("Looking at" vs "Attacking").
  //
  // v0.6.26: bail when the URL points at the user's OWN profile. Self-view
  // would surface "139 fights · NO HISTORY" because the fight tally counts
  // every record where my ID appears (= all of them) but computeOpponentIntel
  // returns null since v.opponentId is never me. Cleaner UX = no banner at
  // all when you're looking at yourself.
  function getActiveOpponentFromUrl() {
    try {
      const qs = new URLSearchParams(location.search);
      const path = location.pathname || '';
      if (path.startsWith('/profiles.php')) {
        const xid = parseInt(qs.get('XID'), 10);
        if (Number.isFinite(xid)) {
          if (meta.userId && xid === meta.userId) return null;
          return { id: xid, source: 'profile' };
        }
      }
      // v0.6.63 — Torn migrated attack pages from /loader.php to /page.php.
      // Accept both so the active-page banner still fires on stale URLs
      // (e.g. someone clicks a year-old link); the dead /loader.php just
      // shows Torn's error page, but the banner reading was always
      // URL-based, not DOM-based, so the verdict still surfaces correctly.
      if ((path.startsWith('/page.php') || path.startsWith('/loader.php'))
          && qs.get('sid') === 'attack') {
        const u = parseInt(qs.get('user2ID'), 10);
        if (Number.isFinite(u)) {
          if (meta.userId && u === meta.userId) return null;
          return { id: u, source: 'attack' };
        }
      }
      return null;
    } catch (e) { return null; }
  }

  function isAttackPage() {
    // v0.6.63 — Same /page.php migration. Accept both paths so the DOM
    // hook attaches on the new URL going forward; the legacy /loader.php
    // path silently no-ops since Torn's error page has no combat log to
    // observe (parseLogRow returns null on missing selectors).
    const path = location.pathname || '';
    if (!path.startsWith('/page.php') && !path.startsWith('/loader.php')) return false;
    try {
      return new URLSearchParams(location.search).get('sid') === 'attack';
    } catch (e) { return false; }
  }

  function loadDomBuffer() { return load('dom_buffer', {}); }
  function saveDomBuffer(buf) { store('dom_buffer', buf); }

  function expireOldDomBuffer() {
    const buf = loadDomBuffer();
    const now = Date.now();
    let changed = false;
    for (const k in buf) {
      const entry = buf[k];
      if (!entry || !entry.startedAt || (now - entry.startedAt) > DOM_BUFFER_TTL_MS) {
        delete buf[k];
        changed = true;
      }
    }
    if (changed) saveDomBuffer(buf);
  }

  function parseLogRow(li) {
    const col1 = li.querySelector('[class*="col1___"]');
    const msg  = li.querySelector('[class*="message___"]');
    if (!col1 || !msg) return null;
    const inner = msg.querySelector('span');
    const text  = (inner ? inner.textContent : msg.textContent || '').trim();
    if (!text) return null;

    let direction = 'unknown';
    if (/\bcolor-1\b/.test(col1.className) || /\bcolor-1__/.test(col1.className))      direction = 'out';
    else if (/\bcolor-2\b/.test(col1.className) || /\bcolor-2__/.test(col1.className)) direction = 'in';

    const iconHolder = col1.querySelector('[class*="iconWrap___"] > *');
    let iconClass = '';
    if (iconHolder) {
      const m = (iconHolder.className || '').match(/attacking-events-\S+/);
      iconClass = m ? m[0] : '';
    }

    const dmgEm = msg.querySelector('em.green, em.red');
    const damage = dmgEm
      ? (parseInt(String(dmgEm.textContent).replace(/[^\d]/g, ''), 10) || null)
      : null;

    let kind = 'unknown', actor = null, target = null, weapon = null,
        rounds = null, bodyPart = null, respect = null, cashStolen = null;
    let m;
    // Order matters: RE_MELEE must precede RE_FIST (RE_FIST is a strict subset
    // shape — same verbs, no `with their X` clause) and structured finisher
    // regexes must precede the keyword fallbacks. RE_LEAVE / RE_COMA both
    // start with "X left Y …" so RE_LEAVE (more specific "on the street") is
    // checked first.
    if      ((m = RE_FIRE.exec(text)))  { kind = 'fire';  actor = m[1]; rounds = parseInt(m[2], 10); weapon = m[3]; target = m[4]; bodyPart = m[5]; }
    else if ((m = RE_THROW.exec(text))) { kind = 'throw'; actor = m[1]; weapon = m[2]; target = m[3]; }
    else if ((m = RE_SPRAY.exec(text))) { kind = 'spray'; actor = m[1]; weapon = m[2]; target = m[3]; }
    else if ((m = RE_INIT.exec(text)))  { kind = 'init';  actor = m[1]; target = m[2]; }
    else if ((m = RE_LEAVE.exec(text))) { kind = 'leave'; actor = m[1]; target = m[2]; if (m[3]) respect = parseFloat(m[3]); }
    else if ((m = RE_COMA.exec(text)))  { kind = 'coma';  actor = m[1]; target = m[2]; if (m[3]) respect = parseFloat(m[3]); }
    else if ((m = RE_HOSP.exec(text)))  { kind = 'hospitalize'; actor = m[1]; target = m[2]; if (m[3]) respect = parseFloat(m[3]); }
    else if ((m = RE_MUG.exec(text)))   { kind = 'mug';   actor = m[1]; target = m[2]; if (m[3]) cashStolen = parseInt(m[3].replace(/,/g, ''), 10); if (m[4]) respect = parseFloat(m[4]); }
    else if ((m = RE_STOLE.exec(text))) { kind = 'loot';  actor = m[1]; cashStolen = parseInt(m[2].replace(/,/g, ''), 10); target = m[3]; if (m[4]) respect = parseFloat(m[4]); }
    else if ((m = RE_MELEE.exec(text))) { kind = 'melee'; actor = m[1]; target = m[2]; weapon = m[3]; bodyPart = m[4]; }
    else if ((m = RE_FIST.exec(text)))  { kind = 'fist';  actor = m[1]; target = m[2]; bodyPart = m[3]; }
    else if (RE_STALE_KW.test(text))    { kind = 'stalemate'; }
    else if (RE_ESCAPE_KW.test(text))   { kind = 'escape'; }

    const raw = text + (dmgEm ? ' ' + (dmgEm.textContent || '') : '');

    // v0.6.49 — diagnostic: log unrecognised lines once each so the user can
    // share real samples for the next regex pass. Damage-bearing lines we
    // failed to parse are the MOST useful (unlisted verb, known shape), so
    // we log them too. DevTools console only — no UI noise.
    if (kind === 'unknown' && !domSeenUnknown.has(raw)
        && domSeenUnknown.size < DOM_SEEN_UNKNOWN_MAX) {
      domSeenUnknown.add(raw);
      try { console.log('[TECH-DOM] Unrecognised line:', raw); } catch (e) {}
    }

    return {
      ts: Date.now(),
      direction, iconClass, kind,
      actor, target, weapon, rounds, bodyPart,
      damage, respect, cashStolen,
      raw,
    };
  }

  function appendDomEvent(ev) {
    const opponentId = getOpponentIdFromUrl();
    if (!opponentId) return;
    const buf = loadDomBuffer();
    const key = String(opponentId);
    let entry = buf[key];
    // "init" line marks a fresh fight start — replace any stale entry for
    // the same opponent (e.g. a prior attack within the 30min TTL that
    // never merged).
    if (ev.kind === 'init' || !entry) {
      entry = { opponentId, startedAt: Date.now(), events: [] };
    }
    entry.events.push(ev);
    buf[key] = entry;
    saveDomBuffer(buf);
  }

  function attachLogObserver() {
    if (domLogObserver) return;
    const ul = document.querySelector(DOM_LOG_SELECTOR);
    if (!ul) {
      // Watch the body for the log <ul> to appear, then re-enter. v0.6.59 —
      // self-disconnect after 30s so a future Torn DOM change that retires
      // DOM_LOG_SELECTOR doesn't leave us with a permanent body-subtree
      // observer running on every attack page.
      const bodyObs = new MutationObserver(() => {
        if (document.querySelector(DOM_LOG_SELECTOR)) {
          bodyObs.disconnect();
          attachLogObserver();
        }
      });
      bodyObs.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { try { bodyObs.disconnect(); } catch (e) {} }, 30000);
      return;
    }

    // Retrofill any rows already present when we attach. Torn renders the
    // log newest-first, so reverse the DOM order to replay chronologically
    // — otherwise an `init` event near the bottom would wipe the buffer
    // entry we just rebuilt from later hits at the top.
    Array.from(ul.children).reverse().forEach(li => {
      if (domLogSeenNodes.has(li)) return;
      domLogSeenNodes.add(li);
      try { const ev = parseLogRow(li); if (ev) appendDomEvent(ev); }
      catch (e) { /* parser robustness */ }
    });

    domLogObserver = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        mut.addedNodes.forEach(node => {
          if (!(node instanceof Element) || node.tagName !== 'LI') return;
          if (domLogSeenNodes.has(node)) return;
          domLogSeenNodes.add(node);
          try { const ev = parseLogRow(node); if (ev) appendDomEvent(ev); }
          catch (e) { /* parser robustness */ }
        });
      }
    });
    domLogObserver.observe(ul, { childList: true });
  }

  function isCompleteEntry(entry) {
    if (!entry || !Array.isArray(entry.events) || !entry.events.length) return false;
    if (entry.events.some(e => DOM_TERMINAL_KINDS.has(e.kind))) return true;
    // Fall back to idle heuristic so unknown outcome shapes (hosp/mug/loot/
    // die — formats not yet sampled) still merge after the fight clearly
    // stopped emitting events.
    const last = entry.events[entry.events.length - 1];
    return last && (Date.now() - last.ts) > DOM_IDLE_COMPLETE_MS;
  }

  function mergeDomBufferIntoFight(rawFight) {
    if (!rawFight) return;
    const myId  = meta.userId || 0;
    const oppId = (myId && rawFight.attacker_id === myId)
                  ? rawFight.defender_id : rawFight.attacker_id;
    if (!oppId) return;
    const buf = loadDomBuffer();
    const entry = buf[String(oppId)];
    if (!isCompleteEntry(entry)) return;
    const startSec = rawFight.timestamp_started || 0;
    const entryStartSec = Math.floor(entry.startedAt / 1000);
    if (!startSec || Math.abs(startSec - entryStartSec) > DOM_MERGE_WINDOW_SEC) return;
    rawFight.dom = {
      capturedAt: entry.startedAt,
      events: entry.events.slice(),
    };
    delete buf[String(oppId)];
    saveDomBuffer(buf);
  }

  // ─── POLL CYCLE ─────────────────────────────────────────────────────────
  async function identifySelf() {
    // v0.6.80 — also require gender so v0.7 Phase 2 can pick the right
    // flavor-name variant (Tricky Tony vs Tricky Tammy, etc). Existing
    // installs without a cached gender will refetch on next poll.
    if (meta.userId && meta.level && meta.gender) return;
    const data = await apiGet(tornUrl('basic'));
    meta.userId   = data.player_id;
    meta.userName = data.name;
    if (typeof data.level === 'number') meta.level = data.level;
    if (typeof data.gender === 'string') meta.gender = data.gender;
    if (!meta.firstPollTs) meta.firstPollTs = nowSec();
    store('meta', meta);
  }

  // v0.6.34 — Faction roster fetch for the Scout tab. Hits the v1
  // `/faction/{id}?selections=basic` endpoint (v2 has /faction/members
  // but v1 basic is older + denser, and our cache-bust + no-cache
  // headers carry over). Returns a normalised roster row per member —
  // just the fields the Scout list needs, not the full API shape.
  async function fetchFactionRoster(factionId) {
    const fid = parseInt(factionId, 10);
    if (!Number.isFinite(fid) || fid <= 0) throw new Error('Invalid faction ID');
    // v0.6.44 — refuse to fetch while throttled so we don't deepen the
    // hole. Surface the cooldown to the SCOUT tab's error display.
    if (isRateLimited()) {
      throw new Error('Rate-limited · retry in ' + rateLimitRemainingSec() + 's');
    }
    const qs = new URLSearchParams({
      selections: 'basic',
      key: settings.apiKey,
      comment: 'TECH',
      _: String(Date.now()),
    });
    const url = `https://api.torn.com/faction/${fid}?${qs.toString()}`;
    const data = await apiGet(url, { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' });
    if (!data || !data.members || typeof data.members !== 'object') {
      throw new Error('Bad faction response (no members)');
    }
    const members = Object.entries(data.members).map(function (entry) {
      const id = parseInt(entry[0], 10);
      const m = entry[1] || {};
      const la = m.last_action || {};
      const st = m.status || {};
      return {
        id,
        name: m.name || ('Player ' + id),
        level: (typeof m.level === 'number') ? m.level : null,
        position: m.position || '',
        lastActionTs: (typeof la.timestamp === 'number') ? la.timestamp : 0,
        lastActionStatus: la.status || null,
        statusState: st.state || null,
        // v0.6.69 — capture hospital/jail release timestamp so Scout can
        // render a live "Hosp 14:23" countdown matching the Targets queue.
        statusUntil: (typeof st.until === 'number') ? st.until : 0,
      };
    });
    return {
      factionId: fid,
      factionName: data.name || ('Faction ' + fid),
      factionTag:  data.tag  || '',
      fetchedAt:   nowSec(),
      members,
    };
  }

  // ─── ENEMY FACTION CHAIN (v0.6.50) ─────────────────────────────────────
  // War-prep intel: target faction's current chain state. Hits the v1
  // `/faction/{id}?selections=chain` endpoint and caches the response so
  // re-opening the Faction Intel drill within FACTION_CHAIN_REFRESH_SEC
  // reuses the snapshot instead of burning an API call. Rate-limit gated
  // like every other fetcher in TECH.
  //
  // The response shape matches the user's own chain object from fetchSelfState
  // (current / max / timeout / modifier / cooldown), so we normalise to the
  // same { timeoutAt, cooldownAt } absolute-Unix-timestamp form for uniform
  // countdown rendering.
  const FACTION_CHAIN_REFRESH_SEC = 30;
  // v0.6.57 — short throttle for errored entries. Without this, drilling
  // repeatedly into a faction whose last fetch errored would spawn one
  // request per drill open (the freshness gate bypasses on `cached.error`).
  const FACTION_CHAIN_ERROR_RETRY_SEC = 60;

  async function fetchFactionChain(factionId) {
    const fid = parseInt(factionId, 10);
    if (!Number.isFinite(fid) || fid <= 0) throw new Error('Invalid faction ID');
    if (isRateLimited()) {
      throw new Error('Rate-limited · retry in ' + rateLimitRemainingSec() + 's');
    }
    const qs = new URLSearchParams({
      selections: 'chain',
      key: settings.apiKey,
      comment: 'TECH',
      _: String(Date.now()),
    });
    const url = `https://api.torn.com/faction/${fid}?${qs.toString()}`;
    const data = await apiGet(url, { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' });
    const chain = data && data.chain;
    if (!chain || typeof chain.current !== 'number') {
      throw new Error('Bad chain response');
    }
    const cd = typeof chain.cooldown === 'number' ? chain.cooldown : 0;
    return {
      current:    chain.current,
      max:        chain.max || 0,
      timeoutAt:  resolveChainTimeoutAt(chain.timeout),
      modifier:   typeof chain.modifier === 'number' ? chain.modifier : 1.0,
      cooldownAt: cd > 0 ? nowSec() + cd : 0,
      fetchedAt:  nowSec(),
    };
  }

  // v0.6.68 — chain.timeout format detector. The v0.6.45 comment in
  // fetchSelfState claimed timeout is an absolute Unix timestamp, but
  // Torn's /faction/{id}?selections=chain endpoint clearly returns it as
  // SECONDS REMAINING (matched the cooldown convention), which caused the
  // Faction Intel drill to show "No active chain" even when the target
  // faction was mid-chain. Symmetric with cooldown handling: small values
  // are relative seconds, anything over a day is already absolute.
  // Returns 0 when timeout is unset/zero (no chain).
  function resolveChainTimeoutAt(rawTimeout) {
    if (typeof rawTimeout !== 'number' || rawTimeout <= 0) return 0;
    return rawTimeout < 86400 ? nowSec() + rawTimeout : rawTimeout;
  }

  // Refresh-throttled wrapper. Fire-and-forget — the result lands in
  // factionChainCache and triggers a re-render of the drill if it's still
  // open on the same faction. Failures persist the error on the cache
  // entry so the drill can surface "couldn't fetch chain" without
  // disappearing the pill entirely.
  function maybeRefreshFactionChain(factionId, force) {
    const fid = parseInt(factionId, 10);
    if (!Number.isFinite(fid) || fid <= 0) return;
    if (!settings.apiKey) return;
    if (isRateLimited()) return;
    const cached = factionChainCache[fid];
    const now = nowSec();
    if (!force && cached && cached.fetchedAt) {
      const since = now - cached.fetchedAt;
      // v0.6.57 — short retry throttle on errored entries so repeated
      // drill opens don't hammer when the API is down or the key is bad.
      if (cached.error && since < FACTION_CHAIN_ERROR_RETRY_SEC) return;
      if (!cached.error && since < FACTION_CHAIN_REFRESH_SEC) return;
    }
    fetchFactionChain(fid).then(function (chain) {
      factionChainCache[fid] = chain;
      store('factionChainCache', factionChainCache);
      if (currentDrill && currentDrill.kind === 'faction' && currentDrill.id === fid
          && panelEl && contentEl) {
        renderActive();
      }
    }).catch(function (e) {
      factionChainCache[fid] = Object.assign(factionChainCache[fid] || {}, {
        error: String(e && e.message ? e.message : e),
        fetchedAt: now,
      });
      store('factionChainCache', factionChainCache);
      if (currentDrill && currentDrill.kind === 'faction' && currentDrill.id === fid
          && panelEl && contentEl) {
        renderActive();
      }
    });
  }

  // ─── ACTIVE RANKED WAR DETECTION (v0.6.70) ─────────────────────────────
  // Auto-detect whether the user's faction is currently in a ranked war,
  // and if so, which faction is the opponent. Powers the Dashboard's
  // dual chain pill — your chain alongside theirs.
  //
  // Hits `/faction/?selections=basic` with the user's key (no faction ID
  // → returns the user's own faction). Scans `ranked_wars` for an entry
  // whose `war.end === 0` (still active), picks the non-self faction as
  // the opponent. Throttled to 5 minutes since wars don't start often,
  // and once one is detected we just keep using it.
  //
  // Graceful no-ops when:
  //   - user isn't in a faction (faction API returns no ID)
  //   - faction has no active war
  //   - API errors out (separate shorter retry throttle)
  const ACTIVE_WAR_REFRESH_SEC = 300;
  const ACTIVE_WAR_ERROR_RETRY_SEC = 120;
  // v0.6.77 — when a war ends, keep the snapshot around for one week so the
  // WAR pill can render a final read-only scorecard. Long enough to brag
  // about it, short enough that the next war replaces the snapshot before
  // any "I forgot which war this was" confusion can set in.
  const LAST_WAR_TTL_SEC = 7 * 86400;

  // v0.6.77 — now returns { active, recentlyEnded } so the caller can also
  // populate meta.lastWarTarget on cold start (when we missed the active →
  // null transition because TECH wasn't running). The API's ranked_wars
  // object includes ended wars until Torn rotates them out, so this lets us
  // reconstruct lastWarTarget even after a fresh install during the post-
  // war window.
  async function fetchActiveRankedWar() {
    if (!settings.apiKey) return { active: null, recentlyEnded: null };
    if (isRateLimited()) {
      throw new Error('Rate-limited · retry in ' + rateLimitRemainingSec() + 's');
    }
    const qs = new URLSearchParams({
      selections: 'basic',
      key: settings.apiKey,
      comment: 'TECH',
      _: String(Date.now()),
    });
    const url = 'https://api.torn.com/faction/?' + qs.toString();
    const data = await apiGet(url, { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' });
    if (!data || typeof data !== 'object') return { active: null, recentlyEnded: null };
    const ourFactionId = data.ID;
    if (!ourFactionId) return { active: null, recentlyEnded: null };
    const wars = data.ranked_wars || {};
    let active = null;
    let recentlyEnded = null;
    const recentCutoff = nowSec() - LAST_WAR_TTL_SEC;
    for (const warIdStr in wars) {
      const w = wars[warIdStr];
      if (!w || !w.war) continue;
      const factions = w.factions || {};
      let enemyFid = null, enemyName = null;
      for (const fIdStr in factions) {
        const fid = parseInt(fIdStr, 10);
        if (!Number.isFinite(fid) || fid === ourFactionId) continue;
        enemyFid = fid;
        enemyName = (factions[fIdStr] && factions[fIdStr].name) || ('Faction ' + fid);
        break;
      }
      if (!enemyFid) continue;
      const warEnd = w.war.end || 0;
      const shape = {
        warId: parseInt(warIdStr, 10),
        ourFactionId,
        ourFactionName: data.name || '',
        factionId: enemyFid,
        factionName: enemyName,
        warStart: w.war.start || 0,
        warEnd: warEnd,
        refreshedAt: nowSec(),
      };
      if (warEnd === 0) {
        active = shape;
      } else if (warEnd >= recentCutoff) {
        if (!recentlyEnded || warEnd > recentlyEnded.warEnd) recentlyEnded = shape;
      }
    }
    return { active, recentlyEnded };
  }

  function maybeRefreshActiveWar(force) {
    if (!settings.apiKey) return;
    if (isRateLimited()) return;
    const now = nowSec();
    // v0.6.77 — purge stale lastWarTarget proactively so an ancient war
    // doesn't keep haunting the WAR pill past its TTL. Runs on every refresh
    // attempt, not just successful fetches, so the TTL holds even if the
    // API is unreachable.
    if (meta.lastWarTarget && meta.lastWarTarget.warEnd
        && (now - meta.lastWarTarget.warEnd) > LAST_WAR_TTL_SEC) {
      meta.lastWarTarget = null;
      store('meta', meta);
    }
    if (!force) {
      const cached = meta.activeWarTarget;
      if (cached && cached.refreshedAt
          && (now - cached.refreshedAt) < ACTIVE_WAR_REFRESH_SEC) {
        return;
      }
      if (meta.activeWarCheckedAt
          && (now - meta.activeWarCheckedAt) < ACTIVE_WAR_REFRESH_SEC) {
        return;
      }
      if (meta.activeWarError && meta.activeWarError.at
          && (now - meta.activeWarError.at) < ACTIVE_WAR_ERROR_RETRY_SEC) {
        return;
      }
    }
    fetchActiveRankedWar().then(function (result) {
      const newActive = result.active;
      const apiRecentEnded = result.recentlyEnded;
      const prevActive = meta.activeWarTarget;
      // v0.6.77 — manage meta.lastWarTarget in three cases:
      //   1. active → null transition: snapshot the war we just had,
      //      stamping warEnd = now() because we don't have the exact
      //      Torn-side end timestamp.
      //   2. cold start with no prior active: trust the API's recently-
      //      ended war (within TTL) if we don't already have a snapshot
      //      or if the API's is more recent.
      //   3. active → active (same war): no-op for lastWarTarget.
      if (prevActive && !newActive) {
        meta.lastWarTarget = Object.assign({}, prevActive, {
          warEnd: nowSec(),
          snapshotedFromActive: true,
        });
      } else if (!prevActive && apiRecentEnded) {
        if (!meta.lastWarTarget
            || apiRecentEnded.warEnd > (meta.lastWarTarget.warEnd || 0)) {
          meta.lastWarTarget = apiRecentEnded;
        }
      }
      meta.activeWarTarget = newActive;
      meta.activeWarCheckedAt = nowSec();
      meta.activeWarError = null;
      store('meta', meta);
      if (newActive) maybeRefreshFactionChain(newActive.factionId);
      if (panelEl && contentEl && settings.activeTab === 'dashboard' && !currentDrill) {
        renderActive();
      }
    }).catch(function (e) {
      meta.activeWarError = { at: nowSec(), msg: String(e && e.message ? e.message : e) };
      store('meta', meta);
    });
  }

  // ─── TORNSTATS SPY (v0.6.52) ────────────────────────────────────────────
  // Pulls the latest spy report for a target from TornStats. Uses the user's
  // Torn API key as the auth token (TornStats accepts it directly — no
  // separate API key needed). Per-target cache + throttled refresh so
  // opening the same Opponent Intel drill repeatedly doesn't burn calls.
  //
  // Endpoint: https://www.tornstats.com/api/v2/{key}/spy/user/{id}
  // Response shape (verified from TornStats public API docs):
  //   { status: true, spy: {
  //       status: true, type, user_id, name, level,
  //       strength, defense, speed, dexterity, total,
  //       strength_timestamp, defense_timestamp, speed_timestamp,
  //       dexterity_timestamp, total_timestamp, difference } }
  // status: false means we have no spy on that target (no error, just empty).
  //
  // Refresh throttle is generous because spy data inherently drifts slowly —
  // 1 hour cache hit serves the common case (opening + closing the drill a
  // few times during a chain). Manual ↻ button bypasses it.
  const SPY_REFRESH_SEC = 3600;
  // v0.6.57 — short throttle for errored entries. Without this, opening
  // an errored opponent drill repeatedly would spawn one TornStats request
  // per drill open (the 1-hour freshness gate bypasses on `cached.error`).
  const SPY_ERROR_RETRY_SEC = 60;

  async function fetchSpyData(id) {
    const playerId = parseInt(id, 10);
    if (!Number.isFinite(playerId) || playerId <= 0) throw new Error('Invalid player ID');
    if (!settings.apiKey) throw new Error('No API key set');
    if (isRateLimited()) {
      throw new Error('Rate-limited · retry in ' + rateLimitRemainingSec() + 's');
    }
    const url = 'https://www.tornstats.com/api/v2/'
              + encodeURIComponent(settings.apiKey)
              + '/spy/user/' + playerId
              + '?_=' + Date.now();
    const data = await apiGet(url, {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    });
    if (!data) throw new Error('Empty response from TornStats');
    if (data.status === false) {
      // v0.6.53 — TornStats returns `status: false` with various messages
      // for "no data on this player" cases ("User not found", "No spy on
      // file", etc.). Those aren't errors — they're categorical absences,
      // same as spy.status:false below. Reclassify so the UI shows the
      // neutral "No spy on record" line instead of a red error stripe.
      // Any other status:false message (auth failure, rate limit, etc.)
      // remains a real error and propagates.
      const msg = String(data.message || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('no spy')) {
        return { noData: true, fetchedAt: nowSec() };
      }
      throw new Error(data.message || 'TornStats error');
    }
    const spy = data.spy || {};
    if (spy.status === false) {
      // No spy on file — surface as a distinguishable "no data" state, not an error.
      return { noData: true, fetchedAt: nowSec() };
    }
    return {
      noData:      false,
      level:       (typeof spy.level === 'number') ? spy.level : null,
      total:       (typeof spy.total === 'number') ? spy.total : null,
      strength:    (typeof spy.strength === 'number') ? spy.strength : null,
      defense:     (typeof spy.defense === 'number') ? spy.defense : null,
      speed:       (typeof spy.speed === 'number') ? spy.speed : null,
      dexterity:   (typeof spy.dexterity === 'number') ? spy.dexterity : null,
      totalTs:     (typeof spy.total_timestamp === 'number') ? spy.total_timestamp : 0,
      strengthTs:  (typeof spy.strength_timestamp === 'number') ? spy.strength_timestamp : 0,
      defenseTs:   (typeof spy.defense_timestamp === 'number') ? spy.defense_timestamp : 0,
      speedTs:     (typeof spy.speed_timestamp === 'number') ? spy.speed_timestamp : 0,
      dexterityTs: (typeof spy.dexterity_timestamp === 'number') ? spy.dexterity_timestamp : 0,
      difference:  spy.difference || null,
      fetchedAt:   nowSec(),
    };
  }

  // Throttled fire-and-forget wrapper. Same pattern as
  // maybeRefreshFactionChain — drill re-renders itself when the fetch lands.
  function maybeFetchSpy(id, force) {
    const playerId = parseInt(id, 10);
    if (!Number.isFinite(playerId) || playerId <= 0) return;
    if (!settings.apiKey) return;
    const cached = spyCache[playerId];
    const now = nowSec();
    if (!force && cached && cached.fetchedAt) {
      const since = now - cached.fetchedAt;
      // v0.6.57 — short retry throttle on errored entries so repeated
      // drill opens don't hammer when TornStats is down or the key is bad.
      if (cached.error && since < SPY_ERROR_RETRY_SEC) return;
      if (!cached.error && since < SPY_REFRESH_SEC) return;
    }
    fetchSpyData(playerId).then(function (spy) {
      spyCache[playerId] = spy;
      store('spyCache', spyCache);
      if (currentDrill && currentDrill.kind === 'opponent' && currentDrill.id === playerId
          && panelEl && contentEl) {
        renderActive();
      }
    }).catch(function (e) {
      spyCache[playerId] = Object.assign(spyCache[playerId] || {}, {
        error: String(e && e.message ? e.message : e),
        fetchedAt: now,
      });
      store('spyCache', spyCache);
      if (currentDrill && currentDrill.kind === 'opponent' && currentDrill.id === playerId
          && panelEl && contentEl) {
        renderActive();
      }
    });
  }

  // v0.6.54 — Sequential bulk-fetch of TornStats spy data for every member
  // of a scouted faction roster. Triggered by the "Pull spies" button on
  // the Scout tab. Throttling rules:
  //
  //   1. Only fetches members WITHOUT a fresh cached spy entry. Already-
  //      noData entries are also skipped — TornStats won't have new data
  //      on them within an hour, and re-asking burns calls for nothing.
  //   2. 250ms delay between calls to avoid hammering TornStats. They
  //      have their own per-key rate budget; conservative pacing keeps
  //      large rosters (~100 members) under their threshold.
  //   3. Aborts on Torn-side rate-limit (we check between every call).
  //   4. Aborts cleanly on first fetch error so a TornStats-side outage
  //      doesn't churn through the whole roster.
  //   5. Live progress reported via scoutSpyPulling state — UI re-renders
  //      every 5 fetches to keep DOM updates cheap, and final on completion.
  //
  // Caller gates re-entry via the scoutSpyPulling state itself; this
  // function returns early if a pull is already in flight.
  const SCOUT_SPY_DELAY_MS = 250;
  async function pullSpiesForRoster(roster) {
    if (scoutSpyPulling) return;
    if (!roster || !Array.isArray(roster.members)) return;
    if (!settings.apiKey) return;

    const now = nowSec();
    const targets = roster.members.filter(function (m) {
      if (m.id === meta.userId) return false;
      const cached = spyCache[m.id];
      if (!cached) return true;
      // Retry errors after the standard 1-hour throttle (matches
      // maybeFetchSpy's gate). Skip fresh good cache + fresh noData.
      if (cached.fetchedAt && (now - cached.fetchedAt) >= SPY_REFRESH_SEC) return true;
      return false;
    });

    if (targets.length === 0) {
      // Nothing to do — still flash the button briefly so the click feels
      // acknowledged, then re-render to clear state.
      scoutSpyPulling = { factionId: roster.factionId, current: 0, total: 0,
                          message: 'All spy data already cached' };
      renderActive();
      setTimeout(function () {
        scoutSpyPulling = null;
        renderActive();
      }, 1500);
      return;
    }

    scoutSpyPulling = { factionId: roster.factionId, current: 0,
                        total: targets.length, message: null };
    renderActive();

    try {
      for (let i = 0; i < targets.length; i++) {
        if (isRateLimited()) {
          scoutSpyPulling.message = 'Rate-limited; aborted at ' + i + '/' + targets.length;
          break;
        }
        const m = targets[i];
        scoutSpyPulling.current = i + 1;
        try {
          const spy = await fetchSpyData(m.id);
          spyCache[m.id] = spy;
          store('spyCache', spyCache);
        } catch (e) {
          spyCache[m.id] = Object.assign(spyCache[m.id] || {}, {
            error: String(e && e.message ? e.message : e),
            fetchedAt: nowSec(),
          });
          store('spyCache', spyCache);
          // Bail on first hard error — if TornStats is down or the key is
          // invalid, the rest of the roster will fail identically.
          scoutSpyPulling.message = 'Stopped at ' + (i + 1) + '/' + targets.length
                                  + ': ' + (e && e.message ? e.message : e);
          break;
        }
        // Re-render every 5 to keep the DOM updates cheap. The final
        // post-loop renderActive() always paints completion.
        if ((i + 1) % 5 === 0) renderActive();
        await new Promise(function (r) { setTimeout(r, SCOUT_SPY_DELAY_MS); });
      }
    } finally {
      // Hold the completion message for 2s so the user sees what happened,
      // then clear state and re-render to remove the spinner UI.
      const completionMsg = scoutSpyPulling.message
        || 'Pulled ' + scoutSpyPulling.current + ' / ' + targets.length;
      scoutSpyPulling.message = completionMsg;
      scoutSpyPulling.current = scoutSpyPulling.total;
      renderActive();
      setTimeout(function () {
        scoutSpyPulling = null;
        if (panelEl && contentEl && settings.activeTab === 'scout') renderActive();
      }, 2000);
    }
  }

  // ─── TARGET QUEUE (v0.6.39) ────────────────────────────────────────────
  // Action-side counterpart to SCOUT and Opponent Intel (research views).
  // User stars an opponent from the Opponent Intel drill; we poll
  // /user/{id}?selections=profile and surface online status + last-action
  // on the Dashboard so they know who's hittable right now.
  function isTargetStarred(id) {
    const list = Array.isArray(settings.targetIds) ? settings.targetIds : [];
    return list.indexOf(id) !== -1;
  }

  function toggleTarget(id, name) {
    if (!id) return false;
    const list = Array.isArray(settings.targetIds) ? settings.targetIds.slice() : [];
    const idx = list.indexOf(id);
    if (idx === -1) {
      list.push(id);
      settings.targetIds = list;
      store('settings', settings);
      // Seed an entry so the row paints immediately with the name we know,
      // then kick a real fetch for the live status fields.
      targetStatus[id] = Object.assign({}, targetStatus[id] || {}, { name: name || null });
      store('targetStatus', targetStatus);
      refreshTargets({ ids: [id], force: true }).catch(function () {});
      return true;
    }
    list.splice(idx, 1);
    settings.targetIds = list;
    store('settings', settings);
    delete targetStatus[id];
    store('targetStatus', targetStatus);
    return false;
  }

  async function fetchTargetProfile(id) {
    const qs = new URLSearchParams({
      selections: 'profile',
      key: settings.apiKey,
      comment: 'TECH',
      _: String(Date.now()),
    });
    const url = 'https://api.torn.com/user/' + id + '?' + qs.toString();
    const data = await apiGet(url, { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' });
    if (!data || typeof data !== 'object') throw new Error('Bad profile response');
    const st = data.status || {};
    const la = data.last_action || {};
    return {
      name:              data.name || null,
      level:             (typeof data.level === 'number') ? data.level : null,
      statusState:       st.state || null,
      statusDescription: st.description || null,
      // v0.6.40 — capture status.until so locked targets render with a
      // countdown ("Hosp 14:23") instead of just "Hospital".
      statusUntil:       (typeof st.until === 'number') ? st.until : 0,
      lastActionStatus:  la.status || null,
      lastActionTs:      (typeof la.timestamp === 'number') ? la.timestamp : 0,
      fetchedAt:         nowSec(),
      error:             null,
    };
  }

  // v0.6.43 — Browser notification when a pinned target transitions from
  // unavailable (Hospital/Jail/Federal/Traveling/Abroad) to Okay. Opt-in
  // via the Settings toggle; defaults off. Uses the Notification API,
  // which requires user permission — requestNotificationPermission()
  // handles the prompt on first opt-in.
  //
  // Doesn't gate on my own state — we want to know "they're free" even if
  // I'm currently hospitalized myself (war prep / next-bar planning).
  // The notification.tag dedupes repeat pings for the same target so a
  // network blip + recovery can't spam.
  function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Promise.resolve(Notification.permission);
    }
    try {
      const r = Notification.requestPermission();
      // Older browsers used a callback; modern returns a Promise.
      return (r && typeof r.then === 'function')
        ? r
        : new Promise(function (resolve) { Notification.requestPermission(resolve); });
    } catch (e) { return Promise.resolve('error'); }
  }

  function fireTargetReadyNotification(id, name) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(SCRIPT_NAME + ': ' + (name || ('Player ' + id)) + ' is hittable', {
        body: 'Pinned target is out of hospital/jail/abroad. Click to open Opponent Intel.',
        icon: LAUNCHER_MARK_DATA_URL,
        tag:  'tech-target-' + id,   // dedupe repeats for the same target
      });
      n.onclick = function (e) {
        try { e.preventDefault(); } catch (err) {}
        try { window.focus(); } catch (err) {}
        if (!settings.panelOpen) togglePanel(true);
        openOpponentDrill(id, name);
        try { n.close(); } catch (err) {}
      };
    } catch (e) { /* notification creation failed — silent */ }
  }

  // Compare old + new status entries for one target. Fires the ready
  // notification when transitioning from a non-Okay state to Okay. Returns
  // void; storage update is the caller's responsibility.
  function maybeNotifyTargetReady(id, prev, next, name) {
    if (!settings.notifyTargetReady) return;
    if (!prev || !next) return;                      // need both to compare
    const oldState = prev.statusState;
    const newState = next.statusState;
    if (!oldState || !newState) return;              // initial fetch — no transition yet
    if (oldState === 'Okay') return;                 // already available — no flip
    if (newState !== 'Okay') return;                 // still locked / abroad
    fireTargetReadyNotification(id, name);
  }

  // ─── CHAIN-BREAK WATCHER (v0.6.61) ─────────────────────────────────────
  // Background ticker that fires a browser notification when an active
  // chain drops under 60s. Runs independently of the panel — the existing
  // chain pill ticker only runs while the Dashboard is rendered, so a
  // user scrolling Reddit with TECH minimized wouldn't catch a chain
  // about to break without this.
  //
  // Cost is essentially zero: every 5s we scrape the chain from Torn's
  // sidebar (same readChainFromTornDom path the pill uses — free, no API
  // call). When the active chain dips below 60s, fire once. Reset the
  // "fired" flag when the chain bounces back above 90s (i.e., a fresh
  // hit landed), so consecutive critical-low events on the same chain
  // re-arm naturally.
  //
  // Doesn't fire when:
  //   - User hasn't opted in (settings.notifyChainBreak === false)
  //   - Browser hasn't granted permission
  //   - No active chain (current === 0 or no timeoutAt)
  //   - Chain is in cooldown (not active)
  //   - Chain is already broken (remaining <= 0)
  //   - We've already fired for this dip and chain hasn't bounced back
  const CHAIN_WATCH_INTERVAL_MS = 5000;
  const CHAIN_BREAK_WARN_SEC    = 60;
  const CHAIN_BREAK_REARM_SEC   = 90;
  // Torn's chain respect-multiplier tiers start at 10 (10/25/50/100/...).
  // Below 10 there's no multiplier to protect, so a dropped chain costs
  // nothing meaningful — don't ping the user about it.
  const CHAIN_BREAK_MIN_COUNT   = 10;
  let chainWatchInterval = null;
  let chainWarningFired  = false;

  function fireChainBreakNotification(chainCount, remainingSec) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(SCRIPT_NAME + ': Chain ' + chainCount + ' breaking in ' + remainingSec + 's', {
        body: 'Hit something to keep the chain alive.',
        icon: LAUNCHER_MARK_DATA_URL,
        tag:  'tech-chain-break',     // dedupe browser-side too
      });
      n.onclick = function (e) {
        try { e.preventDefault(); } catch (err) {}
        try { window.focus(); } catch (err) {}
        try { n.close(); } catch (err) {}
      };
    } catch (e) { /* notification creation failed — silent */ }
  }

  function checkChainBreakWarning() {
    if (!settings.notifyChainBreak) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const c = readChainFromTornDom() || meta.chain;
    if (!c || !c.current || c.current === 0 || !c.timeoutAt) {
      // No chain — reset state so the next chain starts fresh.
      chainWarningFired = false;
      return;
    }
    if (c.current < CHAIN_BREAK_MIN_COUNT) {
      // Below the first respect-multiplier tier — nothing worth saving.
      // Keep the flag reset so the alert arms the moment the chain
      // crosses into multiplier territory.
      chainWarningFired = false;
      return;
    }
    const remaining = c.timeoutAt - nowSec();
    if (remaining > CHAIN_BREAK_REARM_SEC) {
      // Chain bounced back above the rearm threshold — re-enable warning
      // for the next dip on this same chain.
      chainWarningFired = false;
      return;
    }
    if (remaining <= 0)                      return;  // already broken
    if (remaining > CHAIN_BREAK_WARN_SEC)    return;  // not yet critical
    if (chainWarningFired)                   return;  // already warned for this dip

    fireChainBreakNotification(c.current, remaining);
    chainWarningFired = true;
  }

  function startChainWatcher() {
    if (chainWatchInterval) return;
    chainWatchInterval = setInterval(checkChainBreakWarning, CHAIN_WATCH_INTERVAL_MS);
    checkChainBreakWarning();   // run once immediately on start
  }

  // v0.6.47 — Adaptive target refresh cadence. The brute force "ping every
  // target every 120s" loop was the biggest TECH-side contributor to API
  // call volume — especially when multiple targets are pinned during a
  // war. Three rules slash that:
  //
  //   1. PREDICTED: target is locked (Hospital / Jail / Federal) with a
  //      future `statusUntil`. Skip pings until ~90s before release —
  //      we already know the exact moment they'll be out, no need to
  //      verify. Then poll every 20s through the final window so we
  //      catch the actual release within 20s.
  //
  //   2. HEARTBEAT: any other state (Okay / Traveling / Abroad / error).
  //      Slow 5-minute heartbeat — catches surprises like a fresh
  //      hospitalization or unexpected travel, without burning budget
  //      polling stable states minute after minute.
  //
  //   3. STALE-PREDICTION: cached statusUntil has already passed. They
  //      should be Okay now — refresh immediately to confirm.
  //
  // Net effect: ~60% reduction in target API calls during typical use.
  // 5 pinned targets all-night-locked used to be 5×30=150 calls/hour;
  // adaptive is roughly 5×4 heartbeats + final-window spikes ≈ 50/hour.
  const TARGETS_FINAL_WINDOW_SEC   = 90;
  const TARGETS_FINAL_INTERVAL_SEC = 20;
  const TARGETS_HEARTBEAT_SEC      = 300;
  const TARGETS_ERROR_RETRY_SEC    = 60;

  function targetRefreshDueAt(s) {
    if (!s || !s.fetchedAt) return 0;      // never fetched — fire now
    const fetchedAt = s.fetchedAt;
    const now = nowSec();

    // Errored entries — retry sooner than the heartbeat so we don't sit
    // with a stale "err: …" line on a target the user might still want.
    if (s.error) return fetchedAt + TARGETS_ERROR_RETRY_SEC;

    const state = s.statusState;
    const locked = (state === 'Hospital' || state === 'Jail' || state === 'Federal');

    if (locked && s.statusUntil) {
      // Rule 3 — cached release time already passed: confirm immediately.
      if (s.statusUntil <= now) return 0;

      // Rule 1 — predicted release. Skip until 90s before, then poll fast.
      const finalStart = s.statusUntil - TARGETS_FINAL_WINDOW_SEC;
      if (now < finalStart) {
        // Pre-final window: heartbeat, but never wait past finalStart so we
        // start the aggressive poll on time.
        return Math.min(fetchedAt + TARGETS_HEARTBEAT_SEC, finalStart);
      }
      return fetchedAt + TARGETS_FINAL_INTERVAL_SEC;
    }

    // Rule 2 — heartbeat for Okay / Traveling / Abroad / no-state.
    return fetchedAt + TARGETS_HEARTBEAT_SEC;
  }

  // v0.6.40 — "Can I hit this target right now?" gate. All three conditions
  // must hold: target is Okay (not hospitalized/jailed/abroad), I'm Okay,
  // and I have at least one standard attack worth of energy. Returns false
  // when self-state hasn't loaded yet (cautious default).
  function canHitTarget(s) {
    if (!s || s.statusState !== 'Okay') return false;
    if (!meta.energy || meta.energy.current == null) return false;
    if (meta.energy.current < ATTACK_ENERGY_COST) return false;
    // selfStatusState is null until the first fetchSelfState completes.
    // Treat null as "unknown but probably Okay" rather than blocking the
    // badge entirely — by the time the user clicks they'll know either way.
    if (meta.selfStatusState && meta.selfStatusState !== 'Okay') return false;
    return true;
  }

  // Refresh some or all pinned targets. `opts.ids` limits to a subset (used
  // when starring a fresh ID). `opts.force` bypasses the per-target staleness
  // throttle. Errors per id record on the status entry but don't reject the
  // batch — one bad ID shouldn't block the rest.
  async function refreshTargets(opts) {
    opts = opts || {};
    if (!settings.apiKey) return;
    // v0.6.44 — skip while throttled. Target refresh fires on every poll
    // and on init, so this is the biggest TECH-side contributor to API
    // call volume; gating it is the single highest-leverage backoff path.
    if (isRateLimited()) return;
    if (targetsRefreshing && !opts.ids) return;
    const isFullSweep = !opts.ids;
    if (isFullSweep) targetsRefreshing = true;
    try {
      const allIds = Array.isArray(settings.targetIds) ? settings.targetIds : [];
      const ids = opts.ids
        ? opts.ids.filter(function (x) { return allIds.indexOf(x) !== -1; })
        : allIds;
      if (ids.length === 0) return;
      // v0.6.47 — adaptive per-target due time replaces the old flat
      // settings.targetsRefreshSec floor. See targetRefreshDueAt() for
      // the cadence rules (v0.6.57 removed the dead setting entirely).
      const now = nowSec();
      const stale = opts.force
        ? ids
        : ids.filter(function (id) {
            const s = targetStatus[id];
            if (!s || !s.fetchedAt) return true;
            return now >= targetRefreshDueAt(s);
          });
      if (stale.length === 0) return;
      const results = await Promise.allSettled(stale.map(fetchTargetProfile));
      results.forEach(function (r, i) {
        const id = stale[i];
        // v0.6.43 — snapshot the prior status BEFORE we overwrite it, so
        // maybeNotifyTargetReady can detect transitions. Without this we'd
        // compare next to itself and never flip.
        const prev = targetStatus[id] ? Object.assign({}, targetStatus[id]) : null;
        if (r.status === 'fulfilled') {
          targetStatus[id] = Object.assign({}, targetStatus[id] || {}, r.value);
          maybeNotifyTargetReady(id, prev, r.value, r.value.name || (prev && prev.name));
        } else {
          targetStatus[id] = Object.assign({}, prev || {}, {
            error: String(r.reason && r.reason.message ? r.reason.message : r.reason),
            fetchedAt: now,
          });
        }
      });
      store('targetStatus', targetStatus);
      if (panelEl && contentEl && settings.activeTab === 'dashboard' && !currentDrill) {
        renderActive();
      }
    } finally {
      if (isFullSweep) targetsRefreshing = false;
    }
  }

  // v2 `/user/attacks` returns { attacks: [...], _metadata }. We normalise
  // each entry to the v1-flat shape and key the result by attack code, so
  // ingestAttacks (which iterates `data.attacks` as a code-keyed object) is
  // unchanged. `sort=ASC` gives us chronological order walking forward from
  // the cursor — same semantics the v1 poll relied on implicitly.
  // Battle stats poll for Build Coherence Checker (v0.5.0+).
  // v1 selection — v2 has /user/personalstats but battlestats live on the
  // dedicated v1 selection. Failure is non-fatal; the audit just shows
  // "no stats yet" until the next successful poll.
  // v0.6.48 — throttle to every 10 minutes. Battle stats barely move
  // minute-to-minute (training nudges, drug effects, education ticks).
  // The Build Coherence audit doesn't need second-by-second freshness;
  // 10-min cadence is plenty. meta.battleStats.ts is set by this fetch
  // and gates re-entry.
  const BATTLESTATS_INTERVAL_SEC = 600;
  async function fetchBattleStats() {
    if (meta.battleStats && meta.battleStats.ts
        && (nowSec() - meta.battleStats.ts) < BATTLESTATS_INTERVAL_SEC) {
      return;
    }
    try {
      const data = await apiGet(tornUrl('battlestats'));
      if (!data || typeof data.strength !== 'number') return;
      const stats = {
        strength:  data.strength  || 0,
        defense:   data.defense   || 0,
        speed:     data.speed     || 0,
        dexterity: data.dexterity || 0,
        ts: nowSec(),
      };
      stats.total = stats.strength + stats.defense + stats.speed + stats.dexterity;
      meta.battleStats = stats;
      store('meta', meta);
    } catch (e) {
      // Quiet — bad API key would already surface via identifySelf/attacks poll.
    }
  }

  // ─── EQUIPPED LOADOUT (v0.6.71) ────────────────────────────────────────
  // Polls /v2/user/equipment for the user's currently equipped weapons +
  // armor. Source of truth for the Dashboard's Equipped Loadout card,
  // the v0.7 Phase 2 loadout-archetype classifier (Walloper Walt / DoT
  // Dan / etc.), and the v0.7 Phase 3 2-axis Build Coherence verdict
  // (stat-shape × loadout-family with soft scoring + confidence dots).
  //
  // Throttled to 5 minutes because equipment changes are user-initiated
  // and infrequent — there's no reason to re-pull every poll. Failure is
  // non-fatal; the card just shows "Loadout unavailable" until next poll.
  //
  // Response shape (verified live 2026-05-29):
  //   { equipment: [{ id, name, type:"Weapon"|"Armor", sub_type, slot:Number,
  //                    stats, bonuses, rarity, ammo, mods, ... }, ...],
  //     clothing: [...] }
  // `slot` is an integer 1-9 — see EQUIPMENT_SLOT_BY_NUMBER. The object-
  // shaped branch is retained only as a defensive fallback.
  const EQUIPMENT_INTERVAL_SEC = 300;
  async function fetchEquipment() {
    if (meta.equipment && meta.equipment.fetchedAt
        && (nowSec() - meta.equipment.fetchedAt) < EQUIPMENT_INTERVAL_SEC) {
      return;
    }
    if (!settings.apiKey) return;
    if (isRateLimited()) return;
    try {
      const data = await apiGet(v2Url('/user/equipment'), v2AuthHeaders());
      if (!data) return;
      meta.equipment = normalizeEquipment(data);
      store('meta', meta);
    } catch (e) {
      // Quiet — same rationale as fetchBattleStats.
    }
  }

  const EQUIPMENT_SLOTS = ['primary', 'secondary', 'melee', 'temporary',
                           'helmet', 'body', 'pants', 'boots', 'gloves'];

  // v0.6.74 — verified against the live /v2/user/equipment payload: each
  // item carries `slot` as an integer 1-9. Note `temporary` sits at 5
  // between body (4) and helmet (6), which is non-obvious — Torn ordered
  // these by equip-screen layout, not by weapon-vs-armor grouping.
  const EQUIPMENT_SLOT_BY_NUMBER = {
    1: 'primary', 2: 'secondary', 3: 'melee',
    4: 'body',    5: 'temporary', 6: 'helmet',
    7: 'pants',   8: 'boots',     9: 'gloves',
  };

  function normalizeEquipment(data) {
    const out = {
      primary: null, secondary: null, melee: null, temporary: null,
      helmet: null, body: null, pants: null, boots: null, gloves: null,
      fetchedAt: nowSec(),
      rawShape: null,
    };
    // Live shape (verified 2026-05-29): { equipment: [...], clothing: [...] }
    // where each item has { id, name, type, sub_type, slot:Number, ... }.
    // Kept the slot-keyed object fallback for resilience in case Torn ever
    // changes the wrapper shape.
    const eq = (data && data.equipment) || data;
    if (Array.isArray(eq)) {
      out.rawShape = 'array';
      for (const item of eq) {
        if (!item) continue;
        let slot = null;
        if (typeof item.slot === 'number') {
          slot = EQUIPMENT_SLOT_BY_NUMBER[item.slot] || null;
        } else {
          const tag = String(item.equipped || item.slot || '').toLowerCase();
          if (EQUIPMENT_SLOTS.indexOf(tag) !== -1) slot = tag;
        }
        if (!slot) continue;
        out[slot] = {
          id:   item.id || item.item_id || item.ID || null,
          name: item.name || '',
          // Prefer sub_type ("Shotgun", "Pistol", "Body", ...) for the
          // inline label; fall back to the broad "Weapon"/"Armor" type.
          type: item.sub_type || item.type || '',
          // v0.6.76 — preserve the bonuses array verbatim for the Phase 2
          // loadout-archetype detector. Shape per entry is { name, value }
          // (e.g. { name: 'Bleed', value: 45 }); we keep the raw form so
          // the family classifier can defensively handle either shape.
          bonuses: Array.isArray(item.bonuses) ? item.bonuses : [],
        };
      }
    } else if (eq && typeof eq === 'object') {
      out.rawShape = 'object';
      for (const slot of EQUIPMENT_SLOTS) {
        const v = eq[slot];
        if (v && typeof v === 'object') {
          out[slot] = {
            id:   v.id || v.item_id || v.ID || null,
            name: v.name || '',
            type: v.sub_type || v.type || '',
            bonuses: Array.isArray(v.bonuses) ? v.bonuses : [],
          };
        }
      }
    }
    return out;
  }

  // v0.6.40 — Self-state poll. Pulls our own energy + status so the Target
  // queue "HIT NOW" badge knows whether we can actually attack. Combined
  // selections (bars + basic) is one v1 call: bars gives the energy meter,
  // basic gives status.state (Okay / Hospital / Jail / Federal). Failure
  // is non-fatal — badges hide until the next successful poll.
  //
  // v0.6.48 — throttled to every 5 minutes. Energy and chain are now
  // scraped from Torn's sidebar at render time (zero API cost), so the
  // only thing this call still uniquely provides is `status.state`
  // for the canHitTarget self-gate — and that rarely changes minute-
  // to-minute (you don't hospitalize yourself every cycle).
  const SELF_STATE_INTERVAL_SEC = 300;
  async function fetchSelfState() {
    if (meta.selfStateLastFetch
        && (nowSec() - meta.selfStateLastFetch) < SELF_STATE_INTERVAL_SEC) {
      return;
    }
    try {
      const data = await apiGet(tornUrl('bars,basic'));
      if (!data) return;
      const energy = data.energy || {};
      if (typeof energy.current === 'number') {
        meta.energy = {
          current: energy.current,
          maximum: energy.maximum,
          ticktime: energy.ticktime || 0,
          ts: nowSec(),
        };
      }
      // v0.6.45 — chain state. Torn's `bars` selection includes the chain
      // sub-object: current count, maximum, timeout (absolute Unix ts when
      // chain breaks), modifier (current respect multiplier), and cooldown
      // (seconds remaining of post-break lockout). We convert cooldown to
      // an absolute timestamp so the countdown helper works uniformly.
      const chain = data.chain || {};
      if (typeof chain.current === 'number') {
        const cd = typeof chain.cooldown === 'number' ? chain.cooldown : 0;
        meta.chain = {
          current:    chain.current,
          max:        chain.maximum || 0,
          // v0.6.68 — same chain.timeout format-detection fix as the
          // faction endpoint. Masked here in normal play because the
          // chain pill prefers readChainFromTornDom() over meta.chain;
          // only the rare DOM-scrape-fallback path would have shown the
          // bug. Symmetric fix keeps both endpoints aligned.
          timeoutAt:  resolveChainTimeoutAt(chain.timeout),
          modifier:   typeof chain.modifier === 'number' ? chain.modifier : 1.0,
          cooldownAt: cd > 0 ? nowSec() + cd : 0,
          fetchedAt:  nowSec(),
        };
      }
      const status = data.status || {};
      meta.selfStatusState = status.state || null;
      meta.selfStatusUntil = (typeof status.until === 'number') ? status.until : 0;
      // v0.6.48 — stamp success so the 5-min throttle gate works.
      meta.selfStateLastFetch = nowSec();
      store('meta', meta);
    } catch (e) {
      // Quiet — same rationale as fetchBattleStats.
    }
  }

  async function fetchAttacksPage(opts) {
    // Three modes:
    //   { to: ts }   → sort=DESC, walk back from `to` (used by poll pages 2+)
    //   { from: ts } → sort=ASC,  walk forward from `from` (kept for symmetry)
    //   {} or none   → sort=DESC, no bounds = the user's MOST RECENT 100
    //
    // Page 1 of every poll uses no-bounds DESC so we can never silently
    // miss a recent fight to a stale cursor (see v0.6.2 bugfix rationale).
    const params = { limit: '100' };
    if (opts && opts.to) {
      params.sort = 'DESC';
      params.to = String(opts.to);
    } else if (opts && opts.from) {
      // v2's `from` is exclusive ("data AFTER this time"). Subtract one so
      // the boundary fight is re-fetched and code-based dedup absorbs it.
      params.sort = 'ASC';
      params.from = String(opts.from - 1);
    } else {
      params.sort = 'DESC';
    }
    const resp = await apiGet(v2Url('/user/attacks', params), v2AuthHeaders());
    const list = (resp && Array.isArray(resp.attacks)) ? resp.attacks : [];
    const out = {};
    for (const v2attack of list) {
      if (!v2attack || !v2attack.code) continue;
      out[v2attack.code] = normalizeV2Attack(v2attack);
    }
    return { attacks: out };
  }

  async function poll() {
    if (isPolling) return;
    if (!settings.apiKey) {
      meta.lastError = 'No API key set';
      meta.lastPollTs = nowSec();
      store('meta', meta);
      refreshAfterPoll();
      return;
    }
    // v0.6.44 — back off the entire poll cycle while throttled. pollTimer
    // keeps firing every settings.pollIntervalSec seconds, so we'll
    // automatically retry on the first tick after the cooldown elapses.
    if (isRateLimited()) {
      meta.lastPollTs = nowSec();
      store('meta', meta);
      refreshAfterPoll();
      return;
    }
    isPolling = true;
    meta.lastPollTs = nowSec();
    meta.totalPollCount++;
    try {
      await identifySelf();
      await fetchBattleStats();
      // v0.6.40 — refresh my energy + status so the Target queue HIT badge
      // and my-own-status gating stay current. Non-blocking — failure here
      // just hides the badge until next poll.
      await fetchSelfState();
      // v0.6.71 — fetch equipped loadout. Throttled to 5 min internally;
      // powers the Equipped Loadout Dashboard card and will feed the
      // Phase 2 loadout-archetype classifier + Phase 3 2-axis Build
      // Coherence rewrite.
      await fetchEquipment();
      // v0.6.70 — detect active ranked war so the Dashboard chain pill can
      // render side-by-side with the enemy faction's chain. Throttled to
      // 5 minutes internally, fire-and-forget.
      maybeRefreshActiveWar();

      // v0.6.2 — always fetch the newest 100 on page 1 (no bounds, DESC).
      // Page 1 thus catches every recent fight regardless of what
      // `meta.lastFightTs` says, immune to v2 `from=…` indexing lag or
      // off-by-one in the cursor. Pages 2-5 only engage on the rare day
      // when 100+ fights happened between polls, walking back from the
      // oldest ts of the previous page until we hit overlap with stored
      // history. Code-based dedup in ingestAttacks absorbs the overlap.
      let totalNew = 0;
      let walkBackTs = null;
      for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
        const opts = page === 0 ? {} : { to: walkBackTs - 1 };
        const data = await fetchAttacksPage(opts);
        const attacks = (data && data.attacks) || {};
        const keys = Object.keys(attacks);
        if (keys.length === 0) break;
        const newCount = ingestAttacks(attacks);
        totalNew += newCount;
        // Partial overlap with stored history → all older fights also stored.
        if (newCount < keys.length) break;
        // All-new full page → keep walking back through history.
        if (keys.length < 100) break;
        walkBackTs = Math.min(...keys.map(k => attacks[k].timestamp_ended || Infinity));
        if (!Number.isFinite(walkBackTs)) break;
      }

      meta.lastSuccessfulPollTs = nowSec();
      meta.lastError = null;
      store('meta', meta);
      // v0.6.39 — refresh Target queue status alongside fight ingest.
      // Fire-and-forget; one bad pinned ID shouldn't poison the poll.
      refreshTargets({}).catch(function () {});
    } catch (e) {
      meta.lastError = String(e && e.message ? e.message : e);
      store('meta', meta);
    } finally {
      isPolling = false;
      refreshAfterPoll();
    }
  }

  function startPolling() {
    stopPolling();
    if (!settings.apiKey) return;
    poll();
    pollTimer = setInterval(poll, Math.max(15, settings.pollIntervalSec) * 1000);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ─── ANALYSIS ───────────────────────────────────────────────────────────
  function getWindow(key) {
    return WINDOWS.find(w => w.key === key) || WINDOWS[1];
  }

  function fightViewsInWindow(windowKey) {
    if (!meta.userId) return [];
    const w = getWindow(windowKey);
    const cutoff = isFinite(w.ms) ? nowSec() - Math.floor(w.ms / 1000) : 0;
    const views = [];
    for (const code in fights) {
      const raw = fights[code];
      if ((raw.timestamp_ended || 0) < cutoff) continue;
      if (w.rawFilter && !w.rawFilter(raw)) continue;
      views.push(deriveFightView(raw, meta.userId));
    }
    views.sort((a, b) => b.tsEnded - a.tsEnded);
    return views;
  }

  function computeOverview(views) {
    const o = {
      total: views.length,
      wins: 0,
      losses: 0,
      hospThem: 0,
      hospMe: 0,
      muggedThem: 0,
      respectTotal: 0,
      respectGained: 0,
      respectLost: 0,
      attackerCount: 0,
      defenderCount: 0,
      stealthed: 0,
      warCount: 0,
      avgDurationSec: 0,
      byOutcome: {},
    };
    let durSum = 0, durN = 0;
    for (const v of views) {
      o.byOutcome[v.outcomeKey] = (o.byOutcome[v.outcomeKey] || 0) + 1;
      if (v.outcome.win)  o.wins++;
      if (v.outcome.loss) o.losses++;
      if (v.outcomeKey === 'hosp_them')   o.hospThem++;
      if (v.outcomeKey === 'hosp_me')     o.hospMe++;
      if (v.outcomeKey === 'mugged_them') o.muggedThem++;
      o.respectTotal += v.respectDelta;
      if (v.respectDelta > 0) o.respectGained += v.respectDelta;
      if (v.respectDelta < 0) o.respectLost   += v.respectDelta;
      if (v.iAm === 'attacker') o.attackerCount++;
      else if (v.iAm === 'defender') o.defenderCount++;
      if (v.stealthed) o.stealthed++;
      if (v.isWar || v.isRankedWar) o.warCount++;
      if (v.iAm === 'attacker' && v.durationSec > 0) { durSum += v.durationSec; durN++; }
    }
    o.winRate = o.total > 0 ? o.wins / o.total : 0;
    o.avgDurationSec = durN > 0 ? durSum / durN : 0;
    // Energy efficiency: respect gained per energy bar (1 bar = 1000 energy = 40 standard attacks)
    o.energySpent = o.attackerCount * ATTACK_ENERGY_COST;
    o.respectPerEnergy = o.energySpent > 0 ? o.respectGained / o.energySpent : 0;
    o.respectPerBar = o.respectPerEnergy * 1000;
    return o;
  }

  // v0.6.36 — WAR scorecard. Computes the at-a-glance hero stats shown
  // on Dashboard when the WAR pill is selected. Reuses computeOverview
  // numbers for K/D, respect, and hosps, plus adds two war-specific
  // metrics the existing cards don't surface: time elapsed in the war
  // and respect-per-hour pace.
  //
  // Time elapsed = now - earliest fight ts in the WAR-filtered views.
  // Pace = respectGained / (elapsedHours), with a sane floor on the
  // denominator so a fresh war with 1 fight doesn't divide by zero.
  function computeWarScorecard(views, overview) {
    if (!views || views.length === 0) return null;
    // v0.6.77 — three states the scorecard can render in:
    //   1. Active war:  anchor on activeWarTarget; elapsed = running clock.
    //   2. Post-war:    anchor on lastWarTarget (snapshot taken on the
    //                   active → null transition, or pulled from the API's
    //                   ranked_wars on cold start within 7 days). Elapsed
    //                   is the fixed war duration, not a running clock.
    //   3. Neither:     return null. v0.6.72 used to fall back to the
    //                   earliest stored ranked-war fight here, which after
    //                   a war ended leaked prior wars into the WAR pill
    //                   and produced multi-day elapsed readings.
    let startTs, endTs, isPostWar = false, anchor = null;
    const war = meta.activeWarTarget;
    const lastWar = meta.lastWarTarget;
    if (war && war.warStart) {
      anchor = war;
      startTs = war.warStart;
      endTs = nowSec();
    } else if (lastWar && lastWar.warStart) {
      anchor = lastWar;
      startTs = lastWar.warStart;
      endTs = lastWar.warEnd || nowSec();
      isPostWar = true;
    } else {
      return null;
    }
    const elapsedSec = Math.max(0, endTs - startTs);
    const elapsedHoursForPace = Math.max(elapsedSec / 3600, 60 / 3600);
    const respectPerHour = overview.respectGained > 0
      ? overview.respectGained / elapsedHoursForPace
      : 0;
    return {
      wins:        overview.wins,
      losses:      overview.losses,
      respectNet:  overview.respectTotal,
      koDelivered: overview.wins,
      koTaken:     overview.losses,
      elapsedSec,
      respectPerHour,
      isPostWar,
      warEndedAt:  isPostWar ? (lastWar.warEnd || null) : null,
      enemyName:   (anchor && anchor.factionName) || null,
    };
  }

  // Render-only helper. Format the elapsed time as "Xh Ym" / "Xm" / "<1m".
  function fmtElapsed(sec) {
    if (!sec || sec < 60) return '<1m';
    if (sec < 3600)       return Math.floor(sec / 60) + 'm';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? (h + 'h ' + m + 'm') : (h + 'h');
  }

  function topOpponents(views, limit = 10) {
    const map = new Map();
    for (const v of views) {
      if (!v.opponentId) continue;
      let row = map.get(v.opponentId);
      if (!row) {
        row = {
          id: v.opponentId,
          name: v.opponentName,
          fights: 0, wins: 0, losses: 0,
          respect: 0, lastTs: 0,
        };
        map.set(v.opponentId, row);
      }
      row.fights++;
      if (v.outcome.win)  row.wins++;
      if (v.outcome.loss) row.losses++;
      row.respect += v.respectDelta;
      if (v.tsEnded > row.lastTs) row.lastTs = v.tsEnded;
    }
    return [...map.values()].sort((a, b) => b.fights - a.fights).slice(0, limit);
  }

  // ─── QUICK WINS (v0.6.60) ───────────────────────────────────────────────
  // Chain-fight optimizer. Walks every stored fight (not windowed — old
  // dominance is still signal, staleness penalty handles drift) and ranks
  // opponents by a composite "chain efficiency" score:
  //
  //   score = winRate²                          // squared so coin flips don't make the list
  //         × respectPerFight                   // weight by gain
  //         × (60 / max(avgDurationSec, 30))    // reward short fights, floor at 30s
  //         × stalenessPenalty                  // ½ past 30d, ¼ past 90d
  //
  // Eligibility:
  //   - You were the attacker (incoming fights don't tell you who you can hit)
  //   - ≥3 outgoing fights against this opponent (sample size)
  //   - winRate ≥ 0.5 (it's "Quick Wins" — losses don't qualify)
  //   - avgDurationSec > 0 (need usable timing data)
  //   - lastTs within 1 year (older than that is "they've moved on" noise)
  //
  // Doesn't poll live status. Per data-driven-only design choice (v0.6.60):
  // the panel is a DISCOVERY tool, the Targets queue is the live-status
  // tool. Click any Quick Win row → Opponent Intel drill → pin if you
  // want tracking. Keeps the optimizer fast + the API budget intact.
  const QUICK_WIN_MIN_FIGHTS = 3;
  const QUICK_WIN_MIN_WINRATE = 0.5;
  const QUICK_WIN_AGE_CUTOFF_SEC = 365 * 86400;
  function computeQuickWins(limit) {
    if (!meta.userId) return [];
    limit = limit || 8;
    const myId = meta.userId;
    const map = new Map();
    for (const code in fights) {
      const raw = fights[code];
      if (raw.attacker_id !== myId) continue;     // outgoing only
      const v = deriveFightView(raw, myId);
      if (!v.opponentId) continue;
      let row = map.get(v.opponentId);
      if (!row) {
        row = {
          id: v.opponentId,
          name: v.opponentName || ('Player ' + v.opponentId),
          factionName: v.opponentFactionName || '',
          level: v.opponentLevel,
          fights: 0, wins: 0, losses: 0,
          respectSum: 0,
          durationSum: 0, durationN: 0,
          lastTs: 0,
        };
        map.set(v.opponentId, row);
      }
      row.fights++;
      if (v.outcome.win)  row.wins++;
      if (v.outcome.loss) row.losses++;
      row.respectSum += v.respectDelta || 0;
      if (v.durationSec > 0) {
        row.durationSum += v.durationSec;
        row.durationN++;
      }
      if (v.tsEnded > row.lastTs) row.lastTs = v.tsEnded;
      // Keep the freshest level we have on file.
      if (v.opponentLevel != null) row.level = v.opponentLevel;
    }
    const now = nowSec();
    const candidates = [];
    for (const row of map.values()) {
      if (row.fights < QUICK_WIN_MIN_FIGHTS) continue;
      const winRate = row.wins / row.fights;
      if (winRate < QUICK_WIN_MIN_WINRATE) continue;
      if (row.durationN === 0) continue;
      const avgDuration = row.durationSum / row.durationN;
      const respectPerFight = row.respectSum / row.fights;
      const age = now - row.lastTs;
      if (age > QUICK_WIN_AGE_CUTOFF_SEC) continue;
      let stale = 1.0;
      if (age > 90 * 86400)      stale = 0.25;
      else if (age > 30 * 86400) stale = 0.5;
      const speed = 60 / Math.max(avgDuration, 30);
      // respectPerFight can be ≤0 for ranked-war contexts with respect_loss
      // wash — guard against zero/negative inputs so we don't produce
      // bogus high scores via flipped signs.
      const respectFactor = Math.max(respectPerFight, 0.01);
      const score = (winRate * winRate) * respectFactor * speed * stale;
      candidates.push({
        id: row.id,
        name: row.name,
        factionName: row.factionName,
        level: row.level,
        fights: row.fights,
        winRate,
        avgDuration,
        respectPerFight,
        lastTs: row.lastTs,
        stale,
        score,
      });
    }
    candidates.sort(function (a, b) { return b.score - a.score; });
    return candidates.slice(0, limit);
  }

  // Opponent Intelligence v0.1 — vision feature #6. Walks every stored
  // fight against `opponentId` (not windowed — we want the full history)
  // and produces an intel record: fight counts, win rate, respect, hosp
  // record, level history, interrupt rate, finishing-hit effects in both
  // directions, and a derived verdict + plain-language blurb.
  //
  // Verdict thresholds are starting heuristics:
  //   UNKNOWN  — < 2 fights total
  //   STALE    — last fight > 30 days ago
  //   DANGEROUS— they have hospitalised you OR (≥3 outgoing, win rate < 40%)
  //   FAVORABLE— ≥3 outgoing, win rate ≥ 70%, no hospitalisations of you
  //   TANKY    — ≥3 outgoing, win rate 40–70% OR interrupt rate ≥ 30%
  //   NEUTRAL  — any other case
  function computeOpponentIntel(opponentId) {
    if (!opponentId || !meta.userId) return null;
    const records = [];
    for (const code in fights) {
      const raw = fights[code];
      if (raw.attacker_id !== opponentId && raw.defender_id !== opponentId) continue;
      const v = deriveFightView(raw, meta.userId);
      if (v.opponentId !== opponentId) continue;
      records.push(v);
    }
    if (records.length === 0) return null;
    records.sort((a, b) => b.tsEnded - a.tsEnded);

    const intel = {
      id: opponentId,
      name: records[0].opponentName || '?',
      factionId:   records[0].opponentFaction || 0,
      factionName: records[0].opponentFactionName || '',
      fights: records.length,
      wins: 0, losses: 0,
      asAttacker: 0, asDefender: 0,
      respectGained: 0, respectLost: 0,
      hospMe: 0, hospThem: 0,
      muggedMe: 0, muggedThem: 0,
      // v0.6.29: any defender-side loss = they took you out. Broader than
      // hospMe (which only fires on the explicit "Hospitalized" API result);
      // a "Leave them on the street" finish reads as result="Attacked" in
      // the API but still puts you in hospital and is equally decisive.
      defeatedMeCount: 0,
      intCount: 0, raidCount: 0, stealthCount: 0,
      firstSeenTs: records[records.length - 1].tsEnded,
      lastSeenTs:  records[0].tsEnded,
      levelMin: null, levelMax: null, levelLast: null,
      effectsFromThem: {},
      effectsToThem:   {},
      outcomes: {},
      recent: records.slice(0, 6),
    };

    for (const v of records) {
      if (v.outcome.win)  intel.wins++;
      if (v.outcome.loss) intel.losses++;
      if (v.iAm === 'attacker')      intel.asAttacker++;
      else if (v.iAm === 'defender') intel.asDefender++;
      if (v.respectDelta > 0) intel.respectGained += v.respectDelta;
      if (v.respectDelta < 0) intel.respectLost   += v.respectDelta;
      if (v.outcomeKey === 'hosp_them')   intel.hospThem++;
      if (v.outcomeKey === 'hosp_me')     intel.hospMe++;
      if (v.outcomeKey === 'mugged_them') intel.muggedThem++;
      if (v.outcomeKey === 'mugged_me')   intel.muggedMe++;
      // v0.6.29: defender + outcome.loss covers loss/hosp_me/mugged_me/
      // looted_me — every way they can decisively put you down.
      if (v.iAm === 'defender' && v.outcome.loss) intel.defeatedMeCount++;
      if (v.isInterrupted) intel.intCount++;
      if (v.isRaid)        intel.raidCount++;
      if (v.stealthed)     intel.stealthCount++;
      intel.outcomes[v.outcomeKey] = (intel.outcomes[v.outcomeKey] || 0) + 1;
      if (v.opponentLevel != null) {
        if (intel.levelMin == null || v.opponentLevel < intel.levelMin) intel.levelMin = v.opponentLevel;
        if (intel.levelMax == null || v.opponentLevel > intel.levelMax) intel.levelMax = v.opponentLevel;
        if (intel.levelLast == null) intel.levelLast = v.opponentLevel;
      }
      // When I'm defender, the kill-hit effects fired on me (opponent's weapon).
      // When I'm attacker, the effects fired by me. Bucket separately.
      const fx = Array.isArray(v.finishingHitEffects) ? v.finishingHitEffects : [];
      const bucket = v.iAm === 'defender' ? intel.effectsFromThem
                   : v.iAm === 'attacker' ? intel.effectsToThem
                   : null;
      if (bucket) {
        for (const e of fx) {
          const name = String((e && e.name) || '').replace(/^./, c => c.toUpperCase());
          if (!name) continue;
          bucket[name] = (bucket[name] || 0) + 1;
        }
      }
    }
    intel.respectNet = intel.respectGained + intel.respectLost;
    intel.winRate    = intel.fights > 0 ? intel.wins / intel.fights : 0;
    intel.intRate    = intel.fights > 0 ? intel.intCount / intel.fights : 0;

    const ageDays = (nowSec() - intel.lastSeenTs) / 86400;
    // v0.6.28: a decisive defeat beats the fights<2 unknown gate AND the
    // stale gate. One defeat is decisive evidence they can take you out;
    // pattern noise doesn't apply, and even an old defeat tells you their
    // means are real. STALE still applies to non-defeat histories where
    // the verdict relies on win-rate samples that may have drifted.
    //
    // v0.6.29: gate changed from hospMe to defeatedMeCount. hospMe only
    // tracks the API's "Hospitalized" result code — fights where the
    // attacker explicitly chose the hospitalize finishing move. A "Leave
    // them on the street" finish with high damage still puts you in
    // hospital but the API records result="Attacked", which classifies
    // as outcomeKey='loss' and never bumps hospMe. defeatedMeCount counts
    // all defender-side losses (loss / hosp_me / mugged_me / looted_me) —
    // the full set of "they took you out" outcomes.
    if (intel.defeatedMeCount > 0) {
      intel.verdict = { key: 'danger', label: 'DANGEROUS', className: 'danger' };
      const n = intel.defeatedMeCount;
      intel.blurb = `They have beaten you ${n} time${n === 1 ? '' : 's'}. Approach only at full stats with good gear, or skip.`;
    } else if (intel.fights < 2) {
      intel.verdict = { key: 'unknown', label: 'UNKNOWN', className: '' };
      intel.blurb = 'Single encounter so far — not enough to call a pattern. Treat with caution.';
    } else if (ageDays > 30) {
      intel.verdict = { key: 'stale', label: 'STALE', className: 'stale' };
      intel.blurb = `Last seen ${Math.floor(ageDays)} days ago. Their stats and build may have shifted substantially since.`;
    } else if (intel.asAttacker >= 3 && intel.winRate < 0.4) {
      intel.verdict = { key: 'danger', label: 'DANGEROUS', className: 'danger' };
      intel.blurb = `You only win ${(intel.winRate * 100).toFixed(0)}% of the time here. They are out of your weight class for now.`;
    } else if (intel.asAttacker >= 3 && intel.winRate >= 0.7 && intel.hospMe === 0) {
      intel.verdict = { key: 'fav', label: 'FAVORABLE', className: 'fav' };
      intel.blurb = `You win ${(intel.winRate * 100).toFixed(0)}% against this player. Safe to chain-attack when they show.`;
    } else if (intel.asAttacker >= 3 && (intel.winRate < 0.7 || intel.intRate >= 0.3)) {
      intel.verdict = { key: 'tank', label: 'TANKY', className: 'tank' };
      intel.blurb = intel.intRate >= 0.3
        ? `${(intel.intRate * 100).toFixed(0)}% of attacks against them were interrupted — long fights. Expect slow kills and chain risk.`
        : `Win rate ${(intel.winRate * 100).toFixed(0)}% — they soak more energy than the average target. Pick your moment.`;
    } else {
      intel.verdict = { key: 'neutral', label: 'NEUTRAL', className: '' };
      intel.blurb = 'Mixed signal — no clear pattern yet. Keep playing and the verdict will sharpen.';
    }

    return intel;
  }

  // v0.6.38 — Faction Intel drill. Aggregates every fight against
  // opponents whose faction matches `factionId`. Mirror of
  // computeOpponentIntel but one level up — useful before/during/after
  // a war when you want the collective read on "us vs them" without
  // mentally summing per-opponent drills.
  //
  // factionId may not be present on older fights (pre-v0.3.0 stores
  // didn't always carry factionname/faction). Such records get matched
  // by name if the caller passes one, but typically we just walk by
  // ID for tightness.
  function computeFactionIntel(factionId) {
    if (!factionId || !meta.userId) return null;
    const records = [];
    for (const code in fights) {
      const raw = fights[code];
      const youAttacker = raw.attacker_id === meta.userId;
      const youDefender = raw.defender_id === meta.userId;
      if (!youAttacker && !youDefender) continue;
      const oppFaction = youAttacker ? raw.defender_faction : raw.attacker_faction;
      if (oppFaction !== factionId) continue;
      records.push(deriveFightView(raw, meta.userId));
    }
    if (records.length === 0) return null;
    records.sort((a, b) => b.tsEnded - a.tsEnded);

    // Resolve a display name. Records may have inconsistent strings if
    // the faction rebranded mid-war — take the most recent non-empty one.
    let factionName = '';
    for (const v of records) {
      if (v.opponentFactionName) { factionName = v.opponentFactionName; break; }
    }
    factionName = factionName || ('Faction ' + factionId);

    const intel = {
      id: factionId,
      name: factionName,
      fights: records.length,
      wins: 0, losses: 0,
      asAttacker: 0, asDefender: 0,
      respectGained: 0, respectLost: 0,
      koDelivered: 0, koTaken: 0,
      hospThem: 0, hospMe: 0,
      // Same broad defeat counter as Opponent Intel (v0.6.29 fix family).
      defeatedMeCount: 0,
      firstSeenTs: records[records.length - 1].tsEnded,
      lastSeenTs:  records[0].tsEnded,
      uniqueOpponentCount: 0,
      verdictMix: { danger: 0, tank: 0, stale: 0, neutral: 0, unknown: 0, fav: 0, nohist: 0 },
      topOpponents: [],   // [{ id, name, fights, wins, losses, respect, lastTs }]
      recent: records.slice(0, 8),
      // v0.6.42 — Power Profile fields. Populated in first pass below.
      levelMin: null, levelMax: null, levelSum: 0, levelN: 0, avgLevel: null,
      levelBuckets: {},               // { [bucketStart]: count } — 10-level buckets
      ffSum: 0, ffN: 0, avgFairFight: null,
      ffBuckets: ROADMAP_BRACKETS.map(b => ({ key: b.key, label: b.label, count: 0 })),
      killHitEffects: {},             // { [effectName]: count } — effects THEY fired on us
    };

    // First pass — accumulate scalars + per-opponent map + power-profile bins.
    const opMap = new Map();
    for (const v of records) {
      if (v.outcome.win)  { intel.wins++;       intel.koDelivered++; }
      if (v.outcome.loss) { intel.losses++;     intel.koTaken++; }
      if (v.iAm === 'attacker')      intel.asAttacker++;
      else if (v.iAm === 'defender') intel.asDefender++;
      if (v.respectDelta > 0) intel.respectGained += v.respectDelta;
      if (v.respectDelta < 0) intel.respectLost   += v.respectDelta;
      if (v.outcomeKey === 'hosp_them') intel.hospThem++;
      if (v.outcomeKey === 'hosp_me')   intel.hospMe++;
      if (v.iAm === 'defender' && v.outcome.loss) intel.defeatedMeCount++;

      // v0.6.42 — level profile. Bucket by 10-level groups (L20-29, L30-39…).
      // Per-fight rather than per-opponent so the histogram reflects "fights
      // we've had vs L40s" not just "unique L40 opponents."
      if (v.opponentLevel != null) {
        intel.levelSum += v.opponentLevel;
        intel.levelN++;
        if (intel.levelMin == null || v.opponentLevel < intel.levelMin) intel.levelMin = v.opponentLevel;
        if (intel.levelMax == null || v.opponentLevel > intel.levelMax) intel.levelMax = v.opponentLevel;
        const bucket = Math.floor(v.opponentLevel / 10) * 10;
        intel.levelBuckets[bucket] = (intel.levelBuckets[bucket] || 0) + 1;
      }

      // v0.6.42 — FF profile. Same brackets as the Difficulty Roadmap for
      // consistency. Direction-aware FF gotcha doesn't apply here: we just
      // want a "how stat-heavy is this faction" gauge — any FF datapoint
      // is fine because each is direction-anchored to whichever side
      // attacked. Average + bucketed histogram.
      if (typeof v.fairFight === 'number' && v.fairFight > 0) {
        intel.ffSum += v.fairFight;
        intel.ffN++;
        const idx = ROADMAP_BRACKETS.findIndex(b => b.match(v.fairFight));
        if (idx !== -1) intel.ffBuckets[idx].count++;
      }

      // v0.6.42 — kill-hit weapon attribution. Only count effects fired
      // ON us (we're the defender) so the panel reads as "what advanced
      // weapons does this faction use on us." finishingHitEffects names
      // already capitalize via the same path as Opponent Intel.
      if (v.iAm === 'defender' && Array.isArray(v.finishingHitEffects)) {
        for (const e of v.finishingHitEffects) {
          const name = String((e && e.name) || '').replace(/^./, c => c.toUpperCase());
          if (!name) continue;
          intel.killHitEffects[name] = (intel.killHitEffects[name] || 0) + 1;
        }
      }

      if (!v.opponentId) continue;
      let row = opMap.get(v.opponentId);
      if (!row) {
        row = {
          id: v.opponentId, name: v.opponentName || ('Player ' + v.opponentId),
          fights: 0, wins: 0, losses: 0, respect: 0, lastTs: 0,
        };
        opMap.set(v.opponentId, row);
      }
      row.fights++;
      if (v.outcome.win)  row.wins++;
      if (v.outcome.loss) row.losses++;
      row.respect += v.respectDelta;
      if (v.tsEnded > row.lastTs) row.lastTs = v.tsEnded;
    }
    intel.respectNet = intel.respectGained + intel.respectLost;
    intel.winRate    = intel.fights > 0 ? intel.wins / intel.fights : 0;
    intel.uniqueOpponentCount = opMap.size;
    intel.avgLevel     = intel.levelN > 0 ? intel.levelSum / intel.levelN : null;
    intel.avgFairFight = intel.ffN    > 0 ? intel.ffSum    / intel.ffN    : null;

    // Second pass — verdict mix. lookupOpponentSummary returns the same
    // verdict the Active-Page Banner would show, including STALE/UNKNOWN
    // for thin-data opponents. NO HISTORY can't happen here (we've
    // logged at least 1 fight by definition).
    for (const oppId of opMap.keys()) {
      const sum = lookupOpponentSummary(oppId);
      const key = (sum && sum.verdict) ? sum.verdict.key : 'nohist';
      intel.verdictMix[key] = (intel.verdictMix[key] || 0) + 1;
    }

    // Top opponents within the faction, sorted by fight count.
    intel.topOpponents = [...opMap.values()]
      .sort((a, b) => b.fights - a.fights)
      .slice(0, 8);

    return intel;
  }

  // Cheap summary for the Active-Page Banner (v0.6.24). Walks fights once
  // for the named opponent, returns enough to render the banner without
  // running the full computeOpponentIntel path on every render. Falls back
  // to a sentinel when we have no history yet so the banner can still
  // render a "NO HISTORY" tag — useful pre-war scouting signal in itself.
  //
  // v0.6.27 also captures `lastFairFight` from the most recent record that
  // carries `modifiers.fair_fight`. Torn's fair-fight modifier (1.0-3.0)
  // is the stat-differential ground truth — pairing it with the behavioral
  // verdict gives both "are they dangerous to me historically" and "can I
  // even close the stat gap" in one banner line. Older v1-era records may
  // not have the field; we just hold onto the latest one that does.
  //
  // v0.6.28: only capture FF from fights where YOU were the attacker. The
  // stored `modifiers.fair_fight` is direction-sensitive — it's the FF
  // from the attacker's perspective on that specific fight. When Marti
  // (1.6B stats) attacks you (1M), the API records FF 1.05 (Marti's
  // direction: free farm). When YOU attack Marti, FF would be ~3.00
  // (your direction: max). Showing Marti's-direction FF as "your FF"
  // reverses the signal. If we have no outgoing fight, we leave
  // lastFairFight null and the banner just omits FF — better than lying.
  function lookupOpponentSummary(opponentId) {
    if (!opponentId) return null;
    let name = null;
    let fightCount = 0;
    let lastTs = 0;
    let lastFairFight = null;
    function trackLatest(raw) {
      const ts = raw.timestamp_ended || 0;
      const youWereAttacker = !!(meta.userId && raw.attacker_id === meta.userId);
      if (ts > lastTs) {
        lastTs = ts;
        // Only overwrite FF when this newer record is YOUR-direction AND
        // actually has the field. An incoming-newer-than-outgoing fight
        // leaves the existing outgoing FF intact (handled by the else-if).
        if (youWereAttacker
            && raw.modifiers && typeof raw.modifiers.fair_fight === 'number') {
          lastFairFight = raw.modifiers.fair_fight;
        }
      } else if (lastFairFight == null && youWereAttacker
                 && raw.modifiers && typeof raw.modifiers.fair_fight === 'number') {
        // Newest record isn't outgoing — fall back to any older outgoing
        // FF we find. Direction discipline preserved either way.
        lastFairFight = raw.modifiers.fair_fight;
      }
    }
    for (const code in fights) {
      const raw = fights[code];
      if (raw.attacker_id === opponentId) {
        name = name || raw.attacker_name || null;
        fightCount++;
        trackLatest(raw);
      } else if (raw.defender_id === opponentId) {
        name = name || raw.defender_name || null;
        fightCount++;
        trackLatest(raw);
      }
    }
    if (fightCount === 0) {
      return { id: opponentId, name: null, fightCount: 0, lastTs: 0,
               lastFairFight: null, verdict: null };
    }
    const intel = computeOpponentIntel(opponentId);
    return {
      id: opponentId,
      name: name || (intel && intel.name) || null,
      fightCount,
      lastTs,
      lastFairFight,
      verdict: intel ? intel.verdict : null,
    };
  }

  // Leveling Trap Detector v0.1 — vision feature #4. Reads opponent levels
  // from v2 attack records to answer: "Are you being farmed by players
  // significantly above your level?" Returns { ready: false, ... } when
  // there isn't enough signal yet (need ≥3 incoming fights carrying
  // attacker_level — i.e., non-stealthed, post-v0.3.0 records).
  // Threshold of "farm target" = opponent ≥10 levels above. That number is
  // a starting heuristic, not a calibrated value — refine once we have more
  // data across multiple users.
  // Build Coherence Checker (feature #3, v0.1).
  // Input: cached battleStats + selected build goal key.
  // Output: { ready, goal, distribution[], gaps[], violations[], distanceL1,
  //           verdict: { key, label, className }, topAction }.
  // Verdict ladder per archetype thresholds:
  //   ALIGNED   — distance ≤ alignedMaxL1 AND no rule violations
  //   DRIFTING  — distance ≤ driftMaxL1 OR one violation
  //   OFF-BUILD — anything worse
  //   UNSET     — no goal picked (caller decides whether to render a hint)
  //   WAITING   — goal picked but no stats yet
  // Grinder is intentionally always ALIGNED (no shape requirement).
  function computeBuildCoherence(stats, goalKey, level) {
    if (!goalKey || !BUILD_GOALS[goalKey]) {
      return { ready: false, verdict: { key: 'unset', label: 'UNSET', className: 'unset' } };
    }
    const goal = BUILD_GOALS[goalKey];
    if (!stats || !stats.total) {
      return { ready: false, goal, verdict: { key: 'waiting', label: 'WAITING', className: 'unset' } };
    }

    const stats4 = ['strength','defense','speed','dexterity'];
    const distribution = stats4.map(k => ({
      key:    k,
      label:  k.charAt(0).toUpperCase() + k.slice(1),
      raw:    stats[k],
      share:  stats[k] / stats.total,
      target: goal.targetShares ? (goal.targetShares[k] || 0) : null,
    }));

    let distanceL1 = 0;
    if (goal.targetShares) {
      for (const d of distribution) distanceL1 += Math.abs(d.share - d.target);
    }

    const violations = [];
    for (const rule of goal.rules) {
      try { if (!rule.check(stats)) violations.push(rule.msg); }
      catch { /* malformed rule — ignore */ }
    }

    // Verdict
    let verdict;
    if (goalKey === 'grinder') {
      verdict = { key: 'aligned', label: 'ALIGNED', className: 'aligned' };
    } else if (distanceL1 <= goal.alignedMaxL1 && violations.length === 0) {
      verdict = { key: 'aligned', label: 'ALIGNED', className: 'aligned' };
    } else if (distanceL1 <= goal.driftMaxL1 || violations.length === 1) {
      verdict = { key: 'drift', label: 'DRIFTING', className: 'drift' };
    } else {
      verdict = { key: 'off', label: 'OFF-BUILD', className: 'off' };
    }

    // Top action: pick the stat with the largest signed gap. Negative gap →
    // under-target ("train more"). Positive → over-target ("ease off").
    let topAction = null;
    if (goal.targetShares) {
      const gaps = distribution.map(d => ({ ...d, gap: d.share - d.target }));
      gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
      const worst = gaps[0];
      if (Math.abs(worst.gap) >= 0.04) {
        const dir = worst.gap < 0 ? 'increase' : 'reduce focus on';
        topAction = `${dir} ${worst.label} — currently ${(worst.share * 100).toFixed(0)}%, target ${(worst.target * 100).toFixed(0)}%`;
      }
    }

    // Sim outlook (TEST v0.4 phase 1) — does this SHAPE actually fight? Run
    // 500 trials vs a 25/25/25/25 reference opponent at the same total + level,
    // naked vs naked, so we isolate shape from equipment and stat mass.
    // Failure is non-fatal — UI just hides the line.
    let simOutlook = null;
    if (stats.total > 0) {
      try {
        const evenSplit = Math.round(stats.total / 4);
        const refBalanced = {
          strength: evenSplit, defense: evenSplit, speed: evenSplit, dexterity: evenSplit,
        };
        const lv = level || TEST_DEFAULTS.defaultLevel;
        const sim = testSimulate(stats, refBalanced, { trials: 500, rngSeed: 1, level: lv });
        simOutlook = { vsBalanced: sim.winRateA, level: lv, calibration: sim.calibration };
      } catch (e) { /* leave simOutlook null */ }
    }

    // v0.7 Phase 3 — soft score (0-100) + 5-dot confidence visual.
    // Supplementary to the existing ALIGNED/DRIFTING/OFF verdict — the
    // pill keeps its color theming, the dots give a more granular read.
    // Grinder = always 100 (no shape requirement). Otherwise: start at
    // 100, subtract distanceL1 * 100 (so 20% L1 distance → 80), then
    // subtract 10 per rule violation. Floor at 0.
    let statScore = 100;
    if (goalKey !== 'grinder' && goal.targetShares) {
      statScore = Math.max(0, Math.round(100 - distanceL1 * 100 - violations.length * 10));
    }
    const statDots = scoreToDots(statScore);

    return { ready: true, goal, distribution, distanceL1, violations, verdict, topAction, simOutlook, statScore, statDots };
  }

  // ─── LOADOUT FAMILY DETECTOR (v0.7 Phase 2) ─────────────────────────────
  // Walks the four weapon slots (primary, secondary, melee, temporary),
  // reads each item's `bonuses` array, and tallies per-family scores. The
  // family with the highest total bonus-value wins; ties broken by count.
  // Returns null when no recognized bonuses are equipped (vanilla loadout).
  //
  // Scoring uses raw bonus value (the % the bonus rolls — Bleed 45, Poisoned
  // 95, etc.) because higher-rolled bonuses represent more commitment to
  // that effect. A weapon with a strong Bleed roll dominates the family
  // signal over a weapon with a weak Plunder roll.
  //
  // `evidence` lists the contributing bonus + weapon pairs for the dominant
  // family so the UI can show "DoT loadout — Bleed (Bread Knife), Poisoned
  // (Blowgun)" instead of just the family name.
  function computeLoadoutFamily(equipment) {
    if (!equipment || !equipment.fetchedAt) return null;
    const WEAPON_SLOTS = ['primary', 'secondary', 'melee', 'temporary'];
    const tallies = {};
    let totalValue = 0;
    let totalCount = 0;
    for (const slot of WEAPON_SLOTS) {
      const item = equipment[slot];
      if (!item || !Array.isArray(item.bonuses)) continue;
      for (const b of item.bonuses) {
        if (!b) continue;
        // v0.6.79 — Torn's /v2/user/equipment uses `title` for the bonus
        // name (verified against user's payload showing Specialist/
        // Powerful/Empower with id+title+description+value fields).
        // Defensive fallback to `name` in case Torn ever renames it.
        const bonusName = b.title || b.name;
        if (!bonusName) continue;
        const family = WEAPON_BONUS_FAMILIES[bonusName];
        if (!family) continue;
        const value = typeof b.value === 'number' ? b.value : 1;
        if (!tallies[family]) tallies[family] = { count: 0, value: 0, evidence: [] };
        tallies[family].count += 1;
        tallies[family].value += value;
        tallies[family].evidence.push({ bonus: bonusName, weapon: item.name, value });
        totalValue += value;
        totalCount += 1;
      }
    }
    if (totalCount === 0) return null;
    // Pick dominant family by total value; count as tiebreak.
    let dominantKey = null, dominant = null;
    for (const key in tallies) {
      const t = tallies[key];
      if (!dominant
          || t.value > dominant.value
          || (t.value === dominant.value && t.count > dominant.count)) {
        dominant = t;
        dominantKey = key;
      }
    }
    const share = dominant.value / totalValue;
    return {
      dominantKey,
      dominantLabel: LOADOUT_FAMILY_LABELS[dominantKey] || dominantKey,
      share,
      evidence: dominant.evidence,
      tallies,
      totalCount,
    };
  }

  // ─── LOADOUT COHERENCE (v0.7 Phase 3) ───────────────────────────────────
  // Second axis of the 2-axis Build Verdict. Layers on top of
  // computeLoadoutFamily by adding:
  //   - loadoutScore (0-100): how concentrated the loadout is in its
  //     dominant family. 100 = single-family pure (every bonus same
  //     family); lower = scattered across multiple families.
  //   - allShares: every family with non-zero contribution, sorted by
  //     value share descending. Drives the "Family breakdown: X 65% ·
  //     Y 25% · Z 10%" line so the user sees the full distribution.
  //   - expected match: compares the dominant family to
  //     STAT_TO_EXPECTED_FAMILY[goalKey] to detect goal/loadout mismatch.
  //   - mismatchHint: actionable note when the user's loadout doesn't
  //     match their stat-shape goal ("Switch to Tank for DoT Dan, or
  //     swap to Pure damage weapons for Powerhouse Paul").
  // Returns { ready: false, reason: 'vanilla' } when no recognized
  // bonuses are equipped — caller skips the entire Loadout alignment
  // section rather than printing a meaningless verdict.
  function computeLoadoutCoherence(equipment, goalKey) {
    const family = computeLoadoutFamily(equipment);
    if (!family) {
      return { ready: false, reason: 'vanilla' };
    }
    const loadoutScore = Math.round(family.share * 100);
    const loadoutDots = scoreToDots(loadoutScore);
    // Build sorted family breakdown across ALL contributing families.
    let grandTotal = 0;
    for (const k in family.tallies) grandTotal += family.tallies[k].value;
    const allShares = [];
    for (const k in family.tallies) {
      allShares.push({
        key: k,
        label: LOADOUT_FAMILY_LABELS[k] || k,
        share: grandTotal > 0 ? family.tallies[k].value / grandTotal : 0,
        value: family.tallies[k].value,
        count: family.tallies[k].count,
      });
    }
    allShares.sort(function (a, b) { return b.share - a.share; });
    // v0.6.82 — direct-archetype-match check. Replaces the v0.6.81 rigid
    // "expects family X" check now that ARCHETYPES has 10 specific
    // (goalKey, familyKey) entries. A match means a specific archetype
    // exists for the user's (goal, family) combo — not "your loadout
    // matches the goal's canonical expected family." Self-buff still
    // matches anything via the wildcard.
    const expectedFamily = STAT_TO_EXPECTED_FAMILY[goalKey] || null;
    const expectedLabel = expectedFamily ? (LOADOUT_FAMILY_LABELS[expectedFamily] || expectedFamily) : null;
    const directKey = goalKey + ':' + family.dominantKey;
    const directMatch = ARCHETYPES[directKey];
    let matchesExpected = null;   // null = no expectation (grinder, no goal, self-buff)
    if (family.dominantKey === 'self_buff') matchesExpected = null;
    else if (!goalKey || goalKey === 'grinder') matchesExpected = null;
    else matchesExpected = !!directMatch;

    let mismatchHint = null;
    if (matchesExpected === false) {
      const goalLabel = (BUILD_GOALS[goalKey] && BUILD_GOALS[goalKey].label) || goalKey;
      // Two alternative paths to offer:
      //   1. Swap weapons: keep the goal, change to the goal's canonical
      //      expected family (if it has a named archetype).
      //   2. Swap goal: keep the loadout, switch to a stat-shape goal
      //      whose archetype DOES match the user's actual dominant family.
      const canonArch = expectedFamily ? ARCHETYPES[goalKey + ':' + expectedFamily] : null;
      const canonResolved = canonArch
        ? { name: pickArchetypeName(canonArch) }
        : null;
      // Find ANY goalKey whose direct archetype matches the user's family.
      let altGoalKey = null, altArch = null;
      for (const gk in BUILD_GOALS) {
        if (gk === goalKey) continue;
        const cand = ARCHETYPES[gk + ':' + family.dominantKey];
        if (cand) { altGoalKey = gk; altArch = cand; break; }
      }
      const altGoalLabel = altGoalKey && BUILD_GOALS[altGoalKey] ? BUILD_GOALS[altGoalKey].label : null;
      const altResolved = altArch ? { name: pickArchetypeName(altArch) } : null;
      const parts = [goalLabel + ' doesn\'t have a specific archetype for '
                   + family.dominantLabel + ' loadouts.'];
      if (canonResolved && expectedLabel) {
        parts.push('Swap to ' + expectedLabel + ' weapons for ' + canonResolved.name + '.');
      }
      if (altResolved && altGoalLabel) {
        parts.push((canonResolved ? 'Or switch ' : 'Switch ')
                 + 'goal to ' + altGoalLabel + ' for ' + altResolved.name + '.');
      }
      mismatchHint = parts.join(' ');
    }
    return {
      ready: true,
      loadoutScore,
      loadoutDots,
      dominantKey: family.dominantKey,
      dominantLabel: family.dominantLabel,
      dominantShare: family.share,
      allShares,
      expectedFamily,
      expectedLabel,
      matchesExpected,
      mismatchHint,
    };
  }

  const LEVEL_TRAP_GAP = 10;
  function computeLevelTrap(views) {
    let myLevel = null;
    let myLevelTs = 0;
    const incomingLevels = [];
    // Outcome gate: among high-level (>= myLevel + GAP) incoming attacks,
    // how many did we actually LOSE? Stat-builders get attacked by chainers
    // 10+ levels above but win on raw stats — that's not being farmed.
    // Wait to compute these until myLevel is known.
    for (const v of views) {
      const mine = v.iAm === 'attacker' ? v.attackerLevel
                 : v.iAm === 'defender' ? v.defenderLevel
                 : null;
      if (mine != null && v.tsEnded > myLevelTs) {
        myLevel = mine;
        myLevelTs = v.tsEnded;
      }
      if (v.iAm === 'defender' && v.attackerLevel != null) {
        incomingLevels.push(v.attackerLevel);
      }
    }
    if (incomingLevels.length < 3 || myLevel == null) {
      return { ready: false, incomingCount: incomingLevels.length, myLevel };
    }
    const mean = incomingLevels.reduce((a, b) => a + b, 0) / incomingLevels.length;
    const max  = Math.max(...incomingLevels);
    const farmCount = incomingLevels.filter(l => l >= myLevel + LEVEL_TRAP_GAP).length;
    const farmRate  = farmCount / incomingLevels.length;

    // Second pass: tally win/loss on the high-level subset only.
    let farmWins = 0, farmLosses = 0;
    for (const v of views) {
      if (v.iAm !== 'defender') continue;
      if (v.attackerLevel == null) continue;
      if (v.attackerLevel < myLevel + LEVEL_TRAP_GAP) continue;
      if (v.outcome.win)  farmWins++;
      if (v.outcome.loss) farmLosses++;
    }
    const farmDecided  = farmWins + farmLosses;
    const farmLossRate = farmDecided > 0 ? farmLosses / farmDecided : 0;

    let verdict, severity;
    if (farmRate >= 0.4 && farmDecided >= 3) {
      // Enough high-level samples to judge outcome.
      if (farmLossRate >= 0.5) { verdict = 'FARM TARGET';  severity = 'bad';  }
      else                     { verdict = 'OUT-STATTING'; severity = 'good'; }
    } else if (farmRate >= 0.4) {
      // High ratio, but too few decided outcomes to call it.
      verdict = 'WATCH'; severity = 'warn';
    } else if (farmRate >= 0.2) {
      verdict = 'WATCH'; severity = 'warn';
    } else {
      verdict = 'NORMAL'; severity = 'good';
    }
    return {
      ready: true,
      myLevel,
      incomingCount: incomingLevels.length,
      avgIncomingLevel: mean,
      maxIncomingLevel: max,
      farmCount,
      farmRate,
      farmWins,
      farmLosses,
      farmDecided,
      farmLossRate,
      farmThreshold: myLevel + LEVEL_TRAP_GAP,
      verdict,
      severity,
    };
  }

  // Leveling Roadmap v0.1 — vision feature #9. Flip side of the Leveling
  // Trap detector: where YOU are the predator. Buckets your *outgoing*
  // fights by opponent-relative-level (e.g. -10, ±5, +10, +20+) and reports
  // win rate, avg respect/fight, and hospitalisation rate per bucket. Labels
  // brackets PRIME / SAFE / CONTESTED / AVOID so you can see at a glance
  // where to hunt. Outgoing only — incoming attacks are about who picks
  // you, not who you pick. Window-scoped so it tracks current form, not
  // year-old habits.
  // Bracket labelling thresholds (starting heuristics, not calibrated):
  //   PRIME     — winRate ≥ 70% AND fights ≥ 3 AND avgRespect ≥ 1.5
  //   SAFE      — winRate ≥ 70% AND fights ≥ 3 (low respect → grind not hunt)
  //   CONTESTED — winRate 40–70%
  //   AVOID     — winRate < 40%
  //   THIN      — fewer than 3 fights — not enough signal
  // v0.6.9 pivot: buckets are fair_fight ranges, not level gaps. fair_fight is
  // Torn's published difficulty multiplier (1.0–3.0), derived directly from
  // the stat differential — works identically for stat-builders, who break the
  // level-relative model. Bracket cutoffs are starting heuristics:
  //   FF ≤ 1.05 → opponent has ≤~25% your stats (free farm, low respect)
  //   FF 1.05–1.50 → clearly weaker
  //   FF 1.50–2.20 → comparable
  //   FF 2.20–2.85 → stronger
  //   FF ≥ 2.85   → saturated cap (opponent at-or-above your stats; max respect)
  const ROADMAP_BRACKETS = [
    { key: 'free',  label: 'Free (FF ≤ 1.05)',     match: (ff) => ff <= 1.05 },
    { key: 'easy',  label: 'Easy (FF 1.05–1.50)',  match: (ff) => ff >  1.05 && ff <= 1.50 },
    { key: 'even',  label: 'Even (FF 1.50–2.20)',  match: (ff) => ff >  1.50 && ff <= 2.20 },
    { key: 'hard',  label: 'Hard (FF 2.20–2.85)',  match: (ff) => ff >  2.20 && ff <= 2.85 },
    { key: 'max',   label: 'Max (FF ≥ 2.85)',      match: (ff) => ff >  2.85 },
  ];
  function computeLevelingRoadmap(views) {
    // Track my latest known level for the header line (informational only;
    // bracketing no longer depends on it).
    let myLevel = null;
    let myLevelTs = 0;
    for (const v of views) {
      const mine = v.iAm === 'attacker' ? v.attackerLevel
                 : v.iAm === 'defender' ? v.defenderLevel
                 : null;
      if (mine != null && v.tsEnded > myLevelTs) {
        myLevel = mine;
        myLevelTs = v.tsEnded;
      }
    }

    // Bucket outgoing fights only, by fair_fight modifier.
    const buckets = ROADMAP_BRACKETS.map(b => ({
      key: b.key, label: b.label,
      fights: 0, wins: 0, losses: 0,
      respect: 0, hospOpp: 0, hospMe: 0,
    }));
    let outgoingTotal = 0;
    for (const v of views) {
      if (v.iAm !== 'attacker') continue;
      if (typeof v.fairFight !== 'number' || v.fairFight <= 0) continue;
      const idx = ROADMAP_BRACKETS.findIndex(b => b.match(v.fairFight));
      if (idx === -1) continue;
      const b = buckets[idx];
      b.fights++;
      outgoingTotal++;
      if (v.outcome.win)  b.wins++;
      if (v.outcome.loss) b.losses++;
      b.respect += v.respectDelta || 0;
      if (v.outcomeKey === 'hosp_them') b.hospOpp++;
    }

    if (outgoingTotal < 5) {
      return { ready: false, reason: 'thin-data', myLevel, outgoingTotal };
    }

    // Derive per-bucket metrics + label.
    const enriched = buckets.map(b => {
      if (b.fights === 0) {
        return { ...b, winRate: 0, respectPerFight: 0, label2: 'THIN', severity: 'none', empty: true };
      }
      const winRate = b.wins / b.fights;
      const respectPerFight = b.respect / b.fights;
      let label2, severity;
      if (b.fights < 3) {
        label2 = 'THIN'; severity = 'none';
      } else if (winRate >= 0.7 && respectPerFight >= 1.5) {
        label2 = 'PRIME'; severity = 'prime';
      } else if (winRate >= 0.7) {
        label2 = 'SAFE'; severity = 'safe';
      } else if (winRate >= 0.4) {
        label2 = 'CONTESTED'; severity = 'contested';
      } else {
        label2 = 'AVOID'; severity = 'avoid';
      }
      return { ...b, winRate, respectPerFight, label2, severity, empty: false };
    });

    // Headline recommendation: pick the highest avg-respect bucket with
    // winRate ≥ 70% and ≥3 fights. If none, fall back to highest-winRate
    // qualifying bucket. If none qualify, say so.
    const qualifying = enriched.filter(b => b.fights >= 3 && b.winRate >= 0.7);
    let headline = null;
    if (qualifying.length > 0) {
      qualifying.sort((a, b) => (b.respectPerFight - a.respectPerFight) || (b.winRate - a.winRate));
      const top = qualifying[0];
      headline = {
        bracket: top.label,
        text: `Best returns: ${top.label} — ${(top.winRate * 100).toFixed(0)}% win rate over ${top.fights} attempts (${fmtNum(top.respectPerFight, 2)} respect/fight).`,
      };
    } else {
      const best = enriched.filter(b => b.fights >= 3).sort((a, b) => b.winRate - a.winRate)[0];
      headline = best
        ? { bracket: best.label, text: `No dominant hunting bracket yet. Best so far: ${best.label} at ${(best.winRate * 100).toFixed(0)}% over ${best.fights} attempts. Keep sampling.` }
        : { bracket: null, text: 'No bracket has enough data to recommend. Attack a wider spread of opponents.' };
    }

    // Avoid list: any AVOID bucket with ≥3 fights.
    const avoid = enriched.filter(b => b.severity === 'avoid');

    return {
      ready: true,
      myLevel,
      outgoingTotal,
      buckets: enriched,
      headline,
      avoid,
    };
  }

  // v0.6.64 — Personal Weapon Performance. Aggregates the DOM-hook per-hit
  // events captured on the attack page (the only place per-hit damage and
  // weapon name exist; the v2 attacks API gives end-of-fight summary only).
  // Filters to direction === 'out' so we count YOUR hits, not the opponent's.
  // Buckets by weapon string verbatim from the combat log (no normalisation —
  // Torn's log spelling IS the canonical name for our purposes). 'fist' kind
  // is synthesised as "Bare Fists" since the log never names a weapon there.
  // Terminal kinds (hospitalize / mug / leave / coma / loot / stalemate /
  // escape) and 'init' / 'unknown' are excluded — they represent fight-level
  // outcomes, not weapon hits.
  function computeWeaponPerformance(views) {
    const stats = {};
    let totalEvents = 0;
    let fightsWithDom = 0;

    for (const v of views) {
      if (!v.dom || !Array.isArray(v.dom.events)) continue;
      fightsWithDom++;
      for (const ev of v.dom.events) {
        if (ev.direction !== 'out') continue;
        if (ev.kind === 'init' || ev.kind === 'unknown') continue;
        if (DOM_TERMINAL_KINDS.has(ev.kind)) continue;
        let name;
        if (ev.kind === 'fist') name = 'Bare Fists';
        else if (ev.weapon) name = String(ev.weapon).trim();
        else continue;

        let s = stats[name];
        if (!s) {
          s = stats[name] = {
            name, kind: ev.kind,
            hits: 0, damageTotal: 0, damageMax: 0, damageHits: 0,
            roundsTotal: 0, roundsCount: 0,
            bodyParts: {},
            opponentIds: new Set(),
            lastUsedTs: 0,
          };
        }
        s.hits++;
        totalEvents++;
        if (typeof ev.damage === 'number' && ev.damage > 0) {
          s.damageTotal += ev.damage;
          s.damageHits++;
          if (ev.damage > s.damageMax) s.damageMax = ev.damage;
        }
        if (typeof ev.rounds === 'number' && ev.rounds > 0) {
          s.roundsTotal += ev.rounds;
          s.roundsCount++;
        }
        if (ev.bodyPart) {
          const bp = String(ev.bodyPart).trim();
          s.bodyParts[bp] = (s.bodyParts[bp] || 0) + 1;
        }
        if (v.opponentId) s.opponentIds.add(v.opponentId);
        if (ev.ts && ev.ts > s.lastUsedTs) s.lastUsedTs = ev.ts;
      }
    }

    if (totalEvents === 0) {
      return {
        ready: false,
        reason: fightsWithDom === 0 ? 'no-dom-fights' : 'no-out-events',
        fightsWithDom,
      };
    }

    const weapons = Object.values(stats).map(function (s) {
      const avgDamage = s.damageHits > 0 ? s.damageTotal / s.damageHits : 0;
      const avgRounds = s.roundsCount > 0 ? s.roundsTotal / s.roundsCount : 0;
      let topBodyPart = null, topCount = 0;
      for (const bp in s.bodyParts) {
        if (s.bodyParts[bp] > topCount) { topBodyPart = bp; topCount = s.bodyParts[bp]; }
      }
      return {
        name: s.name,
        kind: s.kind,
        hits: s.hits,
        damageTotal: s.damageTotal,
        damageMax: s.damageMax,
        damageHits: s.damageHits,
        avgDamage,
        avgRounds,
        fightsUsed: s.opponentIds.size,
        topBodyPart,
        topBodyPartCount: topCount,
        lastUsedTs: s.lastUsedTs,
      };
    });
    weapons.sort(function (a, b) { return b.damageTotal - a.damageTotal; });

    let totalDamage = 0;
    for (const w of weapons) totalDamage += w.damageTotal;

    return {
      ready: true,
      fightsWithDom,
      totalEvents,
      totalDamage,
      weapons,
    };
  }

  // v0.6.66 — Incoming Activity. Defender-side counterpart to Personal
  // Weapon Performance: surfaces patterns from fights where YOU were the
  // defender. Two questions answered:
  //   1. WHEN do you get hit? — 24-bucket hour-of-day histogram so you can
  //      time hospital/jail/abroad to dodge peak attack hours.
  //   2. WHO keeps coming back? — top recurring attackers across the
  //      window, sorted by hit count.
  // Hours bucket by LOCAL timezone — most users mentally track "when do I
  // get hit" in local time. Stealthed attacks count for hour patterns
  // (the timing data is still valid) but are excluded from the persistent-
  // attackers list since opponentId/name are anonymous on stealthed hits.
  function computeIncomingActivity(views) {
    let totalIncoming = 0;
    const hourBuckets = new Array(24).fill(0);
    const attackerMap = new Map();
    let winsAsDefender = 0, lossesAsDefender = 0;

    for (const v of views) {
      if (v.iAm !== 'defender') continue;
      totalIncoming++;

      const ts = v.tsStarted || v.tsEnded;
      if (ts) {
        const d = new Date(ts * 1000);
        hourBuckets[d.getHours()]++;
      }

      if (v.outcome.win)  winsAsDefender++;
      if (v.outcome.loss) lossesAsDefender++;

      if (v.opponentId && !v.stealthed) {
        let row = attackerMap.get(v.opponentId);
        if (!row) {
          row = {
            id: v.opponentId,
            name: v.opponentName || ('Player ' + v.opponentId),
            level: v.attackerLevel,
            count: 0, wins: 0, losses: 0,
            lastTs: 0,
          };
          attackerMap.set(v.opponentId, row);
        }
        row.count++;
        if (v.outcome.win)  row.wins++;
        if (v.outcome.loss) row.losses++;
        if (v.tsEnded > row.lastTs) row.lastTs = v.tsEnded;
        if (v.attackerLevel != null) row.level = v.attackerLevel;
      }
    }

    if (totalIncoming < 3) {
      return { ready: false, reason: 'thin-data', totalIncoming };
    }

    // Peak hour — ties resolved by earliest hour (first index hit).
    let peakHour = 0, peakCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourBuckets[h] > peakCount) {
        peakHour = h;
        peakCount = hourBuckets[h];
      }
    }

    // Persistent: opponents who attacked you ≥2 times in the window.
    // Sorted by hit count desc, capped at 5 so the card stays compact.
    const persistent = Array.from(attackerMap.values())
      .filter(function (r) { return r.count >= 2; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 5);

    const defenseRate = (winsAsDefender + lossesAsDefender) > 0
      ? winsAsDefender / (winsAsDefender + lossesAsDefender)
      : null;

    return {
      ready: true,
      totalIncoming,
      hourBuckets,
      peakHour,
      peakCount,
      persistent,
      winsAsDefender,
      lossesAsDefender,
      defenseRate,
    };
  }

  // v0.6.67 — Weekly Digest. Bucketed week-over-week comparison: last 7
  // days vs the 7 days before that. Independent of the window pill so the
  // user always gets a fixed "what changed this week" read regardless of
  // which pill they're on (24H / 7D / 30D / All / WAR).
  //
  // Each metric carries a "betterDirection" hint that the render layer uses
  // to colour the delta (green=better, red=worse, grey=neutral). That logic
  // lives here so the UI doesn't have to know about combat semantics:
  //   fights        → neutral (more activity isn't intrinsically better)
  //   winRate       → up
  //   respectNet    → up
  //   incoming      → down (less heat = better)
  //   hospThem      → up
  //   hospMe        → down
  //   avgAtkLevel   → down (higher-level attackers = bigger threat)
  function computeWeeklyDigest() {
    if (!meta.userId) return { ready: false, reason: 'no-user' };

    const now = nowSec();
    const day = 86400;
    const thisStart = now - 7  * day;
    const lastStart = now - 14 * day;
    const lastEnd   = now - 7  * day;

    function bucket(startTs, endTs) {
      const s = {
        total: 0, attCount: 0, defCount: 0,
        wins: 0, losses: 0,
        respectGain: 0, respectLoss: 0,
        hospThem: 0, hospMe: 0,
        koThem: 0, koMe: 0,
        attackerLevelSum: 0, attackerLevelN: 0,
      };
      for (const code in fights) {
        const raw = fights[code];
        const ts = raw.timestamp_ended || 0;
        if (ts < startTs || ts >= endTs) continue;
        const v = deriveFightView(raw, meta.userId);
        if (!v.iAm) continue;
        s.total++;
        if (v.iAm === 'attacker') s.attCount++;
        else                       s.defCount++;
        if (v.outcome.win)  s.wins++;
        if (v.outcome.loss) s.losses++;
        if (v.iAm === 'attacker' && v.outcome.win)  s.koThem++;
        if (v.iAm === 'defender' && v.outcome.loss) s.koMe++;
        if (v.outcomeKey === 'hosp_them') s.hospThem++;
        if (v.outcomeKey === 'hosp_me')   s.hospMe++;
        if (v.respectDelta > 0) s.respectGain += v.respectDelta;
        if (v.respectDelta < 0) s.respectLoss += v.respectDelta;
        if (v.iAm === 'defender' && v.attackerLevel != null) {
          s.attackerLevelSum += v.attackerLevel;
          s.attackerLevelN++;
        }
      }
      s.winRate = s.total > 0 ? s.wins / s.total : null;
      s.respectNet = s.respectGain + s.respectLoss;
      s.avgAttackerLevel = s.attackerLevelN > 0
        ? s.attackerLevelSum / s.attackerLevelN
        : null;
      return s;
    }

    const thisWeek = bucket(thisStart, now);
    const lastWeek = bucket(lastStart, lastEnd);

    if (thisWeek.total === 0 && lastWeek.total === 0) {
      return { ready: false, reason: 'no-data', thisWeek, lastWeek };
    }

    return { ready: true, thisWeek, lastWeek };
  }

  // ─── EXPORT / IMPORT ────────────────────────────────────────────────────
  function exportFights() {
    // v0.6.49 — include the live dom_buffer in exports so unmerged DOM events
    // (fights whose v2 record hasn't shown up yet, or whose start-time fell
    // outside the ±10min merge window) still ship with the dump. That's
    // currently the only way to surface raw DOM samples for regex tuning.
    const payload = {
      script: SCRIPT_NAME,
      version: SCRIPT_VERSION,
      exportedAt: new Date().toISOString(),
      userId: meta.userId,
      userName: meta.userName,
      fightCount: Object.keys(fights).length,
      fights,
      domBuffer: loadDomBuffer(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tech-fights-${meta.userName || 'export'}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearAllData() {
    fights = {};
    meta = {
      userId: meta.userId, userName: meta.userName,
      firstPollTs: 0, lastPollTs: 0, lastSuccessfulPollTs: 0,
      lastFightTs: 0, lastError: null,
      totalPollCount: 0, totalIngestedCount: 0,
    };
    store('fights', fights);
    store('meta', meta);
  }

  // ─── TEST: SIMULATION ENGINE v0.1 ───────────────────────────────────────
  // Pure stats-only mock-battle simulator. Vladar-derived damage formula,
  // generic-weapon damage stub, no armor. Outputs a win-rate distribution
  // over N Monte-Carlo trials. v0.2+ layers in weapon classes and armor.
  // Per project-test-simulation-concept memory: hybrid (formula first,
  // captured-fight calibration later); v0.1 ships formula-only and labels
  // its output as such so users read confidence directly.
  //
  // All functions here are pure (no GM_storage, no DOM, no network) so the
  // menu-command harness can validate them in isolation before any UI lands.

  const TEST_DEFAULTS = {
    // HP model lives in testHpForLevel() — wiki piecewise (25/50/75) as of
    // v0.6.22. Previously linear (250 + level*50); that overstated HP by
    // ~20% at L29 which biased AVG TURNS and KO rates downward.
    defaultLevel: 29,
    weaponDmg: 50,       // stat-only baseline (resolved when class='generic')
    maxTurns: 10,        // Torn caps an attack sequence at 10 turns
    damageJitter: 0.20,  // +/-20% per-hit variance
  };

  // TEST v0.4 — per-class damage + accuracy, both derived from per-weapon
  // wiki midpoint averages. v0.6.16 set the first damage pass; v0.6.19 split
  // melee into four buckets (light/medium/heavy/elite) since melee spans a
  // much wider damage range than firearms — Slingshot (~17) up to dual
  // samurai (~70+). v0.6.20 retunes damage in lockstep with the new acc
  // column so every number now traces back to one consistent methodology:
  //   1) take low+high of each wiki weapon, midpoint per weapon
  //   2) average those midpoints across all weapons assigned to the class
  //   3) exclude dual-wielded, holiday/event drops, "Loot X" NPC drops,
  //      Old Mission System, Duke missions, Bug Bounty, Coming Soon, and
  //      joke weapons (dmg mid < 10).
  // Full source tables + exclusion rationale live in memory/
  // reference_torn_wiki_weapons.md. Single-strike-per-turn still applies.
  //   dmg = value plugged into testDamage's (weapon / 50) term, so 50 is
  //         the stat-only baseline.
  //   acc = wiki accuracy midpoint, plugged into testHitChance as a
  //         (acc - 50) * 0.01 additive bias on top of the Spd/Dex ratio.
  //         So 50 = neutral, 70 = +20% hit bias, 25 = -25% (clamped to 10%).
  const WEAPON_CLASSES = {
    generic:      { label: 'Generic (stat-only)', dmg: 50, acc: 50 },
    pistol:       { label: 'Pistol',              dmg: 44, acc: 52 },
    smg:          { label: 'SMG',                 dmg: 51, acc: 51 },
    rifle:        { label: 'Rifle',               dmg: 63, acc: 54 },
    shotgun:      { label: 'Shotgun',             dmg: 54, acc: 57 },
    melee_light:  { label: 'Melee (Light)',       dmg: 18, acc: 55 },
    melee_medium: { label: 'Melee (Medium)',      dmg: 30, acc: 55 },
    melee_heavy:  { label: 'Melee (Heavy)',       dmg: 51, acc: 57 },
    melee_elite:  { label: 'Melee (Elite)',       dmg: 66, acc: 50 },
    heavy:        { label: 'Heavy',               dmg: 74, acc: 40 },
  };
  const WEAPON_CLASS_ORDER = ['generic', 'pistol', 'smg', 'rifle', 'shotgun', 'melee_light', 'melee_medium', 'melee_heavy', 'melee_elite', 'heavy'];

  // v0.6.65 — Per-weapon damage + accuracy table for the TEST sim's
  // named-weapon picker. Wiki data from reference-torn-wiki-weapons memory,
  // captured 2026-05-26 from in-game tables. Each row is the wiki LOW + HIGH
  // for damage and accuracy; midpoints get computed at lookup time.
  // Compact array shape: [id, label, class, dmgLow, dmgHigh, accLow, accHigh].
  //
  // Class mapping rules:
  //   Primary → rifle / smg / shotgun / heavy (Machine Gun + Heavy Artillery)
  //   Secondary → pistol / smg / shotgun / heavy (Heavy Artillery)
  //     Secondary slot piercing/clubbing/mechanical (Blowgun, Crossbow,
  //     Slingshot, Taser, etc.) map to 'pistol' — that's the slot they
  //     occupy; the damage TYPE is a separate engine concern not modeled yet.
  //   Melee → melee_light / _medium / _heavy / _elite by damage midpoint:
  //     <22 = light, 22–40 = medium, 40–60 = heavy, 60+ = elite.
  //
  // Excluded: "?? - ??" entries (China Lake, SMAW Launcher) and "Coming Soon"
  // (Tranquilizer Gun, Scalpel) — no usable stats. Everything else is
  // included including loot/exotic/dual/event weapons; per-weapon picker
  // means the user gets fine-grained control regardless of source rarity.
  const WEAPONS = [
    // ── PRIMARY ────────────────────────────────────────────────────────
    ['uzi_9mm',           '9mm Uzi',              'smg',     65, 70, 43, 48],
    ['ak47',              'AK-47',                'rifle',   56, 61, 52, 57],
    ['ak74u',             'AK74U',                'smg',     46, 51, 41, 46],
    ['armalite_m15a4',    'ArmaLite M-15A4',      'rifle',   68, 73, 57, 62],
    ['benelli_m1_tac',    'Benelli M1 Tactical',  'shotgun', 39, 44, 65, 70],
    ['benelli_m4_super',  'Benelli M4 Super',     'shotgun', 59, 64, 55, 60],
    ['bushmaster_c15',    'Bushmaster Carbon 15', 'smg',     50, 55, 57, 62],
    ['dual_bushmasters',  'Dual Bushmasters',     'smg',     76, 81, 47, 52],
    ['dual_mp5s',         'Dual MP5s',            'smg',     78, 83, 46, 51],
    ['dual_p90s',         'Dual P90s',            'smg',     77, 82, 45, 50],
    ['dual_tmps',         'Dual TMPs',            'smg',     79, 84, 40, 45],
    ['dual_uzis',         'Dual Uzis',            'smg',     80, 85, 36, 41],
    ['egg_launcher',      'Egg Propelled Launcher','heavy',  64, 69, 24, 29],
    ['enfield_sa80',      'Enfield SA-80',        'rifle',   63, 68, 55, 60],
    ['gold_ak47',         'Gold Plated AK-47',    'rifle',   75, 80, 62, 67],
    ['hk_sl8',            'Heckler & Koch SL8',   'rifle',   60, 65, 46, 51],
    ['ithaca_37',         'Ithaca 37',            'shotgun', 49, 54, 62, 67],
    ['jackhammer',        'Jackhammer',           'shotgun', 69, 74, 52, 57],
    ['m16_a2',            'M16 A2 Rifle',         'rifle',   61, 66, 47, 52],
    ['m249_saw',          'M249 SAW',             'heavy',   67, 72, 41, 46],
    ['m4a1_colt',         'M4A1 Colt Carbine',    'rifle',   55, 60, 47, 52],
    ['mag7',              'Mag 7',                'shotgun', 56, 61, 62, 67],
    ['minigun',           'Minigun',              'heavy',   72, 77, 28, 33],
    ['mp40',              'MP 40',                'smg',     37, 42, 41, 46],
    ['mp5_navy',          'MP5 Navy',             'smg',     45, 50, 51, 56],
    ['negev_ng5',         'Negev NG-5',           'heavy',   69, 74, 35, 40],
    ['neutrilux_2000',    'Neutrilux 2000',       'heavy',   59, 64, 25, 30],
    ['nock_gun',          'Nock Gun',             'shotgun', 95,100, 45, 50],
    ['p90',               'P90',                  'smg',     48, 53, 51, 56],
    ['pkm',               'PKM',                  'heavy',   76, 79, 49, 51],
    ['prototype',         'Prototype',            'heavy',   68, 73, 36, 41],
    ['rheinmetall_mg3',   'Rheinmetall MG 3',     'heavy',   66, 71, 36, 41],
    ['sawed_off',         'Sawed-Off Shotgun',    'shotgun', 41, 46, 63, 68],
    ['sig_550',           'SIG 550',              'rifle',   62, 67, 50, 55],
    ['sig_552',           'SIG 552',              'rifle',   69, 74, 50, 55],
    ['sks_carbine',       'SKS Carbine',          'rifle',   46, 51, 47, 52],
    ['snow_cannon',       'Snow Cannon',          'heavy',   52, 57, 24, 29],
    ['steyr_aug',         'Steyr AUG',            'rifle',   64, 69, 45, 50],
    ['stoner_96',         'Stoner 96',            'heavy',   69, 74, 49, 54],
    ['tavor_tar21',       'Tavor TAR-21',         'rifle',   65, 70, 52, 57],
    ['thompson',          'Thompson',             'smg',     39, 44, 43, 48],
    ['vektor_cr21',       'Vektor CR-21',         'rifle',   50, 55, 48, 53],
    ['xm8',               'XM8 Rifle',            'rifle',   50, 55, 56, 61],
    // ── SECONDARY ──────────────────────────────────────────────────────
    ['type98_at',         'Type 98 Anti Tank',    'heavy',   78, 83, 25, 30],
    ['beretta_92fs',      'Beretta 92FS',         'pistol',  48, 53, 51, 56],
    ['beretta_m9',        'Beretta M9',           'pistol',  36, 41, 54, 59],
    ['beretta_pico',      'Beretta Pico',         'pistol',  54, 59, 53, 58],
    ['blowgun',           'Blowgun',              'pistol',  15, 20, 39, 44],
    ['blunderbuss',       'Blunderbuss',          'shotgun', 46, 51, 24, 29],
    ['bt_mp9',            'BT MP9',               'smg',     61, 66, 55, 60],
    ['cobra_derringer',   'Cobra Derringer',      'pistol',  61, 66, 53, 58],
    ['crossbow',          'Crossbow',             'pistol',  35, 40, 63, 68],
    ['desert_eagle',      'Desert Eagle',         'pistol',  59, 64, 36, 41],
    ['dual_92g',          'Dual 92G Berettas',    'pistol',  64, 69, 30, 35],
    ['fiveseven',         'Fiveseven',            'pistol',  52, 57, 49, 54],
    ['flamethrower',      'Flamethrower',         'heavy',   67, 72, 39, 44],
    ['flare_gun',         'Flare Gun',            'pistol',  18, 23, 22, 27],
    ['glock_17',          'Glock 17',             'pistol',  28, 33, 53, 58],
    ['harpoon',           'Harpoon',              'pistol',  47, 52, 63, 68],
    ['hh_pocket_shotgun', 'Homemade Pocket Shotgun','shotgun',63,68, 60, 65],
    ['lorcin_380',        'Lorcin 380',           'pistol',  27, 32, 41, 46],
    ['luger',             'Luger',                'pistol',  35, 40, 48, 53],
    ['magnum',            'Magnum',               'pistol',  55, 60, 38, 43],
    ['milkor_mgl',        'Milkor MGL',           'heavy',   74, 79, 39, 44],
    ['mp5k',              'MP5k',                 'smg',     42, 47, 52, 57],
    ['pink_mac10',        'Pink Mac-10',          'smg',     74, 79, 45, 50],
    ['qsz_92',            'Qsz-92',               'pistol',  62, 67, 53, 58],
    ['raven_mp25',        'Raven MP25',           'pistol',  29, 34, 52, 57],
    ['rpg_launcher',      'RPG Launcher',         'heavy',   77, 82, 39, 44],
    ['ruger_57',          'Ruger 57',             'pistol',  32, 37, 56, 61],
    ['sw_m29',            'S&W M29',              'pistol',  47, 52, 52, 57],
    ['sw_revolver',       'S&W Revolver',         'pistol',  42, 47, 54, 59],
    ['skorpion',          'Skorpion',             'smg',     40, 45, 54, 59],
    ['slingshot',         'Slingshot',            'pistol',  14, 18, 54, 59],
    ['springfield_1911',  'Springfield 1911',     'pistol',  33, 38, 57, 62],
    ['taser',             'Taser',                'pistol',   1,  5, 54, 59],
    ['taurus',            'Taurus',               'pistol',  30, 35, 57, 62],
    ['tmp',               'TMP',                  'smg',     38, 43, 45, 50],
    ['usp',               'USP',                  'pistol',  44, 49, 58, 63],
    // ── MELEE ──────────────────────────────────────────────────────────
    // Bucketed by damage midpoint per the rules above. Same dmg/acc the
    // wiki publishes; class lookup just controls which dropdown shows it.
    ['axe',               'Axe',                  'melee_medium', 34, 39, 52, 57],
    ['baseball_bat',      'Baseball Bat',         'melee_light',  16, 21, 57, 62],
    ['blood_sickle',      'Blood Spattered Sickle','melee_medium',36, 41, 55, 60],
    ['bone_saw',          'Bone Saw',             'melee_heavy',  54, 58, 52, 56],
    ['bo_staff',          'Bo Staff',             'melee_light',  13, 18, 55, 60],
    ['bread_knife',       'Bread Knife',          'melee_heavy',  41, 43, 65, 70],
    ['bug_swatter',       'Bug Swatter',          'melee_light',   5, 10, 59, 64],
    ['butterfly_knife',   'Butterfly Knife',      'melee_medium', 24, 29, 55, 60],
    ['cattle_prod',       'Cattle Prod',          'melee_light',   1,  6, 59, 64],
    ['chain_whip',        'Chain Whip',           'melee_medium', 31, 36, 52, 57],
    ['chainsaw',          'Chainsaw',             'melee_elite',  61, 66, 23, 28],
    ['claymore_sword',    'Claymore Sword',       'melee_heavy',  57, 62, 49, 54],
    ['cleaver',           'Cleaver',              'melee_heavy',  51, 56, 56, 61],
    ['cricket_bat',       'Cricket Bat',          'melee_light',  18, 23, 42, 47],
    ['crowbar',           'Crowbar',              'melee_medium', 20, 25, 52, 57],
    ['dagger',            'Dagger',               'melee_medium', 28, 33, 60, 65],
    ['devils_pitchfork',  "Devil's Pitchfork",    'melee_elite',  61, 66, 41, 46],
    ['diamond_knife',     'Diamond Bladed Knife', 'melee_elite',  60, 65, 62, 67],
    ['diamond_icicle',    'Diamond Icicle',       'melee_heavy',  45, 50, 48, 53],
    ['dual_axes',         'Dual Axes',            'melee_elite',  70, 75, 54, 59],
    ['dual_hammers',      'Dual Hammers',         'melee_elite',  70, 75, 54, 59],
    ['dual_samurai',      'Dual Samurai Swords',  'melee_elite',  70, 75, 54, 59],
    ['dual_scimitars',    'Dual Scimitars',       'melee_elite',  70, 75, 54, 59],
    ['dukes_hammer',      "Duke's Hammer",        'melee_light',  18, 18, 55, 55],
    ['fine_chisel',       'Fine Chisel',          'melee_light',  16, 21, 50, 55],
    ['flail',             'Flail',                'melee_elite',  71, 76, 28, 33],
    ['frying_pan',        'Frying Pan',           'melee_light',  19, 24, 43, 48],
    ['golden_broomstick', 'Golden Broomstick',    'melee_elite',  60, 65, 48, 53],
    ['golf_club',         'Golf Club',            'melee_medium', 29, 32, 59, 63],
    ['guandao',           'Guandao',              'melee_elite',  63, 68, 35, 40],
    ['hammer',            'Hammer',               'melee_light',  17, 22, 55, 60],
    ['handbag',           'Handbag',              'melee_elite',  67, 72, 63, 68],
    ['ice_pick',          'Ice Pick',             'melee_heavy',  51, 56, 60, 65],
    ['ivory_cane',        'Ivory Walking Cane',   'melee_heavy',  53, 58, 57, 62],
    ['kama',              'Kama',                 'melee_medium', 35, 40, 55, 60],
    ['katana',            'Katana',               'melee_heavy',  52, 57, 55, 60],
    ['kitchen_knife',     'Kitchen Knife',        'melee_medium', 25, 30, 55, 60],
    ['knuckle_dusters',   'Knuckle Dusters',      'melee_light',  11, 16, 62, 67],
    ['kodachi',           'Kodachi',              'melee_elite',  62, 67, 56, 61],
    ['lead_pipe',         'Lead Pipe',            'melee_medium', 26, 31, 33, 38],
    ['leather_bullwhip',  'Leather Bullwhip',     'melee_medium', 27, 32, 52, 57],
    ['macana',            'Macana',               'melee_heavy',  57, 62, 65, 70],
    ['madball',           'Madball',              'melee_elite',  60, 65, 45, 50],
    ['meat_hook',         'Meat Hook',            'melee_elite',  62, 67, 39, 44],
    ['metal_nunchakus',   'Metal Nunchakus',      'melee_elite',  61, 66, 60, 65],
    ['naval_cutlass',     'Naval Cutlass',        'melee_elite',  64, 69, 52, 57],
    ['ninja_claws',       'Ninja Claws',          'melee_heavy',  39, 44, 51, 56],
    ['high_heels',        'Pair of High Heels',   'melee_heavy',  40, 45, 63, 68],
    ['ice_skates',        'Pair of Ice Skates',   'melee_heavy',  43, 48, 45, 50],
    ['pen_knife',         'Pen Knife',            'melee_medium', 21, 26, 45, 50],
    ['penelope',          'Penelope',             'melee_light',  17, 17, 57, 57],
    ['petrified_humerus', 'Petrified Humerus',    'melee_heavy',  48, 53, 48, 53],
    ['pillow',            'Pillow',               'melee_light',   1,  5, 63, 68],
    ['plastic_sword',     'Plastic Sword',        'melee_light',   5, 10, 29, 34],
    ['poison_umbrella',   'Poison Umbrella',      'melee_medium', 35, 40, 49, 54],
    ['riding_crop',       'Riding Crop',          'melee_medium', 21, 26, 54, 59],
    ['rusty_sword',       'Rusty Sword',          'melee_medium', 22, 27, 15, 20],
    ['sai',               'Sai',                  'melee_medium', 29, 34, 52, 57],
    ['samurai_sword',     'Samurai Sword',        'melee_elite',  58, 63, 52, 57],
    ['scimitar',          'Scimitar',             'melee_heavy',  40, 45, 58, 63],
    ['sledgehammer',      'Sledgehammer',         'melee_elite',  58, 63, 50, 55],
    ['spear',             'Spear',                'melee_heavy',  38, 43, 48, 53],
    ['swiss_army_knife',  'Swiss Army Knife',     'melee_medium', 23, 28, 52, 57],
    ['twin_tiger_hooks',  'Twin Tiger Hooks',     'melee_heavy',  50, 55, 53, 58],
    ['wand_of_destr',     'Wand of Destruction',  'melee_elite',  60, 65, 26, 31],
    ['wooden_nunchaku',   'Wooden Nunchaku',      'melee_medium', 22, 27, 59, 64],
    ['wushu_double_axes', 'Wushu Double Axes',    'melee_heavy',  53, 58, 51, 56],
    ['yasukuni_sword',    'Yasukuni Sword',       'melee_elite',  65, 70, 49, 54],
  ];

  // Lookup index built once at module load. The TEST UI hits getWeaponsForClass
  // every time the class dropdown changes (rebuilding the second dropdown), so
  // pre-sorting + indexing here keeps that path zero-allocation.
  const WEAPONS_BY_ID = {};
  const WEAPONS_BY_CLASS = {};
  (function buildWeaponIndex() {
    for (const row of WEAPONS) {
      const id = row[0], label = row[1], klass = row[2];
      const dl = row[3], dh = row[4], al = row[5], ah = row[6];
      const obj = {
        id, label, class: klass,
        dmg: (dl + dh) / 2,
        acc: (al + ah) / 2,
        dmgLow: dl, dmgHigh: dh,
        accLow: al, accHigh: ah,
      };
      WEAPONS_BY_ID[id] = obj;
      if (!WEAPONS_BY_CLASS[klass]) WEAPONS_BY_CLASS[klass] = [];
      WEAPONS_BY_CLASS[klass].push(obj);
    }
    for (const klass in WEAPONS_BY_CLASS) {
      WEAPONS_BY_CLASS[klass].sort(function (a, b) { return a.label.localeCompare(b.label); });
    }
  })();

  function getWeaponById(id) {
    return id ? (WEAPONS_BY_ID[id] || null) : null;
  }
  function getWeaponsForClass(classKey) {
    return WEAPONS_BY_CLASS[classKey] || [];
  }

  // v0.6.71 — fuzzy name lookup. Torn's equipment API returns the weapon's
  // display name, but our WEAPONS table is keyed by an internal slug.
  // Normalise both sides to a-z0-9 only so "Ithaca 37" matches the row
  // labelled "Ithaca 37", "S&W M29" matches "swm29", etc. Cached on first
  // call to keep the hot path cheap.
  let _weaponsByNormName = null;
  function lookupWeaponByName(name) {
    if (!name) return null;
    if (!_weaponsByNormName) {
      _weaponsByNormName = {};
      for (const id in WEAPONS_BY_ID) {
        const w = WEAPONS_BY_ID[id];
        const key = String(w.label).toLowerCase().replace(/[^a-z0-9]/g, '');
        _weaponsByNormName[key] = w;
      }
    }
    const norm = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    return _weaponsByNormName[norm] || null;
  }

  // Specific weapon overrides class. weapon obj wins when present, class is
  // the fallback, and a numeric fallback is the last resort (kept for the
  // sanity-check harness which passes opts.weaponDmg directly).
  function _resolveWeaponDmg(classKey, fallback, weapon) {
    if (weapon && typeof weapon.dmg === 'number') return weapon.dmg;
    if (classKey && WEAPON_CLASSES[classKey]) return WEAPON_CLASSES[classKey].dmg;
    return (typeof fallback === 'number') ? fallback : TEST_DEFAULTS.weaponDmg;
  }

  function _resolveWeaponAcc(classKey, weapon) {
    if (weapon && typeof weapon.acc === 'number') return weapon.acc;
    if (classKey && WEAPON_CLASSES[classKey]) return WEAPON_CLASSES[classKey].acc;
    return 50;
  }

  // TEST v0.3 — full armor suite. Each swing now rolls a body region using
  // BODY_REGIONS as a weighted distribution; if the defender's armor preset
  // covers that region, damage is reduced by `reduction * coverage[region]`.
  // Partial-coverage sets (Body only, Tactical) therefore correctly take
  // full damage when the hit lands on an uncovered region — that's the
  // whole point of modeling regions instead of one flat % per set.
  //
  // Values are PROVISIONAL — rough public-knowledge ballparks for the main
  // armor sets (Body / Tactical / Riot / Assault) and the ranked-war sets
  // (EOD / Sentinel / Vanguard). v0.6.20 collapses the calibration ladder:
  // the sim labels its output as `provisional-v0.4` whenever ANY non-default
  // (non-generic class or non-naked armor) is in play. A later TEST version
  // will refit these against fight-log data.
  //
  // The region distribution sums to 1.0. The math doesn't require it to,
  // but keeping it normalized makes per-region weights readable as "x% of
  // hits land here." Order matches the rolling helper's cumulative scan.
  const BODY_REGIONS = [
    { key: 'head',    label: 'Head',    weight: 0.05 },
    { key: 'chest',   label: 'Chest',   weight: 0.30 },
    { key: 'stomach', label: 'Stomach', weight: 0.25 },
    { key: 'groin',   label: 'Groin',   weight: 0.05 },
    { key: 'arms',    label: 'Arms',    weight: 0.15 },
    { key: 'legs',    label: 'Legs',    weight: 0.20 },
  ];

  // coverage values are 0..1 — fraction of that region's surface area the
  // preset covers (1 = full coverage, 0 = none). reduction is the fractional
  // damage cut when a hit lands on a covered region.
  //
  // v0.6.17 refits coverage to wiki pixel-coverage % per piece. The big
  // change: many helmets only partially cover the head (Assault ~67%,
  // Vanguard Respirator ~40%, Sentinel ~74%), so head shots are no longer
  // always blocked by heavy armor sets. EOD remains 100% head. Reductions
  // are still eyeballed — the wiki publishes armor RATINGS (e.g. Sentinel
  // Body 53-58) but not the rating→damage-reduction formula, so we keep
  // existing reductions as the tuning knob until we have data to refit.
  const ARMOR_PRESETS = {
    naked:    { label: 'Naked (no armor)',         reduction: 0.00,
                coverage: { head: 0,    chest: 0,    stomach: 0,    groin: 0,    arms: 0,    legs: 0    } },
    body:     { label: 'Body only',                reduction: 0.25,
                coverage: { head: 0,    chest: 1.00, stomach: 1.00, groin: 0.89, arms: 0.36, legs: 0    } },
    tactical: { label: 'Tactical (helmet + body)', reduction: 0.30,
                coverage: { head: 0.67, chest: 1.00, stomach: 1.00, groin: 0.36, arms: 0.23, legs: 0    } },
    riot:     { label: 'Full Riot',                reduction: 0.25,
                coverage: { head: 1.00, chest: 1.00, stomach: 1.00, groin: 1.00, arms: 1.00, legs: 1.00 } },
    assault:  { label: 'Full Assault',             reduction: 0.35,
                coverage: { head: 0.67, chest: 1.00, stomach: 1.00, groin: 1.00, arms: 1.00, legs: 1.00 } },
    vanguard: { label: 'Full Vanguard (RW)',       reduction: 0.40,
                coverage: { head: 0.40, chest: 1.00, stomach: 1.00, groin: 1.00, arms: 1.00, legs: 1.00 } },
    sentinel: { label: 'Full Sentinel (RW)',       reduction: 0.45,
                coverage: { head: 0.74, chest: 1.00, stomach: 1.00, groin: 1.00, arms: 1.00, legs: 1.00 } },
    eod:      { label: 'Full EOD (RW)',            reduction: 0.50,
                coverage: { head: 1.00, chest: 1.00, stomach: 1.00, groin: 1.00, arms: 1.00, legs: 1.00 } },
  };
  const ARMOR_PRESET_ORDER = ['naked', 'body', 'tactical', 'riot', 'assault', 'vanguard', 'sentinel', 'eod'];

  function _resolveArmor(presetKey) {
    if (presetKey && ARMOR_PRESETS[presetKey]) return ARMOR_PRESETS[presetKey];
    return ARMOR_PRESETS.naked;
  }

  // Per-stat multipliers applied ONCE before the trial loop. Battle-stats
  // only — happy / nerve / energy / cooldown / overdose / hospital effects
  // are out of scope for the sim.
  //
  // Numbers user-validated 2026-05-26 against in-game knowledge. Do NOT
  // "recalibrate" against web-search aggregations of the Torn wiki — they
  // were wrong on Cannabis (claimed no battle effect), Ketamine Dex
  // (claimed -20%), and Xanax magnitude (claimed -25%, actually -35%).
  // If you think a number is off, ask the user before touching the table.
  //
  // Cannabis, Shrooms, and Xanax are DEBUFFS for combat — they're taken
  // for crime nerve, happy, and gym energy respectively, not for fighting.
  // We keep them selectable so users can model "what happens if I get
  // attacked while still on a Xanax" (the most common drug in Torn — you
  // are often on one when someone hits you).
  //
  // Drugs are pure stat tweaks, not new physics, so they do NOT degrade
  // the calibration tag.
  const DRUGS = {
    none:     { label: 'No drug',            mult: { str: 1.00, def: 1.00, spd: 1.00, dex: 1.00 } },
    cannabis: { label: 'Cannabis',           mult: { str: 0.80, def: 0.75, spd: 0.65, dex: 1.00 } },
    ecstasy:  { label: 'Ecstasy',            mult: { str: 1.00, def: 1.00, spd: 1.00, dex: 1.00 } },
    ketamine: { label: 'Ketamine',           mult: { str: 0.80, def: 1.50, spd: 0.80, dex: 1.00 } },
    lsd:      { label: 'LSD',                mult: { str: 1.30, def: 1.50, spd: 0.70, dex: 0.70 } },
    opium:    { label: 'Opium',              mult: { str: 1.00, def: 1.30, spd: 1.00, dex: 1.00 } },
    pcp:      { label: 'PCP',                mult: { str: 1.20, def: 1.00, spd: 1.00, dex: 1.20 } },
    shrooms:  { label: 'Shrooms',            mult: { str: 0.80, def: 0.80, spd: 0.80, dex: 0.80 } },
    speed:    { label: 'Speed',              mult: { str: 1.00, def: 1.00, spd: 1.20, dex: 0.80 } },
    vicodin:  { label: 'Vicodin',            mult: { str: 1.25, def: 1.25, spd: 1.25, dex: 1.25 } },
    xanax:    { label: 'Xanax',              mult: { str: 0.65, def: 0.65, spd: 0.65, dex: 0.65 } },
    love:     { label: 'Love Juice (event)', mult: { str: 1.00, def: 1.00, spd: 1.50, dex: 1.25 } },
  };
  const DRUG_ORDER = ['none', 'cannabis', 'ecstasy', 'ketamine', 'lsd', 'opium', 'pcp', 'shrooms', 'speed', 'vicodin', 'xanax', 'love'];

  function _resolveDrug(key) {
    if (key && DRUGS[key]) return DRUGS[key];
    return DRUGS.none;
  }

  // Returns a NEW stat block with drug multipliers applied. Zero stats
  // stay zero (a debuff drug shouldn't accidentally CREATE 1 point of Dex
  // for someone training pure Str). Otherwise floor at 1 to match the
  // engine's Math.max(1, ...) guards downstream.
  function _applyDrug(side, drugKey) {
    const d = _resolveDrug(drugKey);
    if (d === DRUGS.none) return side;
    const apply = (v, m) => {
      if (!v || v <= 0) return 0;
      return Math.max(1, Math.round(v * m));
    };
    return Object.assign({}, side, {
      strength:  apply(side.strength,  d.mult.str),
      defense:   apply(side.defense,   d.mult.def),
      speed:     apply(side.speed,     d.mult.spd),
      dexterity: apply(side.dexterity, d.mult.dex),
    });
  }

  // Cumulative-scan region roll. BODY_REGIONS' weights sum to 1.0 so a
  // single rng() value picks one. Returns the region object so callers can
  // read both .key (for coverage lookup) and .label (for future drill UIs).
  function _rollBodyRegion(rng) {
    const r = rng();
    let acc = 0;
    for (let i = 0; i < BODY_REGIONS.length; i++) {
      acc += BODY_REGIONS[i].weight;
      if (r < acc) return BODY_REGIONS[i];
    }
    return BODY_REGIONS[BODY_REGIONS.length - 1];
  }

  // Apply armor reduction to a raw damage roll. If the rolled region has
  // partial coverage (only Body / Tactical use this today), the reduction
  // scales linearly with coverage at that region — uncovered regions take
  // FULL damage even against a "tier-3" set, which is the whole reason this
  // model exists instead of one flat % per set.
  function _applyArmor(dmg, armor, region) {
    if (!armor || armor === ARMOR_PRESETS.naked) return dmg;
    const cov = armor.coverage?.[region.key] || 0;
    if (cov <= 0) return dmg;
    const cut = armor.reduction * cov;
    return Math.max(1, Math.round(dmg * (1 - cut)));
  }

  // Torn wiki HP formula (v0.6.22 — replaces the v0.6.7 linear stub):
  //   "Maximum life starts at 100 and increases by 25 points per level
  //    (2-8), 50 points (9-95), and 75 points (96-100), reaching 5,000
  //    at level 100."
  // Verified anchor points: L1=100, L8=275, L29=1325, L40=1875, L100=5000.
  // Closed-form piecewise — no merit/education/perk bonuses (additive on
  // top of this if a future feature needs them).
  function testHpForLevel(level) {
    const lv = Math.max(1, Math.min(100, level || TEST_DEFAULTS.defaultLevel));
    let hp = 100;
    if (lv >= 2)  hp += 25 * Math.min(lv - 1, 7);            // levels 2-8
    if (lv >= 9)  hp += 50 * (Math.min(lv, 95) - 8);         // levels 9-95
    if (lv >= 96) hp += 75 * (lv - 95);                      // levels 96-100
    return hp;
  }

  // Mulberry32 — small deterministic PRNG. Pass rngSeed to reproduce a run;
  // omit to fall back to Math.random.
  function _testMakeRng(seed) {
    if (seed == null) return Math.random;
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hit chance: attacker Spd vs defender Dex, biased by attacker's weapon
  // accuracy, clamped to [0.10, 0.95]. Symmetric stats with neutral acc=50
  // land at 50%. We cap the extremes because Torn rarely guarantees a hit
  // or a miss; v0.5+ calibration can refit the bounds and the bias scale
  // against captured-fight hit rates.
  //   spd/dex term:  0.5 + (a - d)/(a + d) * 0.4   → [0.10, 0.90] band
  //   acc bias:      (weaponAcc - 50) * 0.01       → +/-1% per acc point
  // 50 vs 50 stats, Chainsaw (acc 25) → 25% hit. 50 vs 50 stats, Ithaca
  // (acc 64) → 64% hit. High-acc weapons no longer match raw stat curve.
  function testHitChance(atkSpd, defDex, weaponAcc) {
    const a = Math.max(1, atkSpd);
    const d = Math.max(1, defDex);
    const ratio = (a - d) / (a + d);
    const baseRaw = 0.5 + ratio * 0.4;
    const accBias = ((weaponAcc != null ? weaponAcc : 50) - 50) * 0.01;
    const raw = baseRaw + accBias;
    return Math.max(0.10, Math.min(0.95, raw));
  }

  // Damage = absolute scale * ratio kick * weapon multiplier * jitter.
  //   absScale = STR^0.45            → sub-linear growth so 1m STR doesn't
  //                                    outpunch 100k STR by 10x
  //   ratio    = sqrt(STR / DEF)     → Vladar-style relative-power term;
  //                                    mirror match → 1.0, mismatch swings it
  //   weapon   = (wpn / 50)          → 50 is the generic stat-only baseline
  // Calibrated so a typical L29 mirror at 800k total resolves in 4-6 turns
  // (HP ≈ 1700), and a L29 brawler vs L29 defender wins ~70% in ~6 turns.
  // v0.4+ recalibration can refit absScale exponent against captured fights.
  function testDamage(atkStr, defDef, weaponDmg, rng) {
    const s = Math.max(1, atkStr);
    const d = Math.max(1, defDef);
    const absScale = Math.pow(s, 0.45);
    const ratio    = Math.sqrt(s / d);
    const base     = absScale * ratio * (weaponDmg / 50);
    const jitter   = 1 + (rng() * 2 - 1) * TEST_DEFAULTS.damageJitter;
    return Math.max(1, Math.round(base * jitter));
  }

  // One full match: simultaneous strikes per turn, 10-turn cap.
  // Side A = "you", side B = opponent. Per-side HP can come from a.hp / b.hp
  // directly, or be derived from a.level / b.level (or opts.level as a fallback
  // shared default). Returns winner + final HP + turns.
  function testRunMatch(a, b, opts, rng) {
    // v0.6.65: opts.weaponA / weaponB are weapon-object overrides from the
    // named-weapon picker (id → WEAPONS_BY_ID lookup). When set, they win
    // over the class default; when null, falls through to the class lookup
    // (v0.2 behaviour) and then to opts.weaponDmg (harness compat).
    const wpnObjA = opts.weaponA || null;
    const wpnObjB = opts.weaponB || null;
    const wpnA = _resolveWeaponDmg(opts.weaponClassA, opts.weaponDmg, wpnObjA);
    const wpnB = _resolveWeaponDmg(opts.weaponClassB, opts.weaponDmg, wpnObjB);
    const accA = _resolveWeaponAcc(opts.weaponClassA, wpnObjA);
    const accB = _resolveWeaponAcc(opts.weaponClassB, wpnObjB);
    // v0.3: armor preset per defender. Each landed hit rolls a body region
    // and applies the defender's preset reduction; naked = no-op so v0.2
    // matchups produce identical numbers under the same rngSeed.
    const armA = _resolveArmor(opts.armorA);
    const armB = _resolveArmor(opts.armorB);
    const maxT = opts.maxTurns || TEST_DEFAULTS.maxTurns;
    const hpA0 = a.hp || testHpForLevel(a.level || opts.level);
    const hpB0 = b.hp || testHpForLevel(b.level || opts.level);
    let hpA = hpA0, hpB = hpB0;
    let turn = 0;
    const hitA = testHitChance(a.speed, b.dexterity, accA);
    const hitB = testHitChance(b.speed, a.dexterity, accB);
    // Per-region trackers keyed by region.key. hitsOnX/dmgOnX = hits landed
    // on X / damage taken by X, broken out per region. Summed in
    // testSimulate so the UI can show "where my Vanguard helmet leaks."
    const hitsOnA = {}, hitsOnB = {}, dmgOnA = {}, dmgOnB = {};
    for (let r = 0; r < BODY_REGIONS.length; r++) {
      const k = BODY_REGIONS[r].key;
      hitsOnA[k] = 0; hitsOnB[k] = 0;
      dmgOnA[k] = 0;  dmgOnB[k] = 0;
    }
    while (turn < maxT && hpA > 0 && hpB > 0) {
      turn++;
      if (rng() < hitA) {
        const raw = testDamage(a.strength, b.defense, wpnA, rng);
        const region = _rollBodyRegion(rng);
        const dmg = _applyArmor(raw, armB, region);
        hpB -= dmg;
        hitsOnB[region.key]++;
        dmgOnB[region.key] += dmg;
      }
      if (rng() < hitB) {
        const raw = testDamage(b.strength, a.defense, wpnB, rng);
        const region = _rollBodyRegion(rng);
        const dmg = _applyArmor(raw, armA, region);
        hpA -= dmg;
        hitsOnA[region.key]++;
        dmgOnA[region.key] += dmg;
      }
    }
    let winner;
    if (hpA <= 0 && hpB <= 0) winner = 'draw';
    else if (hpB <= 0) winner = 'A';
    else if (hpA <= 0) winner = 'B';
    // Cap reached with both alive: decide on HP fraction remaining (fair
    // when sides have different max HP, unlike raw `hpA > hpB`).
    else {
      const fracA = hpA / hpA0;
      const fracB = hpB / hpB0;
      winner = fracA > fracB ? 'A' : (fracA < fracB ? 'B' : 'draw');
    }
    return { winner, turns: turn, hpA, hpB, hpA0, hpB0,
             hitsOnA, hitsOnB, dmgOnA, dmgOnB };
  }

  // Monte Carlo over N trials. Aggregates win rate, average turn count,
  // and a per-turn histogram so a future UI can show "kill-by-turn"
  // distributions instead of a single point estimate.
  function testSimulate(sideA, sideB, opts) {
    opts = opts || {};
    const trials = Math.max(1, opts.trials || opts.iterations || 100);
    const rng = _testMakeRng(opts.rngSeed);

    // Resolve drugs and bake their multipliers into the stats ONCE,
    // before the trial loop. Engine then sees post-drug numbers for every
    // trial — no per-turn re-roll, no impact on rngSeed reproducibility.
    const drugKeyA = (opts.drugA && DRUGS[opts.drugA]) ? opts.drugA : 'none';
    const drugKeyB = (opts.drugB && DRUGS[opts.drugB]) ? opts.drugB : 'none';
    const A = _applyDrug(sideA, drugKeyA);
    const B = _applyDrug(sideB, drugKeyB);

    let winsA = 0, winsB = 0, draws = 0;
    let turnsSum = 0;
    const turnsHist = new Array(TEST_DEFAULTS.maxTurns + 1).fill(0);
    // Per-region accumulators across all trials. Keyed by region.key.
    const sumHitsOnA = {}, sumHitsOnB = {}, sumDmgOnA = {}, sumDmgOnB = {};
    for (let r = 0; r < BODY_REGIONS.length; r++) {
      const k = BODY_REGIONS[r].key;
      sumHitsOnA[k] = 0; sumHitsOnB[k] = 0;
      sumDmgOnA[k] = 0;  sumDmgOnB[k] = 0;
    }
    for (let i = 0; i < trials; i++) {
      const r = testRunMatch(A, B, opts, rng);
      if (r.winner === 'A') winsA++;
      else if (r.winner === 'B') winsB++;
      else draws++;
      turnsSum += r.turns;
      turnsHist[r.turns]++;
      for (let j = 0; j < BODY_REGIONS.length; j++) {
        const k = BODY_REGIONS[j].key;
        sumHitsOnA[k] += r.hitsOnA[k];
        sumHitsOnB[k] += r.hitsOnB[k];
        sumDmgOnA[k]  += r.dmgOnA[k];
        sumDmgOnB[k]  += r.dmgOnB[k];
      }
    }
    const keyA = (opts.weaponClassA && WEAPON_CLASSES[opts.weaponClassA]) ? opts.weaponClassA : 'generic';
    const keyB = (opts.weaponClassB && WEAPON_CLASSES[opts.weaponClassB]) ? opts.weaponClassB : 'generic';
    const armKeyA = (opts.armorA && ARMOR_PRESETS[opts.armorA]) ? opts.armorA : 'naked';
    const armKeyB = (opts.armorB && ARMOR_PRESETS[opts.armorB]) ? opts.armorB : 'naked';
    const usingClasses = (keyA !== 'generic') || (keyB !== 'generic');
    const usingArmor   = (armKeyA !== 'naked') || (armKeyB !== 'naked');
    // calibration tag: formula-only for the pure stat sim (generic + naked
    // both sides), provisional-v0.4 the moment any non-default kicks in.
    // v0.4 collapses the previous v0.2/v0.3 split because weapon acc is now
    // baked into every non-generic class — there's no longer a "weapons but
    // no acc" intermediate state.
    let calibration = 'formula-only';
    if (usingClasses || usingArmor) calibration = 'provisional-v0.4';
    // Build per-side region breakdown rows. Coverage is the defender's
    // armor coverage at that region (0..1); avgDmgPerHit averages over
    // hits that landed at that region; dmgPerFight is mean total damage
    // taken at that region across all trials. Empty rows (0 hits) keep
    // avgDmgPerHit=0 — UI handles the display.
    const armorPresetA = ARMOR_PRESETS[armKeyA];
    const armorPresetB = ARMOR_PRESETS[armKeyB];
    function buildRegionStats(sumHits, sumDmg, defenderArmor) {
      return BODY_REGIONS.map(function (region) {
        const k = region.key;
        const hits = sumHits[k] || 0;
        const dmg  = sumDmg[k]  || 0;
        return {
          key: k,
          label: region.label,
          hitWeight: region.weight,
          coverage: defenderArmor.coverage?.[k] || 0,
          landedHits: hits,
          avgDmgPerHit: hits > 0 ? dmg / hits : 0,
          dmgPerFight:  dmg / trials,
        };
      });
    }
    // v0.6.65: named-weapon label takes precedence over the class label
    // when a specific weapon is picked. The class label still appears as
    // a paren-suffix on the result footer so users see "Ithaca 37 (Shotgun)".
    const weaponLabelA = opts.weaponA && opts.weaponA.label
      ? opts.weaponA.label + ' (' + WEAPON_CLASSES[keyA].label + ')'
      : WEAPON_CLASSES[keyA].label;
    const weaponLabelB = opts.weaponB && opts.weaponB.label
      ? opts.weaponB.label + ' (' + WEAPON_CLASSES[keyB].label + ')'
      : WEAPON_CLASSES[keyB].label;
    return {
      trials,
      winRateA: winsA / trials,
      winRateB: winsB / trials,
      drawRate: draws / trials,
      avgTurns: turnsSum / trials,
      turnsHist,
      weaponA: weaponLabelA,
      weaponB: weaponLabelB,
      armorA: ARMOR_PRESETS[armKeyA].label,
      armorB: ARMOR_PRESETS[armKeyB].label,
      drugA: DRUGS[drugKeyA].label,
      drugB: DRUGS[drugKeyB].label,
      regionStatsA: buildRegionStats(sumHitsOnA, sumDmgOnA, armorPresetA),
      regionStatsB: buildRegionStats(sumHitsOnB, sumDmgOnB, armorPresetB),
      calibration,
      version: 'TEST-v0.3',
    };
  }

  // Harness: canned matchups so the menu-command sanity check has
  // something self-explanatory to log. Symmetric -> ~50%; heavy favorite
  // -> >85%; heavy underdog -> <15%. If any of these drift far on a
  // future refactor, the engine math broke.
  function testRunSanityChecks() {
    const sym     = { strength: 250000, defense: 125000, speed: 125000, dexterity: 125000 };
    const fav     = { strength: 600000, defense: 300000, speed: 300000, dexterity: 300000 };
    const unfav   = { strength: 100000, defense:  50000, speed:  50000, dexterity:  50000 };
    const meBrawl = { strength: 405000, defense: 255000, speed: 220000, dexterity:   3500 };
    const meMirror= { strength: 405000, defense: 255000, speed: 220000, dexterity:   3500 };
    const defender= { strength: 100000, defense: 400000, speed: 200000, dexterity: 200000 };
    const TRIALS = 1000, SEED = 1, L29 = { trials: TRIALS, rngSeed: SEED, level: 29 };
    const L29w = function (wA, wB) {
      return { trials: TRIALS, rngSeed: SEED, level: 29, weaponClassA: wA, weaponClassB: wB };
    };
    const L29a = function (aA, aB) {
      return { trials: TRIALS, rngSeed: SEED, level: 29, armorA: aA, armorB: aB };
    };
    const cases = [
      ['symmetric (expect ~50% / KOs land)',     testSimulate(sym,   sym,   L29)],
      ['heavy favorite (expect A > 85%)',        testSimulate(fav,   unfav, L29)],
      ['heavy underdog (expect A < 15%)',        testSimulate(unfav, fav,   L29)],
      ['you L29 mirror (resolve in ~5 turns)',   testSimulate(meMirror, meBrawl, L29)],
      ['you L29 brawler vs L29 defender (you > 65%)', testSimulate(meBrawl, defender, L29)],
      // v0.2 weapon-class checks: same stats, different weapons. Heavier
      // per-hit dmg should win the war when hit rates and HP are equal.
      ['v0.2 mirror stats: rifle vs pistol (rifle > 60%)',  testSimulate(sym, sym, L29w('rifle',   'pistol'))],
      ['v0.2 mirror stats: heavy vs pistol (heavy > 75%)',  testSimulate(sym, sym, L29w('heavy',   'pistol'))],
      ['v0.2 mirror stats: shotgun vs smg (shotgun > 65%)', testSimulate(sym, sym, L29w('shotgun', 'smg'))],
      // v0.3 armor checks. Symmetric stats + naked vs armored should tilt
      // the matchup toward the armored side; magnitude scales with tier.
      ['v0.3 sym stats, naked vs Riot (B > 60%)',     testSimulate(sym, sym, L29a('naked', 'riot'))],
      ['v0.3 sym stats, naked vs Assault (B > 70%)',  testSimulate(sym, sym, L29a('naked', 'assault'))],
      ['v0.3 sym stats, naked vs EOD (B > 80%)',      testSimulate(sym, sym, L29a('naked', 'eod'))],
      ['v0.3 sym stats, both Assault (~50%)',         testSimulate(sym, sym, L29a('assault', 'assault'))],
      // Body-only is partial coverage — should help less than full Riot
      // because uncovered regions (head/limbs/groin = 45% of rolls) still
      // take full damage.
      ['v0.3 sym stats, naked vs Body only (B > 50%, < Riot)', testSimulate(sym, sym, L29a('naked', 'body'))],
    ];
    console.group('[TECH][TEST] v0.1 engine sanity check');
    cases.forEach(function (row) {
      const label = row[0], r = row[1];
      console.log(label);
      console.log(
        '  winRateA=' + (r.winRateA * 100).toFixed(1) + '%' +
        '  winRateB=' + (r.winRateB * 100).toFixed(1) + '%' +
        '  draw=' + (r.drawRate * 100).toFixed(1) + '%' +
        '  avgTurns=' + r.avgTurns.toFixed(2)
      );
    });
    console.groupEnd();
    return cases;
  }

  // ─── STYLES ─────────────────────────────────────────────────────────────
  // Theme: tactical wasteland — charcoal/gunmetal recesses, electric violet edge,
  // hot orange ember accents, chrome highlights. Win/loss greens & reds preserved
  // because legibility outranks aesthetics on a stats panel.
  GM_addStyle(`
    /* ── Header launcher: <li> injected into Torn's ul.toolbar ─────────────
       Inherits Torn's drop-shadow + sizing via .top_header_button on the
       inner <button>. The mark is a PNG <img> rendered at 22px with a
       violet glow on hover. */
    li#tech-launcher{position:relative;cursor:pointer;}
    li#tech-launcher .tech-launcher-btn{background:transparent;border:0;padding:0;
      cursor:pointer;display:flex;align-items:center;justify-content:center;}
    li#tech-launcher .tech-launcher-mark{width:22px;height:22px;display:block;
      transition:transform .15s ease, filter .15s ease;}
    li#tech-launcher:hover .tech-launcher-mark{transform:scale(1.08);
      filter:drop-shadow(0 0 6px rgba(168,85,247,.55));}
    .tech-launcher-pip{position:absolute;top:2px;right:0;width:8px;height:8px;
      border-radius:50%;border:1.5px solid #0a0a0c;pointer-events:none;z-index:2;
      background:#6b7280;}
    .tech-launcher-pip.ok  {background:#34d399;box-shadow:0 0 4px rgba(52,211,153,.7);}
    .tech-launcher-pip.err {background:#ef4444;box-shadow:0 0 4px rgba(239,68,68,.8);}
    .tech-launcher-pip.spin{background:#fde047;box-shadow:0 0 4px rgba(253,224,71,.7);}

    /* ── Mascot renders ────────────────────────────────────────────────────
       Same source artwork at four call sites, each sized for its slot. The
       art has its own drop-shadow built in, so we add a subtle violet glow
       only on the hero render where the mascot is the focal element. */
    .tech-mascot{display:block;image-rendering:auto;}
    .tech-mascot-header  {width:36px;height:36px;flex-shrink:0;}
    .tech-mascot-about   {width:48px;height:48px;flex-shrink:0;
      margin-bottom:6px;}
    .tech-mascot-empty   {width:90px;height:90px;margin:4px auto 12px;
      opacity:.92;}
    .tech-mascot-hero    {width:140px;height:140px;margin:6px auto 14px;
      filter:drop-shadow(0 0 14px rgba(168,85,247,.35));
      animation:tech-mascot-breathe 6s ease-in-out infinite;}
    @keyframes tech-mascot-breathe{
      0%,100%{filter:drop-shadow(0 0 14px rgba(168,85,247,.30));}
      50%    {filter:drop-shadow(0 0 22px rgba(168,85,247,.55));}
    }

    /* ── Panel shell ───────────────────────────────────────────────────── */
    .tech-panel{position:fixed;width:430px;max-height:80vh;display:flex;flex-direction:column;
      background:#0a0a0c;color:#e5e7eb;border:1px solid #2a1f2e;border-radius:8px;
      font:13px/1.45 system-ui,Segoe UI,sans-serif;z-index:2147483645;
      box-shadow:0 0 0 1px rgba(168,85,247,.18),0 20px 55px rgba(0,0,0,.7),
                 0 0 24px rgba(168,85,247,.12);overflow:hidden;}
    .tech-header{display:flex;align-items:center;gap:8px;padding:8px 10px;
      background:linear-gradient(180deg,#1a1117 0%,#0f0a12 100%);
      border-bottom:1px solid #2a1f2e;cursor:move;user-select:none;position:relative;}
    .tech-header::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:1px;
      background:linear-gradient(90deg,transparent 0%,#a855f7 35%,#f97316 65%,transparent 100%);
      opacity:.7;}
    .tech-title{flex:1;font:800 14px/1 Impact,'Oswald','Arial Narrow',sans-serif;
      letter-spacing:1.5px;
      background:linear-gradient(180deg,#f5f5f5 0%,#cbd5e1 50%,#94a3b8 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent;
      text-shadow:0 1px 0 rgba(0,0,0,.5);}
    .tech-title small{color:#a855f7;font-weight:600;margin-left:6px;font-size:10px;
      letter-spacing:.5px;-webkit-text-fill-color:#a855f7;}
    .tech-iconbtn{background:#15101a;border:1px solid #2a1f2e;color:#cbd5e1;
      width:24px;height:24px;border-radius:4px;cursor:pointer;line-height:1;font-size:13px;}
    .tech-iconbtn:hover{background:#2a1f2e;color:#fde047;border-color:#a855f7;}

    /* ── Tabs ─────────────────────────────────────────────────────────── */
    .tech-tabs{display:flex;background:#08070b;border-bottom:1px solid #2a1f2e;}
    .tech-tab{flex:1;padding:9px 6px;text-align:center;cursor:pointer;color:#6b7280;
      font:700 11px/1 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px;
      border-bottom:2px solid transparent;transition:color .15s,background .15s;}
    .tech-tab:hover{color:#e5e7eb;background:#0f0a12;}
    .tech-tab.active{color:#f3f4f6;border-bottom-color:#a855f7;background:#0f0a12;
      text-shadow:0 0 8px rgba(168,85,247,.5);}

    .tech-content{flex:1;overflow:auto;padding:11px;}
    .tech-content::-webkit-scrollbar{width:8px;}
    .tech-content::-webkit-scrollbar-track{background:#08070b;}
    .tech-content::-webkit-scrollbar-thumb{background:#2a1f2e;border-radius:4px;}
    .tech-content::-webkit-scrollbar-thumb:hover{background:#a855f7;}

    /* ── Status bar ───────────────────────────────────────────────────── */
    .tech-status{display:flex;align-items:center;gap:6px;padding:5px 10px;
      background:#08070b;border-top:1px solid #2a1f2e;font-size:11px;color:#6b7280;}
    .tech-status .ok  {color:#34d399;}
    .tech-status .err {color:#f87171;}
    .tech-status .spin{color:#fde047;}
    .tech-status .sep {color:#2a1f2e;}

    /* ── Pills (window selector) ──────────────────────────────────────── */
    .tech-pillrow{display:flex;gap:4px;margin-bottom:11px;}
    .tech-pill{flex:1;padding:6px 0;text-align:center;background:#15101a;
      color:#9ca3af;border:1px solid #2a1f2e;border-radius:4px;cursor:pointer;
      font:700 11px/1 system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase;
      transition:all .15s;}
    .tech-pill:hover{color:#f3f4f6;border-color:#5b21b6;}
    .tech-pill.active{background:linear-gradient(180deg,#7c3aed 0%,#5b21b6 100%);
      color:#fff;border-color:#a855f7;
      box-shadow:0 0 10px rgba(168,85,247,.4),inset 0 1px 0 rgba(255,255,255,.15);}

    /* ── Stat cards ───────────────────────────────────────────────────── */
    .tech-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;}
    .tech-card{background:linear-gradient(180deg,#15101a 0%,#0f0a12 100%);
      border:1px solid #2a1f2e;border-radius:5px;padding:8px 10px;position:relative;
      overflow:hidden;}
    .tech-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;
      background:#a855f7;opacity:.6;}
    .tech-card.good::before{background:#34d399;}
    .tech-card.bad::before {background:#ef4444;}
    .tech-card .label{font:700 9px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;color:#6b7280;}
    .tech-card .value{font:800 19px/1.05 Impact,'Oswald','Arial Narrow',sans-serif;
      color:#f3f4f6;margin-top:3px;letter-spacing:.5px;}
    .tech-card .sub{font-size:10px;color:#9ca3af;margin-top:2px;}
    .tech-card.good .value{color:#34d399;text-shadow:0 0 8px rgba(52,211,153,.3);}
    .tech-card.bad  .value{color:#f87171;text-shadow:0 0 8px rgba(248,113,113,.3);}

    /* ── Section titles ───────────────────────────────────────────────── */
    .tech-section{margin-top:16px;}
    .tech-section-title{font:700 10px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1.5px;color:#a855f7;margin-bottom:7px;
      padding-bottom:5px;border-bottom:1px solid #2a1f2e;display:flex;align-items:center;gap:6px;}
    .tech-section-title::before{content:'';display:inline-block;width:3px;height:10px;
      background:#f97316;}

    /* ── Outcome bars ─────────────────────────────────────────────────── */
    .tech-bar{display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:4px;}
    .tech-bar .name{width:92px;color:#cbd5e1;flex-shrink:0;font-weight:600;}
    .tech-bar .track{flex:1;height:8px;background:#15101a;border:1px solid #2a1f2e;
      border-radius:3px;overflow:hidden;}
    .tech-bar .fill{height:100%;background:#a855f7;}
    .tech-bar .count{width:32px;text-align:right;color:#9ca3af;font-weight:600;}

    /* ── Fight & opponent rows ───────────────────────────────────────── */
    .tech-row{display:flex;align-items:center;gap:8px;padding:6px 4px;
      border-bottom:1px solid #15101a;font-size:12px;}
    .tech-row:last-child{border-bottom:none;}
    .tech-row:hover{background:#0f0a12;}
    .tech-row .glyph{width:18px;text-align:center;font-weight:700;flex-shrink:0;font-size:14px;}
    .tech-row .who{flex:1;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tech-row .who a{color:#c4b5fd;text-decoration:none;font-weight:600;}
    .tech-row .who a:hover{color:#fde047;text-decoration:underline;}
    .tech-row .meta{color:#6b7280;font-size:11px;flex-shrink:0;}
    .tech-row .resp{color:#9ca3af;font-size:11px;width:56px;text-align:right;flex-shrink:0;
      font-variant-numeric:tabular-nums;}
    .tech-row .resp.pos{color:#34d399;}
    .tech-row .resp.neg{color:#f87171;}

    .tech-oprow{display:flex;align-items:center;gap:8px;padding:5px 4px;
      border-bottom:1px solid #15101a;font-size:12px;}
    .tech-oprow:last-child{border-bottom:none;}
    .tech-oprow:hover{background:#0f0a12;}
    .tech-oprow .name{flex:1;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tech-oprow .name a{color:#c4b5fd;text-decoration:none;font-weight:600;}
    .tech-oprow .name a:hover{color:#fde047;}
    .tech-oprow .wl{color:#9ca3af;font-size:11px;width:80px;flex-shrink:0;text-align:right;
      font-variant-numeric:tabular-nums;}
    .tech-oprow .resp{width:60px;text-align:right;color:#9ca3af;font-size:11px;flex-shrink:0;
      font-variant-numeric:tabular-nums;}

    /* ── Empty states ─────────────────────────────────────────────────── */
    .tech-empty{padding:30px 12px;text-align:center;color:#6b7280;font-size:12px;}
    .tech-empty strong{color:#f3f4f6;display:block;margin-bottom:6px;font-size:13px;
      letter-spacing:.5px;}

    /* ── Forms ────────────────────────────────────────────────────────── */
    .tech-form label{display:block;font:700 10px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:1.5px;color:#a855f7;
      margin:12px 0 5px;}
    .tech-form input,.tech-form select{width:100%;padding:7px 9px;background:#08070b;
      color:#f3f4f6;border:1px solid #2a1f2e;border-radius:4px;font-size:13px;
      font-family:inherit;box-sizing:border-box;transition:border-color .15s,box-shadow .15s;}
    .tech-form input:focus,.tech-form select:focus{outline:none;border-color:#a855f7;
      box-shadow:0 0 0 1px #a855f7,0 0 8px rgba(168,85,247,.3);}
    .tech-form .hint{font-size:11px;color:#6b7280;margin-top:5px;}
    .tech-form .hint a{color:#fde047;text-decoration:none;}
    .tech-form .hint a:hover{text-decoration:underline;}

    /* ── Buttons ──────────────────────────────────────────────────────── */
    .tech-btnrow{display:flex;gap:6px;margin-top:14px;flex-wrap:wrap;}
    .tech-btn{padding:8px 14px;background:#15101a;color:#e5e7eb;border:1px solid #2a1f2e;
      border-radius:4px;cursor:pointer;font:700 11px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:1px;transition:all .15s;}
    .tech-btn:hover{background:#2a1f2e;border-color:#a855f7;color:#fde047;}
    .tech-btn.primary{background:linear-gradient(180deg,#f97316 0%,#c2410c 100%);
      color:#fff;border-color:#ea580c;
      box-shadow:0 0 12px rgba(249,115,22,.35),inset 0 1px 0 rgba(255,255,255,.2);
      text-shadow:0 1px 0 rgba(0,0,0,.3);}
    .tech-btn.primary:hover{background:linear-gradient(180deg,#fb923c 0%,#ea580c 100%);
      color:#fff;border-color:#f97316;box-shadow:0 0 16px rgba(249,115,22,.55);}
    .tech-btn.danger{background:#3f0a0a;color:#fecaca;border-color:#7f1d1d;}
    .tech-btn.danger:hover{background:#7f1d1d;color:#fff;border-color:#ef4444;}

    /* ── KV grid (status) ────────────────────────────────────────────── */
    .tech-kvgrid{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px;
      margin-top:8px;}
    .tech-kvgrid .k{color:#6b7280;font-weight:600;}
    .tech-kvgrid .v{color:#e5e7eb;font-variant-numeric:tabular-nums;}
    .tech-kvgrid .v.err{color:#f87171;}
    .tech-kvgrid .v.ok {color:#34d399;}

    /* ── Tags ─────────────────────────────────────────────────────────── */
    .tech-tag{display:inline-block;padding:1px 6px;border-radius:2px;font-size:9px;
      background:#15101a;color:#9ca3af;margin-left:5px;letter-spacing:1px;
      text-transform:uppercase;font-weight:700;vertical-align:middle;}
    .tech-tag.war{background:#7f1d1d;color:#fecaca;border:1px solid #ef4444;
      box-shadow:0 0 6px rgba(239,68,68,.4);}
    .tech-tag.stealth{background:#1e1b4b;color:#c4b5fd;border:1px solid #7c3aed;}
    .tech-tag.raid{background:#3f1d1d;color:#fca5a5;border:1px solid #b91c1c;}
    .tech-tag.interrupted{background:#1f1f23;color:#9ca3af;border:1px solid #4b5563;}
    .tech-tag.effect{background:#27170a;color:#fdba74;border:1px solid #ea580c;}
    .tech-tag.dmg{background:#0a1a14;color:#86efac;border:1px solid #16a34a;
      box-shadow:0 0 4px rgba(34,197,94,.35);}
    .tech-level{display:inline-block;padding:0 5px;margin-left:6px;border-radius:2px;
      font-size:10px;font-weight:700;color:#fde047;background:#1f1b0a;
      border:1px solid #a16207;vertical-align:middle;}
    .tech-level.farm{color:#fca5a5;background:#3f1d1d;border-color:#dc2626;
      box-shadow:0 0 5px rgba(220,38,38,.5);}

    /* Your Weapons card (v0.6.64). Compact table of per-weapon performance
       sourced from DOM-hook captures. */
    .tech-weapons-sub{font-size:11px;color:#9ca3af;margin:4px 0 8px;line-height:1.4;}
    .tech-weapons-grid{display:flex;flex-direction:column;gap:1px;background:#374151;
      border:1px solid #4b5563;border-radius:4px;overflow:hidden;}
    .tech-weapons-head,.tech-weapons-row{display:grid;
      grid-template-columns:1.7fr .6fr .8fr .7fr 1.1fr;
      gap:6px;padding:6px 8px;align-items:center;background:#1f2937;
      font:600 10.5px/1.2 system-ui,sans-serif;}
    .tech-weapons-head{background:#111827;color:#94a3b8;text-transform:uppercase;
      letter-spacing:.5px;font-size:9.5px;}
    .tech-weapons-row .col-name{color:#e5e7eb;font-weight:700;}
    .tech-weapons-row .col-kind{font-size:9px;color:#6b7280;text-transform:uppercase;
      letter-spacing:.5px;display:block;margin-top:1px;}
    .tech-weapons-row .col-hits,.tech-weapons-row .col-dmg,
    .tech-weapons-row .col-avg{font-variant-numeric:tabular-nums;color:#cbd5e1;}
    .tech-weapons-row .col-bp{color:#9ca3af;font-size:10px;}
    .tech-weapons-headline{font-size:11px;color:#cbd5e1;margin-top:8px;line-height:1.4;}
    .tech-weapons-headline strong{color:#fde047;}

    /* Incoming Activity card (v0.6.66). Hour-of-day heatmap + persistent
       attackers list. The heatmap is 24 vertical bars; peak hour gets the
       ember accent so it reads at a glance. */
    .tech-incoming-sub{font-size:11px;color:#9ca3af;margin:4px 0 8px;line-height:1.4;}
    .tech-incoming-sub strong{color:#fde047;}
    .tech-hour-heatmap{display:flex;align-items:flex-end;gap:1px;height:52px;
      background:#08070b;border:1px solid #2a1f2e;border-radius:3px;
      padding:3px;margin-bottom:4px;}
    .tech-hour-bar{flex:1;min-width:0;background:#7c3aed;border-radius:1px 1px 0 0;
      min-height:2px;transition:filter .15s;}
    .tech-hour-bar.empty{background:#15101a;min-height:0;}
    .tech-hour-bar.peak{background:linear-gradient(180deg,#fb923c 0%,#ea580c 100%);
      box-shadow:0 0 6px rgba(249,115,22,.5);}
    .tech-hour-bar:hover{filter:brightness(1.3);}
    .tech-hour-axis{display:flex;font-size:9px;color:#6b7280;
      font-variant-numeric:tabular-nums;letter-spacing:.5px;margin-bottom:8px;}
    .tech-hour-axis-tick{flex:1;text-align:left;}
    .tech-incoming-persistent-title{font:600 10px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:1px;color:#9ca3af;
      margin:6px 0 4px;}

    /* Weekly Digest card (v0.6.67). Compact week-over-week comparison
       table with delta arrows tinted by direction-of-improvement. */
    .tech-digest-table{width:100%;border-collapse:collapse;font-size:11px;
      margin-top:4px;}
    .tech-digest-table th{font:600 9px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:.5px;color:#6b7280;
      text-align:right;padding:4px 6px 5px;border-bottom:1px solid #2a1f2e;}
    .tech-digest-table th:first-child{text-align:left;color:#94a3b8;}
    .tech-digest-table td{padding:4px 6px;text-align:right;
      color:#cbd5e1;font-variant-numeric:tabular-nums;}
    .tech-digest-table td:first-child{text-align:left;color:#e5e7eb;font-weight:600;}
    .tech-digest-table tr:not(:last-child) td{border-bottom:1px solid #15101a;}
    .tech-digest-table .last{color:#6b7280;}
    .tech-digest-table .delta.good{color:#34d399;}
    .tech-digest-table .delta.bad {color:#fca5a5;}
    .tech-digest-table .delta.flat{color:#9ca3af;}
    .tech-digest-table .delta .arrow{margin-right:2px;font-weight:700;}

    /* Clickable row affordance — set on fight rows + top-opponent rows that
       have a known opponentId, so clicking drills into Opponent Intel. */
    .tech-row.clickable,.tech-oprow.clickable{cursor:pointer;}
    .tech-row.clickable:hover,.tech-oprow.clickable:hover{background:#15101a;}

    /* Opponent Intel drill view. Rendered in place of the active tab when
       currentDrill is set. Reuses .tech-card / .tech-grid / .tech-bar from
       the dashboard, so this block is just the extras the drill needs. */
    .tech-intel-back{display:inline-flex;align-items:center;gap:6px;
      padding:6px 12px;background:#15101a;border:1px solid #2a1f2e;
      border-radius:4px;color:#cbd5e1;cursor:pointer;font:700 10px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;}
    .tech-intel-back:hover{border-color:#a855f7;color:#fde047;background:#1f1326;}
    .tech-intel-name{font:800 17px/1.1 Impact,'Oswald','Arial Narrow',sans-serif;
      color:#f3f4f6;letter-spacing:.05em;margin-bottom:3px;
      display:flex;align-items:center;flex-wrap:wrap;gap:6px;}
    .tech-intel-name a{color:#c4b5fd;text-decoration:none;}
    .tech-intel-name a:hover{color:#fde047;}
    .tech-intel-sub{font-size:11px;color:#9ca3af;margin-bottom:10px;line-height:1.4;}
    .tech-intel-sub a{color:#c4b5fd;text-decoration:none;}
    .tech-intel-sub a:hover{color:#fde047;}
    .tech-intel-verdict{display:inline-block;padding:5px 12px;border-radius:3px;
      font:800 12px/1 system-ui,sans-serif;text-transform:uppercase;letter-spacing:1.5px;
      background:#1f1f23;color:#9ca3af;border:1px solid #4b5563;margin-bottom:8px;}
    .tech-intel-verdict.fav{background:#0a2e1f;color:#34d399;border-color:#059669;
      box-shadow:0 0 10px rgba(52,211,153,.35);}
    .tech-intel-verdict.tank{background:#3a2a0a;color:#fbbf24;border-color:#d97706;
      box-shadow:0 0 10px rgba(251,191,36,.35);}
    .tech-intel-verdict.danger{background:#3f1d1d;color:#fca5a5;border-color:#dc2626;
      box-shadow:0 0 12px rgba(220,38,38,.55);}
    .tech-intel-verdict.stale{font-style:italic;}
    .tech-intel-blurb{font-size:11px;color:#9ca3af;line-height:1.5;margin-bottom:14px;
      font-style:italic;}
    .tech-effect-list{display:flex;flex-wrap:wrap;gap:4px;}

    /* Leveling Trap Detector card. Severity tints the verdict + left edge. */
    .tech-trap{border-left:3px solid #4b5563;padding-left:10px;}
    .tech-trap.good{border-left-color:#34d399;}
    .tech-trap.warn{border-left-color:#fbbf24;}
    .tech-trap.bad {border-left-color:#dc2626;box-shadow:inset 4px 0 12px -8px rgba(220,38,38,.6);}
    .tech-trap-verdict{font-size:18px;font-weight:800;letter-spacing:.04em;margin:4px 0;}
    .tech-trap.good .tech-trap-verdict{color:#34d399;}
    .tech-trap.warn .tech-trap-verdict{color:#fbbf24;text-shadow:0 0 6px rgba(251,191,36,.4);}
    .tech-trap.bad  .tech-trap-verdict{color:#fca5a5;text-shadow:0 0 8px rgba(220,38,38,.6);}
    .tech-trap-line{color:#d1d5db;font-size:12px;margin-bottom:6px;}
    .tech-trap-line strong{color:#fde047;}
    .tech-trap-hint{color:#9ca3af;font-size:11px;line-height:1.4;font-style:italic;}
    /* Build Coherence Checker (v0.5.0) */
    .tech-build{border-left:3px solid #4b5563;padding-left:10px;}
    .tech-build.aligned{border-left-color:#34d399;}
    .tech-build.drift  {border-left-color:#fbbf24;}
    .tech-build.off    {border-left-color:#dc2626;box-shadow:inset 4px 0 12px -8px rgba(220,38,38,.6);}
    .tech-build.unset  {border-left-color:#6b7280;}
    .tech-build-goal{color:#a78bfa;font-weight:600;letter-spacing:.02em;}
    .tech-intel-verdict.aligned{background:#0a2e1f;color:#34d399;border:1px solid #059669;}
    .tech-intel-verdict.drift  {background:#3a2a0a;color:#fbbf24;border:1px solid #d97706;}
    .tech-intel-verdict.off    {background:#3f1d1d;color:#fca5a5;border:1px solid #dc2626;text-shadow:0 0 8px rgba(220,38,38,.6);}
    .tech-intel-verdict.unset  {background:#1f2937;color:#9ca3af;border:1px solid #4b5563;font-style:italic;}
    .tech-build-bars{margin:8px 0 6px;display:flex;flex-direction:column;gap:4px;}
    .tech-build-bar{display:flex;align-items:center;gap:8px;font-size:11px;}
    .tech-build-bar .name{flex:0 0 64px;color:#d1d5db;}
    .tech-build-bar .track{flex:1;position:relative;height:10px;background:#1f2937;border:1px solid #374151;border-radius:2px;overflow:visible;}
    .tech-build-bar .fill{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:2px;}
    .tech-build-bar .target{position:absolute;top:-2px;bottom:-2px;width:2px;background:#fde047;box-shadow:0 0 4px rgba(253,224,71,.6);}
    .tech-build-bar .pct{flex:0 0 42px;text-align:right;color:#cbd5e1;font-variant-numeric:tabular-nums;}
    .tech-build-line{color:#d1d5db;font-size:12px;margin-top:6px;}
    .tech-build-line strong{color:#fde047;}
    .tech-build-hint{color:#9ca3af;font-size:11px;line-height:1.4;font-style:italic;margin-top:4px;}
    .tech-build-violation{color:#fca5a5;font-size:11px;margin-top:2px;}
    .tech-build-action{color:#fde047;font-size:12px;margin-top:6px;}
    .tech-build-action strong{color:#fbbf24;}

    /* v0.7 Phase 3 — soft-score dots inline with the verdict pill, and
       the new Loadout alignment section below the stat bars. Dots are
       just Unicode glyphs (⬤ ◯); the .aligned/drift/off classes pick
       a colour so the dots visually echo the verdict. */
    .tech-build-dots{font-weight:600;font-variant-numeric:tabular-nums;
      letter-spacing:.05em;}
    .tech-build-dots.aligned{color:#34d399;}
    .tech-build-dots.drift  {color:#fbbf24;}
    .tech-build-dots.off    {color:#fca5a5;}
    .tech-build-loadout{margin-top:10px;padding-top:8px;
      border-top:1px dashed #2a1f2e;}
    .tech-build-loadout-title{font:700 9px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:1.5px;color:#a855f7;
      margin-bottom:4px;}
    .tech-build-loadout-score{font-size:12px;color:#d1d5db;line-height:1.4;}
    .tech-build-loadout-score strong{color:#fb923c;letter-spacing:.3px;}
    .tech-build-loadout-ok{color:#34d399;font-weight:600;}
    .tech-build-loadout-bad{color:#fca5a5;font-weight:600;
      text-shadow:0 0 4px rgba(220,38,38,.35);}
    .tech-build-loadout-neutral{color:#9ca3af;font-style:italic;}
    .tech-build-loadout-breakdown{font-size:10px;color:#9ca3af;margin-top:4px;
      letter-spacing:.3px;font-variant-numeric:tabular-nums;}
    .tech-build-loadout-hint{font-size:11px;color:#fde047;margin-top:6px;
      padding:5px 8px;background:#1f1326;border-left:2px solid #f97316;
      border-radius:2px;line-height:1.4;}

    /* v0.6.71 — Equipped Loadout card (Phase 1 of v0.7 Build Coherence
       rewrite). Compact stacked list of weapon slots with optional
       wiki-derived dmg/acc readout; armor pieces packed into a single
       line so the card stays vertically tight. */
    .tech-loadout{}
    .tech-loadout-meta{color:#6b7280;font-weight:500;text-transform:none;
      letter-spacing:.5px;font-size:10px;margin-left:6px;}
    .tech-loadout-row{display:flex;align-items:baseline;gap:8px;
      font-size:12px;padding:3px 0;}
    .tech-loadout-row.empty{opacity:.55;}
    .tech-loadout-slot{flex:0 0 64px;color:#a78bfa;font:700 10px/1 system-ui,sans-serif;
      text-transform:uppercase;letter-spacing:1px;}
    .tech-loadout-name{flex:1;color:#e5e7eb;font-weight:600;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
    .tech-loadout-row.empty .tech-loadout-name{color:#6b7280;font-style:italic;
      font-weight:400;}
    .tech-loadout-type{color:#6b7280;font-size:10px;
      text-transform:uppercase;letter-spacing:.5px;}
    .tech-loadout-wiki{color:#fbbf24;font-size:10px;
      font-variant-numeric:tabular-nums;text-shadow:0 0 4px rgba(251,191,36,.25);}
    .tech-loadout-armor-row{display:flex;align-items:baseline;gap:8px;
      font-size:11px;padding:5px 0 2px;margin-top:4px;
      border-top:1px dashed #2a1f2e;}
    .tech-loadout-armor-line{color:#cbd5e1;flex:1;
      font-variant-numeric:tabular-nums;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}

    /* v0.7 Phase 2 — Effect family + archetype rows on the Loadout card.
       Family row sits directly under armor with the same dashed-border
       treatment, but uses an ember accent on the family name to mark it
       as the derived signal (vs the raw gear above). Archetype row uses
       a left-edge violet bar that visually echoes the Build Coherence
       card's verdict pill — the two cards work together as Phase 3's
       2-axis verdict. */
    .tech-loadout-family-row{display:flex;align-items:baseline;gap:8px;
      font-size:11px;padding:6px 0 2px;margin-top:5px;
      border-top:1px dashed #2a1f2e;}
    .tech-loadout-family-name{color:#fb923c;font-weight:700;
      letter-spacing:.5px;font-size:11px;}
    .tech-loadout-family-evidence{color:#9ca3af;font-size:10px;flex:1;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
    .tech-loadout-archetype{margin:6px 0 0;padding:6px 8px 7px;
      background:#0f0a12;border:1px solid #2a1f2e;border-left:3px solid #a855f7;
      border-radius:3px;}
    .tech-loadout-archetype-name{display:block;font:800 13px/1.1 Impact,'Oswald','Arial Narrow',sans-serif;
      color:#fde047;letter-spacing:.05em;
      text-shadow:0 0 6px rgba(168,85,247,.35);}
    .tech-loadout-archetype-blurb{display:block;font-size:11px;color:#cbd5e1;
      margin-top:3px;line-height:1.4;}
    .tech-loadout-archetype.mismatch{border-left-color:#6b7280;}
    .tech-loadout-archetype.mismatch .tech-loadout-archetype-blurb{
      color:#9ca3af;font-style:italic;}

    /* Leveling Roadmap — v0.6.0 feature #9 */
    .tech-roadmap{border-left:3px solid #4b5563;padding-left:10px;}
    .tech-roadmap-line{color:#d1d5db;font-size:12px;margin:4px 0 8px;}
    .tech-roadmap-line strong{color:#fde047;}
    .tech-roadmap-grid{display:flex;flex-direction:column;gap:1px;background:#374151;
      border:1px solid #374151;border-radius:3px;overflow:hidden;margin-bottom:8px;}
    .tech-roadmap-head,.tech-roadmap-row{display:grid;grid-template-columns:1.6fr .5fr .6fr .7fr .8fr;
      gap:6px;padding:5px 8px;font-size:11px;align-items:center;background:#111827;}
    .tech-roadmap-head{background:#1f2937;color:#9ca3af;font-weight:700;
      text-transform:uppercase;letter-spacing:.04em;font-size:10px;}
    .tech-roadmap-row .col-bracket{color:#cbd5e1;}
    .tech-roadmap-row .col-f,.tech-roadmap-row .col-wr,.tech-roadmap-row .col-rpf{
      color:#d1d5db;font-variant-numeric:tabular-nums;text-align:right;}
    .tech-roadmap-row.empty{opacity:.5;}
    .tech-roadmap-row.prime    {background:#0f1f17;}
    .tech-roadmap-row.safe     {background:#0e1a1e;}
    .tech-roadmap-row.contested{background:#1c1810;}
    .tech-roadmap-row.avoid    {background:#1e1010;}
    .tech-roadmap-tag{display:inline-block;padding:1px 6px;border-radius:8px;
      font-weight:700;font-size:9px;letter-spacing:.05em;line-height:1.4;}
    .tech-roadmap-tag.tag-prime    {background:rgba(52,211,153,.18);color:#34d399;border:1px solid rgba(52,211,153,.35);}
    .tech-roadmap-tag.tag-safe     {background:rgba(96,165,250,.18);color:#93c5fd;border:1px solid rgba(96,165,250,.35);}
    .tech-roadmap-tag.tag-contested{background:rgba(251,191,36,.18);color:#fbbf24;border:1px solid rgba(251,191,36,.35);}
    .tech-roadmap-tag.tag-avoid    {background:rgba(220,38,38,.20);color:#fca5a5;border:1px solid rgba(220,38,38,.40);}
    .tech-roadmap-tag.tag-none     {background:transparent;color:#64748b;border:1px solid transparent;}
    .tech-roadmap-headline{color:#fde047;font-size:12px;margin-top:4px;line-height:1.4;}
    .tech-roadmap-avoid{color:#fca5a5;font-size:11px;margin-top:4px;}
    .tech-roadmap-avoid strong{color:#fca5a5;}
    .tech-roadmap-waiting{border-left:3px solid #4b5563;padding-left:10px;}
    .tech-roadmap-hint{color:#9ca3af;font-size:11px;line-height:1.4;font-style:italic;}

    /* ── TEST: Battle Simulator tab ──────────────────────────────────── */
    .tech-test-row{display:flex;gap:10px;margin-top:8px;}
    .tech-test-col{flex:1;background:#0f0a12;border:1px solid #2a1f2e;border-radius:5px;padding:10px;min-width:0;}
    .tech-test-col h4{font:700 11px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1.5px;margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid #2a1f2e;
      display:flex;align-items:center;justify-content:space-between;gap:6px;}
    .tech-test-col.you h4{color:#34d399;}
    .tech-test-col.opp h4{color:#f87171;}
    .tech-test-mirror{font:700 9px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;padding:3px 6px;background:#1f1326;color:#f3f4f6;
      border:1px solid #3a2740;border-radius:3px;cursor:pointer;}
    .tech-test-mirror:hover{background:#2a1a33;border-color:#5a3960;}
    .tech-test-lvlrow{display:flex;align-items:center;gap:8px;margin-bottom:8px;
      padding-bottom:8px;border-bottom:1px dashed #2a1f2e;}
    .tech-test-lvlrow label{font:600 10px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;color:#9ca3af;margin:0;}
    .tech-test-lvlrow .lvl-input{width:56px;padding:4px 6px;background:#08070b;color:#f3f4f6;
      border:1px solid #2a1f2e;border-radius:3px;font-size:12px;font-family:inherit;
      box-sizing:border-box;font-variant-numeric:tabular-nums;}
    .tech-test-lvlrow .lvl-input:focus{outline:none;border-color:#a855f7;
      box-shadow:0 0 0 1px #a855f7;}
    .tech-test-lvlrow .hp-label{margin-left:auto;}
    .tech-test-lvlrow .hp-input{width:76px;padding:4px 6px;background:#08070b;color:#fde047;
      border:1px solid #2a1f2e;border-radius:3px;font-size:12px;font-family:inherit;
      font-weight:700;box-sizing:border-box;font-variant-numeric:tabular-nums;}
    .tech-test-lvlrow .hp-input::placeholder{color:#6b5d2e;font-weight:500;}
    .tech-test-lvlrow .hp-input:focus{outline:none;border-color:#fde047;
      box-shadow:0 0 0 1px rgba(253,224,71,.4);}
    .tech-test-statgrid{display:grid;grid-template-columns:auto 1fr;gap:5px 8px;align-items:center;}
    .tech-test-statgrid label{font:600 10px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;color:#9ca3af;margin:0;}
    .tech-test-statgrid input{padding:4px 6px;background:#08070b;color:#f3f4f6;
      border:1px solid #2a1f2e;border-radius:3px;font-size:12px;font-family:inherit;
      box-sizing:border-box;font-variant-numeric:tabular-nums;width:100%;}
    .tech-test-statgrid input:focus{outline:none;border-color:#a855f7;
      box-shadow:0 0 0 1px #a855f7;}
    .tech-test-total{margin-top:8px;font-size:11px;color:#9ca3af;text-align:right;
      font-variant-numeric:tabular-nums;}
    .tech-test-total strong{color:#fde047;}
    .tech-test-wpnrow{display:flex;align-items:center;gap:8px;margin-top:8px;
      padding-top:8px;border-top:1px dashed #2a1f2e;}
    .tech-test-wpnrow label{font:600 10px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;color:#9ca3af;margin:0;}
    .tech-test-wpnrow .wpn-select{flex:1;padding:4px 6px;background:#08070b;color:#f3f4f6;
      border:1px solid #2a1f2e;border-radius:3px;font-size:12px;font-family:inherit;}
    .tech-test-wpnrow .wpn-select:focus{outline:none;border-color:#a855f7;
      box-shadow:0 0 0 1px #a855f7;}
    .tech-test-runbar{display:flex;align-items:center;gap:10px;margin-top:12px;
      padding:10px;background:#0f0a12;border:1px solid #2a1f2e;border-radius:5px;}
    .tech-test-runbar label{font:600 10px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;color:#9ca3af;margin:0;}
    .tech-test-runbar select{padding:5px 7px;background:#08070b;color:#f3f4f6;
      border:1px solid #2a1f2e;border-radius:3px;font-size:12px;font-family:inherit;}
    .tech-test-runbar .spacer{flex:1;}
    .tech-test-results{margin-top:12px;}
    .tech-test-resultbar{height:26px;background:#15101a;border:1px solid #2a1f2e;
      border-radius:4px;display:flex;overflow:hidden;}
    .tech-test-resultbar .seg{display:flex;align-items:center;justify-content:center;
      font:700 11px/1 system-ui,sans-serif;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.5);
      letter-spacing:.5px;min-width:0;overflow:hidden;white-space:nowrap;}
    .tech-test-resultbar .seg.win{background:linear-gradient(180deg,#34d399 0%,#10b981 100%);}
    .tech-test-resultbar .seg.draw{background:#4b5563;}
    .tech-test-resultbar .seg.loss{background:linear-gradient(180deg,#f87171 0%,#dc2626 100%);}
    .tech-test-resultmeta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;
      margin-top:8px;font-size:11px;color:#9ca3af;font-variant-numeric:tabular-nums;text-align:center;}
    .tech-test-resultmeta .cell{background:#0f0a12;border:1px solid #2a1f2e;border-radius:4px;padding:6px 4px;}
    .tech-test-resultmeta .lbl{font:600 9px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1px;color:#6b7280;margin-bottom:3px;}
    .tech-test-resultmeta .val{font:800 14px/1 Impact,'Oswald','Arial Narrow',sans-serif;color:#e5e7eb;}
    .tech-test-resultmeta .cell.win .val{color:#34d399;}
    .tech-test-resultmeta .cell.loss .val{color:#f87171;}
    .tech-test-resultmeta .cell.draw .val{color:#cbd5e1;}
    .tech-test-foot{margin-top:8px;font-size:10px;color:#6b7280;font-style:italic;text-align:center;
      letter-spacing:.5px;}
    /* v0.6.21 — per-region damage panel. Two-column grid below the result
       cells, one panel per side. Coverage color codes: red = uncovered,
       amber = partial (the leak rows), green = full. */
    .tech-test-regiongrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}
    .tech-test-regionpanel{background:#0f0a12;border:1px solid #2a1f2e;border-radius:5px;
      padding:8px 10px;min-width:0;}
    .tech-test-regionpanel h5{font:700 10px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:.08em;color:#9ca3af;margin:0 0 7px;}
    .tech-test-regionpanel.you h5{color:#34d399;}
    .tech-test-regionpanel.opp h5{color:#f87171;}
    .tech-test-regionpanel h5 .arm{color:#cbd5e1;font-weight:600;font-size:9px;}
    .tech-test-regiontable{width:100%;border-collapse:collapse;font-size:10px;
      color:#e5e7eb;font-variant-numeric:tabular-nums;}
    .tech-test-regiontable th{font:600 8px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:.05em;color:#6b7280;text-align:right;padding:3px 4px 4px;
      border-bottom:1px solid #2a1f2e;}
    .tech-test-regiontable th:first-child{text-align:left;}
    .tech-test-regiontable td{padding:3px 4px;text-align:right;color:#cbd5e1;}
    .tech-test-regiontable td:first-child{text-align:left;color:#e5e7eb;}
    .tech-test-regiontable tr:not(:last-child) td{border-bottom:1px solid #1a1320;}
    .tech-test-regiontable .cov-none{color:#f87171;font-weight:700;}
    .tech-test-regiontable .cov-partial{color:#fbbf24;font-weight:700;}
    .tech-test-regiontable .cov-full{color:#34d399;}
    .tech-test-regionpanel .hint{margin-top:5px;font-size:9px;color:#6b7280;
      font-style:italic;line-height:1.3;}

    /* Active-Page Banner (v0.6.24) — clickable verdict shortcut shown at
       the top of every tab when the current Torn URL names an opponent
       (profile/attack page). Left-edge color codes the verdict at a
       glance: green favorable, amber tanky, red dangerous, grey unknown
       or no-history. */
    .tech-activebanner{display:flex;align-items:center;gap:8px;padding:8px 10px;
      margin-bottom:10px;border-radius:5px;cursor:pointer;
      background:#15101a;border:1px solid #2a1f2e;border-left:3px solid #6b7280;
      transition:background .15s,border-color .15s,transform .1s;}
    .tech-activebanner:hover{border-color:#a855f7;background:#1f1326;}
    .tech-activebanner:active{transform:scale(0.99);}
    .tech-activebanner .tech-activebanner-icon{color:#a855f7;font-size:14px;
      flex-shrink:0;line-height:1;}
    .tech-activebanner .tech-activebanner-text{flex:1;font-size:11px;color:#cbd5e1;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tech-activebanner .tech-activebanner-text strong{color:#f3f4f6;}
    .tech-activebanner .verdict{font-weight:700;letter-spacing:.5px;}
    .tech-activebanner .tech-activebanner-arrow{color:#6b7280;font-size:13px;
      flex-shrink:0;line-height:1;}
    .tech-activebanner:hover .tech-activebanner-arrow{color:#fde047;}
    .tech-activebanner.verdict-fav    {border-left-color:#34d399;}
    .tech-activebanner.verdict-fav    .verdict{color:#34d399;}
    .tech-activebanner.verdict-tank   {border-left-color:#fbbf24;}
    .tech-activebanner.verdict-tank   .verdict{color:#fbbf24;}
    .tech-activebanner.verdict-danger {border-left-color:#dc2626;
      box-shadow:inset 4px 0 12px -8px rgba(220,38,38,.6);}
    .tech-activebanner.verdict-danger .verdict{color:#fca5a5;
      text-shadow:0 0 6px rgba(220,38,38,.6);}
    .tech-activebanner.verdict-stale  {border-left-color:#6b7280;}
    .tech-activebanner.verdict-stale  .verdict{color:#9ca3af;font-style:italic;}
    .tech-activebanner.verdict-unknown,
    .tech-activebanner.verdict-neutral,
    .tech-activebanner.verdict-nohistory{border-left-color:#6b7280;}
    .tech-activebanner.verdict-unknown  .verdict,
    .tech-activebanner.verdict-nohistory .verdict{color:#9ca3af;font-style:italic;}
    .tech-activebanner.verdict-neutral  .verdict{color:#cbd5e1;}

    /* ── WAR scorecard hero (v0.6.36) ─────────────────────────────────
       Big at-a-glance war stats shown above the regular cards when the
       WAR pill is active. Visually distinct — gradient backdrop, ember
       accent on the top edge — so the Dashboard reads as "war mode" at
       a glance. */
    .tech-warscore{margin-bottom:12px;padding:10px 12px;border-radius:6px;
      background:linear-gradient(180deg,#1a0f1a 0%,#0f0a12 100%);
      border:1px solid #2a1f2e;position:relative;overflow:hidden;}
    .tech-warscore::before{content:'';position:absolute;left:0;right:0;top:0;height:2px;
      background:linear-gradient(90deg,#dc2626 0%,#f97316 50%,#dc2626 100%);
      box-shadow:0 0 8px rgba(220,38,38,.5);}
    .tech-warscore-title{font:800 11px/1 Impact,'Oswald','Arial Narrow',sans-serif;
      letter-spacing:2px;color:#fca5a5;text-transform:uppercase;margin-bottom:9px;
      text-shadow:0 0 6px rgba(220,38,38,.4);}
    /* v0.6.77 — post-war variant. Cooler ember (less alarm-red) + subdued
       top edge mark that the war's over, not running. Ended-Xh-ago + enemy
       subtitle sits inline with the title in a quieter colour. */
    .tech-warscore.postwar::before{background:linear-gradient(90deg,#7c3aed 0%,#f97316 50%,#7c3aed 100%);
      box-shadow:0 0 6px rgba(168,85,247,.4);}
    .tech-warscore.postwar .tech-warscore-title{color:#fde047;
      text-shadow:0 0 6px rgba(168,85,247,.4);}
    .tech-warscore-ended{color:#9ca3af;font-weight:600;letter-spacing:.5px;
      text-transform:none;font-size:9px;}
    .tech-warscore-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
    .tech-warscore-cell{background:#08070b;border:1px solid #2a1f2e;border-radius:4px;
      padding:7px 10px;}
    .tech-warscore-cell .big{font:800 19px/1.05 Impact,'Oswald','Arial Narrow',sans-serif;
      color:#f3f4f6;letter-spacing:.5px;font-variant-numeric:tabular-nums;}
    .tech-warscore-cell .lbl{font:700 9px/1 system-ui,sans-serif;text-transform:uppercase;
      letter-spacing:1.2px;color:#6b7280;margin-top:3px;}
    .tech-warscore-cell.good .big{color:#34d399;text-shadow:0 0 8px rgba(52,211,153,.3);}
    .tech-warscore-cell.bad  .big{color:#f87171;text-shadow:0 0 8px rgba(248,113,113,.3);}
    .tech-warscore-hosps{margin-top:8px;padding-top:7px;border-top:1px solid #2a1f2e;
      font-size:11px;color:#9ca3af;text-align:center;}
    .tech-warscore-hosps .good{color:#34d399;}
    .tech-warscore-hosps .bad {color:#f87171;}
    .tech-warscore-hosps .sep {color:#2a1f2e;margin:0 4px;}
    .tech-warscore-hosps strong{font-variant-numeric:tabular-nums;}

    /* ── SCOUT tab (v0.6.34) ─────────────────────────────────────────── */
    .tech-scout-form{display:flex;gap:6px;margin-top:8px;}
    .tech-scout-id{flex:1;padding:7px 9px;background:#08070b;color:#f3f4f6;
      border:1px solid #2a1f2e;border-radius:4px;font-size:13px;font-family:inherit;
      box-sizing:border-box;font-variant-numeric:tabular-nums;}
    .tech-scout-id:focus{outline:none;border-color:#a855f7;
      box-shadow:0 0 0 1px #a855f7,0 0 8px rgba(168,85,247,.3);}
    .tech-scout-status{margin-top:6px;font-size:11px;color:#6b7280;min-height:14px;}
    .tech-scout-status.ok  {color:#34d399;}
    .tech-scout-status.err {color:#f87171;}
    .tech-scout-status.spin{color:#fde047;}
    .tech-scout-controls{display:flex;align-items:center;gap:10px;margin-top:10px;
      padding:7px 8px;background:#0f0a12;border:1px solid #2a1f2e;border-radius:4px;
      flex-wrap:wrap;}
    .tech-scout-ctrl{display:flex;align-items:center;gap:6px;font-size:10px;
      color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:1px;}
    .tech-scout-ctrl .tech-scout-sort{padding:4px 6px;background:#08070b;color:#f3f4f6;
      border:1px solid #2a1f2e;border-radius:3px;font-size:11px;font-family:inherit;
      text-transform:none;letter-spacing:normal;font-weight:normal;}
    .tech-scout-ctrl .tech-scout-sort:focus{outline:none;border-color:#a855f7;
      box-shadow:0 0 0 1px #a855f7;}
    .tech-scout-ctrl-toggle{display:flex;align-items:center;gap:5px;font-size:10px;
      color:#9ca3af;cursor:pointer;font-weight:700;text-transform:uppercase;
      letter-spacing:1px;user-select:none;}
    .tech-scout-ctrl-toggle input{margin:0;cursor:pointer;accent-color:#a855f7;}
    .tech-scout-ctrl-toggle:hover{color:#fde047;}
    .tech-scout-header{margin-top:14px;padding-bottom:5px;border-bottom:1px solid #2a1f2e;
      font-size:12px;color:#e5e7eb;}
    .tech-scout-header strong{color:#f3f4f6;font:800 13px/1.1 Impact,'Oswald','Arial Narrow',sans-serif;
      letter-spacing:.05em;}
    .tech-scout-faction-link{color:inherit;text-decoration:none;cursor:pointer;
      border-bottom:1px dashed transparent;transition:color .15s,border-color .15s;}
    .tech-scout-faction-link:hover{color:#fde047;border-bottom-color:#a855f7;}
    .tech-scout-meta{color:#9ca3af;font-size:11px;}
    .tech-scout-summary{margin-top:8px;font-size:10px;color:#9ca3af;
      display:flex;flex-wrap:wrap;gap:0 6px;font-weight:700;letter-spacing:.5px;}
    .tech-scout-summary .verdict-danger   {color:#fca5a5;text-shadow:0 0 4px rgba(220,38,38,.5);}
    .tech-scout-summary .verdict-tank     {color:#fbbf24;}
    .tech-scout-summary .verdict-fav      {color:#34d399;}
    .tech-scout-summary .verdict-neutral  {color:#cbd5e1;}
    .tech-scout-summary .verdict-stale    {color:#9ca3af;font-style:italic;}
    .tech-scout-summary .verdict-unknown  {color:#9ca3af;font-style:italic;}
    .tech-scout-summary .verdict-nohistory{color:#6b7280;}
    .tech-scout-row{display:flex;align-items:center;gap:8px;padding:6px 4px;
      border-bottom:1px solid #15101a;font-size:12px;border-left:3px solid transparent;
      padding-left:6px;cursor:pointer;}
    .tech-scout-row:hover{background:#15101a;}
    .tech-scout-row.verdict-danger    {border-left-color:#dc2626;
      box-shadow:inset 4px 0 12px -8px rgba(220,38,38,.6);}
    .tech-scout-row.verdict-tank      {border-left-color:#fbbf24;}
    .tech-scout-row.verdict-fav       {border-left-color:#34d399;}
    .tech-scout-row.verdict-stale     {border-left-color:#6b7280;}
    .tech-scout-row.verdict-neutral   {border-left-color:#4b5563;}
    .tech-scout-row.verdict-unknown   {border-left-color:#4b5563;}
    .tech-scout-row.verdict-nohistory {border-left-color:#1f2937;}
    .tech-scout-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
    .tech-scout-name{color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      display:flex;align-items:center;gap:4px;min-width:0;}
    .tech-scout-name a{color:#c4b5fd;text-decoration:none;font-weight:600;
      overflow:hidden;text-overflow:ellipsis;}
    .tech-scout-name a:hover{color:#fde047;}
    .tech-scout-verdict{font-size:10px;color:#9ca3af;font-variant-numeric:tabular-nums;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    /* v0.6.69 — hospital/jail/fed countdown badge on Scout rows.
       Locked rows render "Hosp 14:23" in a slightly hotter color so it
       reads at a glance during war prep. The .tech-scout-countdown-elapsed
       state takes over once the countdown ticks to zero — greys out so the
       user knows the row's state is provisional until next poll. */
    .tech-scout-countdown{color:#fca5a5;font-weight:600;
      text-shadow:0 0 4px rgba(220,38,38,.35);}
    .tech-scout-countdown-elapsed{color:#6b7280 !important;font-weight:400 !important;
      text-shadow:none !important;font-style:italic;}
    .tech-scout-status-tag{color:#60a5fa;font-weight:600;}
    .tech-scout-verdict .verdict{font-weight:700;letter-spacing:.5px;margin-right:2px;}
    .tech-scout-row.verdict-danger    .tech-scout-verdict .verdict{color:#fca5a5;
      text-shadow:0 0 4px rgba(220,38,38,.5);}
    .tech-scout-row.verdict-tank      .tech-scout-verdict .verdict{color:#fbbf24;}
    .tech-scout-row.verdict-fav       .tech-scout-verdict .verdict{color:#34d399;}
    .tech-scout-row.verdict-stale     .tech-scout-verdict .verdict{color:#9ca3af;font-style:italic;}
    .tech-scout-row.verdict-neutral   .tech-scout-verdict .verdict{color:#cbd5e1;}
    .tech-scout-row.verdict-unknown   .tech-scout-verdict .verdict{color:#9ca3af;font-style:italic;}
    .tech-scout-row.verdict-nohistory .tech-scout-verdict .verdict{color:#6b7280;font-style:italic;}

    /* Target queue (v0.6.39) — Dashboard pinned opponents + star toggle */
    .tech-star-btn{margin-left:auto;background:transparent;border:1px solid #2a1f2e;
      color:#c4b5fd;border-radius:4px;padding:3px 9px;
      font:700 10px/1 system-ui,sans-serif;letter-spacing:1px;
      text-transform:uppercase;cursor:pointer;}
    .tech-star-btn:hover{border-color:#a855f7;color:#fde047;background:#1f1326;}
    .tech-star-btn.starred{border-color:#fbbf24;color:#fde047;background:#1f1326;
      box-shadow:0 0 8px rgba(251,191,36,.3);}
    .tech-star-btn.starred:hover{border-color:#fca5a5;color:#fca5a5;box-shadow:none;}
    .tech-targets-title{display:flex;align-items:center;gap:8px;}
    .tech-targets-count{margin-left:auto;font:600 10px/1.1 system-ui,sans-serif;
      color:#9ca3af;text-transform:none;letter-spacing:.5px;}
    .tech-targets-refresh{margin-left:6px;background:transparent;border:1px solid #2a1f2e;
      color:#c4b5fd;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;
      line-height:1;}
    .tech-targets-refresh:hover{border-color:#a855f7;color:#fde047;background:#1f1326;}
    .tech-targets-refresh.spin{color:#fde047;border-color:#5b21b6;}
    .tech-targets-hint{margin-top:6px;font-size:10px;color:#6b7280;font-style:italic;}
    .tech-target-row{display:flex;align-items:center;gap:8px;padding:6px 6px;
      border-bottom:1px solid #15101a;border-left:3px solid transparent;
      font-size:12px;cursor:pointer;}
    .tech-target-row:hover{background:#15101a;}
    .tech-target-row.verdict-danger    {border-left-color:#dc2626;
      box-shadow:inset 4px 0 12px -8px rgba(220,38,38,.6);}
    .tech-target-row.verdict-tank      {border-left-color:#fbbf24;}
    .tech-target-row.verdict-fav       {border-left-color:#34d399;}
    .tech-target-row.verdict-stale     {border-left-color:#6b7280;}
    .tech-target-row.verdict-neutral   {border-left-color:#4b5563;}
    .tech-target-row.verdict-unknown   {border-left-color:#4b5563;}
    .tech-target-row.verdict-nohistory {border-left-color:#1f2937;}
    .tech-target-dot{flex:0 0 10px;width:10px;height:10px;border-radius:50%;
      background:#4b5563;box-shadow:0 0 0 1px rgba(0,0,0,.4);}
    .tech-target-dot.online {background:#34d399;box-shadow:0 0 6px rgba(52,211,153,.7);}
    .tech-target-dot.idle   {background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,.6);}
    .tech-target-dot.offline{background:#6b7280;}
    .tech-target-dot.locked {background:#ef4444;box-shadow:0 0 6px rgba(239,68,68,.6);}
    .tech-target-dot.abroad {background:#60a5fa;box-shadow:0 0 6px rgba(96,165,250,.5);}
    .tech-target-main{flex:1;min-width:0;}
    .tech-target-name{color:#e5e7eb;font-weight:600;display:flex;align-items:center;
      gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .tech-target-sub{font-size:10px;color:#9ca3af;margin-top:2px;
      letter-spacing:.5px;font-variant-numeric:tabular-nums;}
    .tech-target-sub .verdict{font-weight:700;}
    .tech-target-row.verdict-danger    .tech-target-sub .verdict{color:#fca5a5;
      text-shadow:0 0 4px rgba(220,38,38,.5);}
    .tech-target-row.verdict-tank      .tech-target-sub .verdict{color:#fbbf24;}
    .tech-target-row.verdict-fav       .tech-target-sub .verdict{color:#34d399;}
    .tech-target-row.verdict-stale     .tech-target-sub .verdict{color:#9ca3af;font-style:italic;}
    .tech-target-row.verdict-neutral   .tech-target-sub .verdict{color:#cbd5e1;}
    .tech-target-row.verdict-unknown   .tech-target-sub .verdict{color:#9ca3af;font-style:italic;}
    .tech-target-row.verdict-nohistory .tech-target-sub .verdict{color:#6b7280;font-style:italic;}
    .tech-target-meta{color:#9ca3af;text-transform:none;letter-spacing:0;}
    .tech-target-unstar{background:transparent;border:0;color:#6b7280;cursor:pointer;
      font-size:14px;padding:2px 6px;line-height:1;border-radius:4px;flex-shrink:0;}
    .tech-target-unstar:hover{color:#fca5a5;background:#1f1326;}

    /* v0.6.40 — energy chip + HIT badge + hittable-row glow */
    .tech-targets-energy{margin-left:6px;padding:2px 7px;border-radius:3px;
      font:700 10px/1 system-ui,sans-serif;letter-spacing:.5px;
      text-transform:none;font-variant-numeric:tabular-nums;
      border:1px solid #2a1f2e;background:#08070b;}
    .tech-targets-energy.has{color:#34d399;border-color:#059669;
      box-shadow:0 0 6px rgba(52,211,153,.25);}
    .tech-targets-energy.low{color:#9ca3af;}
    .tech-hit-badge{display:inline-flex;align-items:center;padding:1px 7px;
      margin-left:6px;border-radius:3px;
      font:800 9px/1.4 system-ui,sans-serif;letter-spacing:1.2px;
      color:#0a2e1f;background:linear-gradient(180deg,#34d399 0%,#10b981 100%);
      border:1px solid #059669;text-shadow:none;text-decoration:none;
      cursor:pointer;
      box-shadow:0 0 8px rgba(52,211,153,.55);
      animation:tech-hit-pulse 2s ease-in-out infinite;}
    .tech-hit-badge:hover{filter:brightness(1.1);text-decoration:none;color:#0a2e1f;}
    @keyframes tech-hit-pulse{
      0%,100%{box-shadow:0 0 6px rgba(52,211,153,.45);}
      50%    {box-shadow:0 0 12px rgba(52,211,153,.85);}
    }
    .tech-target-row.hittable{background:rgba(16,185,129,.06);}
    .tech-target-row.hittable:hover{background:rgba(16,185,129,.12);}

    /* v0.6.42 — Faction Power Profile summary lines. Each sub-block in
       the section starts with a one-line label/summary; the bars use the
       existing tech-bar layout. */
    .tech-power-summary{color:#d1d5db;font-size:11px;margin-bottom:6px;}
    .tech-power-summary strong{color:#fde047;font-weight:700;}
    .tech-power-second{margin-top:10px;}

    /* v0.6.45 — Chain pill. Top of Dashboard during active chain or
       post-break cooldown. Urgency class drives the border + glow color;
       under 60s adds a heartbeat pulse so peripheral vision catches it. */
    .tech-chain-pill{margin-bottom:11px;padding:8px 12px;border-radius:6px;
      background:linear-gradient(180deg,#15101a 0%,#0f0a12 100%);
      border:1px solid #2a1f2e;font-size:12px;
      transition:border-color .25s,box-shadow .25s;}
    .tech-chain-pill.active.urgency-safe{border-color:#059669;
      box-shadow:0 0 8px rgba(52,211,153,.25);}
    .tech-chain-pill.active.urgency-safe .tech-chain-icon{color:#34d399;}
    .tech-chain-pill.active.urgency-safe .tech-chain-timer{color:#34d399;}
    .tech-chain-pill.active.urgency-warning{border-color:#d97706;
      box-shadow:0 0 10px rgba(251,191,36,.40);}
    .tech-chain-pill.active.urgency-warning .tech-chain-icon{color:#fbbf24;}
    .tech-chain-pill.active.urgency-warning .tech-chain-timer{color:#fbbf24;}
    .tech-chain-pill.active.urgency-urgent{border-color:#dc2626;
      box-shadow:0 0 12px rgba(220,38,38,.55);
      animation:tech-chain-pulse 1.1s ease-in-out infinite;}
    .tech-chain-pill.active.urgency-urgent .tech-chain-icon{color:#fca5a5;
      text-shadow:0 0 6px rgba(220,38,38,.65);}
    .tech-chain-pill.active.urgency-urgent .tech-chain-timer{color:#fca5a5;
      font-weight:800;}
    @keyframes tech-chain-pulse{
      0%,100%{box-shadow:0 0 8px rgba(220,38,38,.4);}
      50%    {box-shadow:0 0 18px rgba(220,38,38,.85);}
    }
    .tech-chain-pill.cooldown{border-color:#1e3a5f;color:#9ca3af;}
    .tech-chain-pill.cooldown .tech-chain-icon{color:#60a5fa;}
    .tech-chain-pill.cooldown .tech-chain-timer{color:#93c5fd;}
    /* v0.6.70 — dual chain pill (Dashboard war mode). Two pills side-by-
       side, each flexes to fill its column. Idle/error states render as
       muted variants so the pair stays visually balanced when one side
       has nothing going. */
    .tech-chain-pair{display:flex;gap:8px;margin-bottom:11px;}
    .tech-chain-pair > .tech-chain-pill{flex:1;min-width:0;margin-bottom:0;}
    .tech-chain-pill.nopair{margin-bottom:0;}
    .tech-chain-pill.idle{border-color:#2a1f2e;background:#0c0a0f;}
    .tech-chain-pill.idle .tech-chain-icon{color:#6b7280;}
    .tech-chain-pill.idle .tech-chain-label{color:#9ca3af;}
    .tech-chain-pill.idle .tech-chain-idle-text{color:#6b7280;font-style:italic;
      font-size:11px;}
    .tech-chain-pill.error{border-color:#7f1d1d;background:#1a0a0a;}
    .tech-chain-pill.error .tech-chain-icon{color:#fca5a5;}
    .tech-chain-pill.error .tech-chain-error-text{color:#fca5a5;font-size:11px;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
    /* In paired mode the body needs to wrap tighter (~200px per pill). */
    .tech-chain-pair .tech-chain-body{flex-wrap:wrap;row-gap:2px;}
    .tech-chain-pair .tech-chain-label{font-size:10px;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      max-width:140px;}
    .tech-chain-body{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
    .tech-chain-icon{font-size:14px;line-height:1;}
    .tech-chain-label{color:#cbd5e1;font-weight:700;letter-spacing:.5px;
      text-transform:uppercase;font-size:10px;}
    .tech-chain-count{color:#fde047;font-weight:800;font-size:14px;
      font-variant-numeric:tabular-nums;letter-spacing:.5px;}
    .tech-chain-timer{font-variant-numeric:tabular-nums;font-weight:700;}
    .tech-chain-mod{color:#fde047;font-weight:700;
      font-variant-numeric:tabular-nums;}
    .tech-chain-sep{color:#4b5563;font-weight:400;}
  `);

  // v0.6.46 — Scrape chain state directly from Torn's left sidebar. The
  // API path (fetchSelfState in bars) is fine when polls are flowing, but
  // during rate-limit storms — exactly when chains matter most — the
  // last cached `meta.chain` can be missing or minutes stale. Torn's
  // sidebar shows "Chain: N/M  MM:SS" in clear text, refreshed every
  // second by Torn itself. We can read it free, instantly, no API call,
  // no waiting. Returns null when the sidebar isn't present (some Torn
  // pages collapse it) or when no chain is active.
  //
  // Doesn't return a respect modifier — the sidebar doesn't show one. The
  // pill just hides the modifier line when DOM-sourced; tradeoff is well
  // worth never missing a chain timer because of rate-limits.
  function readChainFromTornDom() {
    try {
      // Scope the search to Torn's sidebar root if present; fall back to
      // body. Either way, exclude our own panel — our chain pill renders
      // text like "Chain 47 · 4:23 to break" which would otherwise be
      // self-matched in a feedback loop.
      const root = document.getElementById('sidebarroot') || document.body;
      if (!root) return null;
      const techPanel = document.querySelector('.tech-panel');
      // Snapshot text without our panel. The cheapest way is to walk the
      // root's direct children, skipping the panel.
      let text = '';
      for (const child of root.children) {
        if (techPanel && (child === techPanel || child.contains(techPanel))) continue;
        text += (child.innerText || child.textContent || '') + '\n';
      }
      if (!text) return null;
      // "Chain:" or "Chain" + count + timer. Gap between fields tolerant
      // of whitespace, line breaks, and Torn's variable interstitial markup.
      // The 60-char gap cap prevents matching across unrelated content.
      const re = /\bChain:?\s*(\d+)\s*\/\s*(\d+)\s*[\s\S]{0,60}?(\d{1,2}):(\d{2})/i;
      const m = re.exec(text);
      if (!m) return null;
      const current = parseInt(m[1], 10);
      const max     = parseInt(m[2], 10);
      const mins    = parseInt(m[3], 10);
      const secs    = parseInt(m[4], 10);
      if (!Number.isFinite(current) || !Number.isFinite(mins) || !Number.isFinite(secs)) return null;
      if (current <= 0) return null;                // no chain
      if (mins > 59 || secs > 59) return null;      // sanity
      const remaining = mins * 60 + secs;
      if (remaining <= 0) return null;
      return {
        current,
        max,
        timeoutAt:  nowSec() + remaining,
        modifier:   null,    // not surfaced in Torn's sidebar
        cooldownAt: 0,
        fetchedAt:  nowSec(),
        source:     'dom',
      };
    } catch (e) { return null; }
  }

  // v0.6.48 — Scrape energy from Torn's sidebar, same pattern as chain.
  // Torn's left sidebar shows "Energy: 250/150 OVER" (or similar) and
  // updates it live as energy ticks. Reading it locally costs zero API
  // budget and is always current. We use it to override the cached
  // meta.energy at render time, so canHitTarget() sees real-time energy
  // without needing to ping bars every poll cycle.
  //
  // Returns { current, maximum } or null. The "OVER" suffix and any
  // tick-time text after the numbers are ignored — we only need the
  // two integers.
  function readEnergyFromTornDom() {
    try {
      const root = document.getElementById('sidebarroot') || document.body;
      if (!root) return null;
      const techPanel = document.querySelector('.tech-panel');
      let text = '';
      for (const child of root.children) {
        if (techPanel && (child === techPanel || child.contains(techPanel))) continue;
        text += (child.innerText || child.textContent || '') + '\n';
      }
      if (!text) return null;
      const m = /\bEnergy:?\s*(\d+)\s*\/\s*(\d+)/i.exec(text);
      if (!m) return null;
      const current = parseInt(m[1], 10);
      const maximum = parseInt(m[2], 10);
      if (!Number.isFinite(current) || !Number.isFinite(maximum)) return null;
      return { current, maximum, ts: nowSec(), source: 'dom' };
    } catch (e) { return null; }
  }

  // ─── CHAIN PILL (v0.6.45) ──────────────────────────────────────────────
  // Live chain timer at the top of the Dashboard. Renders three states:
  //   - active:    "⛓ Chain 47 · 4:23 to break · 1.5× respect" — color
  //                 escalates green → amber → red pulse as timeout drops
  //   - cooldown:  "⛓ Cooldown · 28s until ready" — neutral blue
  //   - idle:      nothing (don't clutter the Dashboard with "no chain")
  // The countdown is updated every second by a setInterval that
  // self-cancels when the timer node leaves the DOM (tab switch / drill).
  function renderChainPill(host, opts) {
    opts = opts || {};
    const label = opts.label || 'Chain';
    const forceIdle = !!opts.forceIdle;     // v0.6.70 — render idle placeholder
    const skipMargin = !!opts.skipMargin;   // v0.6.70 — drop margin-bottom when in pair

    // Clear any prior ticker so we don't stack callbacks when the panel
    // re-renders (poll cycle, settings change, etc.).
    if (chainTickerInterval) {
      clearInterval(chainTickerInterval);
      chainTickerInterval = null;
    }

    function buildIdleState(text) {
      const cls = 'tech-chain-pill idle' + (skipMargin ? ' nopair' : '');
      host.appendChild(el('div', { class: cls },
        el('div', { class: 'tech-chain-body' },
          el('span', { class: 'tech-chain-icon' }, '⛓'),
          el('span', { class: 'tech-chain-label' }, label),
          el('span', { class: 'tech-chain-sep' }, '·'),
          el('span', { class: 'tech-chain-idle-text' }, text),
        ),
      ));
    }

    // v0.6.46 — prefer Torn's sidebar over the cached API state. The
    // sidebar updates every second and works during API rate-limits;
    // meta.chain is the fallback for pages where the sidebar isn't
    // rendered (rare, but happens on some Torn views).
    const c = readChainFromTornDom() || meta.chain;
    if (!c) {
      if (forceIdle) buildIdleState('No active chain');
      return;
    }
    const now = nowSec();
    const isActive   = c.current > 0 && c.timeoutAt > now;
    const isCooldown = !isActive && c.cooldownAt > now;
    if (!isActive && !isCooldown) {
      if (forceIdle) buildIdleState('No active chain');
      return;  // idle — no pill
    }

    let pillClass = 'tech-chain-pill';
    if (skipMargin) pillClass += ' nopair';
    let body;
    let targetTs;
    let suffix;

    if (isActive) {
      const remaining = c.timeoutAt - now;
      let urgency = 'safe';
      if (remaining < 60)       urgency = 'urgent';
      else if (remaining < 120) urgency = 'warning';
      pillClass += ' active urgency-' + urgency;

      targetTs = c.timeoutAt;
      suffix   = ' to break';

      const modStr = c.modifier > 1
        ? c.modifier.toFixed(2).replace(/\.?0+$/, '') + '× respect'
        : null;
      const initial = fmtCountdown(targetTs) || '0:00';

      body = el('div', { class: 'tech-chain-body' },
        el('span', { class: 'tech-chain-icon' }, '⛓'),
        el('span', { class: 'tech-chain-label' }, label),
        el('span', { class: 'tech-chain-count' }, String(c.current)),
        el('span', { class: 'tech-chain-sep' }, '·'),
        el('span', { class: 'tech-chain-timer' }, initial + suffix),
        modStr
          ? el('span', { class: 'tech-chain-sep' }, '·')
          : null,
        modStr
          ? el('span', { class: 'tech-chain-mod' }, modStr)
          : null,
      );
    } else {
      pillClass += ' cooldown';
      targetTs = c.cooldownAt;
      suffix   = ' until ready';
      const initial = fmtCountdown(targetTs) || '0:00';
      body = el('div', { class: 'tech-chain-body' },
        el('span', { class: 'tech-chain-icon' }, '⛓'),
        el('span', { class: 'tech-chain-label' }, label + ' cooldown'),
        el('span', { class: 'tech-chain-sep' }, '·'),
        el('span', { class: 'tech-chain-timer' }, initial + suffix),
      );
    }

    const pillEl = el('div', { class: pillClass }, body);
    host.appendChild(pillEl);

    // Live tick the countdown every second. Self-cancels when the timer
    // node leaves the DOM (tab switch, drill, panel close) or when the
    // countdown elapses (chain breaks / cooldown ends — the next poll
    // will re-render with the new state).
    const timerEl = pillEl.querySelector('.tech-chain-timer');
    chainTickerInterval = setInterval(function () {
      if (!timerEl || !timerEl.isConnected) {
        clearInterval(chainTickerInterval);
        chainTickerInterval = null;
        return;
      }
      const cd = fmtCountdown(targetTs);
      if (!cd) {
        // Countdown elapsed — clear and let the next poll re-render.
        clearInterval(chainTickerInterval);
        chainTickerInterval = null;
        timerEl.textContent = (isActive ? 'broken' : 'ready');
        return;
      }
      timerEl.textContent = cd + suffix;

      // v0.6.45 — re-escalate urgency class as timer ticks down. Without
      // this the pill would stay green/amber until the next poll redraws.
      if (isActive) {
        const rem = targetTs - nowSec();
        let next = 'safe';
        if (rem < 60)       next = 'urgent';
        else if (rem < 120) next = 'warning';
        if (!pillEl.classList.contains('urgency-' + next)) {
          pillEl.classList.remove('urgency-safe', 'urgency-warning', 'urgency-urgent');
          pillEl.classList.add('urgency-' + next);
        }
      }
    }, 1000);
  }

  // ─── FACTION CHAIN PILL (v0.6.50) ──────────────────────────────────────
  // Enemy faction chain timer for the Faction Intel drill. Reuses the same
  // .tech-chain-pill CSS as the Dashboard's own-chain pill so the visual
  // language (green safe / amber <120s / red pulse <60s) is consistent
  // across "my chain" and "their chain." Below the pill we surface the
  // fetched-at age + a manual ↻ button so the user can force-refresh
  // without waiting out the 30s throttle.
  //
  // Three render states:
  //   active   → "⛓ Enemy chain 47/100 · 4:23 to break · 1.5× respect"
  //   cooldown → "⛓ Enemy cooldown · 28s until ready"
  //   error    → "⛓ Chain unavailable: <error>"
  //   idle     → "No active chain" (muted)
  //
  // Self-cancelling tick: same pattern as renderChainPill — the interval
  // checks `.isConnected` every second and clears itself when the timer
  // node leaves the DOM (tab switch, drill close, etc.).
  function renderFactionChainPill(host, factionId, opts) {
    opts = opts || {};
    const compact = !!opts.compact;          // v0.6.70 — skip header row
    const skipMargin = !!opts.skipMargin;    // v0.6.70 — drop margin-bottom
    const label = opts.label || 'Enemy chain';

    if (factionChainTickerInterval) {
      clearInterval(factionChainTickerInterval);
      factionChainTickerInterval = null;
    }

    const cached = factionChainCache[factionId];

    function buildStatePill(stateClass, text) {
      const cls = 'tech-chain-pill ' + stateClass + (skipMargin ? ' nopair' : '');
      host.appendChild(el('div', { class: cls },
        el('div', { class: 'tech-chain-body' },
          el('span', { class: 'tech-chain-icon' }, '⛓'),
          el('span', { class: 'tech-chain-label' }, label),
          el('span', { class: 'tech-chain-sep' }, '·'),
          el('span', { class: 'tech-chain-' + stateClass + '-text' }, text),
        ),
      ));
    }

    if (!compact) {
      // Header row — title + manual refresh button. Standalone (drill) mode
      // only; compact mode drops it for the side-by-side dashboard pair.
      const fetchedAge = (cached && cached.fetchedAt)
        ? fmtAgo(cached.fetchedAt)
        : 'never';
      const headerRow = el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px',
                 marginBottom: '6px', fontSize: '10px',
                 textTransform: 'uppercase', letterSpacing: '1.2px',
                 color: '#a855f7', fontWeight: '700' },
      },
        el('span', {}, 'Enemy chain'),
        el('span', { style: { color: '#6b7280', fontWeight: '500',
                              textTransform: 'none', letterSpacing: '.5px' } },
          '· last poll ' + fetchedAge),
        el('button', {
          type: 'button',
          class: 'tech-targets-refresh',
          title: 'Refresh enemy chain now',
          style: { marginLeft: 'auto' },
          'on:click': function () {
            maybeRefreshFactionChain(factionId, true);
          },
        }, '↻'),
      );
      host.appendChild(headerRow);
    }

    if (!cached) {
      if (compact) { buildStatePill('idle', 'loading…'); return; }
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: '#6b7280', fontStyle: 'italic',
                 marginBottom: '11px' },
      }, 'Fetching enemy chain state…'));
      return;
    }

    if (cached.error) {
      if (compact) { buildStatePill('error', '⚠ ' + cached.error); return; }
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: '#f87171', marginBottom: '11px' },
      }, '⚠ ' + cached.error));
      return;
    }

    const now = nowSec();
    const isActive   = cached.current > 0 && cached.timeoutAt > now;
    const isCooldown = !isActive && cached.cooldownAt > now;

    if (!isActive && !isCooldown) {
      if (compact) { buildStatePill('idle', 'No active chain'); return; }
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: '#6b7280', marginBottom: '11px' },
      }, 'No active chain.'));
      return;
    }

    let pillClass = 'tech-chain-pill';
    if (skipMargin) pillClass += ' nopair';
    let body;
    let targetTs;
    let suffix;

    if (isActive) {
      const remaining = cached.timeoutAt - now;
      let urgency = 'safe';
      if (remaining < 60)       urgency = 'urgent';
      else if (remaining < 120) urgency = 'warning';
      pillClass += ' active urgency-' + urgency;

      targetTs = cached.timeoutAt;
      suffix   = ' to break';

      const modStr = cached.modifier > 1
        ? cached.modifier.toFixed(2).replace(/\.?0+$/, '') + '× respect'
        : null;
      const initial = fmtCountdown(targetTs) || '0:00';
      const countText = cached.max > 0
        ? cached.current + '/' + cached.max
        : String(cached.current);

      body = el('div', { class: 'tech-chain-body' },
        el('span', { class: 'tech-chain-icon' }, '⛓'),
        el('span', { class: 'tech-chain-label' }, label),
        el('span', { class: 'tech-chain-count' }, countText),
        el('span', { class: 'tech-chain-sep' }, '·'),
        el('span', { class: 'tech-chain-timer' }, initial + suffix),
        modStr ? el('span', { class: 'tech-chain-sep' }, '·') : null,
        modStr ? el('span', { class: 'tech-chain-mod' }, modStr) : null,
      );
    } else {
      pillClass += ' cooldown';
      targetTs = cached.cooldownAt;
      suffix   = ' until ready';
      const initial = fmtCountdown(targetTs) || '0:00';
      body = el('div', { class: 'tech-chain-body' },
        el('span', { class: 'tech-chain-icon' }, '⛓'),
        el('span', { class: 'tech-chain-label' }, label + ' cooldown'),
        el('span', { class: 'tech-chain-sep' }, '·'),
        el('span', { class: 'tech-chain-timer' }, initial + suffix),
      );
    }

    const pillEl = el('div', { class: pillClass }, body);
    host.appendChild(pillEl);

    const timerEl = pillEl.querySelector('.tech-chain-timer');
    factionChainTickerInterval = setInterval(function () {
      if (!timerEl || !timerEl.isConnected) {
        clearInterval(factionChainTickerInterval);
        factionChainTickerInterval = null;
        return;
      }
      const cd = fmtCountdown(targetTs);
      if (!cd) {
        clearInterval(factionChainTickerInterval);
        factionChainTickerInterval = null;
        timerEl.textContent = (isActive ? 'broken' : 'ready');
        // Auto-refresh once the local countdown elapses so the pill
        // promptly reflects the new state (broken → cooldown, or
        // cooldown → idle). Throttled by maybeRefreshFactionChain.
        maybeRefreshFactionChain(factionId, true);
        return;
      }
      timerEl.textContent = cd + suffix;
      if (isActive) {
        const rem = targetTs - nowSec();
        let next = 'safe';
        if (rem < 60)       next = 'urgent';
        else if (rem < 120) next = 'warning';
        if (!pillEl.classList.contains('urgency-' + next)) {
          pillEl.classList.remove('urgency-safe', 'urgency-warning', 'urgency-urgent');
          pillEl.classList.add('urgency-' + next);
        }
      }
    }, 1000);
  }

  // ─── DASHBOARD CHAIN PAIR (v0.6.70) ────────────────────────────────────
  // Wrapper that decides single-pill vs dual-pill render based on whether
  // TECH has auto-detected an active ranked war for the user's faction.
  //
  //   - No active war → fall through to renderChainPill (single pill,
  //     historical behaviour: idle = no pill at all).
  //   - Active war   → render TWO pills side-by-side. Both forced to
  //     render even when idle, so the user always sees both at a glance
  //     during war prep (e.g. "you have no chain, but they're at 47" is
  //     itself actionable). Left = your chain, right = enemy chain.
  //
  // The own-chain pill ticker (chainTickerInterval) and enemy-chain pill
  // ticker (factionChainTickerInterval) are independent module-level
  // handles, so the two countdowns tick in parallel without clashing.
  function renderDashboardChain(host) {
    // Throttled internally — usually a no-op (every 5min budget).
    maybeRefreshActiveWar();

    const war = meta.activeWarTarget;
    if (!war) {
      renderChainPill(host);
      return;
    }

    // Kick the enemy chain fetch so the pair has fresh data. Throttled
    // by FACTION_CHAIN_REFRESH_SEC = 30s.
    maybeRefreshFactionChain(war.factionId);

    const pair = el('div', { class: 'tech-chain-pair' });
    host.appendChild(pair);

    renderChainPill(pair, {
      label: 'You',
      forceIdle: true,
      skipMargin: true,
    });

    // Enemy label — truncate factionName to keep the pill compact when
    // both sit at ~200px wide. Tooltip carries the full name.
    const enemyLabel = war.factionName && war.factionName.length > 14
      ? war.factionName.slice(0, 13) + '…'
      : (war.factionName || 'Enemy');
    renderFactionChainPill(pair, war.factionId, {
      label: enemyLabel,
      compact: true,
      skipMargin: true,
    });
  }

  // ─── TARGET QUEUE PANEL (v0.6.39) ──────────────────────────────────────
  // Action-oriented Dashboard section. Lists pinned opponents with verdict
  // pill, live online status (dot color from Torn's last_action.status +
  // status.state), and a manual refresh control. Click a row to open the
  // Opponent Intel drill for that target. The ✕ button removes the pin.
  function renderTargetQueue(host) {
    const targets = Array.isArray(settings.targetIds) ? settings.targetIds : [];
    if (targets.length === 0) return;

    // v0.6.48 — refresh energy from Torn's sidebar before rendering.
    // The scraped value supersedes the cached API value when available.
    // Mutating meta here is safe — fetchSelfState writes the same field,
    // we're just beating it to the punch with fresh data and zero API cost.
    const domEnergy = readEnergyFromTornDom();
    if (domEnergy) meta.energy = domEnergy;

    const sec = el('div', { class: 'tech-section tech-targets' });
    const head = el('div', { class: 'tech-section-title tech-targets-title' },
      el('span', {}, 'Targets'),
      el('span', { class: 'tech-targets-count' }, targets.length + ' pinned'),
    );
    // v0.6.40 — energy chip. Surfaces "X / Y E" so the user knows at a
    // glance how many hits they can afford before reading the HIT badges.
    if (meta.energy && meta.energy.current != null) {
      const canHits = Math.floor(meta.energy.current / ATTACK_ENERGY_COST);
      const energyClass = canHits >= 1 ? 'has' : 'low';
      head.appendChild(el('span', {
        class: 'tech-targets-energy ' + energyClass,
        title: canHits + ' attack' + (canHits === 1 ? '' : 's')
             + ' available (' + ATTACK_ENERGY_COST + ' E each)',
      }, '⚡ ' + meta.energy.current + '/' + meta.energy.maximum));
    }
    const refreshBtn = el('button', {
      class: 'tech-targets-refresh' + (targetsRefreshing ? ' spin' : ''),
      type: 'button',
      title: 'Refresh target status now',
    }, targetsRefreshing ? '…' : '↻');
    refreshBtn.addEventListener('click', function () {
      refreshTargets({ force: true }).catch(function () {});
      renderActive();
    });
    head.appendChild(refreshBtn);
    sec.appendChild(head);

    // v0.6.40 — pre-compute per-target rows so we can sort hittable ones
    // to the top. Within tier, recently-active rows surface first so an
    // "online & hittable" target beats an "offline & hittable" one when
    // both could be attacked. Locked rows tier by closest-to-release.
    const rows = targets.map(function (id) {
      const s    = targetStatus[id] || {};
      const sum  = lookupOpponentSummary(id);
      const state = s.statusState || null;
      const canHit = canHitTarget(s);
      // Tier: 0 = hittable Okay, 1 = Okay but can't hit (low energy or
      // self locked), 2 = locked (Hospital/Jail/Federal), 3 = abroad.
      let tier = 1;
      if (canHit) tier = 0;
      else if (state === 'Hospital' || state === 'Jail' || state === 'Federal') tier = 2;
      else if (state === 'Traveling' || state === 'Abroad') tier = 3;
      // Sort key within tier 2 is the countdown (less time = higher prio).
      const tierKey = tier === 2 ? (s.statusUntil || Infinity) : 0;
      return { id, s, sum, state, canHit, tier, tierKey };
    });
    rows.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.tier === 2 && a.tierKey !== b.tierKey) return a.tierKey - b.tierKey;
      // Otherwise preserve pin order (stable sort).
      return 0;
    });

    for (const r of rows) {
      const { id, s, sum, state, canHit } = r;
      const name = s.name || (sum && sum.name) || ('Player ' + id);
      const level = (s.level != null) ? s.level : null;
      const lastStat = s.lastActionStatus || null;
      const lastTs   = s.lastActionTs || 0;
      const verdict  = sum && sum.verdict;
      const verdictKey   = verdict ? verdict.key   : 'nohistory';
      const verdictLabel = verdict ? verdict.label : 'NO HIST';

      // Status dot priority: locked > abroad > online > idle > offline.
      let dotClass = 'offline';
      if (state === 'Hospital' || state === 'Jail' || state === 'Federal') dotClass = 'locked';
      else if (state === 'Traveling' || state === 'Abroad') dotClass = 'abroad';
      else if (lastStat === 'Online') dotClass = 'online';
      else if (lastStat === 'Idle')   dotClass = 'idle';

      const dotTitle = (state && state !== 'Okay' ? state + ' · ' : '')
                     + (lastStat || 'Unknown')
                     + (lastTs ? ' (' + fmtAgo(lastTs) + ')' : '');

      // v0.6.40 — locked targets show a live countdown ("Hosp 14:23")
      // instead of the bare state label. We rebuild on every render +
      // poll, so accuracy is ~poll cadence (60s) — fine for chain prep.
      let stateBit = null;
      if (state === 'Hospital' || state === 'Jail' || state === 'Federal') {
        const cd = fmtCountdown(s.statusUntil);
        const tag = state === 'Hospital' ? 'Hosp' : state === 'Jail' ? 'Jail' : 'Fed';
        stateBit = cd ? (tag + ' ' + cd) : state;
      } else if (state === 'Traveling' || state === 'Abroad') {
        stateBit = state;
      }

      const subBits = [];
      if (stateBit) subBits.push(stateBit);
      if (lastTs) subBits.push('last ' + fmtAgo(lastTs));
      if (sum && sum.fightCount) subBits.push(sum.fightCount + 'f');
      // v0.6.52 — surface cached spy total when available. Doesn't trigger
      // a fetch (that would burn 1 TornStats call per pinned target on
      // every poll); just shows what's already in cache from a prior drill
      // open. "spy 1.2M" reads naturally alongside the other subBits.
      const cachedSpy = spyCache[id];
      if (cachedSpy && !cachedSpy.error && !cachedSpy.noData && cachedSpy.total != null) {
        subBits.push('spy ' + fmtNum(cachedSpy.total, 1));
      }
      if (s.error) subBits.push('err: ' + s.error);

      const nameDiv = el('div', { class: 'tech-target-name' }, name);
      if (level != null) nameDiv.appendChild(el('span', { class: 'tech-level' }, 'L' + level));
      if (canHit) {
        // v0.6.62 — badge is now a direct link to the Torn attack page for
        // this opponent. stopPropagation keeps the row's drill-into-intel
        // click from firing too, so HIT → attack page, row click → intel.
        // v0.6.63 — URL is now /page.php (Torn migrated off /loader.php and
        // the old endpoint returns "This endpoint is no longer available").
        const hitLink = el('a', {
          class: 'tech-hit-badge',
          href: 'https://www.torn.com/page.php?sid=attack&user2ID=' + id,
          title: 'Attack ' + name + ' now (' + ATTACK_ENERGY_COST + ' energy)',
        }, '⚡ HIT');
        hitLink.addEventListener('click', function (e) { e.stopPropagation(); });
        nameDiv.appendChild(hitLink);
      }

      const unstarBtn = el('button', {
        class: 'tech-target-unstar',
        type: 'button',
        title: 'Remove from Target queue',
      }, '✕');
      unstarBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTarget(id, name);
        renderActive();
      });

      const row = el('div', {
        class: 'tech-target-row verdict-' + verdictKey + (canHit ? ' hittable' : ''),
        title: 'Open Opponent Intel for ' + name,
      },
        el('span', { class: 'tech-target-dot ' + dotClass, title: dotTitle }),
        el('div', { class: 'tech-target-main' },
          nameDiv,
          el('div', { class: 'tech-target-sub' },
            el('span', { class: 'verdict' }, verdictLabel),
            subBits.length
              ? el('span', { class: 'tech-target-meta' }, ' · ' + subBits.join(' · '))
              : null,
          ),
        ),
        unstarBtn,
      );
      row.addEventListener('click', function () {
        openOpponentDrill(id, name);
      });
      sec.appendChild(row);
    }

    const anyFetched = targets.some(function (id) {
      return targetStatus[id] && targetStatus[id].fetchedAt;
    });
    if (!anyFetched) {
      sec.appendChild(el('div', { class: 'tech-targets-hint' },
        'Polling target status… refresh in a moment.'));
    }

    host.appendChild(sec);
  }

  // ─── EQUIPPED LOADOUT CARD (v0.6.71) ───────────────────────────────────
  // Renders the user's currently equipped weapons + armor pulled from
  // /v2/user/equipment. When a weapon's name matches an entry in the
  // WEAPONS table (wiki data) the row gains an inline dmg/acc readout
  // from the wiki midpoints. Below the gear: the v0.7 Phase 2 Focus row
  // (dominant effect family + evidence) and Archetype card (e.g.
  // Powerhouse Paul, Walloper Walt). The Phase 3 2-axis Build Verdict
  // lives on the Build Coherence card above this one.
  function renderEquippedLoadout(host) {
    const eq = meta.equipment;
    if (!eq || !eq.fetchedAt) return;   // silent until first fetch lands

    const card = el('div', { class: 'tech-section tech-loadout' });
    card.appendChild(el('div', { class: 'tech-section-title' },
      el('span', {}, 'Equipped Loadout'),
      el('span', { class: 'tech-loadout-meta' },
        '· polled ' + fmtAgo(eq.fetchedAt)),
    ));

    function buildSlotRow(slotKey, slotLabel) {
      const item = eq[slotKey];
      if (!item || !item.name) {
        return el('div', { class: 'tech-loadout-row empty' },
          el('span', { class: 'tech-loadout-slot' }, slotLabel),
          el('span', { class: 'tech-loadout-name' }, '— empty —'),
        );
      }
      const w = lookupWeaponByName(item.name);
      const children = [
        el('span', { class: 'tech-loadout-slot' }, slotLabel),
        el('span', { class: 'tech-loadout-name' }, item.name),
      ];
      if (item.type) {
        children.push(el('span', { class: 'tech-loadout-type' }, item.type));
      }
      if (w) {
        children.push(el('span', {
          class: 'tech-loadout-wiki',
          title: 'Wiki midpoints from the WEAPONS table — drives the TEST sim',
        }, 'dmg ' + w.dmg.toFixed(0) + ' · acc ' + w.acc.toFixed(0)));
      }
      return el('div', { class: 'tech-loadout-row' }, ...children);
    }

    card.appendChild(buildSlotRow('primary',   'Primary'));
    card.appendChild(buildSlotRow('secondary', 'Secondary'));
    card.appendChild(buildSlotRow('melee',     'Melee'));
    card.appendChild(buildSlotRow('temporary', 'Temp'));

    // Armor row — five pieces stacked into one line. Empty pieces show as
    // a dash so the user notices coverage gaps.
    const armorPieces = [];
    for (const slot of ['helmet', 'body', 'pants', 'boots', 'gloves']) {
      const item = eq[slot];
      armorPieces.push(item && item.name ? item.name : '—');
    }
    card.appendChild(el('div', { class: 'tech-loadout-armor-row' },
      el('span', { class: 'tech-loadout-slot' }, 'Armor'),
      el('span', { class: 'tech-loadout-armor-line' }, armorPieces.join(' · ')),
    ));

    // v0.7 Phase 2 — Effect family + archetype. The detector returns null
    // for vanilla loadouts (no recognized bonuses); we surface nothing in
    // that case rather than printing "no archetype" noise. When a family
    // is detected but no archetype matches the user's stat-shape, only the
    // family line renders — that's still useful info on its own.
    const family = computeLoadoutFamily(eq);
    if (family) {
      const evidenceText = family.evidence
        .slice(0, 3)
        .map(function (e) { return e.bonus + ' (' + e.weapon + ')'; })
        .join(' · ');
      card.appendChild(el('div', { class: 'tech-loadout-family-row' },
        el('span', { class: 'tech-loadout-slot' }, 'Focus'),
        el('span', { class: 'tech-loadout-family-name' }, family.dominantLabel),
        el('span', { class: 'tech-loadout-family-evidence' }, '· ' + evidenceText),
      ));
      // v0.6.80 — detectArchetype now always returns a result for any
      // detected loadout family: a mapped combo, the Snowballer wildcard
      // for self_buff, or the General fallback. The mismatch-note branch
      // is gone — every loadout-with-bonuses gets a name.
      const archetype = detectArchetype(settings.buildGoal, family.dominantKey);
      if (archetype) {
        card.appendChild(el('div', { class: 'tech-loadout-archetype' },
          el('span', { class: 'tech-loadout-archetype-name' }, archetype.name),
          el('span', { class: 'tech-loadout-archetype-blurb' }, archetype.blurb),
        ));
      }
    }

    host.appendChild(card);
  }

  // ─── QUICK WINS PANEL (v0.6.60) ────────────────────────────────────────
  // Dashboard panel that surfaces opponents ranked by chain efficiency.
  // Click any row to drill into Opponent Intel; pin from there to add live
  // status tracking. This is the DISCOVERY tool — the Targets panel above
  // is the live-status tool. Two distinct jobs, two distinct panels.
  //
  // Renders nothing when there's no usable signal (no outgoing fights
  // yet, or no opponent passes the eligibility floor). Renders a thin-data
  // hint when the user has SOME outgoing fights but no candidate passes
  // the 3-fight floor — that's actionable information.
  function renderQuickWins(host) {
    if (!meta.userId) return;
    const wins = computeQuickWins(8);
    // Count any outgoing fights so the empty state can distinguish
    // "you've never attacked" (silent) from "you've attacked but no
    // opponent has enough samples yet" (thin-data hint).
    let outgoingTotal = 0;
    for (const code in fights) {
      if (fights[code].attacker_id === meta.userId) {
        outgoingTotal++;
        if (outgoingTotal >= 5) break;
      }
    }
    if (wins.length === 0 && outgoingTotal === 0) return;  // silent

    const sec = el('div', { class: 'tech-section tech-quickwins' });
    sec.appendChild(el('div', { class: 'tech-section-title tech-targets-title' },
      el('span', {}, 'Quick Wins'),
      el('span', { class: 'tech-targets-count' },
        wins.length + ' candidate' + (wins.length === 1 ? '' : 's')),
    ));

    if (wins.length === 0) {
      sec.appendChild(el('div', { class: 'tech-targets-hint' },
        'Need 3+ outgoing fights against the same opponent (with timing data) to surface a candidate. Keep attacking; the list will fill in as patterns emerge.'));
      host.appendChild(sec);
      return;
    }

    function fmtDur(s) {
      if (!s || s < 1) return '—';
      if (s < 60) return Math.round(s) + 's';
      const m = Math.floor(s / 60);
      const r = Math.round(s % 60);
      return r > 0 ? (m + 'm ' + r + 's') : (m + 'm');
    }

    for (const w of wins) {
      const subBits = [
        (w.winRate * 100).toFixed(0) + '% over ' + w.fights + 'f',
        'avg ' + fmtDur(w.avgDuration),
        fmtRespect(w.respectPerFight) + ' resp/f',
        fmtAgo(w.lastTs),
      ];

      const nameDiv = el('div', { class: 'tech-target-name' }, w.name);
      if (w.level != null) {
        nameDiv.appendChild(el('span', { class: 'tech-level' }, 'L' + w.level));
      }
      if (w.stale < 1) {
        nameDiv.appendChild(el('span', {
          class: 'tech-tag',
          title: 'Last fought ' + fmtAgo(w.lastTs) + ' — their build may have shifted; score is penalised',
        }, 'STALE'));
      }

      const row = el('div', {
        class: 'tech-target-row verdict-fav',
        title: 'Open Opponent Intel for ' + w.name,
      },
        el('span', { class: 'tech-target-dot online',
                     title: 'Quick Win — historical chain target' }),
        el('div', { class: 'tech-target-main' },
          nameDiv,
          el('div', { class: 'tech-target-sub' },
            el('span', { class: 'tech-target-meta' }, subBits.join(' · ')),
          ),
        ),
      );
      row.addEventListener('click', function () {
        openOpponentDrill(w.id, w.name);
      });
      sec.appendChild(row);
    }

    sec.appendChild(el('div', { class: 'tech-targets-hint' },
      'Ranked from your fight history. Click a row to drill into Opponent Intel; pin from there to add live status tracking.'));

    host.appendChild(sec);
  }

  // ─── TAB: DASHBOARD ─────────────────────────────────────────────────────
  function renderDashboard(host) {
    if (!settings.apiKey) return renderNoKey(host);
    if (!meta.userId)     return renderWaiting(host, 'Identifying account…');

    const views = fightViewsInWindow(settings.windowKey);
    const o     = computeOverview(views);

    // Window selector
    host.appendChild(el('div', { class: 'tech-pillrow' },
      ...WINDOWS.map(w =>
        el('div', {
          class: 'tech-pill' + (settings.windowKey === w.key ? ' active' : ''),
          'on:click': () => { settings.windowKey = w.key; store('settings', settings); renderActive(); },
        }, w.label),
      ),
    ));

    // v0.6.45 — Chain pill above the Target queue. War-critical info: if
    // your chain is about to break, that beats everything else. Idle
    // (no chain + no cooldown) renders nothing so the Dashboard stays
    // clean during regular play.
    // v0.6.70 — Now routed through renderDashboardChain which auto-detects
    // active ranked wars and renders the enemy chain side-by-side when
    // one is in progress.
    renderDashboardChain(host);

    // v0.6.39 — Target queue panel. Above the empty-state check (like Build
    // Coherence) so it's visible even before any fights are ingested.
    renderTargetQueue(host);

    // v0.6.60 — Quick Wins panel. Chain-fight optimizer: ranked list of
    // opponents from your fight history scored by win rate, fight speed,
    // respect/fight, and recency. Discovery tool; the Targets panel above
    // is the live-status tool. Silent until you have outgoing fight data.
    renderQuickWins(host);

    // Build Coherence card (above the empty-state check so it's visible even
    // for fresh installs with no fights yet — it's stat-driven, not fight-driven).
    // v0.6.83 — when no Build Goal is picked, render a small placeholder so
    // first-time installers can discover the feature instead of silently
    // missing it. Renders a one-click jump to Settings.
    if (!settings.buildGoal) {
      const card = el('div', { class: 'tech-section tech-build unset' });
      card.appendChild(el('div', { class: 'tech-section-title' }, 'Build Coherence'));
      card.appendChild(el('div', { class: 'tech-build-hint' },
        'Pick a Build Goal in Settings to unlock the 2-axis Build Verdict. ',
        'Seven archetypes available — Powerhouse Paul, DoT Dan, Critical Cody, and more — ',
        'matched from your stats × loadout combination.'));
      const settingsBtn = el('button', { class: 'tech-btn', type: 'button' }, 'Open Settings');
      settingsBtn.addEventListener('click', function () {
        settings.activeTab = 'settings';
        store('settings', settings);
        renderActive();
      });
      card.appendChild(el('div', { class: 'tech-btnrow' }, settingsBtn));
      host.appendChild(card);
    } else if (settings.buildGoal) {
      const bc = computeBuildCoherence(meta.battleStats, settings.buildGoal, meta.level);
      const card = el('div', { class: 'tech-section tech-build ' + bc.verdict.className });
      card.appendChild(el('div', { class: 'tech-section-title' },
        'Build Coherence · ', el('span', { class: 'tech-build-goal' }, bc.goal.label)));
      // v0.7 Phase 3 — verdict pill gets the soft score + 5-dot
      // confidence visual appended after the hard-verdict label. Pill
      // colour still drives at-a-glance reading; dots+score give the
      // granular "how close are you really" answer.
      const verdictChildren = [bc.verdict.label];
      if (bc.statScore != null) {
        verdictChildren.push(el('span', { class: 'tech-build-dots ' + bc.verdict.className },
          ' · ' + dotsString(bc.statDots) + ' ' + bc.statScore));
      }
      card.appendChild(el('div', { class: 'tech-intel-verdict ' + bc.verdict.className },
        ...verdictChildren));

      if (bc.verdict.key === 'waiting') {
        card.appendChild(el('div', { class: 'tech-build-hint' },
          'Waiting for the next poll to fetch your battle stats.'));
      } else {
        // 4 distribution bars with target markers
        const bars = el('div', { class: 'tech-build-bars' });
        for (const d of bc.distribution) {
          const sharePct = (d.share * 100).toFixed(1);
          const targetPct = d.target != null ? (d.target * 100).toFixed(0) : null;
          const row = el('div', { class: 'tech-build-bar' },
            el('span', { class: 'name' }, d.label),
            el('div', { class: 'track' },
              el('div', { class: 'fill', style: { width: sharePct + '%' } }),
              targetPct != null && el('div', { class: 'target', style: { left: targetPct + '%' }, title: `Target ${targetPct}%` }),
            ),
            el('span', { class: 'pct' }, sharePct + '%'),
          );
          bars.appendChild(row);
        }
        card.appendChild(bars);

        // Stat total + recommendation
        card.appendChild(el('div', { class: 'tech-build-line' },
          'Total battle stats: ', el('strong', {}, fmtNum(meta.battleStats.total, 0)),
        ));
        if (bc.violations.length > 0) {
          for (const v of bc.violations) {
            card.appendChild(el('div', { class: 'tech-build-violation' }, '✗ ', v));
          }
        }
        if (bc.topAction) {
          card.appendChild(el('div', { class: 'tech-build-action' },
            el('strong', {}, 'Focus: '), bc.topAction));
        } else if (bc.verdict.key === 'aligned') {
          card.appendChild(el('div', { class: 'tech-build-hint' },
            bc.goal.blurb));
        }
        if (bc.simOutlook) {
          const pct = Math.round(bc.simOutlook.vsBalanced * 100);
          card.appendChild(el('div', { class: 'tech-build-hint' },
            el('strong', {}, 'Sim outlook: '),
            `vs an even-stats opponent your shape wins ~${pct}% `,
            el('span', { class: 'tech-tag' }, bc.simOutlook.calibration),
          ));
        }
        // v0.7 Phase 3 — second axis of the Build Verdict: loadout
        // coherence. Skipped entirely when the user has vanilla weapons
        // (no recognized bonuses). Otherwise surfaces score+dots,
        // dominant-family vs expected-family match status, family
        // breakdown, and mismatch hint when goal+loadout disagree.
        const loadCoh = computeLoadoutCoherence(meta.equipment, settings.buildGoal);
        if (loadCoh.ready) {
          const isGrinder = settings.buildGoal === 'grinder';
          const matchStatus = isGrinder ? 'aligned'
                            : loadCoh.matchesExpected === true ? 'aligned'
                            : loadCoh.matchesExpected === false ? 'off'
                            : 'drift';   // null = self_buff or no expectation
          card.appendChild(el('div', { class: 'tech-build-loadout' },
            el('div', { class: 'tech-build-loadout-title' }, 'Loadout alignment'),
            el('div', { class: 'tech-build-loadout-score' },
              el('span', { class: 'tech-build-dots ' + matchStatus },
                dotsString(loadCoh.loadoutDots) + ' ' + loadCoh.loadoutScore),
              ' — ',
              el('strong', {}, loadCoh.dominantLabel),
              ' focus (' + Math.round(loadCoh.dominantShare * 100) + '% of bonus value)',
              loadCoh.matchesExpected === true
                ? el('span', { class: 'tech-build-loadout-ok' }, ' ✓ matches ' + bc.goal.label)
                : loadCoh.matchesExpected === false
                  ? el('span', { class: 'tech-build-loadout-bad' },
                      ' ✗ no archetype for this combo')
                  : loadCoh.dominantKey === 'self_buff'
                    ? el('span', { class: 'tech-build-loadout-ok' }, ' ✓ Self-buff matches any goal')
                    : el('span', { class: 'tech-build-loadout-neutral' },
                        ' · ' + bc.goal.label + ' accepts any loadout'),
            ),
          ));
          // Family breakdown — only render when more than one family
          // contributed, otherwise it's just the dominant restated.
          if (loadCoh.allShares.length > 1) {
            const breakdownText = loadCoh.allShares
              .map(function (s) { return s.label + ' ' + Math.round(s.share * 100) + '%'; })
              .join(' · ');
            card.appendChild(el('div', { class: 'tech-build-loadout-breakdown' },
              'Family breakdown: ' + breakdownText));
          }
          if (loadCoh.mismatchHint) {
            card.appendChild(el('div', { class: 'tech-build-loadout-hint' },
              loadCoh.mismatchHint));
          }
        }
      }
      host.appendChild(card);
    }

    // v0.6.71 — Equipped Loadout (Phase 1 of v0.7 Build Coherence rewrite).
    // Sits right after Build Coherence so the stat-shape verdict and the
    // actual gear cluster visually. Silent until first equipment poll lands.
    renderEquippedLoadout(host);

    if (o.total === 0) {
      const isWarPill = settings.windowKey === 'war';
      host.appendChild(el('div', { class: 'tech-empty' },
        el('img', {
          class: 'tech-mascot tech-mascot-empty',
          src: MASCOT_DATA_URL,
          alt: `${SCRIPT_NAME} mascot`,
          draggable: 'false',
        }),
        el('strong', {}, isWarPill ? 'No ranked-war fights yet' : 'No fights in this window yet'),
        isWarPill
          ? 'Tagged ranked-war fights will appear here once your faction is in an active war and someone throws a punch.'
          : 'New fights appear automatically as you play. Try widening the window if you have older history.',
      ));
      return;
    }

    // v0.6.36 — WAR scorecard hero. When the WAR pill is selected we
    // surface a big at-a-glance war read above the regular stat cards.
    // Cards below still render (W/L, respect, hosps) but the scorecard
    // adds time-elapsed and respect/hour which the cards don't show, and
    // visually flips the Dashboard into "war mode."
    if (settings.windowKey === 'war') {
      const sc = computeWarScorecard(views, o);
      if (sc) {
        const winLossClass = sc.wins >= sc.losses ? 'good' : 'bad';
        const respClass = sc.respectNet >= 0 ? 'good' : 'bad';
        // v0.6.77 — post-war state flips the title to "Last War Scorecard"
        // and adds an "ended Xh ago · vs Faction" subtitle so the user reads
        // it as a final result rather than a still-running clock.
        const titleText = sc.isPostWar ? 'Last War Scorecard' : 'War Scorecard';
        const subtitle = sc.isPostWar
          ? ('ended ' + (sc.warEndedAt ? fmtAgo(sc.warEndedAt) : 'recently')
             + (sc.enemyName ? ' · vs ' + sc.enemyName : ''))
          : null;
        host.appendChild(el('div', { class: 'tech-warscore' + (sc.isPostWar ? ' postwar' : '') },
          el('div', { class: 'tech-warscore-title' }, titleText,
            subtitle ? el('span', { class: 'tech-warscore-ended' }, ' · ' + subtitle) : null,
          ),
          el('div', { class: 'tech-warscore-grid' },
            el('div', { class: 'tech-warscore-cell ' + winLossClass },
              el('div', { class: 'big' }, sc.wins + ' / ' + sc.losses),
              el('div', { class: 'lbl' }, 'W / L'),
            ),
            el('div', { class: 'tech-warscore-cell ' + respClass },
              el('div', { class: 'big' }, fmtRespect(sc.respectNet)),
              el('div', { class: 'lbl' }, 'Net respect'),
            ),
            el('div', { class: 'tech-warscore-cell' },
              el('div', { class: 'big' }, fmtElapsed(sc.elapsedSec)),
              el('div', { class: 'lbl' }, 'Elapsed'),
            ),
            el('div', { class: 'tech-warscore-cell' },
              el('div', { class: 'big' }, fmtNum(sc.respectPerHour, 1) + '/h'),
              el('div', { class: 'lbl' }, 'Respect pace'),
            ),
          ),
          el('div', { class: 'tech-warscore-hosps' },
            el('span', { class: 'good' },
              el('strong', {}, String(sc.koDelivered)), ' KO’d them'),
            el('span', { class: 'sep' }, ' · '),
            el('span', { class: (sc.koTaken === 0 ? 'good' : 'bad') },
              el('strong', {}, String(sc.koTaken)), ' got KO’d'),
          ),
        ));
      }
    }

    // Top stats grid
    host.appendChild(el('div', { class: 'tech-grid' },
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Fights'),
        el('div', { class: 'value' }, fmtNum(o.total, 0)),
        el('div', { class: 'sub'   }, `${o.attackerCount} att / ${o.defenderCount} def`),
      ),
      el('div', { class: 'tech-card ' + (o.winRate >= 0.5 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Win rate'),
        el('div', { class: 'value' }, fmtPct(o.winRate)),
        el('div', { class: 'sub'   }, `${o.wins}W / ${o.losses}L`),
      ),
      el('div', { class: 'tech-card ' + (o.respectTotal >= 0 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Respect'),
        el('div', { class: 'value' }, fmtRespect(o.respectTotal)),
        el('div', { class: 'sub'   }, `${o.respectGained.toFixed(1)} gain · ${o.respectLost.toFixed(1)} loss`),
      ),
    ));

    host.appendChild(el('div', { class: 'tech-grid' },
      el('div', { class: 'tech-card good' },
        el('div', { class: 'label' }, 'Hospitalised them'),
        el('div', { class: 'value' }, fmtNum(o.hospThem, 0)),
        el('div', { class: 'sub'   }, o.attackerCount > 0
          ? fmtPct(o.hospThem / o.attackerCount) + ' of attacks' : '—'),
      ),
      el('div', { class: 'tech-card ' + (o.hospMe === 0 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Got hospitalised'),
        el('div', { class: 'value' }, fmtNum(o.hospMe, 0)),
        el('div', { class: 'sub'   }, o.defenderCount > 0
          ? fmtPct(o.hospMe / o.defenderCount) + ' of defends' : '—'),
      ),
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Respect/bar'),
        el('div', { class: 'value' }, fmtNum(o.respectPerBar, 1)),
        el('div', { class: 'sub'   }, `${fmtNum(o.respectPerEnergy, 3)} per energy`),
      ),
    ));

    // Weekly Digest (v0.6.67) — fixed 7-day window comparison vs the
    // prior 7 days, independent of which window pill is active. Sits
    // right after the stats grids so the "current snapshot" and
    // "week-over-week trend" reads cluster together at the top.
    const wd = computeWeeklyDigest();
    if (wd.ready) {
      const card = el('div', { class: 'tech-section' });
      card.appendChild(el('div', { class: 'tech-section-title' }, 'Weekly Digest'));

      // Direction-of-improvement hints. "up" = positive delta is good,
      // "down" = negative delta is good, "flat" = neutral magnitude.
      // Used by renderRow to colour the arrow + delta cell.
      function renderRow(label, thisVal, lastVal, formatter, betterDir) {
        const fmtVal = function (v) {
          if (v == null) return '—';
          return formatter(v);
        };
        let deltaCell;
        if (thisVal == null || lastVal == null) {
          deltaCell = el('td', { class: 'delta flat' }, '—');
        } else {
          const d = thisVal - lastVal;
          if (Math.abs(d) < 1e-9) {
            deltaCell = el('td', { class: 'delta flat' },
              el('span', { class: 'arrow' }, '·'), formatter(0));
          } else {
            let goodness = 'flat';
            if (betterDir === 'up')   goodness = d > 0 ? 'good' : 'bad';
            if (betterDir === 'down') goodness = d < 0 ? 'good' : 'bad';
            const arrow = d > 0 ? '▲' : '▼';
            const sign = d > 0 ? '+' : '−';
            deltaCell = el('td', { class: 'delta ' + goodness },
              el('span', { class: 'arrow' }, arrow),
              sign + formatter(Math.abs(d)));
          }
        }
        return el('tr', {},
          el('td', {}, label),
          el('td', {}, fmtVal(thisVal)),
          el('td', { class: 'last' }, fmtVal(lastVal)),
          deltaCell,
        );
      }

      const fmtInt = function (n) { return fmtNum(Math.round(n), 0); };
      const fmtPctRow = function (n) { return (n * 100).toFixed(0) + '%'; };
      const fmtRespRow = function (n) { return n.toFixed(2); };
      const fmtLvlRow  = function (n) { return 'L' + n.toFixed(0); };

      const t = wd.thisWeek, l = wd.lastWeek;
      const table = el('table', { class: 'tech-digest-table' },
        el('thead', {},
          el('tr', {},
            el('th', {}, 'Metric'),
            el('th', {}, 'This week'),
            el('th', {}, 'Last week'),
            el('th', {}, 'Δ'),
          ),
        ),
        el('tbody', {},
          renderRow('Fights',           t.total,            l.total,            fmtInt,     'flat'),
          renderRow('Outgoing',         t.attCount,         l.attCount,         fmtInt,     'flat'),
          renderRow('Incoming',         t.defCount,         l.defCount,         fmtInt,     'down'),
          renderRow('Win rate',         t.winRate,          l.winRate,          fmtPctRow,  'up'),
          renderRow('Respect net',      t.respectNet,       l.respectNet,       fmtRespRow, 'up'),
          renderRow('Hosp\'d them',     t.hospThem,         l.hospThem,         fmtInt,     'up'),
          renderRow('Got hosp\'d',      t.hospMe,           l.hospMe,           fmtInt,     'down'),
          renderRow('Avg attacker lvl', t.avgAttackerLevel, l.avgAttackerLevel, fmtLvlRow,  'down'),
        ),
      );
      card.appendChild(table);
      host.appendChild(card);
    }

    // Leveling Trap Detector v0.1 — only renders once we have ≥3 incoming
    // fights with attacker_level (i.e., non-stealthed, post-v0.3.0). Silent
    // when there isn't enough signal yet.
    const lt = computeLevelTrap(views);
    if (lt.ready) {
      const hint = lt.verdict === 'OUT-STATTING'
        ? `High-level players attack you but bounce off your stats — classic stat-builder territory. Your build is doing its job.`
        : lt.severity === 'bad'
        ? `Players ${LEVEL_TRAP_GAP}+ levels above are farming you successfully. Classic chain-fodder profile — slow XP gain, stat-grind before further levels, or hide (federal/hospital) during peak chain hours.`
        : lt.severity === 'warn'
        ? `Some attackers are well above your level. Watch the rate — if it climbs, you're approaching farm-target territory.`
        : `Incoming attacks are roughly proportionate to your level. No farm-target signal.`;
      const trapChildren = [
        el('div', { class: 'tech-section-title' }, 'Leveling Trap Detector'),
        el('div', { class: 'tech-trap-verdict' }, lt.verdict),
        el('div', { class: 'tech-trap-line' },
          `You: L${lt.myLevel} · Incoming avg L${lt.avgIncomingLevel.toFixed(0)} (max L${lt.maxIncomingLevel}) · `,
          el('strong', {}, `${lt.farmCount}/${lt.incomingCount}`),
          ` attacker${lt.incomingCount === 1 ? '' : 's'} ≥${LEVEL_TRAP_GAP} above you`,
        ),
      ];
      if (lt.farmDecided > 0) {
        trapChildren.push(el('div', { class: 'tech-trap-line' },
          `Of those, you `,
          el('strong', {}, `${lt.farmWins}W / ${lt.farmLosses}L`),
          ` (${(lt.farmLossRate * 100).toFixed(0)}% loss rate)`,
        ));
      }
      trapChildren.push(el('div', { class: 'tech-trap-hint' }, hint));
      host.appendChild(el('div', { class: 'tech-section tech-trap ' + lt.severity }, ...trapChildren));
    }

    // Incoming Activity (v0.6.66) — defender-side patterns. Hour-of-day
    // heatmap shows WHEN you get hit (local time); persistent-attackers
    // list shows WHO keeps coming back. Sits right after Leveling Trap so
    // all defender-side analytics group together visually.
    const ia = computeIncomingActivity(views);
    if (ia.ready) {
      const card = el('div', { class: 'tech-section' });
      card.appendChild(el('div', { class: 'tech-section-title' }, 'Incoming Activity'));

      const pad2 = function (n) { return n < 10 ? '0' + n : String(n); };
      const defenseBit = (ia.defenseRate != null)
        ? `, defended ${(ia.defenseRate * 100).toFixed(0)}% (${ia.winsAsDefender}W / ${ia.lossesAsDefender}L)`
        : '';
      card.appendChild(el('div', { class: 'tech-incoming-sub' },
        el('strong', {}, String(ia.totalIncoming)),
        ` attack${ia.totalIncoming === 1 ? '' : 's'} taken in window. Peak hour: `,
        el('strong', {}, pad2(ia.peakHour) + ':00 local'),
        ` (${ia.peakCount} hit${ia.peakCount === 1 ? '' : 's'})${defenseBit}.`,
      ));

      // 24-bar hour heatmap. Heights scale to peak count; peak hour gets
      // the ember accent. Tooltips show exact counts on hover.
      const heat = el('div', { class: 'tech-hour-heatmap' });
      const maxCount = Math.max.apply(null, ia.hourBuckets) || 1;
      for (let h = 0; h < 24; h++) {
        const count = ia.hourBuckets[h];
        const heightPx = count > 0 ? Math.max(2, Math.round((count / maxCount) * 44)) : 0;
        const cls = 'tech-hour-bar'
          + (count === 0 ? ' empty' : '')
          + (h === ia.peakHour && count > 0 ? ' peak' : '');
        heat.appendChild(el('div', {
          class: cls,
          style: { height: heightPx + 'px' },
          title: pad2(h) + ':00 — ' + count + ' attack' + (count === 1 ? '' : 's'),
        }));
      }
      card.appendChild(heat);

      // Axis ticks every 6 hours so users can read the X-axis without
      // hovering every bar. Flex 1/24 per tick aligns with the bars above.
      const axis = el('div', { class: 'tech-hour-axis' });
      for (let h = 0; h < 24; h++) {
        axis.appendChild(el('div', { class: 'tech-hour-axis-tick' },
          (h % 6 === 0) ? pad2(h) : ''));
      }
      card.appendChild(axis);

      // Persistent attackers list. Only renders when at least one opponent
      // hit you ≥2 times in the window — single-hit attackers are noise,
      // not pattern. Clickable rows drill into Opponent Intel.
      if (ia.persistent.length > 0) {
        card.appendChild(el('div', { class: 'tech-incoming-persistent-title' },
          'Repeat attackers (' + ia.persistent.length + ')'));
        for (const a of ia.persistent) {
          const wlStr = a.count > 0
            ? a.wins + 'W / ' + a.losses + 'L'
            : '—';
          const row = el('div', { class: 'tech-oprow clickable' },
            el('div', { class: 'name' },
              el('a', {
                href: 'https://www.torn.com/profiles.php?XID=' + a.id,
                target: '_blank', rel: 'noopener',
              }, a.name),
              a.level != null
                ? el('span', { class: 'tech-level' }, 'L' + a.level)
                : null,
            ),
            el('div', { class: 'wl' }, a.count + ' hit' + (a.count === 1 ? '' : 's') + ' · ' + wlStr),
            el('div', { class: 'resp' }, fmtAgo(a.lastTs)),
          );
          row.addEventListener('click', function (e) {
            if (e.target.closest('a')) return;
            openOpponentDrill(a.id, a.name);
          });
          card.appendChild(row);
        }
      }
      host.appendChild(card);
    }

    // Difficulty Roadmap v0.2 — vision feature #9. Where you should hunt.
    // Bucketed win rate + respect/fight over outgoing fights, by fair_fight
    // modifier (Torn's stat-differential measure). Labels:
    // PRIME / SAFE / CONTESTED / AVOID / THIN. Only renders once we have
    // at least 5 outgoing fights carrying fair_fight (post-v0.3.0 v2 polls).
    const rm = computeLevelingRoadmap(views);
    if (rm.ready) {
      const card = el('div', { class: 'tech-section tech-roadmap' });
      card.appendChild(el('div', { class: 'tech-section-title' }, 'Difficulty Roadmap'));
      card.appendChild(el('div', { class: 'tech-roadmap-line' },
        rm.myLevel != null ? `You: L${rm.myLevel} · ` : '',
        el('strong', {}, String(rm.outgoingTotal)),
        ` outgoing fight${rm.outgoingTotal === 1 ? '' : 's'} in window. Bracketed by Torn's fair-fight modifier (stat differential).`,
      ));
      const grid = el('div', { class: 'tech-roadmap-grid' });
      // Header row
      grid.appendChild(el('div', { class: 'tech-roadmap-head' },
        el('div', { class: 'col-bracket' }, 'Bracket'),
        el('div', { class: 'col-f' }, 'Fights'),
        el('div', { class: 'col-wr' }, 'Win %'),
        el('div', { class: 'col-rpf' }, 'Resp/f'),
        el('div', { class: 'col-tag' }, ''),
      ));
      for (const b of rm.buckets) {
        const row = el('div', { class: 'tech-roadmap-row ' + b.severity + (b.empty ? ' empty' : '') },
          el('div', { class: 'col-bracket' }, b.label),
          el('div', { class: 'col-f' }, String(b.fights)),
          el('div', { class: 'col-wr' }, b.empty ? '—' : `${(b.winRate * 100).toFixed(0)}%`),
          el('div', { class: 'col-rpf' }, b.empty ? '—' : fmtNum(b.respectPerFight, 2)),
          el('div', { class: 'col-tag' },
            el('span', { class: 'tech-roadmap-tag tag-' + b.severity }, b.empty ? '' : b.label2),
          ),
        );
        grid.appendChild(row);
      }
      card.appendChild(grid);
      card.appendChild(el('div', { class: 'tech-roadmap-headline' }, rm.headline.text));
      if (rm.avoid.length > 0) {
        const avoidLabels = rm.avoid.map(b => b.label).join(', ');
        card.appendChild(el('div', { class: 'tech-roadmap-avoid' },
          'Avoid: ', el('strong', {}, avoidLabels), '.',
        ));
      }
      host.appendChild(card);
    } else if (rm.reason === 'thin-data') {
      // Show a quiet hint so user knows the feature exists and what unlocks it.
      host.appendChild(el('div', { class: 'tech-section tech-roadmap-waiting' },
        el('div', { class: 'tech-section-title' }, 'Difficulty Roadmap'),
        el('div', { class: 'tech-roadmap-hint' },
          `Need 5+ outgoing fights with fair-fight data — have ${rm.outgoingTotal || 0}. Keep attacking; the bracket map will appear here.`),
      ));
    }

    // Your Weapons (v0.6.64) — per-weapon hit/damage table from DOM-hook
    // captures. Silent until there's at least one damage-bearing outgoing
    // event; shows a quiet hint when DOM is wired but no out-hits landed yet
    // (incoming-only window).
    const wp = computeWeaponPerformance(views);
    if (wp.ready) {
      const card = el('div', { class: 'tech-section' });
      card.appendChild(el('div', { class: 'tech-section-title' }, 'Your Weapons'));
      card.appendChild(el('div', { class: 'tech-weapons-sub' },
        `From combat-log capture across ${wp.fightsWithDom} fight${wp.fightsWithDom === 1 ? '' : 's'}. `,
        `Per-hit damage isn't in the v2 API — these numbers come from the live attack page.`,
      ));
      const grid = el('div', { class: 'tech-weapons-grid' });
      grid.appendChild(el('div', { class: 'tech-weapons-head' },
        el('div', { class: 'col-name' }, 'Weapon'),
        el('div', { class: 'col-hits' }, 'Hits'),
        el('div', { class: 'col-dmg'  }, 'Total dmg'),
        el('div', { class: 'col-avg'  }, 'Avg/hit'),
        el('div', { class: 'col-bp'   }, 'Top body part'),
      ));
      for (const w of wp.weapons) {
        const bpLabel = w.topBodyPart
          ? `${w.topBodyPart} (${w.topBodyPartCount})`
          : '—';
        grid.appendChild(el('div', { class: 'tech-weapons-row' },
          el('div', { class: 'col-name' },
            w.name,
            el('span', { class: 'col-kind' }, w.kind),
          ),
          el('div', { class: 'col-hits' }, fmtNum(w.hits, 0)),
          el('div', { class: 'col-dmg'  }, fmtNum(w.damageTotal, 0)),
          el('div', { class: 'col-avg'  }, w.damageHits > 0 ? fmtNum(w.avgDamage, 0) : '—'),
          el('div', { class: 'col-bp'   }, bpLabel),
        ));
      }
      card.appendChild(grid);

      // Headline: biggest damage dealer.
      const top = wp.weapons[0];
      if (top && top.damageTotal > 0) {
        card.appendChild(el('div', { class: 'tech-weapons-headline' },
          'Top damage dealer: ',
          el('strong', {}, top.name),
          ` — ${fmtNum(top.damageTotal, 0)} damage across ${top.hits} hits (${fmtNum(top.avgDamage, 0)} avg).`,
        ));
      }
      host.appendChild(card);
    } else if (wp.fightsWithDom > 0) {
      // DOM data exists but no out-direction hits in this window (e.g. WAR
      // window before any user-initiated attack).
      host.appendChild(el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Your Weapons'),
        el('div', { class: 'tech-weapons-sub' },
          `${wp.fightsWithDom} fight${wp.fightsWithDom === 1 ? '' : 's'} with combat-log data in this window, but no outgoing hits to aggregate yet.`),
      ));
    }

    // Outcome breakdown
    const byOutcomeEntries = Object.entries(o.byOutcome)
      .sort((a, b) => b[1] - a[1]);
    if (byOutcomeEntries.length > 0) {
      const max = byOutcomeEntries[0][1];
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Outcome breakdown'),
      );
      for (const [key, count] of byOutcomeEntries) {
        const oc = OUTCOMES[key] || OUTCOMES.other;
        sec.appendChild(el('div', { class: 'tech-bar' },
          el('span', { class: 'name', style: { color: oc.color } }, oc.label),
          el('div',  { class: 'track' },
            el('div', { class: 'fill', style: { width: ((count / max) * 100).toFixed(1) + '%', background: oc.color } }),
          ),
          el('span', { class: 'count' }, String(count)),
        ));
      }
      host.appendChild(sec);
    }

    // Top opponents
    const ops = topOpponents(views, 8);
    if (ops.length > 0) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Top opponents'),
      );
      for (const op of ops) {
        const opRow = el('div', { class: 'tech-oprow clickable' },
          el('div', { class: 'name' },
            el('a', {
              href: `https://www.torn.com/profiles.php?XID=${op.id}`,
              target: '_blank', rel: 'noopener',
            }, op.name || `[${op.id}]`),
          ),
          el('div', { class: 'wl' }, `${op.fights} f · ${op.wins}W/${op.losses}L`),
          el('div', { class: 'resp' }, fmtRespect(op.respect)),
        );
        opRow.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          openOpponentDrill(op.id, op.name);
        });
        sec.appendChild(opRow);
      }
      host.appendChild(sec);
    }

    // Recent activity (last 8)
    const recent = views.slice(0, 8);
    if (recent.length > 0) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Recent activity'),
      );
      for (const v of recent) {
        sec.appendChild(renderFightRow(v, { compact: true }));
      }
      host.appendChild(sec);
    }
  }

  // ─── TAB: FIGHTS ────────────────────────────────────────────────────────
  function renderFightsTab(host) {
    if (!settings.apiKey) return renderNoKey(host);
    if (!meta.userId)     return renderWaiting(host, 'Identifying account…');

    host.appendChild(el('div', { class: 'tech-pillrow' },
      ...WINDOWS.map(w =>
        el('div', {
          class: 'tech-pill' + (settings.windowKey === w.key ? ' active' : ''),
          'on:click': () => { settings.windowKey = w.key; store('settings', settings); renderActive(); },
        }, w.label),
      ),
    ));

    const views = fightViewsInWindow(settings.windowKey);
    if (views.length === 0) {
      const isWarPill = settings.windowKey === 'war';
      host.appendChild(el('div', { class: 'tech-empty' },
        el('strong', {}, isWarPill ? 'No ranked-war fights yet' : 'No fights to show'),
        isWarPill
          ? 'Tagged ranked-war fights will appear here once your faction is in an active war.'
          : 'Try a wider time window, or wait for the next poll.',
      ));
      return;
    }

    const headerLabel = settings.windowKey === 'war'
      ? `Showing ${views.length} ranked-war fight${views.length === 1 ? '' : 's'}`
      : `Showing ${views.length} fight${views.length === 1 ? '' : 's'}`;
    host.appendChild(el('div', { class: 'tech-section-title' }, headerLabel));

    const list = el('div', {});
    for (const v of views) list.appendChild(renderFightRow(v, { compact: false }));
    host.appendChild(list);
  }

  function renderFightRow(v, { compact, suppressClick } = {}) {
    const oc = v.outcome;
    const respClass = v.respectDelta > 0 ? 'pos' : (v.respectDelta < 0 ? 'neg' : '');
    const tags = [];
    if (v.isRankedWar || v.isWar) tags.push(el('span', { class: 'tech-tag war' }, 'WAR'));
    if (v.isRaid)                 tags.push(el('span', { class: 'tech-tag raid' }, 'RAID'));
    if (v.stealthed)              tags.push(el('span', { class: 'tech-tag stealth' }, 'STEALTH'));
    if (v.isInterrupted)          tags.push(el('span', { class: 'tech-tag interrupted', title: 'This attack did not contribute to a chain (assist/interrupt).' }, 'INT'));
    // Surface up to 2 advanced-weapon kill-hit bonuses (Proficience, Plunder,
    // Demoralized, etc.) as compact tags. Tooltip shows the exact percentage.
    const effects = Array.isArray(v.finishingHitEffects) ? v.finishingHitEffects : [];
    for (let i = 0; i < Math.min(2, effects.length); i++) {
      const e = effects[i] || {};
      const name = String(e.name || '').replace(/^./, c => c.toUpperCase());
      if (!name) continue;
      tags.push(el('span', {
        class: 'tech-tag effect',
        title: `${name}: ${e.value != null ? e.value + '%' : 'on kill'}`,
      }, name));
    }

    // v0.6.4 — DOM-captured per-hit data. Show total outgoing damage as a
    // green badge with the weapon list + hit count in the tooltip.
    if (v.dom && Array.isArray(v.dom.events) && v.dom.events.length) {
      const outHits = v.dom.events.filter(e =>
        e.direction === 'out' && typeof e.damage === 'number' && e.damage > 0);
      if (outHits.length) {
        const totalDmg = outHits.reduce((s, e) => s + e.damage, 0);
        const weapons = [...new Set(outHits.map(e => e.weapon).filter(Boolean))];
        const title = `Captured from live attack page (v0.6.4):\n`
          + `${outHits.length} hit${outHits.length === 1 ? '' : 's'} for ${totalDmg.toLocaleString()} damage\n`
          + (weapons.length ? `Weapons: ${weapons.join(', ')}` : '');
        tags.push(el('span', {
          class: 'tech-tag dmg',
          title,
        }, `${fmtNum(totalDmg, 0)} DMG`));
      }
    }

    // Opponent level + farm flag. Only meaningful when we know both sides'
    // levels — null on records ingested under v0.2.x and on stealthed
    // incoming attacks where the attacker is hidden.
    const myLevel = v.iAm === 'attacker' ? v.attackerLevel : v.defenderLevel;
    const oppLevel = v.opponentLevel;
    const isFarm = (v.iAm === 'defender' && myLevel != null && oppLevel != null
                    && oppLevel >= myLevel + 10);
    const levelBadge = (oppLevel != null)
      ? el('span', {
          class: 'tech-level' + (isFarm ? ' farm' : ''),
          title: isFarm
            ? `Opponent is ${oppLevel - myLevel} levels above you — classic farm-target signal.`
            : `Opponent level ${oppLevel}`,
        }, `L${oppLevel}`)
      : null;

    const clickable = !!(v.opponentId && !suppressClick);
    const row = el('div', { class: 'tech-row' + (clickable ? ' clickable' : '') },
      el('span', { class: 'glyph', style: { color: oc.color } }, oc.glyph),
      el('div',  { class: 'who' },
        oc.label + ' ',
        el('a', {
          href: `https://www.torn.com/profiles.php?XID=${v.opponentId}`,
          target: '_blank', rel: 'noopener',
        }, v.opponentName || '?'),
        ...(levelBadge ? [levelBadge] : []),
        ...tags,
      ),
      el('span', { class: 'resp ' + respClass }, fmtRespect(v.respectDelta)),
      el('span', { class: 'meta' }, fmtAgo(v.tsEnded)),
    );
    if (clickable) {
      row.addEventListener('click', (e) => {
        // Profile-link clicks pass through to Torn in a new tab.
        if (e.target.closest('a')) return;
        openOpponentDrill(v.opponentId, v.opponentName);
      });
    }
    return row;
  }

  // ─── ACTIVE-PAGE BANNER (v0.6.24) ──────────────────────────────────────
  // Surfaces TECH's verdict on whoever the current Torn URL is naming — a
  // profile page, an attack page. One-tap shortcut into the existing
  // Opponent Intel drill. Suppresses itself when the user is already
  // drilled into the same opponent (banner -> click -> back -> banner loop
  // would be visual noise) and when the URL doesn't point at a player.
  function renderActivePageBanner(host) {
    const active = getActiveOpponentFromUrl();
    if (!active) return;
    if (currentDrill && currentDrill.kind === 'opponent' && currentDrill.id === active.id) return;

    const summary = lookupOpponentSummary(active.id);
    if (!summary) return;

    const verdictKey   = summary.verdict ? summary.verdict.key   : 'nohistory';
    const verdictLabel = summary.verdict ? summary.verdict.label : 'NO HISTORY';
    const nameText     = summary.name || ('Player ' + active.id);
    const pageLabel    = active.source === 'attack' ? 'Attacking' : 'Looking at';

    const fightsBit = summary.fightCount > 0
      ? ` · ${summary.fightCount} fight${summary.fightCount === 1 ? '' : 's'}`
      : '';

    // v0.6.27 — FF (Torn fair-fight modifier 1.0-3.0) is the stat-
    // differential ground truth. Only shown when we have at least one
    // fight record carrying it (post-v0.3.0 v2 polls, non-stealthed).
    const ffBit = (summary.lastFairFight != null)
      ? ' · FF ' + summary.lastFairFight.toFixed(2)
      : '';

    const ffTitle = (summary.lastFairFight != null)
      ? `\nLatest fair-fight modifier: ${summary.lastFairFight.toFixed(2)} (1.0 = ≤25% your stats, 3.0 = at or above your stats)`
      : '';

    const banner = el('div', {
      class: 'tech-activebanner verdict-' + verdictKey,
      title: (summary.fightCount > 0 ? 'Open Opponent Intel' : 'No fight history — open empty drill')
             + ffTitle,
      'on:click': () => openOpponentDrill(active.id, nameText),
    },
      el('span', { class: 'tech-activebanner-icon' }, '◎'),
      el('span', { class: 'tech-activebanner-text' },
        pageLabel + ': ',
        el('strong', {}, nameText),
        ' · ',
        el('span', { class: 'verdict' }, verdictLabel),
        ffBit,
        fightsBit,
      ),
      el('span', { class: 'tech-activebanner-arrow' }, '→'),
    );
    host.appendChild(banner);
  }

  // ─── SPY CARD (v0.6.52) ─────────────────────────────────────────────────
  // TornStats spy block for the Opponent Intel drill. Always renders the
  // header row (with refresh ↻) so the user has a clear control regardless
  // of cache state. Body adapts to four states: loading / error / no-data /
  // populated.
  //
  // When populated, surfaces the total + the four per-stat values and ages,
  // plus TornStats' own `difference` field (their verdict on whether the
  // target is stronger / weaker / same) when present. Ages format coarsely
  // ("5d", "2h") since spy data drift is rarely sub-hour-sensitive.
  function renderSpyCard(host, opponentId) {
    const cached = spyCache[opponentId];
    const fetchedAge = (cached && cached.fetchedAt)
      ? fmtAgo(cached.fetchedAt)
      : 'never';

    const headerRow = el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '8px',
               marginBottom: '6px', fontSize: '10px',
               textTransform: 'uppercase', letterSpacing: '1.2px',
               color: '#a855f7', fontWeight: '700' },
    },
      el('span', {}, 'TornStats spy'),
      el('span', { style: { color: '#6b7280', fontWeight: '500',
                            textTransform: 'none', letterSpacing: '.5px' } },
        '· last poll ' + fetchedAge),
      el('button', {
        type: 'button',
        class: 'tech-targets-refresh',
        title: 'Refresh spy data now',
        style: { marginLeft: 'auto' },
        'on:click': function () {
          maybeFetchSpy(opponentId, true);
        },
      }, '↻'),
    );
    host.appendChild(headerRow);

    if (!cached) {
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: '#6b7280', fontStyle: 'italic',
                 marginBottom: '11px' },
      }, 'Fetching spy data from TornStats…'));
      return;
    }

    if (cached.error) {
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: '#f87171', marginBottom: '11px' },
      }, '⚠ ' + cached.error));
      return;
    }

    if (cached.noData) {
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: '#6b7280', marginBottom: '11px' },
      }, 'No spy on record for this player.'));
      return;
    }

    // Populated. Coarser age formatter for spy timestamps — sub-hour
    // precision is meaningless on data that's typically days old.
    function fmtSpyAge(ts) {
      if (!ts) return '—';
      const d = nowSec() - ts;
      if (d < 0) return 'just now';
      if (d < 3600) return Math.max(1, Math.floor(d / 60)) + 'm';
      if (d < 86400) return Math.floor(d / 3600) + 'h';
      return Math.floor(d / 86400) + 'd';
    }

    const total = cached.total;
    const totalAge = fmtSpyAge(cached.totalTs);

    // Total card spans the row width — it's the headline number.
    const totalLine = el('div', {
      style: { display: 'flex', alignItems: 'baseline', gap: '8px',
               marginBottom: '8px' },
    },
      el('span', { style: { fontSize: '10px', textTransform: 'uppercase',
                            letterSpacing: '1px', color: '#6b7280',
                            fontWeight: '700' } }, 'Total'),
      el('span', { style: { fontFamily: "Impact, 'Oswald', 'Arial Narrow', sans-serif",
                            fontSize: '20px', color: '#fde047',
                            textShadow: '0 0 8px rgba(253,224,71,.3)',
                            letterSpacing: '.5px' } },
        total != null ? fmtNum(total, 2) : '—'),
      el('span', { style: { fontSize: '10px', color: '#9ca3af',
                            marginLeft: 'auto' } },
        'spied ' + totalAge + ' ago'),
    );
    host.appendChild(totalLine);

    // 4-stat grid.
    const grid = el('div', {
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr',
               gap: '4px 12px', fontSize: '11px', marginBottom: '8px' },
    });
    function statRow(label, value, age) {
      grid.appendChild(el('div', {
        style: { display: 'flex', justifyContent: 'space-between',
                 background: '#0f0a12', border: '1px solid #2a1f2e',
                 borderRadius: '3px', padding: '5px 8px' },
      },
        el('span', { style: { color: '#9ca3af',
                              fontWeight: '700',
                              fontSize: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '.5px' } }, label),
        el('span', { style: { color: '#e5e7eb',
                              fontVariantNumeric: 'tabular-nums',
                              fontWeight: '600' } },
          value != null ? fmtNum(value, 1) : '—'),
        el('span', { style: { color: '#6b7280', fontSize: '10px',
                              marginLeft: '4px' } }, age),
      ));
    }
    statRow('Str', cached.strength,  fmtSpyAge(cached.strengthTs));
    statRow('Def', cached.defense,   fmtSpyAge(cached.defenseTs));
    statRow('Spd', cached.speed,     fmtSpyAge(cached.speedTs));
    statRow('Dex', cached.dexterity, fmtSpyAge(cached.dexterityTs));
    host.appendChild(grid);

    if (cached.difference) {
      const diff = String(cached.difference).toLowerCase();
      let color = '#cbd5e1';
      if (diff === 'stronger')      color = '#fca5a5';
      else if (diff === 'weaker')   color = '#34d399';
      else if (diff === 'same')     color = '#fbbf24';
      host.appendChild(el('div', {
        style: { fontSize: '11px', color: color, marginBottom: '11px',
                 fontStyle: 'italic' },
      }, 'TornStats verdict: they are ', cached.difference, ' than you.'));
    }
  }

  // ─── DRILL: OPPONENT INTEL ──────────────────────────────────────────────
  // Rendered in place of the active tab when currentDrill is set.
  function renderOpponentDrill(host, opponentId) {
    const backBtn = el('button', { class: 'tech-intel-back', 'on:click': closeDrill },
      '← Back');
    host.appendChild(backBtn);

    const intel = computeOpponentIntel(opponentId);
    if (!intel) {
      // v0.6.41 — even with zero fight history, surface the name + a star
      // button so the user can pin first-seen opponents (war prep,
      // pre-scouting from a Torn profile, etc.). Name comes from whichever
      // source the drill was opened from: currentDrill.name (URL parse,
      // fight row, or banner) or a cached targetStatus entry if they were
      // already pinned. Falls back to the bare ID.
      const cachedTarget = targetStatus[opponentId] || {};
      const fallbackName = (currentDrill && currentDrill.name)
                        || cachedTarget.name
                        || ('Player ' + opponentId);
      const nameLine = el('div', { class: 'tech-intel-name' },
        el('a', {
          href: 'https://www.torn.com/profiles.php?XID=' + opponentId,
          target: '_blank', rel: 'noopener',
        }, fallbackName),
      );
      if (cachedTarget.level != null) {
        nameLine.appendChild(el('span', { class: 'tech-level' }, 'L' + cachedTarget.level));
      }
      const starredEmpty = isTargetStarred(opponentId);
      const starBtnEmpty = el('button', {
        class: 'tech-star-btn' + (starredEmpty ? ' starred' : ''),
        type: 'button',
        title: starredEmpty
          ? 'Remove from Dashboard Target queue'
          : 'Pin this opponent to the Dashboard Target queue (you can track them even without fight history)',
      }, starredEmpty ? '★ Targeted' : '☆ Add target');
      starBtnEmpty.addEventListener('click', function () {
        toggleTarget(opponentId, fallbackName);
        renderActive();
      });
      nameLine.appendChild(starBtnEmpty);
      host.appendChild(nameLine);

      // v0.6.52 — spy section works even with zero fight history; this is
      // the pre-war / first-encounter scenario where TornStats data is
      // most valuable. Render it ABOVE the empty-state message.
      const spySec = el('div', { class: 'tech-section' });
      renderSpyCard(spySec, opponentId);
      host.appendChild(spySec);

      host.appendChild(el('div', { class: 'tech-empty' },
        el('strong', {}, 'No fights with this opponent yet'),
        'No fight history to analyse — but the spy card above still works. You can also pin them above and TECH will poll their online/hospital status on the Dashboard Targets panel.',
      ));
      return;
    }

    // Name + level badge + star toggle (v0.6.39)
    const nameLine = el('div', { class: 'tech-intel-name' },
      el('a', {
        href: `https://www.torn.com/profiles.php?XID=${intel.id}`,
        target: '_blank', rel: 'noopener',
      }, intel.name),
    );
    if (intel.levelLast != null) {
      nameLine.appendChild(el('span', { class: 'tech-level' }, `L${intel.levelLast}`));
    }
    const starred = isTargetStarred(intel.id);
    const starBtn = el('button', {
      class: 'tech-star-btn' + (starred ? ' starred' : ''),
      type: 'button',
      title: starred
        ? 'Remove from Dashboard Target queue'
        : 'Pin this opponent to the Dashboard Target queue',
    }, starred ? '★ Targeted' : '☆ Add target');
    starBtn.addEventListener('click', function () {
      toggleTarget(intel.id, intel.name);
      renderActive();
    });
    nameLine.appendChild(starBtn);
    host.appendChild(nameLine);

    // Sub-line: faction · first seen · last seen
    const subBits = [];
    if (intel.factionName && intel.factionId) {
      // v0.6.38: faction name now drills into Faction Intel in-panel
      // instead of opening Torn's external profile. Holding Ctrl/⌘ at
      // click time falls back to the external link for users who want
      // the Torn-side profile view.
      const factionLink = el('a', {
        href: `https://www.torn.com/factions.php?step=profile&ID=${intel.factionId}`,
        title: 'Click for TECH Faction Intel · Ctrl/⌘+click for Torn profile',
      }, intel.factionName);
      factionLink.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;  // honour external link
        e.preventDefault();
        openFactionDrill(intel.factionId, intel.factionName);
      });
      subBits.push(el('span', {}, factionLink));
    }
    subBits.push(el('span', {}, `First ${fmtAgo(intel.firstSeenTs)}`));
    subBits.push(el('span', {}, `Last ${fmtAgo(intel.lastSeenTs)}`));
    const sub = el('div', { class: 'tech-intel-sub' });
    subBits.forEach((b, i) => {
      if (i > 0) sub.appendChild(document.createTextNode(' · '));
      sub.appendChild(b);
    });
    host.appendChild(sub);

    // Verdict pill + blurb
    host.appendChild(el('div', { class: 'tech-intel-verdict ' + intel.verdict.className },
      intel.verdict.label));
    host.appendChild(el('div', { class: 'tech-intel-blurb' }, intel.blurb));

    // v0.6.52 — TornStats spy section. Sits between the behavioural verdict
    // (what your fight history says) and the structural stat cards (what
    // the API tells you about the fight record itself). Spy data answers
    // a different question: "what are their actual stats right now?"
    const spySec = el('div', { class: 'tech-section' });
    renderSpyCard(spySec, intel.id);
    host.appendChild(spySec);

    // Row 1: fights · win rate · respect net
    const winRateCard = intel.asAttacker >= 1
      ? el('div', { class: 'tech-card ' + (intel.winRate >= 0.5 ? 'good' : 'bad') },
          el('div', { class: 'label' }, 'Win rate'),
          el('div', { class: 'value' }, fmtPct(intel.winRate)),
          el('div', { class: 'sub'   }, `${intel.wins}W / ${intel.losses}L`),
        )
      : el('div', { class: 'tech-card' },
          el('div', { class: 'label' }, 'Win rate'),
          el('div', { class: 'value' }, '—'),
          el('div', { class: 'sub'   }, 'No outgoing'),
        );
    host.appendChild(el('div', { class: 'tech-grid' },
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Fights'),
        el('div', { class: 'value' }, fmtNum(intel.fights, 0)),
        el('div', { class: 'sub'   }, `${intel.asAttacker} att / ${intel.asDefender} def`),
      ),
      winRateCard,
      el('div', { class: 'tech-card ' + (intel.respectNet >= 0 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Respect net'),
        el('div', { class: 'value' }, fmtRespect(intel.respectNet)),
        el('div', { class: 'sub'   }, `+${intel.respectGained.toFixed(1)} / ${intel.respectLost.toFixed(1)}`),
      ),
    ));

    // Row 2: hosp record · level seen · interrupt rate
    const levelValue = (intel.levelMin != null && intel.levelMax != null)
      ? (intel.levelMin === intel.levelMax ? `L${intel.levelLast}` : `L${intel.levelMin}–${intel.levelMax}`)
      : '—';
    const levelSub = intel.levelLast != null
      ? (intel.levelMin === intel.levelMax ? 'Stable' : `Last L${intel.levelLast}`)
      : 'Unknown (pre-v0.3.0 / stealth)';
    host.appendChild(el('div', { class: 'tech-grid' },
      el('div', { class: 'tech-card ' + (intel.hospMe === 0 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Hospital'),
        el('div', { class: 'value' }, `${intel.hospThem} / ${intel.hospMe}`),
        el('div', { class: 'sub'   }, 'them / you'),
      ),
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Level seen'),
        el('div', { class: 'value' }, levelValue),
        el('div', { class: 'sub'   }, levelSub),
      ),
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Interrupted'),
        el('div', { class: 'value' }, fmtPct(intel.intRate)),
        el('div', { class: 'sub'   }, `${intel.intCount} of ${intel.fights}`),
      ),
    ));

    // Effect rosters
    const fromEntries = Object.entries(intel.effectsFromThem).sort((a, b) => b[1] - a[1]);
    const toEntries   = Object.entries(intel.effectsToThem).sort((a, b) => b[1] - a[1]);
    if (fromEntries.length > 0) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Their kill-hit bonuses on you'),
      );
      const list = el('div', { class: 'tech-effect-list' });
      for (const [name, count] of fromEntries) {
        list.appendChild(el('span', { class: 'tech-tag effect' }, `${name} ×${count}`));
      }
      sec.appendChild(list);
      host.appendChild(sec);
    }
    if (toEntries.length > 0) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Your kill-hit bonuses on them'),
      );
      const list = el('div', { class: 'tech-effect-list' });
      for (const [name, count] of toEntries) {
        list.appendChild(el('span', { class: 'tech-tag effect' }, `${name} ×${count}`));
      }
      sec.appendChild(list);
      host.appendChild(sec);
    }

    // Outcome breakdown bar chart
    const outcomeEntries = Object.entries(intel.outcomes).sort((a, b) => b[1] - a[1]);
    if (outcomeEntries.length > 0) {
      const max = outcomeEntries[0][1];
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Outcome breakdown'),
      );
      for (const [key, count] of outcomeEntries) {
        const oc = OUTCOMES[key] || OUTCOMES.other;
        sec.appendChild(el('div', { class: 'tech-bar' },
          el('span', { class: 'name', style: { color: oc.color } }, oc.label),
          el('div',  { class: 'track' },
            el('div', { class: 'fill', style: { width: ((count / max) * 100).toFixed(1) + '%', background: oc.color } }),
          ),
          el('span', { class: 'count' }, String(count)),
        ));
      }
      host.appendChild(sec);
    }

    // Recent fights (drill rows suppress their own click handler — already
    // viewing this opponent's intel, no point cycling back to the same view).
    const recentSec = el('div', { class: 'tech-section' },
      el('div', { class: 'tech-section-title' }, 'Recent fights'),
    );
    for (const v of intel.recent) {
      recentSec.appendChild(renderFightRow(v, { compact: true, suppressClick: true }));
    }
    host.appendChild(recentSec);
  }

  // ─── DRILL: FACTION INTEL (v0.6.38) ────────────────────────────────────
  // Faction-level aggregation drill. Same in-panel UX as Opponent Intel —
  // rendered in place of the active tab when currentDrill.kind='faction'.
  // Shows the collective record against an entire enemy faction in one
  // view, plus a roster of the opponents within it sorted by fight count.
  function renderFactionDrill(host, factionId) {
    const backBtn = el('button', { class: 'tech-intel-back', 'on:click': closeDrill },
      '← Back');
    host.appendChild(backBtn);

    const intel = computeFactionIntel(factionId);
    if (!intel) {
      // v0.6.51 — empty-state branch retains the faction name + chain pill
      // so the drill is useful pre-war (zero fights logged yet). Same shape
      // as v0.6.41's fix for the Opponent Intel drill. Name resolves from
      // whichever source openFactionDrill was called from: currentDrill.name
      // (Scout tab click or Opponent Intel faction link) or the Scout
      // roster cache; falls back to the bare ID.
      const fallbackName = (currentDrill && currentDrill.name)
                        || (scoutData[factionId] && scoutData[factionId].factionName)
                        || ('Faction ' + factionId);
      host.appendChild(el('div', { class: 'tech-intel-name' },
        el('a', {
          href: 'https://www.torn.com/factions.php?step=profile&ID=' + factionId,
          target: '_blank', rel: 'noopener',
        }, fallbackName),
      ));
      // Enemy chain pill works regardless of local fight history — it's
      // the whole point of clicking through pre-war.
      renderFactionChainPill(host, factionId);
      host.appendChild(el('div', { class: 'tech-empty' },
        el('strong', {}, 'No fight history yet'),
        'TECH has no fight records against this faction. The chain timer above still works — useful for timing pre-war strikes.',
      ));
      return;
    }

    // Name + external profile link (the in-panel drill is the main click
    // target; we keep the external link as a small ↗ icon for quick access
    // to Torn's own faction profile page).
    host.appendChild(el('div', { class: 'tech-intel-name' },
      el('a', {
        href: 'https://www.torn.com/factions.php?step=profile&ID=' + intel.id,
        target: '_blank', rel: 'noopener',
      }, intel.name),
    ));
    host.appendChild(el('div', { class: 'tech-intel-sub' },
      el('span', {}, intel.uniqueOpponentCount + ' opponent'
        + (intel.uniqueOpponentCount === 1 ? '' : 's') + ' on record'),
      document.createTextNode(' · '),
      el('span', {}, 'First ' + fmtAgo(intel.firstSeenTs)),
      document.createTextNode(' · '),
      el('span', {}, 'Last ' + fmtAgo(intel.lastSeenTs)),
    ));

    // v0.6.50 — Enemy chain pill. War-prep intel: when does the target
    // faction's chain break, what's their current modifier, how long
    // till their cooldown ends. Renders idle/error states quietly so the
    // rest of the drill always shows up.
    renderFactionChainPill(host, intel.id);

    // Row 1 — fights / win rate / respect net
    const winRateCard = intel.asAttacker >= 1
      ? el('div', { class: 'tech-card ' + (intel.winRate >= 0.5 ? 'good' : 'bad') },
          el('div', { class: 'label' }, 'Win rate'),
          el('div', { class: 'value' }, fmtPct(intel.winRate)),
          el('div', { class: 'sub'   }, intel.wins + 'W / ' + intel.losses + 'L'),
        )
      : el('div', { class: 'tech-card' },
          el('div', { class: 'label' }, 'Win rate'),
          el('div', { class: 'value' }, '—'),
          el('div', { class: 'sub'   }, 'No outgoing'),
        );
    host.appendChild(el('div', { class: 'tech-grid' },
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Fights'),
        el('div', { class: 'value' }, fmtNum(intel.fights, 0)),
        el('div', { class: 'sub'   }, intel.asAttacker + ' att / ' + intel.asDefender + ' def'),
      ),
      winRateCard,
      el('div', { class: 'tech-card ' + (intel.respectNet >= 0 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Respect net'),
        el('div', { class: 'value' }, fmtRespect(intel.respectNet)),
        el('div', { class: 'sub'   },
          '+' + intel.respectGained.toFixed(1) + ' / ' + intel.respectLost.toFixed(1)),
      ),
    ));

    // Row 2 — KOs / hosps / defeats (broad)
    host.appendChild(el('div', { class: 'tech-grid' },
      el('div', { class: 'tech-card good' },
        el('div', { class: 'label' }, 'KO’d them'),
        el('div', { class: 'value' }, fmtNum(intel.koDelivered, 0)),
        el('div', { class: 'sub'   }, intel.hospThem + ' hosp finishes'),
      ),
      el('div', { class: 'tech-card ' + (intel.koTaken === 0 ? 'good' : 'bad') },
        el('div', { class: 'label' }, 'Got KO’d'),
        el('div', { class: 'value' }, fmtNum(intel.koTaken, 0)),
        el('div', { class: 'sub'   }, intel.hospMe + ' hosp finishes'),
      ),
      el('div', { class: 'tech-card' },
        el('div', { class: 'label' }, 'Unique opps'),
        el('div', { class: 'value' }, fmtNum(intel.uniqueOpponentCount, 0)),
        el('div', { class: 'sub'   }, intel.uniqueOpponentCount > 0
          ? (intel.fights / intel.uniqueOpponentCount).toFixed(1) + ' avg fights/opp'
          : '—'),
      ),
    ));

    // Verdict mix — one-line breakdown of how the per-opponent verdicts
    // distribute across this faction's roster (counting only opponents
    // we've fought; NO HISTORY can't appear here).
    const mix = intel.verdictMix;
    const verdictParts = [];
    function part(cls, count, label) {
      if (count > 0) verdictParts.push(el('span', { class: cls }, count + ' ' + label));
    }
    part('verdict-danger',  mix.danger,  'DANGER');
    part('verdict-tank',    mix.tank,    'TANKY');
    part('verdict-fav',     mix.fav,     'FAV');
    part('verdict-neutral', mix.neutral, 'NEUTRAL');
    part('verdict-stale',   mix.stale,   'STALE');
    part('verdict-unknown', mix.unknown, 'UNKNOWN');
    if (verdictParts.length > 0) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Verdict mix'),
      );
      const line = el('div', { class: 'tech-scout-summary' });
      verdictParts.forEach(function (p, i) {
        if (i > 0) line.appendChild(document.createTextNode(' · '));
        line.appendChild(p);
      });
      sec.appendChild(line);
      host.appendChild(sec);
    }

    // v0.6.42 — Power Profile section. Three sub-blocks:
    //   1. Level histogram (10-level buckets) + min/avg/max summary
    //   2. Fair-fight distribution (same brackets as Difficulty Roadmap)
    //   3. Their kill-hit weapon-effect mix (Proficience, Plunder, …)
    // All derived from existing fight data — no new API calls. Render only
    // when the underlying data exists; on pre-v0.3.0 stores (no levels, no
    // FF) the section just stays quiet.
    const bucketKeys = Object.keys(intel.levelBuckets)
      .map(function (k) { return parseInt(k, 10); })
      .sort(function (a, b) { return a - b; });
    const hasLevels = intel.levelN > 0 && bucketKeys.length > 0;
    const hasFF     = intel.ffN > 0;
    const effectEntries = Object.entries(intel.killHitEffects)
      .sort(function (a, b) { return b[1] - a[1]; });
    const hasEffects = effectEntries.length > 0;

    if (hasLevels || hasFF || hasEffects) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Power Profile'),
      );

      if (hasLevels) {
        const summary = (intel.levelMin === intel.levelMax)
          ? 'All sampled at L' + intel.levelMin
          : ('L' + intel.levelMin + '–L' + intel.levelMax
             + ' · avg L' + intel.avgLevel.toFixed(0));
        sec.appendChild(el('div', { class: 'tech-power-summary' },
          el('strong', {}, 'Levels: '),
          summary + ' (' + intel.levelN + ' sampled fight'
            + (intel.levelN === 1 ? '' : 's') + ')',
        ));
        const maxBucketCount = bucketKeys.reduce(function (m, k) {
          return Math.max(m, intel.levelBuckets[k]);
        }, 0);
        for (const k of bucketKeys) {
          const count = intel.levelBuckets[k];
          const pct = (count / maxBucketCount) * 100;
          sec.appendChild(el('div', { class: 'tech-bar' },
            el('span', { class: 'name' }, 'L' + k + '–' + (k + 9)),
            el('div',  { class: 'track' },
              el('div', { class: 'fill', style: { width: pct.toFixed(1) + '%', background: '#a78bfa' } }),
            ),
            el('span', { class: 'count' }, String(count)),
          ));
        }
      }

      if (hasFF) {
        sec.appendChild(el('div', { class: 'tech-power-summary tech-power-second' },
          el('strong', {}, 'Stat gap: '),
          'avg FF ' + intel.avgFairFight.toFixed(2)
            + ' (' + intel.ffN + ' sampled fight'
            + (intel.ffN === 1 ? '' : 's') + ')',
        ));
        const maxFf = intel.ffBuckets.reduce(function (m, b) { return Math.max(m, b.count); }, 0);
        if (maxFf > 0) {
          for (const b of intel.ffBuckets) {
            if (b.count === 0) continue;
            const pct = (b.count / maxFf) * 100;
            sec.appendChild(el('div', { class: 'tech-bar' },
              el('span', { class: 'name' }, b.label),
              el('div',  { class: 'track' },
                el('div', { class: 'fill', style: { width: pct.toFixed(1) + '%', background: '#f97316' } }),
              ),
              el('span', { class: 'count' }, String(b.count)),
            ));
          }
        }
      }

      if (hasEffects) {
        sec.appendChild(el('div', { class: 'tech-power-summary tech-power-second' },
          el('strong', {}, 'Their kill-hit weapon effects on you:'),
        ));
        const list = el('div', { class: 'tech-effect-list' });
        for (const [name, count] of effectEntries) {
          list.appendChild(el('span', { class: 'tech-tag effect' }, name + ' ×' + count));
        }
        sec.appendChild(list);
      }

      host.appendChild(sec);
    }

    // Top opponents within this faction — clickable, drills into the
    // existing per-opponent intel view.
    if (intel.topOpponents.length > 0) {
      const sec = el('div', { class: 'tech-section' },
        el('div', { class: 'tech-section-title' }, 'Top opponents in this faction'),
      );
      for (const op of intel.topOpponents) {
        const row = el('div', { class: 'tech-oprow clickable' },
          el('div', { class: 'name' },
            el('a', {
              href: 'https://www.torn.com/profiles.php?XID=' + op.id,
              target: '_blank', rel: 'noopener',
            }, op.name),
          ),
          el('div', { class: 'wl' }, op.fights + ' f · ' + op.wins + 'W/' + op.losses + 'L'),
          el('div', { class: 'resp' }, fmtRespect(op.respect)),
        );
        row.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          openOpponentDrill(op.id, op.name);
        });
        sec.appendChild(row);
      }
      host.appendChild(sec);
    }

    // Recent fights against the faction (any member).
    const recentSec = el('div', { class: 'tech-section' },
      el('div', { class: 'tech-section-title' }, 'Recent fights vs this faction'),
    );
    for (const v of intel.recent) {
      recentSec.appendChild(renderFightRow(v, { compact: true }));
    }
    host.appendChild(recentSec);
  }

  // ─── TAB: SETTINGS ──────────────────────────────────────────────────────
  function renderSettings(host) {
    const form = el('div', { class: 'tech-form' });

    form.appendChild(el('label', {}, 'Torn API key'));
    const keyInput = el('input', {
      type: 'password',
      value: settings.apiKey || '',
      placeholder: 'paste your API key',
    });
    form.appendChild(keyInput);
    form.appendChild(el('div', { class: 'hint' },
      'Limited access is enough. ',
      el('a', { href: 'https://www.torn.com/preferences.php#tab=api', target: '_blank', rel: 'noopener' },
        'Get one in API preferences'),
      '. Stored locally only.'));

    form.appendChild(el('label', {}, 'Poll interval'));
    const intervalSel = el('select', {});
    for (const sec of POLL_OPTIONS_SEC) {
      const opt = el('option', { value: String(sec) }, `${sec} seconds`);
      if (sec === settings.pollIntervalSec) opt.selected = true;
      intervalSel.appendChild(opt);
    }
    form.appendChild(intervalSel);
    form.appendChild(el('div', { class: 'hint' },
      'Torn allows 100 requests/min. 60s is gentle and more than fast enough — the attacks API gives history, not realtime hits.'));

    form.appendChild(el('label', {}, 'Build goal'));
    const goalSel = el('select', {});
    goalSel.appendChild(el('option', { value: '' }, '— none (audit disabled) —'));
    for (const [key, def] of Object.entries(BUILD_GOALS)) {
      const opt = el('option', { value: key }, def.label);
      if (settings.buildGoal === key) opt.selected = true;
      goalSel.appendChild(opt);
    }
    form.appendChild(goalSel);
    const goalHint = el('div', { class: 'hint' },
      settings.buildGoal && BUILD_GOALS[settings.buildGoal]
        ? BUILD_GOALS[settings.buildGoal].blurb
        : 'Pick a build to enable the Build Coherence Checker on the Dashboard.');
    form.appendChild(goalHint);
    goalSel.addEventListener('change', () => {
      goalHint.textContent = goalSel.value && BUILD_GOALS[goalSel.value]
        ? BUILD_GOALS[goalSel.value].blurb
        : 'Pick a build to enable the Build Coherence Checker on the Dashboard.';
    });

    // v0.6.43 — Target-ready notification toggle. Browser notification when
    // a pinned target transitions out of hospital/jail/abroad. Requires
    // permission via Notification.requestPermission(); we ask on first opt-in
    // and reflect any "denied" outcome in the hint underneath.
    form.appendChild(el('label', {}, 'Target-ready notifications'));
    const notifyCb = el('input', { type: 'checkbox' });
    notifyCb.checked = !!settings.notifyTargetReady;
    const notifyLabel = el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '8px',
               textTransform: 'none', letterSpacing: '0', color: '#e5e7eb',
               fontWeight: '500', cursor: 'pointer', margin: '0' },
    },
      notifyCb,
      el('span', {}, 'Ping me when a pinned target leaves hospital / jail / abroad'),
    );
    form.appendChild(notifyLabel);
    const notifySupported = typeof Notification !== 'undefined';
    const notifyHint = el('div', { class: 'hint' },
      !notifySupported
        ? 'Your browser does not support Notification API — TECH cannot ping you.'
        : Notification.permission === 'denied'
          ? 'Browser permission is DENIED. Re-enable Notifications for torn.com in your browser settings, then toggle this on.'
          : Notification.permission === 'granted'
            ? 'Permission granted. Notifications will fire on the next status flip.'
            : 'Toggling on will ask your browser for permission to show notifications.',
    );
    form.appendChild(notifyHint);
    notifyCb.addEventListener('change', async function () {
      if (notifyCb.checked) {
        const perm = await requestNotificationPermission();
        if (perm !== 'granted') {
          notifyCb.checked = false;
          notifyHint.textContent = (perm === 'denied')
            ? 'Browser permission denied. Re-enable Notifications for torn.com in your browser settings.'
            : 'Notifications not available in this browser context.';
          settings.notifyTargetReady = false;
          store('settings', settings);
          return;
        }
        notifyHint.textContent = 'Permission granted. Notifications will fire on the next status flip.';
      } else {
        notifyHint.textContent = 'Notifications off.';
      }
      settings.notifyTargetReady = notifyCb.checked;
      store('settings', settings);
    });

    // v0.6.61 — Chain-break notification toggle. Background watcher fires
    // a notification when an active chain timer drops below 60s. Shares
    // the browser-permission state with the target-ready toggle, so we
    // can reuse requestNotificationPermission() and surface the same
    // hint structure.
    form.appendChild(el('label', {}, 'Chain-break notifications'));
    const chainCb = el('input', { type: 'checkbox' });
    chainCb.checked = !!settings.notifyChainBreak;
    const chainLabel = el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '8px',
               textTransform: 'none', letterSpacing: '0', color: '#e5e7eb',
               fontWeight: '500', cursor: 'pointer', margin: '0' },
    },
      chainCb,
      el('span', {}, 'Ping me when my chain timer drops under 60 seconds (chain ≥ 10 only)'),
    );
    form.appendChild(chainLabel);
    const chainHint = el('div', { class: 'hint' },
      !notifySupported
        ? 'Your browser does not support Notification API — TECH cannot ping you.'
        : Notification.permission === 'denied'
          ? 'Browser permission is DENIED. Re-enable Notifications for torn.com in your browser settings, then toggle this on.'
          : Notification.permission === 'granted'
            ? 'Permission granted. Watcher runs every 5 seconds reading the chain from Torn\'s sidebar — zero API cost.'
            : 'Toggling on will ask your browser for permission to show notifications.',
    );
    form.appendChild(chainHint);
    chainCb.addEventListener('change', async function () {
      if (chainCb.checked) {
        const perm = await requestNotificationPermission();
        if (perm !== 'granted') {
          chainCb.checked = false;
          chainHint.textContent = (perm === 'denied')
            ? 'Browser permission denied. Re-enable Notifications for torn.com in your browser settings.'
            : 'Notifications not available in this browser context.';
          settings.notifyChainBreak = false;
          store('settings', settings);
          return;
        }
        chainHint.textContent = 'Permission granted. Watcher will ping when the chain dips under 60 seconds.';
      } else {
        chainHint.textContent = 'Chain-break notifications off.';
      }
      settings.notifyChainBreak = chainCb.checked;
      store('settings', settings);
    });

    form.appendChild(el('div', { class: 'tech-btnrow' },
      el('button', {
        class: 'tech-btn primary',
        'on:click': () => {
          settings.apiKey = keyInput.value.trim();
          settings.pollIntervalSec = parseInt(intervalSel.value, 10) || 60;
          settings.buildGoal = goalSel.value || null;
          store('settings', settings);
          startPolling();
          renderActive();
        },
      }, 'Save & start'),
      el('button', {
        class: 'tech-btn',
        'on:click': () => { poll(); },
      }, 'Poll now'),
    ));

    // Status block
    form.appendChild(el('div', { class: 'tech-section' },
      el('div', { class: 'tech-section-title' }, 'Status'),
      el('div', { class: 'tech-kvgrid' },
        el('div', { class: 'k' }, 'Account'),
        el('div', { class: 'v' }, meta.userName ? `${meta.userName} [${meta.userId}]` : '—'),
        el('div', { class: 'k' }, 'Fights stored'),
        el('div', { class: 'v' }, fmtNum(Object.keys(fights).length, 0)),
        el('div', { class: 'k' }, 'Total ingested'),
        el('div', { class: 'v' }, fmtNum(meta.totalIngestedCount, 0)),
        el('div', { class: 'k' }, 'Polls'),
        el('div', { class: 'v' }, fmtNum(meta.totalPollCount, 0)),
        el('div', { class: 'k' }, 'Last poll'),
        el('div', { class: 'v' }, fmtAgo(meta.lastPollTs)),
        el('div', { class: 'k' }, 'Last success'),
        el('div', { class: 'v ok' }, fmtAgo(meta.lastSuccessfulPollTs)),
        meta.lastError && el('div', { class: 'k' }, 'Last error'),
        meta.lastError && el('div', { class: 'v err' }, meta.lastError),
      ),
    ));

    // Data tools
    form.appendChild(el('div', { class: 'tech-section' },
      el('div', { class: 'tech-section-title' }, 'Your data'),
      el('div', { class: 'hint' },
        'Everything lives in your browser. No data leaves your machine until you opt in to community features (not enabled in v' + SCRIPT_VERSION + ').'),
      el('div', { class: 'tech-btnrow' },
        el('button', {
          class: 'tech-btn',
          'on:click': () => exportFights(),
        }, 'Export fights (JSON)'),
        el('button', {
          class: 'tech-btn danger',
          'on:click': () => {
            if (confirm('Delete every logged fight from this browser? This cannot be undone.')) {
              clearAllData();
              renderActive();
            }
          },
        }, 'Clear all data'),
      ),
    ));

    form.appendChild(el('div', { class: 'tech-section' },
      el('div', { class: 'tech-section-title' }, 'About'),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' } },
        el('img', {
          class: 'tech-mascot tech-mascot-about',
          src: MASCOT_DATA_URL,
          alt: `${SCRIPT_NAME} mascot`,
          draggable: 'false',
        }),
        el('div', { class: 'hint', style: { flex: '1', margin: '0' } },
          `${SCRIPT_NAME} v${SCRIPT_VERSION} — ${SCRIPT_LONG_NAME}.`,
          el('br', {}),
          'Passive combat intelligence. Toggle the panel with Alt+I.',
          el('br', {}),
          'Sibling to TEEM (Torn Elephant Economy Manager).',
        ),
      ),
    ));

    host.appendChild(form);
  }

  // ─── HELPERS: PLACEHOLDERS ──────────────────────────────────────────────
  function renderNoKey(host) {
    host.appendChild(el('div', { class: 'tech-empty' },
      el('img', {
        class: 'tech-mascot tech-mascot-hero',
        src: MASCOT_DATA_URL,
        alt: `${SCRIPT_NAME} mascot`,
        draggable: 'false',
      }),
      el('strong', {}, 'Set your Torn API key to begin'),
      'TECH logs every fight automatically once it can talk to the API. Pop over to the Settings tab to enter your key.',
      el('div', { class: 'tech-btnrow', style: { justifyContent: 'center', marginTop: '12px' } },
        el('button', {
          class: 'tech-btn primary',
          'on:click': () => { settings.activeTab = 'settings'; store('settings', settings); renderActive(); },
        }, 'Open settings'),
      ),
    ));
  }

  function renderWaiting(host, msg) {
    host.appendChild(el('div', { class: 'tech-empty' },
      el('strong', {}, msg || 'Working…'),
      'This should only take a moment.',
    ));
  }

  // ─── TAB: TEST (Battle Simulator) ───────────────────────────────────────
  function renderTestTab(host) {
    const stats = meta.battleStats || {};
    const youInit = {
      strength:  stats.strength  || 100,
      defense:   stats.defense   || 100,
      speed:     stats.speed     || 100,
      dexterity: stats.dexterity || 100,
    };
    const oppInit = { strength: 100, defense: 100, speed: 100, dexterity: 100 };

    host.appendChild(el('div', { class: 'tech-section-title' },
      'Battle Simulator',
      el('span', { class: 'tech-tag', style: { marginLeft: '6px' } }, 'TEST v0.3'),
    ));
    host.appendChild(el('div', { class: 'hint', style: { marginTop: '0', fontSize: '11px' } },
      'Monte Carlo simulator with provisional weapon + armor models. Each landed hit rolls a body region; ',
      'covered regions take reduced damage. Your side prefills from your battle stats and level; edit anything to explore.',
    ));

    const youRefs = {};
    const oppRefs = {};
    const myLevel  = meta.level || TEST_DEFAULTS.defaultLevel;
    const oppLevel = TEST_DEFAULTS.defaultLevel;

    function statCol(title, klass, vals, refs, level) {
      const col = el('div', { class: 'tech-test-col ' + klass });
      col.appendChild(el('h4', {}, title));

      const lvlRow = el('div', { class: 'tech-test-lvlrow' });
      lvlRow.appendChild(el('label', {}, 'Level'));
      const lvlInp = el('input', {
        type: 'number', min: '1', max: '100', step: '1',
        value: String(level), class: 'lvl-input',
      });
      // HP override (v0.6.22): empty = use level-derived wiki HP; typed =
      // override (your buffed max HP, or opp's max HP from the attack screen).
      // Placeholder always reflects the wiki HP for the current level so
      // users see what the default would be without committing to it.
      const hpLabel = el('label', { class: 'hp-label' }, 'HP');
      const hpInp = el('input', {
        type: 'number', min: '1', max: '99999', step: '1',
        placeholder: String(testHpForLevel(parseInt(lvlInp.value, 10) || level)),
        class: 'hp-input',
        title: 'Override max HP. Empty = use level default. Useful for buffed self-HP or opp HP read off the attack screen.',
      });
      const updateHp = () => {
        const L = parseInt(lvlInp.value, 10) || TEST_DEFAULTS.defaultLevel;
        hpInp.placeholder = String(testHpForLevel(L));
      };
      lvlInp.addEventListener('input', updateHp);
      refs.level = lvlInp;
      refs.hp    = hpInp;
      lvlRow.appendChild(lvlInp);
      lvlRow.appendChild(hpLabel);
      lvlRow.appendChild(hpInp);
      col.appendChild(lvlRow);

      const grid = el('div', { class: 'tech-test-statgrid' });
      const totalEl = el('div', { class: 'tech-test-total' });
      const updateTotal = () => {
        const t = (parseInt(refs.strength.value, 10)  || 0)
                + (parseInt(refs.defense.value, 10)   || 0)
                + (parseInt(refs.speed.value, 10)     || 0)
                + (parseInt(refs.dexterity.value, 10) || 0);
        totalEl.innerHTML = 'Total: <strong>' + fmtNum(t, 0) + '</strong>';
      };
      const labels = { strength: 'Strength', defense: 'Defense', speed: 'Speed', dexterity: 'Dexterity' };
      for (const key of ['strength', 'defense', 'speed', 'dexterity']) {
        grid.appendChild(el('label', {}, labels[key]));
        const inp = el('input', { type: 'number', min: '0', step: '1000', value: String(vals[key]) });
        inp.addEventListener('input', updateTotal);
        refs[key] = inp;
        grid.appendChild(inp);
      }
      col.appendChild(grid);
      col.appendChild(totalEl);
      updateTotal();

      // v0.2: primary-weapon class. Defaults to 'generic' so existing users
      // who haven't touched the dropdown see the same baseline as v0.1.
      const wpnRow = el('div', { class: 'tech-test-wpnrow' });
      wpnRow.appendChild(el('label', {}, 'Weapon'));
      const wpnSel = el('select', { class: 'wpn-select' });
      for (const key of WEAPON_CLASS_ORDER) {
        const opt = el('option', { value: key }, WEAPON_CLASSES[key].label);
        if (key === 'generic') opt.selected = true;
        wpnSel.appendChild(opt);
      }
      refs.weaponClass = wpnSel;
      wpnRow.appendChild(wpnSel);
      col.appendChild(wpnRow);

      // v0.6.65: named-weapon picker. Second dropdown lists the specific
      // weapons that fall under the current class, sourced from the wiki
      // table (WEAPONS_BY_CLASS). "(class average)" is the default option
      // → preserves v0.6.x behavior where the class dropdown alone drove
      // dmg/acc. When a specific weapon is picked, its exact wiki dmg+acc
      // overrides the class midpoint inside testRunMatch.
      const wpnPickRow = el('div', { class: 'tech-test-wpnrow' });
      wpnPickRow.appendChild(el('label', {}, 'Specific'));
      const wpnPickSel = el('select', {
        class: 'wpn-select',
        title: 'Pick a named weapon from the wiki table to override the class average',
      });
      function repopulateWeaponPicker(classKey, preserveValue) {
        const prev = preserveValue ? wpnPickSel.value : '';
        wpnPickSel.innerHTML = '';
        const defaultOpt = el('option', { value: '' }, '(class average)');
        wpnPickSel.appendChild(defaultOpt);
        const list = getWeaponsForClass(classKey);
        for (const w of list) {
          const opt = el('option', { value: w.id },
            w.label + '  · dmg ' + w.dmg.toFixed(1) + ' · acc ' + w.acc.toFixed(0));
          wpnPickSel.appendChild(opt);
        }
        // Restore prior selection if it still exists in the new list
        // (class didn't actually change, or we crossed between classes
        // and the same id happens to be in both — very unlikely).
        if (prev && WEAPONS_BY_ID[prev] && WEAPONS_BY_ID[prev].class === classKey) {
          wpnPickSel.value = prev;
        }
      }
      repopulateWeaponPicker(wpnSel.value, false);
      // Class dropdown change → reset picker to "(class average)" and
      // repopulate with the new class's weapons. We deliberately do NOT
      // preserve a picked weapon across class changes — if the user
      // switches Shotgun→Rifle, picking Ithaca 37 again doesn't make
      // sense; we want them to see the new class's options fresh.
      wpnSel.addEventListener('change', function () {
        repopulateWeaponPicker(wpnSel.value, false);
      });
      refs.weapon = wpnPickSel;
      wpnPickRow.appendChild(wpnPickSel);
      col.appendChild(wpnPickRow);

      // v0.6.15: drug stat multiplier. Defaults to 'none' so existing
      // users see identical numbers to v0.3 under the same rngSeed.
      const drugRow = el('div', { class: 'tech-test-wpnrow' });
      drugRow.appendChild(el('label', {}, 'Drug'));
      const drugSel = el('select', { class: 'wpn-select' });
      for (const key of DRUG_ORDER) {
        const opt = el('option', { value: key }, DRUGS[key].label);
        if (key === 'none') opt.selected = true;
        drugSel.appendChild(opt);
      }
      refs.drug = drugSel;
      drugRow.appendChild(drugSel);
      col.appendChild(drugRow);

      // v0.3: armor preset. Defaults to 'naked' so existing users who
      // haven't touched the dropdown get identical numbers to v0.2 under
      // the same rngSeed (armor is a pure no-op on naked).
      const armRow = el('div', { class: 'tech-test-wpnrow' });
      armRow.appendChild(el('label', {}, 'Armor'));
      const armSel = el('select', { class: 'wpn-select' });
      for (const key of ARMOR_PRESET_ORDER) {
        const opt = el('option', { value: key }, ARMOR_PRESETS[key].label);
        if (key === 'naked') opt.selected = true;
        armSel.appendChild(opt);
      }
      refs.armor = armSel;
      armRow.appendChild(armSel);
      col.appendChild(armRow);
      return col;
    }

    const row = el('div', { class: 'tech-test-row' });
    row.appendChild(statCol('You', 'you', youInit, youRefs, myLevel));
    const oppCol = statCol('Opponent', 'opp', oppInit, oppRefs, oppLevel);
    row.appendChild(oppCol);
    host.appendChild(row);

    // Mirror button: copy every YOU field into the OPPONENT side and re-fire
    // input events so the level→HP and stat→total displays refresh.
    const mirrorBtn = el('button', {
      type: 'button',
      class: 'tech-test-mirror',
      title: 'Copy your level, stats, weapon, drug, and armor to the opponent',
      'on:click': () => {
        oppRefs.level.value = youRefs.level.value;
        oppRefs.level.dispatchEvent(new Event('input', { bubbles: true }));
        for (const k of ['strength', 'defense', 'speed', 'dexterity']) {
          oppRefs[k].value = youRefs[k].value;
          oppRefs[k].dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (oppRefs.weaponClass) {
          oppRefs.weaponClass.value = youRefs.weaponClass.value;
          // Fire change so the opponent's named-weapon picker repopulates
          // with the mirrored class's options before we set its value.
          oppRefs.weaponClass.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (oppRefs.weapon && youRefs.weapon) oppRefs.weapon.value = youRefs.weapon.value;
        if (oppRefs.drug)        oppRefs.drug.value        = youRefs.drug.value;
        if (oppRefs.armor)       oppRefs.armor.value       = youRefs.armor.value;
      },
    }, 'Mirror');
    const oppHeader = oppCol.querySelector('h4');
    if (oppHeader) oppHeader.appendChild(mirrorBtn);

    function readSide(refs) {
      // hp: 0/empty means "use level default" — testRunMatch's `a.hp ||
      // testHpForLevel(...)` fallback handles the swap, so we pass 0 here.
      return {
        strength:  parseInt(refs.strength.value, 10)  || 0,
        defense:   parseInt(refs.defense.value, 10)   || 0,
        speed:     parseInt(refs.speed.value, 10)     || 0,
        dexterity: parseInt(refs.dexterity.value, 10) || 0,
        level:     parseInt(refs.level.value, 10)     || TEST_DEFAULTS.defaultLevel,
        hp:        parseInt(refs.hp && refs.hp.value, 10) || 0,
        weaponClass: (refs.weaponClass && refs.weaponClass.value) || 'generic',
        weaponId:    (refs.weapon      && refs.weapon.value)      || '',
        armor:       (refs.armor       && refs.armor.value)       || 'naked',
        drug:        (refs.drug        && refs.drug.value)        || 'none',
      };
    }

    const itersSel = el('select', {});
    for (const n of [10, 100, 1000, 5000]) {
      const opt = el('option', { value: String(n) }, n + ' iterations');
      if (n === 1000) opt.selected = true;
      itersSel.appendChild(opt);
    }

    const resultsHost = el('div', { class: 'tech-test-results' });

    function renderResults(out, ms, iterations) {
      resultsHost.innerHTML = '';
      const winPct  = (out.winRateA * 100);
      const lossPct = (out.winRateB * 100);
      const drawPct = (out.drawRate  * 100);
      const fmtPct  = (p) => (Math.round(p * 10) / 10).toFixed(1) + '%';

      const bar = el('div', { class: 'tech-test-resultbar' });
      const addSeg = (klass, frac, label) => {
        if (frac <= 0) return;
        const seg = el('div', {
          class: 'seg ' + klass,
          style: { flexBasis: (frac * 100) + '%', flexGrow: '0', flexShrink: '0' },
        });
        if (frac >= 0.08) seg.textContent = label;
        bar.appendChild(seg);
      };
      addSeg('win',  out.winRateA, 'You ' + fmtPct(winPct));
      addSeg('draw', out.drawRate, 'KO '  + fmtPct(drawPct));
      addSeg('loss', out.winRateB, 'Opp ' + fmtPct(lossPct));
      resultsHost.appendChild(bar);

      const meta4 = el('div', { class: 'tech-test-resultmeta' });
      const cell = (klass, lbl, val) => el('div', { class: 'cell ' + klass },
        el('div', { class: 'lbl' }, lbl),
        el('div', { class: 'val' }, val),
      );
      meta4.appendChild(cell('win',  'Win',       fmtPct(winPct)));
      meta4.appendChild(cell('draw', 'Mutual KO', fmtPct(drawPct)));
      meta4.appendChild(cell('loss', 'Loss',      fmtPct(lossPct)));
      meta4.appendChild(cell('',     'Avg turns', out.avgTurns.toFixed(1)));
      resultsHost.appendChild(meta4);

      // Per-region damage breakdown (v0.6.21). Two side-by-side panels —
      // each shows where hits landed on that defender and how much damage
      // got through their armor coverage. Coverage cell color flags leaks
      // at a glance (amber = partial coverage, red = uncovered).
      const fmtInt = (n) => Math.round(n).toLocaleString();
      function renderRegionPanel(klass, sideLabel, armorLabel, regionStats) {
        const isNaked = regionStats.every((r) => r.coverage === 0);
        const panel = el('div', { class: 'tech-test-regionpanel ' + klass });
        panel.appendChild(el('h5', {},
          sideLabel + ' ',
          el('span', { class: 'arm' }, '— ' + armorLabel),
        ));
        const table = el('table', { class: 'tech-test-regiontable' });
        table.appendChild(el('thead', {},
          el('tr', {},
            el('th', {}, 'Region'),
            el('th', {}, 'Cov'),
            el('th', {}, 'Dmg/hit'),
            el('th', {}, 'Dmg/fight'),
          ),
        ));
        const tbody = el('tbody', {});
        for (const row of regionStats) {
          let covKlass = '', covText = '—';
          if (!isNaked) {
            const pct = Math.round(row.coverage * 100);
            covText = pct + '%';
            if (row.coverage === 0)      covKlass = 'cov-none';
            else if (row.coverage < 1.0) covKlass = 'cov-partial';
            else                          covKlass = 'cov-full';
          }
          tbody.appendChild(el('tr', {},
            el('td', {}, row.label),
            el('td', { class: covKlass }, covText),
            el('td', {}, row.avgDmgPerHit > 0 ? fmtInt(row.avgDmgPerHit) : '—'),
            el('td', {}, fmtInt(row.dmgPerFight)),
          ));
        }
        table.appendChild(tbody);
        panel.appendChild(table);
        return panel;
      }
      const regionGrid = el('div', { class: 'tech-test-regiongrid' });
      regionGrid.appendChild(renderRegionPanel('you', 'You',      out.armorA, out.regionStatsA));
      regionGrid.appendChild(renderRegionPanel('opp', 'Opponent', out.armorB, out.regionStatsB));
      resultsHost.appendChild(regionGrid);

      const wpnLine = (out.weaponA && out.weaponB && (out.weaponA !== out.weaponB
                       || out.weaponA !== 'Generic (stat-only)'))
        ? ' — ' + out.weaponA + ' vs ' + out.weaponB
        : '';
      // Only surface armor in the foot when at least one side wore some.
      // Two naked sides is the v0.2 baseline and shouldn't clutter the line.
      const armLine = (out.armorA && out.armorB
                       && !(out.armorA === 'Naked (no armor)' && out.armorB === 'Naked (no armor)'))
        ? ' — ' + out.armorA + ' vs ' + out.armorB
        : '';
      // Same gate for drugs: only show when at least one side is on something.
      const drugLine = (out.drugA && out.drugB
                       && !(out.drugA === 'No drug' && out.drugB === 'No drug'))
        ? ' — ' + out.drugA + ' vs ' + out.drugB
        : '';
      resultsHost.appendChild(el('div', { class: 'tech-test-foot' },
        iterations + ' sims in ' + ms.toFixed(0) + ' ms' + wpnLine + armLine + drugLine + ' — ' + out.calibration + ' — ' + out.version,
      ));
    }

    function runSim() {
      const iterations = parseInt(itersSel.value, 10) || 1000;
      const A = readSide(youRefs);
      const B = readSide(oppRefs);
      if ((A.strength + A.defense + A.speed + A.dexterity) < 4
       || (B.strength + B.defense + B.speed + B.dexterity) < 4) {
        resultsHost.innerHTML = '';
        resultsHost.appendChild(el('div', { class: 'tech-empty' },
          el('strong', {}, 'Enter stats first'),
          'Each side needs Strength, Defense, Speed, and Dexterity above zero.',
        ));
        return;
      }
      const t0 = (performance && performance.now) ? performance.now() : Date.now();
      const out = testSimulate(A, B, {
        iterations: iterations,
        weaponClassA: A.weaponClass,
        weaponClassB: B.weaponClass,
        weaponA:     getWeaponById(A.weaponId),
        weaponB:     getWeaponById(B.weaponId),
        armorA:      A.armor,
        armorB:      B.armor,
        drugA:       A.drug,
        drugB:       B.drug,
      });
      const t1 = (performance && performance.now) ? performance.now() : Date.now();
      renderResults(out, t1 - t0, iterations);
    }

    const runBar = el('div', { class: 'tech-test-runbar' });
    runBar.appendChild(el('label', {}, 'Iterations'));
    runBar.appendChild(itersSel);
    runBar.appendChild(el('div', { class: 'spacer' }));
    runBar.appendChild(el('button', {
      class: 'tech-btn primary',
      'on:click': runSim,
    }, 'Run simulation'));
    host.appendChild(runBar);

    resultsHost.appendChild(el('div', { class: 'tech-empty', style: { padding: '20px 12px' } },
      el('strong', {}, 'No simulation run yet'),
      'Pick an iteration count and click Run simulation.',
    ));
    host.appendChild(resultsHost);
  }

  // ─── TAB: SCOUT (v0.6.34) ──────────────────────────────────────────────
  // Pre-war scouting. Enter an enemy faction ID, fetch the full member
  // roster, and TECH runs your local fight history against every member
  // to produce per-player verdicts in one shot. Rows sort DANGEROUS first
  // so the most important reads land at the top. Clickable → drills into
  // the existing Opponent Intel view.
  //
  // Verdict ranking (lower = more attention required, sorted to the top):
  //   danger  → 0
  //   tank    → 1
  //   stale   → 2
  //   neutral → 3
  //   unknown → 4   (we have 1 fight, can't call it yet)
  //   fav     → 5
  //   no-hist → 6   (zero recorded fights — info, but lowest priority)
  const SCOUT_VERDICT_RANK = {
    danger: 0, tank: 1, stale: 2, neutral: 3, unknown: 4, fav: 5,
  };

  function renderScoutTab(host) {
    if (!settings.apiKey) return renderNoKey(host);
    if (!meta.userId)     return renderWaiting(host, 'Identifying account…');

    host.appendChild(el('div', { class: 'tech-section-title' }, 'Faction Roster Scout'));
    host.appendChild(el('div', { class: 'hint', style: { marginTop: '0', fontSize: '11px' } },
      'Enter an enemy faction ID. TECH fetches the full member list and ',
      'matches every member against your local fight history. DANGEROUS verdicts ',
      'rise to the top so you can see who to skip at a glance.',
    ));

    // Form row: faction-id input + fetch button
    const lastId = settings.scoutFactionId || '';
    const idInput = el('input', {
      type: 'number', min: '1', step: '1',
      value: lastId, placeholder: 'enemy faction ID (e.g. 12345)',
      class: 'tech-scout-id',
    });
    const fetchBtn = el('button', { class: 'tech-btn primary', type: 'button' }, 'Fetch roster');
    const status   = el('div', { class: 'tech-scout-status' });
    const formRow  = el('div', { class: 'tech-scout-form' }, idInput, fetchBtn);
    host.appendChild(formRow);
    host.appendChild(status);

    // v0.6.35 — controls bar: sort dropdown + two filter toggles. Hidden
    // until a roster is rendered (no point sorting nothing).
    const SCOUT_SORTS = [
      { key: 'verdict',   label: 'Verdict (danger first)' },
      { key: 'hospSoon',  label: 'Hospital (out soonest)' },
      { key: 'status',    label: 'Status (hittable first)' },
      { key: 'levelDesc', label: 'Level (high → low)' },
      { key: 'levelAsc',  label: 'Level (low → high)' },
      { key: 'spyDesc',   label: 'Spy total (high → low)' },
      { key: 'spyAsc',    label: 'Spy total (low → high)' },
      { key: 'recent',    label: 'Last action (recent first)' },
      { key: 'oldest',    label: 'Last action (oldest first)' },
      { key: 'name',      label: 'Name (A → Z)' },
    ];
    const sortSel = el('select', { class: 'tech-scout-sort' });
    for (const s of SCOUT_SORTS) {
      const opt = el('option', { value: s.key }, s.label);
      if ((settings.scoutSort || 'verdict') === s.key) opt.selected = true;
      sortSel.appendChild(opt);
    }
    const hideLockedCb = el('input', { type: 'checkbox' });
    hideLockedCb.checked = !!settings.scoutHideLocked;
    const hideTravelCb = el('input', { type: 'checkbox' });
    hideTravelCb.checked = !!settings.scoutHideTraveling;
    // v0.6.54 — bulk-pull TornStats spy data for every roster member.
    // Label / disabled state are updated by renderRoster based on
    // scoutSpyPulling progress + the cached spy entries for the current
    // roster (so "Pull spies (47)" shows the number of members without
    // a fresh cache, and switches to "Pulling 12/47…" mid-flight).
    const pullSpyBtn = el('button', {
      type: 'button',
      class: 'tech-btn',
      style: { padding: '4px 9px', fontSize: '10px', marginLeft: 'auto' },
      title: 'Bulk-fetch TornStats spy data for every roster member without a fresh cache',
    }, 'Pull spies');
    pullSpyBtn.addEventListener('click', function () {
      const fid = parseInt(idInput.value, 10);
      if (!Number.isFinite(fid)) return;
      const cached = scoutData[fid];
      if (cached) pullSpiesForRoster(cached);
    });

    const controlsRow = el('div', { class: 'tech-scout-controls', style: { display: 'none' } },
      el('label', { class: 'tech-scout-ctrl' },
        el('span', {}, 'Sort'),
        sortSel,
      ),
      el('label', { class: 'tech-scout-ctrl-toggle', title: 'Hide Hospital / Jail / Federal' },
        hideLockedCb, el('span', {}, 'Hide locked'),
      ),
      el('label', { class: 'tech-scout-ctrl-toggle', title: 'Hide Traveling / Abroad' },
        hideTravelCb, el('span', {}, 'Hide traveling'),
      ),
      pullSpyBtn,
    );
    host.appendChild(controlsRow);

    const listHost = el('div', { class: 'tech-scout-list-host' });
    host.appendChild(listHost);

    function currentRoster() {
      const fid = parseInt(idInput.value, 10);
      if (!Number.isFinite(fid)) return null;
      return scoutData[fid] || null;
    }
    sortSel.addEventListener('change', function () {
      settings.scoutSort = sortSel.value;
      store('settings', settings);
      const r = currentRoster(); if (r) renderRoster(r);
    });
    hideLockedCb.addEventListener('change', function () {
      settings.scoutHideLocked = hideLockedCb.checked;
      store('settings', settings);
      const r = currentRoster(); if (r) renderRoster(r);
    });
    hideTravelCb.addEventListener('change', function () {
      settings.scoutHideTraveling = hideTravelCb.checked;
      store('settings', settings);
      const r = currentRoster(); if (r) renderRoster(r);
    });

    function renderRoster(roster) {
      listHost.innerHTML = '';
      if (!roster || !Array.isArray(roster.members) || roster.members.length === 0) {
        controlsRow.style.display = 'none';
        listHost.appendChild(el('div', { class: 'tech-empty' },
          el('strong', {}, 'No members in this roster'),
          'The faction has no members listed, or the API returned an empty record.',
        ));
        return;
      }
      controlsRow.style.display = '';

      // v0.6.54 — update the Pull spies button label + disabled state
      // based on scoutSpyPulling progress and the current roster's cache
      // coverage. The button counts members WITHOUT a fresh cache; if
      // every row already has data, the button reads "Pull spies (0)"
      // and stays clickable so the user can force a refresh.
      if (scoutSpyPulling && scoutSpyPulling.factionId === roster.factionId) {
        if (scoutSpyPulling.message && scoutSpyPulling.current === scoutSpyPulling.total) {
          pullSpyBtn.textContent = scoutSpyPulling.message;
        } else {
          pullSpyBtn.textContent = 'Pulling ' + scoutSpyPulling.current
                                 + '/' + scoutSpyPulling.total + '…';
        }
        pullSpyBtn.disabled = true;
      } else {
        const nowTs = nowSec();
        let needPull = 0;
        for (const m of roster.members) {
          if (m.id === meta.userId) continue;
          const c = spyCache[m.id];
          if (!c) { needPull++; continue; }
          if (c.fetchedAt && (nowTs - c.fetchedAt) >= SPY_REFRESH_SEC) needPull++;
        }
        pullSpyBtn.textContent = needPull > 0
          ? 'Pull spies (' + needPull + ')'
          : 'Pull spies';
        pullSpyBtn.disabled = false;
      }

      // Filter out the user's own ID — if they scout a faction they're in,
      // lookupOpponentSummary would surface a meaningless fightCount equal
      // to every fight they've ever had (same bug v0.6.26 fixed for the
      // Active-Page Banner). Defensive against an edge case more than a
      // common path.
      const afterSelf = meta.userId
        ? roster.members.filter(function (m) { return m.id !== meta.userId; })
        : roster.members.slice();
      const totalAfterSelf = afterSelf.length;

      // v0.6.35 — apply user-controlled filters. "Hide locked" drops
      // Hospital / Jail / Federal (members who can't be attacked at all).
      // "Hide traveling" drops Traveling / Abroad (not in Torn, mostly
      // unattackable). Counts retained so the header can show "X of N".
      const filtered = afterSelf.filter(function (m) {
        const s = m.statusState;
        if (settings.scoutHideLocked
            && (s === 'Hospital' || s === 'Jail' || s === 'Federal')) return false;
        if (settings.scoutHideTraveling
            && (s === 'Traveling' || s === 'Abroad')) return false;
        return true;
      });

      // Enrich each member with their TECH verdict from local history.
      const rows = filtered.map(function (m) {
        const sum = lookupOpponentSummary(m.id) || {
          id: m.id, name: m.name, fightCount: 0, lastFairFight: null, verdict: null,
        };
        const verdictKey = sum.verdict ? sum.verdict.key : null;
        return {
          member: m,
          summary: sum,
          verdictKey,
          rank: verdictKey != null
                  ? (SCOUT_VERDICT_RANK[verdictKey] != null ? SCOUT_VERDICT_RANK[verdictKey] : 7)
                  : 6,  // no-history
        };
      });

      // v0.6.35 — sort by selected key. Verdict (default) keeps the
      // original DANGEROUS-first ordering with fight-count tiebreak. Level
      // sorts push null levels to the end. Last-action sorts push 0
      // (never seen) to the end. All sorts fall back to name for stable
      // ordering at the leaf.
      const sortKey = settings.scoutSort || 'verdict';
      function nameCmp(a, b) {
        return (a.member.name || '').localeCompare(b.member.name || '');
      }
      rows.sort(function (a, b) {
        if (sortKey === 'verdict') {
          if (a.rank !== b.rank) return a.rank - b.rank;
          if (b.summary.fightCount !== a.summary.fightCount) {
            return b.summary.fightCount - a.summary.fightCount;
          }
          return nameCmp(a, b);
        }
        if (sortKey === 'hospSoon') {
          // v0.6.69 — surface members closest to leaving hospital/jail/fed
          // first. Non-locked rows sink to the end so the war-prep use case
          // (queue up release timings) stays clean. Within locked rows,
          // soonest-out wins; absent statusUntil (rare API edge) treats as
          // "infinite remaining" so it ranks below known countdowns.
          function untilOrInf(m) {
            const s = m.statusState;
            if (s !== 'Hospital' && s !== 'Jail' && s !== 'Federal') return null;
            return m.statusUntil || Infinity;
          }
          const au = untilOrInf(a.member);
          const bu = untilOrInf(b.member);
          if (au == null && bu == null) return nameCmp(a, b);
          if (au == null) return 1;
          if (bu == null) return -1;
          if (au !== bu) return au - bu;
          return nameCmp(a, b);
        }
        if (sortKey === 'status') {
          // v0.6.69 — hittable-first ordering. Tier 0 = Okay,
          // tier 1 = Hospital/Jail/Federal (sub-sorted by soonest out),
          // tier 2 = Traveling/Abroad. Mirrors the Targets queue's tier
          // pattern (without the can-hit-energy check, which Scout doesn't
          // know about — energy is a self-state thing).
          function tier(m) {
            const s = m.statusState;
            if (s === 'Hospital' || s === 'Jail' || s === 'Federal') return 1;
            if (s === 'Traveling' || s === 'Abroad') return 2;
            return 0;
          }
          const at = tier(a.member);
          const bt = tier(b.member);
          if (at !== bt) return at - bt;
          if (at === 1) {
            const au = a.member.statusUntil || Infinity;
            const bu = b.member.statusUntil || Infinity;
            if (au !== bu) return au - bu;
          }
          return nameCmp(a, b);
        }
        if (sortKey === 'levelDesc' || sortKey === 'levelAsc') {
          const al = a.member.level, bl = b.member.level;
          if (al == null && bl == null) return nameCmp(a, b);
          if (al == null) return 1;
          if (bl == null) return -1;
          if (al !== bl) return sortKey === 'levelDesc' ? bl - al : al - bl;
          return nameCmp(a, b);
        }
        if (sortKey === 'spyDesc' || sortKey === 'spyAsc') {
          // v0.6.55 — sort by cached spy total. Rows without populated
          // spy data (no cache / noData / error) sink to the end so the
          // meaningful rows lead. Among data-bearing rows, sort numerically.
          function spyTotal(row) {
            const c = spyCache[row.member.id];
            if (!c || c.error || c.noData || c.total == null) return null;
            return c.total;
          }
          const at = spyTotal(a), bt = spyTotal(b);
          if (at == null && bt == null) return nameCmp(a, b);
          if (at == null) return 1;
          if (bt == null) return -1;
          if (at !== bt) return sortKey === 'spyDesc' ? bt - at : at - bt;
          return nameCmp(a, b);
        }
        if (sortKey === 'recent' || sortKey === 'oldest') {
          const at = a.member.lastActionTs || 0;
          const bt = b.member.lastActionTs || 0;
          if (at === 0 && bt === 0) return nameCmp(a, b);
          if (at === 0) return 1;
          if (bt === 0) return -1;
          if (at !== bt) return sortKey === 'recent' ? bt - at : at - bt;
          return nameCmp(a, b);
        }
        return nameCmp(a, b);
      });

      // Header line: faction name + tag, fetched-ago, member count.
      // When a filter is hiding some, show "X of N members" so the user
      // sees how much got filtered out.
      const tag = roster.factionTag ? '[' + roster.factionTag + '] ' : '';
      const shown = filtered.length;
      const countText = shown < totalAfterSelf
        ? ' · ' + shown + ' of ' + totalAfterSelf + ' member' + (totalAfterSelf === 1 ? '' : 's') + ' shown'
        : ' · ' + roster.members.length + ' member' + (roster.members.length === 1 ? '' : 's');
      // v0.6.38: faction name now clickable → opens Faction Intel drill.
      // The strong/header styling stays, but it's a link with cursor.
      const factionHeading = el('a', {
        href: '#',
        class: 'tech-scout-faction-link',
        title: 'Open Faction Intel — your aggregate record vs this faction',
      }, tag + roster.factionName);
      factionHeading.addEventListener('click', function (e) {
        e.preventDefault();
        openFactionDrill(roster.factionId, roster.factionName);
      });
      listHost.appendChild(el('div', { class: 'tech-scout-header' },
        el('strong', {}, factionHeading),
        el('span', { class: 'tech-scout-meta' },
          countText + ' · roster ' + fmtAgo(roster.fetchedAt)),
      ));

      // Aggregate banner: counts per verdict so the user gets a one-line
      // pre-war summary at the top of the panel.
      const buckets = { danger: 0, tank: 0, stale: 0, neutral: 0, unknown: 0, fav: 0, nohist: 0 };
      for (const r of rows) {
        const k = r.verdictKey || 'nohist';
        buckets[k] = (buckets[k] || 0) + 1;
      }
      const summaryParts = [];
      if (buckets.danger)  summaryParts.push(el('span', { class: 'verdict-danger' },  buckets.danger  + ' DANGER'));
      if (buckets.tank)    summaryParts.push(el('span', { class: 'verdict-tank' },    buckets.tank    + ' TANKY'));
      if (buckets.fav)     summaryParts.push(el('span', { class: 'verdict-fav' },     buckets.fav     + ' FAV'));
      if (buckets.neutral) summaryParts.push(el('span', { class: 'verdict-neutral' }, buckets.neutral + ' NEUTRAL'));
      if (buckets.stale)   summaryParts.push(el('span', { class: 'verdict-stale' },   buckets.stale   + ' STALE'));
      if (buckets.unknown) summaryParts.push(el('span', { class: 'verdict-unknown' }, buckets.unknown + ' UNKNOWN'));
      if (buckets.nohist)  summaryParts.push(el('span', { class: 'verdict-nohistory' }, buckets.nohist + ' NO HIST'));
      if (summaryParts.length) {
        const sumLine = el('div', { class: 'tech-scout-summary' });
        summaryParts.forEach(function (p, i) {
          if (i > 0) sumLine.appendChild(document.createTextNode(' · '));
          sumLine.appendChild(p);
        });
        listHost.appendChild(sumLine);
      }

      // Member rows
      for (const row of rows) {
        const m = row.member;
        const sum = row.summary;
        const vk = row.verdictKey || 'nohistory';
        const vlabel = sum.verdict ? sum.verdict.label : 'NO HIST';
        const ffBit = (sum.lastFairFight != null)
          ? ' · FF ' + sum.lastFairFight.toFixed(2) : '';
        const fightsBit = sum.fightCount > 0
          ? ' · ' + sum.fightCount + 'f' : '';
        const lastBit = m.lastActionTs > 0
          ? ' · last ' + fmtAgo(m.lastActionTs)
          : '';
        // v0.6.69 — status dot + countdown, matching the Targets queue
        // pattern. Locked rows render "Hosp 14:23" / "Jail 2h 14m" /
        // "Fed 5h 12m"; abroad rows show "Abroad"; everyone else falls
        // through. The countdown text lives in a span tagged with
        // tech-scout-countdown + the Unix-seconds release timestamp so a
        // 1s ticker can rewrite the label in-place without a full rerender.
        const state = m.statusState || null;
        const lastStat = m.lastActionStatus || null;
        let dotClass = 'offline';
        if (state === 'Hospital' || state === 'Jail' || state === 'Federal') dotClass = 'locked';
        else if (state === 'Traveling' || state === 'Abroad') dotClass = 'abroad';
        else if (lastStat === 'Online') dotClass = 'online';
        else if (lastStat === 'Idle')   dotClass = 'idle';
        const dotTitle = (state && state !== 'Okay' ? state + ' · ' : '')
                       + (lastStat || 'Unknown')
                       + (m.lastActionTs ? ' (' + fmtAgo(m.lastActionTs) + ')' : '');
        let statusEl = null;
        if (state === 'Hospital' || state === 'Jail' || state === 'Federal') {
          const tag = state === 'Hospital' ? 'Hosp' : state === 'Jail' ? 'Jail' : 'Fed';
          const cd = fmtCountdown(m.statusUntil);
          statusEl = el('span', {
            class: 'tech-scout-countdown',
            'data-until': String(m.statusUntil || 0),
            'data-tag': tag,
            title: state + (m.statusUntil
              ? ' until ' + new Date(m.statusUntil * 1000).toLocaleString()
              : ''),
          }, cd ? (tag + ' ' + cd) : state);
        } else if (state === 'Traveling' || state === 'Abroad') {
          statusEl = el('span', { class: 'tech-scout-status-tag' }, state);
        }
        // v0.6.54 — spy total badge. Populated rows show "spy 1.2M";
        // no-data rows show "spy —" (greyed via fontStyle italic in CSS
        // would be cleaner but the verdict column is plain text — keep
        // it simple). Errored rows fall through to no badge so the row
        // doesn't spam transient TornStats hiccups.
        const cachedSpy = spyCache[m.id];
        let spyBit = '';
        if (cachedSpy && !cachedSpy.error) {
          if (cachedSpy.noData) {
            spyBit = ' · spy —';
          } else if (cachedSpy.total != null) {
            spyBit = ' · spy ' + fmtNum(cachedSpy.total, 1);
          }
        }

        const memberRow = el('div', {
          class: 'tech-scout-row clickable verdict-' + vk,
          title: 'Open Opponent Intel for ' + m.name,
        },
          el('span', { class: 'tech-target-dot ' + dotClass, title: dotTitle }),
          el('div', { class: 'tech-scout-main' },
            el('div', { class: 'tech-scout-name' },
              el('a', {
                href: 'https://www.torn.com/profiles.php?XID=' + m.id,
                target: '_blank', rel: 'noopener',
              }, m.name),
              (m.level != null ? el('span', { class: 'tech-level' }, 'L' + m.level) : null),
            ),
            el('div', { class: 'tech-scout-verdict' },
              el('span', { class: 'verdict' }, vlabel),
              ffBit,
              fightsBit,
              spyBit,
              lastBit,
              statusEl ? document.createTextNode(' · ') : null,
              statusEl,
            ),
          ),
        );
        memberRow.addEventListener('click', function (e) {
          if (e.target.closest('a')) return;
          openOpponentDrill(m.id, m.name);
        });
        listHost.appendChild(memberRow);
      }

      // v0.6.69 — start (or restart) the per-second countdown ticker. Each
      // tick rewrites every live `.tech-scout-countdown` node from its
      // `data-until` attribute. Self-cancels when the list host leaves the
      // DOM (tab switch, drill, panel close) or when no countdowns remain
      // (everyone's out / no one was hospitalised to begin with).
      if (scoutCountdownInterval) {
        clearInterval(scoutCountdownInterval);
        scoutCountdownInterval = null;
      }
      scoutCountdownInterval = setInterval(function () {
        if (!listHost.isConnected) {
          clearInterval(scoutCountdownInterval);
          scoutCountdownInterval = null;
          return;
        }
        const nodes = listHost.querySelectorAll('.tech-scout-countdown');
        if (!nodes.length) {
          clearInterval(scoutCountdownInterval);
          scoutCountdownInterval = null;
          return;
        }
        for (const n of nodes) {
          const until = parseInt(n.getAttribute('data-until'), 10) || 0;
          const tag   = n.getAttribute('data-tag') || '';
          const cd    = fmtCountdown(until);
          if (cd) {
            n.textContent = tag + ' ' + cd;
          } else {
            // Countdown elapsed — strip the badge so the row visually
            // promotes from "locked" to "out". A subsequent roster refetch
            // (manual refresh / poll) will fully recompute state.
            n.textContent = 'out';
            n.classList.add('tech-scout-countdown-elapsed');
          }
        }
      }, 1000);
    }

    // Render cached roster if we have one for the typed ID
    function maybeRenderCached() {
      const fid = parseInt(idInput.value, 10);
      if (!Number.isFinite(fid)) return;
      const cached = scoutData[fid];
      if (cached) renderRoster(cached);
    }
    maybeRenderCached();

    fetchBtn.addEventListener('click', async function () {
      const fid = parseInt(idInput.value, 10);
      if (!Number.isFinite(fid) || fid <= 0) {
        status.textContent = 'Enter a numeric faction ID.';
        status.className = 'tech-scout-status err';
        return;
      }
      settings.scoutFactionId = String(fid);
      store('settings', settings);
      status.textContent = 'Fetching roster…';
      status.className = 'tech-scout-status spin';
      fetchBtn.disabled = true;
      try {
        const roster = await fetchFactionRoster(fid);
        scoutData[fid] = roster;
        store('scoutData', scoutData);
        status.textContent = 'Roster fetched · ' + roster.members.length + ' members.';
        status.className = 'tech-scout-status ok';
        renderRoster(roster);
      } catch (e) {
        status.textContent = 'Fetch failed: ' + (e && e.message ? e.message : String(e));
        status.className = 'tech-scout-status err';
      } finally {
        fetchBtn.disabled = false;
      }
    });
  }

  // ─── UI: PANEL ──────────────────────────────────────────────────────────
  const TABS = [
    { key: 'dashboard', label: 'Dashboard', render: renderDashboard },
    { key: 'fights',    label: 'Fights',    render: renderFightsTab  },
    { key: 'scout',     label: 'Scout',     render: renderScoutTab   },
    { key: 'test',      label: 'TEST',      render: renderTestTab    },
    { key: 'settings',  label: 'Settings',  render: renderSettings   },
  ];

  function createPanel() {
    if (panelEl) return panelEl;
    panelEl = el('div', { class: 'tech-panel', style: positionStyle(settings.panelPos) });

    const header = el('div', { class: 'tech-header' },
      el('img', {
        class: 'tech-mascot tech-mascot-header',
        src: MASCOT_DATA_URL,
        alt: `${SCRIPT_NAME} mascot`,
        draggable: 'false',
      }),
      el('div', { class: 'tech-title' }, SCRIPT_NAME,
        el('small', {}, `v${SCRIPT_VERSION}`),
      ),
      el('button', {
        class: 'tech-iconbtn',
        title: 'Poll now',
        'on:click': (e) => { e.stopPropagation(); poll(); },
      }, '↻'),
      el('button', {
        class: 'tech-iconbtn',
        title: 'Close (Alt+I)',
        'on:click': (e) => { e.stopPropagation(); togglePanel(false); },
      }, '×'),
    );
    panelEl.appendChild(header);

    const tabsBar = el('div', { class: 'tech-tabs' });
    for (const t of TABS) {
      tabsBar.appendChild(el('div', {
        class: 'tech-tab' + (settings.activeTab === t.key ? ' active' : ''),
        'on:click': () => {
          currentDrill = null;
          settings.activeTab = t.key;
          store('settings', settings);
          renderActive();
        },
      }, t.label));
    }
    panelEl.appendChild(tabsBar);

    contentEl = el('div', { class: 'tech-content' });
    panelEl.appendChild(contentEl);

    const status = el('div', { class: 'tech-status', id: 'tech-status' });
    panelEl.appendChild(status);

    document.body.appendChild(panelEl);
    makeDraggable(panelEl, header, 'panelPos');
    renderActive();
    // Rescue stuck positions saved from a previous session / smaller window.
    clampPanelPos(panelEl, 'panelPos', true);
    // Re-clamp if the viewport shrinks (window resize, devtools open, etc.).
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (panelEl && panelEl.isConnected && panelEl.style.display !== 'none') {
          clampPanelPos(panelEl, 'panelPos', true);
        }
      });
    });
    // Re-clamp when the panel's own rendered size changes (tab switch into a
    // taller view, attack list growing while user is on another window, etc.).
    // The panel is anchored from right+bottom, so a height increase pushes
    // the top edge upward — if the saved `bottom` is large, the header can
    // be pushed above the viewport. `resize` doesn't fire for content-driven
    // height changes, so we need a separate observer.
    if (typeof ResizeObserver === 'function') {
      let roRaf = 0;
      const ro = new ResizeObserver(() => {
        if (roRaf) cancelAnimationFrame(roRaf);
        roRaf = requestAnimationFrame(() => {
          roRaf = 0;
          if (panelEl && panelEl.isConnected && panelEl.style.display !== 'none') {
            clampPanelPos(panelEl, 'panelPos', true);
          }
        });
      });
      ro.observe(panelEl);
    }
    return panelEl;
  }

  // Drill helpers — `currentDrill` overrides the active tab when set.
  function openOpponentDrill(id, name) {
    if (!id) return;
    currentDrill = { kind: 'opponent', id, name };
    renderActive();
    if (contentEl) contentEl.scrollTop = 0;
    // v0.6.52 — kick off the TornStats spy fetch alongside the drill render.
    // Throttled to 1 hour/target so opening + closing the drill repeatedly
    // doesn't burn calls. Fire-and-forget; resolves into spyCache + re-renders.
    maybeFetchSpy(id);
  }
  // v0.6.38 — Faction Intel drill open helper. Same shape as the
  // opponent drill but uses kind:'faction' so renderActive routes to
  // renderFactionDrill.
  function openFactionDrill(id, name) {
    if (!id) return;
    currentDrill = { kind: 'faction', id, name };
    renderActive();
    if (contentEl) contentEl.scrollTop = 0;
    // v0.6.50 — kick off the enemy chain fetch alongside the drill render.
    // Throttled to 30s/faction so opening + closing + reopening doesn't
    // burn API calls. The fetch is fire-and-forget; when it resolves it
    // re-renders the drill (if still open) with the fresh chain pill.
    maybeRefreshFactionChain(id);
  }
  function closeDrill() {
    currentDrill = null;
    renderActive();
  }

  function renderActive() {
    if (!panelEl || !contentEl) return;
    // Refresh tab strip active state
    const tabs = panelEl.querySelectorAll('.tech-tab');
    tabs.forEach((node, i) => {
      node.classList.toggle('active', TABS[i].key === settings.activeTab);
    });
    contentEl.innerHTML = '';
    try {
      if (currentDrill && currentDrill.kind === 'opponent') {
        renderOpponentDrill(contentEl, currentDrill.id);
      } else if (currentDrill && currentDrill.kind === 'faction') {
        renderFactionDrill(contentEl, currentDrill.id);
      } else {
        // v0.6.24 — Active-page banner sits above the tab content so it's
        // visible from every tab. The renderer is a no-op when the URL
        // doesn't name an opponent, so non-Torn-player pages stay clean.
        renderActivePageBanner(contentEl);
        const tab = TABS.find(t => t.key === settings.activeTab) || TABS[0];
        tab.render(contentEl);
      }
    } catch (e) {
      contentEl.appendChild(el('div', { class: 'tech-empty' },
        el('strong', {}, 'Render error'),
        String(e && e.message || e),
      ));
    }
    renderStatus();
    updateLauncherIndicator();
  }

  // Called from poll() instead of renderActive(). We always want the
  // status bar + launcher indicator refreshed (so the user sees the
  // "synced Xs ago" tick), but we only re-render the panel content
  // when the active view actually depends on freshly-polled data.
  //
  // TEST is a stat-only simulator with no live data dependencies —
  // re-rendering it on every poll would clobber any stats the user is
  // mid-edit and any simulation result they just produced. Settings
  // is similarly inert (it's just a form). Dashboard / Fights /
  // opponent drill all read from fight history that the poll just
  // updated, so they DO need a full re-render.
  function refreshAfterPoll() {
    if (!panelEl || !contentEl) return;
    const liveDataTab = !!currentDrill
      || settings.activeTab === 'dashboard'
      || settings.activeTab === 'fights';
    if (liveDataTab) {
      renderActive();
    } else {
      renderStatus();
      updateLauncherIndicator();
    }
  }

  function renderStatus() {
    const status = panelEl && panelEl.querySelector('#tech-status');
    if (!status) return;
    status.innerHTML = '';
    // v0.6.44 — rate-limit takes priority over any other status state; the
    // countdown is the actionable info while the cooldown is in effect.
    if (isRateLimited()) {
      status.appendChild(el('span', { class: 'err' },
        '● rate-limited · retrying ' + rateLimitRemainingSec() + 's'));
    } else if (isPolling) {
      status.appendChild(el('span', { class: 'spin' }, '● polling…'));
    } else if (meta.lastError) {
      status.appendChild(el('span', { class: 'err' }, '● ' + meta.lastError));
    } else if (meta.lastSuccessfulPollTs) {
      status.appendChild(el('span', { class: 'ok' }, '● synced ' + fmtAgo(meta.lastSuccessfulPollTs)));
    } else {
      status.appendChild(el('span', {}, '○ idle'));
    }
    status.appendChild(el('span', { class: 'sep' }, ' · '));
    status.appendChild(el('span', {}, `${Object.keys(fights).length} fights · every ${settings.pollIntervalSec}s`));
  }

  // ─── UI: HEADER LAUNCHER ────────────────────────────────────────────────
  // We inject a single <li> into Torn's existing top-right toolbar
  // (ul.toolbar.clearfix) — the same row that holds the search, clock,
  // recent-history, and avatar buttons. Anchored via #recent-history-wrapper
  // (a stable, unhashed Torn id) and placed immediately before the .avatar
  // item so it sits at the rightmost spot before the user's profile menu.
  //
  // A MutationObserver re-runs createLauncher() if Torn's SPA navigation
  // re-renders the header and our <li> disappears. createLauncher() is
  // idempotent — if #tech-launcher is already in the DOM, it bails fast.
  //
  // Head-only launcher mark by Wasteland — embedded as <img> from the
  // LAUNCHER_MARK_DATA_URL constant. Replaces the earlier hand-traced SVG,
  // which was too detailed to read cleanly at 22px in Torn's header.
  function launcherMarkHTML() {
    return (
      '<img class="tech-launcher-mark" src="' + LAUNCHER_MARK_DATA_URL + '" ' +
        'alt="" aria-hidden="true"/>'
    );
  }

  function findHeaderCluster() {
    // Anchor on the stable id, then return its parent <ul>. If Torn ever
    // renames the .toolbar class, this still works as long as the id exists.
    const anchor = document.getElementById('recent-history-wrapper');
    return anchor ? anchor.parentElement : null;
  }

  function createLauncher() {
    const existing = document.getElementById('tech-launcher');
    if (existing) { launcherEl = existing; return launcherEl; }

    const cluster = findHeaderCluster();
    if (!cluster) return null;

    launcherEl = el('li', {
      id: 'tech-launcher',
      class: 'tech-launcher',
      role: 'presentation',
    },
      el('button', {
        type: 'button',
        class: 'top_header_button button tech-launcher-btn',
        'aria-label': `Open ${SCRIPT_NAME} (Alt+I)`,
        title: `${SCRIPT_NAME} — ${SCRIPT_LONG_NAME} (Alt+I)`,
        html: launcherMarkHTML(),
        'on:click': (e) => { e.preventDefault(); togglePanel(); },
      }),
      el('span', { class: 'tech-launcher-pip' }),
    );

    // Insert immediately before .avatar so we sit at the rightmost spot
    // before the user's profile button. If the avatar is absent for any
    // reason, fall back to appending at the end of the cluster.
    const avatar = cluster.querySelector(':scope > li.avatar');
    if (avatar) cluster.insertBefore(launcherEl, avatar);
    else cluster.appendChild(launcherEl);

    updateLauncherIndicator();
    return launcherEl;
  }

  function updateLauncherIndicator() {
    const el = document.getElementById('tech-launcher');
    if (!el) return;
    const pip = el.querySelector('.tech-launcher-pip');
    if (!pip) return;
    let cls = '';
    if (isPolling)                       cls = 'spin';
    else if (meta.lastError)             cls = 'err';
    else if (meta.lastSuccessfulPollTs)  cls = 'ok';
    pip.className = 'tech-launcher-pip' + (cls ? ' ' + cls : '');
  }

  // Watch the persistent header region. Torn's SPA navigation can re-render
  // the toolbar; we re-inject on any childList change rather than trying to
  // be clever about which mutations matter. createLauncher() is cheap when
  // it's a no-op (single getElementById), so the observer is effectively
  // free at rest.
  function mountLauncher() {
    let attempts = 0;
    let observer = null;

    function attach() {
      createLauncher();
      const root = document.querySelector('.header-navigation') || document.body;
      if (observer) observer.disconnect();
      observer = new MutationObserver(() => createLauncher());
      observer.observe(root, { childList: true, subtree: true });
    }

    if (findHeaderCluster()) { attach(); return; }

    // Header isn't in the DOM yet (script may have raced page render).
    // Poll briefly via rAF, then fall back to a single-shot body observer.
    const waitForHeader = () => {
      if (findHeaderCluster()) { attach(); return; }
      if (++attempts < 60) { requestAnimationFrame(waitForHeader); return; }
      const bodyObs = new MutationObserver(() => {
        if (findHeaderCluster()) { bodyObs.disconnect(); attach(); }
      });
      bodyObs.observe(document.body, { childList: true, subtree: true });
    };
    waitForHeader();
  }

  function togglePanel(forceState) {
    const open = (typeof forceState === 'boolean') ? forceState : !settings.panelOpen;
    settings.panelOpen = open;
    store('settings', settings);
    if (open) {
      createPanel();
      panelEl.style.display = 'flex';
      renderActive();
    } else if (panelEl) {
      panelEl.style.display = 'none';
    }
  }

  // ─── DRAG ───────────────────────────────────────────────────────────────
  function positionStyle(pos) {
    const s = {};
    if (pos.right  != null) s.right  = pos.right + 'px';  else s.right  = '';
    if (pos.bottom != null) s.bottom = pos.bottom + 'px'; else s.bottom = '';
    if (pos.left   != null) s.left   = pos.left + 'px';
    if (pos.top    != null) s.top    = pos.top + 'px';
    return s;
  }

  // Keep the panel fully inside the viewport. With right+bottom anchoring,
  // an over-large `bottom` pushes the top edge above the screen and the
  // drag handle becomes unreachable. Called on create, after drag, and on
  // resize. `persist` writes the clamped value back into settings[posKey].
  function clampPanelPos(elNode, posKey, persist) {
    if (!elNode || !elNode.isConnected) return;
    const rect = elNode.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let right  = parseInt(elNode.style.right,  10);
    let bottom = parseInt(elNode.style.bottom, 10);
    if (Number.isNaN(right))  right  = Math.max(0, vw - rect.right);
    if (Number.isNaN(bottom)) bottom = Math.max(0, vh - rect.bottom);
    const maxRight  = Math.max(0, vw - rect.width);
    const maxBottom = Math.max(0, vh - rect.height);
    const cR = Math.min(maxRight,  Math.max(0, right));
    const cB = Math.min(maxBottom, Math.max(0, bottom));
    elNode.style.right  = cR + 'px';
    elNode.style.bottom = cB + 'px';
    elNode.style.left = '';
    elNode.style.top  = '';
    if (persist && posKey) {
      settings[posKey] = { right: cR, bottom: cB };
      store('settings', settings);
    }
  }

  function makeDraggable(targetEl, handleEl, posKey) {
    let dragging = false;
    let startX = 0, startY = 0;
    let startRight = 0, startBottom = 0;
    let maxRight = 0, maxBottom = 0;
    let moved = false;

    handleEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Don't start drag on form controls / interactive children
      const tag = (e.target.tagName || '').toLowerCase();
      if (['button', 'input', 'select', 'textarea', 'a'].includes(tag)) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = targetEl.getBoundingClientRect();
      startRight  = window.innerWidth  - rect.right;
      startBottom = window.innerHeight - rect.bottom;
      maxRight    = Math.max(0, window.innerWidth  - rect.width);
      maxBottom   = Math.max(0, window.innerHeight - rect.height);
      targetEl.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const newRight  = Math.min(maxRight,  Math.max(0, startRight  - dx));
      const newBottom = Math.min(maxBottom, Math.max(0, startBottom - dy));
      targetEl.style.right  = newRight  + 'px';
      targetEl.style.bottom = newBottom + 'px';
      targetEl.style.left = '';
      targetEl.style.top  = '';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      targetEl.classList.remove('dragging');
      if (moved) {
        const r = parseInt(targetEl.style.right, 10) || 0;
        const b = parseInt(targetEl.style.bottom, 10) || 0;
        settings[posKey] = { right: r, bottom: b };
        store('settings', settings);
      }
    });
  }

  // ─── TAMPERMONKEY MENU ──────────────────────────────────────────────────
  // Adds entries to the Tampermonkey right-click menu so power users can
  // trigger common actions without opening the panel. Wrapped in a typeof
  // guard so the script still loads if a manager doesn't expose this API.
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    try {
      GM_registerMenuCommand(`${SCRIPT_NAME}: Toggle panel`, () => togglePanel());
      GM_registerMenuCommand(`${SCRIPT_NAME}: Poll now`,     () => poll());
      GM_registerMenuCommand(`${SCRIPT_NAME}: Export fights (JSON)`, () => exportFights());
      GM_registerMenuCommand(`${SCRIPT_NAME}: TEST sanity check`, () => testRunSanityChecks());
      GM_registerMenuCommand(`${SCRIPT_NAME}: Reset panel position`, () => {
        settings.panelPos = { right: 20, bottom: 80 };
        store('settings', settings);
        if (panelEl) {
          panelEl.style.right  = '20px';
          panelEl.style.bottom = '80px';
          panelEl.style.left = '';
          panelEl.style.top  = '';
          if (panelEl.style.display === 'none') {
            settings.panelOpen = true;
            store('settings', settings);
            panelEl.style.display = 'flex';
          }
        } else if (settings.panelOpen === false) {
          settings.panelOpen = true;
          store('settings', settings);
          togglePanel(true);
        }
      });
    } catch (e) {
      console.warn('[TECH] Could not register menu commands:', e);
    }
  }

  // ─── BOOTSTRAP ──────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('tech-bootstrapped')) return;
    const marker = document.createElement('meta');
    marker.id = 'tech-bootstrapped';
    document.head && document.head.appendChild(marker);

    mountLauncher();
    registerMenuCommands();
    if (settings.panelOpen) { createPanel(); }

    document.addEventListener('keydown', (e) => {
      if (e.altKey === HOTKEY.alt && e.key && e.key.toLowerCase() === HOTKEY.key) {
        // Ignore when typing in an input on Torn pages
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (['input', 'textarea', 'select'].includes(tag)) return;
        togglePanel();
        e.preventDefault();
      }
    });

    if (settings.apiKey) startPolling();

    // v0.6.39 — paint the Targets panel with fresh status on init so the
    // user sees current online/offline state without waiting for the first
    // poll. Skips silently if nothing's pinned.
    if (settings.apiKey
        && Array.isArray(settings.targetIds) && settings.targetIds.length > 0) {
      refreshTargets({ force: true }).catch(function () {});
    }

    // v0.6.4 — Live-attack DOM hook. Only activates on attack pages
    // (/page.php?sid=attack as of v0.6.63; legacy /loader.php still
    // recognised but returns Torn's "endpoint retired" error page).
    // Cleans up stale buffer entries (>30min old) on each activation.
    if (isAttackPage()) {
      expireOldDomBuffer();
      attachLogObserver();
    }

    // v0.6.61 — Background chain-break watcher. Runs independent of the
    // panel so a user with TECH minimized still gets warned when their
    // chain dips under 60s. Cheap: every 5s, one DOM scrape + regex.
    // The check itself short-circuits when the toggle is off, so the
    // watcher can run unconditionally — toggling Settings doesn't need
    // to start/stop the interval.
    startChainWatcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  } catch (e) {
    console.error('[TECH] fatal init error', e);
  }
})();
