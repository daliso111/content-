import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";
import { APP_TAGLINE } from "@/lib/constants";
import { PUBLIC_BRAND } from "@/lib/public-brand";

export const metadata: Metadata = {
  title: {
    default: `${PUBLIC_BRAND.name} — Social media scheduling & approvals`,
    template: `%s · ${PUBLIC_BRAND.name}`,
  },
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
