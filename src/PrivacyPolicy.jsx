function PrivacyPolicy({ onBackHome }) {
  return (
    <main className="app">
      <section className="policy-hero">
        <button className="back-home-button" onClick={onBackHome}>
          ← Back to FollowDrop
        </button>

        <div className="hero-badge">Privacy Policy</div>

        <h1>FollowDrop Privacy Policy</h1>

        <p className="subtitle">
          FollowDrop is designed as a local-first social relationship insights
          tool. It analyzes export files you choose to upload in your browser
          without asking for your social media passwords.
        </p>

        <p className="policy-updated">Last updated: May 25, 2026</p>
      </section>

      <section className="policy-layout">
        <aside className="policy-sidebar">
          <a href="#overview">Overview</a>
          <a href="#data-we-process">Data we process</a>
          <a href="#local-storage">Local storage</a>
          <a href="#files">Uploaded files</a>
          <a href="#exports">CSV exports</a>
          <a href="#third-parties">Third parties</a>
          <a href="#children">Children’s privacy</a>
          <a href="#changes">Changes</a>
          <a href="#contact">Contact</a>
        </aside>

        <section className="policy-content">
          <div className="policy-card" id="overview">
            <h2>1. Overview</h2>
            <p>
              FollowDrop helps users analyze social media export files from
              platforms such as Instagram and Twitter/X. The app can identify
              relationship insights such as mutual followers, accounts that do
              not follow you back, accounts you do not follow back, new
              followers, and unfollowers based on files you provide.
            </p>
            <p>
              FollowDrop does not ask for your Instagram, Twitter/X, Facebook,
              or other social media password. FollowDrop does not log into your
              social media accounts and does not scrape social media websites.
            </p>
          </div>

          <div className="policy-card" id="data-we-process">
            <h2>2. Data FollowDrop processes</h2>
            <p>
              When you upload a social media export file, FollowDrop may process
              usernames, follower lists, following lists, and related
              relationship data found inside that file. This processing happens
              in your browser so the app can display insights to you.
            </p>
            <p>
              FollowDrop is designed to ignore unrelated files such as contacts,
              blocked accounts, ads, muted accounts, recently unfollowed
              profiles, and other files that are not needed for follower and
              following analysis.
            </p>
          </div>

          <div className="policy-card" id="local-storage">
            <h2>3. Local storage</h2>
            <p>
              If you save a snapshot, FollowDrop stores that snapshot in your
              browser’s local storage on the device you are using. This allows
              you to compare future uploads against previous snapshots.
            </p>
            <p>
              Local storage is device-specific. If you clear your browser data,
              use a different browser, or use a different device, your saved
              snapshots may not be available.
            </p>
          </div>

          <div className="policy-card" id="files">
            <h2>4. Uploaded files</h2>
            <p>
              FollowDrop analyzes files you manually choose to upload. The app
              is intended to work with export files such as Instagram ZIP/HTML
              exports and Twitter/X archive ZIP files.
            </p>
            <p>
              The current MVP is designed to process these files locally in your
              browser. You should only upload export files that belong to you or
              that you have permission to analyze.
            </p>
          </div>

          <div className="policy-card" id="exports">
            <h2>5. CSV exports</h2>
            <p>
              FollowDrop allows you to export results as CSV files. These CSV
              files are downloaded to your device and may include usernames and
              relationship labels such as mutual, not following you back, or you
              do not follow back.
            </p>
            <p>
              You are responsible for where you store or share exported CSV
              files after downloading them.
            </p>
          </div>

          <div className="policy-card" id="third-parties">
            <h2>6. Third-party services</h2>
            <p>
              FollowDrop may be hosted on services such as Vercel and may use
              code hosting services such as GitHub. These services may process
              basic technical information such as page visits, logs, browser
              type, and network requests according to their own policies.
            </p>
            <p>
              FollowDrop is not affiliated with Instagram, Meta, Facebook,
              Twitter, or X.
            </p>
          </div>

          <div className="policy-card" id="children">
            <h2>7. Children’s privacy</h2>
            <p>
              FollowDrop is not intended for children under 13. If you are under
              the age required to use a social media platform or to manage your
              own data exports, use FollowDrop only with guidance from a parent
              or guardian.
            </p>
          </div>

          <div className="policy-card" id="changes">
            <h2>8. Changes to this policy</h2>
            <p>
              This privacy policy may be updated as FollowDrop changes. For
              example, future versions may include PWA support, Chrome extension
              support, Facebook export support, or other platform modes.
            </p>
            <p>
              If the app’s data handling changes significantly, the privacy
              policy should be updated before those changes are released.
            </p>
          </div>

          <div className="policy-card" id="contact">
            <h2>9. Contact</h2>
            <p>
              For now, FollowDrop is an MVP project. If their are any bugs or
              questions about the app, please contact the developer's email down below.
            </p>
            <p className="policy-note">
              Note: Contact david.business126@gmail.com for any questions or 
              concerns regarding this privacy policy.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

export default PrivacyPolicy;