import { HttpResponse, graphql } from "msw";

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

import type { GraphQLHandler } from "msw";
import type { Pet, PetCategory, PetStatus } from "../data/pets";
import type { User, UserRole } from "../data/users";

type BoolExpComparison = {
  _eq?: unknown;
  _neq?: unknown;
  _in?: unknown[];
  _nin?: unknown[];
  _like?: string;
  _ilike?: string;
  _is_null?: boolean;
  _gt?: number | string;
  _gte?: number | string;
  _lt?: number | string;
  _lte?: number | string;
};

type BoolExp = {
  _and?: BoolExp[];
  _or?: BoolExp[];
  _not?: BoolExp;
  [field: string]: BoolExpComparison | BoolExp[] | BoolExp | undefined;
};

// Helper to apply Hasura-style boolean expressions
function applyPetBoolExp(items: Pet[], where: BoolExp | undefined): Pet[] {
  if (!where) return items;

  return items.filter((item) => {
    // Handle _and
    if (where._and && Array.isArray(where._and)) {
      return where._and.every((exp) => applyPetBoolExp([item], exp).length > 0);
    }

    // Handle _or
    if (where._or && Array.isArray(where._or)) {
      return where._or.some((exp) => applyPetBoolExp([item], exp).length > 0);
    }

    // Handle _not
    if (where._not) {
      return applyPetBoolExp([item], where._not).length === 0;
    }

    // Handle field comparisons
    for (const [field, comparison] of Object.entries(where)) {
      if (field.startsWith("_")) continue;
      if (
        !comparison ||
        typeof comparison !== "object" ||
        Array.isArray(comparison)
      )
        continue;

      const value = item[field as keyof Pet];
      const comp = comparison as BoolExpComparison;

      if (comp._eq !== undefined && value !== comp._eq) return false;
      if (comp._neq !== undefined && value === comp._neq) return false;
      if (comp._in !== undefined && !comp._in.includes(value)) return false;
      if (comp._nin?.includes(value)) return false;
      if (
        comp._like !== undefined &&
        typeof value === "string" &&
        !value.includes(comp._like)
      )
        return false;
      if (
        comp._ilike !== undefined &&
        typeof value === "string" &&
        !value.toLowerCase().includes(comp._ilike.toLowerCase())
      )
        return false;
      if (comp._is_null !== undefined) {
        const isNull = value === null || value === undefined;
        if (comp._is_null !== isNull) return false;
      }
    }

    return true;
  });
}

function applyUserBoolExp(items: User[], where: BoolExp | undefined): User[] {
  if (!where) return items;

  return items.filter((item) => {
    // Handle _and
    if (where._and && Array.isArray(where._and)) {
      return where._and.every(
        (exp) => applyUserBoolExp([item], exp).length > 0,
      );
    }

    // Handle _or
    if (where._or && Array.isArray(where._or)) {
      return where._or.some((exp) => applyUserBoolExp([item], exp).length > 0);
    }

    // Handle _not
    if (where._not) {
      return applyUserBoolExp([item], where._not).length === 0;
    }

    // Handle field comparisons
    for (const [field, comparison] of Object.entries(where)) {
      if (field.startsWith("_")) continue;
      if (
        !comparison ||
        typeof comparison !== "object" ||
        Array.isArray(comparison)
      )
        continue;

      const value = item[field as keyof User];
      const comp = comparison as BoolExpComparison;

      if (comp._eq !== undefined && value !== comp._eq) return false;
      if (comp._neq !== undefined && value === comp._neq) return false;
      if (comp._in !== undefined && !comp._in.includes(value)) return false;
      if (comp._nin?.includes(value)) return false;
      if (
        comp._like !== undefined &&
        typeof value === "string" &&
        !value.includes(comp._like)
      )
        return false;
      if (
        comp._ilike !== undefined &&
        typeof value === "string" &&
        !value.toLowerCase().includes(comp._ilike.toLowerCase())
      )
        return false;
      if (comp._is_null !== undefined) {
        const isNull = value === null || value === undefined;
        if (comp._is_null !== isNull) return false;
      }
    }

    return true;
  });
}

type GetPetByIdVariables = { id: string };
type GetPetsVariables = {
  status?: PetStatus;
  category?: PetCategory;
  limit?: number;
  offset?: number;
};
type GetPetsConnectionVariables = {
  status?: PetStatus;
  category?: PetCategory;
  first?: number;
  after?: string;
};
type ListPetsFilteredVariables = {
  where?: BoolExp;
  order_by?: Array<Record<string, string>>;
  limit?: number;
  offset?: number;
};
type GetUserVariables = { id: string };
type ListUsersVariables = {
  role?: UserRole;
  limit?: number;
  offset?: number;
};
type ListUsersFilteredVariables = {
  where?: BoolExp;
  order_by?: Array<Record<string, string>>;
  limit?: number;
  offset?: number;
};
type CreatePetVariables = {
  input: {
    name: string;
    category: PetCategory;
    status: PetStatus;
    tags: string[];
    photoUrl?: string;
  };
};
type UpdatePetVariables = {
  id: string;
  input: {
    name?: string;
    category?: PetCategory;
    status?: PetStatus;
    tags?: string[];
    photoUrl?: string;
  };
};
type DeletePetVariables = { id: string };
type CreateUserVariables = {
  input: {
    email: string;
    name: string;
    role: UserRole;
  };
};
type UpdateUserVariables = {
  id: string;
  input: {
    email?: string;
    name?: string;
    role?: UserRole;
  };
};
type DeleteUserVariables = { id: string };

