# Mobile UX Audit - Round 10

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. Friend Profile (UX/Visuals)
    2. Terms of Use (Content/Layout)
    3. Settings - Avatar/Install (Functionality)
- **Deployment**: v0.0.111 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Friend Profile (UX)
- **[UX] Confusing CTA**: The primary button is "View Wishlists" (`bg-muji-primary`), but the social action "Follow" (`bg-pink-500` or gray) competes for attention. The visual hierarchy is cluttered.
- **[Visual] Hidden Avatar**: When an avatar is hidden, the overlay "Hidden" text is small and the gray placeholder is unappealing.

### 2.2 Terms of Use (Visuals)
- **[Layout] Plain Text**: The page is a wall of text (`prose`). On mobile, this is hard to scan.
- **[Navigation]**: No sticky "Back" button. User has to scroll to top or use browser back.

### 2.3 Settings - Untranslated Content (Bug)
- **[I18N] Install Instructions**: The PWA install instructions ("Don't see the button?", "Manually install:") are hardcoded in English, even in Chinese mode.
- **[UX] Avatar**: No clear "Tap to Change" indicator on the avatar image itself in Settings.

## 3. Repair Plan
1.  **Friend Profile**: Refactor actions into a sticky bottom bar or cleaner button row. Improve "Hidden" avatar styling.
2.  **Terms**: Add a sticky Header with a Back button. Add basic collapsible sections (Accordion) for better mobile readability? (Or just better spacing).
3.  **Settings**: Localize PWA instructions. Add a camera icon overlay to the editable avatar.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.112)
