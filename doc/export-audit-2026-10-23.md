# Export verification, October 23, 2026

## Evidence and scope

Compared the curated implementation with
`local/datamine/2026-10-23_02-31-51-671_+0100-hJTWej`, then compared all sixteen
export files structurally with the October 21 16:50 snapshot. Local exports are
evidence, not runtime dependencies.

Fifteen files are structurally identical, including raw buffs/passives, Inner
Ways, martial-art talents, item sets, equipment, progression, Mystics, and
Mechanism. Only `wwm-skills-normal-all.json` changed. Its only changed records
are 20603005, 20603102, 20603103, 20603201, and 20603202–20603205; every change
is inside `timings`. Skill coefficients, flat damage, cooldowns, descriptions,
and the other skill records are unchanged between these snapshots.

This verifies the complete export delta across all paths. It does **not**
establish complete source-to-runtime parity for every path. An unchanged export,
an existing DPS baseline, or a coefficient matching another record is not proof
of correct route ownership, effect eligibility, or event order. Existing
intentional exclusions and user-confirmed numerical exceptions remain in force.
The initial audit changed no calculation or combat data. The subsequent
user-requested opening-catch implementation is recorded below. Accepted DPS
snapshots remain unchanged pending numerical review.

## Scarlet Spin timing: confirmed differences

Source records 20603202–20603205 now distinguish normal and Fragrant Song
routes, collider windows, successful-catch events, Phantom creation, and
Resonance requests. The older model collapses several of these clocks.

All numbers below are seconds relative to the individual throw's start, before
the simulator's ping scheduling. Source selection is `variant: normal`.

| Stage | Direct hits, source and runtime | Runtime summon and immediate Creation Resonance | Export Phantom creation | Export Creation Resonance request | Catch window / next throw start |
| ----- | ------------------------------- | ----------------------------------------------- | ----------------------- | --------------------------------- | ------------------------------- |
| 1     | 0.446326 / 0.800308             | 0.800308                                        | 0.746154                | 0.976923                          | 0.615385–1.076923 / 1.076923    |
| 2     | 0.250125 / 0.633650             | 0.633650                                        | 0.583333                | 0.833333                          | 0.416667–0.958333 / 0.958333    |
| 3     | 0.363809 / 0.782191             | 0.782191                                        | 0.727273                | 1.000000                          | 0.545455–1.090909 / 1.090909    |
| 4     | 0.272884 / 0.682212             | 0.682212                                        | 0.609091                | 0.881818                          | 0.454545–1.000000 / 1.000000    |

Direct-hit clocks and unenhanced next-throw gates agree within floating-point
precision. The important mismatches are the supporting events:

1. **Phantom creation and its Resonance are conflated.**
   `PhantomUmbrellaSummon` replaces the Phantom and immediately triggers
   `Resonance`. Each stage schedules that helper on the returning direct hit.
   The export gives creation and the subsequent Resonance request separate
   clocks. T6 still grants the every-throw summon; the eligibility rule is not
   the timing discrepancy.
2. **Catch effects resolve at the continuation gate.**
   `EverspringPerfectCatch` and the next stage have the same authored `time`.
   `queueTime` admits the queued trigger earlier but does not execute the catch
   there: the timeline computes target start from `action.time`. The export
   makes the catch Resonance, Falling Blossoms, and the earning of Fragrant
   Song occur at the accepted input within the window, independently of the
   next throw's start. A successful catch at the closing boundary remains an
   allowed case; the export alone does not select the player's input time.
3. **Enhanced catch windows are not uniform scaled ordinary windows.**
   Runtime scales all stage clocks by `1 / 1.3` when Fragrant Song applies.
   That reproduces the enhanced direct hits and continuation gates, but not
   the enhanced catch-window opening:

   | Stage | Current scaled queue opening | Export enhanced catch opening | Export enhanced close / next start |
   | ----- | ---------------------------- | ----------------------------- | ---------------------------------- |
   | 1     | 0.473373                     | 0.295858                      | 0.828402                           |
   | 2     | 0.320513                     | 0.252564                      | 0.737179                           |
   | 3     | 0.419580                     | 0.349650                      | 0.839161                           |
   | 4     | 0.349650                     | 0.279720                      | 0.769231                           |

4. **Readiness and damage-effect cleanup have different lifetimes.**
   The export distinguishes speed readiness consumed during the throw, an
   action-bound active flag, and damage-effect removal at the enhanced
   continuation gate. Runtime consumes `FragrantSong` at throw start and uses
   a separate two-second `FragrantSongResonance` marker, cleared/re-primed by
   subsequent throws. The intended ownership agrees with the user's rule:
   Fragrant Song buffs the throw and that throw's Resonances. Ownership alone
   does not verify the explicit source cleanup at interruption and endpoints.
