import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOCket Terminal — Chat Phi-3.5-Financial",
  description: "Interface de chat connectee au serveur d'inference de l'equipe INFRA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
