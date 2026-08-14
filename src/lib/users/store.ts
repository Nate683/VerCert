import { mkdir, readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import type { Customer } from "@/lib/types";

// Server-only JSON file store for customer accounts. Same local/dev caveat as
// the orders store — swap for a real database before deploying to a
// serverless/read-only filesystem environment.
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.catch(() => undefined);
  return result;
}

async function readAll(): Promise<Customer[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Customer[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(users: Customer[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  marketingOptIn: boolean;
  verificationToken: string;
  verificationTokenExpiresAt: string;
};

export async function createUser(input: CreateUserInput): Promise<Customer> {
  return withLock(async () => {
    const users = await readAll();
    if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new Error("An account with this email already exists.");
    }
    const user: Customer = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      marketingOptIn: input.marketingOptIn,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      verificationToken: input.verificationToken,
      verificationTokenExpiresAt: input.verificationTokenExpiresAt,
    };
    users.push(user);
    await writeAll(users);
    return user;
  });
}

export async function listUsers(): Promise<Customer[]> {
  const users = await readAll();
  return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getUserByEmail(email: string): Promise<Customer | null> {
  const users = await readAll();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function getUserById(id: string): Promise<Customer | null> {
  const users = await readAll();
  return users.find((u) => u.id === id) ?? null;
}

export async function getUserByResetToken(token: string): Promise<Customer | null> {
  const users = await readAll();
  return users.find((u) => u.resetToken === token) ?? null;
}

export async function getUserByVerificationToken(token: string): Promise<Customer | null> {
  const users = await readAll();
  return users.find((u) => u.verificationToken === token) ?? null;
}

export async function updateUser(id: string, patch: Partial<Customer>): Promise<Customer | null> {
  return withLock(async () => {
    const users = await readAll();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...patch };
    await writeAll(users);
    return users[index];
  });
}
