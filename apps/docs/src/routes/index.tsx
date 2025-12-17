import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/tangrams-logo.png"
          alt="Tangrams Logo"
          className="h-32 w-32"
        />
        <h1 className="text-5xl font-bold tracking-tight">Tangrams</h1>
        <p className="max-w-xl text-lg text-fd-muted-foreground">
          Assemble the pieces. Every data layer is a puzzle - Tangrams generates
          the type-safe pieces that fit perfectly into your TanStack
          applications.
        </p>
      </div>

      <div className="flex gap-4">
        <a
          href="/docs"
          className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
        >
          Get Started
        </a>
        <a
          href="https://github.com/hobbescodes/tangrams"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-fd-border px-6 py-3 font-medium transition-colors hover:bg-fd-accent"
        >
          GitHub
        </a>
      </div>

      <div className="mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        <FeatureCard
          title="TanStack Query"
          description="Generate queryOptions and mutationOptions that snap right into useQuery and useMutation."
        />
        <FeatureCard
          title="TanStack Form"
          description="Create formOptions with Zod validation - the missing piece for type-safe forms."
        />
        <FeatureCard
          title="TanStack DB"
          description="Generate collections with optimistic updates - local-first data sync that just works."
        />
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-fd-border bg-fd-card p-6">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-fd-muted-foreground">{description}</p>
    </div>
  );
}
