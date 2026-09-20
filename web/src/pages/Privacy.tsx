export function Privacy() {
  return (
    <section className="stack prose">
      <h1>Privacy</h1>
      <h2>What the extension reads</h2>
      <p>Only text already visible on the YouTube page: video titles, channel names, short descriptions, durations, and badges. It does not read your watch history, comments, or account.</p>
      <h2>Where that text goes</h2>
      <p>
        With your own TypeSafe API key, the extension sends it directly from your browser to api.typesafe.ai. With Content Clam credits, it goes to our Convex backend, which forwards it to TypeSafe and returns the answer. Our backend holds it in memory only while the request runs. It is not written to a database, a log, or an error report.
      </p>
      <p>TypeSafe processes the text under its own terms. We do not claim zero retention on their side for ordinary accounts.</p>
      <h2>What stays on your device</h2>
      <p>Classification results, cached for up to 30 days. Your personal API key, if you use one. It is never synced or sent to us.</p>
      <h2>What we store about you</h2>
      <p>If you create an account: your email, your credit balance, how many analyses you have paid for, your purchase records, and your filter settings so they follow you across devices. Short-lived billing receipts prevent double charges and contain no video information.</p>
      <h2>Payments</h2>
      <p>Stripe handles card details. We never see your card number.</p>
      <h2>Deleting your account</h2>
      <p>Email support. We remove your settings and authentication data and keep only payment records the law requires. Unused credits are lost on deletion, and we will tell you the balance before proceeding.</p>
    </section>
  );
}
