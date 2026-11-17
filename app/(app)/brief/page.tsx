import { Suspense } from "react";
import { BriefFlow } from "@/components/brief-flow";

export const metadata = { title: "Barber Brief · Hairpin" };

export default function Page() {
  return (
    <Suspense>
      <BriefFlow />
    </Suspense>
  );
}
