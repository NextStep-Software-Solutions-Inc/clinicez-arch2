import { syncQueue } from './schema/syncQueue';
import { randomUUID } from 'expo-crypto';
import { toBackendBloodType } from '../services/api/patientApi';
import { getTableName } from 'drizzle-orm';

export const TABLE_TO_ENTITY_TYPE: Record<string, string> = {
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
  patient_ncd_questionnaire: 'patient_ncd_questionnaire',
};

export const SINGLETON_TABLES = new Set([
  'patient_social_history',
  'patient_occupation',
  'patient_dental_vision',
  'patient_mental_health_profile',
  'patient_male_reproductive',
  'patient_obstetric_profile',
  'patient_ncd_questionnaire',
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidGuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

export function tableNameToDrizzleQueryKey(tableName: string): string {
  return tableName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

let globalSyncTrigger: (() => void) | null = null;
export function registerSyncTrigger(trigger: (() => void) | null) {
  globalSyncTrigger = trigger;
}

function extractIdFromCondition(cond: any): string | null {
  if (!cond || !Array.isArray(cond.queryChunks)) return null;
  const paramChunk = cond.queryChunks.find((chunk: any) => chunk && chunk.constructor && chunk.constructor.name === 'Param');
  if (paramChunk && paramChunk.value && typeof paramChunk.value === 'string') {
    return String(paramChunk.value);
  }
  for (const chunk of cond.queryChunks) {
    if (chunk && chunk.value !== undefined && typeof chunk.value === 'string') {
      return chunk.value;
    }
  }
  return null;
}

async function handleInterceptWrite(
  originalDb: any,
  tableName: string,
  operation: 'create' | 'update' | 'delete',
  values: any,
  condition?: any
) {
  const entityType = TABLE_TO_ENTITY_TYPE[tableName];
  if (!entityType) return;

  const now = new Date();
  const isSingleton = SINGLETON_TABLES.has(tableName);

  // Extract patientId
  let targetPatientId = values?.patientId;
  if (!targetPatientId && condition) {
    const condId = extractIdFromCondition(condition);
    if (condId && (tableName.startsWith('patient_') || tableName === 'emergency_contacts')) {
      targetPatientId = condId;
    }
  }
  if (!targetPatientId && tableName === 'patients') {
    targetPatientId = values?.id || (condition ? extractIdFromCondition(condition) : null);
  }

  try {
    // ── 1. patient_government_ids decomposition ──────────────────────────────
    if (tableName === 'patient_government_ids') {
      const patientId = targetPatientId || values?.id;
      let idMap: Record<string, { id: string; clientId: string }> = {};
      try {
        let mapStr = values?.serverId;
        if (!mapStr && originalDb.query?.patientGovernmentIds?.findFirst) {
          const existingRow = await originalDb.query.patientGovernmentIds.findFirst({
            where: (t: any, { eq }: any) => eq(t.patientId, patientId),
          });
          mapStr = existingRow?.serverId;
        }
        if (mapStr) {
          idMap = typeof mapStr === 'string' ? JSON.parse(mapStr) : mapStr;
        }
      } catch (err) {
        console.warn('[DB Interceptor] Failed to read existing serverId map for government IDs:', err);
      }

      const idDefs: Array<{
        idType: 'PhilHealth' | 'SSS' | 'GSIS' | 'PagIbig' | 'TIN' | 'SeniorCitizen' | 'PWD' | 'HMO';
        idNumber: string | null | undefined;
        extra?: Record<string, any>;
      }> = [
        {
          idType: 'PhilHealth',
          idNumber: values.philhealthId,
          extra: {
            philhealthCategory: values.philhealthCategory || null,
            sponsorPin: values.sponsorPin || null,
            sponsorLastName: values.sponsorLastName || null,
            sponsorFirstName: values.sponsorFirstName || null,
            sponsorMiddleName: values.sponsorMiddleName || null,
            sponsorSuffix: values.sponsorSuffix || null,
            sponsorDob: values.sponsorDob || null,
            sponsorRelationship: values.sponsorRelationship || null,
          },
        },
        { idType: 'SSS', idNumber: values.sssNumber },
        { idType: 'GSIS', idNumber: values.gsisNumber },
        { idType: 'PagIbig', idNumber: values.pagibigId },
        { idType: 'TIN', idNumber: values.tin },
        { idType: 'SeniorCitizen', idNumber: values.seniorCitizenId },
        { idType: 'PWD', idNumber: values.pwdIdNumber },
        { idType: 'HMO', idNumber: values.hmoPolicyNumber },
      ];

      let queuedCount = 0;
      for (const def of idDefs) {
        const existingServer = idMap[def.idType] || idMap[def.idType.toLowerCase()];
        const trimmedNumber = typeof def.idNumber === 'string' ? def.idNumber.trim() : (def.idNumber ? String(def.idNumber) : '');

        if (trimmedNumber) {
          const isUpdate = Boolean(existingServer?.id && isValidGuid(existingServer.id));
          const clientUuid = (existingServer?.clientId && isValidGuid(existingServer.clientId))
            ? existingServer.clientId
            : randomUUID();

          const itemPayload = {
            patientId,
            idType: def.idType,
            idNumber: trimmedNumber,
            clientId: clientUuid,
            updatedAt: now.toISOString(),
            ...(def.extra || {}),
          };

          const syncItem = {
            id: randomUUID(),
            entityType: 'patient_government_ids' as const,
            entityId: isUpdate ? existingServer!.id : undefined,
            operation: isUpdate ? ('update' as const) : ('create' as const),
            payloadJson: JSON.stringify(itemPayload),
            status: 'pending' as const,
            retryCount: 0,
            createdAt: now,
          };
          await originalDb.insert(syncQueue).values(syncItem);
          queuedCount++;
        } else if (existingServer?.id && isValidGuid(existingServer.id)) {
          const syncItem = {
            id: randomUUID(),
            entityType: 'patient_government_ids' as const,
            entityId: existingServer.id,
            operation: 'delete' as const,
            payloadJson: null,
            status: 'pending' as const,
            retryCount: 0,
            createdAt: now,
          };
          await originalDb.insert(syncQueue).values(syncItem);
          queuedCount++;
        }
      }

      console.log(`[DB Interceptor] Successfully queued ${queuedCount} typed items for patient_government_ids (${patientId})`);
      if (globalSyncTrigger) globalSyncTrigger();
      return;
    }

    // ── 2. SINGLETON TABLES ──────────────────────────────────────────────────
    if (isSingleton) {
      let existingLocalRow: any = null;
      try {
        const queryName = tableNameToDrizzleQueryKey(tableName);
        if (originalDb.query?.[queryName]?.findFirst) {
          existingLocalRow = await originalDb.query[queryName].findFirst({
            where: (t: any, { eq }: any) => eq(t.patientId, targetPatientId),
          });
        }
      } catch (err) {
        console.warn(`[DB Interceptor] Failed to query existing row for ${tableName}:`, err);
      }

      const isSyncedOnServer = Boolean(
        existingLocalRow?.syncedAt ||
        (existingLocalRow?.id && isValidGuid(existingLocalRow.id) && existingLocalRow.id !== targetPatientId && !existingLocalRow.id.startsWith('demo:'))
      );

      let effectiveOperation: 'create' | 'update' | 'delete' = values?.deletedAt ? 'delete' : operation;
      if (effectiveOperation === 'update' && !isSyncedOnServer) {
        effectiveOperation = 'create';
      }

      const prevTs = existingLocalRow?.updatedAt ? new Date(existingLocalRow.updatedAt).getTime() : 0;
      const safeUpdatedTime = Math.max(Date.now(), prevTs + 1000);

      const clientUuid = (existingLocalRow?.clientId && isValidGuid(existingLocalRow.clientId))
        ? existingLocalRow.clientId
        : (existingLocalRow?.id && isValidGuid(existingLocalRow.id) && !existingLocalRow.id.startsWith('demo:'))
          ? existingLocalRow.id
          : randomUUID();

      const syncPayload: Record<string, any> = {
        ...values,
        patientId: targetPatientId,
        clientId: clientUuid,
        updatedAt: new Date(safeUpdatedTime).toISOString(),
      };
      delete syncPayload.syncedAt;

      let entityIdForSync: string | undefined = undefined;
      if (
        effectiveOperation === 'update' &&
        isSyncedOnServer &&
        existingLocalRow?.id &&
        isValidGuid(existingLocalRow.id) &&
        existingLocalRow.id !== targetPatientId &&
        !existingLocalRow.id.startsWith('demo:')
      ) {
        entityIdForSync = existingLocalRow.id;
      }

      const syncItem = {
        id: randomUUID(),
        entityType: entityType as any,
        entityId: entityIdForSync,
        operation: effectiveOperation,
        payloadJson: effectiveOperation === 'delete' ? null : JSON.stringify(syncPayload),
        status: 'pending' as const,
        retryCount: 0,
        createdAt: now,
      };

      await originalDb.insert(syncQueue).values(syncItem);
      console.log(`[DB Interceptor] Queued ${effectiveOperation} for singleton ${entityType} (patientId=${targetPatientId}, entityId=${entityIdForSync || 'null'})`);
      if (globalSyncTrigger) globalSyncTrigger();
      return;
    }

    // ── 3. patients table ───────────────────────────────────────────────────
    if (tableName === 'patients') {
      const pId = targetPatientId || values?.id;
      if (!pId) return;

      const effectiveOperation: 'create' | 'update' | 'delete' = values?.deletedAt ? 'delete' : operation;
      const syncPayload: Record<string, any> = {
        ...values,
        clientId: pId,
        updatedAt: now.toISOString(),
      };
      if (values?.dob !== undefined && syncPayload.dateOfBirth === undefined) {
        syncPayload.dateOfBirth = values.dob;
      }
      if (values?.bloodType !== undefined) {
        syncPayload.bloodType = toBackendBloodType(values.bloodType);
      }
      delete syncPayload.syncedAt;

      const syncItem = {
        id: randomUUID(),
        entityType: 'patient' as const,
        entityId: isValidGuid(pId) ? pId : undefined,
        operation: effectiveOperation,
        payloadJson: effectiveOperation === 'delete' ? null : JSON.stringify(syncPayload),
        status: 'pending' as const,
        retryCount: 0,
        createdAt: now,
      };

      await originalDb.insert(syncQueue).values(syncItem);
      console.log(`[DB Interceptor] Queued ${effectiveOperation} for patient (${pId})`);
      if (globalSyncTrigger) globalSyncTrigger();
      return;
    }

    // ── 4. LIST TABLES ──────────────────────────────────────────────────────
    let rawEntityId = values?.id || values?.clientId;
    if (!rawEntityId && condition) {
      rawEntityId = extractIdFromCondition(condition);
    }

    let existingItem: any = null;
    try {
      const queryName = tableNameToDrizzleQueryKey(tableName);
      if (rawEntityId && originalDb.query?.[queryName]?.findFirst) {
        existingItem = await originalDb.query[queryName].findFirst({
          where: (t: any, { eq }: any) => eq(t.id, rawEntityId),
        });
      }
    } catch (err) {
      console.warn(`[DB Interceptor] Failed to query existing item for ${tableName}:`, err);
    }

    const isServerItem = Boolean(
      existingItem?.serverId ||
      existingItem?.syncedAt
    );

    let effectiveOperation: 'create' | 'update' | 'delete' = values?.deletedAt ? 'delete' : operation;
    if (effectiveOperation === 'update' && !isServerItem) {
      effectiveOperation = 'create';
    }

    const prevTs = existingItem?.updatedAt ? new Date(existingItem.updatedAt).getTime() : 0;
    const safeUpdatedTime = Math.max(Date.now(), prevTs + 1000);

    const clientUuid = (existingItem?.clientId && isValidGuid(existingItem.clientId))
      ? existingItem.clientId
      : (existingItem?.id && !isServerItem && isValidGuid(existingItem.id) && !existingItem.id.startsWith('demo:'))
        ? existingItem.id
        : (rawEntityId && !isServerItem && isValidGuid(rawEntityId) && !rawEntityId.startsWith('demo:'))
          ? rawEntityId
          : randomUUID();

    const syncPayload: Record<string, any> = {
      ...values,
      patientId: targetPatientId || existingItem?.patientId,
      clientId: clientUuid,
      updatedAt: new Date(safeUpdatedTime).toISOString(),
    };
    delete syncPayload.syncedAt;
    delete syncPayload.serverId;

    let entityIdForSync: string | undefined = undefined;
    if (effectiveOperation !== 'create' && isServerItem) {
      entityIdForSync = existingItem?.serverId || (isValidGuid(rawEntityId) && !rawEntityId.startsWith('demo:') ? rawEntityId : undefined);
    }

    const syncItem = {
      id: randomUUID(),
      entityType: entityType as any,
      entityId: entityIdForSync || clientUuid,
      operation: effectiveOperation,
      payloadJson: effectiveOperation === 'delete' ? null : JSON.stringify(syncPayload),
      status: 'pending' as const,
      retryCount: 0,
      createdAt: now,
    };

    await originalDb.insert(syncQueue).values(syncItem);
    console.log(`[DB Interceptor] Queued ${effectiveOperation} for list ${entityType} (entityId=${entityIdForSync || 'null'})`);
    if (globalSyncTrigger) globalSyncTrigger();
  } catch (err) {
    console.error(`[DB Interceptor] Failed to queue write for ${entityType}:`, err);
  }
}

function createQueryProxy(
  originalDb: any,
  builder: any,
  table: any,
  operation: 'create' | 'update' | 'delete',
  values: any,
  condition?: any
): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return function (onfulfilled?: any, onrejected?: any) {
          return target.then(
            async (result: any) => {
              let tableName: string | null = null;
              try {
                tableName = getTableName(table);
              } catch {
                const nameSymbol = Object.getOwnPropertySymbols(table).find(
                  (s) => s.description === 'drizzle:Name'
                );
                tableName = nameSymbol ? table[nameSymbol] : null;
              }
              if (tableName && TABLE_TO_ENTITY_TYPE[tableName]) {
                await handleInterceptWrite(originalDb, String(tableName), operation, values, condition);
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
          return createQueryProxy(originalDb, nextBuilder, table, operation, values, cond);
        };
      }

      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return function (...args: any[]) {
          const result = val.apply(target, args);
          const effectiveOperation = prop === 'onConflictDoUpdate' ? 'update' : operation;
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            return createQueryProxy(originalDb, result, table, effectiveOperation, values, condition);
          }
          return result;
        };
      }
      return val;
    }
  });
}

