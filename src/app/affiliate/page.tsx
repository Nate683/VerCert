import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The affiliate portal moved to /partner (public application flow +
// dedicated login) — keep this path working for old bookmarks/links.
export default function AffiliatePage() {
  redirect("/partner");
}

