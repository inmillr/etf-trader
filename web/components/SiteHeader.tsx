import Link from "next/link";

export function SiteHeader({
  active
}: {
  active: "dashboard" | "journal";
}) {
  return (
    <header>
      <div>
        <h1>ETF Trader</h1>
        <p
          className="muted"
          style={{ margin: "4px 0 0" }}
        >
          Liquid dual momentum · local SQLite
        </p>
      </div>
      <nav>
        <Link
          href="/"
          className={
            active === "dashboard"
              ? "active"
              : ""
          }
        >
          Dashboard
        </Link>
        <Link
          href="/journal"
          className={
            active === "journal"
              ? "active"
              : ""
          }
        >
          Journal
        </Link>
      </nav>
    </header>
  );
}