function wrapUpdateBuilder(originalDb: any, builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return function (values: any) {
          const nextBuilder = target.set(values);
          return createQueryProxy(originalDb, nextBuilder, table, 'update', values);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

function wrapInsertBuilder(originalDb: any, builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'values') {
        return function (values: any) {
          const nextBuilder = target.values(values);
          return createQueryProxy(originalDb, nextBuilder, table, 'create', values);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

function wrapDeleteBuilder(originalDb: any, builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'where') {
        return function (cond: any) {
          const nextBuilder = target.where(cond);
          return createQueryProxy(originalDb, nextBuilder, table, 'delete', {}, cond);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

export function createDbWithInterceptor<T extends object>(originalDb: T): T {
  return new Proxy(originalDb, {
    get(target, prop, receiver) {
      if (prop === 'insert') {
        return function (table: any) {
          const builder = (target as any).insert(table);
          return wrapInsertBuilder(target, builder, table);
        };
      }
      if (prop === 'update') {
        return function (table: any) {
          const builder = (target as any).update(table);
          return wrapUpdateBuilder(target, builder, table);
        };
      }
      if (prop === 'delete') {
        return function (table: any) {
          const builder = (target as any).delete(table);
          return wrapDeleteBuilder(target, builder, table);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as T;
}
