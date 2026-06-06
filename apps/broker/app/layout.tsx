import "./globals.css";
import { BrokerShell } from "./lib/ui/broker-shell";

export const metadata = {
  title: "AssurMatch Courtier",
  description: "Back-office courtier AssurMatch"
};

export default function BrokerLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body><BrokerShell>{children}</BrokerShell></body>
    </html>
  );
}