5. **Deferred first-catch handling is absent as an explicit mechanism.**
   The export allows a catch with no available Phantom to set a pending flag,
   checked later at the Creation Resonance request. This is an alternative to
   that catch's immediate request, not an extra unconditional pulse. The
   current catch only tests whether `PhantomUmbrella` exists at execution.

Do not count the export's separately labelled **Unconnected Resonance request**
as an extra guaranteed hit: the export explicitly leaves target availability
unresolved. Likewise, a Resonance request is not automatically proof of its
damage-contact timestamp. These distinctions must be preserved in a repair.

The current 14-throw rotations are not disproved merely by these findings:
next-start gates still agree. Resonance timing, Falling Blossoms timing,
Fragrant Song availability, and effect coverage require a rebuilt timeline to
measure their damage impact. The previous experiment moving only Exhausted
does not exercise these corrections.

## Rest of Dust

| Area                        | Verification result                                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scarlet direct damage       | Outward/return coefficients 1.08504 / 0.72336, flats 300.6 / 200.4 Physical and 163.8 / 109.2 Attribute agree with normal level-100 hit curves.                                                                                                                                                                            |
| Ordinary Resonance          | 0.54 Physical/Attribute and zero flats agree with exported ordinary Resonance hits. No independent Perfect Catch damage bonus is authored.                                                                                                                                                                                 |
| Dreamwrought Bubbles damage | 1.00728 / 0.67152 coefficients, Physical flats 279 / 186 and Attribute flats 151.8 / 101.2 agree with the source hit curves.                                                                                                                                                                                               |
| Bubbles release timing      | Both hits and the 1.2-second release interrupt agree. The new `releaseCharge` reports normal opening 0.240, threshold 0.5, maximum 1.9; retain the documented user-supplied 0.743-second charge until its replacement is explicitly chosen. Do not equate these fields to an unconditional new cast duration.              |
| Soul Sweep                  | Coefficient/flat split is 30% / 35% / 35% of the level-100 base. The export still has no direct-hit clocks; existing three hits at zero remain documented timing placeholders. Cast interrupt remains 1.75 seconds.                                                                                                        |
| Piercing Dart               | Seven-hit source ownership and per-hit coefficients agree, including equal first/second coefficients. Runtime hit clocks round the precise full-token route to 0.099 / 0.298 / 0.498 / 0.796 / 1.020 / 1.268 / 1.841. The source retains distinct lower-token route clocks; these are not newly changed records.           |
| Burn and Bury               | Soul Loss/Soulbreak branch coefficients already include source 0.78 / 1.3 scaling; the separate boss base-damage bonus remains 30%. The cast interrupt remains 0.65 seconds. Its 0.53-second hit is an existing authored assumption, not newly verified by a direct-hit route.                                             |
| Phantom Rally               | T3 five-second Chime stacks, T4 Resonance bonus, T5 2.8% Physical damage, and T6 every-throw summon remain consistent with the selected definitions. The timing defects above remain open.                                                                                                                                 |
| Towline Sweep               | T1 21-second duration, T3 per-ordinal bonuses, T5 5.1 penetration, T6 15% Burn bonus and 12% settlement remain consistent. Own Soulbreak refresh/settlement is range-limited to 15m.                                                                                                                                       |
| Settlement                  | Current replay formula applies only `replayDmgBonus` to recorded damage times the payout coefficient. The only authored provider is Wildstride +20% requiring Strayhunt; ordinary bonuses are not reapplied. This agrees with the user's clarification.                                                                    |
| Bitter Seasons              | Selected T6 data has 15% direct-hit application, 1.2% defense-reduction stacks, five-stack -10 Physical Resistance, and T5 +2.5% Physical damage. No new Bitter Seasons export change or newly established error was found. Proc eligibility beyond the modeled direct-hit predicates is not proved by tooltip text alone. |
| Song of Tang                | Export T6 text removes the HP split; runtime removes it at T5 under the previously approved interpretation. This remains an explicit text/implementation difference at T5, not a difference for the all-T6 Bitter Seasons benchmark.                                                                                       |
| Reviewed bonus categories   | Category 1 versus channel scale versus attunement/Exhausted separation is unchanged. Fire +1.5% and the throw's Fragrant Song bonus are user-confirmed and must not be removed to fit the benchmark.                                                                                                                       |
| Unimplemented Dust skills   | The changed Heavy Attack / Cyclone Waltz records do not authorize claiming support for ordinary umbrella attacks absent from the runtime skill map. Existing user exclusions for resources, HP drain, Tenacity, and control effects remain exclusions.                                                                     |

