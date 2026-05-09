import BlogClusterPage, { clusterMetadata } from "@/app/components/BlogClusterPage";

export const metadata = clusterMetadata("factor-investing");

export default function Page() {
  return <BlogClusterPage cluster="factor-investing" />;
}
