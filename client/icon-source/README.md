# Web icon release inspection

`original-no-H.png` is the unchanged 1024px gift artwork; `general-H.png` is the selected fixed metallic H layer. `recipe.json` records their provenance, exact placement and all four generated asset hashes. Composition uses the original canvas unchanged, one 175×183px LANCZOS H layer at 180,75, and no H color or opacity adjustment. Smaller Web assets are derivatives of the complete composition.

Run `python3 client/scripts/generate-web-icons.py` from the repository root with Pillow available to reproduce all four assets. It refuses changed inputs and unexpected output bytes; it does not acknowledge a visual review.

Every release requires a new `reviews/<client-version>.json` after inspecting the actual `dist` files at 32/48/64px and installed asset sizes, including applicable masks. Keep visual evidence in the external Wishlist QA area. Record incomplete native OS installation checks separately; Web artifact checks do not prove a native APP release. The postbuild gate binds the version, fixed inputs and actual published bytes to the review. Hash equality does not replace visual inspection.
