import { createContext, useContext, useState, type ReactNode } from 'react';

// This acknowledgement belongs to the current App root, never browser storage.
const ProductNoticeVisitContext = createContext<{
  body: string | null;
  acknowledge: (body: string) => void;
} | null>(null);

export function ProductNoticeVisitProvider({ children }: { children: ReactNode }) {
  const [body, acknowledge] = useState<string | null>(null);
  return <ProductNoticeVisitContext.Provider value={{ body, acknowledge }}>{children}</ProductNoticeVisitContext.Provider>;
}

export function useProductNoticeVisit() {
  return useContext(ProductNoticeVisitContext);
}
