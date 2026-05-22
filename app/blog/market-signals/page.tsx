import BlogClusterPage, { clusterMetadata } from "@/app/components/BlogClusterPage";

export const metadata = clusterMetadata("market-signals");

export default function Page() {
  return <BlogClusterPage cluster="market-signals" />;
}
