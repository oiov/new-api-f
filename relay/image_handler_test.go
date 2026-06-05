package relay

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

// 回归测试 (#5103): 旧逻辑把除 "hd" 外的所有品质都压成 "standard"，
// 会丢失 provider 新增的品质值（如 "high"）。修复后应保留非空品质原值，
// 仅在为空时回退为 "standard"。
func TestResolveImageQualityPreservesNonHDValues(t *testing.T) {
	require.Equal(t, "standard", resolveImageQuality(""), "空品质回退为 standard")
	require.Equal(t, "hd", resolveImageQuality("hd"))
	require.Equal(t, "high", resolveImageQuality("high"), "非 hd 品质必须保留原值")
	require.Equal(t, "low", resolveImageQuality("low"))

	// 镜像 ImageHelper 中的日志拼接，确保日志记录真实品质。
	require.Equal(t, "品质 high", fmt.Sprintf("品质 %s", resolveImageQuality("high")))
}
