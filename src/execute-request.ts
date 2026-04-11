import { parseRequest } from "./parse-request.js";

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  elapsed: number;
  timestamp: string;
  requestMethod: string;
  requestUrl: string;
}

export async function executeRequest(raw: string): Promise<HttpResponse> {
  const { method, url, headers, body } = parseRequest(raw);

  const start = performance.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  });
  const elapsed = Math.round(performance.now() - start);

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const responseBody = (await res.text()).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
    body: responseBody,
    elapsed,
    timestamp: new Date().toISOString(),
    requestMethod: method,
    requestUrl: url,
  };
}
