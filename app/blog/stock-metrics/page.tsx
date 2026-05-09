import BlogClusterPage, { clusterMetadata } from "@/app/components/BlogClusterPage";

export const metadata = clusterMetadata("stock-metrics");

export default function Page() {
  return <BlogClusterPage cluster="stock-metrics" />;
}
