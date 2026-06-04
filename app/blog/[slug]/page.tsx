import Link from "next/link";
import { notFound } from "next/navigation";
import GiscusComments from "@/app/components/GiscusComments";
import ScoreNav from "@/app/components/ScoreNav";
import { BLOG_POSTS, BLOG_POSTS_BY_SLUG } from "@/data/blog-posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = BLOG_POSTS_BY_SLUG[slug];
  if (!post) {
    return {
      title: "Post not found — QScoring",
      description: "The requested blog post could not be found.",
      robots: { index: false, follow: true },
    };
  }
  const url = `https://qscoring.com/blog/${post.slug}`;
  return {
    title: `${post.title} — QScoring`,
    description: post.description,
    alternates: { canonical: url },
    // Off-topic posts (credit/fraud/DUNS) are noindex,follow so they stop
    // diluting the stock-scoring topic while still passing internal-link equity.
    ...(post.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: "QScoring",
      type: "article",
      publishedTime: post.publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = BLOG_POSTS_BY_SLUG[slug];
  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `https://qscoring.com/blog/${post.slug}`,
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: { "@type": "Organization", name: "QScoring", url: "https://qscoring.com" },
    publisher: {
      "@type": "Organization",
      name: "QScoring",
      url: "https://qscoring.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://qscoring.com/blog/${post.slug}`,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://qscoring.com/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://qscoring.com/blog" },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `https://qscoring.com/blog/${post.slug}`,
      },
    ],
  };

  const Body = post.Body;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="glow-orb green" />
      <div className="glow-orb blue" />

      <ScoreNav />

      <main className="methodology blog-post">
        <header className="method-header">
          <p className="method-eyebrow">
            <Link href="/blog">Blog</Link>
          </p>
          <h1>{post.title}</h1>
          <p className="blog-post-meta">
            {formatDate(post.publishedAt)} · {post.readTimeMinutes} min read
          </p>
          <p className="method-lede">{post.description}</p>
        </header>

        <article className="blog-post-body">
          <Body />
        </article>

        <section
          className="blog-comments"
          aria-labelledby={`comments-${post.slug}`}
        >
          <h2 id={`comments-${post.slug}`} className="blog-comments-heading">
            Discussion
          </h2>
          <p className="blog-comments-hint">
            Comments are powered by GitHub Discussions. Sign in with GitHub to
            join the conversation.
          </p>
          <GiscusComments />
        </section>

        <p className="back-to-top">
          <Link href="/blog">← All posts</Link>
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
        <p className="disclaimer">
          QScoring provides quantitative analysis for informational and educational purposes only.
          It does not constitute investment advice.
        </p>
        <p>© 2026 QScoring.com. All rights reserved.</p>
      </footer>
    </>
  );
}
