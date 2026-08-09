/**
 * Interim page body for tabs whose engine dependencies are still being ported.
 *
 * Deliberately states what is missing instead of rendering a mock: the whole point of
 * this app is that its numbers come from the real engine, so a plausible-looking fake
 * screen would be worse than an empty one.
 */
export default function Placeholder({
  title,
  summary,
  waitingOn
}: {
  title: string;
  summary: string;
  waitingOn: string[];
}) {
  return (
    <>
      <h1 className="cg-title">{title}</h1>
      <p className="cg-subtitle">{summary}</p>

      <div className="cg-card">
        <h2>Not wired up yet</h2>
        <p>This tab is waiting on:</p>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
          {waitingOn.map((item) => (
            <li key={item} className="cg-muted" style={{ marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
