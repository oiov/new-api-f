import React from 'react';
import { Badge, Button } from '@douyinfe/semi-ui';
import { Mail } from 'lucide-react';

const SiteNotificationButton = ({ unreadCount, onClick, t }) => {
  const buttonElement = (
    <Button
      icon={<Mail size={18} />}
      aria-label={t('站内信')}
      title={t('站内信')}
      onClick={onClick}
      theme='borderless'
      type='tertiary'
      className='!p-1.5 !text-current focus:!bg-semi-color-fill-1 dark:focus:!bg-gray-700 !rounded-full !bg-semi-color-fill-0 dark:!bg-semi-color-fill-1 hover:!bg-semi-color-fill-1 dark:hover:!bg-semi-color-fill-2'
    />
  );

  if (unreadCount > 0) {
    return (
      <Badge count={unreadCount} type='danger' overflowCount={99}>
        {buttonElement}
      </Badge>
    );
  }

  return buttonElement;
};

export default SiteNotificationButton;
