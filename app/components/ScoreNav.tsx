import Link from "next/link";
import TickerSearch from "./TickerSearch";

export default function ScoreNav({ ticker }: { ticker?: string }) {
  return (
    <nav className="score-nav">
      <Link href="/" className="logo">
        QScoring<span>.com</span>
      </Link>
      <TickerSearch initialValue={ticker ?? ""} size="compact" />
      <Link href="/#signup" className="nav-cta">
        Get Early Access
      </Link>
    </nav>
  );
}
