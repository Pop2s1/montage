import { Figtree, Syne } from "next/font/google";
import type { Metadata } from "next";
import { Providers } from "@/components/layout/Providers";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Montage — Montage vidéo assisté par IA",
  description:
    "Importez vos rushes, décrivez le résultat souhaité, obtenez un montage court prêt à peaufiner.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${syne.variable} ${figtree.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
