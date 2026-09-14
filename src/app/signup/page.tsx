import { redirect } from "next/navigation";

// Registration lives at /register now. This keeps older links working —
// including affiliate invite emails already sent (?affiliate=1&code=…).
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/register?${query}` : "/register");
}
