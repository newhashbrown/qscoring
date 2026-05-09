import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import { BLOG_POSTS } from "@/data/blog-posts";

export const metadata = {
  title: "QScoring Blog — Factor Investing, Quant Scores, and How They Work",
  description:
    "Plain-English explainers on QScore methodology, factor investing fundamentals, and how to use the QScoring product day-to-day.",
  alternates: { canonical: "https://qscoring.com/blog" },
};

const blogJsonLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": "https://qscoring.com/blog",
  name: "QScoring Blog",
  description:
    "Explainers on factor investing, quant scoring methodology, and how to read the QScore.",
  publisher: {
    "@type": "Organization",
    name: "QScoring",
    url: "https://qscoring.com",
  },
  blogPost: BLOG_POSTS.map((p) => ({
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: p.publishedAt,
    url: `https://qscoring.com/blog/${p.slug}`,
  })),
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  const sorted = [...BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology blog-index">
        <header className="method-header">
          <p className="method-eyebrow">Blog</p>
          <h1>Factor investing, in plain English</h1>
          <p className="method-lede">
            Explainers on the QScore methodology, the academic factor research it draws from,
            and how to use the product to think clearly about individual stocks.
          </p>
        </header>

        <ul className="blog-list">
          {sorted.map((p) => (
            <li key={p.slug}>
              <Link href={`/blog/${p.slug}`} className="blog-list-item">
                <span className="blog-list-meta">
                  {formatDate(p.publishedAt)} · {p.readTimeMinutes} min read
                </span>
                <span className="blog-list-title">{p.title}</span>
                <span className="blog-list-excerpt">{p.excerpt}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
          <span className="sep">·</span>
          <Link href="/scores">Categories</Link>
          <span className="sep">·</span>
          <Link href="/score">Score a ticker</Link>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
