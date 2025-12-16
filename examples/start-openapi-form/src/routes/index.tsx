import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
  head: () => ({
    meta: [{ title: "TanStack Start + OpenAPI + TanStack Form" }],
  }),
});

function HomeComponent() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-4 text-4xl font-bold text-gray-900">
        TanStack Start + OpenAPI + TanStack Form
      </h1>
      <p className="mb-8 text-lg text-gray-600">
        This example demonstrates using tangrams to generate TanStack Form
        options from OpenAPI schemas with Zod validation.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/pets/new"
          className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h2 className="mb-2 text-xl font-semibold text-gray-900">
            Create Pet
          </h2>
          <p className="text-gray-600">
            Create a new pet using a form generated from the OpenAPI schema with
            Zod validation.
          </p>
        </Link>

        <Link
          to="/pets/edit"
          className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Edit Pet</h2>
          <p className="text-gray-600">
            Edit an existing pet using a form with pre-populated values.
          </p>
        </Link>
      </div>
    </div>
  );
}
