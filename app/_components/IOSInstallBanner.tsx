import { APP_STORE_URL } from "../_lib/locales";

export default function IOSInstallBanner() {
  return (
    <aside className="ios-app-banner" aria-label="Download ChartsGPT from the App Store">
      <img
        className="ios-app-banner-icon"
        src="/apple-touch-icon.png"
        alt=""
        width="52"
        height="52"
      />
      <span className="ios-app-banner-copy">
        <strong>ChartsGPT</strong>
        <small>AI Trading Assistant · App Store</small>
      </span>
      <a
        className="ios-app-banner-action js-appstore"
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download ChartsGPT from the App Store"
      >
        Download
      </a>
    </aside>
  );
}
