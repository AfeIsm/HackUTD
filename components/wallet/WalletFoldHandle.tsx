'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface WalletFoldHandleProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  dur?: number;
  disabled?: boolean;
  scale?: number;
  onDragProgress?: (progress: number | null) => void;
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function WalletFoldHandle({
  open,
  onClose,
  onOpen,
  dur = 900,
  disabled,
  scale = 1,
  onDragProgress,
}: WalletFoldHandleProps) {
  const [flipping, setFlipping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (prevOpen.current !== open) {
      prevOpen.current = open;
      setFlipping(true);
      const timer = setTimeout(() => {
        setFlipping(false);
      }, Math.max(dur, 200));
      return () => clearTimeout(timer);
    }
  }, [open, dur]);

  // Swipe / drag detection on invisible box around button
  const startX = useRef(0);
  const startY = useRef(0);
  const isDraggingRef = useRef(false);
  const activePointerId = useRef<number | null>(null);

  const onDragBoxPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || flipping || e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDraggingRef.current = true;
    activePointerId.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture unsupported
    }
  }, [disabled, flipping]);

  const onDragBoxPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || activePointerId.current !== e.pointerId) return;
    const dy = e.clientY - startY.current;
    const dx = e.clientX - startX.current;

    // Cancel if vertical scroll dominates
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) {
      isDraggingRef.current = false;
      setDragging(false);
      onDragProgress?.(null);
      return;
    }

    const maxDrag = Math.max(140, 240 * scale);

    if (open) {
      // Open -> dragging rightwards folds shut (progress 0 -> 1)
      const p = Math.min(1, Math.max(0, dx / maxDrag));
      if (dx > 4 && !dragging) {
        setDragging(true);
      }
      onDragProgress?.(p);
    } else {
      // Closed -> dragging leftwards unfolds open (progress 1 -> 0)
      const openAmount = Math.min(1, Math.max(0, -dx / maxDrag));
      const p = 1 - openAmount;
      if (dx < -4 && !dragging) {
        setDragging(true);
      }
      onDragProgress?.(p);
    }
  }, [open, scale, dragging, onDragProgress]);

  const onDragBoxPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || activePointerId.current !== e.pointerId) return;
    isDraggingRef.current = false;
    setDragging(false);
    activePointerId.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    const dx = e.clientX - startX.current;
    const maxDrag = Math.max(140, 240 * scale);
    const threshold = Math.min(50, 40 * scale);

    onDragProgress?.(null);

    // When open: dragging rightwards past threshold folds the wallet shut
    if (open) {
      if (dx >= threshold || (dx / maxDrag) >= 0.35) {
        onClose();
      }
    }
    // When closed: dragging leftwards past threshold unfolds the wallet open
    else {
      if (-dx >= threshold || (-dx / maxDrag) >= 0.35) {
        onOpen();
      }
    }
  }, [open, scale, onClose, onOpen, onDragProgress]);

  const onDragBoxPointerCancel = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    setDragging(false);
    activePointerId.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
    onDragProgress?.(null);
  }, [onDragProgress]);

  const handleButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || flipping || dragging) return;
    if (open) onClose();
    else onOpen();
  }, [disabled, flipping, dragging, open, onClose, onOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || flipping || dragging) return;
      if (open) onClose();
      else onOpen();
    }
  }, [disabled, flipping, dragging, open, onClose, onOpen]);

  return (
    <>
      {/* Invisible draggable box around the button: long heightwise, centered around the button */}
      {!flipping && (
        <div
          className={`wallet-drag-box ${open ? 'drag-box-left' : 'drag-box-right'}`}
          onPointerDown={onDragBoxPointerDown}
          onPointerMove={onDragBoxPointerMove}
          onPointerUp={onDragBoxPointerUp}
          onPointerCancel={onDragBoxPointerCancel}
          aria-hidden="true"
        />
      )}

      {/* Spaced-away, subtle, completely stationary, clickable-only button */}
      <button
        type="button"
        draggable={false}
        className={`wallet-edge-tab ${open ? 'tab-left-close' : 'tab-right-open'} ${flipping || dragging ? 'is-flipping' : ''}`}
        onClick={handleButtonClick}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
        disabled={disabled || flipping || dragging}
        aria-label={open ? 'Close wallet' : 'Open wallet'}
        title={open ? 'Close wallet' : 'Open wallet'}
      >
        {open ? <ChevronRight /> : <ChevronLeft />}
      </button>
    </>
  );
}
