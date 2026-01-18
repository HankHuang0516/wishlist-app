# Mobile UX Audit - Round 49

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1.  **Logout** (Mobile Access)
    2.  **Create Wishlist** (Mobile Trigger)
    3.  **Search** (Mobile Input)
- **Deployment**: v0.0.150 -> v0.0.151

## 2. Findings (Bugs & UX Issues)

### 2.1 Logout (Critical Bug)
- **Issue**: The `Logout` button is located in the Header, which is hidden on mobile (`hidden sm:flex`).
- **Impact**: Mobile users are trapped in the app unless they clear browser data.
- **Fix**: Add a dedicated **Logout** button in `SettingsPage.tsx` (at the bottom).

### 2.2 Create Wishlist (UX)
- **Issue**: The "Create New" button is at the top of the list. If a user scrolls down 100 items, they have to scroll all the way back up to create a new one.
- **Recommendation**: Implement a **Floating Action Button (FAB)** for mobile view (`fixed bottom-20 right-4`).

### 2.3 Search (UX)
- **Issue**: Input font size might be small, causing auto-zoom on iOS.
- **Fix**: Ensure `text-base` class is applied to the Search Input.

## 3. Repair Plan
1.  **Sys**: Fix Logout availability.
2.  **UX**: Add FAB for creation.
3.  **UX**: Optimize Search input.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.151)
