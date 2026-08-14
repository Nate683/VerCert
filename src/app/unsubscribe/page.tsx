import { getUserByEmail, updateUser } from "@/lib/users/store";
import { verifyUnsubscribeToken } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe | VeriCert", robots: { index: false, follow: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email, token } = await searchParams;
  let message = "This unsubscribe link is invalid.";

  if (email && token && (await verifyUnsubscribeToken(email, token))) {
    const user = await getUserByEmail(email);
    if (user) {
      await updateUser(user.id, { marketingOptIn: false });
      message = `${email} has been unsubscribed from marketing emails.`;
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-20 text-center lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Email Preferences</p>
      <h1 className="mt-3 font-serif text-3xl text-white">Unsubscribed</h1>
      <p className="mt-4 text-sm leading-relaxed text-white/50">{message}</p>
    </div>
  );
}
