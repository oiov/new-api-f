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

import React from 'react';
import { Navigate } from 'react-router-dom';
import { history } from './history';
import { getUserData } from './data';
import Loading from '../components/common/ui/Loading';
import { useUserPermissions } from '../hooks/common/useUserPermissions';

export function authHeader() {
  // return authorization header with jwt token
  const user = getUserData();

  if (user && user.token) {
    return { Authorization: 'Bearer ' + user.token };
  } else {
    return {};
  }
}

export const AuthRedirect = ({ children }) => {
  const user = localStorage.getItem('user');

  if (user) {
    return <Navigate to='/console' replace />;
  }

  return children;
};

function PrivateRoute({ children }) {
  if (!localStorage.getItem('user')) {
    return <Navigate to='/login' state={{ from: history.location }} />;
  }
  return children;
}

function PermissionRoute({
  children,
  permission,
  anyPermissions,
  fallbackCheck,
}) {
  const user = getUserData();
  if (!user) {
    return <Navigate to='/login' state={{ from: history.location }} />;
  }

  const { can, loading } = useUserPermissions();

  if (
    (permission || (anyPermissions && anyPermissions.length > 0)) &&
    loading
  ) {
    return <Loading />;
  }

  if (permission) {
    if (can(permission, false)) {
      return children;
    }
    return <Navigate to='/forbidden' replace />;
  }

  if (Array.isArray(anyPermissions) && anyPermissions.length > 0) {
    if (anyPermissions.some((permissionKey) => can(permissionKey, false))) {
      return children;
    }
    return <Navigate to='/forbidden' replace />;
  }

  if (!permission && !anyPermissions && fallbackCheck(user)) {
    return children;
  }

  return <Navigate to='/forbidden' replace />;
}

export function AdminRoute({ children, permission, anyPermissions }) {
  return (
    <PermissionRoute
      permission={permission}
      anyPermissions={anyPermissions}
      fallbackCheck={(user) => typeof user.role === 'number' && user.role >= 10}
    >
      {children}
    </PermissionRoute>
  );
}

export function RootRoute({ children, permission, anyPermissions }) {
  return (
    <PermissionRoute
      permission={permission}
      anyPermissions={anyPermissions}
      fallbackCheck={(user) =>
        typeof user.role === 'number' && user.role >= 100
      }
    >
      {children}
    </PermissionRoute>
  );
}

export { PrivateRoute };
