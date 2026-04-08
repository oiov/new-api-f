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
import { Card, Tabs, Tag, Typography } from '@douyinfe/semi-ui';
import SeoMeta from '../../components/common/seo/SeoMeta';
import ModelPricingPage from '../../components/table/model-pricing/layout/PricingPage';
import SubscriptionPlansCard from '../../components/topup/SubscriptionPlansCard';
import { API, getUserData } from '../../helpers';
import { getPricingSeo } from '../../helpers/seo';
import { StatusContext } from '../../context/Status';

const { Text } = Typography;
const { TabPane } = Tabs;
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
        withCard
      />
    </div>
  );
};

const Pricing = () => {
  const { i18n } = useTranslation();
  const { t } = useTranslation();
  const seo = getPricingSeo(i18n.language);
  const [activeTab, setActiveTab] = useState('model-pricing');

  return (
    <>
      <SeoMeta {...seo} />
      <div className='pricing-landing-page mx-auto mt-[60px] w-full max-w-[1440px] px-3 py-5 md:px-5 md:py-8'>
        <Card className='!overflow-hidden !rounded-[30px] border-0 shadow-[0_22px_60px_rgba(15,23,42,0.08)]'>
          <Tabs
            type='card'
            keepDOM={false}
            activeKey={activeTab}
            onChange={setActiveTab}
            className='pricing-landing-tabs'
          >
            <TabPane
              tab={
                <div className='pricing-tab-label flex items-center gap-2'>
                  <span>{t('模型价格')}</span>
                  <Tag color='white' shape='circle' size='small'>
                    {t('透明')}
                  </Tag>
                </div>
              }
              itemKey='model-pricing'
            >
              <div className='space-y-3 px-1 pb-1'>
                <div className='pricing-landing-model-panel'>
                  <ModelPricingPage />
                </div>
              </div>
            </TabPane>
            <TabPane
              tab={
                <div className='pricing-tab-label flex items-center gap-2'>
                  <span>{t('订阅套餐')}</span>
                  <Tag color='green' shape='circle' size='small'>
                    {t('可售卖')}
                  </Tag>
                </div>
              }
              itemKey='subscription-plans'
            >
              <div className='space-y-3 px-1 pb-1'>
                <SubscriptionPricingTab t={t} />
              </div>
            </TabPane>
          </Tabs>
        </Card>
      </div>
    </>
  );
};

export default Pricing;
