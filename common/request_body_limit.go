package common

import "github.com/QuantumNous/new-api/constant"

const defaultAnonymousRequestBodyLimitKB = 512

// GetAnonymousRequestBodyLimitBytes 返回未认证关键路由的请求体上限(字节)。
// 配置为 0 表示关闭限制;负值视为无效并回退到默认值。
func GetAnonymousRequestBodyLimitBytes() int64 {
	limitKB := constant.AnonymousRequestBodyLimitKB
	if limitKB < 0 {
		limitKB = defaultAnonymousRequestBodyLimitKB
	}
	return int64(limitKB) << 10
}
