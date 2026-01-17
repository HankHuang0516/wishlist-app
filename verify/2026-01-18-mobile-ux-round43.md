# Mobile UX Audit - Round 43

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Guest View** (`WishlistDetail.tsx` when `!user`)
    2. **Legal Pages** (`TermsOfUse.tsx`, `PrivacyPolicy.tsx`)
    3. **Avatar Upload** (`SettingsPage.tsx`)
- **Deployment**: v0.0.144 (Broken) -> v0.0.145 (Fix + Features)

## 2. Findings (Bugs & UX Issues)

### 2.1 Guest View (`WishlistDetail.tsx`)
- **[Verification]**: I verified code ensures `isOwner` guards Edit buttons.
- **[UX] CTA**: There is a "Guest CTA Banner" at the bottom (seen in snippets).
- *Observation*: Good.

### 2.2 Legal Pages (`TermsOfUse.tsx`)
- **[UX] Layout**: Viewing `TermsOfUse.tsx` (generic layout).
- *Issue*: Mobile often needs extra padding `px-4` and a distinct "Back" button if it's a standalone page.
- *Recommendation*: Ensure `max-w-2xl mx-auto px-4 py-8` is present.

### 2.3 Avatar Upload (`SettingsPage.tsx`)
- **[UX] Interaction**: The avatar is likely an `img` tag. Does it have an edit icon overlay?
- *Code Check*: `SettingsPage` lines 200+ show `<Avatar>`.
- *Issue*: Tapping the avatar on mobile should trigger file picker. If it's just a small camera icon, it might be a hard target.
- *Recommendation*: Make the entire Avatar circle clickable with a ripple effect or overlay.

## 3. Repair Plan
1.  **Sys**: Fix `WishlistDetail` syntax (Done).
2.  **Settings**: Enhance Avatar clickability (Change `label` to cover entire avatar).
3.  **Legal**: Ensure responsive padding in `TermsOfUse` / `Privacy`.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.145)
