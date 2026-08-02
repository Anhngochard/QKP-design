const routes = [];

export function route(pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    '^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { paramNames.push(m.slice(1)); return '([^/]+)'; }) + '$'
  );
  routes.push({ regex, paramNames, handler });
}

export function navigate(path) {
  window.location.hash = path;
}

async function resolve() {
  const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
  const [pathPart, queryPart] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));

  for (const r of routes) {
    const m = pathPart.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      await r.handler(params, query);
      return;
    }
  }
  navigate('/dashboard');
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
