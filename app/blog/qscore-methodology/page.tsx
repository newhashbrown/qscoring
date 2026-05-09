import BlogClusterPage, { clusterMetadata } from "@/app/components/BlogClusterPage";

export const metadata = clusterMetadata("qscore-methodology");

export default function Page() {
  return <BlogClusterPage cluster="qscore-methodology" />;
}
