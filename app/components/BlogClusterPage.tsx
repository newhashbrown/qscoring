import { safeJsonLdString } from "@/lib/json-ld";
import Link from "next/link";
import ScoreNav from "./ScoreNav";
import {
  CLUSTERS,
  postsInCluster,
  type BlogCluster,
} from "@/data/blog-posts";

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function clusterMetadata(cluster: BlogCluster) {
  const def = CLUSTERS[cluster];
  const url = `https://qscoring.com/blog/${def.slug}`;
  return {
    title: `${def.title} — QScoring blog`,
    description: def.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${def.title} — QScoring blog`,
      description: def.description,
      url,
      siteName: "QScoring",
      type: "website" as const,
    },
  };
}

export default function BlogClusterPage({ cluster }: { cluster: BlogCluster }) {
  const def = CLUSTERS[cluster];
  const posts = postsInCluster(cluster);

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `https://qscoring.com/blog/${def.slug}`,
    name: def.title,
    description: def.description,
    isPartOf: {
      "@type": "Blog",
      "@id": "https://qscoring.com/blog",
      name: "QScoring Blog",
    },
    hasPart: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.publishedAt,
      url: `https://qscoring.com/blog/${p.slug}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(collectionJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology blog-cluster">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/blog">Blog</Link>
          </p>
          <h1>{def.title}</h1>
          <p className="method-lede">{def.intro}</p>
        </header>

        {posts.length > 0 ? (
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
        ) : (
          <section className="cluster-empty">
            <p>
              No posts in this cluster yet. The first ones land soon — in the meantime, browse{" "}
              <Link href="/blog">all posts</Link> or jump into the live{" "}
              <Link href="/methodology">methodology</Link>.
            </p>
          </section>
        )}

        <p className="back-to-top">
          <Link href="/blog">← All clusters</Link>
        </p>
      </main>

      <footer>
        <p className="footer-links">
          <Link href="/blog">Blog</Link>
          <span className="sep">·</span>
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/glossary">Glossary</Link>
          <span className="sep">·</span>
          <Link href="/score">Score a ticker</Link>
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
