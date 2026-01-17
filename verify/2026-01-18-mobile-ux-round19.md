# Mobile UX Audit - Round 19

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Settings (Delete Account)
    2. Notification Settings (Feedback)
    3. Dashboard (Create Flow)
- **Deployment**: v0.0.120 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Settings (Delete Account)
- **[Critical/Bug] Missing Feature**: As a detail-oriented user, I looked everywhere in Settings to delete my account (standard requirement), but the button **does not exist**. This is a major trust/privacy issue.

### 2.2 Notification Settings (Feedback)
- **[UX] Subtle Feedback**: Toggling proper marketing emails shows a small green "Saved" text in the header for 2 seconds. On mobile, my thumb might cover the header or I'm looking at the toggle. It feels like "did it work?".
- **[Suggestion]**: Use a standard Toast or keep the "Saved" state visible longer (or permanent "All changes saved" status).

### 2.3 Dashboard (Create Flow)
- **[Content] Outdated Example**: The placeholder for new Wishlist title is "Birthday 2024". It is now 2026 (per system time). This makes the app feel abandoned or unmaintained.

## 3. Repair Plan
1.  **Settings**: Add a "Delete Account" button section at the bottom of Settings. Wired to a `handleDeleteAccount` (requires API and confirmation).
    *   *Note*: Since this requires backend support, I will implement the *UI/Frontend* flow. If API endpoint `${API_URL}/users/me` DELETE exists (restful standard), I'll use it. If not, I'll mock it or use an existing one. I'll check `userController`.
2.  **Notification Settings**: Increase feedback duration to 3s and make the text slightly larger/bolder or add a check icon.
3.  **Dashboard**: Update placeholder to "Birthday 2026" or dynamic year.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.121)
