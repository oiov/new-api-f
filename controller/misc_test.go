package controller

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestBuildEmailVerificationContentIncludesCodeAndSafetyCopy(t *testing.T) {
	oldSystemName := common.SystemName
	defer func() {
		common.SystemName = oldSystemName
	}()
	common.SystemName = "Nbility"

	content := buildEmailVerificationContent("123456")

	for _, want := range []string{
		"Nbility",
		"123456",
		"验证码",
		fmt.Sprintf("%d 分钟内有效", common.VerificationValidMinutes),
		"如果不是你本人操作",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected verification template to contain %q, got %s", want, content)
		}
	}
}

func TestBuildPasswordResetContentIncludesLinkAndSafetyCopy(t *testing.T) {
	oldSystemName := common.SystemName
	defer func() {
		common.SystemName = oldSystemName
	}()
	common.SystemName = "Nbility"

	link := "https://example.com/user/reset?email=user@example.com&token=abc"
	content := buildPasswordResetContent(link)

	for _, want := range []string{
		"Nbility",
		"重置密码",
		link,
		fmt.Sprintf("%d 分钟内有效", common.VerificationValidMinutes),
		"如果不是你本人操作",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected password reset template to contain %q, got %s", want, content)
		}
	}
}