The twelve numeric Everspring damage actions all match source normal hit
vectors. The nine Piercing Dart / Burn and Bury damage actions match their
hit vectors; Soul Sweep's three actions instead match its documented split
of the source base. This is numerical verification, not proof of event timing.

## Other paths

All non-Everspring source skills and the fifteen other catalogs are unchanged
from the October 21 snapshot. Rechecking existing runtime records gives the
following cross-path disposition; this is not an assertion that every mechanic
in those paths has been fully traced through raw game execution.

| Path / shared area      | Disposition                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Splendor                | No new export delta. Mountain's Might T4 still grants 3% Direct Affinity without separating the source's 1.5% base and additional 1.5% Boss condition. Target classification needs a decision before changing Dummy behavior.                                                                        |
| Umbra                   | No new export delta. Strategic Sword's authored numeric hit vectors match the source pool; documented user-confirmed Bleed/Blood Burst and composite/Smolder exceptions remain authoritative.                                                                                                        |
| Might                   | No new export delta. Previously documented Storm Roar / Thunder Shock precision and Stonebreaker Cleave route reconciliation remain open; an unmatched raw curve is not proof the selected runtime route is wrong.                                                                                   |
| Strength / Mixed        | No new export delta. Previously missing Phalanxbane rank-14 no-flat coefficient scaling is now implemented; it must not be listed as still missing. Existing route/decay exceptions remain documented.                                                                                               |
| Kite                    | No new export delta. Sky Gripped T3 still lacks the source's Boss restriction, and T6 still lacks the separate Falcon-on-Exhausted-Boss reset rule. Current charged-hit replay listener is not that reset. Preserve the separately approved Falcon +12% patch and current cooldown/rotation repairs. |
| Wind                    | No new export delta. Preserve current user-reviewed combo-window/cancel sequences. Shared Breaking Point below T3 remains an open eligibility issue.                                                                                                                                                 |
| Deluge / Wings          | No new export delta. Ivorybloom's three-second critical-heal retention is now implemented; the older audit's missing-feature description is superseded. Maintain the documented source/observation exceptions and healing assumptions.                                                               |
| Jade / Draught          | Planner-only paths remain incomplete; unchanged catalogs do not establish runnable combat parity. The existing audit lists missing combat/resource mechanics.                                                                                                                                        |
| Shared Breaking Point   | T0 still tests Exhausted without the source's Critical-only condition before T3. This is irrelevant to the benchmark's selected four Inner Ways but relevant to lower-tier alternatives on other paths.                                                                                              |
| Shared Morale Chant     | Below-T6 source proc chances require separate outcome handling; the all-T6 benchmark uses the source's guaranteed stack chance.                                                                                                                                                                      |
| Shared Summon Lightning | Source normal cooldown remains 30 seconds; runtime still has no authored cooldown.                                                                                                                                                                                                                   |
| Sets / progression      | Export data unchanged. Tier-dependent set stats and Ivorybloom retention are implemented; stale older findings must not be treated as current defects.                                                                                                                                               |

The older inventory explicitly does not establish complete source-backed parity
for all skill routes, buffs, Mystics, item affixes, or planner-only paths. A broad
numeric screen likewise produces unresolved candidates for scaled/composite
and user-confirmed routes; these are not counted as bugs without ownership
tracing. See `datamine-balance-audit.md`, `damage-formula.md`, and `skill-data.md`
for preserved exceptions and unsupported mechanics.

## Next correction boundary

Scarlet's separately timed creation, catch, and Resonance mechanisms are the
first concrete corrections to investigate. Choose the accepted-catch input
policy explicitly, preserve throw ownership, implement the deferred alternative
without double-counting, and verify interruption/expiry ordering. Rebuild both
Dust rotations and their Qi anchors when their event timelines change. Report
old/new DPS and event counts for review before updating any accepted snapshot.

## Validation

### Implemented opening-catch policy

After the trials, the user requested the time-table update and 87 Resonance hits.
Production data now separates creation/request timing, uses the exported normal
and enhanced opening inputs, and resolves the deferred no-Phantom catch once.
The existing continuation gates are retained. An already admitted throw completes
its catch even after Flower Burial expires; only admission of another throw is
gated by that effect. This is the precise boundary behind the additional final
catch per batch, rather than a claim that every final input falls before expiry.

