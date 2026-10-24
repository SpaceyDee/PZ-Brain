# Build 42.19 Vanilla Reference Data

This reference document contains canonical vanilla data for character traits and professions, extracted directly from Build 42.19 source files.

## 1. Vanilla Trait ID Map
Canonical `ResourceLocation` IDs for vanilla traits. Use: `CharacterTrait.get(ResourceLocation.of("base:<trait_name>"))`.

> **CANONICAL SOURCE NOTE (2026-06-02):** The authoritative trait-id map is
> `Brain/references/b42-vanilla-trait-id-map.md` (4.7) — it adds good/bad/neutral
> + cost columns and is what Lane C content authoring uses. This section was
> verified to AGREE with it on every id (display labels may differ, e.g. this doc
> says "Tailor" where the canonical says "Sewer" — same id `base:tailor`). Treat
> this section as a secondary mirror; the **Profession Affinity data in §2 below
> is this document's unique, primary contribution** (Phase 3 input).

*Source: `ProjectZomboid\media\scripts\generated\characters\character_traits.txt`*

| Trait Name | ResourceLocation ID |
| :--- | :--- |
| Adrenaline Junkie | `base:adrenalinejunkie` |
| Agoraphobic | `base:agoraphobic` |
| All Thumbs | `base:allthumbs` |
| Artisan | `base:artisan` |
| Asthmatic | `base:asthmatic` |
| Athletic | `base:athletic` |
| Axeman | `base:axeman` |
| Baseball Player | `base:baseballplayer` |
| Blacksmith | `base:blacksmith` |
| Blacksmith (Alt) | `base:blacksmith2` |
| Brave | `base:brave` |
| Brawler | `base:brawler` |
| Burglar | `base:burglar` |
| Claustrophobic | `base:claustrophobic` |
| Clumsy | `base:clumsy` |
| Conspicuous | `base:conspicuous` |
| Cook | `base:cook` |
| Cook (Alt) | `base:cook2` |
| Cowardly | `base:cowardly` |
| Crafty | `base:crafty` |
| Deaf | `base:deaf` |
| Desensitized | `base:desensitized` |
| Dextrous | `base:dextrous` |
| Disorganized | `base:disorganized` |
| Eagle Eyed | `base:eagleeyed` |
| Emaciated | `base:emaciated` |
| Fast Healer | `base:fasthealer` |
| Fast Learner | `base:fastlearner` |
| Fast Reader | `base:fastreader` |
| Feeble | `base:feeble` |
| First Aid | `base:firstaid` |
| Fishing | `base:fishing` |
| Fit | `base:fit` |
| Gardener | `base:gardener` |
| Graceful | `base:graceful` |
| Gymnast | `base:gymnast` |
| Handy | `base:handy` |
| Hard of Hearing | `base:hardofhearing` |
| Hearty Appetite | `base:heartyappetite` |
| Hemophobic | `base:hemophobic` |
| Herbalist | `base:herbalist` |
| Herbalist (Prof) | `base:herbalist_prof` |
| Hiker | `base:hiker` |
| High Thirst | `base:highthirst` |
| Hunter | `base:hunter` |
| Illiterate | `base:illiterate` |
| Inconspicuous | `base:inconspicuous` |
| Inventive | `base:inventive` |
| Inventive (Prof) | `base:inventive_prof` |
| Iron Gut | `base:irongut` |
| Insomniac | `base:insomniac` |
| Jogger | `base:jogger` |
| Keen Hearing | `base:keenhearing` |
| Light Eater | `base:lighteater` |
| Low Thirst | `base:lowthirst` |
| Marksman | `base:marksman` |
| Mason | `base:mason` |
| Mechanics | `base:mechanics` |
| Mechanics (Alt) | `base:mechanics2` |
| Needs Less Sleep | `base:needslesssleep` |
| Needs More Sleep | `base:needsmoresleep` |
| Night Owl | `base:nightowl` |
| Night Vision | `base:nightvision` |
| Nutritionist | `base:nutritionist` |
| Nutritionist (Alt) | `base:nutritionist2` |
| Obese | `base:obese` |
| Organized | `base:organized` |
| Outdoorsman | `base:outdoorsman` |
| Out of Shape | `base:out of shape` |
| Overweight | `base:overweight` |
| Pacifist | `base:pacifist` |
| Prone to Illness | `base:pronetoillness` |
| Resilient | `base:resilient` |
| Former Scout | `base:formerscout` |
| Short Sighted | `base:shortsighted` |
| Slow Healer | `base:slowhealer` |
| Slow Reader | `base:slowreader` |
| Slow Learner | `base:slowlearner` |
| Smoker | `base:smoker` |
| Speed Demon | `base:speeddemon` |
| Stout | `base:stout` |
| Strong | `base:strong` |
| Sunday Driver | `base:sundaydriver` |
| Tailor | `base:tailor` |
| Target Shooter | `base:target_shooter` |
| Thick Skinned | `base:thickskinned` |
| Thin Skinned | `base:thinskinned` |
| Tinkerer | `base:tinkerer` |
| Underweight | `base:underweight` |
| Unfit | `base:unfit` |
| Very Underweight | `base:very underweight` |
| Weak | `base:weak` |
| Weak Stomach | `base:weakstomach` |
| Weight Gain | `base:weightgain` |
| Weight Loss | `base:weightloss` |
| Whittler | `base:whittler` |
| Wilderness Knowledge | `base:wildernessknowledge` |

