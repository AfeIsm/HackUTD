'use client';

import { useEffect, useId, useRef } from 'react';
import { MAX_PURCHASES } from '@/lib/engine/basket';
import { addDays } from '@/lib/engine/dates';
import { input } from '@/components/ui';
import './PurchaseListEditor.css';

export type PurchaseDraft = {
  id: string;
  label: string;
  cost: string;
  date: string;
};

export function PurchaseListEditor({ items, onChange, asOf }: {
  items: PurchaseDraft[];
  onChange: (items: PurchaseDraft[]) => void;
  asOf: string;
}) {
  const fieldPrefix = useId();
  const nextId = useRef(0);
  const previousCount = useRef(items.length);
  const nameInputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (items.length > previousCount.current) {
      const newest = items.at(-1);
      if (newest) nameInputs.current.get(newest.id)?.focus();
    }
    previousCount.current = items.length;
  }, [items]);

  const update = (id: string, field: 'label' | 'cost' | 'date', value: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const add = () => {
    if (items.length >= MAX_PURCHASES) return;
    onChange([...items, {
      id: `new-${fieldPrefix}-${++nextId.current}`,
      label: '',
      cost: '',
      date: items.at(-1)?.date || asOf,
    }]);
  };

  const remove = (id: string, index: number) => {
    if (items.length <= 1) return;
    const remaining = items.filter((item) => item.id !== id);
    nameInputs.current.get(remaining[Math.min(index, remaining.length - 1)].id)?.focus();
    onChange(remaining);
  };

  return (
    <div className="buy-purchase-editor">
      <ol className="buy-purchase-list" aria-label="Planned purchases">
        {items.map((item, index) => {
          const rowId = `${fieldPrefix}-${item.id}`;
          return (
            <li key={item.id} className="buy-purchase-card">
              <div className="buy-purchase-heading">
                <h3 className="buy-purchase-title">
                  <span className="buy-purchase-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  Purchase {index + 1}
                </h3>
                {items.length > 1 && (
                  <button
                    className="buy-purchase-remove"
                    type="button"
                    onClick={() => remove(item.id, index)}
                    aria-label={`Remove purchase ${index + 1}${item.label ? `: ${item.label}` : ''}`}
                    title="Remove purchase"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                    </svg>
                  </button>
                )}
              </div>
              <label className="buy-purchase-field" htmlFor={`${rowId}-name`}>
                What are you buying?
                <input
                  ref={(element) => {
                    if (element) nameInputs.current.set(item.id, element);
                    else nameInputs.current.delete(item.id);
                  }}
                  id={`${rowId}-name`}
                  className={input}
                  required
                  minLength={2}
                  maxLength={60}
                  value={item.label}
                  onChange={(event) => update(item.id, 'label', event.target.value)}
                  placeholder="e.g. Headphones"
                />
              </label>
              <div className="buy-purchase-fields">
                <label className="buy-purchase-field" htmlFor={`${rowId}-cost`}>
                  Price (USD)
                  <span className="buy-purchase-price">
                    <span aria-hidden="true">$</span>
                    <input
                      id={`${rowId}-cost`}
                      className="buy-purchase-price-input"
                      inputMode="decimal"
                      required
                      value={item.cost}
                      onChange={(event) => update(item.id, 'cost', event.target.value)}
                      placeholder="0.00"
                    />
                  </span>
                </label>
                <label className="buy-purchase-field" htmlFor={`${rowId}-date`}>
                  Purchase date
                  <input
                    id={`${rowId}-date`}
                    className={input}
                    type="date"
                    required
                    min={asOf}
                    max={addDays(asOf, 335)}
                    value={item.date}
                    onChange={(event) => update(item.id, 'date', event.target.value)}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      <button className="buy-purchase-add" type="button" onClick={add} disabled={items.length >= MAX_PURCHASES}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {items.length >= MAX_PURCHASES ? 'Purchase limit reached' : 'Add another purchase'}
      </button>
      <p className="buy-purchase-count" role="status" aria-live="polite">
        {items.length} of {MAX_PURCHASES} purchases
      </p>
    </div>
  );
}
