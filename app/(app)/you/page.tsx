"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { BlobImage } from "@/components/ui/blob-image";
import { Button, buttonClass } from "@/components/ui/button";
import { localStore } from "@/lib/local-store";
import { useLocal } from "@/lib/use-local";

export default function You() {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const photo = useLocal(() => localStore.get("photo", "active").then((p) => p ?? null), "photo");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-6">
      <h1 className="font-serif text-headline">{user?.name ?? "You"}</h1>
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-title">My photo</h2>
        {photo ? (
          <>
            <BlobImage blob={photo.blob} alt="Your photo" className="aspect-[4/5] w-40" />
            <p className="text-body text-stone">Stored on this device only. Deleting it removes it for good.</p>
            <Button variant="ghost" onClick={() => localStore.remove("photo", "active")}>
              Delete my photo
            </Button>
          </>
        ) : (
          <>
            <p className="text-body text-stone">No photo saved.</p>
            <Link href="/try" className={buttonClass("ghost")}>
              Add a photo
            </Link>
          </>
        )}
      </section>
      {status === "signed-in" && (
        <Button variant="ghost" onClick={() => signOut().then(() => router.replace("/"))}>
          Sign out
        </Button>
      )}
    </div>
  );
}
