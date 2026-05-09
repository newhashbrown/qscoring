import BlogClusterPage, { clusterMetadata } from "@/app/components/BlogClusterPage";

export const metadata = clusterMetadata("stock-comparisons");

export default function Page() {
  return <BlogClusterPage cluster="stock-comparisons" />;
}
