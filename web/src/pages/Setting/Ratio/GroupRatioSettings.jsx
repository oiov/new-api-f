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
import { Button, Col, Form, Row, Select, Spin } from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  buildGroupOptions,
  renderGroupOption,
  showError,
  showSuccess,
  showWarning,
  verifyJSON,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

/** 将 JSON 字符串数组解析为数组，解析失败返回空数组 */
const parseJsonArray = (str) => {
  if (!str || str.trim() === '') return [];
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

/** 所有字段的默认值，确保 inputs/inputsRow 始终含完整 key 集合 */
const DEFAULT_INPUTS = {
  GroupRatio: '',
  UserUsableGroups: '',
  GroupGroupRatio: '',
  'group_ratio_setting.group_special_usable_group': '',
  AutoGroups: '',
  DefaultUseAutoGroup: false,
  EnableGroupBillingFilter: false,
  SubscriptionGroups: '',
  QuotaGroups: '',
};

export default function GroupRatioSettings(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({ ...DEFAULT_INPUTS });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const [groupOptions, setGroupOptions] = useState([]);

  /** 调用后端接口获取已配置的分组列表（与渠道管理页保持一致） */
  const fetchGroups = async () => {
    try {
      const res = await API.get('/api/group/');
      if (res?.data?.success) {
        setGroupOptions(buildGroupOptions(res.data.data));
      }
    } catch {
      // 静默失败，Select 仍可手动输入
    }
  };

  async function onSubmit() {
    try {
      await refForm.current
        .validate()
        .then(() => {
          const updateArray = compareObjects(inputs, inputsRow);
          if (!updateArray.length)
            return showWarning(t('你似乎并没有修改什么'));

          const requestQueue = updateArray.map((item) => {
            const value =
              typeof inputs[item.key] === 'boolean'
                ? String(inputs[item.key])
                : inputs[item.key];
            return API.put('/api/option/', { key: item.key, value });
          });

          setLoading(true);
          Promise.all(requestQueue)
            .then((res) => {
              if (res.includes(undefined)) {
                return showError(
                  requestQueue.length > 1
                    ? t('部分保存失败，请重试')
                    : t('保存失败'),
                );
              }

              for (let i = 0; i < res.length; i++) {
                if (!res[i].data.success) {
                  return showError(res[i].data.message);
                }
              }

              showSuccess(t('保存成功'));
              props.refresh();
            })
            .catch((error) => {
              console.error('Unexpected error:', error);
              showError(t('保存失败，请重试'));
            })
            .finally(() => {
              setLoading(false);
            });
        })
        .catch(() => {
          showError(t('请检查输入'));
        });
    } catch (error) {
      showError(t('请检查输入'));
      console.error(error);
    }
  }

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    // 从默认值出发，确保所有 key 始终存在
    // 即使后端未返回某字段（新增字段未初始化时），inputsRow 也含该 key
    // 这样 compareObjects 的 hasOwnProperty 检查不会漏掉新字段
    const currentInputs = { ...DEFAULT_INPUTS };
    for (let key in props.options) {
      if (key in DEFAULT_INPUTS) {
        currentInputs[key] = props.options[key];
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);
  }, [props.options]);

  return (
    <Spin spinning={loading}>
      <Form
        values={inputs}
        getFormApi={(formAPI) => (refForm.current = formAPI)}
        style={{ marginBottom: 15 }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('分组倍率')}
              placeholder={t('为一个 JSON 文本，键为分组名称，值为倍率')}
              extraText={t(
                '分组倍率设置，可以在此处新增分组或修改现有分组的倍率，格式为 JSON 字符串，例如：{"vip": 0.5, "test": 1}，表示 vip 分组的倍率为 0.5，test 分组的倍率为 1',
              )}
              field={'GroupRatio'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: t('不是合法的 JSON 字符串'),
                },
              ]}
              onChange={(value) => setInputs({ ...inputs, GroupRatio: value })}
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('用户可选分组')}
              placeholder={t('为一个 JSON 文本，键为分组名称，值为分组描述')}
              extraText={t(
                '用户新建令牌时可选的分组，格式为 JSON 字符串，例如：{"vip": "VIP 用户", "test": "测试"}，表示用户可以选择 vip 分组和 test 分组',
              )}
              field={'UserUsableGroups'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: t('不是合法的 JSON 字符串'),
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, UserUsableGroups: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('分组特殊倍率')}
              placeholder={t('为一个 JSON 文本')}
              extraText={t(
                '键为分组名称，值为另一个 JSON 对象，键为分组名称，值为该分组的用户的特殊分组倍率，例如：{"vip": {"default": 0.5, "test": 1}}，表示 vip 分组的用户在使用default分组的令牌时倍率为0.5，使用test分组时倍率为1',
              )}
              field={'GroupGroupRatio'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: t('不是合法的 JSON 字符串'),
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, GroupGroupRatio: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('分组特殊可用分组')}
              placeholder={t('为一个 JSON 文本')}
              extraText={t(
                '键为用户分组名称，值为操作映射对象。内层键以"+:"开头表示添加指定分组（键值为分组名称，值为描述），以"-:"开头表示移除指定分组（键值为分组名称），不带前缀的键直接添加该分组。例如：{"vip": {"+:premium": "高级分组", "special": "特殊分组", "-:default": "默认分组"}}，表示 vip 分组的用户可以使用 premium 和 special 分组，同时移除 default 分组的访问权限',
              )}
              field={'group_ratio_setting.group_special_usable_group'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: t('不是合法的 JSON 字符串'),
                },
              ]}
              onChange={(value) =>
                setInputs({
                  ...inputs,
                  'group_ratio_setting.group_special_usable_group': value,
                })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.Slot
              label={t('自动分组auto，从第一个开始选择')}
              extraText={t(
                '从已有分组中勾选，依次尝试排列顺序；也可直接输入分组名添加不在列表中的分组',
              )}
            >
              <Select
                multiple
                value={parseJsonArray(inputs.AutoGroups)}
                optionList={groupOptions}
                renderOptionItem={renderGroupOption}
                allowCreate
                onChange={(values) =>
                  setInputs({ ...inputs, AutoGroups: JSON.stringify(values) })
                }
                style={{ width: '100%' }}
                placeholder={t('请选择或输入分组，按顺序排列')}
                filter
                showClear
              />
            </Form.Slot>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Switch
              label={t(
                '创建令牌默认选择auto分组，初始令牌也将设为auto（否则留空，为用户默认分组）',
              )}
              field={'DefaultUseAutoGroup'}
              onChange={(value) =>
                setInputs({ ...inputs, DefaultUseAutoGroup: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Switch
              label={t('按计费类型限制可选分组')}
              extraText={t(
                '开启后，有活跃订阅的用户只能选择「订阅专属分组」，纯按量用户只能选择「按量专属分组」。不在任何一个列表中的分组对所有用户可见。两个列表均为空时此开关不生效。',
              )}
              field={'EnableGroupBillingFilter'}
              onChange={(value) =>
                setInputs({ ...inputs, EnableGroupBillingFilter: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.Slot
              label={t('订阅专属分组')}
              extraText={t(
                '仅有活跃订阅的用户可见的分组名称列表。开启「按计费类型限制可选分组」后生效。',
              )}
            >
              <Select
                multiple
                value={parseJsonArray(inputs.SubscriptionGroups)}
                optionList={groupOptions}
                renderOptionItem={renderGroupOption}
                allowCreate
                onChange={(values) =>
                  setInputs({
                    ...inputs,
                    SubscriptionGroups: JSON.stringify(values),
                  })
                }
                style={{ width: '100%' }}
                placeholder={t('请选择或输入订阅专属分组')}
                filter
                showClear
              />
            </Form.Slot>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.Slot
              label={t('按量专属分组')}
              extraText={t(
                '仅按量计费（无活跃订阅）用户可见的分组名称列表。开启「按计费类型限制可选分组」后生效。',
              )}
            >
              <Select
                multiple
                value={parseJsonArray(inputs.QuotaGroups)}
                optionList={groupOptions}
                renderOptionItem={renderGroupOption}
                allowCreate
                onChange={(values) =>
                  setInputs({ ...inputs, QuotaGroups: JSON.stringify(values) })
                }
                style={{ width: '100%' }}
                placeholder={t('请选择或输入按量专属分组')}
                filter
                showClear
              />
            </Form.Slot>
          </Col>
        </Row>
      </Form>
      <Button onClick={onSubmit}>{t('保存分组相关设置')}</Button>
    </Spin>
  );
}
