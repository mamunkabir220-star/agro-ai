import './globals.css';

export const metadata = {
  title: 'AgroBot AI - কৃষি পরামর্শক',
  description: 'AI-powered agricultural advisor for Bangladeshi farmers. Get instant answers about crops, fertilizers, pest control, and more.',
  keywords: 'agriculture, farming, bangladesh, ai, chatbot, crops, fertilizer',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
