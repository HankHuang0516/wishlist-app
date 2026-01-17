# Mobile UX Audit - Round 39

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Guest View Actions** (`WishlistDetail.tsx`)
    2. **Nicknames Input** (`SettingsPage.tsx`)
    3. **Notifications Toggle** (`NotificationsSettingsPage.tsx`)
- **Deployment**: v0.0.140 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Guest View Actions (`WishlistDetail.tsx`)
- **[UX] Guest Interaction**: Guests see a "Plus" (Clone) button.
- *Issue*: If a guest clicks this, they are likely prompted to login (good), but the icon itself might imply "Add to *this* wishlist" which is confusing. It means "Add to *my* (guest's) wishlist" (which doesn't exist).
- *Observation*: `handleCloneClick` likely does a check.
- *Recommendation*: For guests (`!token`), maybe hide the Clone button entirely or change it to a "Join" CTA? Actually, keeping it and showing "Login to save this item" is a good conversion driver.
- *Bug*: The "Info" button for guests (line 492) has `stroke-[3px]` and `font-bold`? It looks heavier than other icons.

### 2.2 Nicknames Input (`SettingsPage.tsx`)
- **[UX] Tag Entry**: Users often expect to press "Enter" to add a tag/nickname.
- *Code Check*: `onChange` updates state. `onBlur` saves.
- *Issue*: If I type "Mom", then press "Enter", it might submit the form or do nothing.
- *Recommendation*: Add `onKeyDown` to handle "Enter" -> `blur()` to trigger save (or handle save explicitly), preventing form submission.

### 2.3 Notifications Toggle (`NotificationsSettingsPage.tsx`)
- **[UX] Save Feedback**: Toggling a switch updates state immediately.
- *Issue*: There is zero visual confirmation that the preference was saved to the server.
- *Recommendation*: Add a small "Saved" indicator or toast on toggle.

## 3. Repair Plan
1.  **Guest View**: Unify icon styles (remove extra stroke/bold from Info).
2.  **Nicknames**: Add `onKeyDown` handler for "Enter" key to trigger blur/save.
3.  **Notifications**: Add a `feedback` state and show a toast when settings change.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.141)
