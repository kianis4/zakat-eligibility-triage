import type { Metadata, Viewport } from "next";
import { Lora, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { Khatam } from "./khatam";

/**
 * The shell every page renders inside: the two typefaces, the top bar, and the reading container.
 *
 * Two families, because the pages carry two kinds of text. Plus Jakarta Sans is the interface.
 * Lora is the organizer's own words, wherever they appear, so evidence under examination never
 * looks like the tool examining it.
 *
 * The bar carries the product's own name and nothing else. The visual language is a tribute to
 * the platforms this tool would sit beside; the name and the mark are not, and neither appears
 * here. docs/design.md holds the rest of the contract.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-lora",
});

export const metadata: Metadata = {
  title: "Zakat-Eligibility Triage",
  description:
    "Assembles cited evidence about a crowdfunding campaign for a qualified human reviewer.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${lora.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar__inner">
            <span className="topbar__mark">
              <Khatam size={18} />
            </span>
            <span className="topbar__name">Zakat-Eligibility Triage</span>
          </div>
        </header>
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
