'use client';

// "Viewing as": which person the app is showing. There's no real login (one-laptop demo),
// so the choice is kept in the browser and shared by every page.

import { useSyncExternalStore } from 'react';

const KEY = 'ww-viewer';
const CHANGE_EVENT = 'ww-viewer-change';
const DEFAULT_VIEWER = 'alex';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? DEFAULT_VIEWER;
  } catch {
    return DEFAULT_VIEWER;
  }
}

export function useViewer() {
  const viewerId = useSyncExternalStore(subscribe, read, () => DEFAULT_VIEWER);
  const setViewerId = (id: string) => {
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // storage blocked (private mode): the choice just won't persist
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return { viewerId, setViewerId };
}
