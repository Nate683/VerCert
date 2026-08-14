"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function AccountLogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  async function handleClick() {
    await logout();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold"
    >
      Sign Out
    </button>
  );
}