export const graphqlHandlers: GraphQLHandler[] = [
  // Pet Queries - matching tangrams generated operation names
  graphql.query("GetPets", ({ variables }) => {
    const {
      status,
      category,
      limit = 20,
      offset = 0,
    } = variables as GetPetsVariables;

    let pets: Pet[];
    if (status) {
      pets = getPetsByStatus(status);
    } else if (category) {
      pets = getPetsByCategory(category);
    } else {
      pets = getPets();
    }

    const total = pets.length;
    const paginatedPets = pets.slice(offset, offset + limit);

    return HttpResponse.json({
      data: {
        pets: {
          data: paginatedPets,
          total,
        },
      },
    });
  }),

  graphql.query("GetPetById", ({ variables }) => {
    const { id } = variables as GetPetByIdVariables;
    const pet = getPetById(id);
    return HttpResponse.json({ data: { pet } });
  }),

  graphql.query("GetPetsConnection", ({ variables }) => {
    const {
      status,
      category,
      first = 20,
      after,
    } = variables as GetPetsConnectionVariables;

    let pets: Pet[];
    if (status) {
      pets = getPetsByStatus(status);
    } else if (category) {
      pets = getPetsByCategory(category);
    } else {
      pets = getPets();
    }

    const totalCount = pets.length;

    // Find starting index based on cursor
    let startIndex = 0;
    if (after) {
      const cursorIndex = pets.findIndex((p) => p.id === after);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedPets = pets.slice(startIndex, startIndex + first);
    const hasNextPage = startIndex + first < totalCount;
    const hasPreviousPage = startIndex > 0;

    const edges = paginatedPets.map((pet) => ({
      node: pet,
      cursor: pet.id,
    }));

    return HttpResponse.json({
      data: {
        petsConnection: {
          edges,
          pageInfo: {
            hasNextPage,
            hasPreviousPage,
            startCursor: edges[0]?.cursor ?? null,
            endCursor: edges[edges.length - 1]?.cursor ?? null,
          },
          totalCount,
        },
      },
    });
  }),

  graphql.query("ListPetsFiltered", ({ variables }) => {
    const {
      where,
      limit = 20,
      offset = 0,
    } = variables as ListPetsFilteredVariables;

    let pets = getPets();
    pets = applyPetBoolExp(pets, where);

    const total = pets.length;
    const paginatedPets = pets.slice(offset, offset + limit);

    return HttpResponse.json({
      data: {
        pets_filtered: {
          data: paginatedPets,
          total,
        },
      },
    });
  }),

  graphql.query("GetUser", ({ variables }) => {
    const { id } = variables as GetUserVariables;
    const user = getUserById(id);
    return HttpResponse.json({ data: { user } });
  }),

  graphql.query("ListUsers", ({ variables }) => {
    const { role, limit = 20, offset = 0 } = variables as ListUsersVariables;

    let users: User[] = getUsers();
    if (role) {
      users = users.filter((user) => user.role === role);
    }

    const total = users.length;
    const paginatedUsers = users.slice(offset, offset + limit);

    return HttpResponse.json({
      data: {
        users: {
          data: paginatedUsers,
          total,
        },
      },
    });
  }),

  graphql.query("ListUsersFiltered", ({ variables }) => {
    const {
      where,
      limit = 20,
      offset = 0,
    } = variables as ListUsersFilteredVariables;

    let users = getUsers();
    users = applyUserBoolExp(users, where);

    const total = users.length;
    const paginatedUsers = users.slice(offset, offset + limit);

    return HttpResponse.json({
      data: {
        users_filtered: {
          data: paginatedUsers,
          total,
        },
      },
    });
  }),

  // Mutations
  graphql.mutation("CreatePet", ({ variables }) => {
    const { input } = variables as CreatePetVariables;
    const pet = createPet(input);
    return HttpResponse.json({ data: { createPet: pet } });
  }),

  graphql.mutation("UpdatePet", ({ variables }) => {
    const { id, input } = variables as UpdatePetVariables;
    const pet = updatePet(id, input);
    return HttpResponse.json({ data: { updatePet: pet } });
  }),

  graphql.mutation("DeletePet", ({ variables }) => {
    const { id } = variables as DeletePetVariables;
    const deleted = deletePet(id);
    return HttpResponse.json({ data: { deletePet: deleted } });
  }),

  graphql.mutation("CreateUser", ({ variables }) => {
    const { input } = variables as CreateUserVariables;
    const user = createUser(input);
    return HttpResponse.json({ data: { createUser: user } });
  }),

  graphql.mutation("UpdateUser", ({ variables }) => {
    const { id, input } = variables as UpdateUserVariables;
    const user = updateUser(id, input);
    return HttpResponse.json({ data: { updateUser: user } });
  }),

  graphql.mutation("DeleteUser", ({ variables }) => {
    const { id } = variables as DeleteUserVariables;
    const deleted = deleteUser(id);
    return HttpResponse.json({ data: { deleteUser: deleted } });
  }),
];
