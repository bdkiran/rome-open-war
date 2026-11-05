# Models

The game draws its own simple models for armies and cities. To use real 3D
models instead, put `.glb` (or `.gltf`) files in this folder and list them in
`models.json`:

```json
{
  "army": "standard-bearer.glb",
  "city": "town.glb",
  "capital": "capital.glb",
  "soldierHeight": 36,
  "cityWidth": 60
}
```

Every entry is optional; anything not listed keeps the built-in model.

- **Army.** One model stands for every army, whatever it's made of. The
  game plants a pole beside it carrying the army's banner (its strength and
  regiments), so the model doesn't need its own.
- **Size.** Models are scaled automatically: the army model to `soldierHeight`
  (default 36; a hex is 64 across) and cities to `cityWidth` (default 60).
  They're stood on the ground wherever their origin is.
- **Faction colours.** Any material whose name contains `faction` (for example
  `FactionCloth`) is recoloured to the owner's colour.
- **Walking and standing.** If the army model has an animation clip whose
  name contains `walk`, it plays while the army is moving from tile to tile;
  one whose name contains `idle` plays while it stands. Without an idle clip
  a standing army holds the model's rest pose.
- **Besieging.** An army besieging a city next to it faces the city and
  plays a clip whose name contains `ready` (falling back to `idle`), with a
  clip whose name contains `attack` played once every few seconds.
- **Facing.** The army model should face +Z (towards the camera when
  standing); it's turned to face the way it walks.
- **Culture kits.** Nodes named `kit_<culture>_<part>` (for example
  `kit_roman_shield`) are shown only on armies of that culture
  (`src/data/cultures.ts`); everything else shows on every army. Kit parts
  are left out when the model is measured for size, so a long spear doesn't
  shrink the soldier. Scouts show the `kit_scout_*` parts instead of a
  culture's (in `knight.glb`, a dark hood, mantle and cloak).

Good free sources of low-poly, public-domain (CC0) models include Quaternius
and Kenney.

## In use

- **`knight.glb`** (army): the *LowPoly Animated Knight* by Quaternius,
  [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
  ([source](https://quaternius.itch.io/lowpoly-animated-knight)), with a
  kit for each culture. It's built by `npm run army-model`
  (`tools/buildArmyModel.ts`) from the pack's FBX files in
  `source/quaternius-knight/`: the knight, the pack's `Helmet1` (Roman) and
  `Helmet2` (Hellenistic) in bronze, its `ShortSword` (Roman) and `Sword`
  (Celtic), and shields, spears, crests, caps and the falx made from simple
  shapes in the tool. The `Armor` material becomes `FactionArmor`; shields
  (`FactionShield`) and the Hellenistic crest (`FactionCrest`) also take the
  owner's colour. Its clips are `Idle`, `Walking`, `Ready` (the pack's
  `Idle_swordRight`) and `Attack` (its `swordAttackJump`). To change a
  kit, edit the tool and run it again.
