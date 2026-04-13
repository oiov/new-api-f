export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  if (!base64url) return new ArrayBuffer(0);
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const uintArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    uintArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export function bufferToBase64Url(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return '';
  const uintArray = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uintArray.byteLength; i++) {
    binary += String.fromCharCode(uintArray[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prepareCredentialRequestOptions(payload: any): PublicKeyCredentialRequestOptions {
  const options = payload?.publicKey ?? payload?.PublicKey ?? payload?.response ?? payload?.Response ?? payload;
  if (!options) throw new Error('无法从服务端响应中解析 Passkey 登录参数');

  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
  };

  if (Array.isArray(options.allowCredentials)) {
    publicKey.allowCredentials = options.allowCredentials.map((item: { id: string; [k: string]: unknown }) => ({
      ...item,
      id: base64UrlToBuffer(item.id),
    }));
  }

  return publicKey;
}

export function buildAssertionResult(assertion: PublicKeyCredential | null) {
  if (!assertion) return null;
  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    id: assertion.id,
    rawId: bufferToBase64Url(assertion.rawId),
    type: assertion.type,
    authenticatorAttachment: assertion.authenticatorAttachment,
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: assertion.getClientExtensionResults?.() ?? {},
  };
}

export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & {
    isConditionalMediationAvailable?: () => Promise<boolean>;
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  };
  if (typeof pkc.isConditionalMediationAvailable === 'function') {
    try {
      if (await pkc.isConditionalMediationAvailable()) return true;
    } catch { /* ignore */ }
  }
  if (typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    try {
      return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
  }
  return true;
}
