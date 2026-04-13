/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

const includesAny = (message, keywords) => {
  const normalized = String(message || '').toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
};

const formatMethods = (methods, fallback) =>
  methods.length > 0 ? methods.join(' / ') : fallback;

export const getLoginConfigItems = (status, passkeySupported, t) => {
  const passwordLoginEnabled = status.password_login_enabled !== false;
  const registerEnabled = status.register_enabled !== false;
  const methods = [];

  if (passwordLoginEnabled) methods.push(t('密码'));
  if (status.wechat_login) methods.push(t('微信'));
  if (status.github_oauth) methods.push(t('GitHub'));
  if (status.google_oauth) methods.push(t('Google'));
  if (status.discord_oauth) methods.push(t('Discord'));
  if (status.oidc_enabled) methods.push(t('OIDC'));
  if (status.linuxdo_oauth) methods.push(t('LinuxDO'));
  if (status.telegram_oauth) methods.push(t('Telegram'));
  if (status.passkey_login && passkeySupported) methods.push(t('Passkey'));
  (status.custom_oauth_providers || []).forEach((provider) =>
    methods.push(provider.name),
  );

  return [
    {
      label: t('密码登录'),
      value: passwordLoginEnabled ? t('已开启') : t('已关闭'),
      type: passwordLoginEnabled ? 'success' : 'danger',
    },
    {
      label: t('可用登录方式'),
      value: formatMethods(methods, t('暂无可用登录方式')),
      type: methods.length > 0 ? 'default' : 'warning',
    },
    {
      label: t('注册入口'),
      value: registerEnabled ? t('开放') : t('已关闭'),
      type: registerEnabled ? 'success' : 'danger',
    },
    {
      label: t('附加要求'),
      value: [
        status.email_verification ? t('邮箱验证码') : null,
        status.invite_register_enabled ? t('邀请码') : null,
        status.turnstile_check ? t('人机验证') : null,
      ]
        .filter(Boolean)
        .join(' / ') || t('无'),
      type: 'default',
    },
  ];
};

export const getRegisterConfigItems = (status, t) => {
  const registerEnabled = status.register_enabled !== false;
  const passwordRegisterEnabled = status.password_register_enabled !== false;
  const methods = [];

  if (registerEnabled && passwordRegisterEnabled) methods.push(t('用户名密码'));
  if (registerEnabled && status.wechat_register) methods.push(t('微信'));
  if (registerEnabled && status.github_oauth_register) methods.push(t('GitHub'));
  if (registerEnabled && status.google_oauth_register) methods.push(t('Google'));
  if (registerEnabled && status.discord_oauth_register) methods.push(t('Discord'));
  if (registerEnabled && status.oidc_register_enabled) methods.push(t('OIDC'));
  if (registerEnabled && status.linuxdo_oauth_register) methods.push(t('LinuxDO'));
  if (registerEnabled && status.telegram_oauth_register) methods.push(t('Telegram'));

  return [
    {
      label: t('注册入口'),
      value: registerEnabled ? t('开放') : t('已关闭'),
      type: registerEnabled ? 'success' : 'danger',
    },
    {
      label: t('密码注册'),
      value:
        registerEnabled && passwordRegisterEnabled ? t('已开启') : t('已关闭'),
      type: registerEnabled && passwordRegisterEnabled ? 'success' : 'danger',
    },
    {
      label: t('可用注册方式'),
      value: formatMethods(methods, t('暂无可用注册方式')),
      type: methods.length > 0 ? 'default' : 'warning',
    },
    {
      label: t('附加要求'),
      value: [
        status.email_verification ? t('邮箱验证码') : null,
        status.invite_register_enabled ? t('邀请码') : null,
        status.turnstile_check ? t('人机验证') : null,
      ]
        .filter(Boolean)
        .join(' / ') || t('无'),
      type: 'default',
    },
  ];
};

export const getFriendlyLoginError = (message, status, t) => {
  if (!message) {
    return t('登录失败，请重试');
  }
  if (
    status.password_login_enabled === false ||
    includesAny(message, ['password login disabled', 'login is disabled'])
  ) {
    return t('当前站点已关闭账号密码登录，请使用页面上其他可用的登录方式');
  }
  if (
    includesAny(message, [
      'invalid params',
      '用户名或密码为空',
      'username or password is empty',
    ])
  ) {
    return t('请输入用户名和密码');
  }
  if (
    includesAny(message, [
      '用户名或密码错误',
      'invalid credentials',
      'user has been deleted',
      '账号已被封禁',
      'disabled',
      'forbidden',
    ])
  ) {
    return t('用户名或密码错误，或账号当前不可用');
  }
  return message;
};

export const getFriendlyRegisterError = (message, status, t) => {
  if (!message) {
    return t('注册失败，请重试');
  }
  if (
    status.register_enabled === false ||
    includesAny(message, ['register disabled', 'registration is disabled'])
  ) {
    return t('当前站点已关闭注册，请联系管理员');
  }
  if (
    status.password_register_enabled === false ||
    includesAny(message, ['password register disabled'])
  ) {
    return t('当前站点未开放账号密码注册，请使用页面上其他可用的注册方式');
  }
  if (
    status.invite_register_enabled &&
    includesAny(message, ['invite', '邀请码', 'aff'])
  ) {
    return t('当前站点为邀请制注册，请先填写邀请码或使用邀请链接');
  }
  if (
    status.email_verification &&
    includesAny(message, ['verification code', '邮箱验证', '验证码'])
  ) {
    return t('当前注册需要邮箱验证码，请先获取验证码并完成填写');
  }
  if (
    includesAny(message, [
      "key: 'user.username'",
      'username',
      '用户名',
      'max',
      'longer than',
    ])
  ) {
    return t('用户名最长 20 个字符，请不要直接填写完整邮箱地址');
  }
  if (
    includesAny(message, [
      "key: 'user.password'",
      'password',
      '密码',
      'min',
      'at least',
      'max',
    ])
  ) {
    return t('密码长度需要在 8 到 20 位之间');
  }
  if (includesAny(message, ['exists', '已存在', '已注册', 'duplicate'])) {
    return t('用户名或邮箱已存在，请直接登录或更换后重试');
  }
  if (includesAny(message, ['invalid params', 'input invalid'])) {
    return t('注册信息填写不完整或格式不正确，请检查后重试');
  }
  return message;
};
