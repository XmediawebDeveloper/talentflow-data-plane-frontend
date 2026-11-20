/**
 * Pre-action unit check (UN02) for operations that consume units.
 *
 * Asks the backend whether the tenant can cover `units` of `unitType` before a
 * job starts, so a bulk run the pool can't afford is stopped up front instead
 * of running and failing item by item. The backend still enforces units on the
 * action itself — so if this check can't be made (network / server error) it
 * lets the action through rather than blocking the user.
 */
import { unitPoolService, UnitType, UNIT_TYPE_NAMES } from './unitPoolService';

export class InsufficientUnitsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientUnitsError';
  }
}

export async function ensureUnitsAvailable(
  unitType: UnitType,
  units: number,
  actionType: 'resume_scoring' | 'assessment' | 'ai_interview',
  entityId?: string,
): Promise<void> {
  let result: Awaited<ReturnType<typeof unitPoolService.validateBeforeAction>>;
  try {
    result = await unitPoolService.validateBeforeAction({
      unit_type: unitType,
      units_required: Math.max(1, Math.ceil(units)),
      action_type: actionType,
      entity_id: entityId,
    });
  } catch {
    return; // check unavailable — the backend decides on the action itself
  }
  if (result.can_proceed) return;
  throw unitRefusalError(result, unitType);
}

/** The error a refused unit check shows — shared by ensureUnitsAvailable and
 *  callers whose action ran the same check server-side (POST /scoring/bulk-async
 *  with `validate_units` returns that check as `unit_check`). */
export function unitRefusalError(
  result: Awaited<ReturnType<typeof unitPoolService.validateBeforeAction>>,
  unitType: UnitType,
): InsufficientUnitsError {
  const name = result.unit_name || UNIT_TYPE_NAMES[unitType];
  const message =
    result.error === 'INSUFFICIENT_UNITS'
      ? `Not enough ${name} units: ${result.units_available} available, ${result.units_required} needed. Select fewer items or add units.`
      : result.error === 'TENANT_SUSPENDED'
        ? 'Your organization account is suspended. Please contact support.'
        : result.error === 'TENANT_EXPIRED'
          ? 'Your subscription has expired. Please contact your administrator to renew.'
          : result.message || `Not enough ${name} units for this action.`;
  return new InsufficientUnitsError(result.action_required ? `${message} ${result.action_required}` : message);
}
