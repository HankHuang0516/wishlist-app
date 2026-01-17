# Mobile UX Audit - Round 21

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Friend Profile (Navigation)
    2. Forgot Password (Feedback)
    3. Settings (Avatar Visibility)
- **Deployment**: v0.0.122 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Friend Profile (Navigation)
- **[UX] rigid Back Button**: The back button on `FriendProfilePage` is hardcoded to `/social`.
- **Issue**: If I share a profile link `.../users/123/profile` and a friend opens it, clicking "Back" sends them to the Social Search page, which might be empty or confusing if they haven't searched yet. It should probably go back in history or to Home if no history.
- **[Suggestion]**: Use `navigate(-1)` with a fallback.

### 2.2 Forgot Password (Feedback)
- **[UX] No Loading Feedback**: When I click "Send Verification Code", there's no spinner or disabled state on the button immediately. If the network is slow, I might click it twice.
- **[Suggestion]**: Add `disabled={loading}` and spinner to the button.

### 2.3 Settings (Avatar Visibility)
- **[UX] Icon Ambiguity**: The Eye/EyeOff icon toggle for Avatar visibility is right next to the title. It's not immediately clear *what* state it is currently. "Is the Eye meaning it IS visible, or click to MAKE it visible?"
- **[Suggestion]**: Add a clear text badge or switch (toggle) which is the standard mobile UI for "On/Off" states.

## 3. Repair Plan
1.  **Friend Profile**: Change Back button to use `navigate(-1)` if history exists, else `/home`.
2.  **Forgot Password**: Ensure `isLoading` prop is passed to Button (it seems `loading` state exists, checking usage).
3.  **Settings**: Replace the Eye icon button with a standard `<Switch>` or Checkbox for "Public" status to match other settings.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.123)
