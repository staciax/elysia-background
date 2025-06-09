type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const request = (
  method: HTTPMethod,
  path: string,
  options?: RequestInit,
): Request => {
  return new Request(`http://localhost${path}`, {
    method,
    ...options,
  });
};

export const get = (path: string) => request('GET', path);

export const sleep = (ms: number): Promise<void> => {
  return Bun.sleep(ms);
};
