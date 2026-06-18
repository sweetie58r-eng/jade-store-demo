# M1 Visual Acceptance Checklist

Use Cocos Creator 3.8.8 and the manual scene setup described in `README.md`.

## Checklist

- [ ] Irregular jade outline is visible.
- [ ] Color regions are visible.
- [ ] Color concentration changes are visible inside color regions.
- [ ] Shallow cracks are visible as thin, light jagged polylines.
- [ ] Deep cracks are visible as thicker, dark jagged polylines.
- [ ] Sample grid points are visible when `debugShowSamples` is `true`.
- [ ] Changing `seed` in `assets/resources/config/demo_level_config.json` generates a different jade.
- [ ] Keeping the same `seed` reproduces the same jade.
- [ ] Changing `sampleCellSize` changes sample point density.

## Expected M1 Image

The M1 scene should look like a flat 2D jade slab:

- muted jade base fill;
- dark outline stroke;
- translucent color blobs with stronger color near their centers;
- thin light shallow cracks;
- thick dark deep cracks;
- many faint sample points over the jade area.

M1 does not include draggable carving shapes, rotation, scaling, placement validation, price settlement, selling, gallery, ads, login, payment, leaderboards, or backend services.
