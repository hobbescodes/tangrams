import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { createPetMutationOptions } from "@/generated/api/query/operations";

import type { PetCategory, PetStatus } from "@/generated/api/schema";

export const Route = createFileRoute("/pets/new")({
  component: NewPetComponent,
});

function NewPetComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<PetStatus>("available");
  const [category, setCategory] = useState<PetCategory>("dog");

  const createPetMutation = useMutation({
    ...createPetMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api", "listPets"] });
      navigate({ to: "/pets" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPetMutation.mutate({
      body: {
        name,
        status,
        category,
        tags: [],
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link to="/pets" className="text-sm text-blue-600 hover:underline">
        &larr; Back to Pets
      </Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">Add New Pet</h1>

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
            disabled={createPetMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createPetMutation.isPending ? "Creating..." : "Create Pet"}
          </button>
          <Link
            to="/pets"
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
