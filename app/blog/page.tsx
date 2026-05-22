import Link from "next/link";
import ScoreNav from "@/app/components/ScoreNav";
import {
  BLOG_POSTS,
  CLUSTERS,
  clustersByRecency,
  isRecent,
  latestPosts,
  postsInCluster,
} from "@/data/blog-posts";

export const metadata = {
  title: "QScoring Blog — Factor Investing, Stock Comparisons, and Quant Methodology",
  description:
    "Plain-English explainers on QScore methodology, factor investing fundamentals, head-to-head stock comparisons, and individual financial metrics — all linked to live ticker scores.",
  alternates: { canonical: "https://qscoring.com/blog" },
};

// Re-render hourly so the "New" badge reflects current time without
// depending on push-triggered rebuilds.
export const revalidate = 3600;

const blogJsonLd = {
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": "https://qscoring.com/blog",
  name: "QScoring Blog",
  description:
    "Explainers on factor investing, quant scoring methodology, head-to-head stock comparisons, and individual financial metrics.",
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
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
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
          <h1>Factor investing and quant scoring, in plain English</h1>
          <p className="method-lede">
            Posts are organized into four clusters — pick the topic you&apos;re here for, or
            browse the latest below. Every post is hand-written, evergreen where possible, and
            cross-linked to the live product (methodology, glossary terms, ticker scores, and
            head-to-head comparisons).
          </p>
        </header>

        <section className="blog-latest" aria-labelledby="latest-heading">
          <h2 id="latest-heading" className="blog-latest-heading">
            Latest posts
          </h2>
          <ul className="blog-latest-list">
            {latestPosts(6).map((p) => {
              const recent = isRecent(p.publishedAt);
              return (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="blog-latest-card">
                    <span className="blog-latest-meta">
                      {formatDate(p.publishedAt)} · {p.readTimeMinutes} min read
                      {recent ? <span className="blog-new-badge">New</span> : null}
                    </span>
                    <span className="blog-latest-title">{p.title}</span>
                    <span className="blog-latest-excerpt">{p.excerpt}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="blog-clusters">
          {clustersByRecency().map((slug) => {
            const def = CLUSTERS[slug];
            const count = postsInCluster(slug).length;
            return (
              <Link key={slug} href={`/blog/${slug}`} className="blog-cluster-card">
                <span className="blog-cluster-title">{def.title}</span>
                <span className="blog-cluster-desc">{def.description}</span>
                <span className="blog-cluster-meta">
                  {count} {count === 1 ? "post" : "posts"}
                </span>
              </Link>
            );
          })}
        </section>

        {clustersByRecency().map((slug) => {
          const def = CLUSTERS[slug];
          const posts = postsInCluster(slug);
          return (
            <section key={slug} className="blog-cluster-section">
              <h2>
                <Link href={`/blog/${slug}`}>{def.title}</Link>
              </h2>
              <ul className="blog-list">
                {posts.map((p) => (
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
            </section>
          );
        })}
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
