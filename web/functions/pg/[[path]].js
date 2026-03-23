import { proxyRequest } from '../_utils/proxy';

export async function onRequest(context) {
  return proxyRequest(context, '/pg');
}
