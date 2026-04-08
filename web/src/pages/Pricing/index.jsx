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

import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Tabs, Typography } from '@douyinfe/semi-ui';
import SeoMeta from '../../components/common/seo/SeoMeta';
import ModelPricingPage from '../../components/table/model-pricing/layout/PricingPage';
import SubscriptionPlansCard from '../../components/topup/SubscriptionPlansCard';
import { API } from '../../helpers';
import { getPricingSeo } from '../../helpers/seo';
import { StatusContext } from '../../context/Status';

const { Text } = Typography;
const { TabPane } = Tabs;

const SubscriptionPricingTab = ({ t }) => {
  const [statusState] = useContext(StatusContext);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [billingPreference, setBillingPreference] = useState('subscription_first');
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
    try {
      const res = await API.get('/api/subscription/self');
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
    const previousPref = billingPreference;
    setBillingPreference(pref);
    try {
      const res = await API.put('/api/subscription/self/preference', {
        billing_preference: pref,
      });
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
      const res = await API.get('/api/user/topup/info');
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
        nextPayMethods = nextPayMethods.filter((method) => method?.name && method?.type);
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
  }, []);

  useEffect(() => {
    if (!statusState?.status) return;
    setEnableOnlineTopUp(Boolean(statusState.status.enable_online_topup));
    setEnableStripeTopUp(Boolean(statusState.status.enable_stripe_topup));
    setEnableCreemTopUp(Boolean(statusState.status.enable_creem_topup));
  }, [statusState?.status]);

  return (
    <div className='space-y-4'>
      <Card className='!rounded-2xl border-0 shadow-sm'>
        <div className='space-y-1'>
          <Text strong>{t('订阅套餐')}</Text>
          <div className='text-sm text-semi-color-text-2'>
            {t('按系列查看 Claude、Codex 等套餐，并直接比较权益与价格')}
          </div>
        </div>
      </Card>
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
        initialMainTab='plan_list'
        uiVariant='package'
        withCard
      />
    </div>
  );
};

const Pricing = () => {
  const { i18n } = useTranslation();
  const { t } = useTranslation();
  const seo = getPricingSeo(i18n.language);

  return (
    <>
      <SeoMeta {...seo} />
      <div className='w-full max-w-7xl mx-auto mt-[60px] px-2 py-4'>
        <Tabs type='line' keepDOM={false}>
          <TabPane tab={t('模型价格')} itemKey='model-pricing'>
            <ModelPricingPage />
          </TabPane>
          <TabPane tab={t('订阅套餐')} itemKey='subscription-plans'>
            <SubscriptionPricingTab t={t} />
          </TabPane>
        </Tabs>
      </div>
    </>
  );
};

export default Pricing;
