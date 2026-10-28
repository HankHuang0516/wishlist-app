# Native icon: Web Gift

Hank selected the plain gift used by the Web header on 2026-10-28. `web-gift.svg` uses the exact Lucide Gift v0.562.0 paths and default stroke from `client/src/layouts/Layout.tsx`, on the Web paper color `#FFFFFF` with primary `#2D2D2D`. Lucide/Feather attribution is in `LUCIDE-LICENSE.txt`.

`original-no-H.png` is the rendered original composition. The selected `general-H.png` is copied unchanged from the established Web source. `recipe.json` records its original hash, placement, and output identity. Only the H layer is composited: no change to its colors/opacity, original gift, canvas or layout. The output is an opaque 1024×1024 `mobile/assets/app-icon.png`, already referenced by Expo for iOS and Android.

From the repository root with server dependencies installed:

```
node server/scripts/generate-native-web-gift-icon.cjs
node server/scripts/generate-native-web-gift-icon.cjs --verify
```

Changing the source asset does not update an installed App. Each distributed native package and its store/installed icons require the actual output and mask inspection specified by Hank; source and prebuild-resource verification do not claim a store or installed-binary check.
