import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="p-8 text-[var(--muted)]">Chargement…</main>}>
      <LoginClient />
    </Suspense>
  );
}
