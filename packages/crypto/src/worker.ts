/**
 * @vaultguard/crypto — Dedicated KDF Web Worker Entry (`worker.ts`)
 * Message protocol:
 *   Request:  { id: string, type: 'derive', payload: { password: Uint8Array, salt: Uint8Array, params: KdfParams } }
 *   Response: { id: string, type: 'success', result: Uint8Array } | { id: string, type: 'error', code: string }
 * Uses WorkerSerialQueue internally via deriveMasterKEK. Zero DOM access, zero setTimeout.
 */

import sodium from 'libsodium-wrappers-sumo';
import { VaultGuardError, KdfParams } from '@vaultguard/shared';
import { deriveMasterKEK } from './kdf.js';

export interface WorkerRequest {
  id: string;
  type: 'derive';
  payload: {
    password: Uint8Array;
    salt: Uint8Array;
    params: KdfParams;
  };
}

export interface WorkerSuccessResponse {
  id: string;
  type: 'success';
  result: Uint8Array;
}

export interface WorkerErrorResponse {
  id: string;
  type: 'error';
  code: string;
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

export async function handleWorkerMessage(msg: WorkerRequest): Promise<WorkerResponse> {
  await sodium.ready;
  if (!msg || typeof msg.id !== 'string' || msg.type !== 'derive' || !msg.payload) {
    return {
      id: msg?.id ?? 'unknown',
      type: 'error',
      code: 'ERR_INVALID_WORKER_MESSAGE',
    };
  }
  const passwordCopy = new Uint8Array(msg.payload.password);
  try {
    const derivedKek = await deriveMasterKEK(
      passwordCopy,
      msg.payload.salt,
      msg.payload.params
    );
    return {
      id: msg.id,
      type: 'success',
      result: derivedKek,
    };
  } catch (err) {
    const code =
      err instanceof VaultGuardError
        ? err.code
        : err instanceof Error
        ? err.message
        : 'ERR_KDF_FAILED';
    return {
      id: msg.id,
      type: 'error',
      code,
    };
  } finally {
    sodium.memzero(passwordCopy);
  }
}

// Attach message listener when running inside a dedicated Web Worker scope
if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  (self as any).addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    void handleWorkerMessage(event.data).then(response => {
      (self as any).postMessage(response);
    });
  });
}
