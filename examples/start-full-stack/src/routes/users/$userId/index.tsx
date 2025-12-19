import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/users/$userId/")({
  component: UserDetailComponent,
});

function UserDetailComponent() {
  const { userId } = Route.useParams();
  const { collections } = Route.useRouteContext();

  // Use live query with a filter to get a single user
  const { data: users } = useLiveQuery((q) =>
    q
      .from({ user: collections.users })
      .where(({ user }) => eq(user.id, userId)),
  );

  const user = users[0];

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

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${user.name}?`)) {
      await collections.users.delete(user.id);
      window.location.href = "/users";
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link to="/users" className="text-sm text-purple-600 hover:underline">
        &larr; Back to Users
      </Link>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{user.name}</h1>
            <p className="mt-1 text-lg text-gray-600">{user.email}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              user.role === "admin"
                ? "bg-red-100 text-red-800"
                : user.role === "user"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-800"
            }`}
          >
            {user.role}
          </span>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">
                {new Date(user.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Updated</dt>
              <dd className="text-gray-900">
                {new Date(user.updatedAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 flex gap-4">
          <Link
            to="/users/$userId/edit"
            params={{ userId }}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
          >
            Edit User
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50"
          >
            Delete User
          </button>
        </div>
      </div>
    </div>
  );
}
