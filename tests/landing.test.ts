import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be declared before importing the module under test.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "test.local" })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${to};307;`;
    throw err;
  }),
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/userVehicle", () => ({
  loadUserContext: vi.fn(),
}));

// loadPublicStats catches DB errors and returns null, so make the query
// reject. This keeps the test offline and isolates Home() from Drizzle/pg.
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => Promise.reject(new Error("no db in tests")),
    }),
  },
}));

import Home from "@/app/page";
import { getSession } from "@/lib/session";
import { loadUserContext } from "@/lib/userVehicle";
import { redirect } from "next/navigation";

type SessionFixture = {
  userId?: string;
  // iron-session mutators that throw in RSC; the page MUST NOT call them.
  // If a future change re-introduces session.destroy() or session.save() in
  // the server component, these mocks blow up and the test fails — matching
  // the production crash we hit in commit 8e240fd.
  destroy: () => void;
  save: () => Promise<void>;
};

function makeSession(userId?: string): SessionFixture {
  return {
    userId,
    destroy: vi.fn(() => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler",
      );
    }),
    save: vi.fn(async () => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler",
      );
    }),
  };
}

const emptySearchParams = Promise.resolve({});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Home (/)", () => {
  it("renders the landing for anonymous visitors", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession() as never);

    const result = await Home({ searchParams: emptySearchParams });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(loadUserContext).not.toHaveBeenCalled();
  });

  it("redirects signed-in users with a valid context to /dashboard", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession("user-1") as never);
    vi.mocked(loadUserContext).mockResolvedValue({
      userId: "user-1",
      email: null,
      userLastSeenAt: null,
      vccApiKey: "k",
      credsFor: () => null,
      vehicles: [{ vin: "v1" } as never],
      activeVehicle: { vin: "v1" } as never,
    });

    await expect(
      Home({ searchParams: emptySearchParams }),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the landing (no redirect, no throw) when signed in but loadUserContext returns null", async () => {
    // Regression: `/` → /dashboard → `/` loop happened when ctx was missing,
    // and a previous fix that called session.destroy() in the server component
    // crashed prod with a 5xx. Both failure modes should be covered here.
    vi.mocked(getSession).mockResolvedValue(makeSession("user-1") as never);
    vi.mocked(loadUserContext).mockResolvedValue(null);

    const result = await Home({ searchParams: emptySearchParams });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders the landing when signed in but loadUserContext rejects", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession("user-1") as never);
    vi.mocked(loadUserContext).mockRejectedValue(new Error("db down"));

    const result = await Home({ searchParams: emptySearchParams });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders the landing when signed in but the user has no active vehicle", async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession("user-1") as never);
    vi.mocked(loadUserContext).mockResolvedValue({
      userId: "user-1",
      email: null,
      userLastSeenAt: null,
      vccApiKey: "k",
      credsFor: () => null,
      vehicles: [],
      activeVehicle: null,
    });

    const result = await Home({ searchParams: emptySearchParams });

    expect(result).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
