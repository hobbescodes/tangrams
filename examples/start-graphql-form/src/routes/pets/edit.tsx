import { useForm } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import { updatePetFormOptions } from "@/generated/api/form/forms";
import { updatePet } from "@/generated/api/functions";
import { getPetByIdQueryOptions } from "@/generated/api/query/operations";

import type { UpdatePetMutationVariables } from "@/generated/api/query/types";
import type { PetCategory, PetStatus } from "@/generated/api/schema";

export const Route = createFileRoute("/pets/edit")({
  loader: ({ context }) => {
    // Load pet ID 1 for demo purposes
    context.queryClient.ensureQueryData(getPetByIdQueryOptions({ id: "1" }));
  },
  component: EditPetComponent,
});

function EditPetComponent() {
  const navigate = useNavigate();

  // Load existing pet data
  const { data } = useSuspenseQuery(getPetByIdQueryOptions({ id: "1" }));
  const pet = data.pet;

  const updatePetMutation = useMutation({
    mutationFn: updatePet,
    onSuccess: () => {
      navigate({ to: "/" });
    },
  });

  const form = useForm({
    ...updatePetFormOptions,
    defaultValues: {
      id: "1",
      input: {
        name: pet?.name,
        category: pet?.category as PetCategory | undefined,
        status: pet?.status as PetStatus | undefined,
        photoUrl: pet?.photoUrl ?? undefined,
      },
    },
    onSubmit: async ({ value }) => {
      // Cast form values to mutation variables type
      const variables: UpdatePetMutationVariables = {
        id: value.id,
        input: {
          name: value.input.name,
          category: value.input
            .category as unknown as UpdatePetMutationVariables["input"]["category"],
          status: value.input
            .status as unknown as UpdatePetMutationVariables["input"]["status"],
          photoUrl: value.input.photoUrl,
        },
      };
      await updatePetMutation.mutateAsync(variables);
    },
  });

  if (!pet) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-gray-600">Pet not found</p>
        <Link to="/" className="text-blue-600 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        &larr; Back to Home
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">
        Edit Pet: {pet.name}
      </h1>
      <p className="mt-2 text-gray-600">
        This form demonstrates updating an existing pet with pre-populated
        values.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <form.Field name="input.name">
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

        <form.Field name="input.category">
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

        <form.Field name="input.status">
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

        <form.Field name="input.photoUrl">
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
            to="/"
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>

        {updatePetMutation.isError && (
          <p className="text-sm text-red-600">
            Error updating pet. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
