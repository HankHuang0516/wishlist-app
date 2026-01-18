# Mobile UX Audit - Round 51

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1.  **Add Item Flow** (Mobile)
    2.  **Sort Wishlists** (Mobile)
    3.  **Guest View** (Mobile)
- **Deployment**: v0.0.152 (Broken) -> v0.0.153

## 2. Findings (Bugs & UX Issues)

### 2.1 Add Item Flow
- **UX**: The "Add Item" modal (`AddItemModal.tsx`) needs to be fully responsive.
- *Check*: Input fields (Name, Price, Link) should have proper `inputmode` (decimal, url).
- *Issue*: Price input usually defaults to text.
- *Fix*: Add `type="number" inputMode="decimal" step="0.01"`. Link input: `type="url" inputMode="url"`.

### 2.2 Sort Wishlists
- **UX**: Sorting dropdown in Dashboard.
- *Check*: Is it easy to tap?
- *Observation*: Standard HTML `<select>` is usually fine on mobile (uses native picker), but if it's a custom shadcn `Select`, we need to ensure the popover doesn't overflow or be too small.
- *Fix*: Ensure the sort trigger has `h-10` or higher for touch target.

### 2.3 Guest View
- **Privacy Check**: When a guest views a public list.
- *Issue*: Can they see "Edit" buttons?
- *Verify*: `WishlistDetail.tsx`. Ensure `isOwner` checks are robust.
- *Improvement*: Public view should look "cleaner" - maybe hide the "Add Item" placeholder if empty?

## 3. Repair Plan
1.  **Sys**: Fix `WishlistDashboard` syntax (Done).
2.  **Add Item**: Enhance input types.
3.  **Sort**: Verify touch target.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.153)
