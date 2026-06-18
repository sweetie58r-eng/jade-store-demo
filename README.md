# Jade Layout Demo

Local jade layout prototype built with Cocos Creator and TypeScript.

## Recommended Editor

- Use Cocos Creator 3.8.8.
- The current project code targets Cocos Creator 3.8.8 TypeScript APIs such as `Component`, `Graphics`, `Label`, `resources`, and `JsonAsset`.
- Do not use Cocos Creator 2.x for this project.

## M1 Scope

- Cocos Creator + TypeScript project skeleton.
- Config loading from `assets/resources/config`.
- Seeded irregular jade generation.
- Color region and concentration rendering.
- Shallow and deep crack rendering.
- Configurable sample grid resolution.
- Deterministic seed reproduction.

Internal identifiers, file paths, resource ids, enum values, and config keys use English ASCII only. Player-facing Chinese text must be placed in `displayName`, `description`, or dedicated text config files.

## Scene Status

`assets/scenes/DemoLayout.scene` is not committed in M1.1.

Reason: Cocos Creator scene assets are editor-serialized files that depend on the Creator version, component serialization, generated `.meta` UUIDs, and scene asset metadata. This environment does not have a verified Cocos Creator editor/runtime available to create, open, and validate a `.scene` file. A hand-written `.scene` would be unreliable and could fail to load after Creator generates real metadata.

Use the manual steps below to create the scene once in Cocos Creator 3.8.8. After that, Creator will generate a reliable `DemoLayout.scene` and related `.meta` files.

## Run M1 In Cocos Creator

1. Open Cocos Creator 3.8.8.
2. Choose `Open Project`.
3. Select this project folder: `E:/Esalary_YSstore`.
4. Wait for Cocos Creator to import scripts and generate `.meta` files.
5. Create a new scene under `assets/scenes`.
6. Save it as `DemoLayout.scene`.
7. In the scene hierarchy, create one node named `JadeDemoRoot`.
8. Select `JadeDemoRoot`.
9. Add a `Graphics` component.
10. Add the custom script component `JadeDemoBootstrap`.
11. Leave `renderRoot` empty unless you want to draw on another node.
12. Optional: create a child node named `SeedLabel`, add a `Label` component, and assign that label to `JadeDemoBootstrap.seedLabel`.
13. Click Preview or Run.

For the scene hierarchy you already created, this layout is supported:

```text
Canvas
  JadeDemoRoot
    RenderRoot
```

In M2.7, `JadeDemoBootstrap` should still be on `JadeDemoRoot`. At runtime it creates formal layers directly under `Canvas`: `JadeRenderLayer`, `CarvingLayer`, and `DebugInfoLayer`. Old bootstrap test nodes are disabled or removed by default.

Expected result:

- A 2D irregular jade outline appears in the scene.
- Several translucent color regions appear inside or across the jade.
- Color regions show layered concentration changes.
- Thin light cracks represent shallow cracks.
- Thicker dark cracks represent deep cracks.
- Small sample grid points are visible when `debugShowSamples` is `true`.
- The same `seed` in `assets/resources/config/demo_level_config.json` reproduces the same jade.
- The top-left debug line shows seed, outline point count, color region count, crack count, carving shape count, placed carving count, and sample count.

## M2 Controls

After M2, the scene also creates a runtime carving layer and a carving palette.

- Click a carving name in the palette to create another carving shape.
- Click a carving shape to select it.
- Drag the selected shape body to move it freely.
- Drag the round handle above the selected shape to rotate it continuously.
- Drag the square handle at the lower-right of the selected shape to scale it continuously.
- Use the mouse wheel to scale the selected shape continuously.
- Press `Q` / `E` to fine tune rotation.
- Press `Delete` or `Backspace` to delete the selected shape.
- Press `R` or click the clear button to clear all placed shapes.
- Green outline means valid, yellow means warning, red means invalid.

## M3.4 Portrait Preview

M3 targets a mobile portrait layout for WeChat Mini Game style play.

Use these Cocos Creator 3.8.8 settings before Preview:

1. Open `Project` -> `Project Settings`.
2. Open `General`.
3. Set `Design Resolution` to:
   - `Width`: `720`
   - `Height`: `1280`
4. Save the project settings.
5. Open `assets/scenes/DemoLayout.scene`.
6. Confirm the `Canvas` node `UITransform` size is `720 x 1280`.
7. Click `Preview`.
8. If the Preview toolbar still shows a landscape device, choose a portrait phone preset from the `Design Resolution` dropdown, or click `Rotate` until the preview frame is portrait.
9. Refresh the browser preview after changing the Preview device.

The runtime also forces `view.setDesignResolutionSize(720, 1280, SHOW_ALL)` as a fallback. In the browser Console, expected M3.4 logs include:

```text
[JadeDemoBootstrap] design resolution: 720x1280
[JadeDemoBootstrap] canvas size: 720x1280
[JadeDemoBootstrap] visible size: ...
[JadeDemoBootstrap] topInfoArea: ...
[JadeDemoBootstrap] jadeWorkArea: ...
[JadeDemoBootstrap] shapePaletteArea: ...
[JadeDemoBootstrap] actionButtonArea: ...
```

