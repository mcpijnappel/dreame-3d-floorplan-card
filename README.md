# Dreame 3D Floorplan Card

Interactive 3D WebGL floorplan card for Home Assistant powered by Three.js and a wall-occluded 2D lightmap canvas, with live Dreame vacuum and dock tracking.

## Features
- **Smooth Wall-Occluded 2D Lightmap:** Hardware-interpolated lightmap canvas that lets light spill naturally across open spaces and doorways while blocking 100% behind solid walls and partially filtering through open shelving (e.g. Kallax at 75% transmission).
- **Natural Kelvin Temperature Spectrum:** Maps `2200K - 6500K` smoothly from warm cream-amber to crisp daylight without blowing out the room core.
- **Detailed Multi-Part 3D Furniture Models:** Built-in procedural 3D models for an L-shaped Hoekbank, 4x3 open-cubby Kallax room divider, double bed, dining table with chairs, coffee table, TV stand, and a workbench setup featuring a server rack, Bambu Lab A1, and Snapmaker U1.
- **YAML Configurable & Auto-Discovery Ready:** Supports full YAML customization (`rooms`, `outer_walls`, `inner_walls`, `solid_walls`, `partial_walls`, `extra_floors`, `custom_models`, `furniture_overrides`) as well as `auto_discover: true` from a Dreame map camera entity.

## Installation (HACS / Marketplace)
1. Upload this repository to GitHub and add it as a Custom Repository (Category: `Lovelace` / `Plugin`).
2. Install **Dreame 3D Floorplan Card**.
3. Add `type: custom:dreame-3d-floorplan-card` to a Panel view in your dashboard.
