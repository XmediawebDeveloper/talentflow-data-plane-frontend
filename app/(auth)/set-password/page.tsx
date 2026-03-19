import { Suspense } from 'react';
import SetPassword from '@/components/auth/SetPassword';
import { Loader2 } from 'lucide-react';

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <SetPassword />
    </Suspense>
  );
}
