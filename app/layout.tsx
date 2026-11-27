import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'video-vc | Git-style Video Version Control',
  description: 'Collaborative video editing with snapshots, variations, and review requests across browser tabs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#000000] text-[#ffffff] antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}

