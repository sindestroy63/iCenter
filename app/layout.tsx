import type { Metadata } from "next";
import "./globals.css";
import "./storefront.css";
import "./admin-overrides.css";
export const metadata: Metadata={title:"iCenter",description:"iCenter 2.0"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
