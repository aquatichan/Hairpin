import { Masonry } from "@/components/masonry";
import { libraryLooks } from "@/lib/looks";

export const metadata = { title: "Discover · Hairpin" };

export default function Discover() {
  return <Masonry looks={libraryLooks} />;
}
