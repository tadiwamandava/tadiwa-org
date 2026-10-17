import Link from "next/link";
import { Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-28 text-center">
      <p className="text-xs text-accent">
        404
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight">
        Nothing at this address.
      </h1>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">
        Check the address, or find the project you were looking for below.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        <Link href="/" className="text-accent underline underline-offset-4">
          Home
        </Link>
        <Link href="/projects" className="text-accent underline underline-offset-4">
          Projects
        </Link>
      </div>
    </Container>
  );
}
