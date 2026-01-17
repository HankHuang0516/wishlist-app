# Mobile UX Audit - Round 14

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Forgot / Change Password Flow
    2. Social Page (Find Friends)
    3. Purchase History
- **Deployment**: v0.0.115 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Password Flows (Major UX)
- **[UX] Intrusive Alerts**: Both `ForgotPasswordPage` and `ChangePasswordPage` use `alert()` for success messages ("OTP Sent", "Password Reset", "Password Updated").
    - **Impact**: Interrupts flow, looks like a debug message, requires extra tap to dismiss.

### 2.2 Social Page (Interaction)
- **[UX] Keyboard Interaction**: In the "Find Friends" tab, typing a name and pressing "Enter" on the virtual keyboard does nothing. Users are forced to tap the small "Search" icon/button.
- **[Visual] Loading State**: When searching, global loading might block the UI or be too subtle.

### 2.3 Purchase History (Visual)
- **[Visual] Empty State**: The "No purchase history" state is a grey box with a dashed border. It feels like a placeholder or developer UI, not a consumer-facing app state.

## 3. Repair Plan
1.  **Auth Feedback**: Replace `alert()` with the same **Inline Feedback / Fade-in Message** pattern used in Settings/Cloning (Round 12).
2.  **Social Search**: Wrap the search input in a `<form>` or add `onKeyDown` to handle the 'Enter' key.
3.  **Purchase History**: Improve the empty state with an icon (e.g., `ShoppingBag` in a circle) and a "Go Shopping" (or similar) call-to-action button if appropriate, or just softer typography.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.116)
