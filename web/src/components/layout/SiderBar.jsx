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
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../context/Status';
import { parseSubscriptionRefundSettings } from '../../helpers/subscriptionRefund';
import { getLucideIcon } from '../../helpers/lucideIcons';
import { ChevronLeft } from 'lucide-react';
import { useSidebarCollapsed } from '../../hooks/common/useSidebarCollapsed';
import { useSidebar } from '../../hooks/common/useSidebar';
import { useMinimumLoadingTime } from '../../hooks/common/useMinimumLoadingTime';
import { showError } from '../../helpers/utils';
import { getUserData } from '../../helpers/data';
import { useUserPermissions } from '../../hooks/common/useUserPermissions';
import {
  ADMIN_PERMISSION_POINTS,
  ADMIN_PERMISSION_POINT_LIST,
} from '../../constants/permission.constants';
import SkeletonWrapper from './components/SkeletonWrapper';

import { Nav, Divider, Button } from '@douyinfe/semi-ui';

const routerMap = {
  home: '/',
  channel: '/console/channel',
  package: '/console/package',
  token: '/console/token',
  tokenAdmin: '/console/token/admin',
  ecomagent: '/console/ecomagent',
  redemption: '/console/redemption',
  topup: '/console/topup',
  invoice: '/console/invoice',
  refund: '/console/refund',
  invoiceAdmin: '/console/invoice-admin',
  checkinAdmin: '/console/checkin-admin',
  financeAdmin: '/console/finance',
  r2Storage: '/console/r2-storage',
  invite: '/console/invite',
  user: '/console/user',
  subscription: '/console/subscription',
  riskControl: '/console/risk-control',
  log: '/console/log',
  midjourney: '/console/midjourney',
  setting: '/console/setting',
  about: '/status',
  contact: '/contact',
  detail: '/console',
  pricing: '/pricing',
  task: '/console/task',
  models: '/console/models',
  deployment: '/console/deployment',
  playground: '/console/playground',
  mailAssistant: '/console/mail-assistant',
  personal: '/console/personal',
  activityLottery: '/console/activity-lottery',
  checkinLottery: '/console/checkin-lottery',
  siteNotifications: '/console/site-notifications',
};

