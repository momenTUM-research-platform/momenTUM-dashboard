export const api = {
    get: (path: string, init?: RequestInit) =>
      fetch(`/api${path}`, init).then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      }),
  };