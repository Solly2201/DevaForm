/**
 * Client-side API for character persistence. All responses are validated
 * shapes from the API routes; configuration payloads are re-validated with
 * the schema package on load.
 */
import {
  deserializeConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";

export interface CharacterSummary {
  id: string;
  name: string;
  deity: string;
  updatedAt: string;
  preview: string | null;
}

export interface LoadedCharacter {
  id: string;
  name: string;
  deity: string;
  updatedAt: string;
  config: CharacterConfiguration;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listCharacters(): Promise<CharacterSummary[]> {
  const data = await request<{ characters: CharacterSummary[] }>("/api/characters");
  return data.characters;
}

export async function createCharacter(
  name: string,
  config: CharacterConfiguration,
  preview?: string,
): Promise<{ id: string }> {
  return request<{ id: string }>("/api/characters", {
    method: "POST",
    body: JSON.stringify({ name, config, preview }),
  });
}

export async function saveCharacter(
  id: string,
  name: string,
  config: CharacterConfiguration,
  preview?: string,
): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/characters/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, config, preview }),
  });
}

export async function renameCharacter(id: string, name: string): Promise<void> {
  await request<{ id: string }>(`/api/characters/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export interface SharedCreation {
  id: string;
  name: string;
  deity: string;
  preview: string | null;
  createdAt: string;
  config: CharacterConfiguration;
}

export async function createShare(characterId: string): Promise<{ id: string }> {
  return request<{ id: string }>("/api/shares", {
    method: "POST",
    body: JSON.stringify({ characterId }),
  });
}

export async function loadShare(id: string): Promise<SharedCreation> {
  const data = await request<Omit<SharedCreation, "config"> & { config: unknown }>(
    `/api/shares/${id}`,
  );
  return { ...data, config: deserializeConfiguration(data.config) };
}

export async function loadCharacter(id: string): Promise<LoadedCharacter> {
  const data = await request<{
    id: string;
    name: string;
    deity: string;
    updatedAt: string;
    config: unknown;
  }>(`/api/characters/${id}`);
  return { ...data, config: deserializeConfiguration(data.config) };
}

export async function deleteCharacter(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/characters/${id}`, { method: "DELETE" });
}
