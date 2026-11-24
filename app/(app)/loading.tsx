import { HairpinLoader } from "@/components/ui/hairpin-loader";

export default function Loading() {
  return (
    <div className="relative h-[calc(100dvh-8.5rem)] lg:h-dvh">
      <HairpinLoader variant="panel" label="Loading" />
    </div>
  );
}
