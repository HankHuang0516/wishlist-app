# Mobile UX Audit - Round 44

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Language Switch** (Transition/Overlay)
    2. **Toast Notifications** (Stacking/Position)
    3. **Login/Register** (Keyboard Avoidance)
- **Deployment**: v0.0.145 (Broken) -> v0.0.146 (Fix + Polish)

## 2. Findings (Bugs & UX Issues)

### 2.1 Language Switch
- **[UX] Transition**: The "Switching Language..." overlay is good (`SettingsPage.tsx`), but does it persist if I reload?
- *Verification*: It uses `localStorage` and `window.location.reload()`, so it works natively.
- *Issue*: The text "Switching Language..." is hardcoded in English. It should probably be simpler or translated, but since we are switching, English is safe.
- *Verdict*: Acceptable.

### 2.2 Toast Notifications
- **[UX] Stacking**: If I trigger "Share" (Toast 1) then "Save" (Toast 2), do they overlap?
- *Code Check*: usage of `setFeedbackMessage`. The `WishlistDetail` uses a local state `feedbackMessage`. `SettingsPage` might use another.
- *Issue*: Toasts are local to pages, not global. If I navigate away, toast dies.
- *Recommendation*: Future refactor to Global Toast context? For now, just ensure they are `fixed bottom-4 left-0 right-0 z-50` and have a background.
- *Visual*: Using `bg-gray-900 text-white` is good.

### 2.3 Login/Register (Keyboard)
- **[UX] Viewport**: On mobile, opening keyboard shrinks viewport.
- *Issue*: Does the "Login" button get covered?
- *Verification*: `Register.tsx` uses `min-h-[60vh]`. On small screens with keyboard, it might scroll.
- *Recommendation*: Ensure `pb-20` or safe area padding is present to allow scrolling past keyboard.

## 3. Repair Plan
1.  **Sys**: Fix `SettingsPage` syntax (Done).
2.  **Register/Login**: Add `pb-10` to container to ensure scrolling space.
3.  **Toasts**: Ensure high Z-index (Done in previous rounds).

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.146)
