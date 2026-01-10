'use client';

/**
 * AddSeatsModal Component
 * Allows purchasing additional user seat credits as an addon
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Plus,
  Minus,
  ShoppingCart,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Loader2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface AddSeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSeats: number;
  maxSeats: number;
  planName: string;
  onSuccess?: () => void;
}

interface SeatPricing {
  price_per_seat: number;
  currency: string;
  min_seats: number;
  max_seats: number;
}

export default function AddSeatsModal({
  isOpen,
  onClose,
  currentSeats,
  maxSeats,
  planName,
  onSuccess
}: AddSeatsModalProps) {
  const [seatsToAdd, setSeatsToAdd] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [pricing, setPricing] = useState<SeatPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPricing();
      setSeatsToAdd(1);
      setError(null);
    }
  }, [isOpen]);

  const loadPricing = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/addons/seat-pricing`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPricing(data.data || data);
      } else {
        // Use default pricing if API not available
        setPricing({
          price_per_seat: 10,
          currency: 'USD',
          min_seats: 1,
          max_seats: 50,
        });
      }
    } catch (err) {
      console.error('Failed to load seat pricing:', err);
      // Use default pricing
      setPricing({
        price_per_seat: 10,
        currency: 'USD',
        min_seats: 1,
        max_seats: 50,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (seatsToAdd < 1) {
      setError('Please select at least 1 seat to add');
      return;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/addons/purchase-seats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: seatsToAdd,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail?.message || data.detail || 'Failed to purchase seats');
      }

      toast.success(`Successfully added ${seatsToAdd} seat${seatsToAdd > 1 ? 's' : ''} to your account!`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to purchase seats. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const incrementSeats = () => {
    if (pricing && seatsToAdd < pricing.max_seats) {
      setSeatsToAdd(prev => prev + 1);
    }
  };

  const decrementSeats = () => {
    if (seatsToAdd > 1) {
      setSeatsToAdd(prev => prev - 1);
    }
  };

  const totalPrice = pricing ? (seatsToAdd * pricing.price_per_seat).toFixed(2) : '0.00';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Add User Seats</h2>
                <p className="text-sm text-blue-100">Expand your team capacity</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Current Status */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Current Plan</span>
                  <span className="text-sm font-medium text-gray-900">{planName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Active Users</span>
                  <span className="text-sm font-medium text-gray-900">
                    {currentSeats} / {maxSeats === -1 ? '∞' : maxSeats} seats
                  </span>
                </div>
                {currentSeats >= maxSeats && maxSeats !== -1 && (
                  <div className="mt-3 flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">Seat limit reached</span>
                  </div>
                )}
              </div>

              {/* Seat Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Number of seats to add
                </label>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={decrementSeats}
                    disabled={seatsToAdd <= 1}
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="w-24 text-center">
                    <input
                      type="number"
                      min={1}
                      max={pricing?.max_seats || 50}
                      value={seatsToAdd}
                      onChange={(e) => setSeatsToAdd(Math.max(1, Math.min(pricing?.max_seats || 50, parseInt(e.target.value) || 1)))}
                      className="w-full text-center text-3xl font-bold text-gray-900 border-0 focus:ring-0 bg-transparent"
                    />
                    <span className="text-sm text-gray-500">seat{seatsToAdd > 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={incrementSeats}
                    disabled={pricing ? seatsToAdd >= pricing.max_seats : false}
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Pricing */}
              {pricing && (
                <div className="bg-blue-50 rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-blue-700">Price per seat</span>
                    <span className="text-sm font-medium text-blue-900">
                      ${pricing.price_per_seat.toFixed(2)} {pricing.currency}/month
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                    <span className="text-base font-medium text-blue-800">Total</span>
                    <span className="text-2xl font-bold text-blue-900">
                      ${totalPrice}
                      <span className="text-sm font-normal text-blue-700">/month</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg mb-6">
                <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-600">
                  Additional seats will be available immediately after purchase.
                  You'll be charged on your next billing cycle.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurchase}
                  disabled={isPurchasing || seatsToAdd < 1}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isPurchasing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Add {seatsToAdd} Seat{seatsToAdd > 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
