import { env } from "../env";

export function Home() {
  return (
    <section className="stack">
      <h1>Fewer regretted clicks on YouTube.</h1>
      <p>
        Content Clam dims videos that match categories you choose to filter: clickbait, outrage bait, gossip, low-effort reactions, pranks, and hype. Everything else stays exactly as YouTube shows it. Every dimmed video says why and has a Reveal button.
      </p>
      <p>
        <a className="button primary" href={env.storeUrl}>Add to Chrome</a>
      </p>
      <h2>How it pays for itself</h2>
      <p>
        Classification runs on Jev by TypeSafe AI. Use your own TypeSafe API key for free, or buy a small pack of credits and let us handle it. Your first 100 analyses are on us after you verify your email.
      </p>
      <h2>What we keep</h2>
      <p>
        Your account, balance, settings, and purchase records. Never which videos you saw or how they were classified. <a href="/privacy">Read the details.</a>
      </p>
    </section>
  );
}
