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

import React, { lazy, Suspense, useContext, useMemo } from 'react';
import { Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Loading from './components/common/ui/Loading';
import { AuthRedirect, PrivateRoute, AdminRoute, RootRoute } from './helpers/auth';
import { StatusContext } from './context/Status';
import SeoMeta from './components/common/seo/SeoMeta';
import { getRouteSeo } from './helpers/seo';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const UserAgreement = lazy(() => import('./pages/UserAgreement'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const User = lazy(() => import('./pages/User'));
const RegisterForm = lazy(() => import('./components/auth/RegisterForm'));
const LoginForm = lazy(() => import('./components/auth/LoginForm'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Forbidden = lazy(() => import('./pages/Forbidden'));
const Setting = lazy(() => import('./pages/Setting'));
const PasswordResetForm = lazy(
  () => import('./components/auth/PasswordResetForm'),
);
const PasswordResetConfirm = lazy(
  () => import('./components/auth/PasswordResetConfirm'),
);
const Channel = lazy(() => import('./pages/Channel'));
const Token = lazy(() => import('./pages/Token'));
const AdminToken = lazy(() => import('./pages/AdminToken'));
const EcomAgent = lazy(() => import('./pages/EcomAgent'));
const Redemption = lazy(() => import('./pages/Redemption'));
const TopUp = lazy(() => import('./pages/TopUp'));
const InvoicePage = lazy(() => import('./pages/Invoice'));
const InvoiceAdminPage = lazy(() => import('./pages/InvoiceAdmin'));
const CheckinAdminPage = lazy(() => import('./pages/CheckinAdmin'));
const PackagePage = lazy(() => import('./pages/Package'));
const InvitePage = lazy(() => import('./pages/Invite'));
const Log = lazy(() => import('./pages/Log'));
const Chat = lazy(() => import('./pages/Chat'));
const Chat2Link = lazy(() => import('./pages/Chat2Link'));
const Midjourney = lazy(() => import('./pages/Midjourney'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SubscriptionPlanDetail = lazy(
  () => import('./pages/Pricing/SubscriptionPlanDetail'),
);
const Task = lazy(() => import('./pages/Task'));
const ModelPage = lazy(() => import('./pages/Model'));
const ModelDeploymentPage = lazy(() => import('./pages/ModelDeployment'));
const Playground = lazy(() => import('./pages/Playground'));
const RiskControl = lazy(() => import('./pages/RiskControl'));
const Subscription = lazy(() => import('./pages/Subscription'));
const OAuth2Callback = lazy(() => import('./components/auth/OAuth2Callback'));
const PersonalSetting = lazy(
  () => import('./components/settings/PersonalSetting'),
);
const Setup = lazy(() => import('./pages/Setup'));
const Docs = lazy(() => import('./pages/Docs'));
const SetupCheck = lazy(() => import('./components/layout/SetupCheck'));

function DynamicOAuth2Callback() {
  const { provider } = useParams();
  return <OAuth2Callback type={provider} />;
}

function App() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const routeSeo = useMemo(
    () => getRouteSeo(i18n.language, location.pathname),
    [i18n.language, location.pathname],
  );

  // 获取模型广场权限配置
  const pricingRequireAuth = useMemo(() => {
    const headerNavModulesConfig = statusState?.status?.HeaderNavModules;
    if (headerNavModulesConfig) {
      try {
        const modules = JSON.parse(headerNavModulesConfig);

        // 处理向后兼容性：如果pricing是boolean，默认不需要登录
        if (typeof modules.pricing === 'boolean') {
          return false; // 默认不需要登录鉴权
        }

        // 如果是对象格式，使用requireAuth配置
        return modules.pricing?.requireAuth === true;
      } catch (error) {
        console.error('解析顶栏模块配置失败:', error);
        return false; // 默认不需要登录
      }
    }
    return false; // 默认不需要登录
  }, [statusState?.status?.HeaderNavModules]);

  // 获取套餐页权限配置
  const packageRequireAuth = useMemo(() => {
    const headerNavModulesConfig = statusState?.status?.HeaderNavModules;
    if (headerNavModulesConfig) {
      try {
        const modules = JSON.parse(headerNavModulesConfig);

        if (typeof modules.package === 'boolean') {
          return false; // 默认不需要登录鉴权
        }

        return modules.package?.requireAuth === true;
      } catch (error) {
        console.error('解析顶栏模块配置失败:', error);
        return false; // 默认不需要登录
      }
    }
    return false; // 默认不需要登录
  }, [statusState?.status?.HeaderNavModules]);

  return (
    <Suspense fallback={<Loading></Loading>}>
      <SetupCheck>
        <SeoMeta
          key={`route-seo-${location.pathname}`}
          {...routeSeo}
          canonicalPath={location.pathname}
        />
        <Routes>
          <Route
            path='/'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path='/setup'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Setup />
              </Suspense>
            }
          />
          <Route path='/forbidden' element={<Forbidden />} />
          <Route
            path='/console/models'
            element={
              <AdminRoute>
                <ModelPage />
              </AdminRoute>
            }
          />
          <Route
            path='/console/deployment'
            element={
              <AdminRoute>
                <ModelDeploymentPage />
              </AdminRoute>
            }
          />
          <Route
            path='/console/subscription'
            element={
              <AdminRoute>
                <Subscription />
              </AdminRoute>
            }
          />
          <Route
            path='/console/channel'
            element={
              <AdminRoute>
                <Channel />
              </AdminRoute>
            }
          />
          <Route
            path='/console/token'
            element={
              <PrivateRoute>
                <Token />
              </PrivateRoute>
            }
          />
          <Route
            path='/console/token/admin'
            element={
              <AdminRoute>
                <AdminToken />
              </AdminRoute>
            }
          />
          <Route
            path='/console/playground'
            element={
              <PrivateRoute>
                <Playground />
              </PrivateRoute>
            }
          />
          <Route
            path='/console/ecomagent'
            element={
              <RootRoute>
                <EcomAgent />
              </RootRoute>
            }
          />
          <Route
            path='/console/redemption'
            element={
              <AdminRoute>
                <Redemption />
              </AdminRoute>
            }
          />
          <Route
            path='/console/user'
            element={
              <AdminRoute>
                <User />
              </AdminRoute>
            }
          />
          <Route
            path='/console/risk-control'
            element={
              <AdminRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <RiskControl />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path='/user/reset'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <PasswordResetConfirm />
              </Suspense>
            }
          />
          <Route
            path='/login'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <AuthRedirect>
                  <LoginForm />
                </AuthRedirect>
              </Suspense>
            }
          />
          <Route
            path='/register'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <AuthRedirect>
                  <RegisterForm />
                </AuthRedirect>
              </Suspense>
            }
          />
          <Route
            path='/reset'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <PasswordResetForm />
              </Suspense>
            }
          />
          <Route
            path='/oauth/github'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <OAuth2Callback type='github'></OAuth2Callback>
              </Suspense>
            }
          />
          <Route
            path='/oauth/discord'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <OAuth2Callback type='discord'></OAuth2Callback>
              </Suspense>
            }
          />
          <Route
            path='/oauth/oidc'
            element={
              <Suspense fallback={<Loading></Loading>}>
                <OAuth2Callback type='oidc'></OAuth2Callback>
              </Suspense>
            }
          />
          <Route
            path='/oauth/linuxdo'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <OAuth2Callback type='linuxdo'></OAuth2Callback>
              </Suspense>
            }
          />
          <Route
            path='/oauth/:provider'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <DynamicOAuth2Callback />
              </Suspense>
            }
          />
          <Route
            path='/console/setting'
            element={
              <AdminRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <Setting />
                </Suspense>
              </AdminRoute>
            }
          />
          <Route
            path='/console/package'
            element={
              packageRequireAuth ? (
                <PrivateRoute>
                  <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                    <PackagePage />
                  </Suspense>
                </PrivateRoute>
              ) : (
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <PackagePage />
                </Suspense>
              )
            }
          />
          <Route
            path='/console/personal'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <PersonalSetting />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/console/topup'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <TopUp />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/console/invoice'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <InvoicePage />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/console/invoice-admin'
            element={
              <RootRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <InvoiceAdminPage />
                </Suspense>
              </RootRoute>
            }
          />
          <Route
            path='/console/checkin-admin'
            element={
              <RootRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <CheckinAdminPage />
                </Suspense>
              </RootRoute>
            }
          />
          <Route
            path='/console/invite'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <InvitePage />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/console/log'
            element={
              <PrivateRoute>
                <Log />
              </PrivateRoute>
            }
          />
          <Route
            path='/console'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <Dashboard />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/console/midjourney'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <Midjourney />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/console/task'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <Task />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route
            path='/pricing'
            element={
              pricingRequireAuth ? (
                <PrivateRoute>
                  <Suspense
                    fallback={<Loading></Loading>}
                    key={location.pathname}
                  >
                    <Pricing />
                  </Suspense>
                </PrivateRoute>
              ) : (
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <Pricing />
                </Suspense>
              )
            }
          />
          <Route
            path='/pricing/subscription-plans/:planId'
            element={
              pricingRequireAuth ? (
                <PrivateRoute>
                  <Suspense
                    fallback={<Loading></Loading>}
                    key={location.pathname}
                  >
                    <SubscriptionPlanDetail />
                  </Suspense>
                </PrivateRoute>
              ) : (
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <SubscriptionPlanDetail />
                </Suspense>
              )
            }
          />
          <Route
            path='/status'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <About />
              </Suspense>
            }
          />
          <Route
            path='/contact'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Contact />
              </Suspense>
            }
          />
          <Route
            path='/docs'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Docs />
              </Suspense>
            }
          />
          <Route
            path='/user-agreement'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <UserAgreement />
              </Suspense>
            }
          />
          <Route
            path='/privacy-policy'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <PrivacyPolicy />
              </Suspense>
            }
          />
          <Route
            path='/console/chat/:id?'
            element={
              <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                <Chat />
              </Suspense>
            }
          />
          {/* 方便使用chat2link直接跳转聊天... */}
          <Route
            path='/chat2link'
            element={
              <PrivateRoute>
                <Suspense fallback={<Loading></Loading>} key={location.pathname}>
                  <Chat2Link />
                </Suspense>
              </PrivateRoute>
            }
          />
          <Route path='*' element={<NotFound />} />
        </Routes>
      </SetupCheck>
    </Suspense>
  );
}

export default App;
