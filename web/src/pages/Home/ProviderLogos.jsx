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
import { Typography } from '@douyinfe/semi-ui';
import {
  Moonshot,
  OpenAI,
  XAI,
  Zhipu,
  Volcengine,
  Cohere,
  Claude,
  Gemini,
  Suno,
  Minimax,
  Wenxin,
  Spark,
  Qingyan,
  DeepSeek,
  Qwen,
  Midjourney,
  Grok,
  AzureAI,
  Hunyuan,
  Xinference,
} from '@lobehub/icons';

const PROVIDER_ICONS = [
  <Moonshot size={40} />,
  <OpenAI size={40} />,
  <XAI size={40} />,
  <Zhipu.Color size={40} />,
  <Volcengine.Color size={40} />,
  <Cohere.Color size={40} />,
  <Claude.Color size={40} />,
  <Gemini.Color size={40} />,
  <Suno size={40} />,
  <Minimax.Color size={40} />,
  <Wenxin.Color size={40} />,
  <Spark.Color size={40} />,
  <Qingyan.Color size={40} />,
  <DeepSeek.Color size={40} />,
  <Qwen.Color size={40} />,
  <Midjourney size={40} />,
  <Grok size={40} />,
  <AzureAI.Color size={40} />,
  <Hunyuan.Color size={40} />,
  <Xinference.Color size={40} />,
];

const iconWrapperClassName =
  'w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center';

const ProviderLogos = () => {
  return (
    <>
      {PROVIDER_ICONS.map((icon, index) => (
        <div className={iconWrapperClassName} key={index}>
          {icon}
        </div>
      ))}
      <div className={iconWrapperClassName}>
        <Typography.Text className='!text-lg sm:!text-xl md:!text-2xl lg:!text-3xl font-bold'>
          30+
        </Typography.Text>
      </div>
    </>
  );
};

export default ProviderLogos;
