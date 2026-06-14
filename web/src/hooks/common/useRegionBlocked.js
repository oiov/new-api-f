import { useEffect, useState } from 'react';
import { detectRegionBlocked } from '../../helpers/regionBlock';

// 客户端地区检测 hook：挂载时异步拉 /cdn-cgi/trace 判定，命中则返回 true。
// fail-open：异常时返回 false（保持可访问）。无逃生口。
export function useRegionBlocked() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    detectRegionBlocked().then((result) => {
      if (active && result) setBlocked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return blocked;
}
