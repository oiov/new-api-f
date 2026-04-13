'use client';

import React from 'react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  onGitHubOAuthClicked, onDiscordOAuthClicked,
  onLinuxDOOAuthClicked, onGoogleOAuthClicked, onOIDCClicked,
} from '@/lib/api';
import type { SystemStatus } from '@/types';

export function OAuthButtons({ status }: { status: SystemStatus | null | undefined }) {
  const hasOAuth = status?.github_oauth || status?.discord_oauth ||
    status?.linuxdo_oauth || status?.google_oauth || status?.oidc_enabled;
  if (!hasOAuth) return null;

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border/60" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap px-1">
          第三方登录
        </span>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {status?.github_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onGitHubOAuthClicked(status.github_client_id!)}>
            <Github className="size-3.5" />
            GitHub
          </Button>
        )}
        {status?.discord_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onDiscordOAuthClicked(status.discord_client_id!)}>
            Discord
          </Button>
        )}
        {status?.linuxdo_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onLinuxDOOAuthClicked(status.linuxdo_client_id!)}>
            LinuxDO
          </Button>
        )}
        {status?.google_oauth && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onGoogleOAuthClicked(status.google_client_id!)}>
            Google
          </Button>
        )}
        {status?.oidc_enabled && (
          <Button variant="outline" size="sm"
            className="h-9 gap-2 text-xs"
            onClick={() => onOIDCClicked(
              status.oidc_authorization_endpoint!,
              status.oidc_client_id!,
            )}>
            {status.oidc_display_name || 'SSO'}
          </Button>
        )}
      </div>
    </div>
  );
}
