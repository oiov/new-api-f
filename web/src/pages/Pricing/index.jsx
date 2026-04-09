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

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Tag } from '@douyinfe/semi-ui';
import SeoMeta from '../../components/common/seo/SeoMeta';
import ModelPricingPage from '../../components/table/model-pricing/layout/PricingPage';
import SubscriptionPlansCard from '../../components/topup/SubscriptionPlansCard';
import { API, getUserData } from '../../helpers';
import { getPricingSeo } from '../../helpers/seo';
import { StatusContext } from '../../context/Status';

const PLAN_LIST_TAB = ['plan', 'list'].join('_');
const PACKAGE_VARIANT = ['pack', 'age'].join('');

const SubscriptionPricingTab = ({ t }) => {
  const [statusState] = useContext(StatusContext);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [billingPreference, setBillingPreference] =
    useState('subscription_first');
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [allSubscriptions, setAllSubscriptions] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [enableOnlineTopUp, setEnableOnlineTopUp] = useState(
    statusState?.status?.enable_online_topup || false,
  );
  const [enableStripeTopUp, setEnableStripeTopUp] = useState(
    statusState?.status?.enable_stripe_topup || false,
  );
  const [enableCreemTopUp, setEnableCreemTopUp] = useState(
    statusState?.status?.enable_creem_topup || false,
  );
  const currentUser = useMemo(() => getUserData(), []);
  const isLoggedIn = !!currentUser?.id;

  const getSubscriptionPlans = async () => {
    setSubscriptionLoading(true);
    try {
      const res = await API.get('/api/subscription/plans');
      if (res.data?.success) {
        setSubscriptionPlans(res.data.data || []);
      } else {
        setSubscriptionPlans([]);
      }
    } catch (e) {
      setSubscriptionPlans([]);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const getSubscriptionSelf = async () => {
    if (!isLoggedIn) {
      setBillingPreference('subscription_first');
      setActiveSubscriptions([]);
      setAllSubscriptions([]);
      return;
    }
    try {
      const res = await API.get('/api/subscription/self', {
        skipErrorHandler: true,
      });
      if (res.data?.success) {
        setBillingPreference(
          res.data.data?.billing_preference || 'subscription_first',
        );
        setActiveSubscriptions(res.data.data?.subscriptions || []);
        setAllSubscriptions(res.data.data?.all_subscriptions || []);
      }
    } catch (e) {
      setActiveSubscriptions([]);
      setAllSubscriptions([]);
    }
  };

  const updateBillingPreference = async (pref) => {
    if (!isLoggedIn) {
      return;
    }
    const previousPref = billingPreference;
    setBillingPreference(pref);
    try {
      const res = await API.put(
        '/api/subscription/self/preference',
        {
          billing_preference: pref,
        },
        {
          skipErrorHandler: true,
        },
      );
      if (res.data?.success) {
        setBillingPreference(
          res.data?.data?.billing_preference || pref || previousPref,
        );
      } else {
        setBillingPreference(previousPref);
      }
    } catch (e) {
      setBillingPreference(previousPref);
    }
  };

  const getTopupInfo = async () => {
    try {
      const res = await API.get('/api/user/topup/info', {
        skipErrorHandler: true,
      });
      const { data, success } = res.data || {};
      if (!success) return;
      let nextPayMethods = data?.pay_methods || [];
      if (typeof nextPayMethods === 'string') {
        try {
          nextPayMethods = JSON.parse(nextPayMethods);
        } catch (e) {
          nextPayMethods = [];
        }
      }
      if (Array.isArray(nextPayMethods)) {
        nextPayMethods = nextPayMethods.filter(
          (method) => method?.name && method?.type,
        );
      } else {
        nextPayMethods = [];
      }
      setPayMethods(nextPayMethods);
      setEnableOnlineTopUp(Boolean(data?.enable_online_topup));
      setEnableStripeTopUp(Boolean(data?.enable_stripe_topup));
      setEnableCreemTopUp(Boolean(data?.enable_creem_topup));
    } catch (e) {
      setPayMethods([]);
    }
  };

  useEffect(() => {
    getSubscriptionPlans().then();
    getSubscriptionSelf().then();
    getTopupInfo().then();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!statusState?.status) return;
    setEnableOnlineTopUp(Boolean(statusState.status.enable_online_topup));
    setEnableStripeTopUp(Boolean(statusState.status.enable_stripe_topup));
    setEnableCreemTopUp(Boolean(statusState.status.enable_creem_topup));
  }, [statusState?.status]);

  return (
    <div>
      <SubscriptionPlansCard
        t={t}
        loading={subscriptionLoading}
        plans={subscriptionPlans}
        payMethods={payMethods}
        enableOnlineTopUp={enableOnlineTopUp}
        enableStripeTopUp={enableStripeTopUp}
        enableCreemTopUp={enableCreemTopUp}
        billingPreference={billingPreference}
        onChangeBillingPreference={updateBillingPreference}
        activeSubscriptions={activeSubscriptions}
        allSubscriptions={allSubscriptions}
        reloadSubscriptionSelf={getSubscriptionSelf}
        initialMainTab={PLAN_LIST_TAB}
        uiVariant={PACKAGE_VARIANT}
        showUserSubscriptions={false}
        withCard={false}
      />
    </div>
  );
};

const Pricing = () => {
  const { i18n } = useTranslation();
  const { t } = useTranslation();
  const seo = getPricingSeo(i18n.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') || 'model-pricing',
  );

  const handleTabChange = (key) => {
    setActiveTab(key);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === 'model-pricing') next.delete('tab');
        else next.set('tab', key);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      <SeoMeta {...seo} />
      <div className='pricing-landing-page mx-auto mt-[60px] w-full max-w-[1440px] px-3 pb-8 md:px-6'>
        {/* Tab 导航栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '16px 0 0',
            marginBottom: 0,
            borderBottom: '1px solid var(--semi-color-border)',
          }}
        >
          {[
            {
              key: 'model-pricing',
              label: t('模型价格'),
              badge: { color: 'blue', text: t('透明') },
            },
            {
              key: 'subscription-plans',
              label: t('订阅套餐'),
              badge: { color: 'green', text: t('可售卖') },
            },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive
                    ? '2px solid var(--semi-color-primary)'
                    : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? 'var(--semi-color-primary)'
                    : 'var(--semi-color-text-1)',
                  marginBottom: -1,
                  transition: 'all 0.2s',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.label}</span>
                <Tag color={tab.badge.color} shape='circle' size='small'>
                  {tab.badge.text}
                </Tag>
              </button>
            );
          })}
        </div>

        {/* 内容区域 */}
        <div style={{ paddingTop: 16 }}>
          {activeTab === 'model-pricing' && (
            <div className='pricing-landing-model-panel'>
              <ModelPricingPage />
            </div>
          )}
          {activeTab === 'subscription-plans' && (
            <SubscriptionPricingTab t={t} />
          )}
        </div>
      </div>
    </>
  );
};

export default Pricing;
