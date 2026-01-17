# Mobile UX Audit - Round 9

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. Feedback System
    2. Notifications Settings
    3. Purchase History
- **Deployment**: v0.0.110 (Verified Code)

## 2. Findings (Bugs & UX Issues)

### 2.1 Feedback Modal (Major)
- **[UX] Localization**: The API call hardcodes `language: navigator.language || 'zh-TW'`. It ignores the user's manual language preference stored in `localStorage` (implemented in Round 7).
- **[I18N] Untranslated UI**: The success message "感謝您的回饋！" and "Wishlist.ai 客服回覆:" are hardcoded in Traditional Chinese within the code, meaning English users will see Chinese.

### 2.2 Notifications Settings (Minor)
- **[UX] Disabled Toggle**: The "Security Alerts" toggle is disabled without explanation. Users might think it's broken.
- **[Visual] Alignment**: On mobile, the toggle switch might be too close to the edge.

### 2.3 Purchase History (Layout)
- **[Mobile] Table Layout**: The "Account Purchases" section uses a `<table>` standard element. On mobile (375px width), this will likely overflow horizontally or squish content illegibly.
- **[Suggestion]**: Use a "Card" layout for transactions on mobile, similar to how Gift Purchases are displayed.

## 3. Repair Plan
1.  **Feedback**: Update `FeedbackModal` to use `getUserLocale()` and fully localize all generic text keys.
2.  **Purchase History**: Add a `md:hidden` block to render transactions as a vertical list/cards on mobile, hiding the table.
3.  **Notifications**: Add a tooltip or small text explaining why Security Alerts are enforced (e.g., "(Required)").

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.111)