## 2. Profession Affinity Data (XPBoosts)
Mapping vanilla occupations to attribute affinity axes (Physical/Mental/Cunning/Agility).

*Source: `ProjectZomboid\media\scripts\generated\characters\character_professions.txt`*

| Profession | Raw XP Boosts (Vanilla) | Suggested Axis Affinity |
| :--- | :--- | :--- |
| Burglar | Nimble=2;Sneak=2;Lightfoot=2 | Agility |
| Burger Flipper | Cooking=2;Maintenance=1;SmallBlade=1 | Mental |
| Carpenter | Woodwork=4;Carving=1;SmallBlunt=1;Masonry=1;Maintenance=1 | Mental |
| Chef | Cooking=4;Maintenance=1;SmallBlade=1;Butchering=2 | Mental |
| Construction Worker | SmallBlunt=2;Blunt=1;Masonry=2;Woodwork=1;Maintenance=1 | Physical |
| Doctor | Doctor=6;SmallBlade=1 | Mental |
| Electrician | Electricity=5 | Mental |
| Engineer | Electricity=1;Woodwork=1;Masonry=1 | Mental |
| Farmer | Farming=4;Husbandry=1;Strength=1 | Mental |
| Fire Officer | Sprinting=1;Strength=1;Fitness=1;Axe=1 | Physical/Agility |
| Fisherman | Fishing=3;PlantScavenging=1;Butchering=1 | Mental |
| Fitness Instructor | Fitness=3;Sprinting=2;Strength=1 | Physical/Agility |
| Lumberjack | Axe=2;Strength=1;Maintenance=1 | Physical |
| Mechanics | Mechanics=4;MetalWelding=1 | Mental |
| Metalworker | MetalWelding=4 | Mental |
| Nurse | Doctor=3;Lightfoot=1;Fitness=1 | Mental/Agility |
| Park Ranger | Trapping=1;Doctor=1;PlantScavenging=1;FlintKnapping=1;Carving=1 | Mental |
| Police Officer | Aiming=4;Reloading=1;Nimble=1 | Cunning/Agility |
| Rancher | Husbandry=4;Butchering=3;Fitness=1 | Mental |
| Repairman | Woodwork=1;Maintenance=2;SmallBlunt=1;Masonry=1 | Mental |
| Security Guard | Sprinting=2;Lightfoot=1;SmallBlunt=1 | Agility |
| Smither | Blacksmith=4;Maintenance=1;SmallBlunt=1 | Mental |
| Tailor | Tailoring=4 | Mental |
| Unemployed | - | - |
| Veteran | Aiming=2;Reloading=2 | Cunning |

### Attribute Mapping Guide (Suggestion)
*   **Physical**: Strength, Fitness, Heavy weapon combat (Axe, Blunt)
*   **Mental**: Crafting, Medicine, Farming, Repair, Cooking
*   **Cunning**: Ranged combat (Aiming, Reloading)
*   **Agility**: Movement skills (Lightfoot, Nimble, Sneak, Sprinting)
