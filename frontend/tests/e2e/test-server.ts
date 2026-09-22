export const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT ?? 8100);
export const backendUrl = `http://127.0.0.1:${backendPort}`;
