# Mobile UX Audit - Round 31

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Forgot Password** (`ForgotPasswordPage.tsx`)
    2. **Register Flow** (`Register.tsx`)
    3. **Home / Landing** (`Home.tsx`)
- **Deployment**: v0.0.132 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Register (`Register.tsx`)
- **[UX] Birthday Input**: Uses three separate `<select>` dropdowns (Year, Month, Day) for date of birth. On mobile, this requires interacting with three separate picker interfaces, which is tedious and outdated.
- **[Visual] Spacing**: The form feels a bit loose.

### 2.2 Home / Landing (`Home.tsx`)
- **[Visual] Feature Cards**: Each feature card has a fixed image height of `h-48` (192px). Stacked vertically on mobile, the 4 features take up over 1000px of vertical space, forcing excessive scrolling.
- **[UX] Navigation**: The "Get Started" buttons are good.

### 2.3 Forgot Password (`ForgotPasswordPage.tsx`)
- **[Visual]**: Functional but visually plain. The transition to "Reset Password" just changes fields without a distinct visual cue that you are in the final step (e.g., a header icon change).

## 3. Repair Plan
1.  **Register**:
    -   Replace the 3 `<select>` elements with a single native `<input type="date" />`. This is standard, localized, and efficient on modern mobile OS.
    -   Ensure it defaults to a reasonable placeholder or style.
2.  **Home**:
    -   Reduce feature image height on mobile to `h-32` (128px) using `h-32 md:h-48` classes.
    -   This saves ~250px of vertical space.
3.  **Forgot Password**:
    -   Add icons to the step headers (e.g., `Smartphone` for step 1, `LockKeyhole` for step 2) for better status recognition.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.133)