const SiderBar = ({ onNavigate = () => {} }) => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const user = getUserData();
  const isAdminUser = typeof user?.role === 'number' && user.role >= 10;
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const {
    isModuleVisible,
    hasSectionVisibleModules,
    loading: sidebarLoading,
  } = useSidebar();
  const { can, canAny } = useUserPermissions();

  const showSkeleton = useMinimumLoadingTime(sidebarLoading, 200);
  const refundSettings = useMemo(
    () =>
      parseSubscriptionRefundSettings(
        statusState?.status?.SubscriptionRefundSettings,
      ),
    [statusState?.status?.SubscriptionRefundSettings],
  );

  const [selectedKeys, setSelectedKeys] = useState(['home']);
  const [chatItems, setChatItems] = useState([]);
  const [openedKeys, setOpenedKeys] = useState([]);
  const location = useLocation();
  const [routerMapState, setRouterMapState] = useState(routerMap);

  const workspaceItems = useMemo(() => {
    const items = [
      {
        text: t('数据看板'),
        itemKey: 'detail',
        to: '/detail',
        className:
          localStorage.getItem('enable_data_export') === 'true'
            ? ''
            : 'tableHiddle',
      },
      {
        text: t('套餐管理'),
        itemKey: 'package',
        to: '/package',
      },
      {
        text: t('令牌管理'),
        itemKey: 'token',
        to: '/token',
      },
      {
        text: t('使用日志'),
        itemKey: 'log',
        to: '/log',
      },
      {
        text: t('签到管理'),
        itemKey: 'checkinLottery',
        to: '/console/checkin-lottery',
      },
      {
        text: t('活动抽奖'),
        itemKey: 'activityLottery',
        to: '/console/activity-lottery',
      },
      {
        text: t('绘图日志'),
        itemKey: 'midjourney',
        to: '/midjourney',
        className:
          localStorage.getItem('enable_drawing') === 'true'
            ? ''
            : 'tableHiddle',
      },
      {
        text: t('任务日志'),
        itemKey: 'task',
        to: '/task',
        className:
          localStorage.getItem('enable_task') === 'true' ? '' : 'tableHiddle',
      },
      {
        text: t('花火邮箱助手'),
        itemKey: 'mailAssistant',
        to: '/console/mail-assistant',
      },
    ];

    // 根据配置过滤项目
    const filteredItems = items.filter((item) => {
      const configVisible = isModuleVisible('console', item.itemKey);
      return configVisible;
    });

    return filteredItems;
  }, [
    localStorage.getItem('enable_data_export'),
    localStorage.getItem('enable_drawing'),
    localStorage.getItem('enable_task'),
    t,
    isModuleVisible,
  ]);

  const financeItems = useMemo(() => {
    const items = [
      {
        text: t('充值兑换'),
        itemKey: 'topup',
        to: '/topup',
      },
      {
        text: t('发票管理'),
        itemKey: 'invoice',
        to: '/invoice',
      },
      {
        text: t('退款售后'),
        itemKey: 'refund',
        to: '/refund',
      },
      {
        text: t('邀请拉新'),
        itemKey: 'invite',
        to: '/invite',
      },
      {
        text: t('个人设置'),
        itemKey: 'personal',
        to: '/personal',
      },
      {
        text: t('站内信'),
        itemKey: 'siteNotifications',
        to: '/console/site-notifications',
      },
    ];

    // 根据配置过滤项目
    const filteredItems = items.filter((item) => {
      if (
        item.itemKey === 'refund' &&
        (!refundSettings.page_enabled || !refundSettings.enabled) &&
        !isAdminUser
      ) {
        return false;
      }
      const configVisible = isModuleVisible('personal', item.itemKey);
      return configVisible;
    });

    return filteredItems;
  }, [refundSettings.enabled, refundSettings.page_enabled, t, isModuleVisible]);

  const publicItems = useMemo(() => {
    const items = [
      {
        text: t('价格方案'),
        itemKey: 'pricing',
        to: '/pricing',
      },
      {
        text: t('开发文档'),
        itemKey: 'docs',
        to: '/docs',
      },
      {
        text: t('系统状态'),
        itemKey: 'about',
        to: '/status',
      },
      {
        text: t('联系我们'),
        itemKey: 'contact',
        to: '/contact',
      },
    ];

    const filteredItems = items.filter((item) =>
      isModuleVisible('public', item.itemKey),
    );

    return filteredItems;
  }, [t, isModuleVisible]);

  const adminItems = useMemo(() => {
    const hasAdminAccess = (permissionKey) => can(permissionKey, false);
    const items = [
      {
        text: t('渠道管理'),
        itemKey: 'channel',
        to: '/channel',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.channel)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('订阅管理'),
        itemKey: 'subscription',
        to: '/subscription',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.subscription)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('模型管理'),
        itemKey: 'models',
        to: '/console/models',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.models)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('模型部署'),
        itemKey: 'deployment',
        to: '/deployment',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.deployment)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('兑换码管理'),
        itemKey: 'redemption',
        to: '/redemption',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.redemption)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('管理员令牌'),
        itemKey: 'tokenAdmin',
        to: '/console/token/admin',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.tokenAdmin)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('EcomAgent账户'),
        itemKey: 'ecomagent',
        to: '/console/ecomagent',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.ecomagent)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('用户管理'),
        itemKey: 'user',
        to: '/user',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.user)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('系统设置'),
        itemKey: 'setting',
        to: '/setting',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.setting)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('风险封控'),
        itemKey: 'riskControl',
        to: '/risk-control',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.riskControl)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('发票开具'),
        itemKey: 'invoiceAdmin',
        to: '/console/invoice-admin',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.invoiceAdmin)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('财务中心'),
        itemKey: 'financeAdmin',
        to: '/console/finance',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.financeAdmin)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('R2 存储'),
        itemKey: 'r2Storage',
        to: '/console/r2-storage',
        className: hasAdminAccess(ADMIN_PERMISSION_POINTS.r2Storage)
          ? ''
          : 'tableHiddle',
      },
      {
        text: t('签到/活动后台'),
        itemKey: 'checkinAdmin',
        to: '/console/checkin-admin',
        className: canAny(
          [
            ADMIN_PERMISSION_POINTS.checkinAdmin,
            ADMIN_PERMISSION_POINTS.activityAdmin,
          ],
          false,
        )
          ? ''
          : 'tableHiddle',
      },
    ];

    // 根据配置过滤项目
    const filteredItems = items.filter((item) => {
      const configVisible = isModuleVisible('admin', item.itemKey);
      return configVisible;
    });

    return filteredItems;
  }, [can, canAny, t, isModuleVisible]);

  const showAdminSection =
    isAdminUser && canAny(ADMIN_PERMISSION_POINT_LIST, false);

  const chatMenuItems = useMemo(() => {
    const items = [
      {
        text: t('操练场'),
        itemKey: 'playground',
        to: '/playground',
      },
      {
        text: t('聊天'),
        itemKey: 'chat',
        items: chatItems,
      },
    ];

    // 根据配置过滤项目
    const filteredItems = items.filter((item) => {
      const configVisible = isModuleVisible('chat', item.itemKey);
      return configVisible;
    });

    return filteredItems;
  }, [chatItems, t, isModuleVisible]);

  // 更新路由映射，添加聊天路由
  const updateRouterMapWithChats = (chats) => {
    const newRouterMap = { ...routerMap };

    if (Array.isArray(chats) && chats.length > 0) {
      for (let i = 0; i < chats.length; i++) {
        newRouterMap['chat' + i] = '/console/chat/' + i;
      }
    }

    setRouterMapState(newRouterMap);
    return newRouterMap;
  };

  // 加载聊天项
  useEffect(() => {
    let chats = localStorage.getItem('chats');
    if (chats) {
      try {
        chats = JSON.parse(chats);
        if (Array.isArray(chats)) {
          let chatItems = [];
          for (let i = 0; i < chats.length; i++) {
            let shouldSkip = false;
            let chat = {};
            for (let key in chats[i]) {
              let link = chats[i][key];
              if (typeof link !== 'string') continue; // 确保链接是字符串
              if (link.startsWith('fluent') || link.startsWith('ccswitch')) {
                shouldSkip = true;
                break;
              }
              chat.text = key;
              chat.itemKey = 'chat' + i;
              chat.to = '/console/chat/' + i;
            }
            if (shouldSkip || !chat.text) continue; // 避免推入空项
            chatItems.push(chat);
          }
          setChatItems(chatItems);
          updateRouterMapWithChats(chats);
        }
      } catch (e) {
        showError(t('聊天数据解析失败'));
      }
    }
  }, []);

  // 根据当前路径设置选中的菜单项
  useEffect(() => {
    const currentPath = location.pathname;
    let matchingKey = Object.keys(routerMapState).find(
      (key) => routerMapState[key] === currentPath,
    );

    // 处理聊天路由
    if (!matchingKey && currentPath.startsWith('/console/chat/')) {
      const chatIndex = currentPath.split('/').pop();
      if (!isNaN(chatIndex)) {
        matchingKey = 'chat' + chatIndex;
      } else {
        matchingKey = 'chat';
      }
    }

    // 如果找到匹配的键，更新选中的键
    if (matchingKey) {
      setSelectedKeys([matchingKey]);
    }
  }, [location.pathname, routerMapState]);

  // 监控折叠状态变化以更新 body class
  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
  }, [collapsed]);

  // 选中高亮颜色（统一）
  const SELECTED_COLOR = 'var(--semi-color-primary)';

  // 渲染自定义菜单项
  const renderNavItem = (item) => {
    // 跳过隐藏的项目
    if (item.className === 'tableHiddle') return null;

    const isSelected = selectedKeys.includes(item.itemKey);
    const textColor = isSelected ? SELECTED_COLOR : 'inherit';

    return (
      <Nav.Item
        key={item.itemKey}
        itemKey={item.itemKey}
        text={
          <span
            className='truncate font-medium text-sm'
            style={{ color: textColor }}
          >
            {item.text}
          </span>
        }
        icon={
          <div className='sidebar-icon-container flex-shrink-0'>
            {getLucideIcon(item.itemKey, isSelected)}
          </div>
        }
        className={item.className}
      />
    );
  };

  // 渲染子菜单项
  const renderSubItem = (item) => {
    if (item.items && item.items.length > 0) {
      const isSelected = selectedKeys.includes(item.itemKey);
      const textColor = isSelected ? SELECTED_COLOR : 'inherit';

      return (
        <Nav.Sub
          key={item.itemKey}
          itemKey={item.itemKey}
          text={
            <span
              className='truncate font-medium text-sm'
              style={{ color: textColor }}
            >
              {item.text}
            </span>
          }
          icon={
            <div className='sidebar-icon-container flex-shrink-0'>
              {getLucideIcon(item.itemKey, isSelected)}
            </div>
          }
        >
          {item.items.map((subItem) => {
            const isSubSelected = selectedKeys.includes(subItem.itemKey);
            const subTextColor = isSubSelected ? SELECTED_COLOR : 'inherit';

            return (
              <Nav.Item
                key={subItem.itemKey}
                itemKey={subItem.itemKey}
                text={
                  <span
                    className='truncate font-medium text-sm'
                    style={{ color: subTextColor }}
                  >
                    {subItem.text}
                  </span>
                }
              />
            );
          })}
        </Nav.Sub>
      );
    } else {
      return renderNavItem(item);
    }
  };

  return (
    <div
      className='sidebar-container'
      style={{
        width: 'var(--sidebar-current-width)',
      }}
    >
      <SkeletonWrapper
        loading={showSkeleton}
        type='sidebar'
        className=''
        collapsed={collapsed}
        showAdmin={showAdminSection}
      >
        <Nav
          className='sidebar-nav'
          defaultIsCollapsed={collapsed}
          isCollapsed={collapsed}
          onCollapseChange={toggleCollapsed}
          selectedKeys={selectedKeys}
          itemStyle='sidebar-nav-item'
          hoverStyle='sidebar-nav-item:hover'
          selectedStyle='sidebar-nav-item-selected'
          renderWrapper={({ itemElement, props }) => {
            const to =
              routerMapState[props.itemKey] || routerMap[props.itemKey];

            // 如果没有路由，直接返回元素
            if (!to) return itemElement;

            return (
              <Link
                style={{ textDecoration: 'none' }}
                to={to}
                onClick={onNavigate}
              >
                {itemElement}
              </Link>
            );
          }}
          onSelect={(key) => {
            // 如果点击的是已经展开的子菜单的父项，则收起子菜单
            if (openedKeys.includes(key.itemKey)) {
              setOpenedKeys(openedKeys.filter((k) => k !== key.itemKey));
            }

            setSelectedKeys([key.itemKey]);
          }}
          openKeys={openedKeys}
          onOpenChange={(data) => {
            setOpenedKeys(data.openKeys);
          }}
        >
          {/* 聊天区域 */}
          {hasSectionVisibleModules('chat') && (
            <div className='sidebar-section'>
              {!collapsed && (
                <div className='sidebar-group-label'>{t('聊天')}</div>
              )}
              {chatMenuItems.map((item) => renderSubItem(item))}
            </div>
          )}

          {/* 控制台区域 */}
          {hasSectionVisibleModules('console') && (
            <>
              <Divider className='sidebar-divider' />
              <div>
                {!collapsed && (
                  <div className='sidebar-group-label'>{t('控制台')}</div>
                )}
                {workspaceItems.map((item) => renderNavItem(item))}
              </div>
            </>
          )}

          {/* 个人中心区域 */}
          {hasSectionVisibleModules('personal') && (
            <>
              <Divider className='sidebar-divider' />
              <div>
                {!collapsed && (
                  <div className='sidebar-group-label'>{t('个人中心')}</div>
                )}
                {financeItems.map((item) => renderNavItem(item))}
              </div>
            </>
          )}

          {/* 公开入口区域 */}
          {hasSectionVisibleModules('public') && (
            <>
              <Divider className='sidebar-divider' />
              <div>
                {!collapsed && (
                  <div className='sidebar-group-label'>{t('公开入口')}</div>
                )}
                {publicItems.map((item) => renderNavItem(item))}
              </div>
            </>
          )}

          {/* 管理员区域 - 只在管理员时显示且配置允许时显示 */}
          {showAdminSection && hasSectionVisibleModules('admin') && (
            <>
              <Divider className='sidebar-divider' />
              <div>
                {!collapsed && (
                  <div className='sidebar-group-label'>{t('管理员')}</div>
                )}
                {adminItems.map((item) => renderNavItem(item))}
              </div>
            </>
          )}
        </Nav>
      </SkeletonWrapper>

      {/* 底部折叠按钮 */}
      <div className='sidebar-collapse-button'>
        <SkeletonWrapper
          loading={showSkeleton}
          type='button'
          width={collapsed ? 36 : 156}
          height={24}
          className='w-full'
        >
          <Button
            theme='outline'
            type='tertiary'
            size='small'
            icon={
              <ChevronLeft
                size={16}
                strokeWidth={2.5}
                color='var(--semi-color-text-2)'
                style={{
                  transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            }
            onClick={toggleCollapsed}
            icononly={collapsed}
            style={
              collapsed
                ? { width: 36, height: 24, padding: 0 }
                : { padding: '4px 12px', width: '100%' }
            }
          >
            {!collapsed ? t('收起侧边栏') : null}
          </Button>
        </SkeletonWrapper>
      </div>
    </div>
  );
};

export default SiderBar;
