# Mobile UX Audit - Round 20

## 1. Audit Scope
- **Device**: Mobile (Simulated 375x812, iPhone 13 Mini)
- **Features Tested**:
    1. Registration (Password Hints)
    2. Wishlist Detail (Share Button)
    3. Item Detail (Clone to Wishlist)
- **Deployment**: v0.0.121 (Verified)

## 2. Findings (Bugs & UX Issues)

### 2.1 Registration (Password Hints)
- **[UX] Guesswork**: The password field has no helper text telling me the requirements (e.g., "Min 6 chars"). I have to guess or wait for an error.
- **[Suggestion]**: Add subtle helper text below the input.

### 2.2 Wishlist Detail (Share Button)
- **[UX] Small Tap Target**: The "Share" button is just a bordered text span. It's hard to tap quickly on mobile and doesn't look like a primary action, even though sharing matches the app's core value.
- **[Visual]**: Needs to be a proper `Button` component, perhaps with a distinct color or icon emphasis.

### 2.3 Item Detail (Clone Flow)
- **[UX] Dead End**: When I find an item I like and click "Add to my list", I see a list of my wishlists. If I haven't created one for this specific category (e.g., "Camping"), I have to cancel, go to Dashboard, create list, come back, find item.
- **[Suggestion]**: Add a "+ Create New Wishlist" button inside the selection modal.

## 3. Repair Plan
1.  **Register**: Add helper text "Minimum 6 characters" under password input.
2.  **Wishlist Detail**: Replace the `span` share button with a `<Button variant="outline" size="sm">`.
3.  **Item Detail**: In `isCloning` view, add a "Create New" button that redirects to Dashboard (or ideally handles it inline, but redirect is safer for now).

## 4. Deployment Status
- [ ] Fixes Applied
- [ ] Tests Passed
- [ ] Deployed to Production (v0.0.122)
