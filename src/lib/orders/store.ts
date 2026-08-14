import { mkdir, readFile, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import type { CartItem, CustomerInfo, Order, OrderStatus, PaymentMethod } from "@/lib/types";
import { generateOrderReference } from "./reference";

// Server-only: simple JSON file store for mock orders. Suitable for local/dev
// use on a persistent Node server. Swap for a real database before deploying
// to a serverless/read-only filesystem environment.
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

// Serializes read-modify-write cycles so concurrent requests in this process don't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.catch(() => undefined);
  return result;
}

async function readAll(): Promise<Order[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Order[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(orders: Order[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(orders, null, 2), "utf-8");
}

export type CreateOrderInput = {
  paymentMethod: PaymentMethod;
  customerId?: string;
  customer: CustomerInfo;
  items: CartItem[];
  subtotal: number;
  total: number;
  status: OrderStatus;
};

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  return withLock(async () => {
    const orders = await readAll();
    const order: Order = {
      id: randomUUID(),
      reference: generateOrderReference(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    orders.push(order);
    await writeAll(orders);
    return order;
  });
}

export async function listOrders(): Promise<Order[]> {
  const orders = await readAll();
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrdersByCustomer(customerId: string): Promise<Order[]> {
  const orders = await readAll();
  return orders
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrderByReference(reference: string): Promise<Order | null> {
  const orders = await readAll();
  return orders.find((o) => o.reference === reference.toUpperCase()) ?? null;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const orders = await readAll();
  return orders.find((o) => o.id === id) ?? null;
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | null> {
  return withLock(async () => {
    const orders = await readAll();
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch };
    await writeAll(orders);
    return orders[index];
  });
}

export async function updateOrderByChargeId(
  chargeId: string,
  patch: Partial<Order>
): Promise<Order | null> {
  return withLock(async () => {
    const orders = await readAll();
    const index = orders.findIndex((o) => o.crypto?.chargeId === chargeId);
    if (index === -1) return null;
    orders[index] = { ...orders[index], ...patch };
    await writeAll(orders);
    return orders[index];
  });
}
