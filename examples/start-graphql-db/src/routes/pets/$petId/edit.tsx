import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import type { PetCategory, PetStatus } from "@/generated/api/schema";

export const Route = createFileRoute("/pets/$petId/edit")({
  component: EditPetComponent,
});

function EditPetComponent() {
  const { petId } = Route.useParams();
  const navigate = useNavigate();
  const { collections } = Route.useRouteContext();

  // Use live query with a filter to get a single pet
  const { data: pets } = useLiveQuery((q) =>
    q.from({ pet: collections.pets }).where(({ pet }) => eq(pet.id, petId)),
  );

  const pet = pets[0];

  const [name, setName] = useState("");
  const [status, setStatus] = useState<PetStatus>("available");
  const [category, setCategory] = useState<PetCategory>("dog");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with pet data when it loads
  useEffect(() => {
    if (pet) {
      setName(pet.name);
      setStatus(pet.status);
      setCategory(pet.category);
    }
  }, [pet]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Use collection update for local-first mutation (synchronous)
      collections.pets.update(pet.id, (draft) => {
        draft.name = name;
        draft.status = status;
        draft.category = category;
        draft.updatedAt = new Date().toISOString();
      });

      navigate({ to: "/pets/$petId", params: { petId: pet.id } });
    } catch (error) {
      console.error("Failed to update pet:", error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link
        to="/pets/$petId"
        params={{ petId }}
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; Back to Pet
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">Edit {pet.name}</h1>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700"
          >
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-gray-700"
          >
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PetStatus)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="available">Available</option>
            <option value="pending">Pending</option>
            <option value="sold">Sold</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-gray-700"
          >
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as PetCategory)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="bird">Bird</option>
            <option value="fish">Fish</option>
            <option value="reptile">Reptile</option>
          </select>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
          <Link
            to="/pets/$petId"
            params={{ petId }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
