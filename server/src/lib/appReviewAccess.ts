// Review uses the same free feature paths and limits as the existing pilot.
// This identity must never be used to grant a purchase or paid entitlement.
export function appReviewDemoUserId(): number | null {
    const raw = process.env.APP_REVIEW_DEMO_USER_ID;
    if (!raw || !/^[1-9]\d{0,9}$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}
