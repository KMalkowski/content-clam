import { env } from "../env";

export function Support() {
  return (
    <section className="stack prose">
      <h1>Support</h1>
      <p>
        Email <a href={`mailto:${env.supportEmail}`}>{env.supportEmail}</a>. Refunds are handled case by case, and account deletion happens by request.
      </p>
      <p>
        Found a bug or want to run your own copy? The whole project is open source. <a href="https://github.com/" rel="noreferrer">Repository</a>
      </p>
    </section>
  );
}
