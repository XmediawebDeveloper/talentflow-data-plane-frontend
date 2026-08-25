import { useState } from 'react';
import { toast } from '@/components/ui/enhanced-toast';

/**
 * Hook for copying text to clipboard with visual feedback
 * @returns [copiedText, copyToClipboard function]
 */
export function useCopyToClipboard() {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = async (text: string, successMessage?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      
      // Show success toast
      toast.success({
        title: successMessage || 'Copied to clipboard!',
        description: text.length > 50 ? `${text.substring(0, 50)}...` : text,
      });

      // Reset after 2 seconds
      setTimeout(() => setCopiedText(null), 2000);
      
      return true;
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error({
        title: 'Failed to copy',
        description: 'Please try again or copy manually.',
      });
      return false;
    }
  };

  return [copiedText, copyToClipboard] as const;
}
