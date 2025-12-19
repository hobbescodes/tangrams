import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import type { UserRole } from "@/generated/api/schema";

export const Route = createFileRoute("/users/")({
  component: UsersListComponent,
});

function UsersListComponent() {
  const { collections } = Route.useRouteContext();
  const [selectedRole, setSelectedRole] = useState<UserRole | "all">("all");

  // On-demand sync mode: predicates are translated to API parameters
  // When selectedRole changes, the query is re-executed with the new filter
  // pushed to the server via predicate translation
  const { data: users } = useLiveQuery(
    (q) => {
      const query = q.from({ user: collections.users });
      if (selectedRole !== "all") {
        return query.where(({ user }) => eq(user.role, selectedRole));
      }
      return query;
    },
    [selectedRole],
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-purple-600 hover:underline">
            &larr; Back to Home
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">
            {users.length} users (On-Demand Sync - TanStack DB)
          </p>
        </div>
        <Link
          to="/users/new"
          className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
        >
          Add User
        </Link>
      </div>

      {/* Info Box */}
      <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
        <p className="text-sm text-purple-800">
          <strong>On-Demand Sync Mode:</strong> When you filter by role, the
          predicate is translated to API query parameters and sent to the
          server. Only matching data is fetched. Ideal for large datasets.
        </p>
      </div>

      {/* Filter Controls */}
      <div className="mb-6 flex items-center gap-4">
        <label
          htmlFor="roleFilter"
          className="text-sm font-medium text-gray-700"
        >
          Filter by Role:
        </label>
        <select
          id="roleFilter"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as UserRole | "all")}
          className="rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          <option value="guest">Guest</option>
        </select>
        {selectedRole !== "all" && (
          <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-800">
            Server-side filtered
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Link
            key={user.id}
            to="/users/$userId"
            params={{ userId: user.id }}
            className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="font-semibold text-gray-900">{user.name}</h3>
            <p className="text-sm text-gray-600">{user.email}</p>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                user.role === "admin"
                  ? "bg-red-100 text-red-800"
                  : user.role === "user"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800"
              }`}
            >
              {user.role}
            </span>
          </Link>
        ))}
      </div>

      {users.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">
            {selectedRole === "all"
              ? "No users yet. Add one to get started!"
              : `No users with role "${selectedRole}" found.`}
          </p>
        </div>
      )}
    </div>
  );
}
