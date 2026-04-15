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
import { getPricingSeo, getSubscriptionPlansSeo } from '../../helpers/seo';
import { StatusContext } from '../../context/Status';

const PLAN_LIST_TAB = ['plan', 'list'].join('_');
const PACKAGE_VARIANT = ['pack', 'age'].join('');

const SubscriptionPricingTab = ({ onPlansChange, t }) => {
  const [statusState] = useContext(StatusContext);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [billingPreference, setBillingPreference] =
    useState('subscription_first');
  const [preferredSubscriptionId, setPreferredSubscriptionId] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [allSubscriptions, setAllSubscriptions] = useState([]);
  const [manualDeliveryOrders, setManualDeliveryOrders] = useState([]);
  const [dayPassPlans, setDayPassPlans] = useState([]);
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
      setPreferredSubscriptionId(0);
      setActiveSubscriptions([]);
      setAllSubscriptions([]);
      setManualDeliveryOrders([]);
      setDayPassPlans([]);
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
        setPreferredSubscriptionId(
          Number(res.data.data?.preferred_subscription_id || 0),
        );
        setActiveSubscriptions(res.data.data?.subscriptions || []);
        setAllSubscriptions(res.data.data?.all_subscriptions || []);
        setManualDeliveryOrders(res.data.data?.manual_delivery_orders || []);
        setDayPassPlans(res.data.data?.day_pass_plans || []);
      }
    } catch (e) {
      setActiveSubscriptions([]);
      setAllSubscriptions([]);
      setManualDeliveryOrders([]);
      setDayPassPlans([]);
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

  useEffect(() => {
    onPlansChange?.(subscriptionPlans);
  }, [onPlansChange, subscriptionPlans]);

  useEffect(
    () => () => {
      onPlansChange?.([]);
    },
    [onPlansChange],
  );

  return (
    <div className='subscription-pricing-page'>
      <SubscriptionPlansCard
        t={t}
        loading={subscriptionLoading}
        plans={subscriptionPlans}
        payMethods={payMethods}
        enableOnlineTopUp={enableOnlineTopUp}
        enableStripeTopUp={enableStripeTopUp}
        enableCreemTopUp={enableCreemTopUp}
        billingPreference={billingPreference}
        preferredSubscriptionId={preferredSubscriptionId}
        onChangeBillingPreference={updateBillingPreference}
        activeSubscriptions={activeSubscriptions}
        allSubscriptions={allSubscriptions}
        manualDeliveryOrders={manualDeliveryOrders}
        dayPassPlans={dayPassPlans}
        reloadSubscriptionSelf={getSubscriptionSelf}
        initialMainTab={PLAN_LIST_TAB}
        uiVariant={PACKAGE_VARIANT}
        showUserSubscriptions={false}
        mainPanelMode='plans'
        withCard={false}
      />
    </div>
  );
};

const Pricing = () => {
  const { i18n } = useTranslation();
  const { t } = useTranslation();
  const pricingSeo = getPricingSeo(i18n.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') || 'model-pricing',
  );
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const subscriptionCanonicalPath = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'subscription-plans');
    const query = next.toString();
    return `/pricing${query ? `?${query}` : ''}`;
  }, [searchParams]);
  const subscriptionSeo = useMemo(
    () =>
      getSubscriptionPlansSeo(i18n.language, subscriptionPlans, {
        canonicalPath: subscriptionCanonicalPath,
        series: searchParams.get('plan_series') || 'all',
        sort: searchParams.get('plan_sort') || 'recommended',
        view: searchParams.get('plan_view') || 'card',
      }),
    [i18n.language, searchParams, subscriptionCanonicalPath, subscriptionPlans],
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
      <SeoMeta
        key={
          activeTab === 'subscription-plans'
            ? `subscription-${searchParams.toString()}`
            : 'pricing-default'
        }
        {...(activeTab === 'subscription-plans' && subscriptionSeo
          ? subscriptionSeo
          : pricingSeo)}
      />
      <div className='pricing-landing-page mx-auto mt-[60px] w-full max-w-[1360px] px-3 pb-6 md:px-6'>
        <div className='pricing-landing-tabbar'>
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
                className={`pricing-landing-tabbar__button ${
                  isActive ? 'pricing-landing-tabbar__button-active' : ''
                }`}
              >
                <span>{tab.label}</span>
                <Tag color={tab.badge.color} shape='circle' size='small'>
                  {tab.badge.text}
                </Tag>
              </button>
            );
          })}
        </div>

        <div className='pricing-landing-tabpanel'>
          {activeTab === 'model-pricing' && (
            <div className='pricing-landing-model-panel'>
              <ModelPricingPage />
            </div>
          )}
          {activeTab === 'subscription-plans' && (
            <SubscriptionPricingTab
              t={t}
              onPlansChange={setSubscriptionPlans}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default Pricing;
