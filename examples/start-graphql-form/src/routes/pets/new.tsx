import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import { createPetFormOptions } from "@/generated/api/form/forms";
import { createPet } from "@/generated/api/functions";

import type { CreatePetMutationVariables } from "@/generated/api/query/types";
import type { PetCategory, PetStatus } from "@/generated/api/schema";

export const Route = createFileRoute("/pets/new")({
  component: NewPetComponent,
});

function NewPetComponent() {
  const navigate = useNavigate();

  const createPetMutation = useMutation({
    mutationFn: createPet,
    onSuccess: () => {
      navigate({ to: "/" });
    },
  });

  const form = useForm({
    ...createPetFormOptions,
    onSubmit: async ({ value }) => {
      // Cast form values to mutation variables type
      const variables: CreatePetMutationVariables = {
        input: {
          name: value.input.name,
          category: value.input
            .category as unknown as CreatePetMutationVariables["input"]["category"],
          status: value.input
            .status as unknown as CreatePetMutationVariables["input"]["status"],
          tags: value.input.tags ?? [],
          photoUrl: value.input.photoUrl,
        },
      };
      await createPetMutation.mutateAsync(variables);
    },
  });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        &larr; Back to Home
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">Create New Pet</h1>
      <p className="mt-2 text-gray-600">
        This form uses TanStack Form with Zod validation generated from the
        GraphQL schema.
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
                value={field.state.value}
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
                value={field.state.value}
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
                value={field.state.value}
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
                {isSubmitting ? "Creating..." : "Create Pet"}
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

        {createPetMutation.isError && (
          <p className="text-sm text-red-600">
            Error creating pet. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