The implemented benchmark reproduces the opening-catch column below: 69,449.526
DPS at breakthrough 18 for 100% PC, 87 Resonance hits, and 84 direct Scarlet hits.
Regular has 89 Resonance hits. Before/after production bundles retain identical
throw-start timestamps and authored Qi markers. Ownership tests verify that the
early earning catch cannot grant Fragrant Song to its current ordinary throw.

`npm run build` passed, including all 287 ordinary test files / 1,632 tests,
TypeScript, localization checks, and Vite. `npm run lint` passed with existing
array-index-key warnings in unrelated UI files. The focused benchmark and Dust
mechanics tests passed. The DPS guard reports twelve changed Dust cases and no
other path failures; the exact proposed DPS/total damage values are recorded in
`dps-snapshots.md`, without refreshing the accepted snapshot JSON.

### Isolated Dust timing trial

Rebuilt production calculation bundles with in-memory skill/effect variants,
using Fully Relayed Min with the supplied benchmark overrides: 2918 effective
minimum Physical Attack after food, Bamboocut 360–806 plus 68 Formless,
Silkbind 44, Precision 133.8%, Critical 147.9%, Affinity 19.1%, Direct Critical
4.6%, 45.8 Physical Penetration before Towline T5, and 25% Everspring Martial
Art attunement. Remaining bonuses come from the preset. The four T6 Inner Ways
are Phantom Rally, Towline Sweep, Morale Chant, and Bitter Seasons. Fire,
Physical Attack food, and Wraithstrike are selected.

Two partial timing variants were tested without changing production data:

- Separate source-timed Phantom creation and Creation Resonance requests,
  preserving the existing catch-at-close policy. A throw-local creation marker
  ensures lower-tier cadence does not emit an unconditional every-throw pulse.
- The same separation with accepted catches at the normal/enhanced window
  opening. A pending catch with no Phantom resolves at the later request;
  it does not also emit an immediate catch pulse. The existing continuation
  gates, Fragrant Song ownership rules, and authored Qi markers are retained.

| Rotation | Breakthrough | Existing DPS      | Separate creation/request, catch at close | Catch at opening with deferred alternative |
| -------- | ------------ | ----------------- | ----------------------------------------- | ------------------------------------------ |
| 100% PC  | 18           | 68791.58032616547 | 68794.64796949839                         | 69449.52587928498                          |
| Regular  | 18           | 69092.6744455861  | 69098.13563287197                         | 69802.6824118557                           |
| 100% PC  | 19           | 69251.3882334393  | 69254.45822779287                         | 69910.24194673805                          |
| Regular  | 19           | 69553.13825402776 | 69558.61117397333                         | 70264.24212213818                          |

For breakthrough-18 100% PC, separating creation/request changes DPS by
+0.00446%; accepting early catches changes it by +0.95643%. The early-catch
variant retains all 84 direct Scarlet hits but increases total Resonance hits
from 84 to 87: one additional final catch fits in each batch. Regular similarly
moves from 86 to 89 Resonance hits. These alternatives do not close the gap to
the supplied 66,800 DPS average, and neither reproduces the screenshot's 83
Resonance hits.

The trial checked source request offsets for ordinary/enhanced throws, retained
direct-hit counts, one accepted catch per early-policy throw, and two first-throw
pulses at the request when the early catch had no Phantom (creation plus deferred
catch). All checks passed. These experiments do not constitute a completed
implementation of readiness cleanup, interruption/endpoint ordering, projectile
contact latency, or a recalibrated Qi ramp. No snapshot was refreshed and no
production timing edit was retained. Do not describe these values as accepted
release DPS or as a test of every proposed lifecycle correction.

### Second supplied benchmark: Song of Tang

The user subsequently clarified to retain the preset's actual attribute amounts
and replace one Max Bamboocut affix with the same amount of Min Silkbind, rather
than infer a component split from the screenshot. That literal reconstruction
supersedes the provisional 69.9k comparison below. The tier-100 affix swap is
48.316 Max Bamboocut to 48.316 Min Silkbind; it leaves raw Bamboocut at
360–1010.896, Formless at 26.4, and Silkbind at 48.316 effective minimum/maximum.
With the same visible non-attribute overrides and Song of Tang T6, the results
are 71,073.877 DPS for 100% PC and 71,313.418 for Regular. The former is 5.873%
above the two-parse mean of 67,131 DPS. Its per-skill DPS is Scarlet 31,574.497,
Resonance 18,674.797, Soulbreak 7,593.000, and Flute 3,881.988, with respective
hit counts 84 / 87 / 4 / 12.

