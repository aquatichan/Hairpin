import { ReviewQueue } from "@/components/admin/review-queue";

export const metadata = { title: "Review shared cuts · Hairpin", robots: { index: false } };

export default function AdminPosts() {
  return <ReviewQueue />;
}
