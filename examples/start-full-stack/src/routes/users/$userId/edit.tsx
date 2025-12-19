import { eq, useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";

import { updateUserFormOptions } from "@/generated/api/form/forms";

import type { UpdateUserRequest, UserRole } from "@/generated/api/schema";

export const Route = createFileRoute("/users/$userId/edit")({
  component: EditUserComponent,
});

function EditUserComponent() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const { collections } = Route.useRouteContext();

  // Use live query with a filter to get a single user
  const { data: users } = useLiveQuery((q) =>
    q
      .from({ user: collections.users })
      .where(({ user }) => eq(user.id, userId)),
  );

  const user = users[0];

  const defaultValues: UpdateUserRequest = {
    name: user?.name,
    email: user?.email,
    role: user?.role,
  };

  // Use generated form options with Zod validation
  const form = useForm({
    ...updateUserFormOptions,
    defaultValues,
    onSubmit: async ({ value }) => {
      if (!user) return;

      // Use TanStack DB collection update for local-first mutation
      collections.users.update(user.id, (draft) => {
        if (value.name) draft.name = value.name;
        if (value.email) draft.email = value.email;
        if (value.role) draft.role = value.role;
        draft.updatedAt = new Date().toISOString();
      });

      navigate({ to: "/users/$userId", params: { userId } });
    },
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <p className="text-gray-600">User not found</p>
        <Link to="/users" className="text-purple-600 hover:underline">
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link
        to="/users/$userId"
        params={{ userId }}
        className="text-sm text-purple-600 hover:underline"
      >
        &larr; Back to User
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">
        Edit {user.name}
      </h1>
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
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-sm text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="email">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                type="email"
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="user@example.com"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="mt-1 text-sm text-red-600">
                  {field.state.meta.errors.join(", ")}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="role">
          {(field) => (
            <div>
              <label
                htmlFor={field.name}
                className="block text-sm font-medium text-gray-700"
              >
                Role
              </label>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value ?? ""}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value as UserRole)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="guest">Guest</option>
              </select>
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
                className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            )}
          </form.Subscribe>
          <Link
            to="/users/$userId"
            params={{ userId }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
