import { eq, useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import { updatePetFormOptions } from "@/generated/api/form/forms";

import type {
  PetCategory,
  PetStatus,
  UpdatePetRequest,
} from "@/generated/api/schema";

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

  const defaultValues: UpdatePetRequest = {
    name: pet?.name,
    category: pet?.category,
    status: pet?.status,
    photoUrl: pet?.photoUrl,
  };

  // Use generated form options with Zod validation
  const form = useForm({
    ...updatePetFormOptions,
    defaultValues,
    onSubmit: async ({ value }) => {
      if (!pet) return;

      // Use TanStack DB collection update for local-first mutation
      collections.pets.update(pet.id, (draft) => {
        if (value.name) draft.name = value.name;
        if (value.status) draft.status = value.status;
        if (value.category) draft.category = value.category;
        if (value.photoUrl !== undefined) draft.photoUrl = value.photoUrl;
        draft.updatedAt = new Date().toISOString();
      });

      navigate({ to: "/pets/$petId", params: { petId } });
    },
  });

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
    <div className="mx-auto max-w-2xl p-8">
      <Link
        to="/pets/$petId"
        params={{ petId }}
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; Back to Pet
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">Edit {pet.name}</h1>
      <p className="mt-2 text-gray-600">
        Uses TanStack Form (generated) + TanStack DB collection update
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <form.Field name="name">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-gray-700"
              >
                Name
              </label>
              <input
                type="text"
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-sm text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="category">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-gray-700"
              >
                Category
              </label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value as PetCategory)
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="bird">Bird</option>
                <option value="fish">Fish</option>
                <option value="reptile">Reptile</option>
              </select>
              {field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-sm text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value as PetStatus)
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="available">Available</option>
                <option value="pending">Pending</option>
                <option value="sold">Sold</option>
              </select>
              {field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-sm text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="photoUrl">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-gray-700"
              >
                Photo URL (optional)
              </label>
              <input
                type="url"
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(e.target.value || undefined)
                }
                placeholder="https://example.com/photo.jpg"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-sm text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <div className="flex gap-4">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            )}
          </form.Subscribe>
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
