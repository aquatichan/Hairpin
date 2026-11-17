import { Suspense } from "react";
import { TryFlow } from "@/components/try/try-flow";

export const metadata = { title: "Try · Hairpin" };

export default function Page() {
  return (
    <Suspense>
      <TryFlow />
    </Suspense>
  );
}
