/**
 * useUnitValidation Hook - UN02
 * Pre-action validation for unit-consuming operations
 */

import { useState, useCallback } from 'react';
import { unitPoolService, UnitType } from '@/lib/services/unitPoolService';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';

export interface ValidationResult {
  valid: boolean;
  can_proceed: boolean;
  unit_type: UnitType;
  unit_name: string;
  units_required: number;
  units_available: number;
  tenant_status?: string;
  error?: string;
  message: string;
  action_required?: string;
}

export interface UseUnitValidationReturn {
  isValidating: boolean;
  validationResult: ValidationResult | null;
  validateBeforeAction: (
    unitType: UnitType,
    actionType: string,
    unitsRequired?: number,
    entityId?: string
  ) => Promise<boolean>;
  checkAvailability: (unitType: UnitType, unitsRequired?: number) => Promise<boolean>;
  reset: () => void;
}

/**
 * Hook for validating unit availability before starting operations
 *
 * @example
 * ```tsx
 * const { validateBeforeAction, isValidating } = useUnitValidation();
 *
 * const handleScore = async () => {
 *   const canProceed = await validateBeforeAction('RS', 'resume_scoring');
 *   if (canProceed) {
 *     // Proceed with scoring
 *   }
 * };
 * ```
 */
export function useUnitValidation(): UseUnitValidationReturn {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const validateBeforeAction = useCallback(
    async (
      unitType: UnitType,
      actionType: string,
      unitsRequired: number = 1,
      entityId?: string
    ): Promise<boolean> => {
      setIsValidating(true);
      setValidationResult(null);

      try {
        const result = await unitPoolService.validateBeforeAction({
          unit_type: unitType,
          units_required: unitsRequired,
          action_type: actionType,
          entity_id: entityId,
        });

        setValidationResult(result);

        if (!result.can_proceed) {
          // Show user-friendly error message
          const errorMessages = {
            INSUFFICIENT_UNITS: `Insufficient ${result.unit_name} units. Available: ${result.units_available}, Required: ${result.units_required}`,
            TENANT_SUSPENDED: 'Your organization account is suspended. Please contact support.',
            TENANT_EXPIRED: 'Your subscription has expired. Please contact your administrator to renew.',
          };

          const message = errorMessages[result.error as keyof typeof errorMessages] || result.message;

          toast.error(message, {
            description: result.action_required,
            duration: 5000,
          });

          return false;
        }

        return true;
      } catch (error: any) {
        console.error('Unit validation error:', error);
        showErrorToast(error, "Couldn't check your unit balance");
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  const checkAvailability = useCallback(
    async (unitType: UnitType, unitsRequired: number = 1): Promise<boolean> => {
      setIsValidating(true);

      try {
        const result = await unitPoolService.checkAvailability(unitType, unitsRequired);

        if (!result.available) {
          toast.warning(`Insufficient ${unitType} units`, {
            description: result.message || `You need ${unitsRequired} units but only have ${result.units_available}`,
          });
          return false;
        }

        return true;
      } catch (error: any) {
        console.error('Availability check error:', error);
        showErrorToast(error, "Couldn't check your unit balance");
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setValidationResult(null);
    setIsValidating(false);
  }, []);

  return {
    isValidating,
    validationResult,
    validateBeforeAction,
    checkAvailability,
    reset,
  };
}

export default useUnitValidation;
