import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-4 text-3xl font-bold text-gray-900">
        TanStack Start + GraphQL + TanStack DB
      </h1>
      <p className="mb-8 text-gray-600">
        This example demonstrates using tangrams with GraphQL and TanStack DB
        for local-first reactive data.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/pets"
          className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Pets API</h2>
          <p className="text-gray-600">
            Browse, create, and manage pets using TanStack DB collections.
          </p>
        </Link>
      </div>
    </div>
  );
}
