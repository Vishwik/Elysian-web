import { SpeedInsights } from '@vercel/speed-insights/next';
import '../app/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <SpeedInsights />
    </>
  );
}
