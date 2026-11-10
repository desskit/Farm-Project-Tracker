'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';

export function PrintButton({ label = 'Print / save as PDF' }: { label?: string }) {
  return <span className="no-print"><Button variant="secondary" icon={<Printer />} onClick={() => window.print()}>{label}</Button></span>;
}
