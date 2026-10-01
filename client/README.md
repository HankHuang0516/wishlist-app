# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Batch listing local drafts

`ListingComposerDrafts` saves unsent form text and common settings through the account/API scoped encrypted pending store. Mutable forms use serialized compare-and-swap; server operation journals remain immutable. Restore compares the stored backend baseline before permitting a new dispatch. Publication consent and item review reset on reopen; valid coordinates are normalized to the approximate grid before local persistence. A failed write retains the current page text for copying and blocks mutations. Confirmed server results remain confirmed if local rebasing or cleanup fails.

Coverage lives in `listingComposerDraft.test.ts`, `ListingBatchLocalDraft.test.tsx`, and `webPendingStore.test.ts`. These tests exercise reload, incomplete inputs, version comparison, concurrent pages, in-flight edits, storage faults, account isolation and erasure fences. Local storage is browser-specific and is not cross-device synchronization or protection against same-origin script compromise.

## Marketplace date fields

`DateField` keeps the native date input for manual entry and provides a named web calendar for batch expiry and owner extensions. Its month changes through navigation, independently of parent rerenders. Selecting or clearing invokes the original controlled-field handler; extension minimums and backend validation remain in force. Keyboard arrows move by day/week, Tab stays within the dialog, and Escape closes without applying a value. The component and page tests cover cross-year selection, leap days, minimums, focus, lock changes and publication confirmation resets.

## Page loading and recovery

All page imports in `App.tsx` use `createLazyPage`. Router, authentication, navigation and the shared layout stay outside the page boundary. The lazy identity stays stable during healthy rerenders and query changes; only a retry or navigation from a failed page creates a new promise. Import errors and render errors have distinct localized messages, and raw exception details never appear in the fallback. Focus moves to its heading. No automatic reload is attached to `vite:preloadError`.

Some browsers cache a failed module request even after the server recovers. A new React lazy promise cannot clear that browser cache; the explicit reload button obtains a fresh document/module graph. The page does not claim that a retry guarantees recovery. `LazyPage.test.tsx` covers loading, repeated failures, shell preservation, form state, navigation recovery, English and render failure containment; the App smoke test waits for real page content and login navigation. The reduced entry bundle does not reduce the complete PWA precache; offline upgrades and private cache cleanup still need separate validation.