Expected portrait layout:

- Top: estimate summary with jade cost, total estimate, profit, and valid product count.
- Middle: full jade work area.
- Bottom: large horizontal carving style buttons.
- Lower-right: large delete and clear buttons.

If the browser window is very wide, the Cocos Preview page may still have desktop chrome around the game frame. The game content itself should appear as a portrait stage centered inside that page.

## M4 Reveal Flow

M4 starts in the stone-skin reveal mode before carving layout.

- The jade initially appears as gray outer stone skin.
- Drag on the stone to grind the surface and reveal internal color regions and cracks.
- Use the bottom brush-size slider to continuously adjust the tool radius.
- The default brush is the thinnest setting.
- The formal reveal screen does not show a progress panel; players judge progress from the exposed stone surface.
- During dragging, the skin is only removed along the player's brush stroke.
- Internal color and cracks are both clipped by the reveal mask; unrevealed stone skin does not leak hidden crack information.
- During reveal, the top estimate panel shows jade cost, current quote, and current profit based on exposed color and cracks.
- The reveal quote is recalculated from the whole current reveal mask each time; it is not accumulated from newly exposed points.
- Exposed high-value color can raise the quote, exposed ordinary gray/white material remains low value, and exposed cracks subtract value.
- M4.7 weights quote changes toward color premium: ordinary base material is cheap, unknown areas are conservative, and high-value colors create the main upside.
- Reveal dragging uses local mask lookup, capped brush stamps per move, throttled quote refresh, and separated static/dynamic drawing layers.
- On touch end, the demo checks fixed remaining skin limits in `demo_level_config.json`: `remainingSkinAreaThresholdPx2` and `largestRemainingPatchThresholdPx2`.
- If only small residue remains, remaining skin is cleared, the full jade is shown, and the demo enters carving layout after `completeTransitionDelay`.
- Carving layout controls are the same as M3 after reveal completes.

## M5 MVP Loop

M5 starts from a simplified local business loop instead of opening one stone directly.

- The first screen shows the current day, player coins, and the raw-stone market.
- Click a market stone's buy button to spend coins and enter the M4 reveal flow.
- Finish reveal to enter the M3 carving layout.
- Add at least one valid carving, then click the `sendProcessingButton` UI text (`送去加工`).
- The stone enters a local processing queue and finishes on the next day.
- Click the next-day button to advance one day, complete processing jobs, generate finished products, run one simple stall-sale pass, and show the stall sales result screen.
- Click the continue-purchase button on the sales result screen to return to the refreshed raw-stone market.
- Sold products add coins, so the player can buy another stone and repeat the loop.
- M5 includes placeholder entries for future rewarded ads and IAP in config only. These buttons show placeholder text and do not call any real ad, payment, login, leaderboard, or backend service.

## Preview Logs

When previewing in Cocos Creator 3.8.8:

1. Click Preview.
2. In the browser preview window, press `F12`.
3. Open the `Console` tab.
4. Filter for `JadeDemoBootstrap` if the log is noisy.

Expected logs include:

```text
[JadeDemoBootstrap] onLoad called
[JadeDemoBootstrap] start called
[JadeDemoBootstrap] config loaded
[JadeDemoBootstrap] mvp controller initialized
[JadeDemoBootstrap] draw completed
```

During reveal and carving, additional `JadeRevealController`, `JadeDemoRenderer`, and `CarvingLayoutController` logs appear as those stages are entered from the market flow.

M2.7 defaults to the playable carving layout view. `BootstrapDebugLayer` is disabled by default, so the red border/cross/circle/rectangle probe should no longer cover the scene.

If there is no lifecycle log:

1. In Cocos Creator 3.8.8, select `JadeDemoRoot`.
2. Confirm the script component is not shown as `Missing Script`.
3. If in doubt, remove the current script component from `JadeDemoRoot`.
4. Add the custom script component `JadeDemoBootstrap` again.
5. Save `DemoLayout.scene`.
6. Make sure `DemoLayout.scene` is the open scene when you click Preview.
7. Preview again and check the browser Console.

## Config Files

- `assets/resources/config/demo_level_config.json`: seed, canvas size, and sample grid settings.
- `assets/resources/config/jade_config.json`: jade size grades and outline generation settings.
- `assets/resources/config/color_config.json`: color tiers, probabilities, visual colors, value multipliers, and concentration ranges.
- `assets/resources/config/crack_config.json`: shallow/deep crack probabilities and visual settings.
- `assets/resources/config/carving_config.json`: M2 carving style configuration, already normalized to English ASCII ids and `displayName` text.
- `assets/resources/config/text_config.json`: player-facing UI text.

## Local Checks

Run these from the project root:

```powershell
npm.cmd run check:json
npm.cmd run check:config-naming
```

These checks validate JSON parsing and the internal naming rule.
