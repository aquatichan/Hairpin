import { Suspense } from "react";
import { SavedWorkspace } from "@/components/saved/saved-workspace";

export const metadata = { title: "Saved · Hairpin" };

export default function Page() {
  return (
    <Suspense>
      <SavedWorkspace />
    </Suspense>
  );
}