However, this exact preset swap produces combined effective Attribute Attack
434.716–1085.612, not the screenshot's 498–938. Thus the instructed literal
preset reconstruction does not reproduce the pictured attribute sheet; its
total discrepancy must not be attributed wholly to a damage-formula error.
No additional attribute values were invented to force the ranges to agree.

The next requested variant swaps a second 48.316 Max Bamboocut affix to Min
Formless and explicitly caps the combined maximum at 938. With all other
overrides retained, this gives raw Bamboocut 360–863.284, Formless 74.716–26.4,
and Silkbind 48.316–0, for combined effective Attribute Attack 483.032–938.
Formless minimum and maximum remain separate additions to the primary channel;
do not use the raised minimum as the maximum addition. This variant calculates
69,682.593 DPS for 100% PC (3.801% above the two-parse mean) and 69,916.362 DPS
for Regular. The former's per-skill DPS is Scarlet 30,984.319, Resonance
18,272.189, Soulbreak 7,444.326, and Flute 3,799.094. The remaining minimum-range
difference from the screenshot's 498 is reported rather than silently corrected.

The user supplied another setup based on Fully Relayed Min, explicitly using
Song of Tang rather than Bitter Seasons. The screenshot has 2673 minimum
Physical Attack **before** food, so the selected food produces 2813 effective
minimum. Precision 129.0%, Critical 151.6%, Affinity 19.0%, and Direct Critical
4.6% reproduce the displayed 99.6% Effective Precision and 94.5% final combined
Critical/Affinity at breakthrough 18. Attribute penetration 23.6 agrees with
that talent rank. Physical Penetration 52.4 already includes Towline's 5.1:
the screenshot separates 47.3 attuning plus 5.1 non-attuning. Do not add Towline
or weapon attuning to 52.4 again.

Further overrides are All Martial Arts 6.3%, Umbrella 7.0%, skill attunement
24.6%, and Boss damage 7.1%. Other unshown damage stats and all four T6 Inner
Ways retain the preset values. Fire, physical-attack food, and Wraithstrike are
retained from the prior setup. The user reports maximum Bamboocut affixes with
one replaced by minimum Silkbind. The combined Attribute Attack screenshot
shows 498–938 but does not show the component tooltip.

Consequently, the component split is provisional: with the all-maximum setup's
360 minimum Bamboocut, 800 maximum Bamboocut, equal minimum/maximum Formless,
and one minimum-Silkbind affix, a Silkbind value of 48.316 (the preset affix
magnitude) implies 89.684 Formless. This reproduces both combined endpoints.
It is not a claim that the screenshot proves those individual component values.
Screening a normal tier-100 minimum-Silkbind roll of 25.7–51.4, while preserving
both displayed endpoints, gives 69,821.889–70,153.062 DPS for 100% PC. Actual
component tooltip values are required for an exact reconstruction.

| Skill        | Provisional 100% PC calculation DPS (hits) | First parse DPS (hits) | Second parse DPS (hits) |
| ------------ | -----------------------------------------: | ---------------------: | ----------------------: |
| Total        |                                  69861.630 |                  67157 |                   67105 |
| Scarlet Spin |                             31061.534 (84) |             30949 (84) |              30168 (84) |
| Resonance    |                             18324.756 (87) |             17178 (86) |              16745 (83) |
| Soulbreak    |                               7463.463 (4) |               7170 (4) |                7137 (4) |
| Flute        |                              3809.063 (12) |              3135 (11) |               3916 (12) |

The two observed totals average 67,131 DPS; the provisional calculation is
4.068% higher. Scarlet is close to the first parse, but the calculated mean
damage per Resonance is 12,637.763 versus 11,984.953 and 12,104.940 in the
parses, respectively 5.447% and 4.402% higher even after dividing by their own
hit counts. Thus unequal pulse counts are not the whole provisional difference.
The differing Flute and Resonance counts also establish that neither screenshot
is an exact event-count match to the current 100% PC preset. Two individual
parses do not establish a stable in-game expectation, and this comparison does
not justify changing a multiplier or accepting pending snapshots.

- `npm run test -- --pool threads --maxWorkers 1`: 287 test files and 1,628
  tests passed. This is the ordinary suite, not the accepted DPS snapshot guard.
- `npm run format` and `npm run format:check` passed.
- No implementation or snapshot changes were made. Passing regression tests
  validate existing behavior; they do not contradict the new source findings
  or establish game parity for unsupported routes.
