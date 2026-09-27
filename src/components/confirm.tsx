"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

/** `const ok = await confirm({ title: "حذف الهدف؟" })` — a STRIKE-styled replacement for window.confirm */
export function useConfirm() {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error("useConfirm outside ConfirmProvider");
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false); // a second dialog cancels the first
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const settle = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const danger = opts?.danger ?? true;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => settle(false)}
        title={opts?.title ?? ""}
      >
        {opts && (
          <div className="flex flex-col gap-5 pb-1">
            <div className="flex items-start gap-3">
              <span
                className={`h-11 w-11 shrink-0 rounded-2xl grid place-items-center ${danger ? "bg-error-100 text-error" : "bg-ice-100 text-navy"}`}
              >
                {danger ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
              </span>
              <p className="text-ink-2 text-[15px] leading-relaxed pt-2">
                {opts.message ??
                  (danger ? "هذا الإجراء نهائي وما يمكن التراجع عنه." : "")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-outline"
                onClick={() => settle(false)}
              >
                {opts.cancelText ?? "إلغاء"}
              </button>
              <button
                type="button"
                autoFocus
                className={danger ? "btn-danger-solid" : "btn-primary"}
                onClick={() => settle(true)}
              >
                {opts.confirmText ?? (danger ? "حذف" : "تأكيد")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
