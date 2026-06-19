import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema/index';
import { syncQueue } from './schema/syncQueue';
import { randomUUID } from 'expo-crypto';

const APP_VARIANT = process.env.APP_VARIANT ?? 'production';
const expo = SQLite.openDatabaseSync(`clinicez_patient_${APP_VARIANT}.db`);

export const originalDb = drizzle(expo, { schema });

const TABLE_TO_ENTITY_TYPE: Record<string, string> = {
  patients: 'patient',
  patient_government_ids: 'patient_government_ids',
  patient_addresses: 'patient_addresses',
  emergency_contacts: 'emergency_contacts',
  patient_healthcare_providers: 'patient_healthcare_providers',
  patient_allergies: 'patient_allergies',
  patient_medications: 'patient_medications',
  patient_surgical_history: 'patient_surgical_history',
  patient_past_illnesses: 'patient_past_illnesses',
  patient_chronic_conditions: 'patient_chronic_conditions',
  patient_disabilities: 'patient_disabilities',
  patient_immunizations_self: 'patient_immunizations_self',
  patient_social_history: 'patient_social_history',
  patient_family_history: 'patient_family_history',
  patient_occupation: 'patient_occupation',
  patient_travel_history: 'patient_travel_history',
  patient_obstetric_profile: 'patient_obstetric_profile',
  patient_pregnancies: 'patient_pregnancies',
  patient_contraceptive_history: 'patient_contraceptive_history',
  patient_male_reproductive: 'patient_male_reproductive',
  patient_dental_vision: 'patient_dental_vision',
  patient_mental_health_profile: 'patient_mental_health_profile',
};

let globalSyncTrigger: (() => void) | null = null;
export function registerSyncTrigger(trigger: (() => void) | null) {
  globalSyncTrigger = trigger;
}

function extractIdFromCondition(cond: any): string | null {
  if (!cond || !Array.isArray(cond.queryChunks)) return null;
  const paramChunk = cond.queryChunks.find((chunk: any) => chunk && chunk.constructor && chunk.constructor.name === 'Param');
  if (paramChunk && paramChunk.value) {
    return String(paramChunk.value);
  }
  for (const chunk of cond.queryChunks) {
    if (chunk && chunk.value !== undefined && typeof chunk.value === 'string') {
      return chunk.value;
    }
  }
  return null;
}

async function handleInterceptWrite(tableName: string, operation: 'create' | 'update' | 'delete', values: any, condition?: any) {
  const entityType = TABLE_TO_ENTITY_TYPE[tableName];
  if (!entityType) return;

  let entityId = values.id || values.clientId;
  
  if (!entityId && condition) {
    entityId = extractIdFromCondition(condition);
  }

  if (!entityId) {
    if (tableName === 'patients') {
      entityId = values.id || (condition ? extractIdFromCondition(condition) : null);
    } else {
      entityId = values.patientId || (condition ? extractIdFromCondition(condition) : null);
    }
  }

  if (!entityId) {
    console.warn(`[DB Interceptor] Could not extract entityId for table ${tableName}, operation ${operation}`);
    return;
  }

  try {
    const now = new Date();
    const syncPayload = {
      ...values,
      clientId: entityId,
      updatedAt: now.toISOString(),
    };

    const syncItem = {
      id: randomUUID(),
      entityType: entityType as any,
      entityId,
      operation,
      payloadJson: JSON.stringify(syncPayload),
      status: 'pending' as const,
      retryCount: 0,
      createdAt: now,
    };

    await originalDb.insert(syncQueue).values(syncItem);
    console.log(`[DB Interceptor] Successfully queued ${operation} for ${entityType} (${entityId})`);
    
    if (globalSyncTrigger) {
      globalSyncTrigger();
    }
  } catch (err) {
    console.error(`[DB Interceptor] Failed to queue write for ${entityType}:`, err);
  }
}

function createQueryProxy(
  builder: any,
  table: any,
  operation: 'create' | 'update',
  values: any,
  condition?: any
): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return function (onfulfilled?: any, onrejected?: any) {
          return target.then(
            async (result: any) => {
              const nameSymbol = Object.getOwnPropertySymbols(table).find(
                (s) => s.description === 'drizzle:Name'
              );
              const tableName = nameSymbol ? table[nameSymbol] : null;
              if (tableName && TABLE_TO_ENTITY_TYPE[tableName]) {
                await handleInterceptWrite(String(tableName), operation, values, condition);
              }
              if (onfulfilled) return onfulfilled(result);
              return result;
            },
            (err: any) => {
              if (onrejected) return onrejected(err);
              throw err;
            }
          );
        };
      }

      if (prop === 'where') {
        return function (cond: any) {
          const nextBuilder = target.where(cond);
          return createQueryProxy(nextBuilder, table, operation, values, cond);
        };
      }

      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return function (...args: any[]) {
          const result = val.apply(target, args);
          // onConflictDoUpdate means the row already exists → this is an update,
          // not a fresh create. Flip the operation so the sync queue sends the
          // correct verb to the backend.
          const effectiveOperation = prop === 'onConflictDoUpdate' ? 'update' : operation;
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            return createQueryProxy(result, table, effectiveOperation, values, condition);
          }
          return result;
        };
      }
      return val;
    }
  });
}

function wrapUpdateBuilder(builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return function (values: any) {
          const nextBuilder = target.set(values);
          return createQueryProxy(nextBuilder, table, 'update', values);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

function wrapInsertBuilder(builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'values') {
        return function (values: any) {
          const nextBuilder = target.values(values);
          return createQueryProxy(nextBuilder, table, 'create', values);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

export const db = new Proxy(originalDb, {
  get(target, prop, receiver) {
    if (prop === 'insert') {
      return function(table: any) {
        const builder = target.insert(table);
        return wrapInsertBuilder(builder, table);
      };
    }
    if (prop === 'update') {
      return function(table: any) {
        const builder = target.update(table);
        return wrapUpdateBuilder(builder, table);
      };
    }
    return Reflect.get(target, prop, receiver);
  }
});
