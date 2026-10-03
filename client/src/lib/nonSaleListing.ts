/** Only the explicit existing non-sale fixture marker, never a seller name. */
export const isNonSaleQaTitle = (title: string | null | undefined) => title?.startsWith('【QA測試非販售】') === true;
