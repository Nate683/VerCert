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
      className="border border-hairline px-4 py-2 text-xs uppercase tracking-[0.15em] text-muted transition-colors hover:border-gold hover:text-gold-ink"
    >
      Sign Out
    </button>
  );
}
