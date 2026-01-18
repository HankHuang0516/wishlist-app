# Mobile UX Audit - Round 50

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1.  **Item Edit Modal** (`ItemDetailModal`)
    2.  **Toast Notifications** (Global)
    3.  **Footer** (Layout)
- **Deployment**: v0.0.151 (Broken) -> v0.0.152

## 2. Findings (Bugs & UX Issues)

### 2.1 Item Edit Modal
- **Check**: Does the modal overflow on small screens?
- *File*: `ItemDetailModal.tsx`.
- *Issue*: On smaller phones (SE/Mini), if the keyboard is up, the "Save" button might be covered.
- *Fix*: Ensure `max-h-[90vh]` and `overflow-y-auto` are used.

### 2.2 Toast Notifications
- **Check**: Do they stack nicely?
- *Issue*: `sonner` or `react-hot-toast` usually handles this, but if we are using a custom implementation or standard `ui/toast`, we need to ensure mobile position is `top-center` or `bottom-center` (avoiding BottomNav).
- *Current Config*: Need to check `Toaster` in `App.tsx` or `Layout.tsx`.
- *Adjustment*: If bottom, ensure `bottom-[80px]` to clear BottomNav.

### 2.3 Footer / Copyright
- **Check**: `Layout.tsx`.
- *Issue*: `BottomNav` fixes to `bottom-0`. The `footer` is at the bottom of the page flow.
- *Conflict*: On mobile, the `BottomNav` might overlap the `footer` content if there není sufficient padding-bottom on the main container.
- *Fix*: Add `pb-24` to `Layout.tsx` main content on mobile.

## 3. Repair Plan
1.  **Sys**: Fix `WishlistDashboard` syntax (Done).
2.  **Layout**: Add mobile padding to avoid Footer overlap.
3.  **Toaster**: Verify position.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.152)
