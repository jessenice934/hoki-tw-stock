import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, ChevronDown } from 'lucide-react';
import { User, getInitials } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface ProfileMenuProps {
  user: User;
  onLogout: () => void;
}

interface DropdownPos {
  top: number;
  right: number;
}

export default function ProfileMenu({ user, onLogout }: ProfileMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  const handleOpen = () => {
    updatePos();
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !btnRef.current?.contains(target) &&
        !dropRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePos();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, updatePos]);

  const dropdown = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dropRef}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-64 glass-card p-2 shadow-xl"
        >
          {/* User info */}
          <div className="px-3 py-3 border-b border-gray-100 mb-1">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0', user.avatarColor)}>
                {getInitials(user.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">{t('auth.logout')}</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <motion.button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-gray-200 bg-white hover:bg-slate-50 transition-colors"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold', user.avatarColor)}>
          {getInitials(user.name)}
        </div>
        <span className="text-sm font-medium text-slate-700 max-w-[80px] truncate">
          {user.name}
        </span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </motion.button>

      {createPortal(dropdown, document.body)}
    </>
  );
}
