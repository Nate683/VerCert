"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CartItem } from "./types";

type CartContextValue = {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (slug: string, sizeLabel: string) => void;
  updateQuantity: (slug: string, sizeLabel: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "vericert-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage on mount
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find(
        (p) => p.slug === item.slug && p.sizeLabel === item.sizeLabel
      );
      if (existing) {
        return prev.map((p) =>
          p === existing ? { ...p, quantity: p.quantity + item.quantity } : p
        );
      }
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((slug: string, sizeLabel: string) => {
    setItems((prev) =>
      prev.filter((p) => !(p.slug === slug && p.sizeLabel === sizeLabel))
    );
  }, []);

  const updateQuantity = useCallback(
    (slug: string, sizeLabel: string, quantity: number) => {
      setItems((prev) =>
        prev.map((p) =>
          p.slug === slug && p.sizeLabel === sizeLabel
            ? { ...p, quantity: Math.max(1, quantity) }
            : p
        )
      );
    },
    []
  );

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.priceUsd * item.quantity, 0),
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const value = useMemo(
    () => ({ items, addItem, removeItem, updateQuantity, clearCart, subtotal, itemCount }),
    [items, addItem, removeItem, updateQuantity, clearCart, subtotal, itemCount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
