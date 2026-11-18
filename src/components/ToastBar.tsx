import { useEffect, useState } from 'react';
import { getToast, hideToast, onToast, type Toast } from '../lib/toast';
import { X } from './icons';

/** แถบแจ้งเตือนด้านล่างจอ (ดู lib/toast.ts) */
export default function ToastBar() {
  const [toast, setToast] = useState<Toast | null>(getToast);
  useEffect(() => onToast(setToast), []);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span className="toast-text">{toast.text}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            hideToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" aria-label="ปิด" onClick={hideToast}>
        <X width={12} height={12} />
      </button>
    </div>
  );
}
