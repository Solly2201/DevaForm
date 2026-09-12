import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "DevaForm | Divine Studio",
  description:
    "Divine Studio — design your own customizable deity statue in 3D: pose, ornaments, attributes and materials — crafted for premium 3D printing. First deity: Ganesha.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="bg-surface-950 font-sans antialiased">{children}</body>
    </html>
  );
}
