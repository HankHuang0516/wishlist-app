# Mobile UX Audit - Round 30

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812)
- **Features Tested**:
    1. **Guest Wishlist View** (`WishlistDetail.tsx` as non-user)
    2. **Purchase History** (`PurchaseHistoryPage.tsx`)
    3. **Terms of Use** (`TermsOfUse.tsx`)
- **Deployment**: v0.0.131 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Guest Wishlist (`WishlistDetail.tsx`)
- **[UX] Dead End Clone**: If a guest clicks the (+) "Clone" button on an item, it tries to fetch 'my wishlists'. Since they are not logged in, this fails (likely empty or error), leading to a confusing empty modal or broken state.
- **[UX] No CTA**: Guests allow viewing, but there is no prompt to convert them into users ("Create your own list").

### 2.2 Purchase History (`PurchaseHistoryPage.tsx`)
- **[Visual] Mobile Cards**: The transaction history cards are good.
- **[Visual] Gift Items**: (Verified in code view) The gift items section also has a responsive table/card split? Wait, looking at code line 160+, it seems to replicate the pattern.
- **[Visual] Empty State**: The empty state uses a generic bag icon.

### 2.3 Terms of Use (`TermsOfUse.tsx`)
- **[Visual] Plain**: It's a standard text page.
- **[UX] Back Button**: Uses `navigate(-1)`.
- **Finding**: It's acceptable. No major changes needed.

## 3. Repair Plan
1.  **Guest Wishlist**:
    -   **Intercept Clone**: If `!token`, verify `handleCloneClick` directs to `/login` (with return url?) or shows a "Login Required" alert/modal.
    -   **Floating CTA**: Add a sticky bottom banner "Join Wishlist.ai to create your own lists!" with a "Sign Up" button for guests.
2.  **Purchase History**:
    -   Ensure the "Gift Purchases" section matches the "Account" section's mobile card style (it likely does, but I'll double check consistency).
    -   Actually, I'll add a small "Total Spent" summary at the top if easy, otherwise leave as is.

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.132)
