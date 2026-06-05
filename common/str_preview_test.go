package common

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// 回归测试 (#5083): LocalLogPreview 仅用于本地日志输出，超过 LocalLogContentLimit
// 时截断并附带原始长度标记；DebugEnabled 时不截断。返回给调用方的错误不经此处理。
func TestLocalLogPreview(t *testing.T) {
	oldDebug := DebugEnabled
	DebugEnabled = false
	t.Cleanup(func() { DebugEnabled = oldDebug })

	// 短内容原样返回
	require.Equal(t, "hello", LocalLogPreview("hello"))

	// 恰好等于上限不截断
	exact := strings.Repeat("a", LocalLogContentLimit)
	require.Equal(t, exact, LocalLogPreview(exact))

	// 超长内容截断，保留前 limit 字符并附标记
	long := strings.Repeat("x", LocalLogContentLimit+500)
	out := LocalLogPreview(long)
	require.True(t, strings.HasPrefix(out, strings.Repeat("x", LocalLogContentLimit)), "应保留前 limit 个字符")
	require.Contains(t, out, fmt.Sprintf("[truncated, original_length=%d, limit=%d]", len(long), LocalLogContentLimit))
	require.Less(t, len(out), len(long), "截断后应短于原文")

	// DebugEnabled 时不截断
	DebugEnabled = true
	require.Equal(t, long, LocalLogPreview(long))
}
