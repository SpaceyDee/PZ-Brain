# B42.19 Vanilla Trait ID Map

**Source:** `media/scripts/generated/characters/character_traits.txt` (B42.19 install)
**Display-name source:** `media/lua/shared/Translate/EN/UI.json`
**Total vanilla traits:** 97

## Resolution pattern

```lua
-- Vanilla trait lookup:
local handle = CharacterTrait.get(ResourceLocation.of("base:id"))
-- (lowercase id, preserve spaces as in 'base:out of shape')

-- New mod-defined trait registration:
local handle = CharacterTrait.register("mod:id")

-- Add to player:
player:getCharacterTraits():add(handle)
```

## Trait table

| Display Name | id (base:…) | good/bad | cost |
|---|---|---|---:|
| Adrenaline Junkie | `base:adrenalinejunkie` | good | 4 |
| Agoraphobic | `base:agoraphobic` | bad | -4 |
| All Thumbs | `base:allthumbs` | bad | -2 |
| Angler | `base:fishing` | good | 4 |
| Artisan | `base:artisan` | good | 2 |
| Athletic | `base:athletic` | good | 10 |
| Ax-pert | `base:axeman` | neutral (profession) | 0 |
| Baseball Player | `base:baseballplayer` | good | 4 |
| Blacksmith Knowledge | `base:blacksmith` | good | 6 |
| Blacksmith Knowledge | `base:blacksmith2` | neutral (profession) | 0 |
| Brave | `base:brave` | good | 4 |
| Brawler | `base:brawler` | good | 6 |
| Burglar | `base:burglar` | neutral (profession) | 0 |
| Bushcrafter | `base:wildernessknowledge` | good | 8 |
| Cat's Eyes | `base:nightvision` | good | 3 |
| Claustrophobic | `base:claustrophobic` | bad | -4 |
| Clumsy | `base:clumsy` | bad | -2 |
| Conspicuous | `base:conspicuous` | bad | -4 |
| Cowardly | `base:cowardly` | bad | -2 |
| Crafty | `base:crafty` | good | 3 |
| Deaf | `base:deaf` | bad | -12 |
| Desensitized | `base:desensitized` | neutral (profession) | 0 |
| Dextrous | `base:dextrous` | good | 2 |
| Disorganized | `base:disorganized` | bad | -6 |
| Eagle Eyed | `base:eagleeyed` | good | 4 |
| Emaciated | `base:emaciated` | bad (profession) | -10 |
| Fast Healer | `base:fasthealer` | good | 6 |
| Fast Learner | `base:fastlearner` | good | 6 |
| Fast Metabolism | `base:weightloss` | bad | -2 |
| Fast Reader | `base:fastreader` | good | 2 |
| Fear of Blood | `base:hemophobic` | bad | -5 |
| First Aider | `base:firstaid` | good | 2 |
| Fit | `base:fit` | good | 6 |
| Former Scout | `base:formerscout` | good | 6 |
| Gardener | `base:gardener` | good | 2 |
| Graceful | `base:graceful` | good | 4 |
| Gymnast | `base:gymnast` | good | 5 |
| Handy | `base:handy` | good | 8 |
| Hard of Hearing | `base:hardofhearing` | bad | -4 |
| Hearty Appetite | `base:heartyappetite` | bad | -4 |
| Herbalist | `base:herbalist` | good | 4 |
| Herbalist | `base:herbalist_prof` | neutral (profession) | 0 |
| High Thirst | `base:highthirst` | bad | -2 |
| High Weight | `base:overweight` | neutral (profession) | 0 |
| Hiker | `base:hiker` | good | 5 |
| Hunter | `base:hunter` | good | 8 |
| Illiterate | `base:illiterate` | bad | -10 |
| Inconspicuous | `base:inconspicuous` | good | 4 |
| Inventive | `base:inventive` | good | 2 |
| Inventive | `base:inventive_prof` | neutral (profession) | 0 |
| Iron Gut | `base:irongut` | good | 2 |
| Keen Cook | `base:cook` | good | 3 |
| Keen Cook | `base:cook2` | neutral (profession) | 0 |
| Keen Hearing | `base:keenhearing` | good | 6 |
| Light Eater | `base:lighteater` | good | 2 |
| Low Thirst | `base:lowthirst` | good | 2 |
| Low Weight | `base:underweight` | neutral (profession) | 0 |
| Marksman | `base:marksman` | neutral (profession) | 0 |
| Mason | `base:mason` | good | 2 |
| Night Owl | `base:nightowl` | neutral (profession) | 0 |
| Nutritionist | `base:nutritionist` | good | 2 |
| Nutritionist | `base:nutritionist2` | neutral (profession) | 0 |
| Organized | `base:organized` | good | 4 |
| Out of Shape | `base:out of shape` | bad | -6 |
| Outdoorsy | `base:outdoorsman` | good | 2 |
| Prone to Illness | `base:pronetoillness` | bad | -4 |
| Puny | `base:weak` | bad | -10 |
| Reluctant Fighter | `base:pacifist` | bad | -5 |
| Resilient | `base:resilient` | good | 4 |
| Restless Sleeper | `base:insomniac` | bad | -6 |
| Runner | `base:jogger` | good | 4 |
| Sewer | `base:tailor` | good | 4 |
| Short of Breath | `base:asthmatic` | bad | -5 |
| Short Sighted | `base:shortsighted` | bad | -2 |
| Sleepyhead | `base:needsmoresleep` | bad | -4 |
| Slow Healer | `base:slowhealer` | bad | -3 |
| Slow Learner | `base:slowlearner` | bad | -6 |
| Slow Metabolism | `base:weightgain` | bad | -2 |
| Slow Reader | `base:slowreader` | bad | -2 |
| Smoker | `base:smoker` | bad | -3 |
| Speed Demon | `base:speeddemon` | good | 1 |
| Stout | `base:stout` | good | 6 |
| Strong | `base:strong` | good | 10 |
| Sunday Driver | `base:sundaydriver` | bad | -1 |
| Target Shooter | `base:target_shooter` | good | 5 |
| Thick-skinned | `base:thickskinned` | good | 8 |
| Thin-skinned | `base:thinskinned` | bad | -8 |
| Tinkerer | `base:tinkerer` | good | 4 |
| Unfit | `base:unfit` | bad | -10 |
| Vehicle Knowledge | `base:mechanics` | good | 3 |
| Vehicle Knowledge | `base:mechanics2` | neutral (profession) | 0 |
| Very High Weight | `base:obese` | neutral (profession) | 0 |
| Very Low Weight | `base:very underweight` | neutral (profession) | 0 |
| Wakeful | `base:needslesssleep` | good | 3 |
| Weak | `base:feeble` | bad | -6 |
| Weak Stomach | `base:weakstomach` | bad | -2 |
| Whittler | `base:whittler` | good | 2 |
