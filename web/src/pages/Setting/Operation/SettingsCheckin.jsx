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

import React, { useEffect, useState, useRef } from 'react';
import { Button, Col, Form, Row, Spin, Typography } from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

const CHECKIN_WEEKDAY_OPTIONS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];

const CHECKIN_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const totalMinutes = index * 30;
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return {
    label: `${hours}:${minutes}`,
    value: totalMinutes * 60,
  };
});

function normalizeWeekdayValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function SettingsCheckin(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    'checkin_setting.enabled': false,
    'checkin_setting.min_quota': 1000,
    'checkin_setting.max_quota': 10000,
    'checkin_setting.leaderboard_limit': 100,
    'checkin_setting.open_weekdays': ['1', '2', '3', '4', '5'],
    'checkin_setting.open_start_seconds': 28800,
    'checkin_setting.open_end_seconds': 43200,
    'checkin_setting.daily_user_limit': 20,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  function handleFieldChange(fieldName) {
    return (value) => {
      setInputs((inputs) => ({ ...inputs, [fieldName]: value }));
    };
  }

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (Array.isArray(inputs[item.key])) {
        value = inputs[item.key].join(',');
      } else if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        value = String(inputs[item.key]);
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        if (key === 'checkin_setting.open_weekdays') {
          currentInputs[key] = normalizeWeekdayValue(props.options[key]);
        } else if (
          [
            'checkin_setting.min_quota',
            'checkin_setting.max_quota',
            'checkin_setting.leaderboard_limit',
            'checkin_setting.open_start_seconds',
            'checkin_setting.open_end_seconds',
            'checkin_setting.daily_user_limit',
          ].includes(key)
        ) {
          currentInputs[key] = Number(props.options[key] ?? inputs[key] ?? 0);
        } else {
          currentInputs[key] = props.options[key];
        }
      }
    }
    const mergedInputs = { ...inputs, ...currentInputs };
    setInputs(mergedInputs);
    setInputsRow(structuredClone(mergedInputs));
    refForm.current?.setValues(mergedInputs);
  }, [props.options]);

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('签到设置')}>
            <Typography.Text
              type='tertiary'
              style={{ marginBottom: 16, display: 'block' }}
            >
              {t('签到功能允许用户每日签到获取随机额度奖励')}
            </Typography.Text>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'checkin_setting.enabled'}
                  label={t('启用签到功能')}
                  size='default'
                  checkedText={t('开关开')}
                  uncheckedText={t('开关关')}
                  onChange={handleFieldChange('checkin_setting.enabled')}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'checkin_setting.min_quota'}
                  label={t('签到最小额度')}
                  placeholder={t('签到奖励的最小额度')}
                  onChange={handleFieldChange('checkin_setting.min_quota')}
                  min={0}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'checkin_setting.max_quota'}
                  label={t('签到最大额度')}
                  placeholder={t('签到奖励的最大额度')}
                  onChange={handleFieldChange('checkin_setting.max_quota')}
                  min={0}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'checkin_setting.leaderboard_limit'}
                  label={t('签到榜展示条数')}
                  placeholder={t('对外展示签到榜的最大人数')}
                  onChange={handleFieldChange('checkin_setting.leaderboard_limit')}
                  min={1}
                  max={1000}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
              <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                <Form.Select
                  field={'checkin_setting.open_weekdays'}
                  label={t('开放星期')}
                  placeholder={t('选择允许签到的星期')}
                  optionList={CHECKIN_WEEKDAY_OPTIONS.map((item) => ({
                    ...item,
                    label: t(item.label),
                  }))}
                  multiple
                  onChange={handleFieldChange('checkin_setting.open_weekdays')}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.Select
                  field={'checkin_setting.open_start_seconds'}
                  label={t('开放开始时间')}
                  placeholder={t('选择开始时间')}
                  optionList={CHECKIN_TIME_OPTIONS}
                  onChange={handleFieldChange('checkin_setting.open_start_seconds')}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={6}>
                <Form.Select
                  field={'checkin_setting.open_end_seconds'}
                  label={t('开放结束时间')}
                  placeholder={t('选择结束时间')}
                  optionList={CHECKIN_TIME_OPTIONS}
                  onChange={handleFieldChange('checkin_setting.open_end_seconds')}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  field={'checkin_setting.daily_user_limit'}
                  label={t('每日签到人数上限')}
                  placeholder={t('0 表示不限')}
                  extraText={t('例如设置 20 表示每天仅前 20 人可签到')}
                  onChange={handleFieldChange('checkin_setting.daily_user_limit')}
                  min={0}
                  disabled={!inputs['checkin_setting.enabled']}
                />
              </Col>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存签到设置')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
