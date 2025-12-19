import { useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pets/")({
  component: PetsListComponent,
});

function PetsListComponent() {
  const { collections } = Route.useRouteContext();

  // Full sync mode: all data is fetched, filtering happens client-side
  const { data: pets } = useLiveQuery(collections.pets);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Pets</h1>
          <p className="text-gray-600">
            {pets.length} pets (Full Sync - TanStack DB)
          </p>
        </div>
        <Link
          to="/pets/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Add Pet
        </Link>
      </div>

      {/* Info Box */}
      <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-800">
          <strong>Full Sync Mode:</strong> All pet data is fetched once and
          cached locally. Filtering and sorting happens entirely on the client.
          Ideal for small to medium datasets.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pets.map((pet) => (
          <Link
            key={pet.id}
            to="/pets/$petId"
            params={{ petId: pet.id }}
            className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="font-semibold text-gray-900">{pet.name}</h3>
            <p className="text-sm text-gray-600">{pet.category}</p>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                pet.status === "available"
                  ? "bg-green-100 text-green-800"
                  : pet.status === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
              }`}
            >
              {pet.status}
            </span>
          </Link>
        ))}
      </div>

      {pets.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">No pets yet. Add one to get started!</p>
        </div>
      )}
    </div>
  );
}
