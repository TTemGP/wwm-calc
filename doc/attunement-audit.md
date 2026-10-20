# PvE attunement catalog: deferred work

Source: the user-supplied nine-category, 45-affix PvE catalog and subsequent
matching clarifications. Official IDs map to stable keys through
`data/official/affix-map.json`. New definitions use supplied names; existing
names and older ID aliases are preserved. Source `min` and `format` are ignored.
The existing Tier 96 armor maximum of `0.06` matches every supplied `max`.

The Draught additions use IDs `279551`–`279555` for Driftcleave - Deepdaze,
Skystrike Special, Skystrike Martial Art, Riven Light, and Riven Martial Art
respectively. These definitions use the confirmed shared level-based armor maximum
(`0.06` at level 96). Driftcleave requires only the `Deepdaze` skill tag,
independent of active buffs or the skill's martial art. Its selector eligibility
covers both Draught martial arts. The other four require the owning martial-art
tag plus `Special`, `MartialArt`, or `Light`. Draught castable skills are
not defined yet, so these entries support gear planning and matching future actions.

## Deferred effects and existing-definition changes

| Official ID                                   | Attunement                              | Deferred work                                                                                                        |
| --------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 280201                                        | Thundercry Blade - Shield Boost         | Remains an empty, unsupported attunement. Shield strength calculation is not implemented.                            |
| 280202–280205, 280401, 280402, 280404, 280405 | Existing Might and Deluge display names | Existing labels include `-` after the martial-art name; supplied labels omit it. Cosmetic renaming remains deferred. |

Thundercry Charged Skill DMG Boost retains its confirmed `StonebreakerQuake`
exclusion. Panacea Healing Skill Boost retains its `Heavy` classification.

Wicked Defiance (Gauntlet VC) currently has `VariedCombo` without `Light` or
`Heavy`. Its classification is pending user clarification, so `279753` does
not yet match that skill. Do not guess a tag that could also change other bonuses.

## Confirmed matching and pending skill data

Attunement damage uses the standalone multiplier. Every `effect.tags` entry
must match; nested arrays match any one of their tags. Damage and healing use
the same matcher, and multiple matching alternatives never duplicate a bonus.

All six Jade entries use the shared level-96 maximum of `0.06`; minimum rolls
are not stored in the catalog.

The user confirmed these scopes:

- `280301`: Inkwell Fan with `Charged`.
- `280302`: Inkwell Fan with Special **or** Pursuit.
- `280303`: Vernal Umbrella with `MartialArt`.
- `280304` and `280305`: Vernal Umbrella with `FrequentProjectile`. Both IDs
  remain distinct and active with the same confirmed scope; generic `Projectile`
  or `Ballistic` tags do not qualify.
- `280306`: Vernal Umbrella with `Light`, `Heavy`, **or** `VariedCombo`.
  Matching multiple categories applies this bonus once.
- `279753`: Heavenwill Gauntlets with Varied Combo and either Light or Heavy.
- `280401`: Panacea Fan Martial Art skill healing, Fan Q and QQ including cancels.
- `280404`: Soulshade Umbrella Martial Art skill healing, Umbrella Q.

The healing skills carry singular `MartialArt`, distinct from broad
`MartialArts`. Special and Heavy healing do not receive the Martial Art boosts.

The newly covered arts do not yet have castable skill data. Their attunements
are ready for matching actions but do not create rotation moves. Martial Art,
Charged, Special, and Pursuit use `MartialArt`, `Charged`, `Special`, and
`Pursuit` respectively. Infernal Empowered Light requires `Light` and
`Empowered`; it does not automatically activate Flamelash. Strategic Bleeding
requires `StrategicSword` and `Bleed`; Mortal Rodent requires `MortalRopeDart`
and `Rodent`. Bleed/High Bleed sharing must be confirmed when those definitions
are authored. Heavenquaker retains canonical `HeavenQuakerSpear` capitalization.

## Verification

`tests/attunement-import.test.ts` checks the catalog's official IDs through
import, saved-gear validation, equipped aggregation, roll normalization, and
calculation. It verifies level-96 maximum-roll damage, alternative matching, missing-tag rejection, single
application when both alternatives match, inactive definitions, and healing
scope using actual Fan/Umbrella skill and periodic healing data.
Driftcleave checks distinguish the `Deepdaze` skill tag from the
`InebriateDeepdaze` buff and verify both Draught martial arts.
