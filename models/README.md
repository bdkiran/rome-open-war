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
- **Walking.** If the army model has an animation clip whose name contains
  `walk`, it plays while the army is moving from tile to tile.
- **Facing.** The army model should face +Z (towards the camera when
  standing); it's turned to face the way it walks.

Good free sources of low-poly, public-domain (CC0) models include Quaternius
and Kenney.
