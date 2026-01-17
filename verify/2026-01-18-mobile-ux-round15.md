# Mobile UX Audit - Round 15

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Register Page (Sign Up)
    2. Friend Profile (Public View)
    3. Privacy Policy (Content Page)
- **Deployment**: v0.0.116 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Register Page (Input Friction)
- **[UX] Birthday Selection**: Currently uses **three separate dropdowns** (Year, Month, Day). On mobile, this requires 3 separate taps + scrolling wheel interactions. It feels outdated and clunky.
- **[UX] Phone Keyboard**: The phone input triggers the standard text keyboard, not the numeric keypad.

### 2.2 Friend Profile (Navigation)
- **[Nav] Missing Back Button**: There is no way to go back to the Social list/Search page without using the browser/system back gesture. In a web app (PWA context), an explicit internal back button is standard.

### 2.3 Privacy Policy (Layout)
- **[Visual] Margin Issue**: The text container lacks horizontal padding (`px-4`), causing text to touch the very edges of the screen on mobile devices.
- **[Content] misleading Date**: "Last updated" shows the *current date* (`new Date()`) every time the page loads. This is legally misleading; it should be a static revision date.

## 3. Repair Plan
1.  **Register**:
    -   Replace 3-select system with a single Native Date Picker (`<input type="date">`) for a smoother mobile experience.
    -   Force `type="tel"` or `inputMode="numeric"` on Phone field.
2.  **Friend Profile**:
    -   Add a standard "Back" button (ChevronLeft) at the top left.
3.  **Privacy Policy**:
    -   Add `px-4` to the container.
    -   Hardcode the Last Updated date to a static string (e.g., "2026-01-18").

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.117)
