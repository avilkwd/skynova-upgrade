import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Shop Desk | Skynova Upgrade',description:'Customers, cars, and every repair. A shared workspace for your mechanic shop.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
