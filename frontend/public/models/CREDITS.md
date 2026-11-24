# 3D asset credits

Every model in this folder is public domain (CC0 1.0). No attribution is required, but we credit the authors anyway.

| Asset | Files | Author | Source | License |
|---|---|---|---|---|
| KayKit City Builder Bits 1.0 (apartment buildings A, C, D, E, F; bench; bush; fire hydrant; taxi, sedan, station wagon and hatchback cars; texture atlas) | `kaykit/*.gltf`, `kaykit/*.bin`, `kaykit/citybits_texture.png` | Kay Lousberg (kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | CC0 1.0, see `kaykit/LICENSE.txt` |
| RobotExpressive (animated character: Idle, Walking, Running, Wave, ThumbsUp, Yes, No, Dance and more) | `characters/RobotExpressive.glb` | Tomás Laulhé (Quaternius), glTF conversion by Don McCurdy | https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive (originally https://quaternius.com) | CC0 1.0 |

Everything else in the 3D town (island, roads, glass towers, warehouse, clock tower, houses, food trucks, track, fountain, stage, bridge, sailboat, trees, lamps) is built from code in `src/town3d/`.

Emoji bubbles use Microsoft Fluent Emoji 3D (MIT), loaded from jsDelivr by `src/components/Emoji.tsx`.

## Libraries

- three.js (MIT), @react-three/fiber (MIT), @react-three/drei (MIT): rendering, camera controls (camera-controls, MIT), HTML overlays, glTF loading.
- @react-three/postprocessing and postprocessing (MIT), including N8AO ambient occlusion (CC0): ambient occlusion, bloom at dusk, SMAA.
