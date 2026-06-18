# Scene Setup

`DemoLayout.scene` should be created inside Cocos Creator 3.8.8.

This repository does not include a hand-written `.scene` file because Cocos Creator scenes depend on editor-generated serialization and `.meta` UUIDs. Create the scene manually:

1. Create a new scene in this folder.
2. Save it as `DemoLayout.scene`.
3. Add a node named `JadeDemoRoot`.
4. Add the `Graphics` component to `JadeDemoRoot`.
5. Add the `JadeDemoBootstrap` script component to `JadeDemoRoot`.
6. Preview the scene.

The scene should show the generated M1 jade layout.
