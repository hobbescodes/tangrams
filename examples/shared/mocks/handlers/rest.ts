import { HttpResponse, http } from "msw";

import {
  createPet,
  deletePet,
  getPetById,
  getPets,
  getPetsByCategory,
  getPetsByStatus,
  updatePet,
} from "../data/pets";
import {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser,
} from "../data/users";

import type { HttpHandler } from "msw";
import type { PetCategory, PetStatus } from "../data/pets";
import type { UserRole } from "../data/users";

const API_BASE = "http://localhost:3000/api";

export const restHandlers: HttpHandler[] = [
  // Pets
  http.get(`${API_BASE}/pets`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") as PetStatus | null;
    const category = url.searchParams.get("category") as PetCategory | null;
    const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
    const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10);

    let pets = getPets();
    if (status) {
      pets = getPetsByStatus(status);
    } else if (category) {
      pets = getPetsByCategory(category);
    }

    const total = pets.length;
    const paginatedPets = pets.slice(offset, offset + limit);

    return HttpResponse.json({
      data: paginatedPets,
      total,
    });
  }),

  http.get(`${API_BASE}/pets/:petId`, ({ params }) => {
    const { petId } = params as { petId: string };
    const pet = getPetById(petId);

    if (!pet) {
      return HttpResponse.json(
        { message: "Pet not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return HttpResponse.json(pet);
  }),

  http.post(`${API_BASE}/pets`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      category: PetCategory;
      status: PetStatus;
      tags: string[];
      photoUrl?: string;
    };

    if (!body.name || !body.category || !body.status || !body.tags) {
      return HttpResponse.json(
        { message: "Invalid input", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const pet = createPet({
      name: body.name,
      category: body.category,
      status: body.status,
      tags: body.tags,
      photoUrl: body.photoUrl,
    });

    return HttpResponse.json(pet, { status: 201 });
  }),

  http.put(`${API_BASE}/pets/:petId`, async ({ params, request }) => {
    const { petId } = params as { petId: string };
    const body = (await request.json()) as {
      name?: string;
      category?: PetCategory;
      status?: PetStatus;
      tags?: string[];
      photoUrl?: string;
    };

    const pet = updatePet(petId, body);

    if (!pet) {
      return HttpResponse.json(
        { message: "Pet not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return HttpResponse.json(pet);
  }),

  http.delete(`${API_BASE}/pets/:petId`, ({ params }) => {
    const { petId } = params as { petId: string };
    const deleted = deletePet(petId);

    if (!deleted) {
      return HttpResponse.json(
        { message: "Pet not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),

  // Users
  http.get(`${API_BASE}/users`, ({ request }) => {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") as UserRole | null;
    const limit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
    const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10);

    let users = getUsers();
    if (role) {
      users = users.filter((user) => user.role === role);
    }

    const total = users.length;
    const paginatedUsers = users.slice(offset, offset + limit);

    return HttpResponse.json({
      data: paginatedUsers,
      total,
    });
  }),

  http.get(`${API_BASE}/users/:userId`, ({ params }) => {
    const { userId } = params as { userId: string };
    const user = getUserById(userId);

    if (!user) {
      return HttpResponse.json(
        { message: "User not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return HttpResponse.json(user);
  }),

  http.post(`${API_BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      name: string;
      role: UserRole;
    };

    if (!body.email || !body.name || !body.role) {
      return HttpResponse.json(
        { message: "Invalid input", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const user = createUser({
      email: body.email,
      name: body.name,
      role: body.role,
    });

    return HttpResponse.json(user, { status: 201 });
  }),

  http.put(`${API_BASE}/users/:userId`, async ({ params, request }) => {
    const { userId } = params as { userId: string };
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      role?: UserRole;
    };

    const user = updateUser(userId, body);

    if (!user) {
      return HttpResponse.json(
        { message: "User not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return HttpResponse.json(user);
  }),

  http.delete(`${API_BASE}/users/:userId`, ({ params }) => {
    const { userId } = params as { userId: string };
    const deleted = deleteUser(userId);

    if (!deleted) {
      return HttpResponse.json(
        { message: "User not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return new HttpResponse(null, { status: 204 });
  }),
];
