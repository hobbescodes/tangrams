import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/pets/$petId/")({
  component: PetDetailComponent,
});

function PetDetailComponent() {
  const { petId } = Route.useParams();
  const navigate = useNavigate();
  const { collections } = Route.useRouteContext();

  // Use live query with a filter to get a single pet
  const { data: pets } = useLiveQuery((q) =>
    q.from({ pet: collections.pets }).where(({ pet }) => eq(pet.id, petId)),
  );

  const pet = pets[0];

  const handleDelete = () => {
    if (!pet) return;
    if (!confirm("Are you sure you want to delete this pet?")) return;

    collections.pets.delete(pet.id);
    navigate({ to: "/pets" });
  };

  if (!pet) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-gray-600">Pet not found</p>
        <Link to="/pets" className="text-blue-600 hover:underline">
          Back to pets
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link to="/pets" className="text-sm text-blue-600 hover:underline">
        &larr; Back to Pets
      </Link>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{pet.name}</h1>
            <p className="text-gray-600">{pet.category}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              pet.status === "available"
                ? "bg-green-100 text-green-800"
                : pet.status === "pending"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
            }`}
          >
            {pet.status}
          </span>
        </div>

        {pet.tags.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 font-semibold text-gray-700">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {pet.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2 py-1 text-sm text-gray-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {pet.photoUrl && (
          <div className="mb-4">
            <h2 className="mb-2 font-semibold text-gray-700">Photo</h2>
            <img
              src={pet.photoUrl}
              alt={pet.name}
              className="h-48 w-full rounded-lg object-cover"
            />
          </div>
        )}

        <div className="flex gap-4">
          <Link
            to="/pets/$petId/edit"
            params={{ petId: pet.id }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Edit Pet
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50"
          >
            Delete Pet
          </button>
        </div>
      </div>
    </div>
  );
}
